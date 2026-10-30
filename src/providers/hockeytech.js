// HockeyTech (LeagueStat) : fil public des sites officiels de l'AHL, de l'ECHL, de la SPHL, de la PWHL, de l'OHL, de la WHL,
// de la LHJMQ (et de la Coupe Memorial), de la USHL et des ligues junior A canadiennes, avec le temps restant à la période,
// le marqueur et les aides.
const { findLeague } = require('../leagues');
const { periodLabel, intermission, clock, startsAt, finalLabel } = require('../format');
const { getJson, localDate } = require('./http');

const FEED = 'https://lscluster.hockeytech.com/feed/index.php';

// Ligue du registre (src/leagues.js) → code client et clé publique qu'utilise le site officiel de la ligue
const CLIENTS = {
  ahl: { code: 'ahl', key: 'ccb91f29d6744675', country: 'USA' },
  echl: { code: 'echl', key: '2c2b89ea7345cae8', country: 'USA' },
  sphl: { code: 'sphl', key: '8fa10d218c49ec96', country: 'USA' },
  pwhl: { code: 'pwhl', key: '694cfeed58c932ee', country: 'Canada' },
  ohl: { code: 'ohl', key: '2976319eb44abe94', country: 'Canada' },
  whl: { code: 'whl', key: '41b145a848f4bd67', country: 'Canada' },
  lhjmq: { code: 'lhjmq', key: 'f322673b6bcae299', country: 'Canada' },
  memorial_cup: { code: 'chl', key: 'ef96ea7d71574f2a', country: 'Canada' },
  ushl: { code: 'ushl', key: 'e828f89b243dc43f', country: 'USA' },
  ojhl: { code: 'ojhl', key: '77a0bd73d9d363d3', country: 'Canada' },
  gohl: { code: 'gojhl', key: '34b10d4d34d7b59a', country: 'Canada' },
  cchl: { code: 'cchl', key: 'b370f3e6c805baf3', country: 'Canada' },
  eojhl: { code: 'eojhl', key: '1defb601c9b37c24', country: 'Canada' },
  mhl_maritimes: { code: 'mhl', key: '4a948e7faf5ee58d', country: 'Canada' },
  mjhl: { code: 'mjhl', key: 'f894c324fe5fd8f0', country: 'Canada' },
  sjhl: { code: 'sjhl', key: '2fb5c2e84bf3e4a8', country: 'Canada' },
  ajhl: { code: 'ajhl', key: 'cbe60a1d91c44ade', country: 'Canada' },
  bchl: { code: 'bchl', key: 'ca4e9e599d4dae55', country: 'Canada' },
  bchc: { code: 'bchc', key: '80a5db2bdb2439da', country: 'Canada' },
  pjhl: { code: 'pjhlbc', key: '5e5fc2923094641d', country: 'Canada' },
  vijhl: { code: 'vijhl', key: '4f1a61df18906b61', country: 'Canada' },
  nwjhl: { code: 'nwjhl', key: 'f01e9acdd0105909', country: 'Canada' },
};

const covers = (league) => Object.hasOwn(CLIENTS, league);

const url = (league, params) => {
  const { code, key } = CLIENTS[league];
  return `${FEED}?${new URLSearchParams({ ...params, key, client_code: code, lang: 'en', fmt: 'json' })}`;
};

// GameStatus : 1 = à venir, 2 = en cours, 3 = terminé (non officiel), 4 = terminé. GameClock = temps restant à la période.
function status(g) {
  const text = String(g.GameStatusStringLong || g.GameStatusString || '');
  const s = Number(g.GameStatus);
  const n = Number(g.Period) || 1;
  if (/postpon/i.test(text)) return { state: 'other', text: 'Reporté' };
  if (/cancel/i.test(text)) return { state: 'other', text: 'Annulé' };
  if (s === 3 || s === 4) return { state: 'final', text: finalLabel(/\bSO\b|shoot/i.test(text) ? 'SO' : /OT/i.test(text) || n > 3 ? 'OT' : null) };
  if (s !== 2) return { state: 'pre', text: startsAt(g.GameDateISO8601) };
  if (/\bSO\b|shoot/i.test(`${g.PeriodNameShort} ${g.PeriodNameLong}`)) return { state: 'live', text: 'Tirs de barrage' };
  if (g.Intermission === '1' || /\bint/i.test(text)) return { state: 'live', text: intermission(n) };
  const label = periodLabel(n);
  // « 12:34 » ou « 00:12:34 »
  const left = String(g.GameClock || '').split(':').slice(-2).join(':');
  if (!left || /^0?0:00$/.test(left)) return { state: 'live', text: `Fin de la ${label.toLowerCase()}` };
  return { state: 'live', text: `${label} · ${clock(left)}` };
}

