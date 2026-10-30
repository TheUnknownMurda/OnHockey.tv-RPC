// Hébergement des images (Discord n'affiche que des URLs publiques) : chaque image est envoyée une seule fois
// sur freeimage.host, puis son URL est gardée dans cache/<espace>.json.
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Clé publique documentée de l'API freeimage.host (images servies par iili.io, que Discord affiche bien ;
// catbox.moe, lui, apparaît en « ? » dans Discord).
const FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';

async function upload(buffer, filename, apiKey) {
  const type = /\.gif$/i.test(filename) ? 'image/gif' : 'image/png';
  const form = new FormData();
  form.append('key', apiKey || FREEIMAGE_KEY);
  form.append('action', 'upload');
  form.append('format', 'json');
  form.append('source', new Blob([buffer], { type }), filename);
  const res = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  const json = await res.json().catch(() => null);
  const url = json?.image?.url;
  if (!res.ok || !/^https:\/\//.test(url || '')) {
    throw new Error(`Échec de l'envoi sur freeimage.host: ${json?.error?.message || `HTTP ${res.status}`}`);
  }
  return url;
}

const indexFile = (space) => path.join(CACHE_DIR, `${space}.json`);
const readIndex = (space) => {
  try { return JSON.parse(fs.readFileSync(indexFile(space), 'utf8')); } catch { return {}; }
};
const pending = new Map();

// URL publique de l'image `key` ; `produce()` fournit { buffer, filename } la première fois.
// Retourne null en cas d'échec (l'appelant choisit alors une image de secours).
function hosted(space, key, produce, { log = console, apiKey } = {}) {
  const known = readIndex(space)[key];
  if (known) return Promise.resolve(known);
  const id = `${space}/${key}`;
  if (pending.has(id)) return pending.get(id);
  const job = (async () => {
    try {
      const { buffer, filename } = await produce();
      const url = await upload(buffer, filename, apiKey);
      const index = readIndex(space);
      index[key] = url;
      fs.writeFileSync(indexFile(space), JSON.stringify(index, null, 2));
      log.info?.(`[image] ${id} → ${url}`);
      return url;
    } catch (err) {
      log.warn?.(`[image] ${id}: ${err.message}`);
      return null;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, job);
  return job;
}

// Valeur déjà connue (sans attendre) : URL, null si l'envoi a échoué, undefined si pas encore tenté.
const cached = (space, key) => readIndex(space)[key];

module.exports = { hosted, cached, CACHE_DIR };
