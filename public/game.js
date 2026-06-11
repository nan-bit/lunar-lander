const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const GRAVITY = 0.04;
const THRUST = 0.12;
const ROTATION_SPEED = 0.06;
const MAX_SAFE_V_SPEED = 1.2;
const MAX_SAFE_H_SPEED = 0.6;
const MAX_SAFE_ANGLE = 0.15; // Radians (~8.5 degrees)

// UI elements
const scoreVal = document.getElementById('score-val');
const fuelVal = document.getElementById('fuel-val');
const hSpeedVal = document.getElementById('h-speed-val');
const vSpeedVal = document.getElementById('v-speed-val');
const angleVal = document.getElementById('angle-val');

const overlayScreen = document.getElementById('overlay-screen');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMsg = document.getElementById('gameover-msg');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let fuel = 1000;
let lander = {
  x: 100,
  y: 50,
  vx: 1.5,
  vy: 0,
  angle: 0, // In radians
  width: 20,
  height: 25,
  thrusting: false,
  rotateLeft: false,
  rotateRight: false
};

// Terrain Definition (Vector points)
const terrainPoints = [
  { x: 0, y: 450 },
  { x: 120, y: 380 },
  { x: 220, y: 440 },
  { x: 300, y: 320 },
  { x: 360, y: 420 }, // Left edge of landing pad
  { x: 460, y: 420 }, // Right edge of landing pad (100px wide pad)
  { x: 520, y: 350 },
  { x: 620, y: 460 },
  { x: 720, y: 300 },
  { x: 800, y: 450 }
];

const LANDING_PAD_START_X = 360;
const LANDING_PAD_END_X = 460;
const LANDING_PAD_Y = 420;

// Audio Context for Retro Sound Effects
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play Retro Synth Sound
function playSound(type) {
  if (!audioCtx) return;
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;

  if (type === 'thrust') {
    // Continuous rumble (handled in game loop, but let's do a simple short hum for now or LFO)
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now); // Low A hum
    
    // Filter to make it muffled rumble
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, now);

    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

  } else if (type === 'crash') {
    // Explosion: Noise + Lowpass pitch sweep
    const bufferSize = audioCtx.sampleRate * 1.5; // 1.5 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill buffer with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(10, now + 1.2);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + 1.2);

  } else if (type === 'landing') {
    // Victory arpeggio (Happy 8-bit sound)
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + index * 0.1);
      
      gainNode.gain.setValueAtTime(0.05, now + index * 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.15);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.2);
    });
  }
}

// Input Handlers
window.addEventListener('keydown', (e) => {
  if (gameState !== 'PLAYING') {
    if (e.key === 'Enter') {
      initAudio();
      resetGame();
      gameState = 'PLAYING';
      overlayScreen.classList.add('hidden');
    }
    return;
  }

  if (e.key === 'ArrowUp' || e.key === ' ') {
    lander.thrusting = true;
  }
  if (e.key === 'ArrowLeft') {
    lander.rotateLeft = true;
  }
  if (e.key === 'ArrowRight') {
    lander.rotateRight = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === ' ') {
    lander.thrusting = false;
  }
  if (e.key === 'ArrowLeft') {
    lander.rotateLeft = false;
  }
  if (e.key === 'ArrowRight') {
    lander.rotateRight = false;
  }
});

function resetGame() {
  lander.x = 100 + Math.random() * 100;
  lander.y = 50;
  lander.vx = 1.0 + Math.random() * 1.0;
  lander.vy = 0;
  lander.angle = 0;
  lander.thrusting = false;
  lander.rotateLeft = false;
  lander.rotateRight = false;
  
  fuel = 1000;
  updateUI();
}

// Get terrain Y height at specific X coordinate
function getTerrainHeight(x) {
  // Edge cases
  if (x <= terrainPoints[0].x) return terrainPoints[0].y;
  if (x >= terrainPoints[terrainPoints.length - 1].x) {
    return terrainPoints[terrainPoints.length - 1].y;
  }

  // Find the segment containing X
  for (let i = 0; i < terrainPoints.length - 1; i++) {
    const p1 = terrainPoints[i];
    const p2 = terrainPoints[i + 1];
    
    if (x >= p1.x && x <= p2.x) {
      // Linear interpolation formula
      const ratio = (x - p1.x) / (p2.x - p1.x);
      return p1.y + ratio * (p2.y - p1.y);
    }
  }
  return 500; // default fallback
}

