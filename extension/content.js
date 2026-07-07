// ============================================
// CONTENT SCRIPT — Instagram Reel Scroller
// ============================================
// Injected into instagram.com pages.
// Listens for SCROLL_NEXT_REEL messages and
// scrolls to the next reel.
// ============================================

(function () {
    // Prevent double injection
    if (window.__gestureScrollInjected) return;
    window.__gestureScrollInjected = true;

    console.log("🎬 Gesture Reel Scroll — Content script loaded on Instagram");

    // ============================================
    // SCROLL LOGIC
    // ============================================

    function scrollToNextReel() {
        // Strategy 1: Simulate Down Arrow keypress (works on Instagram Reels)
        const keyDown = new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            keyCode: 40,
            which: 40,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(keyDown);

        // Small delay then release
        setTimeout(() => {
            const keyUp = new KeyboardEvent("keyup", {
                key: "ArrowDown",
                code: "ArrowDown",
                keyCode: 40,
                which: 40,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(keyUp);
        }, 50);

        console.log("🔽 Scrolled to next reel (ArrowDown)");

        // Show visual feedback on Instagram page
        showScrollFeedback("⬆️ Next Reel");
    }

    function scrollToPrevReel() {
        const keyDown = new KeyboardEvent("keydown", {
            key: "ArrowUp",
            code: "ArrowUp",
            keyCode: 38,
            which: 38,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(keyDown);

        setTimeout(() => {
            const keyUp = new KeyboardEvent("keyup", {
                key: "ArrowUp",
                code: "ArrowUp",
                keyCode: 38,
                which: 38,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(keyUp);
        }, 50);

        console.log("🔼 Scrolled to previous reel (ArrowUp)");
        showScrollFeedback("⬇️ Previous Reel");
    }

    // ============================================
    // VISUAL FEEDBACK TOAST
    // ============================================
    let feedbackEl = null;
    let feedbackTimeout = null;

    function showScrollFeedback(text) {
        // Create toast element if not exists
        if (!feedbackEl) {
            feedbackEl = document.createElement("div");
            feedbackEl.id = "gesture-scroll-feedback";
            feedbackEl.style.cssText = `
                position: fixed;
                top: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(-20px);
                background: rgba(99, 102, 241, 0.95);
                color: white;
                padding: 10px 20px;
                border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
                font-size: 14px;
                font-weight: 600;
                z-index: 999999;
                pointer-events: none;
                opacity: 0;
                transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1);
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
                letter-spacing: 0.02em;
            `;
            document.body.appendChild(feedbackEl);
        }

        // Clear previous timeout
        if (feedbackTimeout) {
            clearTimeout(feedbackTimeout);
        }

        // Show
        feedbackEl.textContent = text;
        feedbackEl.style.opacity = "1";
        feedbackEl.style.transform = "translateX(-50%) translateY(0)";

        // Hide after delay
        feedbackTimeout = setTimeout(() => {
            feedbackEl.style.opacity = "0";
            feedbackEl.style.transform = "translateX(-50%) translateY(-20px)";
        }, 1200);
    }

    // ============================================
    // MESSAGE LISTENER
    // ============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "SCROLL_NEXT_REEL") {
            scrollToNextReel();
            sendResponse({ success: true });
        }

        if (message.type === "SCROLL_PREV_REEL") {
            scrollToPrevReel();
            sendResponse({ success: true });
        }

        return true;
    });

})();
