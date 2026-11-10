const LIVING_ROOM_OBJECTS = {
  'tv': 'tv',
  'couch': 'sofa',
  'remote': 'remote',
  'chair': 'chair',
  'dining table': 'table',
  'potted plant': 'plant',
  'laptop': 'laptop',
  'mouse': 'mouse',
  'keyboard': 'keyboard',
  'cell phone': 'phone',
  'book': 'book',
  'cup': 'cup',
  'bottle': 'bottle',
  'wine glass': 'wine glass',
  'clock': 'clock',
  'vase': 'vase',
};
const DRINKS = ['cup', 'wine glass', 'bottle'];

const MIN_SCORE = 0.5;
const MIN_SCORE_REMOTE = 0.3;

// A drink is "near" if the gap between boxes is at most 50% of its longest side.
// It is relative to the drink size, so it works whether the camera is close or far.
const NEAR_FACTOR = 0.5;

// The remote counts as "seen" if it shows up in K of the last N frames.
// This filters out one-frame false positives.
const K = 3;
const N = 10;
const REMOTE_LOST_MS = 60 * 1000; // 1 minute without seeing it = lost

const BREAK_REMINDER_MS = 30 * 60 * 1000; // 30 minutes of presence
const PERSON_ABSENT_MS = 10 * 1000; // Ignore brief missed detections

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const alertsDiv = document.getElementById('alerts');
const info = document.getElementById('info');

let model;
let remoteHistory = [];   // true/false for each recent frame
let lastRemote = null;    // { box, time }

let presenceSince = null;
let lastPersonSeen = null;

let frameCount = 0;
let lastFpsTime = 0;

function drawBox(box, text, color, dashed = false) {
  const [x, y, width, height] = box;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.strokeRect(x, y, width, height);
  ctx.font = '16px sans-serif';
  ctx.fillText(text, x + 4, y > 18 ? y - 6 : y + 18);
}

function showAlerts(messages) {
  alertsDiv.innerHTML = messages.map(m => `<div class="alert">${m}</div>`).join('');
}

// Distance between two boxes [x, y, width, height]. It is 0 if they overlap.
function boxDistance(a, b) {
  const dx = Math.max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]), 0);
  const dy = Math.max(a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]), 0);
  return Math.hypot(dx, dy);
}

function isDrinkNearLaptop(objects) {
  const laptops = objects.filter(d => d.class === 'laptop');
  const drinks = objects.filter(d => DRINKS.includes(d.class));

  return drinks.some(drink => laptops.some(laptop => {
    const limit = NEAR_FACTOR * Math.max(drink.bbox[2], drink.bbox[3]);
    return boxDistance(drink.bbox, laptop.bbox) <= limit;
  }));
}

function trackRemote(objects, personPresent, alerts) {
  const now = Date.now();
  const remote = objects
    .filter(d => d.class === 'remote')
    .sort((a, b) => b.score - a.score)[0];

  remoteHistory.push(Boolean(remote));
  if (remoteHistory.length > N) remoteHistory.shift();
  const confirmed = remoteHistory.filter(Boolean).length >= K;

  if (remote && confirmed) {
    lastRemote = { box: remote.bbox, time: now };
  }

  if (lastRemote && personPresent && now - lastRemote.time > REMOTE_LOST_MS) {
    const minutes = Math.round((now - lastRemote.time) / 60000);
    alerts.push(`El mando se vio por última vez hace ${minutes} minutos`);
    drawBox(lastRemote.box, 'last known remote position', '#ffb300', true);
  }
}

function remindBreak(personPresent, alerts) {
  const now = Date.now();

  // Reset the timer after 10 seconds without detecting anyone.
  if (lastPersonSeen !== null && now - lastPersonSeen >= PERSON_ABSENT_MS) {
    presenceSince = null;
    lastPersonSeen = null;
  }

  // Start the session and update the last detection time.
  if (personPresent) {
    if (presenceSince === null) presenceSince = now;
    lastPersonSeen = now;
  }

  // Show the reminder after 30 minutes of presence.
  if (presenceSince !== null && now - presenceSince >= BREAK_REMINDER_MS) {
    alerts.push('Presencia prolongada en el salón. Considera hacer una pausa.');
  }
}

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    info.textContent = 'Loading model...';
    model = await cocoSsd.load();
    info.textContent = `Backend: ${tf.getBackend()} | FPS: ...`;
    lastFpsTime = performance.now();
    detectLoop();
  } catch (error) {
    info.textContent = 'Error: ' + error.message;
  }
}

async function detectLoop() {
  const detections = await model.detect(video, 20, 0.3);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const objects = detections.filter(d =>
    d.class in LIVING_ROOM_OBJECTS &&
    d.score >= (d.class === 'remote' ? MIN_SCORE_REMOTE : MIN_SCORE));

  for (const d of objects) {
    const label = LIVING_ROOM_OBJECTS[d.class];
    drawBox(d.bbox, `${label} ${Math.round(d.score * 100)}%`, '#00e676');
  }

  // The person is not drawn, we only need to know if someone is there
  const personPresent = detections.some(d => d.class === 'person' && d.score >= MIN_SCORE);

  const alerts = [];
  trackRemote(objects, personPresent, alerts);
  if (isDrinkNearLaptop(objects)) {
    alerts.push('Cuidado: tienes una bebida muy cerca del portátil.');
  }
  remindBreak(personPresent, alerts);
  showAlerts(alerts);

  // Update FPS approximately once per second.
  frameCount++;
  const now = performance.now();
  const elapsed = now - lastFpsTime;

  if (elapsed >= 1000) {
    const fps = frameCount * 1000 / elapsed;
    info.textContent = `Backend: ${tf.getBackend()} | FPS: ${fps.toFixed(1)}`;
    frameCount = 0;
    lastFpsTime = now;
  }

  requestAnimationFrame(detectLoop);
}

start();