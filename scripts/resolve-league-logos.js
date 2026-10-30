// Cherche sur Wikipédia (anglais) l'URL du logo de chaque ligue du registre (src/leagues.js)
// et l'enregistre dans src/league-logo-urls.json. À relancer quand on ajoute des ligues :
//   node scripts/resolve-league-logos.js
const fs = require('fs');
const path = require('path');
const { LEAGUES } = require('../src/leagues');

const OUT = path.join(__dirname, '..', 'src', 'league-logo-urls.json');
const UA = 'OnHockeyTV-RPC/1.2 (https://github.com/TheUnknownMurda/OnHockey.tv-RPC)';
// Photos d'arénas, de trophées, de joueurs (presque toujours en .jpg) : on ne garde que ce qui ressemble à un logo
const LOGO_HINT = /logo|emblem|wordmark|crest|badge|\.(svg|png)$/i;

async function query(titles) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', redirects: '1', titles: titles.join('|'),
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: '512', pilicense: 'any',
  });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const wanted = LEAGUES.filter((l) => l.wiki);
  const titles = [...new Set(wanted.map((l) => l.wiki))];
  const found = {};
  for (let i = 0; i < titles.length; i += 40) {
    const data = await query(titles.slice(i, i + 40));
    const alias = {};
    for (const r of [...(data.query.normalized || []), ...(data.query.redirects || [])]) alias[r.to] = r.from;
    for (const page of Object.values(data.query.pages || {})) {
      let title = page.title;
      while (alias[title]) title = alias[title];
      if (page.thumbnail?.source && LOGO_HINT.test(page.pageimage || '')) found[title] = page.thumbnail.source.split('?')[0];
    }
  }
  const urls = {};
  for (const l of wanted) if (found[l.wiki]) urls[l.id] = found[l.wiki];
  fs.writeFileSync(OUT, JSON.stringify(urls, null, 2) + '\n');
  const missing = wanted.filter((l) => !urls[l.id]).map((l) => `${l.id} (${l.wiki})`);
  console.log(`${Object.keys(urls).length}/${wanted.length} logos trouvés → ${path.relative(process.cwd(), OUT)}`);
  if (missing.length) console.log('Sans logo :', missing.join(', '));
})();
