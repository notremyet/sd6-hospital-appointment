// ---------- PDPA: consent to use personal data ----------
const pool = require('./db');

// Bump the version when the notice text changes -> everyone is asked to consent again
const CONSENT_VERSION = '1.0';
const HOSPITAL_NAME = process.env.HOSPITAL_NAME || 'SIIT Hospital';
const HOSPITAL_PHONE = process.env.HOSPITAL_PHONE || '021234567';

// Short summary shown on the consent card
const SUMMARY = [
  'We collect: HN, name, phone number, LINE ID, appointment details and your responses',
  'Used for: reminding, confirming, rescheduling or cancelling appointments',
  'Access: authorised hospital staff only',
  'You can withdraw at any time by typing "withdraw consent"',
];

// Full notice (sample text for this project; real use needs review by the hospital's legal team / DPO)
const FULL_NOTICE =
`Privacy Notice (version ${CONSENT_VERSION})
Outpatient Appointment Reminder Service, ${HOSPITAL_NAME}

1) Data we collect
• Hospital number (HN), full name and phone number
• LINE user ID (not your LINE phone number or password)
• Appointment details: date, time, doctor, department
• Your responses: confirmation, decline, reason, rescheduling and response time

2) Purpose
• To send appointment reminders through LINE
• To receive your confirmation, rescheduling or cancellation
• To let nurses follow up when no response is received
Your data is not used for advertising and is not shared with third parties.

3) Who can access your data
Only nurses and staff with a system account. Messages are delivered through the LINE Messaging API.

4) Retention
Your LINE user ID is kept until you withdraw consent. Appointment data is kept for the period the hospital requires for medical records.

5) Your rights
You may request access to, correction of or deletion of your data, and you may withdraw consent at any time by typing "withdraw consent" in this chat or calling ${HOSPITAL_PHONE}.
After withdrawal, we will stop sending LINE messages and staff will contact you about appointments by phone as usual. Your right to treatment is not affected.`;

// Has this user consented to the current version? (latest record for this version)
async function hasConsent(lineUserId) {
  const [[row]] = await pool.query(
    `SELECT status FROM pdpa_consents
     WHERE line_user_id = ? AND version = ?
     ORDER BY consent_id DESC LIMIT 1`,
    [lineUserId, CONSENT_VERSION]
  );
  return row?.status === 'accepted';
}

async function recordConsent(lineUserId) {
  await pool.query(
    "INSERT INTO pdpa_consents (line_user_id, version, status) VALUES (?, ?, 'accepted')",
    [lineUserId, CONSENT_VERSION]
  );
}

// Withdraw consent: unlink LINE from the patient + record it (in one transaction)
async function withdrawConsent(lineUserId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE patients SET line_user_id = NULL WHERE line_user_id = ?', [lineUserId]);
    await conn.query(
      "INSERT INTO pdpa_consents (line_user_id, version, status) VALUES (?, ?, 'withdrawn')",
      [lineUserId, CONSENT_VERSION]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  CONSENT_VERSION,
  SUMMARY,
  FULL_NOTICE,
  hasConsent,
  recordConsent,
  withdrawConsent,
};
