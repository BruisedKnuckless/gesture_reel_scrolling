# Gesture Reel Scroll

An AI-powered, zero-touch Chrome Extension and standalone web application that allows you to control Instagram Reels using real-time hand gestures. Powered by Google MediaPipe's Hand Landmarker model running fully client-side on WebAssembly (WASM).

No external API calls, no servers, and zero telemetry. Fully compliant with Chrome Extension Manifest V3 security policies.

---

##  Key Features

*   **☝️ Next Reel (Swipe Up):** Raise only your index finger and swipe upward to scroll to the next Reel.
*   **✌️ Previous Reel (Two-Finger Motion):** Show your index and middle fingers and make a slight motion to go back to the previous Reel.
*   **👍 Like Reel (Thumbs Up):** Give a thumbs-up gesture and hold it for 400ms to toggle the like status of the current Reel.
*   **🖐️ Save Reel (Open Palm):** Show your open palm for 600ms to toggle saving the Reel to your bookmarks.
*   **🔒 Local & Private:** All computations are run locally on device using WebAssembly. Camera feeds never leave your browser.
*   **🔋 MV3 Keep-Alive Engine:** Custom service worker heartbeat prevents the extension background thread from going idle during long browsing sessions.

---

## 🛠️ Architecture

```
                       [ Web Camera Stream ]
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │    Detector Window    │ (Runs locally in separate popup)
                     │ 💡 MediaPipe Tasks    │
                     │ 💡 Gesture Logic      │
                     └───────────┬───────────┘
                                 │ chrome.runtime.sendMessage
                                 ▼
                     ┌───────────────────────┐
                     │   Background Worker   │ (Relays messages & controls
                     │ ⚡ Heartbeat Alarm    │  keep-alive state)
                     └───────────┬───────────┘
                                 │ chrome.tabs.sendMessage
                                 ▼
                     ┌───────────────────────┐
                     │    Content Script     │ (Interacts with Instagram DOM)
                     │ 🎬 UI Toast Feedback  │
                     │ 🎬 Smart Element Click│
                     └───────────────────────┘
```

The extension separates the heavy machine learning processes from the Instagram window:
1.  **Detector Window:** Houses the camera stream and runs the WASM-based HandLandmarker model.
2.  **Background Script:** Operates as a messaging bridge. Uses alarm api scheduling to sustain continuous operation (mitigating Manifest V3 service worker timeouts).
3.  **Content Script:** Directly injected into Instagram, featuring robust element detection heuristics (combining aria-labels, CSS structure mapping, scroll container navigation, and mouse event triggers) to control Reels interaction.

---

## 📦 File Structure

```
├── app.js                       # Phase 1: Standalone site main script
├── index.html                   # Phase 1: Standalone site page
├── style.css                    # Phase 1: Standalone site styles
└── extension/                   # Phase 2: Chrome Extension
    ├── manifest.json            # Extension configuration (Manifest V3)
    ├── background.js            # Service worker (Message relay & Keep-alive)
    ├── content.js               # Instagram DOM interaction script
    ├── popup.html/css/js        # Extension popup control panel
    ├── detector.html/css/js     # Hands-free tracking popup (MediaPipe runner)
    ├── icons/                   # Icon assets
    ├── models/
    │   └── hand_landmarker.task # Local model file (No CDN network latency)
    └── wasm/
        ├── vision_wasm_internal.js   # Local WASM glue script
        └── vision_wasm_internal.wasm # WebAssembly module
```

---

## 🔧 Installation Guide

### Prerequisites
*   Google Chrome (or any Chromium-based browser supporting MV3 extensions).
*   A functional built-in or external webcam.

### Steps
1.  Download or clone this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** via the toggle switch in the top-right corner.
4.  Click **Load unpacked** in the top-left corner.
5.  Select the `extension/` folder from the root of the project directory.

---

## 🎮 How to Use

1.  Open **[instagram.com/reels](https://www.instagram.com/reels/)** on your browser.
2.  Click the **Gesture Reel Scroll** extension icon from your extension toolbar.
3.  Click **Launch Gesture Control**.
4.  Allow camera permissions for the newly opened control window.
5.  Position your hand in front of the camera and begin browsing hands-free!
    *   *Tip:* Adjust the **Sensitivity** and **Cooldown** sliders in the control window to match your ambient lighting and pacing.