// Update game physics and check collisions
function update() {
  if (gameState !== 'PLAYING') return;

  // 1. Apply Rotation
  if (lander.rotateLeft) {
    lander.angle -= ROTATION_SPEED;
  }
  if (lander.rotateRight) {
    lander.angle += ROTATION_SPEED;
  }

  // 2. Apply Thrust
  if (lander.thrusting && fuel > 0) {
    // Thrust vectoring (Angle 0 is straight up, rotating clockwise makes angle positive)
    lander.vx += THRUST * Math.sin(lander.angle);
    lander.vy -= THRUST * Math.cos(lander.angle);
    fuel -= 2; // Consume fuel
    if (fuel < 0) fuel = 0;
    playSound('thrust');
  }

  // 3. Apply Gravity
  lander.vy += GRAVITY;

  // 4. Update Position
  lander.x += lander.vx;
  lander.y += lander.vy;

  // Wrap X position or block borders
  if (lander.x < 0) {
    lander.x = 0;
    lander.vx = 0;
  } else if (lander.x > canvas.width) {
    lander.x = canvas.width;
    lander.vx = 0;
  }

  // 5. Collision Check (Check if bottom of lander hits terrain)
  const landerBottomY = lander.y + lander.height / 2;
  const terrainHeightAtLander = getTerrainHeight(lander.x);

  if (landerBottomY >= terrainHeightAtLander) {
    // Collision detected! Snap to terrain.
    lander.y = terrainHeightAtLander - lander.height / 2;
    handleCollision();
  }

  updateUI();
}

function handleCollision() {
  // Check if landing on the landing pad
  const onPad = lander.x >= LANDING_PAD_START_X && lander.x <= LANDING_PAD_END_X;
  
  // Safe criteria checks
  const safeVSpeed = lander.vy <= MAX_SAFE_V_SPEED;
  const safeHSpeed = Math.abs(lander.vx) <= MAX_SAFE_H_SPEED;
  const safeAngle = Math.abs(lander.angle) <= MAX_SAFE_ANGLE;

  if (onPad && safeVSpeed && safeHSpeed && safeAngle) {
    // Safe landing!
    gameState = 'GAMEOVER';
    playSound('landing');
    showGameOver(true);
    
    // Score calculation (Remaining fuel + points for landing)
    const points = 1000 + Math.floor(fuel);
    score += points;
    scoreVal.textContent = String(score).padStart(4, '0');
  } else {
    // Crash!
    gameState = 'GAMEOVER';
    playSound('crash');
    showGameOver(false, onPad, safeVSpeed, safeHSpeed, safeAngle);
  }
}

function showGameOver(success, onPad, safeVSpeed, safeHSpeed, safeAngle) {
  overlayScreen.classList.remove('hidden');
  startScreen.classList.add('hidden');
  gameoverScreen.classList.remove('hidden');

  if (success) {
    gameoverTitle.textContent = "LANDING SUCCESSFUL";
    gameoverTitle.style.color = "var(--neon-green)";
    gameoverTitle.style.textShadow = "0 0 10px var(--neon-green)";
    gameoverMsg.textContent = `BONUS POINTS AWARDED! FUEL LEFT: ${fuel}L`;
  } else {
    gameoverTitle.textContent = "CRITICAL FAILURE";
    gameoverTitle.style.color = "var(--neon-pink)";
    gameoverTitle.style.textShadow = "0 0 10px var(--neon-pink)";

    // Detail why they crashed
    let reason = "CRASHED ON TERRAIN";
    if (onPad) {
      if (!safeAngle) reason = "CRASHED: BAD LANDING ANGLE";
      else if (!safeVSpeed) reason = "CRASHED: IMPACT VELOCITY TOO HIGH";
      else if (!safeHSpeed) reason = "CRASHED: DRIFTING TOO FAST";
    }
    gameoverMsg.textContent = reason;
  }
}

