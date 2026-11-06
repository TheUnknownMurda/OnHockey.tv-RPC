// Console de start.bat : journal en couleurs, bannière, invite et commandes tapées (« aide » pour la liste).
// L'instance lancée en arrière-plan (start-hidden.js) n'a pas de console ; le fichier
// onhockey-tv-rpc.log reste en texte brut.
const readline = require('readline');
const { styleText } = require('util');

const output = process.stdout;
let rl = null;

// Couleurs ANSI, retirées hors terminal ou avec NO_COLOR
const paint = (format, text) => styleText(format, String(text), { stream: output });

// Minuscules sans accents : « État » → « etat »
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TAG_WIDTH = 10;
const SOURCE = 'blueBright';
const TAG_COLORS = {
  rpc: 'whiteBright', discord: 'magentaBright', onhockey: 'cyanBright', image: 'green', ligues: 'magenta',
  console: 'greenBright', config: 'yellow', match: SOURCE, nhl: SOURCE, espn: SOURCE, hockeytech: SOURCE, livescore: SOURCE, 365: SOURCE,
};

// URLs soulignées, texte entre « » en gras
const highlight = (text) => text
  .replace(/https?:\/\/[^\s)]+/g, (url) => paint(['underline', 'cyan'], url))
  .replace(/« ([^»]+?) »/g, (_, quoted) => `« ${paint('bold', quoted)} »`);

// Une ligne du journal : « 19:42:50  nhl          match trouvé : … »
function formatLine(level, msg, date = new Date()) {
  const [, tag = 'rpc', text = msg] = /^\[([^\]]+)\] ?([\s\S]*)$/.exec(msg) || [];
  const head = `${paint('gray', date.toTimeString().slice(0, 8))}  `;
  if (tag === 'but') return `${head}${paint(['bgRed', 'whiteBright', 'bold'], ' BUT ! ')}${' '.repeat(TAG_WIDTH - 4)}${paint(['bold', 'whiteBright'], text)}`;
  const label = paint(TAG_COLORS[tag] || 'white', tag.padEnd(TAG_WIDTH));
  if (level === 'WARN') return `${head}${label} ${paint(['bold', 'yellow'], '!')} ${paint('yellow', text)}`;
  if (level === 'ERR') return `${head}${label} ${paint(['bold', 'redBright'], '×')} ${paint('redBright', text)}`;
  return `${head}${label}   ${highlight(text)}`;
}

// Rondelle et titre aux couleurs du Canadien
function banner(version, withConsole) {
  const title = paint(['bold', 'redBright'], 'OnHockey') + paint(['bold', 'blueBright'], '.tv') + paint(['bold', 'whiteBright'], ' RPC');
  const hint = `Tapez ${paint(['bold', 'greenBright'], 'aide')} pour les commandes · Tab complète · ↑ rappelle`;
  return [
    '',
    `   ${paint('white', '▄█████▄')}   ${title}  ${paint('gray', `v${version}`)}`,
    `   ${paint('gray', '▀█████▀')}   ${paint('gray', 'Présence Discord pour onhockey.tv')}`,
    ...(withConsole ? [`             ${paint('gray', hint)}`] : []),
    '',
  ].join('\n');
}

// Affiche au-dessus de l'invite sans perdre ce qui est en train d'être tapé
function print(text = '', { error = false } = {}) {
  if (!rl?.terminal) return (error ? console.error : console.log)(text);
  readline.cursorTo(output, 0);
  readline.clearScreenDown(output);
  output.write(`${text}\n`);
  rl.prompt(true);
}

function helpText(commands) {
  const rows = [...commands, { names: ['aide', 'help'], help: 'cette liste' }].map(({ names: [name, ...aliases], usage, help }) => ({
    width: `${name}${aliases.map((a) => `, ${a}`).join('')}${usage ? ` ${usage}` : ''}`.length,
    left: `${paint(['bold', 'greenBright'], name)}${paint('gray', aliases.map((a) => `, ${a}`).join(''))}${usage ? ` ${paint('cyan', usage)}` : ''}`,
    help,
  }));
  const width = Math.max(...rows.map((r) => r.width)) + 3;
  return [
    '',
    `  ${paint(['bold', 'whiteBright'], 'Commandes')}`,
    ...rows.map((r) => `    ${r.left}${' '.repeat(width - r.width)}${r.help}`),
    `  ${paint('gray', 'Tab complète une commande, ↑ et ↓ rappellent les précédentes.')}`,
    '',
  ].join('\n');
}

// commands : [{ names: ['masquer', 'hide'], usage: '<…>', choices: [...] (Tab), help: '…', run(arg) }]
function startConsole(commands, { input = process.stdin, onInterrupt } = {}) {
  if (!input.isTTY) return null;
  const byName = new Map(commands.flatMap((c) => c.names.map((n) => [n, c])));
  const names = [...byName.keys(), 'aide', 'help'];
  const terminal = Boolean(output.isTTY);
  // Tab : nom de la commande, puis ses choix (« type w » → « type watching »)
  const completer = (line) => {
    const [word = '', ...rest] = line.trimStart().split(/\s+/);
    if (!rest.length) {
      const hits = names.filter((n) => n.startsWith(normalize(word)));
      return [hits.length ? hits : names, word];
    }
    const arg = rest.join(' ');
    return [(byName.get(normalize(word))?.choices || []).filter((c) => c.startsWith(normalize(arg))), arg];
  };
  const run = (line) => {
    const [word, ...rest] = line.trim().split(/\s+/);
    if (!word) return;
    const name = normalize(word);
    if (['aide', 'help', '?'].includes(name)) return print(helpText(commands));
    const command = byName.get(name);
    if (!command) return print(`  ${paint('yellow', `Commande inconnue « ${word} ».`)} Tapez ${paint(['bold', 'greenBright'], 'aide')} pour la liste.`);
    command.run(rest.join(' '));
  };
  rl = readline.createInterface(terminal ? { input, output, terminal, completer, historySize: 50 } : { input, terminal: false });
  rl.setPrompt(paint(['bold', 'greenBright'], '› '));
  rl.on('line', (line) => {
    run(line);
    rl?.prompt();
  });
  // En mode terminal, Ctrl+C arrive ici et non comme signal
  rl.on('SIGINT', () => onInterrupt?.());
  rl.on('close', () => { rl = null; });
  if (terminal) rl.prompt();
  return rl;
}

// Efface l'invite avant l'arrêt (sinon « › » reste devant le « Appuyez sur une touche » de start.bat)
function stopConsole() {
  if (!rl) return;
  const current = rl;
  rl = null;
  if (current.terminal) {
    readline.cursorTo(output, 0);
    readline.clearLine(output, 0);
  }
  current.close();
}

module.exports = { startConsole, stopConsole, print, paint, formatLine, banner, normalize };
