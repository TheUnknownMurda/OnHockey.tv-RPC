// 365Scores : utilisé surtout pour la KHL (absente de LiveScore), avec score et période.
const { periodLabel, intermission, startsAt, finalLabel } = require('../format');
const { getJson } = require('./http');

const API = 'https://webws.365scores.com/web';
const COMMON = 'appTypeId=5&langId=1&timezoneName=UTC&userCountryId=2';
const logo = (c) =>
  `https://imagecache.365scores.com/image/upload/f_png,w_256,h_256,c_limit,q_auto:eco,d_Competitors:default1.png/v${c.imageVersion || 1}/Competitors/${c.id}`;

function status(g) {
  const text = String(g.statusText || '');
  let m;
  if (g.statusGroup === 2) return { state: 'pre', text: startsAt(g.startTime) };
  if (g.statusGroup === 4) {
    return { state: 'final', text: finalLabel(/SO|pen/i.test(text) ? 'SO' : /OT/i.test(text) ? 'OT' : null) };
  }
  if (g.statusGroup === 3) {
    if ((m = /(\d)(st|nd|rd|th) Period/i.exec(text))) return { state: 'live', text: periodLabel(+m[1]) };
    if (/overtime/i.test(text)) return { state: 'live', text: 'Prolongation' };
    if (/penalt|shoot/i.test(text)) return { state: 'live', text: 'Tirs de barrage' };
    if (/break|intermission|end of/i.test(text)) {
      const ended = (g.stages || []).filter((s) => s.isEnded && /period/i.test(s.name)).length;
      return { state: 'live', text: ended ? intermission(ended) : 'Entracte' };
    }
    return { state: 'live', text };
  }
  if (/postpon/i.test(text)) return { state: 'other', text: 'Reporté' };
  if (/cancel/i.test(text)) return { state: 'other', text: 'Annulé' };
  return { state: 'other', text };
}

function team(c, started) {
  return {
    id: c.id,
    name: c.name,
    fullName: c.name,
    abbrev: c.symbolicName || null,
    names: [c.name, c.shortName, c.longName, c.symbolicName].filter(Boolean),
    score: started && c.score >= 0 ? c.score : null,
    logo: logo(c),
    color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : null,
  };
}

function toGame(g, countries) {
  const st = status(g);
  const started = st.state !== 'pre';
  const home = team(g.homeCompetitor, started);
  const away = team(g.awayCompetitor, started);
  return {
    provider: '365',
    id: g.id,
    ref: null,
    league: g.competitionDisplayName || '',
    country: countries?.get(g.homeCompetitor.countryId) || '',
    home: g.isHomeAwayInverted ? away : home,
    away: g.isHomeAwayInverted ? home : away,
    state: st.state,
    statusText: st.text,
  };
}

const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

async function list() {
  const now = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const [current, day] = await Promise.all([
    getJson(`${API}/games/current/?${COMMON}&sports=4`),
    getJson(`${API}/games/allscores/?${COMMON}&sports=4&startDate=${ddmmyyyy(yesterday)}&endDate=${ddmmyyyy(now)}&onlyMajorGames=false&withTop=false`).catch(() => null),
  ]);
  const seen = new Map();
  for (const data of [current, day]) {
    if (!data?.games) continue;
    const countries = new Map((data.countries || []).map((c) => [c.id, c.name]));
    for (const g of data.games) if (!seen.has(g.id)) seen.set(g.id, toGame(g, countries));
  }
  return [...seen.values()];
}

async function get(id) {
  const data = await getJson(`${API}/game/?${COMMON}&gameId=${id}`);
  return data?.game ? toGame(data.game) : null;
}

module.exports = { name: '365', list, get };
