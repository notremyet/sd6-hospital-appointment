const cron = require('node-cron');
const pool = require('./db');
const { sendReminder, getAppointment } = require('./reminders');
const { confirmationRequiredMessage } = require('./messages');
const { hasConsent } = require('./pdpa');

// How many days ahead to send reminders (configurable in .env)
const REMIND_DAYS_BEFORE = Number(process.env.REMIND_DAYS_BEFORE || 3);

// ---------- Job 1: send reminder cards (CB1) ----------
// Appointments that are Pending, not yet notified, linked to LINE, and 1..N days away
async function sendDueReminders(client) {
  const [rows] = await pool.query(
    `SELECT a.appointment_id
     FROM appointments a
     JOIN patients p ON p.patient_id = a.patient_id
     WHERE a.confirmation_status = 'Pending'
       AND a.notification_sent_at IS NULL
       AND p.line_user_id IS NOT NULL
       AND a.appointment_date BETWEEN CURDATE() + INTERVAL 1 DAY
                                  AND CURDATE() + INTERVAL ? DAY
     ORDER BY a.appointment_date, a.appointment_time`,
    [REMIND_DAYS_BEFORE]
  );

  let sent = 0;
  for (const { appointment_id: id } of rows) {
    try {
      await sendReminder(client, id);
      sent++;
    } catch (err) {
      // One failure must not stop the rest
      console.error(`[reminder] appointment id=${id} failed:`, err.body || err.message);
    }
  }
  console.log(`[reminder] sent ${sent}/${rows.length} reminder(s)`);
  return sent;
}

// ---------- Job 2: move non-responders to the Follow-up List (AM4, NF1) ----------
// Case A) reminder was sent, response_deadline has passed, still Pending
// Case B) patient has no LINE link and the appointment is near (cannot be messaged, a nurse must call)
async function createFollowUps(client) {
  const [rows] = await pool.query(
    `SELECT a.appointment_id, p.line_user_id
     FROM appointments a
     JOIN patients p ON p.patient_id = a.patient_id
     WHERE a.confirmation_status = 'Pending'
       AND a.appointment_date >= CURDATE()
       AND (
         a.response_deadline < NOW()
         OR (p.line_user_id IS NULL
             AND a.appointment_date <= CURDATE() + INTERVAL ? DAY)
       )
       AND NOT EXISTS (
         SELECT 1 FROM follow_ups f WHERE f.appointment_id = a.appointment_id
       )`,
    [REMIND_DAYS_BEFORE]
  );

  for (const row of rows) {
    await pool.query('INSERT INTO follow_ups (appointment_id) VALUES (?)', [row.appointment_id]);

    // Also notify the patient on LINE (Figure 16) if linked and consented
    if (row.line_user_id && (await hasConsent(row.line_user_id))) {
      try {
        const appt = await getAppointment(row.appointment_id);
        await client.pushMessage({
          to: row.line_user_id,
          messages: [confirmationRequiredMessage(appt)],
        });
      } catch (err) {
        console.error(`[follow-up] notifying appointment id=${row.appointment_id} failed:`, err.body || err.message);
      }
    }
  }
  console.log(`[follow-up] added ${rows.length} appointment(s) to the Follow-up List`);
  return rows.length;
}

// ---------- Schedule ----------
function startScheduler(client) {
  const options = { timezone: 'Asia/Bangkok' };

  // Every day at 09:00: send reminder cards
  cron.schedule('0 9 * * *', () => sendDueReminders(client).catch(console.error), options);

  // Every hour from 08:00 to 20:00: check overdue responses (no messages late at night)
  cron.schedule('0 8-20 * * *', () => createFollowUps(client).catch(console.error), options);

  console.log('⏰ Scheduler started (reminder 09:00, follow-up check hourly 08–20)');
}

module.exports = { sendDueReminders, createFollowUps, startScheduler };
