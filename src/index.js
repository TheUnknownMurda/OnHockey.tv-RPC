// OnHockey.tv RPC : reçoit de l'extension le match regardé sur onhockey.tv et l'affiche dans Discord.
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../config.json');
const { Presence } = require('./discord');
const providers = require('./providers');
const { abbreviate, periodLabel, finalLabel } = require('./format');
const { getMatchupImageUrl } = require('./matchup-image');
const { leagueLogo, refreshDiscordAssets, hasDiscordAsset } = require('./league-logos');
const { hosted, cached, RETRY_MS } = require('./hosting');
const { startConsole, stopConsole, print, paint, formatLine, banner, normalize } = require('./console');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const LOG_FILE = path.join(__dirname, '..', 'onhockey-tv-rpc.log');
// Console : ligne en couleurs ; fichier : texte brut avec la date complète
const write = (level, msg) => {
  const now = new Date();
  print(formatLine(level, msg, now), { error: level === 'ERR' });
  try { fs.appendFileSync(LOG_FILE, `${now.toLocaleString('fr-CA')} [${level}] ${msg}\n`); } catch {}
};
const log = { info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('ERR', m) };

// Bannière dans la fenêtre de start.bat (l'instance en arrière-plan n'a pas de console)
if (process.stdout.isTTY) console.log(banner(require('../package.json').version, process.stdin.isTTY));

const SESSION_TTL_MS = 45000; // sans signal de l'extension pendant 45 s → on considère que l'onglet est fermé
const SHOW_DETAILS = 2;
// Type d'activité (config.activityType, commande « type ») et en-tête de la carte qui en résulte
const ACTIVITY_TYPES = { playing: 0, listening: 2, watching: 3, competing: 5 };
const TYPE_LABELS = { playing: 'Playing', listening: 'Listening to', watching: 'Watching', competing: 'Competing in' };
const activityType = () => {
  const t = normalize(config.activityType);
  return Object.hasOwn(ACTIVITY_TYPES, t) ? t : 'listening';
};
const cardTitle = () => `${TYPE_LABELS[activityType()]} ${config.activityName || 'OnHockey.tv RPC'}`;
const GOAL_LIGHT_FILE = path.join(__dirname, '..', 'assets', 'goal-light.gif');

const presence = new Presence(config.clientId, log);
const sessions = new Map(); // tabId → session

function activeSession() {
  const now = Date.now();
  let best = null;
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_TTL_MS) { sessions.delete(id); continue; }
    if (!best || s.lastSeen > best.lastSeen) best = s;
  }
  return best;
}

const truncate = (s, n = 128) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
// Les images envoyées en arrière-plan relancent un rafraîchissement une fois prêtes
const imageOpts = { log, apiKey: config.freeimageApiKey, onReady: () => tick() };

// Image par défaut : asset « hockey » de l'application Discord s'il existe, sinon config.fallbackImage
const defaultImage = () => (hasDiscordAsset('hockey') ? 'hockey' : config.fallbackImage);

// Lumière de but : config.goalLightImage si fourni, sinon assets/goal-light.gif hébergé une seule fois
function goalLight() {
  if (config.goalLightImage) return config.goalLightImage;
  let key;
  try { key = `goal-light-${fs.statSync(GOAL_LIGHT_FILE).size}`; } catch { return null; }
  const url = cached('assets', key);
  if (url) return url;
  hosted('assets', key, async () => ({ buffer: fs.readFileSync(GOAL_LIGHT_FILE), filename: 'goal-light.gif' }), imageOpts);
  return null;
}

// Grande image : l'affiche des deux équipes, avec le logo de la ligue en petite image.
// Sans affiche (logos d'équipes introuvables) : le logo de la ligue en grande image, sans petite image.
function applyImages(activity, s, poster, hover) {
  const logo = leagueLogo(s, imageOpts);
  if (poster) {
    activity.largeImageKey = poster;
    activity.largeImageText = truncate(hover);
    if (config.showLeagueBadge && logo) Object.assign(activity, { smallImageKey: logo.key, smallImageText: truncate(logo.text) });
  } else {
    activity.largeImageKey = logo?.key || defaultImage();
    activity.largeImageText = truncate(hover || logo?.text || s.league || 'Hockey');
  }
}

