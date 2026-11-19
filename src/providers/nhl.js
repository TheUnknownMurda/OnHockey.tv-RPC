// LNH : API officielle (api-web.nhle.com), avec le temps restant à la période et les tirs au but.
const { BY_ABBREV, fullName } = require('../teams');
const { periodLabel, intermission, clock, startsAt, finalLabel } = require('../format');
const { getJson, producedAt } = require('./http');

const API = 'https://api-web.nhle.com/v1';
const INTERMISSION_SECONDS = 17 * 60;

function team(t) {
  const info = BY_ABBREV.get(t.abbrev);
  const nickname = info?.name || t.name?.default || t.abbrev;
  return {
    id: t.abbrev,
    name: nickname,
    fullName: info ? fullName(info) : nickname,
    abbrev: t.abbrev,
    names: info ? [info.city, info.name, `${info.city} ${info.name}`, info.fr, info.abbrev, ...(info.aliases || [])] : [nickname, t.abbrev],
    score: t.score ?? null,
    logo: `https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_dark.svg`,
    color: info?.color || null,
    shots: t.sog ?? null,
  };
}

// at : moment où l'API a produit la réponse. Pour la barre de Discord (src/index.js) : clockEnd = moment où le chrono
// en cours (période ou entracte) arrivera à 0:00, clockLength = sa durée en secondes.
function status(g, at = Date.now()) {
  const s = g.gameState;
  const pd = g.periodDescriptor || {};
  if (s === 'FUT' || s === 'PRE') return { state: 'pre', text: startsAt(g.startTimeUTC) };
  if (s === 'FINAL' || s === 'OFF') return { state: 'final', text: finalLabel(g.gameOutcome?.lastPeriodType || pd.periodType) };
  const c = g.clock || {};
  const n = pd.number || g.period || 1;
  const regulation = pd.maxRegulationPeriods || 3;
  const left = c.secondsRemaining;
  if (c.inIntermission) {
    const text = left > 0 ? `${intermission(n)} · ${clock(c.timeRemaining)}` : intermission(n);
    // Entracte de 17 minutes après la 1re et la 2e (durée inconnue avant la prolongation) ;
    // son chrono s'écoule en temps réel, même si running reste à false
    if (!(left > 0) || n >= regulation) return { state: 'live', text };
    return { state: 'live', text, clockEnd: at + left * 1000, clockLength: Math.max(INTERMISSION_SECONDS, left) };
  }
  if (pd.periodType === 'SO') return { state: 'live', text: 'Shootout' };
  const label = periodLabel(n, regulation);
  if (left === 0 && !c.running) return { state: 'live', text: `End of ${label.toLowerCase()}` };
  const text = `${label} · ${clock(c.timeRemaining)}`;
  // Prolongation de 5 minutes, sauf en séries (gameType 3). Chrono pas encore parti : pas de barre.
  const length = pd.periodType === 'OT' && g.gameType !== 3 ? 5 * 60 : 20 * 60;
  if (!Number.isFinite(left) || (!c.running && left >= length)) return { state: 'live', text };
  // Chrono arrêté (sifflet) : le temps restant vaut encore maintenant
  return { state: 'live', text, clockEnd: (c.running ? at : Date.now()) + left * 1000, clockLength: length, clockRunning: !!c.running };
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

function toGame(g, at) {
  const away = team(g.awayTeam);
  const home = team(g.homeTeam);
  const { state, text, clockEnd, clockLength, clockRunning } = status(g, at);
  const shots = away.shots != null && home.shots != null ? ` · Shots: ${away.abbrev} ${away.shots} – ${home.shots} ${home.abbrev}` : '';
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
    clockEnd,
    clockLength,
    clockRunning,
    hover: `${away.name} @ ${home.name}${shots}`,
    url: g.gameCenterLink ? `https://www.nhl.com${g.gameCenterLink}` : null,
    urlLabel: 'Gamecenter NHL.com',
    badge: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
    goals: goals(g),
  };
}

const scoreboard = (date = 'now') => getJson(`${API}/score/${date}`);

// Matchs du jour, plus ceux encore en cours de la veille (fin de soirée sur la côte Ouest).
async function list() {
  const board = await scoreboard('now');
  const games = board.games.map((g) => toGame(g, producedAt(board)));
  if (board.prevDate) {
    const prev = await scoreboard(board.prevDate).catch(() => null);
    if (prev) games.push(...prev.games.filter((g) => g.gameState !== 'OFF').map((g) => toGame(g, producedAt(prev))));
  }
  return games;
}

async function get(id, date) {
  const board = await scoreboard(date || 'now');
  const g = board.games.find((x) => x.id === id);
  return g ? toGame(g, producedAt(board)) : null;
}

module.exports = { name: 'nhl', list, get };
