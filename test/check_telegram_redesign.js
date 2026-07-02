const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const js = read('web/static/settings_panel.js');
const css = read('web/static/style.css');
const html = read('web/static/index.html');

function must(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label || needle} missing`);
  }
}

must(html, 'telegram-settings-hero', 'telegram hero');
must(html, 'telegram-config-card', 'telegram config card');
must(js, 'telegram-status-grid', 'status cards');
must(js, 'telegram-metric-grid', 'metric cards');
must(js, 'telegram-group-search', 'group search');
must(js, 'telegram-group-card', 'group card rows');
must(js, 'applyTelegramGroupFilter', 'UI-only search filter');
must(js, 'data-tg-action="save"', 'existing save action');
must(js, 'data-tg-action="test"', 'existing test action');
must(js, 'data-tg-action="stats"', 'existing stats action');
must(js, 'data-tg-action="reset"', 'existing reset action');
must(js, 'qr_sent: sentInput', 'manual QR sent save');
must(js, 'plus_count: plusInput', 'manual plus save');
must(css, '.telegram-progress', 'progress bar styling');
must(css, '.telegram-metric-card', 'metric card styling');
must(css, '.telegram-mini-toggle', 'toggle styling');

console.log('ok: telegram redesign contracts wired');
