import './style.css';

// ===== DOM Elements =====
const elements = {
  // Header
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  rulesBtn: document.getElementById('rulesBtn'),
  liveStatus: document.getElementById('liveStatus'),

  // Error Banner
  errorBanner: document.getElementById('errorBanner'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  errorDismiss: document.getElementById('errorDismiss'),
  errorReset: document.getElementById('errorReset'),

  // Config
  baseUrlA: document.getElementById('baseUrlA'),
  pathA: document.getElementById('pathA'),
  modelA: document.getElementById('modelA'),
  apiKeyA: document.getElementById('apiKeyA'),
  baseUrlB: document.getElementById('baseUrlB'),
  pathB: document.getElementById('pathB'),
  modelB: document.getElementById('modelB'),
  apiKeyB: document.getElementById('apiKeyB'),
  useProxy: document.getElementById('useProxy'),
  proxyUrl: document.getElementById('proxyUrl'),

  // Arena
  canvas: document.getElementById('arenaCanvas'),
  scoreA: document.getElementById('scoreA'),
  scoreB: document.getElementById('scoreB'),
  pulseStat: document.getElementById('pulseStat'),
  beaconStat: document.getElementById('beaconStat'),
  impactStat: document.getElementById('impactStat'),
  ticker: document.getElementById('ticker'),

  // Log
  logStream: document.getElementById('logStream'),
  clearLog: document.getElementById('clearLog'),
  intentA: document.getElementById('intentA'),
  intentB: document.getElementById('intentB'),

  // Modal
  rulesModal: document.getElementById('rulesModal'),
  rulesBackdrop: document.getElementById('rulesBackdrop'),
  rulesClose: document.getElementById('rulesClose'),
};

const ctx = elements.canvas.getContext('2d');

// ===== Constants =====
const CONFIG_STORAGE_KEY = 'ai-battle-arena-config';
const PHYSICS_RATE = 60;
const ACTION_RATE = 12;
const PROJECTILE_SPEED = 260;
const BEACON_HIT_RADIUS = 22;
const SHIP_HIT_RADIUS = 18;

const palette = {
  cobalt: '#4da0ff',
  ember: '#f6a243',
  bg: '#0a0d14'
};

// ===== Game State =====
const state = {
  time: 0,
  shots: 0,
  beaconHits: 0,
  shipHits: 0,
  beacons: [],
  ships: [],
  bursts: [],
  projectiles: [],
  lastEvents: [],
  dimensions: { width: 0, height: 0 }
};

let running = false;
let hasError = false;
let actionTimers = [null, null];
let inFlight = [false, false];
let lastFrame = 0;
let accumulator = 0;
let musicStarted = false;

// Conversation history for each model to reduce prompt size
let conversationHistory = [
  [], // Model A history
  []  // Model B history
];

// ===== Assets =====
const assets = {
  galaxyBg: new Image(),
  battleship1: new Image(),
  battleship2: new Image(),
  asteroid: new Image(),
  fireSound: new Audio('/assets/fire.mp3'),
  moveSound: new Audio('/assets/move.mp3'),
  music: new Audio('/assets/music.mp3')
};

let assetsLoaded = false;

function loadAssets() {
  assets.galaxyBg.src = '/assets/galaxy.jpg';
  assets.battleship1.src = '/assets/battleship 1.png';
  assets.battleship2.src = '/assets/battleship 2.png';
  assets.asteroid.src = '/assets/asteroid.png';
  assets.music.loop = true;
  assets.music.volume = 0.3;

  Promise.all([
    new Promise(resolve => { assets.galaxyBg.onload = resolve; assets.galaxyBg.onerror = resolve; }),
    new Promise(resolve => { assets.battleship1.onload = resolve; assets.battleship1.onerror = resolve; }),
    new Promise(resolve => { assets.battleship2.onload = resolve; assets.battleship2.onerror = resolve; }),
    new Promise(resolve => { assets.asteroid.onload = resolve; assets.asteroid.onerror = resolve; })
  ]).then(() => {
    assetsLoaded = true;
    console.log('Assets loaded');
  });
}

// ===== Utility Functions =====
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// ===== Canvas Setup =====
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = elements.canvas.getBoundingClientRect();
  elements.canvas.width = rect.width * dpr;
  elements.canvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

// ===== Game Entities =====
function createShip(index) {
  const width = elements.canvas.clientWidth || 800;
  const height = elements.canvas.clientHeight || 500;
  return {
    id: index,
    x: index === 0 ? width * 0.25 : width * 0.75,
    y: index === 0 ? height * 0.35 : height * 0.65,
    angle: index === 0 ? 0 : Math.PI,
    score: 0,
    lastAction: { action: 'move', turn: 0, move: 0 },
    intent: '',
    continuousMove: 0 // Speed for continuous movement
  };
}

function createBeacons() {
  const width = elements.canvas.clientWidth || 800;
  const height = elements.canvas.clientHeight || 500;
  return [
    { x: width * 0.33, y: height * 0.3, rotation: rand(0, Math.PI * 2), rotationSpeed: rand(-0.5, 0.5) },
    { x: width * 0.54, y: height * 0.52, rotation: rand(0, Math.PI * 2), rotationSpeed: rand(-0.5, 0.5) },
    { x: width * 0.72, y: height * 0.32, rotation: rand(0, Math.PI * 2), rotationSpeed: rand(-0.5, 0.5) }
  ];
}

function spawnBeacon() {
  const width = elements.canvas.clientWidth || 800;
  const height = elements.canvas.clientHeight || 500;
  const padding = 60;
  let tries = 0;
  let candidate = null;

  while (tries < 30) {
    const x = rand(padding, width - padding);
    const y = rand(padding, height - padding);
    const tooCloseToShip = state.ships.some(ship => Math.hypot(ship.x - x, ship.y - y) < 120);
    const tooCloseToBeacon = state.beacons.some(beacon => Math.hypot(beacon.x - x, beacon.y - y) < 90);
    if (!tooCloseToShip && !tooCloseToBeacon) {
      candidate = { x, y };
      break;
    }
    tries++;
  }

  if (!candidate) {
    candidate = {
      x: rand(padding, width - padding),
      y: rand(padding, height - padding)
    };
  }

  candidate.rotation = rand(0, Math.PI * 2);
  candidate.rotationSpeed = rand(-0.5, 0.5);
  state.beacons.push(candidate);
}

// ===== Game Reset =====
function resetGame() {
  state.dimensions.width = elements.canvas.clientWidth || 800;
  state.dimensions.height = elements.canvas.clientHeight || 500;
  state.time = 0;
  state.shots = 0;
  state.beaconHits = 0;
  state.shipHits = 0;
  state.beacons = createBeacons();
  state.ships = [createShip(0), createShip(1)];
  state.bursts = [];
  state.projectiles = [];
  state.lastEvents = [];

  // Reset conversation history for fresh start
  conversationHistory = [[], []];

  updateHud();
  render();
  elements.logStream.innerHTML = '';
  elements.intentA.textContent = 'Waiting...';
  elements.intentB.textContent = 'Waiting...';
  elements.ticker.textContent = 'Arena reset. Configure models to begin.';
}

function updateHud() {
  elements.scoreA.textContent = Math.round(state.ships[0]?.score || 0).toString();
  elements.scoreB.textContent = Math.round(state.ships[1]?.score || 0).toString();
  elements.pulseStat.textContent = state.shots.toString();
  elements.beaconStat.textContent = state.beaconHits.toString();
  elements.impactStat.textContent = state.shipHits.toString();
}

// ===== Config Persistence =====
function saveConfig() {
  const payload = {
    models: [
      {
        baseUrl: elements.baseUrlA.value,
        path: elements.pathA.value,
        model: elements.modelA.value,
        apiKey: elements.apiKeyA.value
      },
      {
        baseUrl: elements.baseUrlB.value,
        path: elements.pathB.value,
        model: elements.modelB.value,
        apiKey: elements.apiKeyB.value
      }
    ],
    proxy: {
      enabled: elements.useProxy.checked,
      url: elements.proxyUrl.value
    }
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
}

function loadConfig() {
  const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data?.models?.[0]) {
      elements.baseUrlA.value = data.models[0].baseUrl || '';
      elements.pathA.value = data.models[0].path || '';
      elements.modelA.value = data.models[0].model || '';
      elements.apiKeyA.value = data.models[0].apiKey || '';
    }
    if (data?.models?.[1]) {
      elements.baseUrlB.value = data.models[1].baseUrl || '';
      elements.pathB.value = data.models[1].path || '';
      elements.modelB.value = data.models[1].model || '';
      elements.apiKeyB.value = data.models[1].apiKey || '';
    }
    if (data?.proxy) {
      elements.useProxy.checked = Boolean(data.proxy.enabled);
      elements.proxyUrl.value = data.proxy.url || elements.proxyUrl.value;
    }
  } catch (error) {
    // ignore malformed storage
  }
}