function updateUI() {
  fuelVal.textContent = Math.floor(fuel);
  hSpeedVal.textContent = lander.vx.toFixed(1);
  vSpeedVal.textContent = lander.vy.toFixed(1);
  
  // Format angle in degrees, negative or positive
  const degrees = Math.round(lander.angle * (180 / Math.PI));
  angleVal.textContent = degrees;

  // Add flashing red warnings for high speeds when descending
  if (lander.vy > MAX_SAFE_V_SPEED) {
    vSpeedVal.style.color = 'var(--neon-pink)';
  } else {
    vSpeedVal.style.color = '#fff';
  }

  if (Math.abs(lander.vx) > MAX_SAFE_H_SPEED) {
    hSpeedVal.style.color = 'var(--neon-pink)';
  } else {
    hSpeedVal.style.color = '#fff';
  }

  if (Math.abs(lander.angle) > MAX_SAFE_ANGLE) {
    angleVal.style.color = 'var(--neon-pink)';
  } else {
    angleVal.style.color = '#fff';
  }
}

// Drawing Functions
function draw() {
  // Clear with a translucent fade to get vector glow trails if we want,
  // but for clean retro vector lines we just clear the screen.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw Terrain
  ctx.beginPath();
  ctx.moveTo(terrainPoints[0].x, terrainPoints[0].y);
  for (let i = 1; i < terrainPoints.length; i++) {
    ctx.lineTo(terrainPoints[i].x, terrainPoints[i].y);
  }
  ctx.strokeStyle = '#00ff66'; // Glowing Vector Green
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00ff66';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset shadow

  // 2. Draw Landing Pad (flashing vector cyan)
  ctx.beginPath();
  ctx.moveTo(LANDING_PAD_START_X, LANDING_PAD_Y);
  ctx.lineTo(LANDING_PAD_END_X, LANDING_PAD_Y);
  
  const flash = Math.floor(Date.now() / 200) % 2 === 0;
  ctx.strokeStyle = flash ? '#00f3ff' : '#007788';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00f3ff';
  ctx.shadowBlur = flash ? 15 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset

  // 3. Draw Lander
  if (gameState === 'PLAYING') {
    drawLander();
  } else if (gameState === 'GAMEOVER' && gameoverTitle.textContent === "LANDING SUCCESSFUL") {
    drawLander(); // Draw it landed
  }
}

function drawLander() {
  ctx.save();
  
  // Translate to lander center
  ctx.translate(lander.x, lander.y);
  ctx.rotate(lander.angle);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  
  // Draw capsule body (classic vector shape)
  ctx.beginPath();
  // Capsule top
  ctx.moveTo(-10, -5);
  ctx.lineTo(0, -15);
  ctx.lineTo(10, -5);
  // Capsule sides
  ctx.lineTo(10, 5);
  ctx.lineTo(-10, 5);
  ctx.closePath();
  ctx.stroke();

  // Draw Landing Legs
  ctx.beginPath();
  // Left leg
  ctx.moveTo(-10, 5);
  ctx.lineTo(-15, 12);
  ctx.moveTo(-18, 12);
  ctx.lineTo(-12, 12); // foot pad
  // Right leg
  ctx.moveTo(10, 5);
  ctx.lineTo(15, 12);
  ctx.moveTo(12, 12);
  ctx.lineTo(18, 12); // foot pad
  ctx.stroke();

  // Draw Thruster engine bell
  ctx.beginPath();
  ctx.moveTo(-4, 5);
  ctx.lineTo(-6, 9);
  ctx.lineTo(6, 9);
  ctx.lineTo(4, 5);
  ctx.closePath();
  ctx.stroke();

  // Draw Thrust Flame
  if (lander.thrusting && fuel > 0) {
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    // Dynamic flickering flame length
    const flameLength = 12 + Math.random() * 8;
    ctx.lineTo(0, 10 + flameLength);
    ctx.lineTo(4, 10);
    ctx.strokeStyle = '#ff007f'; // Hot pink thrust flame
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 12;
    ctx.stroke();
  }

  ctx.restore();
}

// Core Game Loop
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Start Game Loop
loop();
