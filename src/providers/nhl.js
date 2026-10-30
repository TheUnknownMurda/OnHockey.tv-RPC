// LNH : API officielle (api-web.nhle.com), avec le temps restant à la période et les tirs au but.
const { BY_ABBREV } = require('../teams');
const { periodLabel, intermission, clock, startsAt, finalLabel } = require('../format');
const { getJson } = require('./http');

const API = 'https://api-web.nhle.com/v1';

function team(t) {
  const info = BY_ABBREV.get(t.abbrev);
  const nickname = info?.name || t.name?.default || t.abbrev;
  return {
    id: t.abbrev,
    name: nickname,
    fullName: info?.fr || nickname,
    abbrev: t.abbrev,
    names: info ? [info.city, info.name, `${info.city} ${info.name}`, info.fr, info.abbrev, ...(info.aliases || [])] : [nickname, t.abbrev],
    score: t.score ?? null,
    logo: `https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_dark.svg`,
    color: info?.color || null,
    shots: t.sog ?? null,
  };
}

function status(g) {
  const s = g.gameState;
  const pd = g.periodDescriptor || {};
  if (s === 'FUT' || s === 'PRE') return { state: 'pre', text: startsAt(g.startTimeUTC) };
  if (s === 'FINAL' || s === 'OFF') return { state: 'final', text: finalLabel(g.gameOutcome?.lastPeriodType || pd.periodType) };
  const c = g.clock || {};
  const n = pd.number || g.period || 1;
  if (c.inIntermission) {
    return { state: 'live', text: c.secondsRemaining > 0 ? `${intermission(n)} · ${clock(c.timeRemaining)}` : intermission(n) };
  }
  if (pd.periodType === 'SO') return { state: 'live', text: 'Tirs de barrage' };
  const label = periodLabel(n, pd.maxRegulationPeriods || 3);
  if (c.secondsRemaining === 0 && !c.running) return { state: 'live', text: `Fin de la ${label.toLowerCase()}` };
  return { state: 'live', text: `${label} · ${clock(c.timeRemaining)}` };
}

// Buts du match : marqueur, aides (avec leurs totaux de la saison), avantage/désavantage numérique, filet désert.
function goals(g) {
  return (g.goals || []).map((x) => ({
    side: x.teamAbbrev === g.homeTeam.abbrev ? 'home' : 'away',
    scorer: [x.firstName?.default, x.lastName?.default].filter(Boolean).join(' ') || x.name?.default,
    total: x.goalsToDate ?? null,
    assists: (x.assists || []).map((a) => ({ name: a.name?.default, total: a.assistsToDate ?? null })),
    strength: x.strength === 'pp' || x.strength === 'sh' ? x.strength : null,
    emptyNet: x.goalModifier === 'empty-net',
    period: x.periodDescriptor?.number || x.period,
    time: x.timeInPeriod,
  }));
}

function toGame(g) {
  const away = team(g.awayTeam);
  const home = team(g.homeTeam);
  const { state, text } = status(g);
  const shots = away.shots != null && home.shots != null ? ` · Tirs : ${away.abbrev} ${away.shots} – ${home.shots} ${home.abbrev}` : '';
  return {
    provider: 'nhl',
    id: g.id,
    ref: g.gameDate,
    league: 'NHL',
    country: 'USA',
    away,
    home,
    state,
    statusText: text,
    hover: `${away.fullName} @ ${home.fullName}${shots}`,
    url: g.gameCenterLink ? `https://www.nhl.com/fr${g.gameCenterLink}` : null,
    urlLabel: 'Gamecenter NHL.com',
    badge: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
    goals: goals(g),
  };
}

const scoreboard = (date = 'now') => getJson(`${API}/score/${date}`);

// Matchs du jour, plus ceux encore en cours de la veille (fin de soirée sur la côte Ouest).
async function list() {
  const board = await scoreboard('now');
  const games = board.games.map(toGame);
  if (board.prevDate) {
    const prev = await scoreboard(board.prevDate).catch(() => null);
    if (prev) games.push(...prev.games.filter((g) => g.gameState !== 'OFF').map(toGame));
  }
  return games;
}

async function get(id, date) {
  const board = await scoreboard(date || 'now');
  const g = board.games.find((x) => x.id === id);
  return g ? toGame(g) : null;
}

module.exports = { name: 'nhl', list, get };