function team(g, side, league, started) {
  const city = g[`${side}City`];
  const nickname = g[`${side}Nickname`];
  // « Newfoundland, Regiment » (LHJMQ) → « Newfoundland Regiment »
  const fullName = String(g[`${side}LongName`] || '').replace(/,\s*/, ' ').trim() || [city, nickname].filter(Boolean).join(' ');
  const logo = g[`${side}Logo`];
  const goals = g[`${side}Goals`];
  return {
    // Numéros propres à chaque ligue : préfixés pour que les affiches de deux ligues ne se mélangent pas
    id: `${league}-${g[`${side}ID`]}`,
    name: nickname || city || fullName,
    fullName,
    // « Hal », « VdO » (LHJMQ) → « HAL », « VDO »
    abbrev: g[`${side}Code`]?.toUpperCase() || null,
    names: [fullName, city, nickname, g[`${side}Code`]].filter(Boolean),
    score: started && goals !== undefined && goals !== '' ? Number(goals) : null,
    // Le fil donne souvent la vignette 50×50 : le logo plein format est au même endroit, quand il existe
    // (sinon l'affiche échoue et le logo de la ligue la remplace)
    logo: logo ? logo.replace('/50x50/', '/') : null,
    color: null,
  };
}

function toGame(g, league) {
  const st = status(g);
  // Un match reporté garde « 0 » buts dans le fil
  const started = st.state === 'live' || st.state === 'final';
  return {
    provider: 'hockeytech',
    id: g.ID,
    ref: { league, team: g.HomeID },
    league: g.league_name?.trim() || league.toUpperCase(),
    // Le fil ne contient que la ligue regardée : pas de confusion avec les juniors ou les féminines d'un même club (src/match.js)
    leagueId: league,
    country: CLIENTS[league].country,
    home: team(g, 'Home', league, started),
    away: team(g, 'Visitor', league, started),
    state: st.state,
    statusText: st.text,
  };
}

// Journée de matchs précédente et deux suivantes : le fil compte en journées de matchs (une semaine d'écart en PWHL)
// et son « aujourd'hui » ne change qu'en fin de matinée (heure de l'Est).
async function scorebar(league, teamId = '') {
  const data = await getJson(url(league, { feed: 'modulekit', view: 'scorebar', numberofdaysback: 1, numberofdaysahead: 2, team_id: teamId }));
  return (data.SiteKit?.Scorebar || []).map((g) => ({ date: g.Date, game: toGame(g, league) }));
}

const isoDate = (days) => localDate(days).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');

// Matchs du jour, plus ceux de la veille pas encore terminés (fin de soirée sur la côte Ouest).
async function list(session) {
  const league = findLeague(session)?.id;
  if (!covers(league)) return [];
  const [today, yesterday] = [isoDate(0), isoDate(-1)];
  return (await scorebar(league))
    .filter(({ date, game }) => date === today || (date === yesterday && game.state !== 'final'))
    .map(({ game }) => game);
}

// Le fil filtré sur l'équipe locale : quelques matchs au lieu de toute la ligue à chaque rafraîchissement.
async function get(id, ref) {
  return (await scorebar(ref.league, ref.team)).find(({ game }) => game.id === id)?.game || null;
}

const initial = (p) => [p.firstName && `${p.firstName[0]}.`, p.lastName].filter(Boolean).join(' ');
const seconds = (t) => String(t || '').split(':').reduce((sum, x) => sum * 60 + (Number(x) || 0), 0);

// Dernier but du match (marqueur et aides, avec leurs totaux de la saison), ou null.
async function lastGoal(id, ref) {
  const data = await getJson(url(ref.league, { feed: 'statviewfeed', view: 'gameSummary', game_id: id }), { ttl: 5000 });
  const home = String(data?.homeTeam?.info?.id);
  const goals = (data?.periods || []).flatMap((p) =>
    (p.goals || []).map((x) => ({
      side: String(x.team?.id) === home ? 'home' : 'away',
      scorer: [x.scoredBy?.firstName, x.scoredBy?.lastName].filter(Boolean).join(' '),
      total: Number(x.scorerGoalNumber) || null,
      assists: (x.assists || []).map((a, i) => ({ name: initial(a), total: Number(x.assistNumbers?.[i]) || null })),
      strength: x.properties?.isPowerPlay === '1' ? 'pp' : x.properties?.isShortHanded === '1' ? 'sh' : null,
      emptyNet: x.properties?.isEmptyNet === '1',
      period: Number(x.period?.id || p.info?.id) || null,
      // Temps écoulé dans la période
      time: x.time || null,
    })),
  );
  goals.sort((a, b) => a.period - b.period || seconds(a.time) - seconds(b.time));
  return goals.at(-1) || null;
}

module.exports = { name: 'hockeytech', covers, list, get, lastGoal };
