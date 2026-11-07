const video = document.getElementById('video');

// Request access to the camera and show it in the video element
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (error) {
    info.textContent = 'Error accessing camera: ' + error.message;
  }
}

startCamera();
