// Connexion IPC à Discord avec reconnexion automatique, déduplication et limitation des mises à jour.
const { Client } = require('@xhayper/discord-rpc');

const MIN_INTERVAL_MS = 5000; // Discord limite à 5 mises à jour / 20 s.

class Presence {
  constructor(clientId, log = console) {
    this.clientId = clientId;
    this.log = log;
    this.client = null;
    this.ready = false;
    this.wanted = null; // activité voulue (null = effacée)
    this.applied = undefined; // JSON de la dernière activité envoyée
    this.lastSend = 0;
    this.timer = null;
    this.connect();
  }

  connect() {
    if (this.client) this.client.removeAllListeners();
    this.client = new Client({ clientId: this.clientId, transport: { type: 'ipc' } });
    this.client.on('ready', () => {
      this.ready = true;
      this.applied = undefined;
      this.log.info(`[discord] connecté (${this.client.user?.username ?? 'utilisateur'})`);
      this.flush();
    });
    this.client.on('disconnected', () => {
      if (this.ready) this.log.warn('[discord] déconnecté, nouvelle tentative dans 15 s');
      this.ready = false;
      this.retry();
    });
    this.client.login().catch(() => {
      this.ready = false;
      this.retry();
    });
  }

  retry() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 15000);
  }

  set(activity) {
    this.wanted = activity;
    this.flush();
  }

  clear() {
    this.set(null);
  }

  flush() {
    if (!this.ready) return;
    const json = JSON.stringify(this.wanted);
    if (json === this.applied) return;
    const wait = this.lastSend + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    this.lastSend = Date.now();
    this.applied = json;
    const op = this.wanted ? this.client.user.setActivity(this.wanted) : this.client.user.clearActivity();
    op.catch((err) => {
      this.applied = undefined;
      this.log.warn(`[discord] échec de la mise à jour: ${err.message}`);
    });
  }

  async destroy() {
    try {
      if (this.ready) await this.client.user.clearActivity();
      await this.client.destroy();
    } catch {}
  }
}

module.exports = { Presence };
