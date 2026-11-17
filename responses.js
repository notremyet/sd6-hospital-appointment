const pool = require('./db');
const { getAppointment } = require('./reminders');

// Decline reasons (Figure 14). Quick Reply labels are limited to 20 characters
const DECLINE_REASONS = {
  busy: 'Schedule conflict',
  sick: 'Feeling unwell',
  travel: 'Transport problem',
  no_need: 'No longer needed',
  other: 'Other',
};

const STATUS_TH = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  Declined: 'Declined',
};

// Load the appointment + check it belongs to this LINE user and is still in the future
// Returns { appt } on success or { error: 'message' } otherwise
async function loadOwnAppointment(appointmentId, lineUserId) {
  const appt = await getAppointment(appointmentId);
  if (!appt || appt.line_user_id !== lineUserId) {
    return { error: 'This appointment was not found in your account.' };
  }
  const apptTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
  if (apptTime < new Date()) {
    return { error: 'This appointment has already passed.' };
  }
  return { appt };
}

// Change the status (normally from Pending) -> Confirmed/Declined and record the response (in a transaction)
// fromStatus = 'Confirmed' is used when a patient cancels an appointment they had confirmed
// Returns true if changed, false if the status did not match (e.g. button tapped twice)
async function recordResponse(appointmentId, status, fromStatus = 'Pending') {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `UPDATE appointments SET confirmation_status = ?
       WHERE appointment_id = ? AND confirmation_status = ?`,
      [status, appointmentId, fromStatus]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return false;
    }
    await conn.query(
      'INSERT INTO appointment_responses (appointment_id, response_type) VALUES (?, ?)',
      [appointmentId, status]
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Save the reason on the latest Declined response of this appointment (that has no reason yet)
async function saveDeclineReason(appointmentId, reasonText) {
  const [result] = await pool.query(
    `UPDATE appointment_responses SET decline_reason = ?
     WHERE appointment_id = ? AND response_type = 'Declined' AND decline_reason IS NULL
     ORDER BY response_time DESC
     LIMIT 1`,
    [reasonText, appointmentId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  DECLINE_REASONS,
  STATUS_TH,
  loadOwnAppointment,
  recordResponse,
  saveDeclineReason,
};
