// Objetos del salón que nos interesa detectar y sus nombres para mostrarlos
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
  'vase': 'vase'
};

const DRINKS = ['cup', 'wine glass', 'bottle'];

// Umbrales de confianza. El mando tiene uno menor porque es más difícil de detectar
const MIN_SCORE = 0.5;
const MIN_SCORE_REMOTE = 0.3;
const NEAR_FACTOR = 0.5;

// Confirmamos el mando si aparece en al menos 6 de los últimos 8 fotogramas (Just. en memoria)
const MIN_REMOTE_DETECTIONS = 6;
const REMOTE_HISTORY_SIZE = 8;
const REMOTE_LOST_MS = 60 * 1000;

// Tiempos de presencia y ausencia para gestionar el recordatorio de descanso
const BREAK_REMINDER_MS = 30 * 1000;
const PERSON_ABSENT_MS = 10 * 1000;

// Aumenta la resolución interna del canvas para dibujar con mayor nitidez
const CANVAS_SCALE = 2;

const webcamEl = document.querySelector("#video");
const btnEnableWebcam = document.querySelector("#btnEnableWebcam");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");
const alertsDiv = document.querySelector("#alerts");
const outputMessageEl = document.querySelector("#outputMessage");
const cameraTimerEl = document.querySelector("#cameraTimer");

let webcam;
let model;

// Guardamos las detecciones recientes y la última posición fiable del mando
let remoteHistory = [];
let lastRemote = null;

// Conservamos el inicio de la presencia y la última vez que vimos a alguien
let presenceSince = null;
let lastPersonSeen = null;

let frameCount = 0;
let lastFpsTime = 0;

function getUserMediaSupported() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function initTFJS() {
  if (typeof tf === "undefined") {
    throw new Error("TensorFlow.js not loaded");
  }
}

// Para dibujar la caja y su etiqueta. El trazo discontinuo es para posiciones antiguas
function drawBox(box, text, color, dashed = false) {
  const [x, y, width, height] = box;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.strokeRect(x, y, width, height);

  ctx.font = "15px sans-serif";
  ctx.fillText(text, x + 4, y > 18 ? y - 6 : y + 18);
  ctx.setLineDash([]);
}

function showAlerts(messages) {
  alertsDiv.innerHTML = messages.map(m => `<div class="alert">${m}</div>`).join("");
}

// Calcula la distancia mínima entre dos cajas, devolviendo 0 si se solapan
function boxDistance(a, b) {
  const dx = Math.max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]), 0);
  const dy = Math.max(a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]), 0);
  return Math.hypot(dx, dy);
}

function isDrinkNearLaptop(objects) {
  const laptops = objects.filter(d => d.class === "laptop");
  const drinks = objects.filter(d => DRINKS.includes(d.class));

  // Basta con que una bebida esté cerca de cualquier portátil detectado
  return drinks.some(drink => laptops.some(laptop => {
    // Usamos un umbral relativo al tamaño de la bebida, no una distancia fija
    const limit = NEAR_FACTOR * Math.max(drink.bbox[2], drink.bbox[3]);
    return boxDistance(drink.bbox, laptop.bbox) <= limit;
  }));
}

function trackRemote(objects, personPresent, alerts) {
  const now = Date.now();

  // Si hay varios mandos detectados, nos quedamos con el de mayor confianza
  const remote = objects.filter(d => d.class === "remote").sort((a, b) => b.score - a.score)[0];

  // Ventana deslizante para evitar confirmar detecciones aisladas.
  remoteHistory.push(Boolean(remote));
  if (remoteHistory.length > REMOTE_HISTORY_SIZE) remoteHistory.shift();

  // Solo actualizamos la posición cuando la detección está suficientemente respaldada
  const confirmed = remoteHistory.filter(Boolean).length >= MIN_REMOTE_DETECTIONS;

  if (remote && confirmed) {
    lastRemote = { box: remote.bbox, time: now };
  }

  if (lastRemote && personPresent && now - lastRemote.time > REMOTE_LOST_MS) {
    const minutes = Math.round((now - lastRemote.time) / 60000);
    alerts.push(`El mando se vio por última vez hace ${minutes} minutos`);
    drawBox(lastRemote.box, "last known remote position", "#ffb300", true);
  }
}

