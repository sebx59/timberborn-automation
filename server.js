const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');

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
let baseApiUrl = 'http://localhost:8080/api';
const games = loadGames(); // { [gameName]: { startTime: timestamp, states: {}, history: [], tags: {}, labels: {}, levers: {}, leverLabels: {}, leverTags: {} } }
let rules = []; // [{ id, tag, conditions: [{state, value}], action: {lever, value}, enabled }]

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
      tags: games[currentGameName].tags || {},
      labels: games[currentGameName].labels || {},
      levers: games[currentGameName].levers || {},
      leverLabels: games[currentGameName].leverLabels || {},
      leverTags: games[currentGameName].leverTags || {}
    });
  } else {
    socket.emit('requireGame');
  }

  // Allow clients to set/switch the active game
  // Send current config to new client
  socket.emit('configUpdate', { baseApiUrl });
  if (currentGameName) {
    socket.emit('rulesUpdate', rules);
  }

  socket.on('setGame', (name) => {
    currentGameName = name;
    if (!games[name]) {
      games[name] = { startTime: Date.now(), states: {}, history: [], tags: {}, labels: {}, levers: {}, leverLabels: {}, leverTags: {}, leverHistory: [] };
    }
    rules = loadRules(name);
    socket.emit('rulesUpdate', rules);
    saveGames(); // Save games state to disk
    // Broadcast the game context to all clients
    io.emit('gameContext', {
      name: currentGameName,
      startTime: games[currentGameName].startTime,
      states: games[currentGameName].states,
      history: games[currentGameName].history,
      tags: games[currentGameName].tags,
      labels: games[currentGameName].labels || {},
      levers: games[currentGameName].levers || {},
      leverLabels: games[currentGameName].leverLabels || {},
      leverTags: games[currentGameName].leverTags || {},
      leverHistory: games[currentGameName].leverHistory || []
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
        saveGames();
      }
    }
  });

  socket.on('removeTag', ({ stateName, tag }) => {
    if (currentGameName && games[currentGameName]) {
      const gameTags = games[currentGameName].tags;
      if (gameTags[stateName]) {
        gameTags[stateName] = gameTags[stateName].filter(t => t !== tag);
        io.emit('tagsUpdate', gameTags);
        saveGames();
      }
    }
  });

  socket.on('setLabel', ({ stateName, label }) => {
    if (currentGameName && games[currentGameName]) {
      if (!games[currentGameName].labels) games[currentGameName].labels = {};
      games[currentGameName].labels[stateName] = label;
      io.emit('labelsUpdate', games[currentGameName].labels);
      saveGames();
    }
  });

  socket.on('updateRules', (newRules) => {
    rules = newRules;
    saveRules();
    io.emit('rulesUpdate', rules);
    console.log(`[Logic] Rules updated for ${currentGameName} (${rules.length} rules)`);
    processRules();
  });

  socket.on('syncAdapters', async () => {
    if (!currentGameName || !games[currentGameName]) return;
    const game = games[currentGameName];
    try {
      const response = await fetch(`${baseApiUrl}/adapters`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const adapters = await response.json(); // [{ name, state }, ...]

      const added = [];
      const apiNames = new Set(adapters.map(a => a.name));

      const statesToUpdate = {};
      adapters.forEach(a => {
        if (game.states[a.name] !== a.state) {
          game.states[a.name] = a.state;
          statesToUpdate[a.name] = a.state;
          io.emit('stateUpdate', { name: a.name, state: a.state, relativeTime: Date.now() - game.startTime });
        }
      });
      if (Object.keys(statesToUpdate).length > 0) {
        processRules();
      }
      for (const adapter of adapters) {
        if (!(adapter.name in game.states)) {
          game.states[adapter.name] = adapter.state;
          const relativeTime = Date.now() - game.startTime;
          game.history.push({ name: adapter.name, state: adapter.state, relativeTime });
          added.push({ name: adapter.name, state: adapter.state, relativeTime });
        }
      }

      // Which currently-defined states are not present in the API response?
      const missingStates = Object.keys(game.states).filter(n => !apiNames.has(n));

      io.emit('syncResult', { added, missingStates });
      console.log(`Sync: added ${added.length}, missing ${missingStates.length}`);
      processRules();
      saveGames();
    } catch (err) {
      console.error('syncAdapters error:', err.message);
      socket.emit('syncError', err.message);
    }
  });

  socket.on('syncLevers', async () => {
    if (!currentGameName || !games[currentGameName]) return;
    const game = games[currentGameName];
    try {
      const response = await fetch(`${baseApiUrl}/levers`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const levers = await response.json(); // [{ name, state, springReturn }, ...]
      
      if (!game.levers) game.levers = {};
      // Update or add levers
      for (const lever of levers) {
        game.levers[lever.name] = { state: lever.state, springReturn: lever.springReturn };
      }
      
      io.emit('leversUpdate', { name: currentGameName, levers: game.levers });
      console.log(`Levers synced for game: ${currentGameName}`);
      processRules();
      saveGames();
    } catch (err) {
      console.error('syncLevers error:', err.message);
      socket.emit('syncLeversError', err.message);
    }
  });

  socket.on('setLeverLabel', ({ leverName, label }) => {
    if (currentGameName && games[currentGameName]) {
      if (!games[currentGameName].leverLabels) games[currentGameName].leverLabels = {};
      games[currentGameName].leverLabels[leverName] = label;
      io.emit('leverLabelsUpdate', games[currentGameName].leverLabels);
      saveGames();
    }
  });

  socket.on('addLeverTag', ({ leverName, tag }) => {
    if (currentGameName && games[currentGameName]) {
      const gTags = games[currentGameName].leverTags;
      if (!gTags[leverName]) gTags[leverName] = [];
      if (!gTags[leverName].includes(tag)) {
        gTags[leverName].push(tag);
        io.emit('leverTagsUpdate', gTags);
        saveGames();
      }
    }
  });

  socket.on('removeLeverTag', ({ leverName, tag }) => {
    if (currentGameName && games[currentGameName]) {
      const gTags = games[currentGameName].leverTags;
      if (gTags[leverName]) {
        gTags[leverName] = gTags[leverName].filter(t => t !== tag);
        io.emit('leverTagsUpdate', gTags);
        saveGames();
      }
    }
  });

  socket.on('updateConfig', (newConfig) => {
    if (newConfig && newConfig.baseApiUrl) {
      baseApiUrl = newConfig.baseApiUrl;
      io.emit('configUpdate', { baseApiUrl });
      console.log(`Base API URL updated to: ${baseApiUrl}`);
    }
  });

  socket.on('toggleState', async ({ name, state }) => {
    if (currentGameName && games[currentGameName]) {
      games[currentGameName].states[name] = state;
      const relativeTime = Date.now() - games[currentGameName].startTime;
      if (!games[currentGameName].history) games[currentGameName].history = [];
      games[currentGameName].history.push({ name, state, relativeTime });
      io.emit('stateUpdate', { name, state, relativeTime });
      console.log(`State ${name} toggled to ${state ? 'ON' : 'OFF'} via socket`);
      processRules();
      saveGames();
    }
  });

  socket.on('toggleLever', async ({ name, state }) => {
    if (!currentGameName || !games[currentGameName]) return;
    const game = games[currentGameName];
    const encodedName = encodeURIComponent(name);
    const action = state ? 'switch-on' : 'switch-off';
    
    try {
      // Proxy the call to the external game API
      const response = await fetch(`${baseApiUrl}/${action}/${encodedName}`);
      if (!response.ok) throw new Error(`Game API responded with ${response.status}`);
      
      // Update local state if the external call succeeded
      if (game.levers && game.levers[name]) {
        game.levers[name].state = state;
        const relativeTime = Date.now() - game.startTime;
        if (!game.leverHistory) game.leverHistory = [];
        game.leverHistory.push({ name, state, relativeTime });
        
        io.emit('leversUpdate', { name: currentGameName, levers: game.levers, historyUpdate: { name, state, relativeTime } });
        console.log(`Lever ${name} toggled to ${state ? 'ON' : 'OFF'}`);
        processRules();
      }
    } catch (err) {
      console.error('toggleLever error:', err.message);
      socket.emit('leverSyncError', `Failed to toggle lever: ${err.message}`);
    }
  });

  socket.on('deleteState', (stateName) => {
    if (currentGameName && games[currentGameName]) {
      const game = games[currentGameName];
      delete game.states[stateName];
      delete game.tags[stateName];
      if (game.labels) delete game.labels[stateName];
      game.history = (game.history || []).filter(h => h.name !== stateName);
      io.emit('stateDeleted', stateName);
      console.log(`State deleted: ${stateName}`);
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
// Helper to load/save logic graphs
function loadRules(gameName) {
  const filePath = path.join(__dirname, `${gameName}.rules.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error('Error loading logic graphs:', e);
      return [];
    }
  }
  return [];
}

function saveRules() {
  if (!currentGameName) return;
  const filePath = path.join(__dirname, `${currentGameName}.rules.json`);
  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));
}

function evaluateNode(nodeId, graph, gameStates, visited = new Set()) {
  if (visited.has(nodeId)) {
    console.warn(`[Logic Graph] Cycle detected at node ${nodeId}. Breaking.`);
    return false;
  }
  visited.add(nodeId);

  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) {
    console.warn(`[Logic Graph] Node ${nodeId} not found in graph.`);
    return false;
  }

  let result = false;
  if (node.type === 'state') {
    result = !!gameStates[node.config?.name];
    console.log(`[Logic Graph] Node ${node.id} (STATE: ${node.config?.name}) -> ${result}`);
    return result;
  }

  const incomingWires = graph.wires.filter(w => w.toId === nodeId);
  const inputs = incomingWires.map(w => evaluateNode(w.fromNodeId, graph, gameStates, new Set(visited)));

  switch (node.type) {
    case 'and':
      result = inputs.length > 0 && inputs.every(v => v === true);
      break;
    case 'or':
      result = inputs.some(v => v === true);
      break;
    case 'xor':
      result = inputs.filter(v => v === true).length % 2 !== 0;
      break;
    case 'not':
      result = (inputs.length > 0) ? !inputs[0] : true;
      break;
    case 'lever':
      // A lever is ON if any of its inputs are ON
      result = inputs.length > 0 && inputs.some(v => v === true);
      break;
    default:
      result = false;
  }

  console.log(`[Logic Graph] Node ${node.id} (${node.type.toUpperCase()}) -> ${result} (Inputs: ${JSON.stringify(inputs)})`);
  return result;
}

async function processRules() {
  if (!currentGameName || !games[currentGameName] || !Array.isArray(rules)) return;
  const game = games[currentGameName];
  
  if (rules.length === 0) return;

  for (const graph of rules) {
    // Handle Graph Rules
    if (graph.nodes && graph.wires) {
      const leverNodes = graph.nodes.filter(n => n.type === 'lever');
      for (const ln of leverNodes) {
        const leverName = ln.config?.name;
        if (!leverName) continue;

        const result = evaluateNode(ln.id, graph, game.states);
        const currentLeverState = !!game.levers[leverName]?.state;

        if (currentLeverState !== result) {
          console.log(`[Logic Graph] Triggering: ${leverName} -> ${result} (Tag: ${graph.tag})`);
          await toggleLeverAction(leverName, result);
        }
      }
    } 
    // Handle Legacy Rules
    else if (graph.conditions && graph.action && graph.enabled !== false) {
       const matches = graph.conditions.length > 0 && graph.conditions.every(cond => {
          return !!game.states[cond.state] === !!cond.value;
       });

       if (matches) {
          const currentLeverState = !!game.levers[graph.action.lever]?.state;
          if (currentLeverState !== !!graph.action.value) {
            console.log(`[Legacy Logic] Triggering: ${graph.action.lever} -> ${graph.action.value}`);
            await toggleLeverAction(graph.action.lever, !!graph.action.value);
          }
       }
    }
  }
}

async function toggleLeverAction(leverName, state) {
  if (!currentGameName || !games[currentGameName]) return;
  const game = games[currentGameName];
  
  try {
    const action = state ? 'switch-on' : 'switch-off';
    const encodedName = encodeURIComponent(leverName);
    const url = `${baseApiUrl}/${action}/${encodedName}`;
    console.log(`[Logic] Executing automation API call: ${url}`);
    
    const response = await fetch(url); // Manual toggle uses GET/POST? Let's check.
    // Wait, line 248 in server.js shows fetch without options, which is GET.
    // Actually, let's use the same as manual.
    
    console.log(`[Logic] API Result: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      if (game.levers[leverName]) {
        game.levers[leverName].state = state;
        io.emit('leverUpdate', { name: leverName, state });
        saveGames();
        console.log(`[Logic] Successfully updated ${leverName} to ${state}`);
      }
    } else {
      const text = await response.text();
      console.error(`[Logic] API Error Response: ${text}`);
    }
  } catch (e) {
    console.error(`[Logic] Failed to execute automation toggle for ${leverName}:`, e.message);
  }
}

function loadGames() {
  const filePath = path.join(__dirname, 'games.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error('Error loading games:', e);
    }
  }
  return {};
}

function saveGames() {
  const filePath = path.join(__dirname, 'games.json');
  fs.writeFileSync(filePath, JSON.stringify(games, null, 2));
}

server.listen(PORT, () => {
  console.log(`Server is running and listening on port ${PORT}`);
});
