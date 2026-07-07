// ============================================
// DETECTOR — Gesture Detection Window
// ============================================
// Gestures:
//   ☝️ Index finger + swipe up  → Next Reel
//   ✌️ Two fingers + any motion → Previous Reel
//   👍 Thumbs up               → Like Reel
//   🖐️ Open palm               → Save Reel
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
let gestureCount = 0;

// Separate cooldowns for each gesture type
let lastNextReelTime = 0;
let lastPrevReelTime = 0;
let lastLikeTime = 0;
let lastSaveTime = 0;

const BUFFER_SIZE = 12;
const fingerBuffer = [];

let sensitivity = 5;
let cooldownMs = 1500;

// Static gesture hold timers (must hold pose for N ms before triggering)
const STATIC_HOLD_MS = 600;
let thumbsUpStartTime = 0;
let thumbsUpHolding = false;
let openPalmStartTime = 0;
let openPalmHolding = false;

// ============================================
// KEEPALIVE — prevent service worker death
// ============================================
setInterval(() => {
    chrome.runtime.sendMessage({ type: "KEEPALIVE" }).catch(() => {});
}, 20000);

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
        detLabel.textContent = "Loading model...";

        const vision = await FilesetResolver.forVisionTasks(
            chrome.runtime.getURL("wasm")
        );

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task"),
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        console.log("✅ HandLandmarker loaded");

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
            processGestures(landmarks, now);
        } else {
            fingerPosEl.textContent = "—";
            deltaDisplayEl.textContent = "—";
            fingerBuffer.length = 0;
            thumbsUpHolding = false;
            openPalmHolding = false;

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

    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * w;
        const y = lm.y * h;

        ctx.beginPath();
        if (i === 8) {
            // Index finger tip — highlight
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 13, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (i === 12) {
            // Middle finger tip — secondary highlight when two fingers
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(139, 92, 246, 0.8)";
            ctx.fill();
        } else if (i === 4) {
            // Thumb tip
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
            ctx.fill();
        } else {
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fill();
        }
    }
}

// ============================================
// FINGER STATE HELPERS
// ============================================
function isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
    return landmarks[tipIdx].y < landmarks[pipIdx].y &&
           landmarks[pipIdx].y < landmarks[mcpIdx].y;
}

function isFingerCurled(landmarks, tipIdx, mcpIdx) {
    return landmarks[tipIdx].y > landmarks[mcpIdx].y;
}

function isThumbExtended(landmarks) {
    // Thumb points UP: tip (4) is significantly above wrist (0)
    // More aggressive — just check tip is well above the CMC joint (1)
    const tip = landmarks[4];
    const cmc = landmarks[1];
    const wrist = landmarks[0];
    return tip.y < cmc.y;
}

function isThumbUp(landmarks) {
    // Aggressive thumbs-up detection:
    // 1. Thumb tip (4) is above wrist (0) — it's pointing upward
    // 2. Thumb tip is the highest point of the hand
    // 3. Other finger tips are below their MCPs (curled-ish)
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Thumb must be above wrist
    const thumbAboveWrist = thumbTip.y < wrist.y;

    // Thumb must be the highest (or close to highest) point
    const thumbIsHighest = thumbTip.y < indexTip.y &&
                           thumbTip.y < middleTip.y;

    // Other fingers should generally be curled (tip below MCP)
    // Be lenient — require only 2 of 4 to be curled
    const indexCurled = indexTip.y > landmarks[5].y;
    const middleCurled = middleTip.y > landmarks[9].y;
    const ringCurled = ringTip.y > landmarks[13].y;
    const pinkyCurled = pinkyTip.y > landmarks[17].y;
    const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;

    return thumbAboveWrist && thumbIsHighest && curledCount >= 2;
}

function isThumbCurled(landmarks) {
    return landmarks[4].y >= landmarks[2].y;
}

