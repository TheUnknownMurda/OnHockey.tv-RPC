// Génère assets/goal-light.gif : une lumière de but rouge qui tourne (petite image Discord lors d'un but).
//   node scripts/make-goal-light.js
const path = require('path');
const sharp = require('sharp');

const S = 192;
const C = S / 2;
const FRAMES = 18;

function frame(i) {
  const angle = (360 / FRAMES) * i;
  // Deux faisceaux opposés qui tournent, comme un gyrophare
  const beam = (rot) => `
    <g transform="rotate(${rot} ${C} ${C})">
      <polygon points="${C},${C} ${C - 70},-40 ${C + 70},-40" fill="url(#beam)"/>
    </g>`;
  const pulse = 0.55 + 0.45 * Math.abs(Math.cos((Math.PI * 2 * i) / FRAMES));
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#4a0606"/>
      <stop offset="1" stop-color="#0b0e14"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff3b2f" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ff3b2f" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="dome" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#fff2e8"/>
      <stop offset="0.25" stop-color="#ff6a4d"/>
      <stop offset="0.7" stop-color="#e01b12"/>
      <stop offset="1" stop-color="#7d0905"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ff2a1a" stop-opacity="${0.9 * pulse}"/>
      <stop offset="1" stop-color="#ff2a1a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  ${beam(angle)}${beam(angle + 180)}
  <circle cx="${C}" cy="${C}" r="${C - 6}" fill="url(#glow)"/>
  <rect x="${C - 40}" y="${C + 30}" width="80" height="26" rx="6" fill="#1b1d22" stroke="#3a3d45" stroke-width="3"/>
  <path d="M ${C - 38} ${C + 32} A 38 46 0 0 1 ${C + 38} ${C + 32} Z" fill="url(#dome)"/>
  <ellipse cx="${C - 12}" cy="${C - 2}" rx="9" ry="14" fill="#ffffff" fill-opacity="0.55"/>
</svg>`);
}

(async () => {
  const frames = await Promise.all(Array.from({ length: FRAMES }, (_, i) => sharp(frame(i)).png().toBuffer()));
  const out = path.join(__dirname, '..', 'assets', 'goal-light.gif');
  await sharp(frames, { join: { animated: true } }).gif({ delay: 55, loop: 0, effort: 7 }).toFile(out);
  console.log(`${out} : ${FRAMES} images ${S}×${S}, ${(require('fs').statSync(out).size / 1024).toFixed(0)} Ko`);
})();
