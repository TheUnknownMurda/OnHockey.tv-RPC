const { findLeague } = require('./leagues');

// Rapproche un match d'onhockey.tv (« Brynäs IF - Djurgårdens IF », ligue « SHL ») d'un match d'une source de données,
// malgré les variantes d'écriture (« Brynaes », « Djurgaarden », « Kr. Sovetov », « Boston C »…).

const STOP = new Set(['hc', 'hk', 'if', 'ik', 'bk', 'ec', 'sc', 'ehc', 'ev', 'fc', 'ks', 'sk', 'tj', 'hockey', 'club', 'team', 'the', 'de', 'du', 'la', 'le', 'of']);

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    // Translittérations courantes : « Brynaes » = « Brynäs », « Luleaa » = « Luleå », « Kitzbuehel » = « Kitzbühel »
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/aa/g, 'a')
    .trim();
}

const tokens = (s) => normalize(s).split(' ').filter((t) => t && !STOP.has(t));

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function tokenSim(a, b) {
  if (a === b) return 1;
  // Abréviation : « kr » ↔ « krylya », « c » ↔ « college »
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let sim = 0;
  if (long.startsWith(short)) sim = short.length >= 2 ? 0.75 : 0.5;
  // Petite différence d'orthographe : « slavutich » ↔ « slavutych », « djurgardens » ↔ « djurgarden »
  if (short.length >= 5) {
    const ratio = 1 - levenshtein(a, b) / long.length;
    if (ratio >= 0.8) sim = Math.max(sim, ratio * 0.9);
  }
  return sim;
}

// Similarité entre deux noms, de 0 à 1.
function nameSim(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) return 0;
  if (A.join(' ') === B.join(' ')) return 1;
  const cover = (X, Y) => X.reduce((sum, x) => sum + Math.max(...Y.map((y) => tokenSim(x, y))), 0) / X.length;
  const ab = cover(A, B);
  const ba = cover(B, A);
  return 0.65 * Math.max(ab, ba) + 0.35 * Math.min(ab, ba);
}

// Meilleure similarité entre le libellé onhockey.tv et les différents noms connus d'une équipe.
const teamSim = (label, team) => Math.max(0, ...(team.names || [team.name, team.fullName, team.abbrev]).filter(Boolean).map((n) => nameSim(label, n)));

// Noms de ligues abrégés sur onhockey.tv
const LEAGUE_ALIASES = {
  alpshl: 'alps hockey league',
  icehl: 'ice hockey league',
  nl: 'national league',
  sl: 'swiss league',
  'tipsport extraliga': 'extraliga',
  'pro hokei ligasy': 'kazakhstan championship',
  'ncaa d1 men': 'ncaa mens college hockey',
  'ncaa d1 women': 'ncaa womens college hockey',
};

// Régions du filtre d'onhockey.tv (classe du <tbody>) → pays des sources
const REGIONS = {
  NA: ['usa', 'canada', 'united states'],
  RU: ['russia', 'kazakhstan', 'belarus'],
  FI: ['finland'],
  SE: ['sweden'],
  CZ: ['czech', 'czechia', 'slovakia'],
  DK: ['denmark', 'norway', 'iceland'],
  CH: ['switzerland', 'germany', 'france', 'netherlands', 'belgium', 'luxembourg'],
  AT: ['austria', 'italy', 'hungary', 'romania', 'slovenia', 'croatia', 'serbia', 'international'],
  LV: ['latvia', 'lithuania', 'estonia', 'poland', 'ukraine'],
  OTH: ['england', 'united kingdom', 'great britain', 'scotland', 'australia', 'japan', 'asia'],
  INT: ['international', 'world', 'europe'],
};

function leagueBonus(session, game) {
  let bonus = 0;
  // Noms connus de la ligue : celui d'onhockey.tv, son alias, et ceux des sources (registre des ligues)
  const known = findLeague(session);
  const wanted = [LEAGUE_ALIASES[normalize(session.league)] || session.league, ...(known?.aka || [])].filter(Boolean);
  if (game.league && wanted.some((w) => nameSim(w, game.league) >= 0.6)) bonus += 0.35;
  // Régions : « NAp » / « NAj » (pro / junior) → « NA »
  const countries = REGIONS[session.region] || REGIONS[String(session.region || '').slice(0, 2).toUpperCase()] || [];
  const country = normalize(game.country);
  if (country && countries.some((c) => country.includes(c))) bonus += 0.15;
  return bonus;
}

// Juniors et féminines portent souvent le même nom que le club senior masculin (« Žilina », « Lausanne HC »).
const JUNIOR = /\b(u ?1[5-9]|u ?2[01]|j ?1[8-9]|j ?20|juniors?|juniorov|jrs?|youth|nachwuchs|sm sarja|mhl)\b/;
const WOMEN = /\b(women|womens|w|fem|feminine|damen|naiset|dam|zeny|ladies)\b/;
const has = (re, ...parts) => re.test(normalize(parts.join(' ')));

// Choisit le match qui correspond le mieux et l'ordre des équipes (celui d'onhockey.tv).
function pickGame(session, games) {
  const [a, b] = session.teams;
  const junior = has(JUNIOR, session.league, a, b);
  const women = has(WOMEN, session.league);
  let best = null;
  for (const g of games) {
    if (has(JUNIOR, g.league, g.home.fullName, g.away.fullName) !== junior) continue;
    if (has(WOMEN, g.league) !== women) continue;
    const direct = [teamSim(a, g.away), teamSim(b, g.home)];
    const swapped = [teamSim(a, g.home), teamSim(b, g.away)];
    const flip = swapped[0] + swapped[1] > direct[0] + direct[1];
    const sides = flip ? swapped : direct;
    const score = sides[0] + sides[1] + leagueBonus(session, g);
    // Une équipe ne joue qu'un match par jour : un seul nom bien reconnu + la bonne ligue suffit.
    if (Math.max(...sides) < 0.7 || score < 1.25) continue;
    if (!best || score > best.score) best = { game: g, flip, score };
  }
  return best;
}

module.exports = { normalize, nameSim, teamSim, pickGame };