// Repère un but entre deux rafraîchissements et prépare l'alerte (marqueur, aides, lumière de but).
function detectGoal(s, game) {
  const scores = game.teams.map((t) => t.score);
  const prev = s.scores;
  const wasLive = s.prevState === 'live';
  s.scores = scores;
  s.prevState = game.state;
  if (!config.goalAlerts || !prev || [...scores, ...prev].some((n) => n == null)) return;
  // But refusé / correction du score : on retire l'alerte en cours
  if (scores.some((n, i) => n < prev[i])) { s.goalAlert = null; return; }
  const side = scores[0] > prev[0] ? 0 : scores[1] > prev[1] ? 1 : -1;
  // Le point accordé au vainqueur d'une fusillade n'est pas un but « en direct »
  if (side < 0 || !wasLive || game.statusText === finalLabel('SO')) return;
  const alert = { side, until: Date.now() + (config.goalAlertSeconds || 60) * 1000, goal: null };
  s.goalAlert = alert;
  log.info(`[but] ${game.teams[side].abbrev || s.teams[side]} · ${scores.join('-')}`);
  providers.lastGoal(s.match, game).then((goal) => {
    if (!goal || goal.side !== side || s.goalAlert !== alert) return;
    alert.goal = goal;
    log.info(`[but] ${goal.scorer}${goal.assists.length ? ` (aides : ${goal.assists.map((x) => x.name).join(', ')})` : ''}`);
    tick();
  }).catch((err) => log.warn(`[but] détails indisponibles : ${err.message}`));
}

// Alerte de but : marqueur et aides à la place du nom des équipes, lumière de but en petite image.
function applyGoalAlert(activity, s, game, scoreLine, teamName) {
  const { side, goal } = s.goalAlert;
  const team = game.teams[side];
  activity.details = truncate(goal?.scorer
    ? `🚨 GOAL! ${goal.scorer}${goal.total ? ` (${goal.total})` : ''}`
    : `🚨 GOAL! ${teamName(team, side)}`);
  const parts = [];
  if (goal?.emptyNet) parts.push('Empty net');
  else if (goal?.strength === 'pp') parts.push('Power play');
  else if (goal?.strength === 'sh') parts.push('Shorthanded');
  if (goal) parts.push(goal.assists.length ? `Assists: ${goal.assists.map((x) => (x.total ? `${x.name} (${x.total})` : x.name)).join(', ')}` : 'Unassisted');
  parts.push(scoreLine);
  activity.state = truncate(parts.join(' · '));
  const light = goalLight();
  if (light) {
    const when = goal?.period ? ` · ${periodLabel(goal.period)}${goal.time ? ` ${goal.time}` : ''}` : '';
    Object.assign(activity, { smallImageKey: light, smallImageText: truncate(`${teamName(team, side)} goal${when}`) });
  }
}

// Match trouvé dans une source de données (LNH, HockeyTech, LiveScore, 365Scores, ESPN) : score, période, logos.
async function gameActivity(s) {
  if (!s.match) {
    if (Date.now() - (s.lastLookup || 0) < 30000) return null;
    s.lastLookup = Date.now();
    s.match = await providers.find(s, log);
    if (!s.match) {
      log.warn(`[match] aucune source pour « ${s.teams.join(' - ')} » (${s.league || '?'})`);
      return null;
    }
    log.info(`[${s.match.provider}] match trouvé : ${s.match.label}`);
  }
  const game = await providers.load(s.match);
  if (!game) return null;
  const [a, b] = game.teams;
  // Noms : ceux de la source, sauf quand elle les translittère (LiveScore) → ceux d'onhockey.tv
  const name = (t, i) => t.name || s.teams[i];
  // Ville + nom (« Montréal Canadiens ») quand la source le donne
  const full = (t, i) => t.fullName || name(t, i);
  const abbr = (t, i) => t.abbrev || abbreviate(name(t, i));

  // Affiche des deux équipes : undefined = pas encore tentée, null = en cours, false = impossible, sinon URL.
  // Envoi raté (hébergeur en panne) : nouvel essai après RETRY_MS, l'affiche revient sans redémarrer.
  if (s.poster === undefined || (s.posterRetryAt && Date.now() >= s.posterRetryAt)) {
    s.poster = false;
    s.posterRetryAt = 0;
    if (config.generateMatchupImage && a.logo && b.logo) {
      s.poster = null;
      // Clé sans préfixe pour la LNH : garde les affiches déjà hébergées (« MTL-WSH »).
      const key = game.provider === 'nhl' ? `${a.id}-${b.id}` : `${game.provider}-${a.id}-${b.id}`;
      const sides = [a, b].map((t) => ({ logo: t.logo, color: t.color }));
      getMatchupImageUrl(key, sides, imageOpts).then((url) => {
        s.poster = url || false;
        if (!url) s.posterRetryAt = Date.now() + RETRY_MS;
        tick();
      });
    }
  }

  const scoreLine = a.score == null || b.score == null
    ? `${abbr(a, 0)} vs ${abbr(b, 1)}`
    : `${abbr(a, 0)} ${a.score} – ${b.score} ${abbr(b, 1)}`;
  const activity = {
    statusDisplayType: SHOW_DETAILS,
    details: truncate(`${full(a, 0)} vs ${full(b, 1)}`),
    state: truncate(`${scoreLine} · ${game.statusText}`),
    instance: false,
  };
  const hover = game.hover || `${s.league || game.league} · ${name(a, 0)} vs ${name(b, 1)}`;
  applyImages(activity, s, s.poster, hover);

  detectGoal(s, game);
  if (s.goalAlert && Date.now() < s.goalAlert.until) applyGoalAlert(activity, s, game, scoreLine, name);
  else s.goalAlert = null;

  if (game.url) activity.detailsUrl = game.url;
  if (config.showGamecenterButton && game.url) activity.buttons = [{ label: game.urlLabel || 'View game', url: game.url }];
  return activity;
}

