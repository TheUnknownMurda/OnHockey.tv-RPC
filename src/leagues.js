// Registre des ligues d'onhockey.tv, identifiées par l'icône affichée à côté du nom de la ligue
// (ex. « pic/ico/mleagues/khl.ico » → « mleagues/khl »). Le nom seul est ambigu : « SHL » (Suède / Slovaquie),
// « OHL » (Ontario / Lettonie), « MHL » (Russie / Maritimes), « WHL » (Canada / féminine russe)…
//
// id    : clé de l'asset Discord et du fichier assets/<id>.png (si présents)
// short : sigle affiché sur le badge généré quand aucun logo n'existe
// wiki  : article Wikipédia (anglais) dont le logo sert quand ni asset ni fichier local n'existe
// logo  : URL du logo trouvée sur Wikipédia (remplie par scripts/resolve-league-logos.js)
const LEAGUES = [
  // Amérique du Nord
  { icon: 'mleagues/nhl', id: 'nhl', name: 'NHL', wiki: 'National Hockey League' },
  { icon: 'mleagues/ahl', id: 'ahl', name: 'AHL', aka: ['American Hockey League'], wiki: 'American Hockey League' },
  { icon: 'mleagues/echl', id: 'echl', name: 'ECHL', wiki: 'ECHL' },
  { icon: 'mleagues/sphl', id: 'sphl', name: 'SPHL', aka: ['Southern Professional Hockey League'], wiki: 'SPHL' },
  { icon: 'mleagues/fphl', id: 'fphl', name: 'FPHL', wiki: 'Federal Prospects Hockey League' },
  { icon: 'wleagues/pwhl', id: 'pwhl', name: 'PWHL', wiki: 'Professional Women\'s Hockey League' },
  { icon: 'najunior/ncaa', id: 'ncaa', name: 'NCAA', wiki: 'National Collegiate Athletic Association' },
  { icon: 'najunior/ohl', id: 'ohl', name: 'OHL', aka: ['Ontario Hockey League'], wiki: 'Ontario Hockey League' },
  { icon: 'najunior/whl', id: 'whl', name: 'WHL', aka: ['Western Hockey League'], wiki: 'Western Hockey League' },
  { icon: 'najunior/qmjhl', id: 'lhjmq', name: 'LHJMQ', aka: ['QMJHL', 'Ligue de hockey junior Maritimes Québec'], wiki: 'Quebec Maritimes Junior Hockey League' },
  { icon: 'najunior/memorialcup', id: 'memorial_cup', name: 'Memorial Cup', short: 'MC', wiki: 'Memorial Cup' },
  { icon: 'najunior/ushl', id: 'ushl', name: 'USHL', wiki: 'United States Hockey League' },
  { icon: 'najunior/ojhl', id: 'ojhl', name: 'OJHL', aka: ['Ontario Junior Hockey League'], wiki: 'Ontario Junior Hockey League' },
  { icon: 'najunior/gohl', id: 'gohl', name: 'GOHL', aka: ['Greater Ontario Hockey League'], wiki: 'Greater Ontario Hockey League' },
  { icon: 'najunior/cchl', id: 'cchl', name: 'CCHL', aka: ['Central Canada Hockey League'], wiki: 'Central Canada Hockey League' },
  { icon: 'najunior/eojhl', id: 'eojhl', name: 'EOJHL', aka: ['Eastern Ontario Junior Hockey League'], wiki: 'Eastern Ontario Junior Hockey League' },
  { icon: 'najunior/mjahl', id: 'mhl_maritimes', name: 'MHL', short: 'MHL', aka: ['Maritime Hockey League'], wiki: 'Maritime Junior Hockey League' },
  { icon: 'najunior/mjhl', id: 'mjhl', name: 'MJHL', aka: ['Manitoba Junior Hockey League'], wiki: 'Manitoba Junior Hockey League' },
  { icon: 'najunior/sjhl', id: 'sjhl', name: 'SJHL', aka: ['Saskatchewan Junior Hockey League'], wiki: 'Saskatchewan Junior Hockey League' },
  { icon: 'najunior/ajhl', id: 'ajhl', name: 'AJHL', aka: ['Alberta Junior Hockey League'], wiki: 'Alberta Junior Hockey League' },
  { icon: 'najunior/bchl', id: 'bchl', name: 'BCHL', aka: ['British Columbia Hockey League'], wiki: 'British Columbia Hockey League' },
  { icon: 'najunior/bchc', id: 'bchc', name: 'BCHC' },
  { icon: 'najunior/pjhl', id: 'pjhl', name: 'PJHL', aka: ['Pacific Junior Hockey League'], wiki: 'Pacific Junior Hockey League' },
  { icon: 'najunior/vijhl', id: 'vijhl', name: 'VIJHL', aka: ['Vancouver Island Junior Hockey League'], wiki: 'Vancouver Island Junior Hockey League' },
  { icon: 'najunior/nwjhl', id: 'nwjhl', name: 'NWJHL', aka: ['North West Junior Hockey League'], wiki: 'North West Junior Hockey League' },

  // Russie, Biélorussie, Kazakhstan
  { icon: 'mleagues/khl', id: 'khl', name: 'KHL', wiki: 'Kontinental Hockey League' },
  { icon: 'mleagues/vhl', id: 'vhl', name: 'VHL', wiki: 'Supreme Hockey League' },
  { icon: 'eujunior/mhl', id: 'mhl', name: 'MHL', wiki: 'Junior Hockey League (Russia)' },
  { icon: 'eujunior/nmhl', id: 'nmhl', name: 'NMHL', wiki: 'National Junior Hockey League' },
  { icon: 'eujunior/rhl', id: 'rhl', name: 'RHL' },
  { icon: 'wleagues/whl', id: 'zhhl', name: 'WHL', short: 'ZhHL', wiki: 'Zhenskaya Hockey League' },
  { icon: 'mleagues/extraleague', id: 'extraleague', name: 'Extraleague', short: 'BXL', wiki: 'Belarusian Extraleague' },
  { icon: 'mleagues/bhl', id: 'bhl', name: 'BHL', wiki: 'Belarusian Vysshaya Liga' },
  { icon: 'wleagues/bwhl', id: 'bwhl', name: 'BWHL' },
  { icon: 'mleagues/prohl', id: 'pro_hokei_ligasy', name: 'Pro Hokei Ligasy', short: 'PHL', aka: ['Championship'], wiki: 'Kazakhstan Hockey Championship' },
  { icon: 'eujunior/jashl', id: 'jas_hokei_ligasy', name: 'Jas Hokei Ligasy', short: 'JHL' },
  { icon: 'wleagues/qyz', id: 'qyz_ligasy', name: 'Qyz Ligasy', short: 'QL' },
  { icon: 'federations/fhr', id: 'fhr', name: 'Russie', short: 'FHR', wiki: 'Ice Hockey Federation of Russia' },
  { icon: 'federations/fhrb', id: 'fhrb', name: 'Biélorussie', short: 'BIHA', wiki: 'Belarus Ice Hockey Association' },

  // Suède, Finlande, Danemark, Norvège, Islande
  { icon: 'mleagues/shl', id: 'shl', name: 'SHL', wiki: 'Swedish Hockey League' },
  { icon: 'mleagues/allsvenskan', id: 'hockeyallsvenskan', name: 'HockeyAllsvenskan', short: 'HA', wiki: 'HockeyAllsvenskan' },
  { icon: 'mleagues/hockeyettan', id: 'hockeyettan', name: 'HockeyEttan', short: 'H1', aka: ['HockeyEttan: Norra', 'HockeyEttan: Soedra'], wiki: 'Hockeyettan' },
  { icon: 'mleagues/hockeytvaan', id: 'hockeytvaan', name: 'HockeyTvåan', short: 'H2', wiki: 'Hockeytvåan' },
  { icon: 'mleagues/hockeytrean', id: 'hockeytrean', name: 'HockeyTrean', short: 'H3', wiki: 'Hockeytrean' },
  { icon: 'mleagues/hockeyfyran', id: 'hockeyfyran', name: 'HockeyFyran', short: 'H4', wiki: 'Hockeyfyran' },
  { icon: 'wleagues/sdhl', id: 'sdhl', name: 'SDHL', wiki: 'Swedish Women\'s Hockey League' },
  { icon: 'wleagues/damettan', id: 'damettan', name: 'NDHL', short: 'NDHL', wiki: 'Damettan' },
  { icon: 'federations/swehockey', id: 'swehockey', name: 'Suède', short: 'SIF', wiki: 'Swedish Ice Hockey Association' },
  { icon: 'mleagues/liiga', id: 'liiga', name: 'Liiga', wiki: 'Liiga' },
  { icon: 'mleagues/mestis', id: 'mestis', name: 'Mestis', aka: ['Mestis Liiga'], wiki: 'Mestis' },
  { icon: 'mleagues/suomisarja', id: 'suomi_sarja', name: 'Suomi-sarja', short: 'SS', aka: ['Sarja'], wiki: 'Suomi-sarja' },
  { icon: 'eujunior/u20smsarja', id: 'u20_sm_sarja', name: 'U20 SM-sarja', short: 'U20', wiki: 'U20 SM-sarja' },
  { icon: 'eujunior/u20mestis', id: 'u20_mestis', name: 'U20 Mestis', short: 'U20' },
  { icon: 'wleagues/auroraliiga', id: 'auroraliiga', name: 'Auroraliiga', short: 'AL', wiki: 'Auroraliiga' },
  { icon: 'federations/suomi', id: 'finhockey', name: 'Finlande', short: 'FIHA', wiki: 'Finnish Ice Hockey Association' },
  { icon: 'mleagues/metal', id: 'metal_ligaen', name: 'Metal Ligaen', short: 'ML', aka: ['Ligaen'], wiki: 'Metal Ligaen' },
  { icon: 'mleagues/ehl', id: 'ehl', name: 'EHL', aka: ['EHL', 'Eliteserien'], wiki: 'Eliteserien (ice hockey)' },
  { icon: 'federations/nihf', id: 'nihf', name: 'Norvège', short: 'NIHF', aka: ['1st Division'], wiki: 'Norwegian Ice Hockey Association' },
  { icon: 'mleagues/toppdeild', id: 'toppdeild', name: 'Toppdeild', short: 'TD', wiki: 'Icelandic Hockey League' },
  { icon: 'federations/ihi', id: 'ihi', name: 'Islande', short: 'IHI', wiki: 'Ice Hockey Iceland' },

  // Tchéquie, Slovaquie
  { icon: 'mleagues/elh', id: 'extraliga', name: 'Tipsport Extraliga', short: 'ELH', aka: ['Extraliga'], wiki: 'Czech Extraliga' },
  { icon: 'mleagues/maxaliga', id: 'maxa_liga', name: 'Maxa Liga', short: 'ML', aka: ['1st League'], wiki: '1st Czech Republic Hockey League' },
  { icon: 'mleagues/2czech', id: 'czech_2_liga', name: '2. Liga', short: '2L', wiki: '2nd Czech Republic Hockey League' },
  { icon: 'federations/czehockey', id: 'czehockey', name: 'Tchéquie', short: 'ČSLH', wiki: 'Czech Ice Hockey Association' },
  { icon: 'mleagues/tipsportliga', id: 'tipsport_liga', name: 'Tipsport Liga', short: 'TL', aka: ['Extraliga'], wiki: 'Slovak Extraliga' },
  { icon: 'mleagues/slovakhl', id: 'slovak_1_liga', name: 'SHL', short: 'SHL', wiki: 'Slovak 1. Liga' },
  { icon: 'mleagues/2shl', id: 'slovak_2_liga', name: '2. SHL', short: '2SHL', wiki: 'Slovak 2. Liga' },
  { icon: 'federations/szlh', id: 'szlh', name: 'Slovaquie', short: 'SZĽH', wiki: 'Slovak Ice Hockey Federation' },

  // Suisse, Allemagne, France, Benelux
  { icon: 'mleagues/nationalleague', id: 'national_league', name: 'National League', short: 'NL', aka: ['National League'], wiki: 'National League (ice hockey)' },
  { icon: 'mleagues/swissleague', id: 'swiss_league', name: 'Swiss League', short: 'SL', aka: ['Swiss League'], wiki: 'Swiss League' },
  { icon: 'mleagues/myhockeyleague', id: 'myhockey_league', name: 'MyHockey League', short: 'MHL', wiki: 'MyHockey League' },
  { icon: 'wleagues/swhl', id: 'pwhl_swiss', name: 'Women\'s League', short: 'SWHL', wiki: 'Women\'s League (ice hockey)' },
  { icon: 'tournaments/swisscup', id: 'swiss_cup', name: 'Swiss Cup', short: 'CUP', wiki: 'Swiss Ice Hockey Cup' },
  { icon: 'federations/sihf', id: 'sihf', name: 'Suisse', short: 'SIHF', wiki: 'Swiss Ice Hockey Federation' },
  { icon: 'mleagues/del', id: 'del', name: 'DEL', wiki: 'Deutsche Eishockey Liga' },
  { icon: 'mleagues/del2', id: 'del2', name: 'DEL 2', short: 'DEL2', wiki: 'DEL2' },
  { icon: 'federations/deb', id: 'deb', name: 'Allemagne', short: 'DEB', wiki: 'German Ice Hockey Federation' },
  { icon: 'tournaments/deutschlandcup', id: 'deutschland_cup', name: 'Deutschland Cup', short: 'DC', wiki: 'Deutschland Cup' },
  { icon: 'mleagues/magnus', id: 'ligue_magnus', name: 'Ligue Magnus', short: 'LM', wiki: 'Ligue Magnus' },
  { icon: 'federations/ffhg', id: 'ffhg', name: 'France', short: 'FFHG', wiki: 'French Ice Hockey Federation' },
  { icon: 'mleagues/cehl', id: 'cehl', name: 'CEHL', wiki: 'Central European Hockey League' },
  { icon: 'federations/rbihf', id: 'rbihf', name: 'Belgique', short: 'RBIHF', wiki: 'Royal Belgian Ice Hockey Federation' },
  { icon: 'federations/nijb', id: 'nijb', name: 'Pays-Bas', short: 'NIJB', wiki: 'Ice Hockey Netherlands' },

  // Autriche, Italie, Hongrie, Roumanie, ex-Yougoslavie
  { icon: 'mleagues/icehl', id: 'icehl', name: 'ICEHL', aka: ['ICE Hockey League'], wiki: 'ICE Hockey League' },
  { icon: 'mleagues/alps', id: 'alpshl', name: 'AlpsHL', short: 'AHL', aka: ['Alps Hockey League'], wiki: 'Alps Hockey League' },
  { icon: 'mleagues/itahl', id: 'ihl_italy', name: 'IHL', aka: ['IHL'], wiki: 'Italian Hockey League' },
  { icon: 'mleagues/ersteliga', id: 'erste_liga', name: 'Erste Liga', short: 'EL', aka: ['Erste Liga'], wiki: 'Erste Liga (ice hockey)' },
  { icon: 'mleagues/andersenliga', id: 'andersen_liga', name: 'Andersen Liga', short: 'AL' },
  { icon: 'tournaments/magyarkupa', id: 'magyar_kupa', name: 'Magyar Kupa', short: 'MK' },
  { icon: 'federations/mjsz', id: 'mjsz', name: 'Hongrie', short: 'MJSZ', wiki: 'Hungarian Ice Hockey Federation' },
  { icon: 'federations/oehv', id: 'oehv', name: 'Autriche', short: 'ÖEHV', wiki: 'Austrian Ice Hockey Association' },
  { icon: 'wleagues/ewhl', id: 'ewhl', name: 'EWHL', wiki: 'European Women\'s Hockey League' },
  { icon: 'wleagues/awhl', id: 'awhl', name: 'AWHL' },
  { icon: 'wleagues/debl', id: 'debl', name: 'DEBL' },
  { icon: 'federations/frhg', id: 'frhg', name: 'Roumanie', short: 'FRHG', wiki: 'Romanian Ice Hockey Federation' },
  { icon: 'federations/shls', id: 'shls', name: 'Serbie', short: 'SHLS', wiki: 'Ice Hockey Federation of Serbia' },

  // Pays baltes, Pologne, Ukraine
  { icon: 'mleagues/ohl', id: 'ohl_latvia', name: 'OHL', short: 'OHL', wiki: 'Latvian Hockey Higher League' },
  { icon: 'federations/lhf', id: 'lhf', name: 'Lettonie', short: 'LHF', wiki: 'Latvian Ice Hockey Federation' },
  { icon: 'wleagues/bcsievietem', id: 'bc_sievietem', name: 'BČ Sievietēm', short: 'BČ' },
  { icon: 'mleagues/hokiliiga', id: 'hokiliiga', name: 'Hokiliiga', short: 'HL', wiki: 'Meistriliiga (ice hockey)' },
  { icon: 'wleagues/naistehokiliiga', id: 'naiste_hokiliiga', name: 'Naiste Hokiliiga', short: 'NHL' },
  { icon: 'mleagues/hokejliga', id: 'polska_hokej_liga', name: 'Hokej Liga', short: 'PHL', aka: ['PHL', 'Polish League'], wiki: 'Polska Hokej Liga' },
  { icon: 'federations/polskihokej', id: 'pzhl', name: 'Pologne', short: 'PZHL', wiki: 'Polish Ice Hockey Federation' },
  { icon: 'federations/fhu', id: 'uhl', name: 'UHL', aka: ['UHL'], short: 'UHL', wiki: 'Ukrainian Hockey League' },
  { icon: 'eujunior/umhl', id: 'umhl', name: 'UMHL' },

  // Royaume-Uni, Espagne, Turquie, Océanie, Asie
  { icon: 'mleagues/eihl', id: 'eihl', name: 'EIHL', aka: ['Elite League'], wiki: 'Elite Ice Hockey League' },
  { icon: 'mleagues/lnhh', id: 'lnhh', name: 'LNHH', wiki: 'Liga Nacional de Hockey Hielo' },
  { icon: 'wleagues/lihh', id: 'lihh', name: 'LIHH' },
  { icon: 'federations/tbhf', id: 'tbhf', name: 'Turquie', short: 'TBHF', wiki: 'Turkish Ice Hockey Federation' },
  { icon: 'mleagues/aihl', id: 'aihl', name: 'AIHL', wiki: 'Australian Ice Hockey League' },
  { icon: 'wleagues/awihl', id: 'awihl', name: 'AWIHL', wiki: 'Australian Women\'s Ice Hockey League' },
  { icon: 'mleagues/nzihl', id: 'nzihl', name: 'NZIHL', wiki: 'New Zealand Ice Hockey League' },
  { icon: 'wleagues/nzwihl', id: 'nzwihl', name: 'NZWIHL', wiki: 'New Zealand Women\'s Ice Hockey League' },
  { icon: 'mleagues/alih', id: 'asia_league', name: 'Asia League', short: 'ALIH', aka: ['Asia League'], wiki: 'Asia League Ice Hockey' },
  { icon: 'mleagues/bihl', id: 'bihl', name: 'BIHL' },

  // International et tournois
  { icon: 'federations/iihf', id: 'iihf', name: 'IIHF', wiki: 'International Ice Hockey Federation' },
  { icon: 'federations/olympics', id: 'olympics', name: 'Jeux olympiques', short: 'JO', wiki: 'Ice hockey at the Olympic Games' },
  { icon: 'federations/paralympic', id: 'paralympics', name: 'Jeux paralympiques', short: 'JP', wiki: 'Para ice hockey at the Winter Paralympics' },
  { icon: 'mleagues/championsleague', id: 'champions_league', name: 'Champions League', short: 'CHL', aka: ['Champions Hockey League'], wiki: 'Champions Hockey League' },
  { icon: 'tournaments/continentalcup', id: 'continental_cup', name: 'Continental Cup', short: 'CC', wiki: 'IIHF Continental Cup' },
  { icon: 'tournaments/spenglercup', id: 'spengler_cup', name: 'Spengler Cup', short: 'SC', wiki: 'Spengler Cup' },
  { icon: 'tournaments/eht', id: 'eht', name: 'Euro Hockey Tour', short: 'EHT', wiki: 'Euro Hockey Tour' },
  { icon: 'tournaments/swisshg', id: 'swiss_hockey_games', name: 'Swiss Hockey Games', short: 'EHT', wiki: 'Euro Hockey Tour' },
  { icon: 'tournaments/hlinkagretzkycup', id: 'hlinka_gretzky_cup', name: 'Hlinka-Gretzky Cup', short: 'HG', wiki: 'Hlinka Gretzky Cup' },
  { icon: 'tournaments/nwtrivalryseries', id: 'rivalry_series', name: 'Rivalry Series', short: 'RS', wiki: 'Rivalry Series (ice hockey)' },
  { icon: 'tournaments/psccup', id: 'psc_cup', name: 'PSC Cup', short: 'PSC' },
  { icon: 'tournaments/futurecup', id: 'future_cup', name: 'Future Cup', short: 'FC' },
  { icon: 'tournaments/hockeytowncup', id: 'hockey_town_cup', name: 'Hockey Town Cup', short: 'HTC' },
  { icon: 'tournaments/tsyplakovcup', id: 'tsyplakov_cup', name: 'Tsyplakov Cup', short: 'TC' },
  { icon: 'tournaments/gdrivecup', id: 'g_drive_cup', name: 'G-Drive Cup', short: 'GDC' },
  { icon: 'tournaments/saleicup', id: 'salei_cup', name: 'Salei Cup', short: 'SC' },
  { icon: 'tournaments/qazaqstankybogy', id: 'qazaqstan_kubogi', name: 'Qazaqstan Kubogi', short: 'QK' },
  { icon: 'tournaments/minskcup', id: 'minsk_cup', name: 'Minsk Cup', short: 'MC' },
  { icon: 'tournaments/scacupen', id: 'sca_cupen', name: 'SCA-cupen', short: 'SCA' },
];

