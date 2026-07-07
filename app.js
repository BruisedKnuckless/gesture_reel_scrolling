// ============================================
// GESTURE SCROLL — Main Application
// ============================================
// Uses MediaPipe HandLandmarker to track index finger
// and detect scroll-up gestures via MacBook camera.
// ============================================

import { HandLandmarker, FilesetResolver, DrawingUtils } from
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

// ============================================
// DOM ELEMENTS
// ============================================
const webcamEl = document.getElementById("webcam");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const cameraContainer = document.getElementById("cameraContainer");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const gestureFlash = document.getElementById("gestureFlash");
const statusCard = document.getElementById("statusCard");
const statusText = document.getElementById("statusText");
const statusIndicator = document.getElementById("statusIndicator");
const gestureDisplay = document.getElementById("gestureDisplay");
const gestureHistory = document.getElementById("gestureHistory");
const fingerX = document.getElementById("fingerX");
const fingerY = document.getElementById("fingerY");
const fingerDeltaY = document.getElementById("fingerDeltaY");
const sensitivitySlider = document.getElementById("sensitivitySlider");
const sensitivityValue = document.getElementById("sensitivityValue");
const cooldownSlider = document.getElementById("cooldownSlider");
const cooldownValue = document.getElementById("cooldownValue");
const startBtn = document.getElementById("startBtn");
const counterValue = document.getElementById("counterValue");
const scrollCounter = document.getElementById("scrollCounter");

// ============================================
// STATE
// ============================================
let handLandmarker = null;
let isRunning = false;
let animationFrameId = null;
let scrollCount = 0;
let lastGestureTime = 0;

// Finger tracking buffer (stores last N frames of index finger Y position)
const BUFFER_SIZE = 12;
const fingerBuffer = []; // { y: number, timestamp: number }

// Settings
let sensitivity = 5;    // 1-10, maps to Y-delta threshold
let cooldownMs = 1500;   // milliseconds between gestures

// ============================================
// MEDIAPIPE INITIALIZATION
// ============================================
async function initializeHandLandmarker() {
    statusText.textContent = "Loading AI model...";

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    statusText.textContent = "Model loaded — ready";
    console.log("✅ HandLandmarker initialized");
}

// ============================================
// CAMERA
// ============================================
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 960 },
                facingMode: "user"
            },
            audio: false
        });

        webcamEl.srcObject = stream;

        await new Promise((resolve) => {
            webcamEl.onloadedmetadata = () => {
                // Set canvas to match video dimensions
                canvasEl.width = webcamEl.videoWidth;
                canvasEl.height = webcamEl.videoHeight;
                resolve();
            };
        });

        await webcamEl.play();

        // Update UI state
        cameraPlaceholder.classList.add("hidden");
        cameraContainer.classList.add("active");
        statusIndicator.querySelector(".dot").classList.add("active");
        statusIndicator.querySelector(".label").textContent = "Live";
        statusCard.querySelector(".card-icon").textContent = "🟢";
        statusText.textContent = "Tracking active";
        startBtn.classList.add("active");
        startBtn.querySelector(".btn-icon").textContent = "⏹";
        startBtn.childNodes[startBtn.childNodes.length - 1].textContent = " Stop Camera";

        isRunning = true;
        detectFrame();

        console.log("📷 Camera started:", webcamEl.videoWidth, "x", webcamEl.videoHeight);
    } catch (err) {
        console.error("Camera error:", err);
        statusText.textContent = "Camera access denied";
        statusCard.querySelector(".card-icon").textContent = "⚠️";
    }
}

function stopCamera() {
    isRunning = false;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    const stream = webcamEl.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        webcamEl.srcObject = null;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Reset UI
    cameraContainer.classList.remove("active");
    cameraPlaceholder.classList.remove("hidden");
    statusIndicator.querySelector(".dot").classList.remove("active");
    statusIndicator.querySelector(".label").textContent = "Offline";
    statusCard.querySelector(".card-icon").textContent = "🔴";
    statusText.textContent = "Camera inactive";
    startBtn.classList.remove("active");
    startBtn.querySelector(".btn-icon").textContent = "▶";
    startBtn.childNodes[startBtn.childNodes.length - 1].textContent = " Start Camera";

    // Clear finger data
    fingerX.textContent = "—";
    fingerY.textContent = "—";
    fingerDeltaY.textContent = "—";
    fingerBuffer.length = 0;

    console.log("📷 Camera stopped");
}