function remindBreak(personPresent, alerts) {
  const now = Date.now();

  if (lastPersonSeen !== null && now - lastPersonSeen >= PERSON_ABSENT_MS) {
    presenceSince = null;
    lastPersonSeen = null;
  }

  if (personPresent) {
    if (presenceSince === null) presenceSince = now;
    lastPersonSeen = now;
  }

  if (presenceSince !== null && now - presenceSince >= BREAK_REMINDER_MS) {
    alerts.push("Presencia prolongada en el salón. Considera hacer una pausa.");
  }
}

// Proporcionada en el ejemplo de COCO-SSD
async function app() {
  // Check for webcam support before proceeding
  if (!getUserMediaSupported()) {
    console.warn("getUserMedia() is not supported by your browser");
    outputMessageEl.innerText = "Webcam not supported by your browser.";
    return; // Exit if webcam is not supported
  }

  btnEnableWebcam.addEventListener("click", enableCam);

  await loadCocoSsdModel(); // Load the model if webcam support is confirmed
}

// Proporcionada en el ejemplo de COCO-SSD
async function enableCam(event) {
  if (!model) return;

  event.target.classList.add("removed");
  try {
    webcam = await tf.data.webcam(webcamEl);

    // Contamos el tiempo transcurrido desde que se activa la webcam.
    const startTime = Date.now();

    setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(seconds / 60);

      cameraTimerEl.innerText =
        `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);

    outputMessageEl.innerText = "Webcam activada! Detectando objetos...";
    lastFpsTime = performance.now();
    await predictWebcam();
  } catch (error) {
    console.error("Webcam access failed:", error);
    outputMessageEl.innerText = "Acceso a la webcam denegado.";
  }
}

// Proporcionada en el ejemplo de COCO-SSD
async function loadCocoSsdModel() {
  model = await cocoSsd.load();
  btnEnableWebcam.disabled = false;
  outputMessageEl.innerText = "Modelo cargado! Activa la webcam para comenzar la detección";
}

async function predictWebcam() {
  while (true) {
    // Capturamos un fotograma y ejecutamos COCO-SSD con un umbral inicial de 0.3
    const frame = await webcam.capture();
    const predictions = await model.detect(frame, 20, 0.3);

    // Ajustamos el canvas solo si cambia la resolución de la cámara
    if (canvas.width !== webcamEl.videoWidth * CANVAS_SCALE || canvas.height !== webcamEl.videoHeight * CANVAS_SCALE) {
      canvas.width = webcamEl.videoWidth * CANVAS_SCALE;
      canvas.height = webcamEl.videoHeight * CANVAS_SCALE;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    }

    /// Limpiamos las anotaciones anteriores para no acumular cajas entre fotogramas
    ctx.clearRect(0, 0, webcamEl.videoWidth, webcamEl.videoHeight);

    // Filtramos las clases de interés aplicando el umbral específico del mando
    const objects = predictions.filter(d => d.class in LIVING_ROOM_OBJECTS && d.score >= (d.class === "remote" ? MIN_SCORE_REMOTE : MIN_SCORE));

    // Mostramos cada objeto junto con su porcentaje de confianza
    for (let n = 0; n < objects.length; n++) {
      const label = LIVING_ROOM_OBJECTS[objects[n].class];
      const score = Math.round(objects[n].score * 100);
      drawBox(objects[n].bbox, `${label} ${score}%`, "#00BFFF");
    }

    // La presencia se calcula sobre todas las predicciones, no solo las del salón.
    const personPresent = predictions.some(d => d.class === "person" && d.score >= MIN_SCORE);

    const alerts = [];

    // Evaluamos las reglas de forma independiente sobre el mismo fotograma.
    trackRemote(objects, personPresent, alerts);

    if (isDrinkNearLaptop(objects)) {
      alerts.push("Cuidado: tienes una bebida muy cerca del portátil.");
    }

    remindBreak(personPresent, alerts);
    showAlerts(alerts);

     // Actualizamos los FPS una vez por segundo
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsTime;

    if (elapsed >= 1000) {
      const fps = frameCount * 1000 / elapsed;
      outputMessageEl.innerText = `Backend: ${tf.getBackend()} | FPS: ${fps.toFixed(1)}`;
      frameCount = 0;
      lastFpsTime = now;
    }

    frame.dispose();
    await tf.nextFrame();
  }
}

// Proporcionada en el ejemplo de COCO-SSD
(async function initApp() {
  try {
    initTFJS();
    await app();
  } catch (error) {
    console.error(error);
    outputMessageEl.innerText = error.message;
  }
})();
