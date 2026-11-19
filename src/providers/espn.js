// ESPN : hockey universitaire américain (NCAA hommes et femmes), avec le temps restant à la période.
const { periodLabel, intermission, clock, startsAt, finalLabel, seconds } = require('../format');
const { getJson, localDate, producedAt } = require('./http');

const API = 'https://site.api.espn.com/apis/site/v2/sports/hockey';

// at : moment où l'API a produit la réponse. Pour la barre de Discord : clockEnd = moment où le chrono de la période
// arrivera à 0:00, clockLength = durée de la période en secondes.
function status(e, at = Date.now()) {
  const st = e.competitions[0].status;
  const detail = String(st.type?.detail || '');
  const n = st.period || 1;
  if (st.type?.state === 'pre') return { state: 'pre', text: startsAt(e.date) };
  if (st.type?.state === 'post') return { state: 'final', text: finalLabel(/SO|shootout/i.test(detail) ? 'SO' : /OT/i.test(detail) ? 'OT' : null) };
  if (/intermission|end of/i.test(detail)) return { state: 'live', text: intermission(Math.min(n, 3)) };
  if (/shootout/i.test(detail)) return { state: 'live', text: 'Shootout' };
  const text = `${periodLabel(n)} · ${clock(st.displayClock)}`;
  // Prolongation : 5 minutes en saison, 20 en séries (déduit du temps restant)
  const left = seconds(st.displayClock);
  const length = n > 3 && left <= 5 * 60 ? 5 * 60 : 20 * 60;
  // 0:00, ou chrono pas encore parti : pas de barre
  if (!st.displayClock || left <= 0 || left >= length) return { state: 'live', text };
  return { state: 'live', text, clockEnd: at + left * 1000, clockLength: length };
}

function team(c, started) {
  const t = c.team;
  return {
    id: t.id,
    name: t.shortDisplayName || t.displayName,
    fullName: t.displayName,
    abbrev: t.abbreviation,
    names: [t.displayName, t.shortDisplayName, t.location, t.abbreviation, t.name].filter(Boolean),
    score: started && c.score !== undefined ? Number(c.score) : null,
    logo: t.logo || null,
    color: /^[0-9a-f]{6}$/i.test(t.color || '') ? `#${t.color}` : null,
  };
}

function toGame(e, path, date, at) {
  const { state, text, clockEnd, clockLength } = status(e, at);
  const started = state !== 'pre';
  const comp = e.competitions[0].competitors;
  const link = (e.links || []).find((l) => (l.rel || []).includes('summary'))?.href;
  return {
    provider: 'espn',
    id: e.id,
    ref: { path, date },
    league: path === 'womens-college-hockey' ? 'NCAA Women' : 'NCAA Men',
    country: 'USA',
    home: team(comp.find((c) => c.homeAway === 'home'), started),
    away: team(comp.find((c) => c.homeAway === 'away'), started),
    state,
    statusText: text,
    clockEnd,
    clockLength,
    url: link || null,
    urlLabel: 'Game on ESPN',
  };
}

async function board(path, date) {
  const data = await getJson(`${API}/${path}/scoreboard?dates=${date}&limit=200`);
  return data.events.map((e) => toGame(e, path, date, producedAt(data)));
}

const pathFor = (league) => (/women|fem/i.test(league || '') ? 'womens-college-hockey' : 'mens-college-hockey');

async function list(session) {
  const path = pathFor(session.league);
  const [today, yesterday] = await Promise.all([board(path, localDate(0)), board(path, localDate(-1)).catch(() => [])]);
  return [...today, ...yesterday.filter((g) => g.state === 'live')];
}

async function get(id, ref) {
  for (const date of [ref.date, localDate(0)]) {
    const g = (await board(ref.path, date)).find((x) => x.id === id);
    if (g) return g;
  }
  return null;
}

module.exports = { name: 'espn', list, get };
