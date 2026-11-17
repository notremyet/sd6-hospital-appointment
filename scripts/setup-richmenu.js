// Create the Rich Menu (menu at the bottom of the chat). Run once, or again after changing the image / buttons
// npm run richmenu
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');

const token = process.env.CHANNEL_ACCESS_TOKEN;
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: token });
const blobClient = new line.messagingApi.MessagingApiBlobClient({ channelAccessToken: token });
const HOSPITAL_PHONE = process.env.HOSPITAL_PHONE || '021234567';

// Image is 2500 x 843, split into 3 equal columns
const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,              // menu is open when the chat is opened
  name: 'main-menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: 'My Appointments', text: 'My Appointments' },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: 'Help', text: 'Help' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'uri', label: 'Contact Hospital', uri: `tel:${HOSPITAL_PHONE}` },
    },
  ],
};

async function main() {
  // 1) Delete old menus (safe to re-run)
  const { richmenus } = await client.getRichMenuList();
  for (const m of richmenus) {
    await client.deleteRichMenu(m.richMenuId);
    console.log('Deleted old menu', m.richMenuId);
  }

  // 2) Create the menu
  const { richMenuId } = await client.createRichMenu(richMenu);
  console.log('Created menu', richMenuId);

  // 3) Upload the image
  const image = fs.readFileSync(path.join(__dirname, '..', 'assets', 'richmenu.png'));
  await blobClient.setRichMenuImage(richMenuId, new Blob([image], { type: 'image/png' }));
  console.log('Image uploaded');

  // 4) Make it the default menu for everyone
  await client.setDefaultRichMenu(richMenuId);
  console.log('✅ Set as the default rich menu');
}

main().catch((err) => {
  console.error('❌', err.body || err.message);
  process.exitCode = 1;
});
