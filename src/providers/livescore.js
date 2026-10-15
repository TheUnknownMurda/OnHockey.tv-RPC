// LiveScore : la plupart des ligues d'Europe et d'Amérique du Nord (AHL, OHL, WHL, LHJMQ, SHL, Liiga, DEL,
// Extraliga, Ligue Magnus…), avec score et période (pas de chrono).
const { periodLabel, intermission, startsAt, finalLabel } = require('../format');
const { getJson, localDate } = require('./http');

const API = 'https://prod-cdn-public-api.livescore.com/v1/api/app';
const IMG = 'https://lsm-static-prod.livescore.com/high/';
const tz = () => -new Date().getTimezoneOffset() / 60;

// « 20261015170000 » (UTC) → Date
function parseEsd(esd) {
  const s = String(esd);
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)));
}

// Epr : 0 = à venir, 1 = en cours, 2 = terminé, 3 = annulé/reporté. Eps : période ou façon dont le match s'est terminé.
function status(e) {
  const eps = String(e.Eps || '');
  let m;
  if (eps === 'NS') return { state: 'pre', text: startsAt(parseEsd(e.Esd)) };
  if (e.Epr === 2) {
    // « OT » une fois le match terminé = gagné en prolongation
    if (/^(OT|AOT|AET)$/i.test(eps)) return { state: 'final', text: finalLabel('OT') };
    if (/^(AP|AS|AFP|SO|PS|PEN)$/i.test(eps)) return { state: 'final', text: finalLabel('SO') };
    return { state: 'final', text: finalLabel() };
  }
  if (!eps && e.Epr === 1) {
    // Entracte : aucun libellé, seulement les scores des périodes déjà jouées (Tr1Pe1, Tr1Pe2…)
    const played = [1, 2, 3].filter((i) => e[`Tr1Pe${i}`] !== undefined).length;
    return { state: 'live', text: played ? intermission(played) : 'Entracte' };
  }
  if ((m = /^P(\d)$/.exec(eps))) return { state: 'live', text: periodLabel(+m[1]) };
  if (/^OT$/i.test(eps)) return { state: 'live', text: 'Prolongation' };
  if (/^(SO|PS|PEN|Pen\.?)$/i.test(eps)) return { state: 'live', text: 'Tirs de barrage' };
  if (/break|pause|^int$/i.test(eps)) return { state: 'live', text: 'Entracte' };
  if (eps === 'FT') return { state: 'final', text: finalLabel() };
  if (/^(AOT|AET)$/i.test(eps)) return { state: 'final', text: finalLabel('OT') };
  if (/^(AP|AS|AFP)$/i.test(eps)) return { state: 'final', text: finalLabel('SO') };
  if (/postp/i.test(eps)) return { state: 'other', text: 'Reporté' };
  if (/canc/i.test(eps)) return { state: 'other', text: 'Annulé' };
  if (/delay/i.test(eps)) return { state: 'other', text: 'Retardé' };
  if (/susp|aband|int\./i.test(eps)) return { state: 'other', text: 'Interrompu' };
  return { state: 'live', text: eps };
}

function team(t, score, started) {
  return {
    id: t.ID,
    // Noms translittérés (« Brynaes ») : on affiche ceux d'onhockey.tv, ceux-ci ne servent qu'à la correspondance
    name: null,
    fullName: null,
    abbrev: t.Abr,
    names: [t.Nm, t.Abr],
    score: started && score !== undefined && score !== '' ? Number(score) : null,
    logo: t.Img ? IMG + t.Img : null,
    color: null,
  };
}

function toGame(e, stage) {
  const st = status(e);
  const started = st.state !== 'pre';
  return {
    provider: 'livescore',
    id: e.Eid,
    ref: null,
    league: stage?.Snm || stage?.Sdn || '',
    country: stage?.Cnm || '',
    home: team(e.T1[0], e.Tr1, started),
    away: team(e.T2[0], e.Tr2, started),
    state: st.state,
    statusText: st.text,
  };
}

async function day(offset) {
  const data = await getJson(`${API}/date/hockey/${localDate(offset)}/${tz()}?MD=1`);
  return (data.Stages || []).flatMap((s) => (s.Events || []).map((e) => toGame(e, s)));
}

// Matchs d'aujourd'hui et d'hier (matchs commencés avant minuit).
async function list() {
  const [today, yesterday] = await Promise.all([day(0), day(-1).catch(() => [])]);
  return [...today, ...yesterday.filter((g) => g.state === 'live')];
}

async function get(id) {
  const e = await getJson(`${API}/scoreboard/hockey/${id}?locale=en`);
  return e?.Eid ? toGame(e, e.Stg) : null;
}

module.exports = { name: 'livescore', list, get };
