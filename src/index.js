// OnHockey.tv RPC : reçoit de l'extension le match regardé sur onhockey.tv et l'affiche dans Discord.
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../config.json');
const { Presence } = require('./discord');
const nhl = require('./nhl');
const { getMatchupImageUrl } = require('./matchup-image');

const LOG_FILE = path.join(__dirname, '..', 'onhockey-tv-rpc.log');
const write = (level, msg) => {
  const line = `${new Date().toLocaleString('fr-CA')} [${level}] ${msg}`;
  (level === 'ERR' ? console.error : console.log)(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
};
const log = { info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('ERR', m) };

const SESSION_TTL_MS = 45000; // sans signal de l'extension pendant 45 s → on considère que l'onglet est fermé
const NHL_LOGO = 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png';
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

const isNhl = (league) => /\bNHL\b|\bLNH\b/i.test(league || '');
const truncate = (s, n = 128) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

async function nhlActivity(s) {
  if (!s.game) {
    if (Date.now() - (s.lastLookup || 0) < 30000) return null;
    s.lastLookup = Date.now();
    const found = await nhl.findGame(s.teams);
    if (!found) { log.warn(`[nhl] aucun match trouvé pour « ${s.teams.join(' - ')} »`); return null; }
    s.game = { id: found.id, gameDate: found.gameDate };
    log.info(`[nhl] match trouvé : ${found.awayTeam.abbrev} @ ${found.homeTeam.abbrev} (${found.id})`);
  }
  const game = await nhl.fetchGame(s.game.id, s.game.gameDate);
  if (!game) return null;
  const d = nhl.describe(game);

  if (config.generateMatchupImage && s.image === undefined) {
    s.image = null; // en cours
    getMatchupImageUrl(d.away.abbrev, d.home.abbrev, { log, apiKey: config.freeimageApiKey }).then((url) => {
      s.image = url || config.fallbackImage;
      tick();
    });
  }

  const activity = {
    type: WATCHING,
    statusDisplayType: SHOW_DETAILS,
    details: truncate(d.details),
    state: truncate(d.status),
    largeImageKey: s.image || config.fallbackImage,
    largeImageText: truncate(d.shots ? `${d.fullTitle} · ${d.shots}` : d.fullTitle),
    instance: false,
  };
  // Le petit badge LNH recouvre le logo de l'équipe locale sur l'affiche : désactivé par défaut.
  if (config.showLeagueBadge) Object.assign(activity, { smallImageKey: NHL_LOGO, smallImageText: 'LNH' });
  if (d.url) activity.detailsUrl = d.url;
  if (config.showGamecenterButton && d.url) activity.buttons = [{ label: 'Gamecenter NHL.com', url: d.url }];
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
    if (isNhl(s.league) && s.teams.length === 2) {
      try {
        activity = await nhlActivity(s);
      } catch (err) {
        log.warn(`[nhl] ${err.message}`);
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
        s = { key, league: String(body.league || ''), teams, title: String(body.title || ''), startedAt: Date.now() };
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
