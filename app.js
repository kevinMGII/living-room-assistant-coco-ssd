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

    // The canvas must have the same size as the video frames
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
  const detections = await model.detect(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const d of detections) {
    drawBox(d.bbox, `${d.class} ${Math.round(d.score * 100)}%`, '#00e676');
  }
  requestAnimationFrame(detectLoop);
}

start();