// Match qu'aucune source ne couvre : équipes et ligue, logo de la ligue en grande image.
function genericActivity(s) {
  const [a, b] = s.teams;
  const activity = {
    statusDisplayType: SHOW_DETAILS,
    details: truncate(b ? `${a} vs ${b}` : s.title || 'Hockey game'),
    state: truncate(s.league ? `${s.league} · Live` : 'Live'),
    instance: false,
  };
  applyImages(activity, s, null, s.league || 'Hockey');
  return activity;
}

let ticking = false;
let again = false;
let hidden = false; // présence retirée depuis la console ; le match reste suivi (scores, buts, affiche)

async function tick() {
  if (ticking) { again = true; return; }
  ticking = true;
  try {
    await refreshDiscordAssets(config.clientId, log);
    const s = activeSession();
    if (!s) {
      presence.clear();
      return;
    }
    let activity = null;
    if (s.teams.length === 2) {
      try {
        activity = await gameActivity(s);
      } catch (err) {
        log.warn(`[${s.match?.provider || 'match'}] ${err.message}`);
        activity = s.lastActivity || null;
      }
    }
    activity = activity || genericActivity(s);
    if (config.showElapsed) activity.startTimestamp = s.startedAt;
    // En-tête de la carte (« Listening to Hockey ») ; la ligne de statut garde le nom des équipes.
    activity.type = ACTIVITY_TYPES[activityType()];
    if (config.activityName) activity.name = config.activityName;
    s.lastActivity = activity;
    if (hidden) presence.clear();
    else presence.set(activity);
  } finally {
    ticking = false;
    if (again) { again = false; setImmediate(tick); }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  // L'en-tête personnalisé empêche une page web quelconque de piloter la présence (pré-vérification CORS refusée).
  if (req.method !== 'GET' && req.headers['x-onhockey-rpc'] !== '1') return send(403, { error: 'forbidden' });

  try {
    if (req.method === 'GET' && req.url === '/status') {
      const s = activeSession();
      return send(200, { discord: presence.ready, hidden, watching: s ? { league: s.league, teams: s.teams, activity: s.lastActivity } : null });
    }
    if (req.method === 'POST' && req.url === '/watch') {
      const body = await readBody(req);
      const id = String(body.tabId ?? 'default');
      const teams = (Array.isArray(body.teams) ? body.teams : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 2);
      const key = `${body.league}|${teams.join('|')}`;
      let s = sessions.get(id);
      if (!s || s.key !== key) {
        s = { key, league: String(body.league || ''), region: String(body.region || ''), icon: String(body.icon || ''), teams, title: String(body.title || ''), startedAt: Date.now() };
        sessions.set(id, s);
        log.info(`[onhockey] ${s.league || '?'} : ${teams.join(' - ') || s.title}`);
      }
      s.lastSeen = Date.now();
      tick();
      return send(200, { ok: true });
    }
    // Aperçu de l'alerte de but avec le dernier but du match suivi
    if (req.method === 'POST' && req.url === '/test-goal') {
      const s = activeSession();
      if (!s?.match) return send(409, { error: 'aucun match suivi' });
      const game = await providers.load(s.match);
      const goal = await providers.lastGoal(s.match, game).catch(() => null);
      s.goalAlert = { side: goal ? goal.side : 0, until: Date.now() + (config.goalAlertSeconds || 60) * 1000, goal };
      tick();
      return send(200, { ok: true, goal });
    }
    if (req.method === 'POST' && req.url === '/quit') {
      send(200, { ok: true });
      setTimeout(shutdown, 100);
      return;
    }
    if (req.method === 'POST' && req.url === '/stop') {
      const body = await readBody(req);
      if (sessions.delete(String(body.tabId ?? 'default'))) log.info('[onhockey] arrêt du visionnement');
      tick();
      return send(200, { ok: true });
    }
    send(404, { error: 'not found' });
  } catch (err) {
    send(400, { error: err.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log.error(`Le port ${config.port} est déjà utilisé (OnHockey.tv RPC tourne déjà ?)`);
  else log.error(err.message);
  process.exit(1);
});

// Garde une valeur dans config.json pour les prochains lancements
function saveConfig(key, value) {
  try {
    const json = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    json[key] = value;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(json, null, 2) + '\n');
    return true;
  } catch (err) {
    log.warn(`[console] config.json non modifié : ${err.message}`);
    return false;
  }
}

const TYPE_NAMES = Object.keys(ACTIVITY_TYPES);
const cmd = (text) => paint(['bold', 'greenBright'], text);

const commands = [
  {
    names: ['masquer', 'hide'],
    help: 'retire la présence de Discord (le match reste suivi)',
    run() {
      if (hidden) return print(`  ${paint('yellow', 'La présence est déjà masquée.')} Tapez ${cmd('afficher')} pour la remettre.`);
      hidden = true;
      log.info('[console] présence masquée (« afficher » pour la remettre)');
      tick();
    },
  },
  {
    names: ['afficher', 'show'],
    help: 'remet la présence',
    run() {
      if (!hidden) return print(`  ${paint('yellow', 'La présence est déjà affichée.')}`);
      hidden = false;
      log.info('[console] présence affichée');
      tick();
    },
  },
  {
    names: ['type'],
    usage: '<type>',
    choices: TYPE_NAMES,
    help: `${TYPE_NAMES.join(', ')} ; gardé dans config.json`,
    run(arg) {
      const wanted = normalize(arg);
      const type = wanted && TYPE_NAMES.find((t) => t.startsWith(wanted));
      if (!type) {
        if (wanted) print(`  ${paint('yellow', `Type inconnu « ${arg} ».`)}`);
        return print(`  Type actuel : ${paint(['bold', 'cyanBright'], cardTitle())} · choix : ${TYPE_NAMES.map(cmd).join(', ')} (ex. ${cmd('type watching')})`);
      }
      config.activityType = type;
      const saved = saveConfig('activityType', type);
      log.info(`[console] type de présence : « ${cardTitle()} »${saved ? ' (gardé dans config.json)' : ''}`);
      tick();
    },
  },
  {
    names: ['etat', 'status'],
    help: 'présence, type, Discord et match suivi',
    run() {
      const s = activeSession();
      const row = (label, value) => `    ${paint('gray', label.padEnd(10))}${value}`;
      print([
        '',
        row('Présence', hidden ? paint('yellow', '○ masquée') : paint('greenBright', '● affichée')),
        row('Type', paint(['bold', 'cyanBright'], cardTitle())),
        row('Discord', presence.ready ? paint('greenBright', '● connecté') : paint('redBright', '● non connecté')),
        row('Match', s ? `${s.league || '?'} · ${s.teams.join(' - ') || s.title}` : paint('gray', 'aucun')),
        '',
      ].join('\n'));
    },
  },
  {
    names: ['quitter', 'quit'],
    help: 'arrête OnHockey.tv RPC',
    run: () => shutdown(),
  },
];

if (!Object.hasOwn(ACTIVITY_TYPES, normalize(config.activityType || 'listening'))) {
  log.warn(`[config] activityType « ${config.activityType} » inconnu : « listening » utilisé`);
}

server.listen(config.port, '127.0.0.1', () => {
  log.info(`OnHockey.tv RPC prêt sur http://127.0.0.1:${config.port}`);
  startConsole(commands, { onInterrupt: shutdown });
});

setInterval(tick, config.pollSeconds * 1000);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  stopConsole();
  log.info('Arrêt…');
  await presence.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
