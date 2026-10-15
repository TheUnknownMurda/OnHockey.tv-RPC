// ESPN : hockey universitaire américain (NCAA hommes et femmes), avec le temps restant à la période.
const { periodLabel, intermission, clock, startsAt, finalLabel } = require('../format');
const { getJson, localDate } = require('./http');

const API = 'https://site.api.espn.com/apis/site/v2/sports/hockey';

function status(e) {
  const st = e.competitions[0].status;
  const detail = String(st.type?.detail || '');
  const n = st.period || 1;
  if (st.type?.state === 'pre') return { state: 'pre', text: startsAt(e.date) };
  if (st.type?.state === 'post') return { state: 'final', text: finalLabel(/SO|shootout/i.test(detail) ? 'SO' : /OT/i.test(detail) ? 'OT' : null) };
  if (/intermission|end of/i.test(detail)) return { state: 'live', text: intermission(Math.min(n, 3)) };
  if (/shootout/i.test(detail)) return { state: 'live', text: 'Tirs de barrage' };
  return { state: 'live', text: `${periodLabel(n)} · ${clock(st.displayClock)}` };
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

function toGame(e, path, date) {
  const st = status(e);
  const started = st.state !== 'pre';
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
    state: st.state,
    statusText: st.text,
    url: link || null,
    urlLabel: 'Match sur ESPN',
  };
}

const board = async (path, date) => (await getJson(`${API}/${path}/scoreboard?dates=${date}&limit=200`)).events.map((e) => toGame(e, path, date));

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
