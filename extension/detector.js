// ============================================
// DETECTOR — Gesture Detection Window
// ============================================
// Persistent camera window that tracks the index
// finger and sends scroll commands to Instagram
// via chrome.runtime messaging.
// ============================================

import { HandLandmarker, FilesetResolver } from "./vision_bundle.mjs";

// ============================================
// DOM
// ============================================
const webcamEl = document.getElementById("webcam");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const cameraBox = document.getElementById("cameraBox");
const flash = document.getElementById("flash");
const loading = document.getElementById("loading");
const detDot = document.getElementById("detDot");
const detLabel = document.getElementById("detLabel");
const gestureBox = document.getElementById("gestureBox");
const gestureIcon = document.getElementById("gestureIcon");
const gestureText = document.getElementById("gestureText");
const scrollCountEl = document.getElementById("scrollCount");
const fingerPosEl = document.getElementById("fingerPos");
const deltaDisplayEl = document.getElementById("deltaDisplay");
const sensitivitySlider = document.getElementById("sensitivitySlider");
const sensVal = document.getElementById("sensVal");
const cooldownSlider = document.getElementById("cooldownSlider");
const coolVal = document.getElementById("coolVal");

// ============================================
// STATE
// ============================================
let handLandmarker = null;
let isRunning = false;
let animationFrameId = null;
let scrollCount = 0;
let lastGestureTime = 0;

const BUFFER_SIZE = 12;
const fingerBuffer = [];

let sensitivity = 5;
let cooldownMs = 1500;

// ============================================
// HAND CONNECTIONS
// ============================================
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
];

// ============================================
// INIT
// ============================================
async function init() {
    try {
        // 1. Load MediaPipe model
        detLabel.textContent = "Loading model...";

        const vision = await FilesetResolver.forVisionTasks(
            chrome.runtime.getURL("wasm")
        );

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task"),
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        console.log("✅ HandLandmarker loaded");

        // 2. Start camera
        detLabel.textContent = "Starting camera...";

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false
        });

        webcamEl.srcObject = stream;

        await new Promise((resolve) => {
            webcamEl.onloadedmetadata = () => {
                canvasEl.width = webcamEl.videoWidth;
                canvasEl.height = webcamEl.videoHeight;
                resolve();
            };
        });

        await webcamEl.play();

        // 3. UI updates
        loading.classList.add("hidden");
        cameraBox.classList.add("active");
        detDot.classList.add("active");
        detLabel.textContent = "Tracking";

        isRunning = true;
        detectFrame();

        console.log("📷 Camera started");

    } catch (err) {
        console.error("Init error:", err);
        detDot.classList.add("error");
        detLabel.textContent = "Error";
        loading.querySelector("p").textContent = err.message;
    }
}

// ============================================
// FRAME LOOP
// ============================================
let lastVideoTime = -1;

function detectFrame() {
    if (!isRunning || !handLandmarker) return;

    const now = performance.now();

    if (webcamEl.currentTime !== lastVideoTime) {
        lastVideoTime = webcamEl.currentTime;

        const results = handLandmarker.detectForVideo(webcamEl, now);

        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            drawHand(landmarks);
            trackFinger(landmarks, now);
        } else {
            fingerPosEl.textContent = "—";
            deltaDisplayEl.textContent = "—";
            fingerBuffer.length = 0;

            gestureBox.classList.remove("detected");
            gestureIcon.textContent = "👋";
            gestureText.textContent = "No hand detected";
        }
    }

    animationFrameId = requestAnimationFrame(detectFrame);
}

// ============================================
// DRAW HAND
// ============================================
function drawHand(landmarks) {
    const w = canvasEl.width;
    const h = canvasEl.height;

    // Connections
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.45)";

    for (const [start, end] of HAND_CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
    }

    // Landmarks
    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * w;
        const y = lm.y * h;

        ctx.beginPath();
        if (i === 8) {
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 13, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fill();
        }
    }
}