// ===== Logging =====
function logEvent(modelId, title, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${modelId === 0 ? 'cobalt' : 'ember'}`;
  entry.innerHTML = `<strong>${title}</strong>${message}`;
  elements.logStream.prepend(entry);
  if (elements.logStream.children.length > 10) {
    elements.logStream.removeChild(elements.logStream.lastChild);
  }
}

// ===== Error Handling =====
function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorBanner.classList.remove('hidden');
  hasError = true;
  pauseMatch();
  setLiveStatus('Error', 'error');
  elements.ticker.textContent = 'Match paused due to an API error.';
  elements.ticker.classList.add('error');
}

function hideError() {
  elements.errorBanner.classList.add('hidden');
  hasError = false;
  elements.ticker.classList.remove('error');
  if (!running) {
    setLiveStatus('Paused', 'paused');
  }
}

// ===== Modal =====
function openRules() {
  elements.rulesModal.classList.remove('hidden');
}

function closeRules() {
  elements.rulesModal.classList.add('hidden');
}

// ===== Status =====
function setLiveStatus(text, state) {
  elements.liveStatus.textContent = text;
  elements.liveStatus.className = 'status-pill';
  if (state) {
    elements.liveStatus.classList.add(state);
  }
}

// ===== AI Model Integration =====
function buildSystemPrompt() {
  return `You are an AI pilot in a realtime space shooter.

Game rules:
- Continuous time. Actions are requested ~12Hz; physics updates ~60Hz.
- Ships can turn in degrees and move in units.
- Fire launches a ball projectile in the facing direction.
- Hitting a beacon (asteroid) awards +5 points and spawns a new beacon.
- Hitting the other ship with a projectile costs the shooter -5 points.
- CRITICAL: If your ship collides with an asteroid (beacon), the game ends immediately. Avoid asteroids at all costs!

Board context:
- You receive board.width and board.height representing the arena boundaries.
- Coordinates: top-left is (0,0), x increases right, y increases down.
- lastEvents contains recent game events including your actions and hit results (hit_beacon, hit_opponent).

Ship orientation and aiming:
- self.angleDegrees tells you which direction your ship is pointing.
- 0° points right (East), 90° points down (South), 180° points left (West), -90° points up (North).
- The "turn" field is a DELTA that gets ADDED to your current angle.
- To hit a beacon: calculate targetAngle = atan2(by - sy, bx - sx) * 180 / PI, then turn by (targetAngle - self.angleDegrees).

Response JSON schema (no extra text):
{
  "action": "turn|move|fire",
  "turn": -180..180,
  "move": 0..120,
  "intent": "short strategy note"
}`;
}

function buildContext(modelId) {
  const self = state.ships[modelId];
  const opponent = state.ships[modelId === 0 ? 1 : 0];
  const width = elements.canvas.clientWidth || 800;
  const height = elements.canvas.clientHeight || 500;

  return {
    time: Number(state.time.toFixed(2)),
    board: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) },
    self: {
      x: Number(self.x.toFixed(1)),
      y: Number(self.y.toFixed(1)),
      angleDegrees: Number((self.angle * (180 / Math.PI)).toFixed(1)),
      score: Number(self.score.toFixed(1))
    },
    opponent: {
      x: Number(opponent.x.toFixed(1)),
      y: Number(opponent.y.toFixed(1)),
      score: Number(opponent.score.toFixed(1)),
      hitRadius: SHIP_HIT_RADIUS
    },
    beacons: state.beacons.map(b => ({
      x: Number(b.x.toFixed(1)),
      y: Number(b.y.toFixed(1)),
      hitRadius: BEACON_HIT_RADIUS
    })),
    lastEvents: state.lastEvents.slice(0, 4)
  };
}

function isModelConfigured(modelId) {
  const els = modelId === 0
    ? { baseUrl: elements.baseUrlA, path: elements.pathA, model: elements.modelA, apiKey: elements.apiKeyA }
    : { baseUrl: elements.baseUrlB, path: elements.pathB, model: elements.modelB, apiKey: elements.apiKeyB };
  return Boolean(els.baseUrl.value.trim() && els.path.value.trim() && els.model.value.trim() && els.apiKey.value.trim());
}

function parseAction(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

function normalizeAction(action) {
  const normalized = { action: 'move', turn: 0, move: 0, intent: '' };
  if (!action || typeof action !== 'object') return normalized;
  if (typeof action.action === 'string') normalized.action = action.action.toLowerCase();
  normalized.turn = clamp(Number(action.turn ?? 0), -180, 180);
  normalized.move = clamp(Number(action.move ?? 0), 0, 120);
  if (typeof action.intent === 'string') normalized.intent = action.intent.slice(0, 120);
  if (!['turn', 'move', 'fire'].includes(normalized.action)) normalized.action = 'move';
  return normalized;
}

async function requestAction(modelId) {
  if (!running || inFlight[modelId]) return;
  inFlight[modelId] = true;

  const els = modelId === 0
    ? { baseUrl: elements.baseUrlA, path: elements.pathA, model: elements.modelA, apiKey: elements.apiKeyA }
    : { baseUrl: elements.baseUrlB, path: elements.pathB, model: elements.modelB, apiKey: elements.apiKeyB };

  const baseUrl = els.baseUrl.value.trim();
  const path = els.path.value.trim();
  const model = els.model.value.trim();
  const apiKey = els.apiKey.value.trim();

  if (!baseUrl || !model || !apiKey || !path) {
    inFlight[modelId] = false;
    return;
  }

  try {
    const context = buildContext(modelId);
    const prompt = `Arena context JSON:\n${JSON.stringify(context, null, 2)}\n\nReturn JSON only.`;
    const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const useResponses = path.includes('/responses');

    // Initialize conversation history with system message if empty
    if (conversationHistory[modelId].length === 0) {
      const systemPrompt = buildSystemPrompt();
      conversationHistory[modelId].push({ role: 'system', content: systemPrompt });
    }

    // Add user message with current game state
    conversationHistory[modelId].push({ role: 'user', content: prompt });

    // Keep conversation history manageable (last 20 messages = ~10 turns)
    if (conversationHistory[modelId].length > 21) {
      // Keep system message + last 20 messages
      conversationHistory[modelId] = [
        conversationHistory[modelId][0],
        ...conversationHistory[modelId].slice(-20)
      ];
    }

    const payload = useResponses
      ? { model, input: conversationHistory[modelId].map(m => m.content).join('\n\n') }
      : { model, messages: conversationHistory[modelId] };

    let response;
    if (elements.useProxy.checked && elements.proxyUrl.value.trim()) {
      response = await fetch(elements.proxyUrl.value.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, path, apiKey, payload })
      });
    } else {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 150)}` : ''}`);
    }

    const data = await response.json();
    const message = useResponses
      ? data?.output?.[0]?.content?.[0]?.text ?? data?.output_text ?? ''
      : data?.choices?.[0]?.message?.content ?? '';

    const action = parseAction(message);
    if (!action || !action.action) {
      const ship = state.ships[modelId];
      ship.intent = 'Invalid JSON response';
      const intentEl = modelId === 0 ? elements.intentA : elements.intentB;
      intentEl.textContent = 'Invalid JSON response';
      // Remove the invalid user message from history
      conversationHistory[modelId].pop();
      inFlight[modelId] = false;
      return;
    }

    // Add assistant response to history
    conversationHistory[modelId].push({ role: 'assistant', content: message });

    const normalized = normalizeAction(action);
    applyAction(modelId, normalized);
  } catch (error) {
    const who = modelId === 0 ? 'Model A' : 'Model B';
    logEvent(modelId, who, `Error: ${error.message}`);
    showError(`${who} API Error`, error.message);
    // Remove the failed user message from history
    if (conversationHistory[modelId].length > 1) {
      conversationHistory[modelId].pop();
    }
  }

  inFlight[modelId] = false;
}

function applyAction(modelId, action) {
  const ship = state.ships[modelId];
  ship.lastAction = action;
  ship.intent = action.intent || ship.intent;

  const intentEl = modelId === 0 ? elements.intentA : elements.intentB;
  if (action.intent) intentEl.textContent = action.intent;

  switch (action.action) {
    case 'turn':
      ship.angle += (action.turn * Math.PI) / 180;
      ship.continuousMove = 0; // Stop continuous movement on turn
      break;
    case 'move':
      if (action.turn) ship.angle += (action.turn * Math.PI) / 180;
      ship.x += Math.cos(ship.angle) * action.move;
      ship.y += Math.sin(ship.angle) * action.move;
      ship.continuousMove = action.move; // Set continuous movement speed
      if (assetsLoaded && action.move > 0) {
        assets.moveSound.currentTime = 0;
        assets.moveSound.volume = 0.2;
        assets.moveSound.play().catch(() => { });
      }
      break;
    case 'fire':
      state.shots++;
      const nozzleOffset = 20;
      state.projectiles.push({
        x: ship.x + Math.cos(ship.angle) * nozzleOffset,
        y: ship.y + Math.sin(ship.angle) * nozzleOffset,
        vx: Math.cos(ship.angle) * PROJECTILE_SPEED,
        vy: Math.sin(ship.angle) * PROJECTILE_SPEED,
        owner: modelId,
        life: 5.0
      });
      ship.continuousMove = 0; // Stop continuous movement when firing
      if (assetsLoaded) {
        assets.fireSound.currentTime = 0;
        assets.fireSound.volume = 0.3;
        assets.fireSound.play().catch(() => { });
      }
      break;
  }

  const who = modelId === 0 ? 'Model A' : 'Model B';
  logEvent(modelId, who, `${action.action} | ${action.intent || 'No intent'}`);
  state.lastEvents.unshift({ model: modelId, action: action.action, intent: action.intent || '' });
  state.lastEvents = state.lastEvents.slice(0, 12);
}

// ===== Physics =====
function updatePhysics(dt) {
  state.time += dt;
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  const padding = 40;

  // Apply continuous movement to ships while waiting for new actions
  state.ships.forEach(ship => {
    if (ship.continuousMove > 0) {
      ship.x += Math.cos(ship.angle) * ship.continuousMove * dt * 60; // Scale by dt * 60 for frame-rate independence
      ship.y += Math.sin(ship.angle) * ship.continuousMove * dt * 60;
    }
  });

  // Constrain ships
  state.ships.forEach(ship => {
    ship.x = clamp(ship.x, padding, width - padding);
    ship.y = clamp(ship.y, padding, height - padding);
  });

  // Check ship-asteroid collisions (GAME OVER condition)
  state.ships.forEach(ship => {
    for (let i = 0; i < state.beacons.length; i++) {
      const beacon = state.beacons[i];
      const distance = Math.hypot(ship.x - beacon.x, ship.y - beacon.y);
      if (distance < SHIP_HIT_RADIUS + BEACON_HIT_RADIUS) {
        // Game over!
        const who = ship.id === 0 ? 'Model A' : 'Model B';
        logEvent(ship.id, who, 'CRASHED INTO ASTEROID - GAME OVER!');
        pauseMatch();
        elements.ticker.textContent = `${who} collided with an asteroid! Game Over.`;
        elements.ticker.classList.add('error');
        return;
      }
    }
  });

  // Update beacon rotations
  state.beacons.forEach(beacon => {
    beacon.rotation = (beacon.rotation + beacon.rotationSpeed * dt) % (Math.PI * 2);
  });

  // Update projectiles
  const projectilesNext = [];
  state.projectiles.forEach(projectile => {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;

    if (projectile.life <= 0 || projectile.x < -20 || projectile.x > width + 20 || projectile.y < -20 || projectile.y > height + 20) {
      return;
    }

    // Check ship hit
    const targetId = projectile.owner === 0 ? 1 : 0;
    const target = state.ships[targetId];
    if (Math.hypot(projectile.x - target.x, projectile.y - target.y) < SHIP_HIT_RADIUS) {
      state.ships[projectile.owner].score -= 5;
      state.shipHits++;
      const who = projectile.owner === 0 ? 'Model A' : 'Model B';
      logEvent(projectile.owner, who, 'Hit opponent: -5 pts');
      state.bursts.push({ x: target.x, y: target.y, life: 0.6, maxLife: 0.6, intensity: 0.8, type: 'impact' });
      // Add to events so model knows about the hit
      state.lastEvents.unshift({ model: projectile.owner, action: 'hit_opponent', score: -5 });
      state.lastEvents = state.lastEvents.slice(0, 12);
      return;
    }

    // Check beacon hit
    let hitBeaconIndex = -1;
    for (let i = 0; i < state.beacons.length; i++) {
      if (Math.hypot(projectile.x - state.beacons[i].x, projectile.y - state.beacons[i].y) < BEACON_HIT_RADIUS) {
        hitBeaconIndex = i;
        break;
      }
    }

    if (hitBeaconIndex >= 0) {
      const hitBeacon = state.beacons[hitBeaconIndex];
      state.beaconHits++;
      state.ships[projectile.owner].score += 5;
      const who = projectile.owner === 0 ? 'Model A' : 'Model B';
      logEvent(projectile.owner, who, 'Beacon hit: +5 pts');
      state.bursts.push({ x: hitBeacon.x, y: hitBeacon.y, life: 0.8, maxLife: 0.8, intensity: 1, type: 'impact' });
      // Add to events so model knows about the hit
      state.lastEvents.unshift({ model: projectile.owner, action: 'hit_beacon', score: 5 });
      state.lastEvents = state.lastEvents.slice(0, 12);
      state.beacons.splice(hitBeaconIndex, 1);
      spawnBeacon();
      return;
    }

    projectilesNext.push(projectile);
  });
  state.projectiles = projectilesNext;

  // Update bursts
  state.bursts.forEach(burst => burst.life -= dt);
  state.bursts = state.bursts.filter(burst => burst.life > 0);

  updateHud();
}

// ===== Rendering =====
function renderBeacons() {
  state.beacons.forEach(beacon => {
    ctx.save();
    ctx.translate(beacon.x, beacon.y);
    ctx.rotate(beacon.rotation);

    if (assetsLoaded && assets.asteroid.complete && assets.asteroid.naturalWidth > 0) {
      const size = 50;
      ctx.drawImage(assets.asteroid, -size / 2, -size / 2, size, size);
    } else {
      // Fallback asteroid
      const points = 8;
      const baseRadius = 22;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const radius = baseRadius + Math.sin(i * 2.3) * 5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, baseRadius);
      gradient.addColorStop(0, 'rgba(180, 140, 100, 0.9)');
      gradient.addColorStop(0.5, 'rgba(140, 100, 70, 0.8)');
      gradient.addColorStop(1, 'rgba(100, 70, 50, 0.7)');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 160, 120, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  });
}

function renderShips() {
  state.ships.forEach(ship => {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    const color = ship.id === 0 ? palette.cobalt : palette.ember;
    const img = ship.id === 0 ? assets.battleship1 : assets.battleship2;

    if (assetsLoaded && img.complete && img.naturalWidth > 0) {
      const size = 70;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);

      // Engine glow
      ctx.beginPath();
      const engineGradient = ctx.createRadialGradient(-28, 0, 0, -28, 0, 14);
      engineGradient.addColorStop(0, color + 'cc');
      engineGradient.addColorStop(0.5, color + '66');
      engineGradient.addColorStop(1, color + '00');
      ctx.fillStyle = engineGradient;
      ctx.arc(-28, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Fallback ship
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-18, -11);
      ctx.lineTo(-14, -6);
      ctx.lineTo(-14, 6);
      ctx.lineTo(-18, 11);
      ctx.closePath();
      const bodyGradient = ctx.createLinearGradient(-18, 0, 22, 0);
      bodyGradient.addColorStop(0, color + '40');
      bodyGradient.addColorStop(0.7, color);
      bodyGradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
      ctx.fillStyle = bodyGradient;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cockpit
      ctx.beginPath();
      ctx.fillStyle = 'rgba(100, 200, 255, 0.5)';
      ctx.arc(8, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function renderProjectiles() {
  state.projectiles.forEach(p => {
    const coreRadius = 5;
    const glowRadius = 12;

    const outerGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
    outerGradient.addColorStop(0, 'rgba(255, 200, 100, 0.8)');
    outerGradient.addColorStop(0.4, 'rgba(255, 120, 50, 0.5)');
    outerGradient.addColorStop(0.7, 'rgba(255, 80, 20, 0.2)');
    outerGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.beginPath();
    ctx.fillStyle = outerGradient;
    ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    const coreGradient = ctx.createRadialGradient(p.x - 1, p.y - 1, 0, p.x, p.y, coreRadius);
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreGradient.addColorStop(0.3, 'rgba(255, 240, 150, 1)');
    coreGradient.addColorStop(0.6, 'rgba(255, 180, 80, 0.9)');
    coreGradient.addColorStop(1, 'rgba(255, 120, 40, 0.7)');
    ctx.beginPath();
    ctx.fillStyle = coreGradient;
    ctx.arc(p.x, p.y, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderBursts() {
  state.bursts.forEach(burst => {
    const progress = burst.life / (burst.maxLife || 1);
    const intensity = clamp(burst.intensity ?? 0.5, 0.1, 1);
    const radius = (28 + 40 * intensity) * progress;
    const alpha = 0.2 + 0.7 * progress;
    const gradient = ctx.createRadialGradient(burst.x, burst.y, 4, burst.x, burst.y, radius);
    gradient.addColorStop(0, `rgba(255, 235, 200, ${alpha})`);
    gradient.addColorStop(1, 'rgba(255, 235, 200, 0)');
    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render() {
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  // Background
  if (assetsLoaded && assets.galaxyBg.complete && assets.galaxyBg.naturalWidth > 0) {
    ctx.drawImage(assets.galaxyBg, 0, 0, width, height);
  } else {
    const bgGradient = ctx.createRadialGradient(width * 0.3, height * 0.3, 0, width * 0.5, height * 0.5, width * 0.8);
    bgGradient.addColorStop(0, '#0f1a2e');
    bgGradient.addColorStop(0.5, '#0a1018');
    bgGradient.addColorStop(1, '#050811');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 100; i++) {
      const x = (i * 37.3 % 1) * width;
      const y = (i * 71.7 % 1) * height;
      const size = (i * 13.1 % 3) * 0.5 + 0.3;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderBeacons();
  renderProjectiles();
  renderBursts();
  renderShips();
}

// ===== Game Loop =====
function loop(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  const delta = (timestamp - lastFrame) / 1000;
  lastFrame = timestamp;
  accumulator += delta;
  const step = 1 / PHYSICS_RATE;

  while (accumulator >= step) {
    if (running) updatePhysics(step);
    accumulator -= step;
  }

  render();
  requestAnimationFrame(loop);
}

// ===== Match Control =====
function startMatch() {
  if (running) return;
  if (hasError) {
    elements.ticker.textContent = 'Resolve the error before restarting.';
    return;
  }
  if (!isModelConfigured(0) && !isModelConfigured(1)) {
    setLiveStatus('Idle');
    elements.ticker.textContent = 'Configure at least one model before starting.';
    elements.ticker.classList.add('error');
    return;
  }
  elements.ticker.classList.remove('error');
  running = true;
  setLiveStatus('Live', 'live');
  elements.ticker.textContent = 'Live signal established. Both models act independently.';

  if (!musicStarted && assetsLoaded) {
    assets.music.play().catch(() => { });
    musicStarted = true;
  }

  scheduleActions();
}

function pauseMatch() {
  running = false;
  setLiveStatus('Paused', 'paused');
  elements.ticker.textContent = 'Simulation paused.';
  clearIntervals();
}

function clearIntervals() {
  actionTimers.forEach((timer, i) => {
    if (timer) {
      clearInterval(timer);
      actionTimers[i] = null;
    }
  });
}

function scheduleActions() {
  clearIntervals();
  const interval = 1000 / ACTION_RATE;
  actionTimers[0] = setInterval(() => requestAction(0), interval + rand(-60, 80));
  actionTimers[1] = setInterval(() => requestAction(1), interval + rand(-60, 80));
}

// ===== Event Listeners =====
elements.startBtn.addEventListener('click', startMatch);

elements.pauseBtn.addEventListener('click', () => {
  if (running) {
    pauseMatch();
    elements.pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polygon points="5,3 19,12 5,21"/>
      </svg>
      Resume
    `;
    if (musicStarted && assetsLoaded) assets.music.pause();
  } else {
    if (hasError) {
      elements.ticker.textContent = 'Resolve the error before resuming.';
      return;
    }
    running = true;
    setLiveStatus('Live', 'live');
    elements.ticker.textContent = 'Match resumed.';
    elements.pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
      Pause
    `;
    scheduleActions();
    if (musicStarted && assetsLoaded) assets.music.play().catch(() => { });
  }
});

elements.resetBtn.addEventListener('click', () => {
  pauseMatch();
  hideError();
  resetGame();
  elements.pauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
    Pause
  `;
  if (musicStarted && assetsLoaded) {
    assets.music.pause();
    assets.music.currentTime = 0;
    musicStarted = false;
  }
});

