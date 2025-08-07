const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for analytics data
let analyticsData = {
  activeSessions: 0,
  totalSessions: 0,
  stoppedSessions: 0,
  messagesProcessed: 0,
  errorsOccurred: 0,
  avgDuration: 0,
  userAgents: [],
  history: []
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to update stats
app.post('/api/update', (req, res) => {
  const authToken = req.headers.authorization;
  
  if (!authToken || !authToken.startsWith('Bearer a3f5d7e29c1b6f8a4d9c2e5b8f3d7a1e6c9b2f5d8e3a7c1b6f9d2e5a8c3b7f1e4') || 
      authToken.split(' ')[1] !== process.env.ANALYTICS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Update analytics data
  analyticsData = {
    ...analyticsData,
    ...req.body,
    userAgents: [...new Set([...analyticsData.userAgents, ...(req.body.userAgents || [])])],
    history: [...analyticsData.history, {
      timestamp: new Date(),
      ...req.body
    }].slice(-100) // Keep last 100 entries
  };
  
  // Broadcast update to all WebSocket clients
  broadcastUpdate();
  
  res.json({ status: 'success' });
});

// API endpoint to get current stats
app.get('/api/stats', (req, res) => {
  res.json(analyticsData);
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Analytics server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

function broadcastUpdate() {
  const data = JSON.stringify(analyticsData);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  // Send current data on new connection
  ws.send(JSON.stringify(analyticsData));
});

// Load data from file if it exists
if (fs.existsSync('analytics-data.json')) {
  try {
    const data = fs.readFileSync('analytics-data.json', 'utf8');
    analyticsData = JSON.parse(data);
    console.log('Loaded analytics data from file');
  } catch (err) {
    console.error('Error loading analytics data:', err);
  }
}

// Save data to file periodically
setInterval(() => {
  fs.writeFile('analytics-data.json', JSON.stringify(analyticsData), (err) => {
    if (err) console.error('Error saving analytics data:', err);
  });
}, 60000); // Every minute

// Handle shutdown gracefully
process.on('SIGINT', () => {
  fs.writeFileSync('analytics-data.json', JSON.stringify(analyticsData));
  process.exit();
});