// ============================================
// FINGER TRACKING
// ============================================
function trackFinger(landmarks, timestamp) {
    const indexTip = landmarks[8];
    const indexPIP = landmarks[6];
    const indexMCP = landmarks[5];

    fingerPosEl.textContent = (indexTip.y * 100).toFixed(0) + "%";

    fingerBuffer.push({ x: indexTip.x, y: indexTip.y, timestamp });

    while (fingerBuffer.length > BUFFER_SIZE) {
        fingerBuffer.shift();
    }

    if (fingerBuffer.length < 4) {
        deltaDisplayEl.textContent = "—";
        return;
    }

    const lookback = Math.min(fingerBuffer.length, 8);
    const oldEntry = fingerBuffer[fingerBuffer.length - lookback];
    const newEntry = fingerBuffer[fingerBuffer.length - 1];

    const deltaY = oldEntry.y - newEntry.y;
    const deltaTime = newEntry.timestamp - oldEntry.timestamp;

    const deltaPercent = (deltaY * 100).toFixed(0);
    deltaDisplayEl.textContent = (deltaY > 0 ? "↑" : "↓") + Math.abs(deltaPercent) + "%";

    // Check finger extension
    const isIndexExtended = indexTip.y < indexPIP.y && indexPIP.y < indexMCP.y;

    const middleTip = landmarks[12];
    const middleMCP = landmarks[9];
    const ringTip = landmarks[16];
    const ringMCP = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyMCP = landmarks[17];

    const isMiddleCurled = middleTip.y > middleMCP.y;
    const isRingCurled = ringTip.y > ringMCP.y;
    const isPinkyCurled = pinkyTip.y > pinkyMCP.y;

    const isPointing = isIndexExtended && (
        (isMiddleCurled && isRingCurled) ||
        (isMiddleCurled && isPinkyCurled) ||
        (isRingCurled && isPinkyCurled)
    );

    // Threshold
    const threshold = 0.18 - (sensitivity * 0.015);

    const now = performance.now();
    const isCooldownOver = (now - lastGestureTime) > cooldownMs;

    if (isPointing && deltaTime < 500 && isCooldownOver) {
        if (deltaY > threshold) {
            onScrollUp(now);    // Finger moved UP → next reel
        } else if (deltaY < -threshold) {
            onScrollDown(now);  // Finger moved DOWN → previous reel
        }
    }

    // Update gesture display
    if (isPointing) {
        gestureIcon.textContent = "☝️";
        gestureText.textContent = "Pointing — swipe ↑↓ to scroll";
    } else if (isIndexExtended) {
        gestureIcon.textContent = "✋";
        gestureText.textContent = "Hand detected";
    } else {
        gestureIcon.textContent = "✊";
        gestureText.textContent = "Point with index finger";
    }
}

// ============================================
// SCROLL EVENTS
// ============================================
function onScrollUp(timestamp) {
    lastGestureTime = timestamp;
    scrollCount++;

    console.log(`⬇️ Next Reel! (#${scrollCount})`);

    // Update UI
    scrollCountEl.textContent = scrollCount;
    scrollCountEl.style.animation = "pop 300ms ease";
    setTimeout(() => scrollCountEl.style.animation = "", 300);

    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 500);

    gestureBox.classList.add("detected");
    gestureIcon.textContent = "⬇️";
    gestureText.textContent = "NEXT REEL!";
    setTimeout(() => gestureBox.classList.remove("detected"), 600);

    // Send message to background → Instagram content script
    chrome.runtime.sendMessage({ type: "SCROLL_NEXT_REEL" }).catch(err => {
        console.warn("Message send error:", err);
    });

    // Clear buffer
    fingerBuffer.length = 0;
}

function onScrollDown(timestamp) {
    lastGestureTime = timestamp;
    scrollCount++;

    console.log(`⬆️ Previous Reel! (#${scrollCount})`);

    // Update UI
    scrollCountEl.textContent = scrollCount;
    scrollCountEl.style.animation = "pop 300ms ease";
    setTimeout(() => scrollCountEl.style.animation = "", 300);

    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 500);

    gestureBox.classList.add("detected");
    gestureIcon.textContent = "⬆️";
    gestureText.textContent = "PREVIOUS REEL!";
    setTimeout(() => gestureBox.classList.remove("detected"), 600);

    // Send message to background → Instagram content script
    chrome.runtime.sendMessage({ type: "SCROLL_PREV_REEL" }).catch(err => {
        console.warn("Message send error:", err);
    });

    // Clear buffer
    fingerBuffer.length = 0;
}

// ============================================
// CONTROLS
// ============================================
sensitivitySlider.addEventListener("input", (e) => {
    sensitivity = parseInt(e.target.value);
    sensVal.textContent = sensitivity;
});

cooldownSlider.addEventListener("input", (e) => {
    cooldownMs = parseFloat(e.target.value) * 1000;
    coolVal.textContent = e.target.value + "s";
});

// ============================================
// START
// ============================================
init();