elements.clearLog.addEventListener('click', () => {
  elements.logStream.innerHTML = '';
});

elements.errorDismiss.addEventListener('click', hideError);
elements.errorReset.addEventListener('click', () => {
  hideError();
  resetGame();
});

elements.rulesBtn.addEventListener('click', openRules);
elements.rulesBackdrop.addEventListener('click', closeRules);
elements.rulesClose.addEventListener('click', closeRules);

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeRules();
});

// Config persistence
[elements.baseUrlA, elements.pathA, elements.modelA, elements.apiKeyA,
elements.baseUrlB, elements.pathB, elements.modelB, elements.apiKeyB,
elements.proxyUrl].forEach(input => {
  input.addEventListener('input', saveConfig);
});
elements.useProxy.addEventListener('change', saveConfig);

// Resize handling
window.addEventListener('resize', () => {
  const prevWidth = state.dimensions.width || elements.canvas.clientWidth;
  const prevHeight = state.dimensions.height || elements.canvas.clientHeight;
  resizeCanvas();
  const nextWidth = elements.canvas.clientWidth || 800;
  const nextHeight = elements.canvas.clientHeight || 500;
  const scaleX = nextWidth / prevWidth;
  const scaleY = nextHeight / prevHeight;

  state.ships.forEach(ship => {
    ship.x *= scaleX;
    ship.y *= scaleY;
  });
  state.beacons.forEach(beacon => {
    beacon.x *= scaleX;
    beacon.y *= scaleY;
  });

  state.dimensions.width = nextWidth;
  state.dimensions.height = nextHeight;
});

// ===== Initialize =====
loadAssets();
resizeCanvas();
loadConfig();
resetGame();
requestAnimationFrame(loop);
