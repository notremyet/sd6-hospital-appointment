const path = require('path');
const express = require('express');
const line = require('@line/bot-sdk');
const { handleEvent } = require('./handlers');
const { startScheduler } = require('./jobs');
const dashboard = require('./dashboard/routes');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check
app.get('/health', (req, res) => res.send('Bot is running'));

// LINE sends events here (must come before the dashboard: the LINE middleware needs the raw body)
app.post(
  '/webhook',
  line.middleware({ channelSecret: process.env.CHANNEL_SECRET }),
  async (req, res) => {
    try {
      await Promise.all(req.body.events.map((event) => handleEvent(event, client)));
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  }
);

// Nurse / staff dashboard
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(dashboard);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  console.log(`Dashboard: http://localhost:${port}`);
  startScheduler(client);
});
