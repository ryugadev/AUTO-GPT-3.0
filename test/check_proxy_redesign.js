const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('web/static/index.html');
const js = read('web/static/settings_panel.js');
const css = read('web/static/style.css');

function must(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label || needle} missing`);
  }
}

for (const id of [
  'proxy-pool-mode',
  'proxy-pool-summary',
  'login-flow-select',
  'proxy-pool-rows',
  'proxy-pool-add',
  'proxy-pool-paste',
  'proxy-pool-clear-dead',
  'proxy-pool-clear-all',
  'proxy-pool-test-all',
  'proxy-pool-save',
  'proxy-pool-status',
]) {
  must(html, `id="${id}"`, id);
}

must(html, 'proxy-settings-hero', 'proxy dashboard header');
must(html, 'proxy-status-grid', 'proxy status cards');
must(html, 'proxy-login-card', 'login flow card');
must(html, 'proxy-guide-card', 'proxy guide card');
must(html, 'proxy-list-card', 'proxy list card');
must(html, 'proxy-sticky-actions', 'sticky action bar');

must(js, 'api("/api/proxy/pool"', 'proxy pool API');
must(js, 'api("/api/proxy/test-all"', 'proxy test API');
must(js, 'collectProxies()', 'existing collect flow');
must(js, 'class="proxy-pool-input"', 'proxy input row');
must(js, 'proxy-pool-remove', 'proxy remove row');
must(js, 'dom.btnTestAll.addEventListener("click", testAll)', 'test all handler');
must(js, 'dom.btnSave.addEventListener("click", save)', 'save handler');

must(css, '.proxy-status-card', 'status card styling');
must(css, '.proxy-surface-card', 'surface card styling');
must(css, '.proxy-sticky-actions', 'sticky action styling');
must(css, '#settings-section-proxies .proxy-pool-row', 'final row override');

console.log('ok: proxy redesign contracts wired');
