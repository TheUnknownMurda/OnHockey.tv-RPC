// Relaie les événements de l'onglet onhockey.tv vers l'application locale OnHockey.tv RPC.
const API = 'http://127.0.0.1:47823';

async function post(path, body) {
  try {
    await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OnHockey-RPC': '1' },
      body: JSON.stringify(body),
    });
  } catch {
    // OnHockey.tv RPC n'est pas lancé : rien à faire.
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  if (msg.type === 'watch' && msg.game) post('/watch', { tabId, ...msg.game });
  if (msg.type === 'stop') post('/stop', { tabId });
});

chrome.tabs.onRemoved.addListener((tabId) => post('/stop', { tabId }));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && !/^https?:\/\/([^/]+\.)?onhockey\.tv\//.test(info.url)) post('/stop', { tabId });
});
