// WhatsApp Bot using whatsapp-web.js on a VPS/VM with Express for API endpoints
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const bodyParser = require('body-parser');
require('dotenv').config();

// Create Express app
const app = express();
app.use(bodyParser.json());

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.API_TOKEN}`) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Keep track of the QR code and client status
let qrCode = null;
let clientStatus = 'initializing';

// Initialize whatsapp-web client
client.on('qr', (qr) => {
  console.log('QR RECEIVED', qr);
  qrCode = qr;
  qrcode.generate(qr, { small: true });
  clientStatus = 'qr_ready';
});

client.on('ready', () => {
  console.log('Client is ready!');
  clientStatus = 'ready';
  qrCode = null;
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
  clientStatus = 'authenticated';
});

client.on('auth_failure', (msg) => {
  console.error('AUTHENTICATION FAILURE', msg);
  clientStatus = 'auth_failure';
});

client.on('disconnected', (reason) => {
  console.log('Client was disconnected', reason);
  clientStatus = 'disconnected';
  // Attempt to reconnect
  client.initialize();
});

// Bot message processing
client.on('message', async (message) => {
  console.log(`Message received: ${message.body}`);
  
  // Simple bot logic
  const messageText = message.body.toLowerCase();
  
  if (messageText === 'hello' || messageText === 'hi') {
    await message.reply('👋 Hello! How can I assist you today?');
  } else if (messageText === 'help') {
    await message.reply('Available commands:\n- hello: Greet the bot\n- help: Show this help message\n- time: Get current time');
  } else if (messageText === 'time') {
    const now = new Date();
    await message.reply(`The current time is: ${now.toLocaleTimeString()}`);
  } else {
    // Check for custom responses in a database or file
    // This is where you would add more sophisticated response logic
    await message.reply("I didn't understand that. Type 'help' for available commands.");
  }
});

// Initialize the client
client.initialize();

// API Endpoints
app.get('/status', authMiddleware, (req, res) => {
  res.json({ status: clientStatus });
});

app.get('/qr', authMiddleware, (req, res) => {
  if (qrCode) {
    res.json({ qrCode });
  } else {
    res.status(404).json({ error: 'QR code not available' });
  }
});

app.post('/send', authMiddleware, async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }
    
    if (clientStatus !== 'ready') {
      return res.status(503).json({ 
        error: 'WhatsApp client not ready', 
        status: clientStatus 
      });
    }
    
    // Ensure phone number is in the correct format
    let formattedPhone = phone;
    if (!formattedPhone.endsWith('@c.us')) {
      formattedPhone = `${formattedPhone}@c.us`;
    }
    
    // Send the message
    await client.sendMessage(formattedPhone, message);
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Simple admin interface
app.get('/admin', authMiddleware, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>WhatsApp Bot Admin</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .container { margin-top: 20px; }
          #qrImage { margin-top: 20px; }
          button { padding: 8px 16px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          input, textarea { padding: 8px; margin: 5px 0; width: 100%; }
        </style>
      </head>
      <body>
        <h1>WhatsApp Bot Admin</h1>
        <div class="container">
          <h2>Status: <span id="status">Checking...</h2></span>
          <button onclick="checkStatus()">Refresh Status</button>
          <div id="qrContainer">
            <h2>QR Code</h2>
            <div id="qrImage"></div>
            <button onclick="getQR()">Get QR Code</button>
          </div>
          
          <div style="margin-top: 40px;">
            <h2>Send Message</h2>
            <div>
              <label for="phone">Phone Number (with country code):</label>
              <input type="text" id="phone" placeholder="e.g., 12025550165">
            </div>
            <div>
              <label for="messageText">Message:</label>
              <textarea id="messageText" rows="4" placeholder="Enter your message"></textarea>
            </div>
            <button onclick="sendMessage()">Send Message</button>
            <div id="sendResult" style="margin-top: 10px;"></div>
          </div>
        </div>

        <script>
          // Token should be securely stored in a production app
          const API_TOKEN = 'your-secret-token';
          
          async function checkStatus() {
            try {
              const response = await fetch('/status', {
                headers: { 'Authorization': 'Bearer ' + API_TOKEN }
              });
              const data = await response.json();
              document.getElementById('status').textContent = data.status;
              
              if (data.status === 'qr_ready') {
                getQR();
              }
            } catch (error) {
              console.error('Error checking status:', error);
              document.getElementById('status').textContent = 'Error checking status';
            }
          }
          
          async function getQR() {
            try {
              const response = await fetch('/qr', {
                headers: { 'Authorization': 'Bearer ' + API_TOKEN }
              });
              
              if (response.ok) {
                const data = await response.json();
                // Use a QR code library to display the QR code
                document.getElementById('qrImage').innerHTML = 
                  `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}">`;
              } else {
                document.getElementById('qrImage').innerHTML = 'QR code not available';
              }
            } catch (error) {
              console.error('Error getting QR code:', error);
              document.getElementById('qrImage').innerHTML = 'Error getting QR code';
            }
          }
          
          async function sendMessage() {
            const phone = document.getElementById('phone').value;
            const message = document.getElementById('messageText').value;
            const resultElement = document.getElementById('sendResult');
            
            if (!phone || !message) {
              resultElement.innerHTML = '<p style="color: red;">Phone number and message are required</p>';
              return;
            }
            
            try {
              const response = await fetch('/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + API_TOKEN
                },
                body: JSON.stringify({ phone, message })
              });
              
              const data = await response.json();
              if (response.ok) {
                resultElement.innerHTML = '<p style="color: green;">Message sent successfully!</p>';
              } else {
                resultElement.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
              }
            } catch (error) {
              console.error('Error sending message:', error);
              resultElement.innerHTML = '<p style="color: red;">Error sending message</p>';
            }
          }
          
          // Check status on load
          checkStatus();
        </script>
      </body>
    </html>
  `);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});