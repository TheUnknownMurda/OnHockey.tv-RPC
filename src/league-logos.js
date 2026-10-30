// Logo de la ligue regardée, dans cet ordre :
//   1. asset téléversé dans l'application Discord (Developer Portal → Rich Presence → Art Assets), nommé comme l'id du registre
//   2. fichier assets/<id>.png du projet
//   3. logo trouvé sur Wikipédia (src/league-logo-urls.json)
//   4. badge généré (sigle de la ligue)
// Les cas 2 à 4 sont mis au carré puis hébergés une seule fois (cache/league-logos.json).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { findLeague } = require('./leagues');
const { hosted, cached } = require('./hosting');
const URLS = require('./league-logo-urls.json');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SIZE = 512;
// Bump quand le rendu change : force un nouvel envoi des images déjà hébergées
const VERSION = 1;
const UA = 'OnHockeyTV-RPC/1.2 (https://github.com/TheUnknownMurda/OnHockey.tv-RPC)';

// Assets de l'application Discord (liste publique), relue toutes les 6 h
let discordAssets = new Set();
let assetsLoadedAt = 0;
async function refreshDiscordAssets(clientId, log) {
  if (Date.now() - assetsLoadedAt < 6 * 3600e3) return;
  assetsLoadedAt = Date.now();
  try {
    const res = await fetch(`https://discord.com/api/v10/oauth2/applications/${clientId}/assets`, { signal: AbortSignal.timeout(10000) });
    const list = await res.json();
    if (Array.isArray(list)) discordAssets = new Set(list.map((a) => a.name));
  } catch (err) {
    assetsLoadedAt = 0;
    log?.warn(`[ligues] assets Discord illisibles : ${err.message}`);
  }
}
const hasDiscordAsset = (name) => discordAssets.has(name);

// Couleur de fond des badges générés selon le type de ligue d'onhockey.tv
const PALETTE = {
  mleagues: ['#1f4e9c', '#0d2350'],
  najunior: ['#0b7a57', '#053a29'],
  eujunior: ['#c0502e', '#5c1f0f'],
  wleagues: ['#8e2a7d', '#3d0f35'],
  federations: ['#3b5068', '#151e29'],
  tournaments: ['#b08419', '#4a3505'],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function badgeSvg(league) {
  const [c1, c2] = PALETTE[league.icon.split('/')[0]] || PALETTE.mleagues;
  const short = league.short || league.name;
  const size = short.length <= 3 ? 190 : short.length <= 4 ? 150 : short.length <= 5 ? 122 : 96;
  const name = league.name.length > 22 ? league.name.slice(0, 21) + '…' : league.name;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="${SIZE}" height="${SIZE}" rx="96" fill="url(#g)"/>
  <rect x="14" y="14" width="${SIZE - 28}" height="${SIZE - 28}" rx="84" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="6"/>
  <ellipse cx="256" cy="118" rx="58" ry="20" fill="#0b0e14"/>
  <rect x="198" y="98" width="116" height="20" fill="#0b0e14"/>
  <ellipse cx="256" cy="98" rx="58" ry="20" fill="#2a2f3a" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
  <text x="256" y="${300 + size * 0.18}" text-anchor="middle" font-family="Arial Black, Impact, Arial" font-weight="900" font-size="${size}" fill="#ffffff">${esc(short)}</text>
  <text x="256" y="452" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="700" font-size="34" fill="#ffffff" fill-opacity="0.85">${esc(name)}</text>
</svg>`);
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return Buffer.from(await res.arrayBuffer());
}

// Logo carré 512×512. Un logo sombre sur fond transparent disparaîtrait sur le thème sombre de Discord :
// il est alors posé sur une tuile blanche arrondie.
async function squareLogo(raw) {
  const logo = await sharp(raw, { density: 300 }).resize(440, 440, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
  const { data } = await sharp(logo).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
  let darkPixels = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 75) darkPixels++;
    n++;
  }
  const transparent = n < 64 * 64 * 0.9; // logo détouré (pas un carré plein)
  const dark = n && darkPixels / n > 0.2;
  const tile = transparent && dark
    ? `<rect width="${SIZE}" height="${SIZE}" rx="96" fill="#ffffff"/>`
    : '';
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${tile}</svg>`);
  return sharp(base).composite([{ input: logo, left: 36, top: 36 }]).png().toBuffer();
}

async function render(league) {
  const local = path.join(ASSETS_DIR, `${league.id}.png`);
  if (fs.existsSync(local)) return squareLogo(fs.readFileSync(local));
  if (URLS[league.id]) {
    try {
      return await squareLogo(await download(URLS[league.id]));
    } catch {
      // Logo Wikipédia introuvable : badge généré
    }
  }
  return sharp(badgeSvg(league)).png().toBuffer();
}

const cacheKey = (league) => `${league.id}@${VERSION}`;
const failedAt = new Map(); // évite de réessayer l'envoi à chaque rafraîchissement si l'hébergeur est indisponible

// { key, text } prêt à l'emploi, ou null si la ligue est inconnue ou que son logo est en cours d'envoi
// (onReady est alors appelé une fois l'envoi terminé).
function leagueLogo(session, { log, apiKey, onReady } = {}) {
  const league = findLeague(session);
  if (!league) return null;
  const text = session.league || league.name;
  if (hasDiscordAsset(league.id)) return { key: league.id, text, league };
  const url = cached('league-logos', cacheKey(league));
  if (url) return { key: url, text, league };
  if (Date.now() - (failedAt.get(league.id) || 0) < 10 * 60e3) return null;
  hosted('league-logos', cacheKey(league), async () => ({ buffer: await render(league), filename: `${league.id}.png` }), { log, apiKey })
    .then((u) => (u ? onReady?.() : failedAt.set(league.id, Date.now())));
  return null;
}

module.exports = { leagueLogo, refreshDiscordAssets, hasDiscordAsset, render, badgeSvg };
