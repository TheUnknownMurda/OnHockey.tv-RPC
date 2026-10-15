// Génère l'image « Équipe A  VS.  Équipe B » avec les logos officiels, puis l'héberge
// (Discord n'accepte que des URLs publiques pour les images de Rich Presence).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { BY_ABBREV } = require('./teams');

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

async function getLogo(abbrev) {
  const file = path.join(LOGO_DIR, `${abbrev}_dark.svg`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`);
    if (!res.ok) throw new Error(`Logo ${abbrev} introuvable (HTTP ${res.status})`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  // Rasterise le SVG en haute densité puis le contient dans un carré LOGO×LOGO.
  return sharp(file, { density: 600 })
    .resize(LOGO, LOGO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
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

async function renderMatchup(awayAbbrev, homeAbbrev) {
  const away = BY_ABBREV.get(awayAbbrev);
  const home = BY_ABBREV.get(homeAbbrev);
  if (!away || !home) throw new Error(`Équipe inconnue: ${awayAbbrev} / ${homeAbbrev}`);
  const [awayLogo, homeLogo] = await Promise.all([getLogo(away.abbrev), getLogo(home.abbrev)]);
  const file = path.join(IMG_DIR, `${away.abbrev}-${home.abbrev}.png`);
  await sharp(backgroundSvg(away, home))
    .composite([
      { input: awayLogo, left: 8, top: 8 },
      { input: homeLogo, left: SIZE - LOGO - 8, top: SIZE - LOGO - 8 },
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
async function getMatchupImageUrl(awayAbbrev, homeAbbrev, { log = console, apiKey } = {}) {
  const key = `${awayAbbrev}-${homeAbbrev}`;
  const index = readIndex();
  if (index[key]) return index[key];
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    try {
      const file = await renderMatchup(awayAbbrev, homeAbbrev);
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
