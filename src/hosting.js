// Hébergement des images (Discord n'affiche que des URLs publiques) : chaque image est envoyée une seule fois,
// puis son URL est gardée dans cache/<espace>.json. Hébergeurs, dans l'ordre :
//   1. freeimage.host (images servies par iili.io, que Discord affiche bien ; catbox.moe, lui, apparaît en « ? »)
//   2. pixhost.to, en secours quand freeimage.host est en panne
// Une URL du cache qui ne répond plus (hébergeur en panne, image supprimée) est renvoyée.
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const UA = 'OnHockeyTV-RPC/1.2 (https://github.com/TheUnknownMurda/OnHockey.tv-RPC)';
// Clé publique documentée de l'API freeimage.host
const FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';

const imageBlob = (buffer, filename) => new Blob([buffer], { type: /\.gif$/i.test(filename) ? 'image/gif' : 'image/png' });

async function freeimage(buffer, filename, apiKey) {
  const form = new FormData();
  form.append('key', apiKey || FREEIMAGE_KEY);
  form.append('action', 'upload');
  form.append('format', 'json');
  form.append('source', imageBlob(buffer, filename), filename);
  const res = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  const json = await res.json().catch(() => null);
  const url = json?.image?.url;
  if (!res.ok || !/^https:\/\//.test(url || '')) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return url;
}

// L'API de pixhost.to (https://pixhost.to/api/) ne renvoie que la page et la miniature ;
// le lien direct s'en déduit : https://t3.pixhost.to/thumbs/… → https://img3.pixhost.to/images/…
async function pixhost(buffer, filename) {
  const form = new FormData();
  form.append('img', imageBlob(buffer, filename), filename);
  form.append('content_type', '0');
  form.append('max_th_size', '150');
  const res = await fetch('https://api.pixhost.to/images', {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json().catch(() => null);
  const url = json?.th_url?.replace(/^https:\/\/t(\d+)\.pixhost\.to\/thumbs\//, 'https://img$1.pixhost.to/images/');
  if (!/^https:\/\/img\d+\.pixhost\.to\/images\//.test(url || '')) throw new Error('réponse inattendue');
  return url;
}

const HOSTS = { 'freeimage.host': freeimage, 'pixhost.to': pixhost };

// L'image répond-elle ? true/false, ou null sans réponse (pas de réseau) : on ne conclut rien.
async function probe(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    res.body?.cancel().catch(() => {});
    return res.ok;
  } catch {
    return null;
  }
}

// probe() gardé 30 min par URL ; pendant une nouvelle vérification, l'ancien résultat reste valable.
const CHECK_MS = 30 * 60e3;
const health = new Map(); // url → { ok, at, job }
function alive(url) {
  const h = health.get(url);
  if (h?.job) return h.job;
  if (h && Date.now() - h.at < CHECK_MS) return Promise.resolve(h.ok);
  const job = probe(url).then((ok) => {
    health.set(url, { ok, at: Date.now() });
    return ok;
  });
  health.set(url, { ...h, job });
  return job;
}

// Essaie chaque hébergeur dans l'ordre et garde la première URL qui sert vraiment l'image.
async function upload(buffer, filename, apiKey) {
  const errors = [];
  for (const [name, send] of Object.entries(HOSTS)) {
    try {
      const url = await send(buffer, filename, apiKey);
      const ok = await probe(url);
      if (ok === false) throw new Error(`image introuvable après l'envoi (${url})`);
      health.set(url, { ok, at: Date.now() });
      return { url, errors };
    } catch (err) {
      errors.push(`${name} : ${err.message}`);
    }
  }
  throw new Error(`Échec de l'envoi (${errors.join(' ; ')})`);
}

const indexFile = (space) => path.join(CACHE_DIR, `${space}.json`);
const readIndex = (space) => {
  try { return JSON.parse(fs.readFileSync(indexFile(space), 'utf8')); } catch { return {}; }
};
const pending = new Map();
// Après un échec (hébergeurs en panne), on attend avant de renvoyer la même image
const RETRY_MS = 10 * 60e3;
const failedAt = new Map();

// URL publique de l'image `key` ; `produce()` fournit { buffer, filename } quand il faut l'envoyer.
// Retourne null en cas d'échec (l'appelant choisit alors une image de secours) ; l'envoi n'est
// retenté qu'au bout de RETRY_MS, et non à chaque rafraîchissement.
function hosted(space, key, produce, { log = console, apiKey } = {}) {
  const id = `${space}/${key}`;
  if (pending.has(id)) return pending.get(id);
  const job = (async () => {
    const known = readIndex(space)[key];
    if (known && (await alive(known)) !== false) return known;
    if (Date.now() - (failedAt.get(id) || 0) < RETRY_MS) return null;
    if (known) log.info?.(`[image] ${id}: ${known} ne répond plus, nouvel envoi`);
    try {
      const { buffer, filename } = await produce();
      const { url, errors } = await upload(buffer, filename, apiKey);
      const index = readIndex(space);
      index[key] = url;
      fs.writeFileSync(indexFile(space), JSON.stringify(index, null, 2));
      log.info?.(`[image] ${id} → ${url}${errors.length ? ` (${errors.join(' ; ')})` : ''}`);
      return url;
    } catch (err) {
      failedAt.set(id, Date.now());
      log.warn?.(`[image] ${id}: ${err.message} (nouvel essai dans ${RETRY_MS / 60e3} min)`);
      return null;
    }
  })().finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

// URL déjà hébergée (sans attendre), sinon undefined. Elle est vérifiée en arrière-plan : si elle ne
// répond plus, elle est écartée et l'appelant passe par hosted(), qui la renvoie.
function cached(space, key) {
  const url = readIndex(space)[key];
  if (!url) return undefined;
  alive(url);
  return health.get(url)?.ok === false ? undefined : url;
}

module.exports = { hosted, cached, CACHE_DIR, RETRY_MS };
