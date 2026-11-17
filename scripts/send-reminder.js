// For testing: node --env-file=.env scripts/send-reminder.js <appointment_id>
const line = require('@line/bot-sdk');
const pool = require('../db');
const { sendReminder } = require('../reminders');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

async function main() {
  const appointmentId = Number(process.argv[2]);
  if (!appointmentId) {
    console.log('Usage: npm run remind -- <appointment_id>');
    process.exit(1);
  }
  const appt = await sendReminder(client, appointmentId);
  console.log(`✅ Reminder for appointment id=${appointmentId} sent to ${appt.patient_name}`);
}

main()
  .catch((err) => {
    console.error('❌', err.body || err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
