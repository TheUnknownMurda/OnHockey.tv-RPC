// Démarre OnHockey.tv RPC en arrière-plan, sans fenêtre, puis se termine.
// Remplace start-hidden.vbs : VBScript est obsolète sous Windows et Avast retirait ce script (IDP.Generic).
const path = require('path');
const { spawn } = require('child_process');

spawn(process.execPath, [path.join('src', 'index.js')], {
  cwd: path.join(__dirname, '..'),
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
}).unref();
