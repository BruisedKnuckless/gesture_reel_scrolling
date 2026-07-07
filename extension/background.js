// ============================================
// BACKGROUND SERVICE WORKER
// ============================================
// Relays gesture messages from the detector
// window to the Instagram content script.
// Also manages the detector window lifecycle.
// ============================================

let detectorWindowId = null;
let activeInstagramTabId = null;

// Listen for messages from popup or detector window
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "OPEN_DETECTOR") {
        openDetectorWindow(message.tabId);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === "CLOSE_DETECTOR") {
        closeDetectorWindow();
        sendResponse({ success: true });
        return true;
    }

    if (message.type === "DETECTOR_STATUS") {
        sendResponse({
            isOpen: detectorWindowId !== null,
            instagramTabId: activeInstagramTabId
        });
        return true;
    }

    if (message.type === "SCROLL_NEXT_REEL") {
        // Forward to Instagram content script
        if (activeInstagramTabId) {
            chrome.tabs.sendMessage(activeInstagramTabId, {
                type: "SCROLL_NEXT_REEL"
            }).catch(err => {
                console.warn("Could not send to Instagram tab:", err);
            });
        }
        sendResponse({ success: true });
        return true;
    }

    if (message.type === "SCROLL_PREV_REEL") {
        if (activeInstagramTabId) {
            chrome.tabs.sendMessage(activeInstagramTabId, {
                type: "SCROLL_PREV_REEL"
            }).catch(err => {
                console.warn("Could not send to Instagram tab:", err);
            });
        }
        sendResponse({ success: true });
        return true;
    }
});

async function openDetectorWindow(tabId) {
    activeInstagramTabId = tabId;

    // Close existing detector window if any
    if (detectorWindowId) {
        try {
            await chrome.windows.remove(detectorWindowId);
        } catch (e) {
            // Window might already be closed
        }
    }

    // Get the current window to position the detector
    const currentWindow = await chrome.windows.getCurrent();

    // Open detector as a small popup window positioned to the right
    const win = await chrome.windows.create({
        url: chrome.runtime.getURL("detector.html"),
        type: "popup",
        width: 380,
        height: 520,
        left: currentWindow.left + currentWindow.width - 400,
        top: currentWindow.top + 50
    });

    detectorWindowId = win.id;

    console.log("🔍 Detector window opened:", detectorWindowId);
}

function closeDetectorWindow() {
    if (detectorWindowId) {
        chrome.windows.remove(detectorWindowId).catch(() => {});
        detectorWindowId = null;
    }
    activeInstagramTabId = null;
    console.log("🔍 Detector window closed");
}

// Clean up when detector window is closed manually
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === detectorWindowId) {
        detectorWindowId = null;
        activeInstagramTabId = null;
        console.log("🔍 Detector window was closed by user");
    }
});
