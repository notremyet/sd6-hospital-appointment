// Run the scheduled jobs right now (for testing, no need to wait until 09:00)
// npm run jobs
const line = require('@line/bot-sdk');
const pool = require('../db');
const { sendDueReminders, createFollowUps } = require('../jobs');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

async function main() {
  await sendDueReminders(client);
  await createFollowUps(client);
}

main()
  .catch((err) => {
    console.error('❌', err.body || err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