// ============================================
// FRAME DETECTION LOOP
// ============================================
let lastVideoTime = -1;

function detectFrame() {
    if (!isRunning || !handLandmarker) return;

    const now = performance.now();

    if (webcamEl.currentTime !== lastVideoTime) {
        lastVideoTime = webcamEl.currentTime;

        const results = handLandmarker.detectForVideo(webcamEl, now);

        // Clear canvas
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            drawHand(landmarks);
            trackFinger(landmarks, now);
        } else {
            // No hand detected
            fingerX.textContent = "—";
            fingerY.textContent = "—";
            fingerDeltaY.textContent = "—";
            fingerBuffer.length = 0;

            gestureDisplay.classList.remove("detected");
            gestureDisplay.querySelector(".gesture-label").textContent = "No hand detected";
        }
    }

    animationFrameId = requestAnimationFrame(detectFrame);
}

// ============================================
// HAND DRAWING
// ============================================
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17]             // Palm
];

function drawHand(landmarks) {
    const w = canvasEl.width;
    const h = canvasEl.height;

    // Draw connections
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";

    for (const [start, end] of HAND_CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
    }

    // Draw landmarks
    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * w;
        const y = lm.y * h;

        ctx.beginPath();

        if (i === 8) {
            // Index finger tip — highlight
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
            ctx.fill();

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(x, y, 16, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Other landmarks
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.fill();
        }
    }

    // Draw trail for index finger (from buffer)
    if (fingerBuffer.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        // We need to store x positions too for the trail
        const tipX = landmarks[8].x * w;
        const tipY = landmarks[8].y * h;

        for (let i = 0; i < fingerBuffer.length; i++) {
            const point = fingerBuffer[i];
            const px = (point.x || 0.5) * w;
            const py = point.y * h;

            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// ============================================
// FINGER TRACKING & GESTURE DETECTION
// ============================================
function trackFinger(landmarks, timestamp) {
    const indexTip = landmarks[8]; // Index finger tip
    const indexPIP = landmarks[6]; // Index PIP (proximal interphalangeal)
    const indexMCP = landmarks[5]; // Index MCP (knuckle)

    // Update position display
    fingerX.textContent = (indexTip.x * 100).toFixed(1) + "%";
    fingerY.textContent = (indexTip.y * 100).toFixed(1) + "%";

    // Add to buffer
    fingerBuffer.push({
        x: indexTip.x,
        y: indexTip.y,
        timestamp: timestamp
    });

    // Keep buffer sized
    while (fingerBuffer.length > BUFFER_SIZE) {
        fingerBuffer.shift();
    }

    // Need at least a few frames to detect gesture
    if (fingerBuffer.length < 4) {
        fingerDeltaY.textContent = "—";
        return;
    }

    // Calculate Y delta over recent frames
    // Look at the movement from ~6 frames ago to now
    const lookback = Math.min(fingerBuffer.length, 8);
    const oldEntry = fingerBuffer[fingerBuffer.length - lookback];
    const newEntry = fingerBuffer[fingerBuffer.length - 1];

    const deltaY = oldEntry.y - newEntry.y; // Positive = upward movement
    const deltaTime = newEntry.timestamp - oldEntry.timestamp;

    // Display delta
    const deltaPercent = (deltaY * 100).toFixed(1);
    fingerDeltaY.textContent = (deltaY > 0 ? "↑ " : "↓ ") + Math.abs(deltaPercent) + "%";

    // Check if index finger is extended (tip is above PIP which is above MCP)
    const isIndexExtended = indexTip.y < indexPIP.y && indexPIP.y < indexMCP.y;

    // Check if other fingers are relatively curled
    const middleTip = landmarks[12];
    const middleMCP = landmarks[9];
    const ringTip = landmarks[16];
    const ringMCP = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyMCP = landmarks[17];

    const isMiddleCurled = middleTip.y > middleMCP.y;
    const isRingCurled = ringTip.y > ringMCP.y;
    const isPinkyCurled = pinkyTip.y > pinkyMCP.y;

    // Pointing gesture: index extended + at least 2 others curled
    const isPointing = isIndexExtended && (
        (isMiddleCurled && isRingCurled) ||
        (isMiddleCurled && isPinkyCurled) ||
        (isRingCurled && isPinkyCurled)
    );

    // Threshold maps sensitivity (1-10) to delta (0.03 to 0.15)
    // Higher sensitivity = lower threshold = easier to trigger
    const threshold = 0.18 - (sensitivity * 0.015);

    // Detect scroll up gesture
    const now = performance.now();
    const isCooldownOver = (now - lastGestureTime) > cooldownMs;

    if (isPointing && deltaY > threshold && deltaTime < 500 && isCooldownOver) {
        onScrollUpDetected(now);
    }

    // Update gesture display
    if (isPointing) {
        gestureDisplay.querySelector(".gesture-label").textContent = "☝️ Pointing — move up to scroll";
    } else if (isIndexExtended) {
        gestureDisplay.querySelector(".gesture-label").textContent = "✋ Hand detected";
    } else {
        gestureDisplay.querySelector(".gesture-label").textContent = "✊ Make a pointing gesture";
    }
}

// ============================================
// GESTURE CALLBACK
// ============================================
function onScrollUpDetected(timestamp) {
    lastGestureTime = timestamp;
    scrollCount++;

    console.log(`🔼 Scroll Up! (#${scrollCount})`);

    // Update counter
    counterValue.textContent = scrollCount;

    // Animate counter
    scrollCounter.classList.add("pulse");
    counterValue.style.animation = "counterPop 300ms ease";
    setTimeout(() => {
        scrollCounter.classList.remove("pulse");
        counterValue.style.animation = "";
    }, 600);

    // Flash the camera view
    gestureFlash.classList.add("active");
    setTimeout(() => gestureFlash.classList.remove("active"), 600);

    // Update gesture display
    gestureDisplay.classList.add("detected");
    gestureDisplay.querySelector(".gesture-label").textContent = "⬆️ SCROLL UP!";
    setTimeout(() => {
        gestureDisplay.classList.remove("detected");
    }, 800);

    // Add to history
    const time = new Date().toLocaleTimeString();
    const historyItem = document.createElement("div");
    historyItem.className = "gesture-history-item";
    historyItem.textContent = `⬆️ Scroll Up — ${time}`;
    gestureHistory.prepend(historyItem);

    // Keep history manageable
    while (gestureHistory.children.length > 5) {
        gestureHistory.removeChild(gestureHistory.lastChild);
    }

    // Clear buffer to prevent repeated triggers
    fingerBuffer.length = 0;
}

// ============================================
// EVENT LISTENERS
// ============================================
startBtn.addEventListener("click", async () => {
    if (isRunning) {
        stopCamera();
    } else {
        if (!handLandmarker) {
            await initializeHandLandmarker();
        }
        await startCamera();
    }
});

cameraPlaceholder.addEventListener("click", async () => {
    if (!isRunning) {
        if (!handLandmarker) {
            await initializeHandLandmarker();
        }
        await startCamera();
    }
});

sensitivitySlider.addEventListener("input", (e) => {
    sensitivity = parseInt(e.target.value);
    sensitivityValue.textContent = sensitivity;
});

cooldownSlider.addEventListener("input", (e) => {
    cooldownMs = parseFloat(e.target.value) * 1000;
    cooldownValue.textContent = e.target.value;
});

// ============================================
// INITIALIZATION
// ============================================
console.log("🖐️ Gesture Scroll — App loaded");
console.log("Click 'Start Camera' or the camera view to begin.");
