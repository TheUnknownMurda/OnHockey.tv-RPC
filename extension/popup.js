const $ = (id) => document.getElementById(id);
const set = (id, text, ok) => {
  $(id).textContent = text;
  $(id).className = ok ? 'ok' : 'bad';
};

fetch('http://127.0.0.1:47823/status')
  .then((r) => r.json())
  .then((s) => {
    set('app', 'running', true);
    set('discord', s.discord ? 'connected' : 'not connected', s.discord);
    if (!s.discord) $('hint').textContent = 'Open the Discord desktop app. NHL-RPC reconnects within 15 s.';
    const a = s.watching?.activity;
    if (a) {
      $('game').className = 'game';
      $('game').replaceChildren();
      const b = document.createElement('b');
      b.textContent = a.details;
      $('game').append(b, a.state || '');
    }
  })
  .catch(() => {
    set('app', 'not found', false);
    set('discord', '—', false);
    $('hint').textContent = 'NHL-RPC is not running. Run start.bat in the NHL-RPC folder.';
  });
