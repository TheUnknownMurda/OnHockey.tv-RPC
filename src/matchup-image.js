// Génère l'image « Équipe A  VS.  Équipe B » avec les logos officiels, puis l'héberge
// (Discord n'accepte que des URLs publiques pour les images de Rich Presence).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const SIZE = 512;
const LOGO = 280;
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const LOGO_DIR = path.join(CACHE_DIR, 'logos');
const IMG_DIR = path.join(CACHE_DIR, 'matchups');
const INDEX_FILE = path.join(CACHE_DIR, 'matchups.json');

for (const d of [CACHE_DIR, LOGO_DIR, IMG_DIR]) fs.mkdirSync(d, { recursive: true });

function readIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return {}; }
}
function writeIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Télécharge un logo (SVG ou PNG) une seule fois, puis le contient dans un carré LOGO×LOGO.
async function getLogo(url) {
  const file = path.join(LOGO_DIR, crypto.createHash('sha1').update(url).digest('hex').slice(0, 16));
  if (!fs.existsSync(file)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Logo introuvable (HTTP ${res.status}) : ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const raw = fs.readFileSync(file);
  const isSvg = /\.svg($|\?)/i.test(url) || /<svg[\s>]/i.test(raw.subarray(0, 2048).toString('utf8'));
  return sharp(raw, { density: isSvg ? 600 : 72 })
    .resize(LOGO, LOGO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

// Couleur dominante d'un logo (hors transparent, noir et blanc), pour teinter le fond quand la source n'en donne pas.
async function logoColor(png) {
  const { data } = await sharp(png).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const max = Math.max(r, g, b);
    const sat = max ? (max - Math.min(r, g, b)) / max : 0;
    if (a < 160 || max < 40 || (sat < 0.2 && max > 200)) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    Object.assign(bin, { n: bin.n + 1, r: bin.r + r, g: bin.g + g, b: bin.b + b, sat: bin.sat + sat });
    bins.set(key, bin);
  }
  let best = null;
  for (const bin of bins.values()) if (!best || bin.n * (0.3 + bin.sat / bin.n) > best.n * (0.3 + best.sat / best.n)) best = bin;
  if (!best) return '#3a3f4b';
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

function backgroundSvg(away, home) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${away.color}" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#0b0e14" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="h" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${home.color}" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#0b0e14" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#0b0e14"/>
  <polygon points="0,0 ${SIZE},0 0,${SIZE}" fill="url(#a)"/>
  <polygon points="${SIZE},0 ${SIZE},${SIZE} 0,${SIZE}" fill="url(#h)"/>
  <line x1="${SIZE}" y1="0" x2="0" y2="${SIZE}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="6"/>
</svg>`);
}

function vsSvg() {
  const c = SIZE / 2;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <circle cx="${c}" cy="${c}" r="58" fill="#0b0e14" stroke="#ffffff" stroke-width="6"/>
  <text x="${c}" y="${c + 17}" text-anchor="middle" font-family="Arial Black, Impact, Arial" font-weight="900"
        font-size="48" fill="#ffffff" letter-spacing="-1">VS.</text>
</svg>`);
}

// sides : [{ logo: URL, color }, { logo, color }] — la première équipe en haut à gauche, la seconde en bas à droite.
async function renderMatchup(key, sides) {
  const logos = await Promise.all(sides.map((s) => getLogo(s.logo)));
  const colors = await Promise.all(sides.map((s, i) => s.color || logoColor(logos[i])));
  const file = path.join(IMG_DIR, `${key.replace(/[^\w-]+/g, '_')}.png`);
  await sharp(backgroundSvg({ color: colors[0] }, { color: colors[1] }))
    .composite([
      { input: logos[0], left: 8, top: 8 },
      { input: logos[1], left: SIZE - LOGO - 8, top: SIZE - LOGO - 8 },
      { input: vsSvg(), left: 0, top: 0 },
    ])
    .png()
    .toFile(file);
  return file;
}

// Clé publique documentée de l'API freeimage.host (images servies par iili.io, que Discord affiche bien ;
// catbox.moe, lui, apparaît en « ? » dans Discord).
const FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';

// Hébergement anonyme et permanent (une seule fois par affiche, puis mis en cache).
async function upload(file, apiKey = FREEIMAGE_KEY) {
  const form = new FormData();
  form.append('key', apiKey);
  form.append('action', 'upload');
  form.append('format', 'json');
  form.append('source', new Blob([fs.readFileSync(file)], { type: 'image/png' }), path.basename(file));
  const res = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: form });
  const json = await res.json().catch(() => null);
  const url = json?.image?.url;
  if (!res.ok || !/^https:\/\//.test(url || '')) {
    throw new Error(`Échec de l'envoi sur freeimage.host: ${json?.error?.message || `HTTP ${res.status}`}`);
  }
  return url;
}

const pending = new Map();

// Retourne l'URL publique de l'affiche, ou null si impossible (l'appelant utilise alors l'image de secours).
async function getMatchupImageUrl(key, sides, { log = console, apiKey } = {}) {
  const index = readIndex();
  if (index[key]) return index[key];
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    try {
      const file = await renderMatchup(key, sides);
      const url = await upload(file, apiKey || undefined);
      const idx = readIndex();
      idx[key] = url;
      writeIndex(idx);
      log.info?.(`[image] ${key} → ${url}`);
      return url;
    } catch (err) {
      log.warn?.(`[image] ${key}: ${err.message}`);
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}

module.exports = { renderMatchup, getMatchupImageUrl };
