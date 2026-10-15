// Les 32 équipes de la LNH : noms FR/EN, alias utilisés par onhockey.tv et couleurs principales.
const TEAMS = [
  { abbrev: 'ANA', city: 'Anaheim', name: 'Ducks', fr: "Ducks d'Anaheim", color: '#FC4C02', alt: '#000000' },
  { abbrev: 'BOS', city: 'Boston', name: 'Bruins', fr: 'Bruins de Boston', color: '#FFB81C', alt: '#000000' },
  { abbrev: 'BUF', city: 'Buffalo', name: 'Sabres', fr: 'Sabres de Buffalo', color: '#003087', alt: '#FFB81C' },
  { abbrev: 'CAR', city: 'Carolina', name: 'Hurricanes', fr: 'Hurricanes de la Caroline', color: '#CE1126', alt: '#000000', aliases: ['Caroline'] },
  { abbrev: 'CBJ', city: 'Columbus', name: 'Blue Jackets', fr: 'Blue Jackets de Columbus', color: '#002654', alt: '#CE1126' },
  { abbrev: 'CGY', city: 'Calgary', name: 'Flames', fr: 'Flames de Calgary', color: '#C8102E', alt: '#F1BE48' },
  { abbrev: 'CHI', city: 'Chicago', name: 'Blackhawks', fr: 'Blackhawks de Chicago', color: '#CF0A2C', alt: '#000000' },
  { abbrev: 'COL', city: 'Colorado', name: 'Avalanche', fr: 'Avalanche du Colorado', color: '#6F263D', alt: '#236192' },
  { abbrev: 'DAL', city: 'Dallas', name: 'Stars', fr: 'Stars de Dallas', color: '#006847', alt: '#8F8F8C' },
  { abbrev: 'DET', city: 'Detroit', name: 'Red Wings', fr: 'Red Wings de Detroit', color: '#CE1126', alt: '#FFFFFF' },
  { abbrev: 'EDM', city: 'Edmonton', name: 'Oilers', fr: "Oilers d'Edmonton", color: '#FF4C00', alt: '#041E42' },
  { abbrev: 'FLA', city: 'Florida', name: 'Panthers', fr: 'Panthers de la Floride', color: '#C8102E', alt: '#041E42', aliases: ['Floride'] },
  { abbrev: 'LAK', city: 'Los Angeles', name: 'Kings', fr: 'Kings de Los Angeles', color: '#A2AAAD', alt: '#111111', aliases: ['LA Kings', 'L.A.'] },
  { abbrev: 'MIN', city: 'Minnesota', name: 'Wild', fr: 'Wild du Minnesota', color: '#154734', alt: '#A6192E' },
  { abbrev: 'MTL', city: 'Montréal', name: 'Canadiens', fr: 'Canadiens de Montréal', color: '#AF1E2D', alt: '#192168', aliases: ['Habs'] },
  { abbrev: 'NJD', city: 'New Jersey', name: 'Devils', fr: 'Devils du New Jersey', color: '#CE1126', alt: '#000000', aliases: ['NJ Devils'] },
  { abbrev: 'NSH', city: 'Nashville', name: 'Predators', fr: 'Predators de Nashville', color: '#FFB81C', alt: '#041E42' },
  { abbrev: 'NYI', city: 'NY Islanders', name: 'Islanders', fr: 'Islanders de New York', color: '#00539B', alt: '#F47D30', aliases: ['New York Islanders', 'N.Y. Islanders', 'NYI'] },
  { abbrev: 'NYR', city: 'NY Rangers', name: 'Rangers', fr: 'Rangers de New York', color: '#0038A8', alt: '#CE1126', aliases: ['New York Rangers', 'N.Y. Rangers', 'NYR'] },
  { abbrev: 'OTT', city: 'Ottawa', name: 'Senators', fr: "Sénateurs d'Ottawa", color: '#C52032', alt: '#C2912C', aliases: ['Sénateurs'] },
  { abbrev: 'PHI', city: 'Philadelphia', name: 'Flyers', fr: 'Flyers de Philadelphie', color: '#F74902', alt: '#000000', aliases: ['Philadelphie'] },
  { abbrev: 'PIT', city: 'Pittsburgh', name: 'Penguins', fr: 'Penguins de Pittsburgh', color: '#FCB514', alt: '#000000' },
  { abbrev: 'SEA', city: 'Seattle', name: 'Kraken', fr: 'Kraken de Seattle', color: '#99D9D9', alt: '#001628' },
  { abbrev: 'SJS', city: 'San Jose', name: 'Sharks', fr: 'Sharks de San Jose', color: '#006D75', alt: '#EA7200' },
  { abbrev: 'STL', city: 'St. Louis', name: 'Blues', fr: 'Blues de St. Louis', color: '#002F87', alt: '#FCB514', aliases: ['St Louis', 'Saint Louis'] },
  { abbrev: 'TBL', city: 'Tampa Bay', name: 'Lightning', fr: 'Lightning de Tampa Bay', color: '#002868', alt: '#FFFFFF', aliases: ['Tampa'] },
  { abbrev: 'TOR', city: 'Toronto', name: 'Maple Leafs', fr: 'Maple Leafs de Toronto', color: '#00205B', alt: '#FFFFFF' },
  { abbrev: 'UTA', city: 'Utah', name: 'Mammoth', fr: "Mammoth de l'Utah", color: '#6CACE4', alt: '#010101', aliases: ['Utah HC', 'Utah Hockey Club'] },
  { abbrev: 'VAN', city: 'Vancouver', name: 'Canucks', fr: 'Canucks de Vancouver', color: '#00843D', alt: '#00205B' },
  { abbrev: 'VGK', city: 'Vegas', name: 'Golden Knights', fr: 'Golden Knights de Vegas', color: '#B4975A', alt: '#333F42', aliases: ['Las Vegas'] },
  { abbrev: 'WPG', city: 'Winnipeg', name: 'Jets', fr: 'Jets de Winnipeg', color: '#004C97', alt: '#AC162C' },
  { abbrev: 'WSH', city: 'Washington', name: 'Capitals', fr: 'Capitals de Washington', color: '#C8102E', alt: '#041E42' },
];

const BY_ABBREV = new Map(TEAMS.map((t) => [t.abbrev, t]));

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score de correspondance entre un libellé onhockey.tv (« Montréal », « Dallas Stars », « NY Rangers »…) et une équipe.
function matchScore(label, team) {
  const l = normalize(label);
  if (!l) return 0;
  const candidates = [team.city, team.name, `${team.city} ${team.name}`, team.fr, team.abbrev, ...(team.aliases || [])].map(normalize);
  let best = 0;
  for (const c of candidates) {
    if (l === c) return 1;
    // Mot entier contenu dans l'autre (« dallas stars » ⊃ « dallas »).
    const re = (x) => new RegExp(`(^| )${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
    if (c.length >= 3 && re(c).test(l)) best = Math.max(best, 0.8);
    else if (l.length >= 3 && re(l).test(c)) best = Math.max(best, 0.7);
  }
  return best;
}

function findTeam(label) {
  let best = null;
  let bestScore = 0;
  for (const t of TEAMS) {
    const s = matchScore(label, t);
    if (s > bestScore) { best = t; bestScore = s; }
  }
  return bestScore >= 0.7 ? best : null;
}

module.exports = { TEAMS, BY_ABBREV, normalize, matchScore, findTeam };