const BY_ICON = new Map(LEAGUES.map((l) => [l.icon, l]));

// « pic/ico/mleagues/khl.ico » ou « mleagues/khl » → « mleagues/khl »
const iconKey = (icon) => (String(icon || '').match(/([a-z]+\/[a-z0-9_-]+)(\.ico)?$/i) || [])[1]?.toLowerCase() || '';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Régions du filtre d'onhockey.tv pour départager les noms ambigus quand l'icône est inconnue
const REGION_HINT = { NA: /^(mleagues\/(nhl|ahl|echl|sphl|fphl)|najunior|wleagues\/pwhl)/, RU: /(\/(khl|vhl|mhl|nmhl|rhl|bhl|bwhl|extraleague|prohl|jashl|qyz)$)|wleagues\/whl/, SE: /\/(shl|allsvenskan|hockey|sdhl|damettan|swehockey)/, CZ: /\/(elh|maxaliga|2czech|czehockey|tipsportliga|slovakhl|2shl|szlh)$/, LV: /(mleagues\/ohl|\/(lhf|bcsievietem|hokiliiga|naistehokiliiga|hokejliga|polskihokej|fhu|umhl))$/ };

// Retrouve la ligue à partir de l'icône envoyée par l'extension, sinon du nom (+ région) affiché sur onhockey.tv.
function findLeague({ icon, league, region } = {}) {
  const byIcon = BY_ICON.get(iconKey(icon));
  if (byIcon) return byIcon;
  const n = norm(league);
  if (!n) return null;
  const candidates = LEAGUES.filter((l) => [l.name, l.short, l.id, ...(l.aka || [])].some((x) => x && norm(x) === n));
  if (candidates.length <= 1) return candidates[0] || null;
  const hint = REGION_HINT[region] || REGION_HINT[String(region || '').slice(0, 2).toUpperCase()];
  return (hint && candidates.find((l) => hint.test(l.icon))) || candidates[0];
}

module.exports = { LEAGUES, findLeague, iconKey };
