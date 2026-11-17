const pool = require('./db');
const { reminderMessage } = require('./messages');
const { hasConsent } = require('./pdpa');

// How many hours a patient has to respond (configurable in .env)
const RESPONSE_HOURS = Number(process.env.RESPONSE_HOURS || 24);

// Load one appointment with patient / doctor / department names
async function getAppointment(appointmentId) {
  const [rows] = await pool.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            a.confirmation_status, a.notification_sent_at,
            a.doctor_id, a.reschedule_count,
            p.patient_name, p.line_user_id,
            d.doctor_name, dep.department_name
     FROM appointments a
     JOIN patients p      ON p.patient_id = a.patient_id
     JOIN doctors d       ON d.doctor_id = a.doctor_id
     JOIN departments dep ON dep.department_id = a.department_id
     WHERE a.appointment_id = ?`,
    [appointmentId]
  );
  return rows[0] || null;
}

// Upcoming appointments for this LINE user (max 10 = carousel limit used here)
async function getUpcomingAppointments(lineUserId) {
  const [rows] = await pool.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            a.confirmation_status, p.patient_name,
            d.doctor_name, dep.department_name
     FROM appointments a
     JOIN patients p      ON p.patient_id = a.patient_id
     JOIN doctors d       ON d.doctor_id = a.doctor_id
     JOIN departments dep ON dep.department_id = a.department_id
     WHERE p.line_user_id = ?
       AND TIMESTAMP(a.appointment_date, a.appointment_time) >= NOW()
     ORDER BY a.appointment_date, a.appointment_time
     LIMIT 10`,
    [lineUserId]
  );
  return rows;
}

// Send the reminder card, then record when it was sent + the response deadline
async function sendReminder(client, appointmentId) {
  const appt = await getAppointment(appointmentId);
  if (!appt) throw new Error(`Appointment id=${appointmentId} not found`);
  if (!appt.line_user_id) throw new Error(`The patient of appointment id=${appointmentId} has not registered on LINE`);
  if (appt.confirmation_status !== 'Pending') {
    throw new Error(`Appointment id=${appointmentId} already answered (${appt.confirmation_status}); not sending again`);
  }
  if (!(await hasConsent(appt.line_user_id))) {
    throw new Error(`The patient of appointment id=${appointmentId} has not consented to the current PDPA notice`);
  }

  await client.pushMessage({
    to: appt.line_user_id,
    messages: [reminderMessage(appt)],
  });

  // Deadline = now + RESPONSE_HOURS, but never later than the appointment itself
  await pool.query(
    `UPDATE appointments
     SET notification_sent_at = NOW(),
         response_deadline = LEAST(NOW() + INTERVAL ? HOUR,
                                   TIMESTAMP(appointment_date, appointment_time))
     WHERE appointment_id = ?`,
    [RESPONSE_HOURS, appointmentId]
  );

  return appt;
}

module.exports = { getAppointment, getUpcomingAppointments, sendReminder };
