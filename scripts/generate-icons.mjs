#!/usr/bin/env node
// Regenerate the FH brand icon at every size the app needs.
//
// Outputs:
//   public/icon-192.png  — PWA manifest "regular"
//   public/icon-512.png  — PWA manifest "large", iOS home screen
//   public/icon-180.png  — apple-touch-icon (iOS Safari)
//   public/favicon.png   — browser tab fallback for older browsers
//
// Re-run: `node scripts/generate-icons.mjs` after tweaking the SVG.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(PROJECT_ROOT, "public");
const APP_DIR = join(PROJECT_ROOT, "app");

// FH glyph drawn as simple rectangles — no font dependency, looks the
// same on every system. Coordinates fit a 512×512 viewBox centred.
//
// F: left vertical bar, top horizontal bar, middle horizontal bar.
// H: left vertical bar, right vertical bar, middle horizontal bar.
//
// Bar thickness 50px, letter height 280px, letter width 160px, gap 60px.
function svgFor(size = 512) {
  const FG = "#A3E635";     // lime green to match the user's image
  const BG = "#000000";     // pure black like the image
  // The viewBox is 512×512; outputs scale to `size` automatically.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g fill="${FG}">
    <!-- F: vertical -->
    <rect x="116" y="116" width="50" height="280" rx="2"/>
    <!-- F: top horizontal -->
    <rect x="116" y="116" width="160" height="50" rx="2"/>
    <!-- F: middle horizontal -->
    <rect x="116" y="246" width="125" height="46" rx="2"/>
    <!-- H: left vertical -->
    <rect x="296" y="116" width="50" height="280" rx="2"/>
    <!-- H: right vertical -->
    <rect x="396" y="116" width="50" height="280" rx="2"/>
    <!-- H: middle horizontal -->
    <rect x="296" y="241" width="150" height="46" rx="2"/>
  </g>
</svg>`;
}

const targets = [
  // PWA manifest icons — served from public/
  { dir: PUBLIC_DIR, name: "icon-512.png", px: 512 },
  { dir: PUBLIC_DIR, name: "icon-192.png", px: 192 },
  { dir: PUBLIC_DIR, name: "icon-180.png", px: 180 },
  { dir: PUBLIC_DIR, name: "favicon.png",  px: 64  },
  // Next 13+ file-based conventions — auto-served from app/
  // Next looks at app/icon.png for the browser tab icon and
  // app/apple-icon.png for the iOS home screen.
  { dir: APP_DIR,    name: "icon.png",        px: 512 },
  { dir: APP_DIR,    name: "apple-icon.png",  px: 180 },
];

for (const t of targets) {
  const svg = svgFor(t.px);
  const png = await sharp(Buffer.from(svg)).resize(t.px, t.px).png().toBuffer();
  await writeFile(join(t.dir, t.name), png);
  const rel = t.dir === PUBLIC_DIR ? "public" : "app";
  console.log(`✓ Wrote ${rel}/${t.name} (${t.px}×${t.px})`);
}
console.log("\nDone. If the look is wrong, edit svgFor() in this file and re-run.");
