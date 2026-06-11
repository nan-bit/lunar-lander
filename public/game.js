const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const GRAVITY = 0.04;
const THRUST = 0.12;
const ROTATION_SPEED = 0.06;
const MAX_SAFE_V_SPEED = 1.2;
const MAX_SAFE_H_SPEED = 0.6;
const MAX_SAFE_ANGLE = 0.15; // Radians (~8.5 degrees)

// Tether & Physics constants
const TETHER_LENGTH = 70;
const SPRING_K = 0.03;      // Spring stiffness
const CARGO_MASS = 0.5;      // Impact on lander weight (ratio)
const CARGO_GRAVITY = 0.03;  // Slightly lighter gravity for cargo

// UI elements
const scoreVal = document.getElementById('score-val');
const fuelVal = document.getElementById('fuel-val');
const hSpeedVal = document.getElementById('h-speed-val');
const vSpeedVal = document.getElementById('v-speed-val');
const angleVal = document.getElementById('angle-val');
const cargoVal = document.getElementById('cargo-val');
const stressVal = document.getElementById('stress-val');
const windVal = document.getElementById('wind-val');
const windDirArrow = document.getElementById('wind-dir-arrow');
const crtOverlay = document.getElementById('crt-overlay');

const overlayScreen = document.getElementById('overlay-screen');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMsg = document.getElementById('gameover-msg');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let fuel = 1000;
let windX = 0;
let targetWindX = 0;
let windTimer = 0;
let stress = 0;
let particles = [];

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

// Cargo State
let cargo = {
  x: 650,
  y: 0, // Will be snapped to terrain height
  vx: 0,
  vy: 0,
  width: 12,
  height: 12,
  attached: false,
  secured: false
};

// Camera State (viewport)
let camera = {
  x: 0,
  y: 0,
  zoom: 1,
  targetZoom: 1
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

// Parallax Background Mountains (Distant, dark outlines)
const parallaxPoints = [
  { x: 0, y: 380 },
  { x: 180, y: 280 },
  { x: 340, y: 350 },
  { x: 480, y: 250 },
  { x: 650, y: 370 },
  { x: 800, y: 300 }
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

// Particle Class for Vector FX
class Particle {
  constructor(x, y, vx, vy, color, size = 2, decay = 0.02, type = 'exhaust') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.alpha = 1;
    this.decay = decay;
    this.type = type;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    // Custom behaviors
    if (this.type === 'debris') {
      this.vy += 0.03; // Debris feels gravity
    } else if (this.type === 'dust') {
      this.vx *= 0.98; // Dust experiences high air resistance
      this.vy *= 0.98;
    }

    this.alpha -= this.decay;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.type === 'exhaust' ? 8 : 2;
    ctx.lineWidth = 1;

    ctx.beginPath();
    if (this.type === 'debris') {
      ctx.rect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    } else {
      ctx.moveTo(this.x - this.size, this.y);
      ctx.lineTo(this.x + this.size, this.y);
      ctx.moveTo(this.x, this.y - this.size);
      ctx.lineTo(this.x, this.y + this.size);
    }
    ctx.stroke();
    ctx.restore();
  }
}

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

  // Reset Cargo (X=650, snapped to terrain y)
  cargo.x = 650;
  cargo.y = getTerrainHeight(650) - cargo.height / 2;
  cargo.vx = 0;
  cargo.vy = 0;
  cargo.attached = false;
  cargo.secured = false;

  // Reset Wind
  windX = 0;
  targetWindX = (Math.random() * 2 - 1) * 0.04; // Limit wind force
  windTimer = 0;

  // Reset Stress
  stress = 0;
  crtOverlay.classList.remove('glitch-active');

  // Reset Particles
  particles = [];

  // Reset Camera
  camera.x = 0;
  camera.y = 0;
  camera.zoom = 1;
  camera.targetZoom = 1;

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

// Spawn exhaust sparks from thruster
function spawnExhaust() {
  const angle = lander.angle;
  // Position sparks at the engine nozzle (bell) bottom
  const nozzleX = lander.x + 8 * Math.sin(angle);
  const nozzleY = lander.y + 8 * Math.cos(angle);

  // Direct exhaust vector backwards with spread
  const spread = 0.4;
  const speed = 2 + Math.random() * 2;
  const vx = lander.vx - speed * Math.sin(angle) + (Math.random() * 2 - 1) * spread;
  const vy = lander.vy + speed * Math.cos(angle) + (Math.random() * 2 - 1) * spread;

  particles.push(new Particle(nozzleX, nozzleY, vx, vy, '#ff007f', 1.5, 0.04, 'exhaust'));
}

// Spawn ground dust if thruster is close
function spawnDust(groundY) {
  const dustX = lander.x + (Math.random() * 20 - 10);
  const vx = (Math.random() * 3 - 1.5) + lander.vx * 0.5;
  const vy = -(Math.random() * 1.5 + 0.5); // shoot upwards/sideways
  particles.push(new Particle(dustX, groundY, vx, vy, '#00ff66', 1.5, 0.03, 'dust'));
}

// Trigger massive ship explosion
function triggerExplosion() {
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    const vx = Math.sin(angle) * speed;
    const vy = Math.cos(angle) * speed - 1; // drift upwards
    const size = 2 + Math.random() * 4;
    const decay = 0.01 + Math.random() * 0.01;
    particles.push(new Particle(lander.x, lander.y, vx, vy, '#ff0055', size, decay, 'debris'));
  }
}

