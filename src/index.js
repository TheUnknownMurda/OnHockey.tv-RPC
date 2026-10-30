// OnHockey.tv RPC : reçoit de l'extension le match regardé sur onhockey.tv et l'affiche dans Discord.
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../config.json');
const { Presence } = require('./discord');
const providers = require('./providers');
const { abbreviate, periodLabel } = require('./format');
const { getMatchupImageUrl } = require('./matchup-image');
const { leagueLogo, refreshDiscordAssets, hasDiscordAsset } = require('./league-logos');
const { hosted, cached } = require('./hosting');

const LOG_FILE = path.join(__dirname, '..', 'onhockey-tv-rpc.log');
const write = (level, msg) => {
  const line = `${new Date().toLocaleString('fr-CA')} [${level}] ${msg}`;
  (level === 'ERR' ? console.error : console.log)(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
};
const log = { info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('ERR', m) };

const SESSION_TTL_MS = 45000; // sans signal de l'extension pendant 45 s → on considère que l'onglet est fermé
const LISTENING = 2;
const SHOW_DETAILS = 2;
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
  if (side < 0 || !wasLive || /t\.b\./.test(game.statusText)) return;
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
    ? `🚨 BUT ! ${goal.scorer}${goal.total ? ` (${goal.total})` : ''}`
    : `🚨 BUT ! ${teamName(team, side)}`);
  const parts = [];
  if (goal?.emptyNet) parts.push('Filet désert');
  else if (goal?.strength === 'pp') parts.push('Avantage numérique');
  else if (goal?.strength === 'sh') parts.push('Désavantage numérique');
  if (goal) parts.push(goal.assists.length ? `Aides : ${goal.assists.map((x) => (x.total ? `${x.name} (${x.total})` : x.name)).join(', ')}` : 'Sans aide');
  parts.push(scoreLine);
  activity.state = truncate(parts.join(' · '));
  const light = goalLight();
  if (light) {
    const when = goal?.period ? ` · ${periodLabel(goal.period)}${goal.time ? ` ${goal.time}` : ''}` : '';
    Object.assign(activity, { smallImageKey: light, smallImageText: truncate(`But ${teamName(team, side)}${when}`) });
  }
}

// Match trouvé dans une source de données (LNH, LiveScore, 365Scores, ESPN) : score, période, logos.
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
  const abbr = (t, i) => t.abbrev || abbreviate(name(t, i));

  // Affiche des deux équipes : undefined = pas encore tentée, null = en cours, false = impossible, sinon URL
  if (s.poster === undefined) {
    s.poster = false;
    if (config.generateMatchupImage && a.logo && b.logo) {
      s.poster = null;
      // Clé sans préfixe pour la LNH : garde les affiches déjà hébergées (« MTL-WSH »).
      const key = game.provider === 'nhl' ? `${a.id}-${b.id}` : `${game.provider}-${a.id}-${b.id}`;
      const sides = [a, b].map((t) => ({ logo: t.logo, color: t.color }));
      getMatchupImageUrl(key, sides, imageOpts).then((url) => {
        s.poster = url || false;
        tick();
      });
    }
  }

  const scoreLine = a.score == null || b.score == null
    ? `${abbr(a, 0)} vs ${abbr(b, 1)}`
    : `${abbr(a, 0)} ${a.score} – ${b.score} ${abbr(b, 1)}`;
  const activity = {
    type: LISTENING,
    statusDisplayType: SHOW_DETAILS,
    details: truncate(`${name(a, 0)} vs ${name(b, 1)}`),
    state: truncate(`${scoreLine} · ${game.statusText}`),
    instance: false,
  };
  const hover = game.hover || `${s.league || game.league} · ${a.fullName || name(a, 0)} vs ${b.fullName || name(b, 1)}`;
  applyImages(activity, s, s.poster, hover);

  detectGoal(s, game);
  if (s.goalAlert && Date.now() < s.goalAlert.until) applyGoalAlert(activity, s, game, scoreLine, name);
  else s.goalAlert = null;

  if (game.url) activity.detailsUrl = game.url;
  if (config.showGamecenterButton && game.url) activity.buttons = [{ label: game.urlLabel || 'Voir le match', url: game.url }];
  return activity;
}

// Match qu'aucune source ne couvre : équipes et ligue, logo de la ligue en grande image.
function genericActivity(s) {
  const [a, b] = s.teams;
  const activity = {
    type: LISTENING,
    statusDisplayType: SHOW_DETAILS,
    details: truncate(b ? `${a} vs ${b}` : s.title || 'Match de hockey'),
    state: truncate(s.league ? `${s.league} · En direct` : 'En direct'),
    instance: false,
  };
  applyImages(activity, s, null, s.league || 'Hockey');
  return activity;
}

let ticking = false;
let again = false;

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
    // Nom affiché dans l'en-tête de la carte (« Regarde … ») ; la ligne de statut garde le nom des équipes.
    if (config.activityName) activity.name = config.activityName;
    s.lastActivity = activity;
    presence.set(activity);
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
      return send(200, { discord: presence.ready, watching: s ? { league: s.league, teams: s.teams, activity: s.lastActivity } : null });
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

server.listen(config.port, '127.0.0.1', () => {
  log.info(`OnHockey.tv RPC prêt sur http://127.0.0.1:${config.port}`);
});

setInterval(tick, config.pollSeconds * 1000);

async function shutdown() {
  log.info('Arrêt…');
  await presence.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
