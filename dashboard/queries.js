// ---------- All Dashboard SQL ----------
const pool = require('../db');

const PAGE_SIZE = 10;

// SD1: summary numbers on the Home page (upcoming appointments only)
async function getStats() {
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(confirmation_status = 'Confirmed'), 0) AS confirmed,
            COALESCE(SUM(confirmation_status = 'Pending'), 0)   AS pending,
            COALESCE(SUM(confirmation_status = 'Declined'), 0)  AS declined
     FROM appointments
     WHERE appointment_date >= CURDATE()`
  );
  const [[{ followUps }]] = await pool.query(
    `SELECT COUNT(*) AS followUps ${FOLLOW_UP_FROM}`
  );
  return { ...stats, followUps };
}

// SD2, SD3: appointment list + search + filters + pagination
async function listAppointments({ q = '', date = 'upcoming', status = 'all', page = 1 }) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(p.patient_name LIKE ? OR p.hn LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const dateFilters = {
    upcoming: 'a.appointment_date >= CURDATE()',
    today: 'a.appointment_date = CURDATE()',
    tomorrow: 'a.appointment_date = CURDATE() + INTERVAL 1 DAY',
    week: 'a.appointment_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY',
    past: 'a.appointment_date < CURDATE()',
  };
  if (dateFilters[date]) where.push(dateFilters[date]);

  if (['Pending', 'Confirmed', 'Declined'].includes(status)) {
    where.push('a.confirmation_status = ?');
    params.push(status);
  } else if (status === 'overdue') {
    // SD3: no response and past the deadline
    where.push("a.confirmation_status = 'Pending' AND a.response_deadline < NOW()");
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM appointments a JOIN patients p ON p.patient_id = a.patient_id ${whereSql}`;

  const [[{ count }]] = await pool.query(`SELECT COUNT(*) AS count ${from}`, params);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);

  const [rows] = await pool.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            a.confirmation_status, a.response_deadline, a.reschedule_count,
            p.hn, p.patient_name
     ${from}
     ORDER BY a.appointment_date, a.appointment_time
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (current - 1) * PAGE_SIZE]
  );

  return { rows, count, page: current, totalPages, pageSize: PAGE_SIZE };
}

// NF2, NF4: Follow-up List = still Pending + case not closed + appointment not past
// Patients who answer on LINE, or whose status a nurse updates, drop off the list automatically
const FOLLOW_UP_FROM = `
  FROM follow_ups f
  JOIN appointments a ON a.appointment_id = f.appointment_id
  JOIN patients p     ON p.patient_id = a.patient_id
  WHERE a.confirmation_status = 'Pending'
    AND f.follow_up_status IN ('Open', 'Unreachable')
    AND a.appointment_date >= CURDATE()`;

async function listFollowUps({ q = '' }) {
  let sql = `SELECT f.follow_up_id, f.follow_up_status, f.follow_up_time,
                    a.appointment_id, a.appointment_date, a.appointment_time,
                    p.hn, p.patient_name, p.phone, p.line_user_id IS NULL AS no_line,
                    DATEDIFF(a.appointment_date, CURDATE()) AS days_left
             ${FOLLOW_UP_FROM}`;
  const params = [];
  if (q) {
    sql += ' AND (p.patient_name LIKE ? OR p.hn LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY a.appointment_date, a.appointment_time';
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Appointment Status page (Figures 8, 9)
async function getAppointmentDetail(appointmentId) {
  const [[appt]] = await pool.query(
    `SELECT a.*, p.hn, p.patient_name, p.phone, p.line_user_id IS NOT NULL AS has_line,
            d.doctor_name, dep.department_name
     FROM appointments a
     JOIN patients p      ON p.patient_id = a.patient_id
     JOIN doctors d       ON d.doctor_id = a.doctor_id
     JOIN departments dep ON dep.department_id = a.department_id
     WHERE a.appointment_id = ?`,
    [appointmentId]
  );
  if (!appt) return null;

  // Latest PDPA consent of the linked LINE account
  const [[consent]] = await pool.query(
    `SELECT c.version, c.created_at FROM pdpa_consents c
     JOIN patients p ON p.line_user_id = c.line_user_id
     JOIN appointments a ON a.patient_id = p.patient_id
     WHERE a.appointment_id = ? AND c.status = 'accepted'
     ORDER BY c.consent_id DESC LIMIT 1`,
    [appointmentId]
  );

  const [responses] = await pool.query(
    `SELECT response_type, decline_reason, source, response_time
     FROM appointment_responses WHERE appointment_id = ?
     ORDER BY response_time DESC, response_id DESC`,
    [appointmentId]
  );
  const [reschedules] = await pool.query(
    `SELECT old_date, old_time, new_date, new_time, source, changed_at
     FROM appointment_reschedules WHERE appointment_id = ?
     ORDER BY changed_at DESC, reschedule_id DESC`,
    [appointmentId]
  );
  const [[followUp]] = await pool.query(
    `SELECT * FROM follow_ups WHERE appointment_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [appointmentId]
  );
  return { appt, responses, reschedules, consent: consent || null, followUp: followUp || null };
}

// SD4, NF3: a nurse / staff member updates the status after calling the patient
async function updateStatusByStaff(appointmentId, { status, followUpResult, note }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[current]] = await conn.query(
      'SELECT confirmation_status FROM appointments WHERE appointment_id = ? FOR UPDATE',
      [appointmentId]
    );
    if (!current) throw new Error('Appointment not found');

    // 1) Change the appointment status + record that staff made the change
    if (status !== current.confirmation_status) {
      await conn.query(
        'UPDATE appointments SET confirmation_status = ? WHERE appointment_id = ?',
        [status, appointmentId]
      );
      if (status !== 'Pending') {
        await conn.query(
          `INSERT INTO appointment_responses (appointment_id, response_type, source)
           VALUES (?, ?, 'Staff')`,
          [appointmentId, status]
        );
      }
    }

    // 2) Record the follow-up call result (if this appointment is on the Follow-up List)
    //    Got an answer -> Contacted (case closed) / not reached yet -> as chosen by the nurse
    const resultStatus = status === 'Pending' ? followUpResult : 'Contacted';
    await conn.query(
      `UPDATE follow_ups
       SET follow_up_status = ?, follow_up_time = NOW(),
           follow_up_outcome = COALESCE(NULLIF(?, ''), follow_up_outcome)
       WHERE appointment_id = ? AND follow_up_status IN ('Open', 'Unreachable')`,
      [resultStatus, note || '', appointmentId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findStaffByUsername(username) {
  const [[user]] = await pool.query(
    'SELECT staff_id, username, password_hash, full_name, role FROM staff_users WHERE username = ?',
    [username]
  );
  return user || null;
}

module.exports = {
  getStats,
  listAppointments,
  listFollowUps,
  getAppointmentDetail,
  updateStatusByStaff,
  findStaffByUsername,
};
