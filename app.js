// COCO-SSD class name -> label shown on screen
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
  'wine glass': 'wine glass',
  'clock': 'clock',
  'vase': 'vase',
};

// Minimum confidence. The remote is small, so we ask less of it.
const MIN_SCORE = 0.5;
const MIN_SCORE_REMOTE = 0.3;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
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
  // Ask for up to 20 objects with at least 0.3 confidence
  const detections = await model.detect(video, 20, 0.3);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const objects = detections.filter(d =>
    d.class in LIVING_ROOM_OBJECTS &&
    d.score >= (d.class === 'remote' ? MIN_SCORE_REMOTE : MIN_SCORE));

  for (const d of objects) {
    const label = LIVING_ROOM_OBJECTS[d.class];
    drawBox(d.bbox, `${label} ${Math.round(d.score * 100)}%`, '#00e676');
  }
  requestAnimationFrame(detectLoop);
}

start();