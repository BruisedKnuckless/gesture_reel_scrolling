// ============================================
// CONTENT SCRIPT — Instagram Reel Scroller
// ============================================
// Injected into instagram.com pages.
// Listens for SCROLL messages and clicks the
// actual up/down navigation buttons on Reels.
// ============================================

(function () {
    // Prevent double injection
    if (window.__gestureScrollInjected) return;
    window.__gestureScrollInjected = true;

    console.log("🎬 Gesture Reel Scroll — Content script loaded on Instagram");

    // ============================================
    // FIND NAVIGATION BUTTONS
    // ============================================

    /**
     * Find the "next reel" (down chevron ˅) button.
     * Tries multiple strategies since Instagram changes DOM often.
     */
    function findNextButton() {
        // Strategy 1: Look for SVG-based down chevron buttons
        // The down chevron button is typically the second navigation button
        const allSvgs = document.querySelectorAll('svg[aria-label]');
        for (const svg of allSvgs) {
            const label = svg.getAttribute('aria-label')?.toLowerCase() || '';
            if (label.includes('down') || label.includes('next')) {
                const btn = svg.closest('button') || svg.closest('[role="button"]') || svg.parentElement;
                if (btn) {
                    console.log("🔽 Found next button via aria-label:", label);
                    return btn;
                }
            }
        }

        // Strategy 2: Look for chevron buttons by their visual position
        // The down arrow is typically a button with a downward-pointing chevron SVG
        const buttons = document.querySelectorAll('button, [role="button"]');
        const candidates = [];

        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;

            const rect = btn.getBoundingClientRect();
            // The nav buttons are on the right side of the viewport, mid-height area
            if (rect.right > window.innerWidth * 0.7 &&
                rect.top > window.innerHeight * 0.3 &&
                rect.bottom < window.innerHeight * 0.85 &&
                rect.width < 80 && rect.height < 80 &&
                rect.width > 20 && rect.height > 20) {

                candidates.push({ btn, rect });
            }
        }

        // Sort by vertical position — the lower one is "next" (down)
        candidates.sort((a, b) => a.rect.top - b.rect.top);

        if (candidates.length >= 2) {
            console.log("🔽 Found next button via position (lower of two nav buttons)");
            return candidates[1].btn; // Second one = down/next
        }

        if (candidates.length === 1) {
            console.log("🔽 Found single nav button, using it as next");
            return candidates[0].btn;
        }

        // Strategy 3: Fallback — try scrolling the page
        console.log("🔽 No nav button found, using scroll fallback");
        return null;
    }

    /**
     * Find the "previous reel" (up chevron ˄) button.
     */
    function findPrevButton() {
        // Strategy 1: aria-label
        const allSvgs = document.querySelectorAll('svg[aria-label]');
        for (const svg of allSvgs) {
            const label = svg.getAttribute('aria-label')?.toLowerCase() || '';
            if (label.includes('up') || label.includes('prev') || label.includes('back')) {
                const btn = svg.closest('button') || svg.closest('[role="button"]') || svg.parentElement;
                if (btn) {
                    console.log("🔼 Found prev button via aria-label:", label);
                    return btn;
                }
            }
        }

        // Strategy 2: Position-based — upper nav button
        const buttons = document.querySelectorAll('button, [role="button"]');
        const candidates = [];

        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;

            const rect = btn.getBoundingClientRect();
            if (rect.right > window.innerWidth * 0.7 &&
                rect.top > window.innerHeight * 0.3 &&
                rect.bottom < window.innerHeight * 0.85 &&
                rect.width < 80 && rect.height < 80 &&
                rect.width > 20 && rect.height > 20) {

                candidates.push({ btn, rect });
            }
        }

        candidates.sort((a, b) => a.rect.top - b.rect.top);

        if (candidates.length >= 2) {
            console.log("🔼 Found prev button via position (upper of two nav buttons)");
            return candidates[0].btn; // First one = up/prev
        }

        console.log("🔼 No prev button found");
        return null;
    }

    // ============================================
    // SCROLL ACTIONS
    // ============================================

    function scrollToNextReel() {
        const btn = findNextButton();

        if (btn) {
            btn.click();
            console.log("🔽 Clicked next reel button");
            showScrollFeedback("⬇️ Next Reel");
        } else {
            // Fallback: scroll the page down by viewport height
            window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            console.log("🔽 Fallback: scrolled page down");
            showScrollFeedback("⬇️ Next Reel (scroll)");
        }
    }

    function scrollToPrevReel() {
        const btn = findPrevButton();

        if (btn) {
            btn.click();
            console.log("🔼 Clicked prev reel button");
            showScrollFeedback("⬆️ Previous Reel");
        } else {
            // Fallback: scroll up
            window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
            console.log("🔼 Fallback: scrolled page up");
            showScrollFeedback("⬆️ Previous Reel (scroll)");
        }
    }

    // ============================================
    // VISUAL FEEDBACK TOAST
    // ============================================
    let feedbackEl = null;
    let feedbackTimeout = null;

    function showScrollFeedback(text) {
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

        if (feedbackTimeout) {
            clearTimeout(feedbackTimeout);
        }

        feedbackEl.textContent = text;
        feedbackEl.style.opacity = "1";
        feedbackEl.style.transform = "translateX(-50%) translateY(0)";

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
