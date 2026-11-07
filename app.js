const video = document.getElementById('video');
const info = document.getElementById('info');

let model;

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);

    info.textContent = 'Loading model...';
    model = await cocoSsd.load();
    info.textContent = '';
    detectLoop();
  } catch (error) {
    info.textContent = 'Error: ' + error.message;
  }
}

// Runs the model on every frame
async function detectLoop() {
  const detections = await model.detect(video);
  console.log(detections);
  requestAnimationFrame(detectLoop);
}

start();