'use strict';
// Launches Electron with ELECTRON_RUN_AS_NODE cleared.
// This is needed when the environment (e.g. VSCode) sets ELECTRON_RUN_AS_NODE=1,
// which would cause Electron to run as a plain Node.js process instead of an app.

const { spawn } = require('child_process');
const path      = require('path');
const electron  = require('electron'); // returns path to electron binary

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname)], {
  stdio:       'inherit',
  env,
  windowsHide: false
});

child.on('close', (code) => process.exit(code || 0));
