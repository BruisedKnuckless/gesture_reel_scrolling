// ============================================
// BACKGROUND SERVICE WORKER
// ============================================
// Relays gesture messages from detector window
// to Instagram content script. Keeps alive while
// detector is open.
// ============================================

let detectorWindowId = null;
let activeInstagramTabId = null;

// ============================================
// KEEPALIVE — Prevent service worker termination
// ============================================
// MV3 service workers die after ~5 min of inactivity.
// We use chrome.alarms to stay alive while detector is open.

async function startKeepalive() {
    await chrome.alarms.create("keepalive", { periodInMinutes: 0.4 }); // Every 24s
    console.log("⏰ Keepalive alarm started");
}

async function stopKeepalive() {
    await chrome.alarms.clear("keepalive");
    console.log("⏰ Keepalive alarm stopped");
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepalive") {
        // Just receiving this alarm keeps the worker alive
        console.log("💓 Keepalive pulse");
    }
});

// ============================================
// PERSIST STATE — Survive service worker restarts
// ============================================
async function saveState() {
    await chrome.storage.session.set({
        detectorWindowId,
        activeInstagramTabId
    });
}

async function loadState() {
    const data = await chrome.storage.session.get(["detectorWindowId", "activeInstagramTabId"]);
    if (data.detectorWindowId) {
        // Verify the window still exists
        try {
            await chrome.windows.get(data.detectorWindowId);
            detectorWindowId = data.detectorWindowId;
            activeInstagramTabId = data.activeInstagramTabId;
            console.log("📦 Restored state — detector:", detectorWindowId, "tab:", activeInstagramTabId);
            startKeepalive();
        } catch {
            // Window no longer exists
            detectorWindowId = null;
            activeInstagramTabId = null;
            await saveState();
        }
    }
}

// Restore state on worker startup
loadState();

// ============================================
// MESSAGE HANDLER
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(err => {
        console.error("Message handler error:", err);
        sendResponse({ success: false, error: err.message });
    });
    return true; // Will respond asynchronously
});

async function handleMessage(message, sender) {
    switch (message.type) {
        case "OPEN_DETECTOR":
            await openDetectorWindow(message.tabId);
            return { success: true };

        case "CLOSE_DETECTOR":
            await closeDetectorWindow();
            return { success: true };

        case "DETECTOR_STATUS":
            return {
                isOpen: detectorWindowId !== null,
                instagramTabId: activeInstagramTabId
            };

        case "KEEPALIVE":
            // Just receiving this keeps the worker alive
            return { success: true };

        case "SCROLL_NEXT_REEL":
        case "SCROLL_PREV_REEL":
        case "LIKE_REEL":
        case "SAVE_REEL":
            await forwardToInstagram(message.type);
            return { success: true };

        default:
            return { success: false, error: "Unknown message type" };
    }
}

// ============================================
// FORWARD TO INSTAGRAM
// ============================================
async function forwardToInstagram(type) {
    if (!activeInstagramTabId) {
        console.warn("No active Instagram tab");
        return;
    }

    try {
        // Verify tab still exists
        const tab = await chrome.tabs.get(activeInstagramTabId);
        if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
            console.warn("Instagram tab no longer valid");
            return;
        }

        await chrome.tabs.sendMessage(activeInstagramTabId, { type });
        console.log(`📨 Forwarded ${type} to tab ${activeInstagramTabId}`);
    } catch (err) {
        console.warn(`Could not forward ${type}:`, err.message);

        // Try to find another Instagram tab
        const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
        if (tabs.length > 0) {
            activeInstagramTabId = tabs[0].id;
            await saveState();
            try {
                await chrome.tabs.sendMessage(activeInstagramTabId, { type });
                console.log(`📨 Forwarded ${type} to fallback tab ${activeInstagramTabId}`);
            } catch (err2) {
                console.warn("Fallback forward also failed:", err2.message);
            }
        }
    }
}

// ============================================
// DETECTOR WINDOW MANAGEMENT
// ============================================
async function openDetectorWindow(tabId) {
    activeInstagramTabId = tabId;

    if (detectorWindowId) {
        try {
            await chrome.windows.remove(detectorWindowId);
        } catch (e) { /* already closed */ }
    }

    const currentWindow = await chrome.windows.getCurrent();

    const win = await chrome.windows.create({
        url: chrome.runtime.getURL("detector.html"),
        type: "popup",
        width: 380,
        height: 560,
        left: currentWindow.left + currentWindow.width - 400,
        top: currentWindow.top + 50
    });

    detectorWindowId = win.id;
    await saveState();
    await startKeepalive();

    console.log("🔍 Detector window opened:", detectorWindowId);
}

async function closeDetectorWindow() {
    if (detectorWindowId) {
        try {
            await chrome.windows.remove(detectorWindowId);
        } catch { /* already closed */ }
    }
    detectorWindowId = null;
    activeInstagramTabId = null;
    await saveState();
    await stopKeepalive();
    console.log("🔍 Detector window closed");
}

// Clean up when detector window is closed manually
chrome.windows.onRemoved.addListener(async (windowId) => {
    if (windowId === detectorWindowId) {
        detectorWindowId = null;
        activeInstagramTabId = null;
        await saveState();
        await stopKeepalive();
        console.log("🔍 Detector window closed by user");
    }
});
