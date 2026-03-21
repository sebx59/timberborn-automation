const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'dist/frontend/browser')));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Global Game Store
let currentGameName = null;
const games = {}; // { [gameName]: { startTime: timestamp, states: {}, history: [], tags: {} } }

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  
  // Send current state to new clients if a game is active
  if (currentGameName) {
    socket.emit('gameContext', {
      name: currentGameName,
      startTime: games[currentGameName].startTime,
      states: games[currentGameName].states,
      history: games[currentGameName].history || [],
      tags: games[currentGameName].tags || {}
    });
  } else {
    socket.emit('requireGame');
  }

  // Allow clients to set/switch the active game
  socket.on('setGame', (name) => {
    currentGameName = name;
    if (!games[name]) {
      games[name] = { startTime: Date.now(), states: {}, history: [], tags: {} };
    }
    // Broadcast the game context to all clients
    io.emit('gameContext', {
      name: currentGameName,
      startTime: games[currentGameName].startTime,
      states: games[currentGameName].states,
      history: games[currentGameName].history,
      tags: games[currentGameName].tags
    });
    console.log(`Global game context switched to: ${name}`);
  });

  socket.on('addTag', ({ stateName, tag }) => {
    if (currentGameName && games[currentGameName]) {
      const gameTags = games[currentGameName].tags;
      if (!gameTags[stateName]) gameTags[stateName] = [];
      if (!gameTags[stateName].includes(tag)) {
        gameTags[stateName].push(tag);
        io.emit('tagsUpdate', gameTags);
      }
    }
  });

  socket.on('removeTag', ({ stateName, tag }) => {
    if (currentGameName && games[currentGameName]) {
      const gameTags = games[currentGameName].tags;
      if (gameTags[stateName]) {
        gameTags[stateName] = gameTags[stateName].filter(t => t !== tag);
        io.emit('tagsUpdate', gameTags);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Endpoint to turn ON a variable
app.get('/on/:name', (req, res) => {
  if (!currentGameName) return res.status(400).json({ success: false, error: 'No active game selected' });
  const { name } = req.params;
  
  games[currentGameName].states[name] = true;
  const relativeTime = Date.now() - games[currentGameName].startTime;
  if (!games[currentGameName].history) games[currentGameName].history = [];
  games[currentGameName].history.push({ name, state: true, relativeTime });
  
  io.emit('stateUpdate', { name, state: true, relativeTime });
  
  res.json({ success: true, game: currentGameName, name, state: true, relativeTime });
});

// Endpoint to turn OFF a variable
app.get('/off/:name', (req, res) => {
  if (!currentGameName) return res.status(400).json({ success: false, error: 'No active game selected' });
  const { name } = req.params;
  
  games[currentGameName].states[name] = false;
  const relativeTime = Date.now() - games[currentGameName].startTime;
  if (!games[currentGameName].history) games[currentGameName].history = [];
  games[currentGameName].history.push({ name, state: false, relativeTime });
  
  io.emit('stateUpdate', { name, state: false, relativeTime });
  
  res.json({ success: true, game: currentGameName, name, state: false, relativeTime });
});

// Endpoint to get all current states
app.get('/states', (req, res) => {
  if (!currentGameName) return res.status(400).json({ success: false, error: 'No active game selected' });
  res.json(games[currentGameName].states);
});

// Catch-all route to serve the Angular app
app.get(/^(.*)$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/frontend/browser/index.html'));
});

const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Server is running and listening on port ${PORT}`);
});
