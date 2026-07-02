const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function contains(rel, needle) {
  const src = read(rel);
  if (!src.includes(needle)) {
    throw new Error(`${needle} missing from ${rel}`);
  }
}

for (const rel of ['web/static/settings_panel.js']) {
  const src = read(rel);
  new Function(src);
}

contains('web/static/index.html', 'proxy-pool-clear-dead');
contains('web/static/index.html', 'proxy-pool-clear-all');
contains('web/static/settings_panel.js', 'function clearDeadProxies');
contains('web/static/settings_panel.js', 'function clearAllProxies');
contains('web/static/settings_panel.js', 'proxy-row-fail');
contains('web/static/style.css', '.proxy-row-ok');
contains('web/static/style.css', '.proxy-row-fail');

console.log('ok: proxy ui bulk actions wired');
