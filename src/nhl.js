// Accès à l'API publique de la LNH (api-web.nhle.com) : trouver le match regardé et formater son état en français.
const { BY_ABBREV, matchScore } = require('./teams');

const API = 'https://api-web.nhle.com/v1';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'OnHockey.tv-RPC' } });
  if (!res.ok) throw new Error(`NHL API HTTP ${res.status} (${url})`);
  return res.json();
}

async function fetchScoreboard(date = 'now') {
  return getJson(`${API}/score/${date}`);
}

function teamLabels(t) {
  const info = BY_ABBREV.get(t.abbrev);
  return info || { abbrev: t.abbrev, city: '', name: t.name?.default || t.abbrev, fr: t.name?.default || t.abbrev };
}

function scoreGame(labels, game) {
  const away = teamLabels(game.awayTeam);
  const home = teamLabels(game.homeTeam);
  const [a, b] = labels;
  const direct = matchScore(a, away) + matchScore(b, home);
  const swapped = matchScore(a, home) + matchScore(b, away);
  return Math.max(direct, swapped);
}

// labels : les deux noms tels qu'affichés par onhockey.tv, ex. ["Montréal", "Washington"].
async function findGame(labels) {
  const board = await fetchScoreboard('now');
  let best = pickBest(labels, board.games);
  if (!best && board.prevDate) {
    // Matchs de fin de soirée (côte Ouest) qui débordent après le changement de date de l'API.
    const prev = await fetchScoreboard(board.prevDate);
    best = pickBest(labels, prev.games.filter((g) => g.gameState !== 'OFF'));
  }
  return best;
}

function pickBest(labels, games = []) {
  let best = null;
  let bestScore = 0;
  for (const g of games) {
    const s = scoreGame(labels, g);
    if (s > bestScore) { best = g; bestScore = s; }
  }
  // Une équipe ne joue qu'un match par jour : une seule correspondance solide suffit.
  return bestScore >= 0.8 ? best : null;
}

async function fetchGame(gameId, gameDate) {
  const board = await fetchScoreboard(gameDate || 'now');
  return board.games.find((g) => g.id === gameId) || null;
}

const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);
const clock = (t) => String(t || '').replace(/^0(\d)/, '$1');

function periodName(game) {
  const pd = game.periodDescriptor || {};
  const n = pd.number || game.period || 1;
  const reg = pd.maxRegulationPeriods || 3;
  if (pd.periodType === 'SO') return 'Tirs de barrage';
  if (pd.periodType === 'OT') {
    const ot = n - reg;
    return ot <= 1 ? 'Prolongation' : `${ot}e prolongation`;
  }
  return `${ordinal(n)} période`;
}

function formatStartTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
}

// Texte d'état : période / temps restant / entracte / final.
function statusText(game) {
  const s = game.gameState;
  if (s === 'FUT' || s === 'PRE') return `Début à ${formatStartTime(game.startTimeUTC)}`;
  if (s === 'FINAL' || s === 'OFF') {
    const last = game.gameOutcome?.lastPeriodType || game.periodDescriptor?.periodType;
    if (last === 'OT') return 'Final (prol.)';
    if (last === 'SO') return 'Final (t.b.)';
    return 'Final';
  }
  const c = game.clock || {};
  if (c.inIntermission) {
    const n = game.periodDescriptor?.number || game.period || 1;
    const label = n === 1 ? '1er entracte' : `${n}e entracte`;
    return c.secondsRemaining > 0 ? `${label} · ${clock(c.timeRemaining)}` : label;
  }
  if (game.periodDescriptor?.periodType === 'SO') return 'Tirs de barrage';
  if (c.secondsRemaining === 0 && !c.running) return `Fin de la ${periodName(game)}`;
  return `${periodName(game)} · ${clock(c.timeRemaining)}`;
}

function scoreLine(game) {
  const a = game.awayTeam;
  const h = game.homeTeam;
  if (a.score == null || h.score == null) return `${a.abbrev} @ ${h.abbrev}`;
  return `${a.abbrev} ${a.score} – ${h.score} ${h.abbrev}`;
}

function describe(game) {
  const away = teamLabels(game.awayTeam);
  const home = teamLabels(game.homeTeam);
  const hasShots = game.awayTeam.sog != null && game.homeTeam.sog != null;
  return {
    id: game.id,
    gameDate: game.gameDate,
    state: game.gameState,
    away,
    home,
    details: `${away.name} vs ${home.name}`,
    status: `${scoreLine(game)} · ${statusText(game)}`,
    fullTitle: `${away.fr} @ ${home.fr}`,
    shots: hasShots ? `Tirs : ${game.awayTeam.abbrev} ${game.awayTeam.sog} – ${game.homeTeam.sog} ${game.homeTeam.abbrev}` : null,
    url: game.gameCenterLink ? `https://www.nhl.com/fr${game.gameCenterLink}` : null,
    finished: game.gameState === 'FINAL' || game.gameState === 'OFF',
  };
}

module.exports = { findGame, fetchGame, describe, statusText };
