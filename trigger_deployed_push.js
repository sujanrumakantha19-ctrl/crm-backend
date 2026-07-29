const https = require('https');

async function loginAndTriggerDeployed() {
  const backendUrl = 'https://re-backend-0y6f.onrender.com/api/v1';

  console.log('Logging into deployed backend...');
  const loginData = JSON.stringify({
    email: 'admin@gmail.com',
    password: '12345678'
  });

  const req = https.request(`${backendUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.token) {
          console.log('Logged in successfully! Token acquired.');
          createNotificationOnDeployed(json.token);
        } else {
          console.log('Login failed response:', json);
        }
      } catch (e) {
        console.error('Failed to parse response:', body);
      }
    });
  });

  req.on('error', (e) => console.error('Login request error:', e.message));
  req.write(loginData);
  req.end();
}

function createNotificationOnDeployed(token) {
  const backendUrl = 'https://re-backend-0y6f.onrender.com/api/v1';
  const notifData = JSON.stringify({
    type: 'booking',
    message: '🚀 PUSH TEST: Plot #105 booking request update received!',
    entityType: 'Plot',
    entityId: 'plot_105'
  });

  console.log('Sending live push notification to mobile device...');
  const req = https.request(`${backendUrl}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(notifData)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Notification Response Status:', res.statusCode);
      console.log('Notification Response:', body);
    });
  });

  req.on('error', (e) => console.error('Notification request error:', e.message));
  req.write(notifData);
  req.end();
}

loginAndTriggerDeployed();