// Update game physics and check collisions
function update() {
  if (gameState !== 'PLAYING') {
    // If not playing, still update particles and camera slowly
    particles.forEach(p => p.update());
    particles = particles.filter(p => p.alpha > 0);
    return;
  }

  // 1. Update Wind (change target every 300 frames)
  windTimer++;
  if (windTimer > 300) {
    targetWindX = (Math.random() * 2 - 1) * 0.04;
    windTimer = 0;
  }
  windX += (targetWindX - windX) * 0.005; // Smooth wind drift
  lander.vx += windX;

  // 2. Apply Rotation
  if (lander.rotateLeft) {
    lander.angle -= ROTATION_SPEED;
  }
  if (lander.rotateRight) {
    lander.angle += ROTATION_SPEED;
  }

  // 3. Apply Thrust
  if (lander.thrusting && fuel > 0) {
    lander.vx += THRUST * Math.sin(lander.angle);
    lander.vy -= THRUST * Math.cos(lander.angle);
    fuel -= 2;
    if (fuel < 0) fuel = 0;
    
    playSound('thrust');
    spawnExhaust();
  }

  // 4. Ground Dust check
  const terrainHeightAtLander = getTerrainHeight(lander.x);
  const distToGround = terrainHeightAtLander - (lander.y + 12);
  if (lander.thrusting && fuel > 0 && distToGround < 40) {
    spawnDust(terrainHeightAtLander);
  }

  // 5. Apply Gravity to Lander
  lander.vy += GRAVITY;

  // 6. Tether Spring Physics (Lander <-> Cargo)
  if (cargo.attached && !cargo.secured) {
    const dx = cargo.x - lander.x;
    const dy = cargo.y - lander.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > TETHER_LENGTH) {
      const stretch = dist - TETHER_LENGTH;
      const forceX = (dx / dist) * stretch * SPRING_K;
      const forceY = (dy / dist) * stretch * SPRING_K;
      
      // Pull cargo
      cargo.vx -= forceX;
      cargo.vy -= forceY;
      
      // Pull lander (opposing force modified by mass ratio)
      lander.vx += forceX * CARGO_MASS;
      lander.vy += forceY * CARGO_MASS;
    }
  }

  // 7. Update Lander Position
  lander.x += lander.vx;
  lander.y += lander.vy;

  // Border constraints for Lander
  if (lander.x < 10) {
    lander.x = 10;
    lander.vx = 0;
  } else if (lander.x > canvas.width - 10) {
    lander.x = canvas.width - 10;
    lander.vx = 0;
  }

  // 8. Update Cargo position
  if (cargo.attached) {
    cargo.vy += CARGO_GRAVITY;
    cargo.x += cargo.vx;
    cargo.y += cargo.vy;

    // Cargo terrain collision
    const cargoBottomY = cargo.y + cargo.height / 2;
    const cargoTerrainY = getTerrainHeight(cargo.x);
    if (cargoBottomY >= cargoTerrainY) {
      cargo.y = cargoTerrainY - cargo.height / 2;
      cargo.vy = 0;
      cargo.vx *= 0.6; // friction
    }
  } else {
    // Keep cargo resting on terrain
    cargo.y = getTerrainHeight(cargo.x) - cargo.height / 2;
  }

  // 9. Check Cargo Attachment Trigger
  if (!cargo.attached) {
    const dx = lander.x - cargo.x;
    const dy = (lander.y + 12) - cargo.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Attach if close and speed is relatively low
    if (dist < 45 && Math.abs(lander.vx) < 1.0 && Math.abs(lander.vy) < 1.0) {
      cargo.attached = true;
      cargo.vx = lander.vx;
      cargo.vy = lander.vy;
    }
  }

  // 10. Update Particles
  particles.forEach(p => p.update());
  particles = particles.filter(p => p.alpha > 0);

  // 11. Collision Check (Lander hits terrain)
  const landerBottomY = lander.y + lander.height / 2;
  if (landerBottomY >= terrainHeightAtLander) {
    lander.y = terrainHeightAtLander - lander.height / 2;
    handleCollision();
  }

  // 12. Camera Viewport calculations
  if (lander.y > 300) {
    camera.targetZoom = 1.5; // Zoom in for landing
  } else if (!cargo.attached && Math.abs(lander.x - cargo.x) < 150) {
    camera.targetZoom = 1.3; // Zoom in slightly when near cargo
  } else {
    camera.targetZoom = 1.0; // Standard view
  }
  camera.zoom += (camera.targetZoom - camera.zoom) * 0.03; // Lerp zoom

  const targetCamX = lander.x - (canvas.width / 2) / camera.zoom;
  const targetCamY = lander.y - (canvas.height * 0.6) / camera.zoom; // Offset camera slightly down

  camera.x += (targetCamX - camera.x) * 0.05;
  camera.y += (targetCamY - camera.y) * 0.05;

  // Constrain Camera to logical canvas bounds
  const minCamX = 0;
  const maxCamX = canvas.width - canvas.width / camera.zoom;
  const minCamY = 0;
  const maxCamY = canvas.height - canvas.height / camera.zoom;

  camera.x = Math.max(minCamX, Math.min(camera.x, maxCamX));
  camera.y = Math.max(minCamY, Math.min(camera.y, maxCamY));

  // 13. Pilot Stress Calculations
  let targetStress = 0;
  if (lander.vy > MAX_SAFE_V_SPEED && lander.vy > 0) {
    targetStress += 35; // high vertical descent
  }
  if (Math.abs(lander.vx) > MAX_SAFE_H_SPEED) {
    targetStress += 20; // high horizontal drift
  }
  if (distToGround < 60 && !(lander.x >= LANDING_PAD_START_X && lander.x <= LANDING_PAD_END_X)) {
    targetStress += 40; // close to mountains
  }
  if (fuel === 0) {
    targetStress += 60; // out of fuel
  }

  stress += (targetStress - stress) * 0.02; // Lerp stress
  stress = Math.max(0, Math.min(100, stress));

  if (stress > 60) {
    crtOverlay.classList.add('glitch-active');
  } else {
    crtOverlay.classList.remove('glitch-active');
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
    if (cargo.attached) {
      // Safe landing with cargo!
      gameState = 'GAMEOVER';
      cargo.secured = true;
      playSound('landing');
      showGameOver(true);
      
      // Score calculation (Remaining fuel + points for landing)
      const points = 1500 + Math.floor(fuel); // More points for securing cargo
      score += points;
      scoreVal.textContent = String(score).padStart(4, '0');
    } else {
      // Landed safely but forgot cargo
      gameState = 'GAMEOVER';
      triggerExplosion();
      playSound('crash');
      showGameOver(false, true, true, true, true, "MISSION FAILED: CARGO NOT RETRIEVED");
    }
  } else {
    // Crash!
    gameState = 'GAMEOVER';
    triggerExplosion();
    playSound('crash');
    showGameOver(false, onPad, safeVSpeed, safeHSpeed, safeAngle);
  }
}

