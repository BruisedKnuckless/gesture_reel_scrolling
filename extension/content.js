// ============================================
// CONTENT SCRIPT — Instagram Reel Controller
// ============================================
// Handles: scroll next/prev, like, save.
// Uses multiple strategies for finding buttons.
// ============================================

(function () {
    if (window.__gestureScrollInjected) return;
    window.__gestureScrollInjected = true;

    console.log("🎬 Gesture Reel Scroll — Content script loaded");

    // ============================================
    // SCROLL: NEXT REEL
    // ============================================
    function scrollToNextReel() {
        // Strategy 1: Click the down chevron button (aria-label based)
        if (clickButtonByAriaLabel(["Down", "Next"])) {
            console.log("⬇️ Clicked next via aria-label");
            showFeedback("⬇️ Next Reel", "#6366f1");
            return;
        }

        // Strategy 2: Find chevron buttons by position (rightmost, lower)
        const navBtns = findChevronButtons();
        if (navBtns.next) {
            navBtns.next.click();
            console.log("⬇️ Clicked next via position");
            showFeedback("⬇️ Next Reel", "#6366f1");
            return;
        }

        // Strategy 3: Find the current video and scroll its container
        if (scrollReelContainer(1)) {
            console.log("⬇️ Scrolled container to next");
            showFeedback("⬇️ Next Reel", "#6366f1");
            return;
        }

        // Strategy 4: Raw scroll
        window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        console.log("⬇️ Fallback window scroll");
        showFeedback("⬇️ Next Reel", "#6366f1");
    }

    // ============================================
    // SCROLL: PREVIOUS REEL
    // ============================================
    function scrollToPrevReel() {
        if (clickButtonByAriaLabel(["Up", "Previous", "Back"])) {
            console.log("⬆️ Clicked prev via aria-label");
            showFeedback("⬆️ Previous Reel", "#8b5cf6");
            return;
        }

        const navBtns = findChevronButtons();
        if (navBtns.prev) {
            navBtns.prev.click();
            console.log("⬆️ Clicked prev via position");
            showFeedback("⬆️ Previous Reel", "#8b5cf6");
            return;
        }

        if (scrollReelContainer(-1)) {
            console.log("⬆️ Scrolled container to prev");
            showFeedback("⬆️ Previous Reel", "#8b5cf6");
            return;
        }

        window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
        console.log("⬆️ Fallback window scroll");
        showFeedback("⬆️ Previous Reel", "#8b5cf6");
    }

    // ============================================
    // BUTTON FINDING HELPERS
    // ============================================

    /**
     * Click a button whose SVG has an aria-label matching any of the given keywords.
     * Returns true if found and clicked.
     */
    function clickButtonByAriaLabel(keywords) {
        const svgs = document.querySelectorAll('svg[aria-label]');
        for (const svg of svgs) {
            const label = svg.getAttribute('aria-label') || '';
            const match = keywords.some(kw =>
                label.toLowerCase().includes(kw.toLowerCase())
            );
            if (match) {
                const btn = svg.closest('button') ||
                            svg.closest('[role="button"]') ||
                            svg.closest('div[tabindex]') ||
                            svg.parentElement;
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    // Must be visible on screen
                    if (rect.width > 0 && rect.height > 0 &&
                        rect.top >= 0 && rect.bottom <= window.innerHeight + 50) {
                        btn.click();
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Find the up/down chevron navigation buttons by their position.
     * They're typically on the far right, stacked vertically, small circular buttons.
     */
    function findChevronButtons() {
        const allElements = document.querySelectorAll('button, [role="button"], div[tabindex]');
        const candidates = [];

        for (const el of allElements) {
            const svg = el.querySelector('svg');
            if (!svg) continue;

            const rect = el.getBoundingClientRect();

            // Chevron buttons are: far right, mid-screen, small, contain SVG with polyline/path
            const polyline = svg.querySelector('polyline, line, path');
            if (!polyline) continue;

            if (rect.left > window.innerWidth * 0.8 &&
                rect.top > window.innerHeight * 0.2 &&
                rect.bottom < window.innerHeight * 0.85 &&
                rect.width >= 20 && rect.width <= 90 &&
                rect.height >= 20 && rect.height <= 90) {
                candidates.push({ el, rect, cy: rect.top + rect.height / 2 });
            }
        }

        // Sort by Y position
        candidates.sort((a, b) => a.cy - b.cy);

        if (candidates.length >= 2) {
            return { prev: candidates[0].el, next: candidates[1].el };
        } else if (candidates.length === 1) {
            // Single button — guess based on position
            const isUpperHalf = candidates[0].cy < window.innerHeight / 2;
            return {
                prev: isUpperHalf ? candidates[0].el : null,
                next: isUpperHalf ? null : candidates[0].el
            };
        }

        return { prev: null, next: null };
    }

    /**
     * Find the scrollable container for Reels and scroll by direction.
     * direction: 1 = next (down), -1 = prev (up)
     */
    function scrollReelContainer(direction) {
        // Strategy A: Find the visible video, then find its scrollable ancestor
        const videos = document.querySelectorAll('video');
        for (const video of videos) {
            const rect = video.getBoundingClientRect();
            // Find the video that's currently visible
            if (rect.top > -100 && rect.top < window.innerHeight / 2) {
                // Walk up to find the scrollable container
                let container = video.parentElement;
                for (let i = 0; i < 15; i++) {
                    if (!container) break;
                    const style = window.getComputedStyle(container);
                    const overflow = style.overflow + style.overflowY;
                    if ((overflow.includes('auto') || overflow.includes('scroll')) &&
                        container.scrollHeight > container.clientHeight) {
                        container.scrollBy({
                            top: direction * container.clientHeight,
                            behavior: 'smooth'
                        });
                        return true;
                    }
                    container = container.parentElement;
                }
            }
        }

        // Strategy B: Find any scrollable div that's roughly full-screen
        const divs = document.querySelectorAll('div');
        for (const div of divs) {
            const style = window.getComputedStyle(div);
            const overflow = style.overflow + style.overflowY;
            if ((overflow.includes('auto') || overflow.includes('scroll')) &&
                div.scrollHeight > div.clientHeight + 100 &&
                div.clientHeight > window.innerHeight * 0.7) {
                div.scrollBy({
                    top: direction * div.clientHeight,
                    behavior: 'smooth'
                });
                return true;
            }
        }

        return false;
    }

    // ============================================
    // LIKE REEL
    // ============================================
    function likeReel() {
        // Find Like or Unlike button — always click it (toggles)
        const svgs = document.querySelectorAll('svg[aria-label]');
        for (const svg of svgs) {
            const label = svg.getAttribute('aria-label') || '';

            if (label === 'Like' || label === 'like' ||
                label === 'Unlike' || label === 'unlike') {
                const btn = svg.closest('button') ||
                            svg.closest('[role="button"]') ||
                            svg.closest('div[tabindex]') ||
                            svg.parentElement;
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 &&
                        rect.top >= 0 && rect.bottom <= window.innerHeight + 50) {
                        btn.click();
                        console.log("❤️ Toggled like via aria-label:", label);
                        showFeedback("❤️ Like toggled!", "#ef4444");
                        return;
                    }
                }
            }
        }

        // Fallback: Double-click the video to like
        const videos = document.querySelectorAll('video');
        for (const video of videos) {
            const rect = video.getBoundingClientRect();
            if (rect.top > -100 && rect.top < window.innerHeight / 2) {
                const clickTarget = video.closest('div') || video;
                const dblClick = new MouseEvent('dblclick', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                });
                clickTarget.dispatchEvent(dblClick);
                console.log("❤️ Liked via double-click");
                showFeedback("❤️ Like toggled!", "#ef4444");
                return;
            }
        }

        console.log("❤️ Could not find like button");
        showFeedback("❤️ Like not found", "#888");
    }

    // ============================================
    // SAVE REEL
    // ============================================
    function saveReel() {
        // Find Save or Remove button — always click it (toggles)
        const svgs = document.querySelectorAll('svg[aria-label]');
        for (const svg of svgs) {
            const label = svg.getAttribute('aria-label') || '';
            if (label === 'Save' || label === 'save' ||
                label === 'Remove' || label === 'remove' ||
                label === 'Unsave' || label === 'unsave') {
                const btn = svg.closest('button') ||
                            svg.closest('[role="button"]') ||
                            svg.closest('div[tabindex]') ||
                            svg.parentElement;
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 &&
                        rect.top >= 0 && rect.bottom <= window.innerHeight + 50) {
                        btn.click();
                        console.log("🔖 Toggled save via aria-label:", label);
                        showFeedback("🔖 Save toggled!", "#22c55e");
                        return;
                    }
                }
            }
        }

        console.log("🔖 Could not find save button");
        showFeedback("🔖 Save not found", "#888");
    }

    // ============================================
    // VISUAL FEEDBACK TOAST
    // ============================================
    let feedbackEl = null;
    let feedbackTimeout = null;

    function showFeedback(text, color = "#6366f1") {
        if (!feedbackEl) {
            feedbackEl = document.createElement("div");
            feedbackEl.id = "gesture-scroll-feedback";
            document.body.appendChild(feedbackEl);
        }

        if (feedbackTimeout) clearTimeout(feedbackTimeout);

        feedbackEl.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(0);
            background: ${color};
            color: white;
            padding: 10px 24px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            font-size: 15px;
            font-weight: 700;
            z-index: 999999;
            pointer-events: none;
            opacity: 1;
            transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1);
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px ${color}66;
            letter-spacing: 0.02em;
        `;
        feedbackEl.textContent = text;

        feedbackTimeout = setTimeout(() => {
            feedbackEl.style.opacity = "0";
            feedbackEl.style.transform = "translateX(-50%) translateY(-20px)";
        }, 1200);
    }

    // ============================================
    // MESSAGE LISTENER
    // ============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("📩 Content script received:", message.type);
        switch (message.type) {
            case "SCROLL_NEXT_REEL":
                scrollToNextReel();
                break;
            case "SCROLL_PREV_REEL":
                scrollToPrevReel();
                break;
            case "LIKE_REEL":
                likeReel();
                break;
            case "SAVE_REEL":
                saveReel();
                break;
        }
        sendResponse({ success: true });
        return true;
    });

})();
