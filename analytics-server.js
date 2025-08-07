const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000; // Using port 10000 as per your Render config

// Enhanced in-memory storage for analytics data
let analyticsData = {
  activeSessions: 0,
  totalSessions: 0,
  stoppedSessions: 0,
  messagesProcessed: 0,
  errorsOccurred: 0,
  avgDuration: 0,
  userAgents: [],
  history: [],
  lastUpdated: new Date().toISOString()
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to update stats
app.post('/api/update', (req, res) => {
  try {
    // Enhanced verification
    const authHeader = req.headers.authorization;
    const botIdentifier = req.headers['x-bot-identifier'];
    const botVersion = req.headers['x-bot-version'];

    // Verify required headers exist
    if (!authHeader || !botIdentifier) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        details: 'Missing required headers',
        requiredHeaders: ['Authorization: Bearer <token>', 'X-Bot-Identifier: CHUCKY-X']
      });
    }

    // Extract and verify token
    const token = authHeader.replace('Bearer ', '').trim();
    const expectedToken = process.env.ANALYTICS_TOKEN || 'a3f5d7e29c1b6f8a4d9c2e5b8f3d7a1e6c9b2f5d8e3a7c1b6f9d2e5a8c3b7f1e4';

    if (token !== expectedToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Invalid token',
        hint: 'Verify the token matches exactly with no extra spaces'
      });
    }

    // Verify bot identifier
    if (botIdentifier !== 'CHUCKY-X') {
      return res.status(403).json({
        error: 'Forbidden',
        details: 'Invalid bot identifier',
        expected: 'CHUCKY-X',
        received: botIdentifier
      });
    }

    // Validate request body
    if (!req.body || typeof req.body.activeSessions === 'undefined') {
      return res.status(400).json({
        error: 'Bad Request',
        details: 'Invalid analytics data format'
      });
    }

    // Update analytics data with enhanced validation
    const newData = {
      ...req.body,
      userAgents: Array.isArray(req.body.userAgents) ? req.body.userAgents : [],
      timestamp: new Date().toISOString(),
      botVersion: botVersion || 'unknown'
    };

    analyticsData = {
      ...analyticsData,
      ...newData,
      userAgents: [...new Set([...analyticsData.userAgents, ...newData.userAgents])],
      history: [...analyticsData.history, newData].slice(-100), // Keep last 100 entries
      lastUpdated: new Date().toISOString()
    };

    console.log('Received valid analytics update:', {
      type: 'update',
      activeSessions: newData.activeSessions,
      botVersion: newData.botVersion
    });

    // Broadcast update to all WebSocket clients
    broadcastUpdate();
    
    res.json({ 
      status: 'success',
      received: newData 
    });

  } catch (error) {
    console.error('Error processing analytics update:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: error.message
    });
  }
});

// API endpoint to get current stats
app.get('/api/stats', (req, res) => {
  try {
    res.json({
      ...analyticsData,
      uptime: process.uptime(),
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Analytics server running on port ${PORT}`);
  console.log(`Expected token: ${process.env.ANALYTICS_TOKEN || 'a3f5d7e29c1b6f8a4d9c2e5b8f3d7a1e6c9b2f5d8e3a7c1b6f9d2e5a8c3b7f1e4'}`);
});

// WebSocket server with enhanced connection handling
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true
});

function broadcastUpdate() {
  const data = JSON.stringify({
    ...analyticsData,
    connectedClients: wss.clients.size
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Send current data on new connection
  ws.send(JSON.stringify({
    ...analyticsData,
    type: 'initial',
    connectedClients: wss.clients.size
  }));
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Persistent data handling
const DATA_FILE = 'analytics-data.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      analyticsData = {
        ...analyticsData,
        ...JSON.parse(data),
        lastUpdated: new Date().toISOString()
      };
      console.log('Loaded analytics data from file');
    }
  } catch (err) {
    console.error('Error loading analytics data:', err);
  }
}

function saveData() {
  try {
    const dataToSave = {
      ...analyticsData,
      history: analyticsData.history.slice(-50) // Only keep last 50 entries in file
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave));
  } catch (err) {
    console.error('Error saving analytics data:', err);
  }
}

// Initial load
loadData();

// Save data periodically
const saveInterval = setInterval(() => {
  saveData();
}, 60000); // Every minute

// Handle shutdown gracefully
const shutdown = () => {
  clearInterval(saveInterval);
  saveData();
  console.log('Analytics server shutting down');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);