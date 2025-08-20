// Test script to simulate Clerk webhook
// Run with: node test-webhook.js

const crypto = require('crypto');

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET || 'your-webhook-secret';
const webhookUrl = 'http://localhost:3000/api/webhooks/clerk';

const testPayload = {
  type: 'user.created',
  data: {
    id: 'user_test123',
    email_addresses: [
      {
        id: 'email_test123',
        email_address: 'test@example.com'
      }
    ],
    first_name: 'Test',
    last_name: 'User',
    image_url: 'https://example.com/avatar.jpg',
    created_at: Date.now(),
    updated_at: Date.now()
  }
};

const body = JSON.stringify(testPayload);
const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${body}`)
  .digest('base64');

fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'svix-id': 'msg_test123',
    'svix-timestamp': timestamp.toString(),
    'svix-signature': `v1,${signature}`
  },
  body
})
.then(response => response.text())
.then(data => console.log('Webhook response:', data))
.catch(error => console.error('Error:', error));