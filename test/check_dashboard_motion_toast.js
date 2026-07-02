const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'web/static/style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web/static/app.js'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'web/static/dialog.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'web/static/settings_panel.js'), 'utf8');

function mustContain(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`missing ${label}: ${needle}`);
  }
}

function mustMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`missing ${label}: ${pattern}`);
  }
}

mustContain(css, 'Premium motion layer: fast, crisp, dashboard-grade micro-interactions.', 'motion css marker');
mustContain(css, '@keyframes dashboardTabIn', 'tab switch animation');
mustContain(css, '@keyframes dashboardCardIn', 'card entrance animation');
mustContain(css, '.tab-btn::before', 'premium tab active rail');
mustContain(css, '.gpt-toast-container', 'toast container skin');
mustContain(css, '.gpt-toast.gpt-toast-show', 'toast show animation');
mustContain(css, '--motion-tab: 220ms;', 'fast tab timing');

mustContain(app, 'while (container.children.length >= 5)', 'toast stack cap');
mustContain(app, 'el.dataset.toastType = type;', 'toast type metadata');
mustContain(app, "type === 'error' ? 3600", 'error toast duration');
mustContain(app, 'setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 180);', 'fast toast removal');

mustContain(dialog, 'opts.modal !== true', 'non-modal alert gate');
mustContain(dialog, 'window.GptUi.toast(text', 'Dialog.alert toast bridge');
mustContain(dialog, 'return Promise.resolve(true);', 'Dialog.alert promise compatibility');

mustMatch(settings, /function setStatus[\s\S]*window\.GptUi\.toast/, 'proxy status toast');
mustMatch(settings, /function setTgStatus[\s\S]*window\.GptUi\.toast/, 'telegram status toast');
mustContain(settings, 'if (!kind && !isActionProgress) return;', 'passive load toast guard');

console.log('ok: dashboard motion and toast wiring present');
