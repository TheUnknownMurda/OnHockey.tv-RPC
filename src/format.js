// Libellés communs à toutes les sources (période, entracte, début du match…).
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;

function periodLabel(n, regulation = 3) {
  if (n <= regulation) return `${ordinal(n)} period`;
  const ot = n - regulation;
  return ot <= 1 ? 'Overtime' : `${ordinal(ot)} overtime`;
}

const intermission = (n) => `${ordinal(n)} intermission`;

// « 05:45 » → « 5:45 »
const clock = (t) => String(t || '').replace(/^0(\d)/, '$1');

// L'heure anglaise contient une espace insécable (« 7:30 PM »)
const startsAt = (date) =>
  `Starts at ${new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ')}`;

// Libellé de fin de match selon la façon dont il s'est terminé.
function finalLabel(how) {
  if (how === 'OT') return 'Final (OT)';
  if (how === 'SO') return 'Final (SO)';
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

// « 12:34 » → 754 s, « 00:12:34 » → 754 s
const seconds = (t) => String(t || '').split(':').reduce((sum, x) => sum * 60 + (Number(x) || 0), 0);

module.exports = { ordinal, periodLabel, intermission, clock, startsAt, finalLabel, abbreviate, seconds };
