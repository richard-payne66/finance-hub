const sharp = require("sharp");
const path = require("path");

async function makeIcon(size) {
  const s = size;
  const bgR = Math.round(s * 0.22);

  const rx = Math.round(s * 0.225);
  const ry = Math.round(s * 0.13);
  const rw = Math.round(s * 0.55);
  const rh = Math.round(s * 0.68);
  const rr = Math.round(s * 0.025);

  const hh = Math.round(rh * 0.14); // lime header height

  const cy = ry + hh + Math.round(s * 0.045); // content y start
  const lx = rx + Math.round(rw * 0.11);
  const lw = Math.round(rw * 0.78);
  const lg = Math.round(s * 0.044); // gap between lines

  const lh1 = Math.round(s * 0.024); // heading line height
  const lh2 = Math.round(s * 0.018); // body line height
  const lh3 = Math.round(s * 0.022); // total line height
  const lhc = Math.round(lh1 / 2);

  const divY =
    cy + lh1 + lg + lh2 + lg + lh2 + lg + lh2 + Math.round(s * 0.022);
  const totY = divY + Math.round(s * 0.030);

  // Torn-bottom zigzag
  const toothY = ry + rh;
  const toothH = Math.round(s * 0.048);
  const toothW = Math.round(s * 0.040);
  const toothCount = Math.floor(rw / toothW);
  const toothActualW = rw / toothCount;

  let d = `M ${rx} ${toothY}`;
  for (let i = 0; i < toothCount; i++) {
    const tx = rx + i * toothActualW;
    const mx = tx + toothActualW / 2;
    const ex = tx + toothActualW;
    d += ` L ${mx} ${toothY + toothH} L ${ex} ${toothY}`;
  }
  d += " Z";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">

  <!-- Background -->
  <rect width="${s}" height="${s}" rx="${bgR}" fill="#0e0e0e"/>

  <!-- Receipt body -->
  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${rr}" fill="#f4f3ef"/>

  <!-- Lime header band (rounded top, square bottom) -->
  <rect x="${rx}" y="${ry}" width="${rw}" height="${hh + rr}" rx="${rr}" fill="#E6FF00"/>
  <rect x="${rx}" y="${ry + hh}" width="${rw}" height="${rr}" fill="#E6FF00"/>

  <!-- Header label lines (dark, low opacity — logo/title suggestion) -->
  <rect x="${lx}" y="${ry + Math.round(hh * 0.25)}" width="${Math.round(lw * 0.52)}" height="${Math.round(hh * 0.18)}" rx="${Math.round(hh * 0.09)}" fill="#0a0a0a" opacity="0.45"/>
  <rect x="${lx}" y="${ry + Math.round(hh * 0.56)}" width="${Math.round(lw * 0.36)}" height="${Math.round(hh * 0.15)}" rx="${Math.round(hh * 0.08)}" fill="#0a0a0a" opacity="0.3"/>

  <!-- Body line 1 — full width, heading weight -->
  <rect x="${lx}" y="${cy}" width="${lw}" height="${lh1}" rx="${lhc}" fill="#d8d5cc"/>

  <!-- Body lines 2-4 — varying widths -->
  <rect x="${lx}" y="${cy + lh1 + lg}" width="${Math.round(lw * 0.72)}" height="${lh2}" rx="${Math.round(lhc * 0.75)}" fill="#e2dfd8"/>
  <rect x="${lx}" y="${cy + lh1 + lg + lh2 + lg}" width="${Math.round(lw * 0.83)}" height="${lh2}" rx="${Math.round(lhc * 0.75)}" fill="#e2dfd8"/>
  <rect x="${lx}" y="${cy + lh1 + lg + lh2 + lg + lh2 + lg}" width="${Math.round(lw * 0.61)}" height="${lh2}" rx="${Math.round(lhc * 0.75)}" fill="#e2dfd8"/>

  <!-- Divider -->
  <rect x="${lx}" y="${divY}" width="${lw}" height="${Math.max(1, Math.round(s * 0.003))}" fill="#ccc8c0"/>

  <!-- Total row: grey label stub + lime amount pill -->
  <rect x="${lx}" y="${totY}" width="${Math.round(lw * 0.28)}" height="${lh3}" rx="${Math.round(lh3 / 2)}" fill="#d8d5cc"/>
  <rect x="${lx + Math.round(lw * 0.52)}" y="${totY - Math.round(s * 0.005)}" width="${Math.round(lw * 0.48)}" height="${Math.round(lh3 * 1.3)}" rx="${Math.round(lh3 * 0.65)}" fill="#E6FF00"/>

  <!-- Torn-bottom zigzag (background colour punching through) -->
  <path d="${d}" fill="#0e0e0e"/>

</svg>`;

  const outPath = path.join(__dirname, "..", "public", `icon-${size}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`wrote ${outPath}`);
}

Promise.all([makeIcon(512), makeIcon(192)]).catch(console.error);
