// Requêtes JSON avec un petit cache (les listes de matchs sont relues à chaque rafraîchissement).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const cache = new Map();
const produced = new WeakMap(); // réponse → moment où la source l'a produite

async function getJson(url, { ttl = 8000 } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${new URL(url).host})`);
  // Certains fils (HockeyTech) répondent en JSONP : « ({…}) »
  const data = JSON.parse((await res.text()).replace(/^\s*\(([\s\S]*)\)\s*;?\s*$/, '$1'));
  // Réponse servie par un CDN : l'en-tête Age dit depuis combien de secondes elle attend dans son cache
  if (data && typeof data === 'object') produced.set(data, Date.now() - (Number(res.headers.get('age')) || 0) * 1000);
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return data;
}

// Date locale au format AAAAMMJJ, décalée de `days` jours.
function localDate(days = 0) {
  const d = new Date(Date.now() + days * 864e5);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Moment (ms) où la source a produit une réponse de getJson : date le chrono qu'elle contient.
const producedAt = (data) => produced.get(data) ?? Date.now();

module.exports = { getJson, localDate, producedAt };
