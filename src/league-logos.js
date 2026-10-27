// Mapping des logos de ligues pour Discord Rich Presence (smallImageKey)
// Ces noms correspondent aux assets ajoutés dans l'application Discord
const LEAGUE_LOGOS = {
  // LNH/NHL
  'NHL': 'nhl',
  'LNH': 'nhl',

  // Ligue russes
  'KHL': 'khl',
  'VHL': 'vhl',
  'MHL': 'mhl',
  'RHL': 'rhl',

  // NCAA
  'NCAA Men': 'ncaa_men',
  'NCAA Women': 'ncaa_women',
  'NCAA': 'ncaa_men',

  // Ligues canadiennes juniors
  'AHL': 'ahl',
  'OHL': 'ohl',
  'WHL': 'whl',
  'LHJMQ': 'lhjmq',
  'QMJHL': 'lhjmq',
  'GOHL': 'gohl',
  'EOJHL': 'eojhl',
  'CHL': 'chl',

  // Ligues européennes
  'SHL': 'shl',
  'Liiga': 'liiga',
  'DEL': 'del',
  'Extraliga': 'extraliga',
  'Maxa Liga': 'maxa_liga',
  'Metal Ligaen': 'metal_ligaen',
  'Ligue Magnus': 'ligue_magnus',
  'ICEHL': 'icehl',
  'NL': 'nl',
  'EBEL': 'ebel',

  // Autres
  'EIHL': 'eihl',
  'Beli': 'beli',
  'NLA': 'nla',
  'NLB': 'nlb',
  'FPHL': 'fphl',
  'EWHL': 'ewhl',
};

function getLeagueLogoKey(league) {
  if (!league) return null;
  return LEAGUE_LOGOS[league] || LEAGUE_LOGOS[league.toUpperCase()] || null;
}

module.exports = { getLeagueLogoKey };
