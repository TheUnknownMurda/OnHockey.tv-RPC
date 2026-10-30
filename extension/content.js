// Détecte quel match est ouvert dans le lecteur d'onhockey.tv et prévient le service worker.
(() => {
  const HEARTBEAT_MS = 15000;
  let current = null;
  let heartbeat = null;

  const linkKey = (url) => {
    const u = new URL(url, location.href);
    return u.pathname + u.search;
  };

  // Lit la ligne du calendrier : « Montréal - Washington » + nom de la ligue (en-tête du <tbody>).
  function gameFromLink(a) {
    const row = a.closest('tr.game');
    if (!row || !row.cells[1]) return null;
    let text = '';
    for (const n of row.cells[1].childNodes) {
      if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains('gamelinks')) break;
      text += n.textContent;
    }
    text = text.replace(/\s+/g, ' ').trim();
    const teams = text.split(/\s+[-–]\s+/);
    const tbody = row.closest('tbody');
    const league = tbody?.querySelector('tr:first-child b')?.textContent.trim() || '';
    return {
      league,
      region: tbody?.classList[0] || '', // filtre de région d'onhockey.tv (FI, SE, RU, NA…)
      // Icône de la ligue (« pic/ico/mleagues/khl.ico ») : distingue SHL suédoise / slovaque, OHL Ontario / Lettonie…
      icon: tbody?.querySelector('tr:first-child td[background]')?.getAttribute('background') || '',
      teams: teams.length === 2 ? teams : [],
      title: text,
      channel: a.title || a.textContent.trim(),
    };
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // Extension rechargée : ce script n'est plus valide.
      clearInterval(heartbeat);
    }
  }

  function setGame(game) {
    current = game;
    clearInterval(heartbeat);
    if (!game) {
      send({ type: 'stop' });
      return;
    }
    send({ type: 'watch', game });
    heartbeat = setInterval(() => send({ type: 'watch', game: current }), HEARTBEAT_MS);
  }

  function remember(a, game) {
    chrome.storage.local.get('links', ({ links = {} }) => {
      links[linkKey(a.href)] = { ...game, savedAt: Date.now() };
      // Garde seulement les liens des dernières 24 h.
      for (const [k, v] of Object.entries(links)) if (Date.now() - v.savedAt > 864e5) delete links[k];
      chrome.storage.local.set({ links });
    });
  }

  const isPlayerPage = /^\/np_/.test(location.pathname);

  if (isPlayerPage && window.top === window) {
    // Lecteur ouvert directement dans un onglet (clic du milieu) : retrouve le match depuis le dernier clic mémorisé.
    chrome.storage.local.get('links', ({ links = {} }) => {
      const game = links[linkKey(location.href)];
      if (game) setGame(game);
    });
    return;
  }

  // Page principale : un clic sur un lien de stream charge le lecteur dans l'iframe « player_frame ».
  const onLink = (e) => {
    const a = e.target.closest?.('a[target="player_frame"]');
    if (!a || !/\/np_/.test(new URL(a.href, location.href).pathname)) return;
    const game = gameFromLink(a);
    if (!game) return;
    remember(a, game);
    if (e.type === 'click' && !e.ctrlKey && !e.metaKey && !e.shiftKey) setGame(game);
  };
  document.addEventListener('click', onLink, true);
  document.addEventListener('auxclick', onLink, true);

  // Si le lecteur revient à l'accueil (ou à « Add stream »), on arrête la présence.
  const frame = document.querySelector('iframe[name="player_frame"]');
  frame?.addEventListener('load', () => {
    try {
      const p = frame.contentWindow.location.pathname;
      if (!/^\/np_/.test(p) && current) setGame(null);
    } catch {}
  });

  window.addEventListener('pagehide', () => current && send({ type: 'stop' }));
})();
