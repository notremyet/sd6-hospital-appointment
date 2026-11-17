// ---------- Patient self-service rescheduling through LINE ----------
const pool = require('./db');

// Rules (configurable in .env)
const RULES = {
  minHoursBefore: Number(process.env.RESCHEDULE_MIN_HOURS || 24), // minimum notice in hours
  maxTimes: Number(process.env.RESCHEDULE_MAX || 2),              // max reschedules per appointment
  daysAhead: Number(process.env.RESCHEDULE_DAYS_AHEAD || 14),     // how far ahead a new date can be
};

// Can this appointment be rescheduled through LINE? Returns an error message, or null if allowed
function checkRescheduleRules(appt) {
  const apptTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
  const hoursLeft = (apptTime - Date.now()) / 36e5;
  if (hoursLeft < RULES.minHoursBefore) {
    return `Appointments can be rescheduled on LINE at least ${RULES.minHoursBefore} hours in advance.\n` +
           'Please call the hospital.';
  }
  if (appt.reschedule_count >= RULES.maxTimes) {
    return `This appointment has already been rescheduled ${RULES.maxTimes} times on LINE.\nPlease call the hospital.`;
  }
  return null;
}

// Free slots for this doctor (excluding the patient's own current time)
// remaining = capacity - appointments in that slot that are not Declined
// The new time must also be at least minHoursBefore away, otherwise it could not be changed again
const SLOT_SQL = `
  SELECT s.slot_id, s.slot_date, s.slot_time,
         s.capacity - COUNT(a.appointment_id) AS remaining
  FROM appointment_slots s
  LEFT JOIN appointments a
    ON a.doctor_id = s.doctor_id
   AND a.appointment_date = s.slot_date
   AND a.appointment_time = s.slot_time
   AND a.confirmation_status <> 'Declined'
  WHERE s.doctor_id = ?
    AND TIMESTAMP(s.slot_date, s.slot_time) >= NOW() + INTERVAL ? HOUR
    AND s.slot_date <= CURDATE() + INTERVAL ? DAY
    AND NOT (s.slot_date = ? AND s.slot_time = ?)`;

// Dates with at least one free slot (max 13 = Quick Reply button limit)
async function getAvailableDates(appt) {
  const [rows] = await pool.query(
    `SELECT slot_date, SUM(remaining) AS remaining
     FROM (${SLOT_SQL} GROUP BY s.slot_id HAVING remaining > 0) AS free
     GROUP BY slot_date
     ORDER BY slot_date
     LIMIT 13`,
    [appt.doctor_id, RULES.minHoursBefore, RULES.daysAhead, appt.appointment_date, appt.appointment_time]
  );
  return rows;
}

// Free time slots on the chosen date
async function getAvailableTimes(appt, date) {
  const [rows] = await pool.query(
    `${SLOT_SQL} AND s.slot_date = ?
     GROUP BY s.slot_id
     HAVING remaining > 0
     ORDER BY s.slot_time
     LIMIT 13`,
    [appt.doctor_id, RULES.minHoursBefore, RULES.daysAhead,
     appt.appointment_date, appt.appointment_time, date]
  );
  return rows;
}

async function getSlot(slotId) {
  const [[slot]] = await pool.query('SELECT * FROM appointment_slots WHERE slot_id = ?', [slotId]);
  return slot || null;
}

// Move the appointment to a new slot, in a transaction with a row lock so two people cannot take the last place
// Returns { ok: true, oldDate, oldTime } or { error: 'message' }
async function rescheduleAppointment(appointmentId, lineUserId, slotId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[appt]] = await conn.query(
      `SELECT a.*, p.line_user_id
       FROM appointments a JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.appointment_id = ? FOR UPDATE`,
      [appointmentId]
    );
    if (!appt || appt.line_user_id !== lineUserId) {
      await conn.rollback();
      return { error: 'This appointment was not found in your account.' };
    }
    const ruleError = checkRescheduleRules(appt);
    if (ruleError) {
      await conn.rollback();
      return { error: ruleError };
    }

    const [[slot]] = await conn.query(
      `SELECT * FROM appointment_slots
       WHERE slot_id = ? AND doctor_id = ?
         AND TIMESTAMP(slot_date, slot_time) >= NOW() + INTERVAL ? HOUR
         AND slot_date <= CURDATE() + INTERVAL ? DAY
       FOR UPDATE`,
      [slotId, appt.doctor_id, RULES.minHoursBefore, RULES.daysAhead]
    );
    if (!slot) {
      await conn.rollback();
      return { error: 'That time slot is no longer available. Please choose again.' };
    }
    // An old confirmation card was tapped again after already moving to this time
    if (slot.slot_date === appt.appointment_date && slot.slot_time === appt.appointment_time) {
      await conn.rollback();
      return { error: 'Your appointment is already at this time.' };
    }

    const [[{ booked }]] = await conn.query(
      `SELECT COUNT(*) AS booked FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
         AND confirmation_status <> 'Declined' AND appointment_id <> ?`,
      [slot.doctor_id, slot.slot_date, slot.slot_time, appointmentId]
    );
    if (booked >= slot.capacity) {
      await conn.rollback();
      return { error: 'Sorry, that time slot has just been filled. Please choose another time.' };
    }

    // Move the appointment + treat the new time as confirmed
    await conn.query(
      `UPDATE appointments
       SET appointment_date = ?, appointment_time = ?,
           confirmation_status = 'Confirmed',
           reschedule_count = reschedule_count + 1,
           response_deadline = NULL
       WHERE appointment_id = ?`,
      [slot.slot_date, slot.slot_time, appointmentId]
    );
    await conn.query(
      `INSERT INTO appointment_reschedules
         (appointment_id, old_date, old_time, new_date, new_time, source)
       VALUES (?, ?, ?, ?, ?, 'LINE')`,
      [appointmentId, appt.appointment_date, appt.appointment_time, slot.slot_date, slot.slot_time]
    );
    await conn.query(
      `INSERT INTO appointment_responses (appointment_id, response_type, source)
       VALUES (?, 'Confirmed', 'LINE')`,
      [appointmentId]
    );

    await conn.commit();
    return { ok: true, oldDate: appt.appointment_date, oldTime: appt.appointment_time };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  RULES,
  checkRescheduleRules,
  getAvailableDates,
  getAvailableTimes,
  getSlot,
  rescheduleAppointment,
};
