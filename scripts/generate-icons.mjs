#!/usr/bin/env node
// Regenerate every site icon size from a single source PNG.
//
// Source: scripts/icon-source.png  (originally derived from the user's
// finance_favicon.ico via `sips -s format png -Z 512 finance_favicon.ico`).
//
// Outputs:
//   app/icon.png              — Next 13+ browser tab (512×512)
//   app/apple-icon.png        — iOS Add to Home Screen (180×180)
//   app/favicon.ico           — left in place; tracked separately (it's the original)
//   public/icon-512.png       — PWA manifest "large"
//   public/icon-192.png       — PWA manifest "regular"
//   public/icon-180.png       — apple-touch-icon fallback
//   public/favicon.png        — legacy browser fallback (64×64)
//
// Re-run: `node scripts/generate-icons.mjs` after replacing icon-source.png.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SOURCE      = join(__dirname, "icon-source.png");
const PUBLIC_DIR  = join(PROJECT_ROOT, "public");
const APP_DIR     = join(PROJECT_ROOT, "app");

const targets = [
  { dir: PUBLIC_DIR, name: "icon-512.png",     px: 512 },
  { dir: PUBLIC_DIR, name: "icon-192.png",     px: 192 },
  { dir: PUBLIC_DIR, name: "icon-180.png",     px: 180 },
  { dir: PUBLIC_DIR, name: "favicon.png",      px: 64  },
  { dir: APP_DIR,    name: "icon.png",         px: 512 },
  { dir: APP_DIR,    name: "apple-icon.png",   px: 180 },
];

for (const t of targets) {
  const png = await sharp(SOURCE)
    .resize(t.px, t.px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  await writeFile(join(t.dir, t.name), png);
  const rel = t.dir === PUBLIC_DIR ? "public" : "app";
  console.log(`✓ Wrote ${rel}/${t.name} (${t.px}×${t.px})`);
}
console.log("\nDone. (favicon.ico in app/ is the original file from the user, left untouched.)");
