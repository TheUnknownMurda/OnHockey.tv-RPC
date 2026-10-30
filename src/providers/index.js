// Choisit la source de données selon la ligue affichée sur onhockey.tv, puis trouve le match correspondant.
const nhl = require('./nhl');
const livescore = require('./livescore');
const scores365 = require('./scores365');
const espn = require('./espn');
const { pickGame } = require('../match');

const BY_NAME = { nhl, livescore, 365: scores365, espn };

function sourcesFor(league) {
  const l = String(league || '');
  if (/\bNHL\b|\bLNH\b/i.test(l)) return [nhl];
  if (/NCAA/i.test(l)) return [espn];
  // Ligues russes : absentes de LiveScore
  if (/\b(KHL|VHL|MHL)\b/i.test(l)) return [scores365, livescore];
  return [livescore, scores365];
}

// session : { league, region, teams: [équipe A, équipe B] } tels que lus sur onhockey.tv.
// Retourne { provider, id, ref, flip } ou null.
async function find(session, log) {
  for (const source of sourcesFor(session.league)) {
    let games;
    try {
      games = await source.list(session);
    } catch (err) {
      log?.warn(`[${source.name}] ${err.message}`);
      continue;
    }
    const best = pickGame(session, games);
    if (best) {
      const g = best.game;
      const n = (t) => t.fullName || t.names?.[0];
      return { provider: source.name, id: g.id, ref: g.ref, flip: best.flip, label: `${n(g.away)} @ ${n(g.home)} (${g.league})` };
    }
  }
  return null;
}

// Données à jour du match, avec les équipes dans l'ordre d'onhockey.tv : teams = [A, B].
async function load(match) {
  const g = await BY_NAME[match.provider].get(match.id, match.ref);
  if (!g) return null;
  return { ...g, teams: match.flip ? [g.home, g.away] : [g.away, g.home] };
}

// Dernier but (marqueur, aides…) avec l'équipe exprimée comme dans teams : side = 0 (A) ou 1 (B).
// Null quand la source ne donne pas le détail des buts (365Scores, ESPN).
async function lastGoal(match, game) {
  const goal = game?.goals ? game.goals.at(-1) : await BY_NAME[match.provider].lastGoal?.(match.id, match.ref);
  if (!goal) return null;
  const isHome = goal.side === 'home';
  return { ...goal, side: isHome === !!match.flip ? 0 : 1 };
}

module.exports = { find, load, lastGoal };
