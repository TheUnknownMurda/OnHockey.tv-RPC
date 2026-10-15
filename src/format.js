// Libellés français communes à toutes les sources (période, entracte, début du match…).
const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

function periodLabel(n, regulation = 3) {
  if (n <= regulation) return `${ordinal(n)} période`;
  const ot = n - regulation;
  return ot <= 1 ? 'Prolongation' : `${ot}e prolongation`;
}

const intermission = (n) => (n === 1 ? '1er entracte' : `${n}e entracte`);

// « 05:45 » → « 5:45 »
const clock = (t) => String(t || '').replace(/^0(\d)/, '$1');

const startsAt = (date) =>
  `Début à ${new Date(date).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`;

// Libellé de fin de match selon la façon dont il s'est terminé.
function finalLabel(how) {
  if (how === 'OT') return 'Final (prol.)';
  if (how === 'SO') return 'Final (t.b.)';
  return 'Final';
}

// Abréviation de secours : 3 premières lettres du premier mot significatif (« Severstal Cherepovets » → « SEV »).
function abbreviate(name) {
  const words = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const skip = /^(hc|hk|if|ik|bk|ec|sc|ehc|fc|ks|mhk|sk|tj|hdd)$/i;
  const word = words.find((w) => !skip.test(w)) || words[0] || '?';
  return word.slice(0, 3).toUpperCase();
}

module.exports = { ordinal, periodLabel, intermission, clock, startsAt, finalLabel, abbreviate };
