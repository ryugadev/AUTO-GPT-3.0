const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'web/static/style.css'), 'utf8');

function mustContain(needle) {
  if (!css.includes(needle)) {
    throw new Error(`missing CSS marker: ${needle}`);
  }
}

mustContain('2026 desktop SaaS dashboard skin');
mustContain('body {\n  padding-left: 220px;');
mustContain('.topbar {\n  position: fixed;');
mustContain('.tab-nav::before');
mustContain('content: "Dashboard";');
mustContain('--primary: #3b82f6;');
mustContain('#tab-reg.tab-content.active {\n  grid-template-columns: repeat(15, minmax(0, 1fr));');
mustContain('#tab-reg > .card-input');
mustContain('grid-column: 1 / 10;');
mustContain('#tab-reg > .card-jobs');
mustContain('grid-column: 10 / 16;');
mustContain('#tab-reg > .card-log');
mustContain('#tab-reg > .card-success');
mustContain('#tab-reg > .card-error');
mustContain('#tab-session > .card-log');
mustContain('#tab-session > .card-error');
mustContain('#tab-upi.upi-dashboard-shell.active');
mustContain('.settings-layout {\n  height: 100dvh;');

console.log('ok: desktop dashboard skin wired');
