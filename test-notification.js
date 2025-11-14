// Test OneSignal notification
// Run: node test-notification.js

const appId = '605749d7-a29f-43a9-80d2-c789376b5476';
const restApiKey = 'os_v2_app_mblutv5ct5b2tagsy6eto22uozsry6lhwmiuxs4gkvgkvgnqlkdcn56ehcraaju2uxooswnx7gj73xanviedxy34i5qcpaea6vbrpba';

async function testNotification() {
  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${restApiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_external_user_ids: ['Viktor'], // Change to your username
      headings: { en: 'Test notifikace' },
      contents: { en: 'Testovací zpráva z Node.js' },
      url: 'https://firemni-ukoly.vercel.app/',
    }),
  });

  const result = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(result, null, 2));
}

testNotification().catch(console.error);
