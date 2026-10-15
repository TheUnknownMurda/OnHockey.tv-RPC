// OnHockey.tv RPC : reçoit de l'extension le match regardé sur onhockey.tv et l'affiche dans Discord.
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../config.json');
const { Presence } = require('./discord');
const providers = require('./providers');
const { abbreviate } = require('./format');
const { getMatchupImageUrl } = require('./matchup-image');

const LOG_FILE = path.join(__dirname, '..', 'onhockey-tv-rpc.log');
const write = (level, msg) => {
  const line = `${new Date().toLocaleString('fr-CA')} [${level}] ${msg}`;
  (level === 'ERR' ? console.error : console.log)(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
};
const log = { info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('ERR', m) };

const SESSION_TTL_MS = 45000; // sans signal de l'extension pendant 45 s → on considère que l'onglet est fermé
const WATCHING = 3;
const SHOW_DETAILS = 2;

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

  if (config.generateMatchupImage && s.image === undefined) {
    s.image = null; // en cours
    if (a.logo && b.logo) {
      // Clé sans préfixe pour la LNH : garde les affiches déjà hébergées (« MTL-WSH »).
      const key = game.provider === 'nhl' ? `${a.id}-${b.id}` : `${game.provider}-${a.id}-${b.id}`;
      const sides = [a, b].map((t) => ({ logo: t.logo, color: t.color }));
      getMatchupImageUrl(key, sides, { log, apiKey: config.freeimageApiKey }).then((url) => {
        s.image = url || config.fallbackImage;
        tick();
      });
    } else {
      s.image = config.fallbackImage;
    }
  }

  const score = a.score == null || b.score == null
    ? `${abbr(a, 0)} vs ${abbr(b, 1)}`
    : `${abbr(a, 0)} ${a.score} – ${b.score} ${abbr(b, 1)}`;
  const activity = {
    type: WATCHING,
    statusDisplayType: SHOW_DETAILS,
    details: truncate(`${name(a, 0)} vs ${name(b, 1)}`),
    state: truncate(`${score} · ${game.statusText}`),
    largeImageKey: s.image || config.fallbackImage,
    largeImageText: truncate(game.hover || `${s.league || game.league} · ${a.fullName || name(a, 0)} vs ${b.fullName || name(b, 1)}`),
    instance: false,
  };
  // Le petit badge de ligue recouvre le logo de la 2e équipe sur l'affiche : désactivé par défaut.
  if (config.showLeagueBadge && game.badge) Object.assign(activity, { smallImageKey: game.badge, smallImageText: game.league });
  if (game.url) activity.detailsUrl = game.url;
  if (config.showGamecenterButton && game.url) activity.buttons = [{ label: game.urlLabel || 'Voir le match', url: game.url }];
  return activity;
}

function genericActivity(s) {
  const [a, b] = s.teams;
  return {
    type: WATCHING,
    statusDisplayType: SHOW_DETAILS,
    details: truncate(b ? `${a} vs ${b}` : s.title || 'Match de hockey'),
    state: truncate(s.league ? `${s.league} · En direct` : 'En direct'),
    largeImageKey: config.fallbackImage,
    largeImageText: truncate(s.league || 'Hockey'),
    instance: false,
  };
}

let ticking = false;
let again = false;

async function tick() {
  if (ticking) { again = true; return; }
  ticking = true;
  try {
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
        s = { key, league: String(body.league || ''), region: String(body.region || ''), teams, title: String(body.title || ''), startedAt: Date.now() };
        sessions.set(id, s);
        log.info(`[onhockey] ${s.league || '?'} : ${teams.join(' - ') || s.title}`);
      }
      s.lastSeen = Date.now();
      tick();
      return send(200, { ok: true });
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
