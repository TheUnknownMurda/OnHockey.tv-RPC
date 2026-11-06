// Commandes tapées dans la fenêtre de start.bat (« aide » pour la liste).
// L'instance lancée en arrière-plan (start-hidden.js) n'a pas de console : rien n'est lu.
const readline = require('readline');

// Minuscules sans accents : « État » → « etat »
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// commands : [{ names: ['masquer', 'hide'], usage: '<…>' (facultatif), help: '…', run(arg) }]
function startConsole(commands, { input = process.stdin, print = console.log } = {}) {
  if (!input.isTTY) return null;
  const byName = new Map(commands.flatMap((c) => c.names.map((n) => [n, c])));
  const help = () => {
    print('Commandes :');
    for (const c of [...commands, { names: ['aide', 'help'], help: 'cette liste' }]) {
      const [name, ...aliases] = c.names;
      const left = `${name}${c.usage ? ` ${c.usage}` : ''}${aliases.length ? ` (${aliases.join(', ')})` : ''}`;
      print(`  ${left.padEnd(50)} ${c.help}`);
    }
  };
  const rl = readline.createInterface({ input });
  rl.on('line', (line) => {
    const [word, ...rest] = line.trim().split(/\s+/);
    if (!word) return;
    const name = normalize(word);
    if (['aide', 'help', '?'].includes(name)) return help();
    const command = byName.get(name);
    if (!command) return print(`Commande inconnue « ${word} ». Tapez « aide » pour la liste.`);
    command.run(rest.join(' '));
  });
  print('Console : tapez « aide » pour la liste des commandes.');
  return rl;
}

module.exports = { startConsole, normalize };
