// ============================================
// POPUP SCRIPT
// ============================================
// Checks if user is on Instagram, then launches
// the persistent detector window.
// ============================================

const launchBtn = document.getElementById("launchBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const instructions = document.getElementById("instructions");
const warningMsg = document.getElementById("warningMsg");
const activeMsg = document.getElementById("activeMsg");

// Check current state on popup open
async function checkState() {
    // Check if detector is already running
    const response = await chrome.runtime.sendMessage({ type: "DETECTOR_STATUS" });

    if (response && response.isOpen) {
        showActiveState();
        return;
    }

    // Check if current tab is Instagram
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
        showWarning();
    }
}

function showActiveState() {
    statusDot.classList.add("active");
    statusLabel.textContent = "Active";
    instructions.classList.add("hidden");
    warningMsg.classList.add("hidden");
    activeMsg.classList.remove("hidden");
    launchBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");
}

function showWarning() {
    warningMsg.classList.remove("hidden");
    launchBtn.disabled = true;
    launchBtn.style.opacity = "0.5";
}

// Launch detector
launchBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
        showWarning();
        return;
    }

    // Inject content script (in case it wasn't auto-injected)
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });
    } catch (e) {
        console.log("Content script may already be injected:", e);
    }

    // Open detector window
    await chrome.runtime.sendMessage({
        type: "OPEN_DETECTOR",
        tabId: tab.id
    });

    showActiveState();
});

// Stop detector
stopBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "CLOSE_DETECTOR" });

    statusDot.classList.remove("active");
    statusLabel.textContent = "Inactive";
    activeMsg.classList.add("hidden");
    instructions.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    launchBtn.classList.remove("hidden");
});

// Initialize
checkState();