function showGameOver(success, onPad, safeVSpeed, safeHSpeed, safeAngle, customMsg = null) {
  overlayScreen.classList.remove('hidden');
  startScreen.classList.add('hidden');
  gameoverScreen.classList.remove('hidden');

  if (success) {
    gameoverTitle.textContent = "MISSION ACCOMPLISHED";
    gameoverTitle.style.color = "var(--neon-green)";
    gameoverTitle.style.textShadow = "0 0 10px var(--neon-green)";
    gameoverMsg.textContent = `CARGO SECURED. BONUS POINTS AWARDED! FUEL LEFT: ${fuel}L`;
  } else {
    gameoverTitle.textContent = "CRITICAL FAILURE";
    gameoverTitle.style.color = "var(--neon-pink)";
    gameoverTitle.style.textShadow = "0 0 10px var(--neon-pink)";

    if (customMsg) {
      gameoverMsg.textContent = customMsg;
    } else {
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
}

function updateUI() {
  fuelVal.textContent = Math.floor(fuel);
  hSpeedVal.textContent = lander.vx.toFixed(1);
  vSpeedVal.textContent = lander.vy.toFixed(1);
  
  // Format angle in degrees, negative or positive
  const degrees = Math.round(lander.angle * (180 / Math.PI));
  angleVal.textContent = degrees;

  // 1. Cargo Display
  if (cargo.secured) {
    cargoVal.textContent = "SECURED";
    cargoVal.style.color = "var(--neon-green)";
  } else if (cargo.attached) {
    cargoVal.textContent = "ATTACHED";
    cargoVal.style.color = "var(--neon-cyan)";
  } else {
    cargoVal.textContent = "SEARCHING";
    cargoVal.style.color = "#fff";
  }

  // 2. Stress Display
  const roundedStress = Math.round(stress);
  stressVal.textContent = roundedStress;
  if (roundedStress > 60) {
    stressVal.classList.add('stress-high');
  } else {
    stressVal.classList.remove('stress-high');
  }

  // 3. Wind Display
  // Scale factor to make decimal wind units look like an windspeed in knots/mph (e.g. max ~40 units)
  const displayWind = Math.abs(windX * 500).toFixed(0);
  windVal.textContent = displayWind;
  
  // Point wind arrow: positive drifts right (pointing right), negative drifts left (pointing left)
  // Arrow default is left ◀. So rotate 180deg to point right ▶.
  windDirArrow.style.transform = windX >= 0 ? 'rotate(180deg)' : 'rotate(0deg)';
  windDirArrow.style.color = Math.abs(windX) > 0.02 ? 'var(--neon-pink)' : '#fff';

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply Camera Zoom & Panning viewport transformation
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // 1. Draw Parallax Background Mountains (slower camera tracking)
  ctx.save();
  // We translate the background at a fraction of the foreground camera movement
  ctx.translate(camera.x * 0.7, camera.y * 0.7); 
  ctx.beginPath();
  ctx.moveTo(parallaxPoints[0].x, parallaxPoints[0].y);
  for (let i = 1; i < parallaxPoints.length; i++) {
    ctx.lineTo(parallaxPoints[i].x, parallaxPoints[i].y);
  }
  ctx.strokeStyle = '#002611'; // Dark faint green
  ctx.lineWidth = 2;
  ctx.shadowColor = '#002611';
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 2. Draw Foreground Terrain
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
  ctx.shadowBlur = 0; // Reset

  // 3. Draw Landing Pad (flashing vector cyan)
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

  // 4. Draw Tether Cable (Dashed Cyan spring line)
  if (cargo.attached && !cargo.secured) {
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(lander.x, lander.y + 12);
    ctx.lineTo(cargo.x, cargo.y);
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]); // reset dash
    ctx.shadowBlur = 0;
  }

  // 5. Draw Cargo Capsule
  if (!cargo.secured) {
    ctx.save();
    ctx.translate(cargo.x, cargo.y);
    ctx.strokeStyle = cargo.attached ? '#00f3ff' : '#ffffff';
    ctx.shadowColor = cargo.attached ? '#00f3ff' : '#ffffff';
    ctx.shadowBlur = cargo.attached ? 10 : 4;
    ctx.lineWidth = 2;

    // Draw box with X inside
    ctx.strokeRect(-cargo.width/2, -cargo.height/2, cargo.width, cargo.height);
    ctx.beginPath();
    ctx.moveTo(-cargo.width/2, -cargo.height/2);
    ctx.lineTo(cargo.width/2, cargo.height/2);
    ctx.moveTo(cargo.width/2, -cargo.height/2);
    ctx.lineTo(-cargo.width/2, cargo.height/2);
    ctx.stroke();
    ctx.restore();
  }

  // 6. Draw Particles
  particles.forEach(p => p.draw());

  // 7. Draw Lander
  if (gameState === 'PLAYING') {
    drawLander();
  } else if (gameState === 'GAMEOVER' && (gameoverTitle.textContent === "MISSION ACCOMPLISHED" || cargo.secured)) {
    drawLander(); // Draw it landed
  }

  ctx.restore(); // Restore camera transformation so HUD elements draw correctly in screen space
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
