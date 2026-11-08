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

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const alertsDiv = document.getElementById('alerts');
const info = document.getElementById('info');

let model;

function drawBox(box, text, color) {
  const [x, y, width, height] = box;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
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

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    info.textContent = 'Loading model...';
    model = await cocoSsd.load();
    info.textContent = '';
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

  const alerts = [];
  if (isDrinkNearLaptop(objects)) {
    alerts.push('Cuidado: tienes una bebida muy cerca del portátil.');
  }
  showAlerts(alerts);

  requestAnimationFrame(detectLoop);
}

start();