// ============================================
// GESTURE DETECTION
// ============================================
function processGestures(landmarks, now) {
    const indexTip = landmarks[8];

    // Update position display
    fingerPosEl.textContent = (indexTip.y * 100).toFixed(0) + "%";

    // Buffer for motion detection
    fingerBuffer.push({ x: indexTip.x, y: indexTip.y, timestamp: now });
    while (fingerBuffer.length > BUFFER_SIZE) {
        fingerBuffer.shift();
    }

    // Calculate motion delta
    let deltaY = 0;
    let deltaTime = 0;
    if (fingerBuffer.length >= 4) {
        const lookback = Math.min(fingerBuffer.length, 8);
        const oldEntry = fingerBuffer[fingerBuffer.length - lookback];
        const newEntry = fingerBuffer[fingerBuffer.length - 1];
        deltaY = oldEntry.y - newEntry.y; // positive = finger moved up
        deltaTime = newEntry.timestamp - oldEntry.timestamp;
    }

    const deltaPercent = (deltaY * 100).toFixed(0);
    deltaDisplayEl.textContent = (deltaY > 0 ? "↑" : "↓") + Math.abs(deltaPercent) + "%";

    // ---- Detect finger states ----
    const indexExtended = isFingerExtended(landmarks, 8, 6, 5);
    const middleExtended = isFingerExtended(landmarks, 12, 10, 9);
    const ringExtended = isFingerExtended(landmarks, 16, 14, 13);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18, 17);
    const thumbUp = isThumbExtended(landmarks);

    const middleCurled = isFingerCurled(landmarks, 12, 9);
    const ringCurled = isFingerCurled(landmarks, 16, 13);
    const pinkyCurled = isFingerCurled(landmarks, 20, 17);
    const thumbCurled = isThumbCurled(landmarks);

    // ---- Count extended fingers ----
    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    // ============================================
    // GESTURE 1: OPEN PALM (all 5 fingers) → SAVE
    // Must hold for STATIC_HOLD_MS to avoid accidental triggers
    // ============================================
    const isOpenPalm = indexExtended && middleExtended && ringExtended && pinkyExtended && thumbUp;

    if (isOpenPalm) {
        if (!openPalmHolding) {
            openPalmStartTime = now;
            openPalmHolding = true;
        }

        const holdTime = now - openPalmStartTime;
        const cooldownOver = (now - lastSaveTime) > 3000; // 3s cooldown for save

        if (holdTime >= STATIC_HOLD_MS && cooldownOver) {
            triggerGesture("SAVE_REEL", "🔖", "REEL SAVED!", now);
            lastSaveTime = now;
            openPalmHolding = false;
            gestureIcon.textContent = "🖐️";
            gestureText.textContent = `Hold palm... SAVED! ✓`;
            return;
        }

        // Show hold progress
        const progress = Math.min(holdTime / STATIC_HOLD_MS * 100, 100).toFixed(0);
        gestureIcon.textContent = "🖐️";
        gestureText.textContent = `Hold palm... ${progress}%`;
        return;
    } else {
        openPalmHolding = false;
    }

    // ============================================
    // GESTURE 2: THUMBS UP → LIKE
    // Uses aggressive detection. Hold for 400ms.
    // ============================================
    const detectedThumbsUp = isThumbUp(landmarks);

    if (detectedThumbsUp) {
        if (!thumbsUpHolding) {
            thumbsUpStartTime = now;
            thumbsUpHolding = true;
        }

        const holdTime = now - thumbsUpStartTime;
        const cooldownOver = (now - lastLikeTime) > 2000;
        const THUMB_HOLD = 400; // Shorter hold time

        if (holdTime >= THUMB_HOLD && cooldownOver) {
            triggerGesture("LIKE_REEL", "❤️", "LIKED!", now);
            lastLikeTime = now;
            thumbsUpHolding = false;
            return;
        }

        const progress = Math.min(holdTime / THUMB_HOLD * 100, 100).toFixed(0);
        gestureIcon.textContent = "👍";
        gestureText.textContent = `Thumbs up! ${progress}%`;
        return;
    } else {
        thumbsUpHolding = false;
    }

    // ============================================
    // GESTURE 3: TWO FINGERS (index + middle) + motion → PREV REEL
    // As soon as two fingers detected + any movement, scroll prev.
    // ============================================
    const isTwoFingers = indexExtended && middleExtended && ringCurled && pinkyCurled;

    if (isTwoFingers && fingerBuffer.length >= 4) {
        const absDelta = Math.abs(deltaY);
        const motionThreshold = 0.03; // Very low — just need any movement
        const cooldownOver = (now - lastPrevReelTime) > cooldownMs;

        if (absDelta > motionThreshold && deltaTime < 600 && cooldownOver) {
            triggerGesture("SCROLL_PREV_REEL", "⬆️", "PREVIOUS REEL!", now);
            lastPrevReelTime = now;
            fingerBuffer.length = 0;
            return;
        }

        gestureIcon.textContent = "✌️";
        gestureText.textContent = "Two fingers — move to go back";
        return;
    }

    // ============================================
    // GESTURE 4: SINGLE FINGER (index only) + swipe up → NEXT REEL
    // ============================================
    const isPointing = indexExtended && middleCurled && ringCurled && pinkyCurled;

    if (isPointing && fingerBuffer.length >= 4) {
        const threshold = 0.18 - (sensitivity * 0.015);
        const cooldownOver = (now - lastNextReelTime) > cooldownMs;

        if (deltaY > threshold && deltaTime < 500 && cooldownOver) {
            triggerGesture("SCROLL_NEXT_REEL", "⬇️", "NEXT REEL!", now);
            lastNextReelTime = now;
            fingerBuffer.length = 0;
            return;
        }

        gestureIcon.textContent = "☝️";
        gestureText.textContent = "Point + swipe up → next reel";
        return;
    }

    // ---- Default display ----
    if (extendedCount > 0) {
        gestureIcon.textContent = "✋";
        gestureText.textContent = "Hand detected";
    } else {
        gestureIcon.textContent = "✊";
        gestureText.textContent = "Show a gesture";
    }
}

// ============================================
// TRIGGER GESTURE (unified)
// ============================================
function triggerGesture(messageType, icon, label, now) {
    gestureCount++;

    console.log(`${icon} ${label} (#${gestureCount})`);

    // Update counter
    scrollCountEl.textContent = gestureCount;
    scrollCountEl.style.animation = "pop 300ms ease";
    setTimeout(() => scrollCountEl.style.animation = "", 300);

    // Flash
    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 500);

    // Gesture display
    gestureBox.classList.add("detected");
    gestureIcon.textContent = icon;
    gestureText.textContent = label;
    setTimeout(() => gestureBox.classList.remove("detected"), 600);

    // Send to Instagram
    chrome.runtime.sendMessage({ type: messageType }).catch(err => {
        console.warn("Message send error:", err);
    });
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
