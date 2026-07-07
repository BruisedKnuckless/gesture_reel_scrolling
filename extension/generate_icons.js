// Generate extension icons as PNG files
// Run with: node generate_icons.js

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, "icons");

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Background - rounded rect with gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#6366f1");
    gradient.addColorStop(1, "#8b5cf6");

    const r = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw a pointing finger icon (simplified)
    ctx.fillStyle = "white";
    const cx = size / 2;
    const cy = size / 2;
    const s = size / 128; // scale factor

    // Finger (rectangle with rounded top)
    const fw = 16 * s;
    const fh = 50 * s;
    const fx = cx - fw / 2;
    const fy = cy - fh / 2 - 8 * s;

    ctx.beginPath();
    ctx.moveTo(fx, fy + fh);
    ctx.lineTo(fx, fy + fw / 2);
    ctx.arc(fx + fw / 2, fy + fw / 2, fw / 2, Math.PI, 0);
    ctx.lineTo(fx + fw, fy + fh);
    ctx.closePath();
    ctx.fill();

    // Up arrow above finger
    const arrowY = fy - 4 * s;
    const arrowSize = 10 * s;
    ctx.beginPath();
    ctx.moveTo(cx, arrowY - arrowSize);
    ctx.lineTo(cx - arrowSize * 0.7, arrowY);
    ctx.lineTo(cx + arrowSize * 0.7, arrowY);
    ctx.closePath();
    ctx.fill();

    // Palm base (wider rectangle)
    const pw = 30 * s;
    const ph = 18 * s;
    const px = cx - pw / 2;
    const py = fy + fh;

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + pw, py);
    ctx.lineTo(px + pw, py + ph);
    ctx.quadraticCurveTo(px + pw, py + ph + 6 * s, px + pw - 6 * s, py + ph + 6 * s);
    ctx.lineTo(px + 6 * s, py + ph + 6 * s);
    ctx.quadraticCurveTo(px, py + ph + 6 * s, px, py + ph);
    ctx.closePath();
    ctx.fill();

    const buffer = canvas.toBuffer("image/png");
    const filePath = path.join(iconsDir, `icon${size}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`✅ Generated ${filePath}`);
}

console.log("Done!");
