const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'web/static/style.css'), 'utf8');

function mustContain(needle) {
  if (!css.includes(needle)) {
    throw new Error(`missing CSS marker: ${needle}`);
  }
}

mustContain('Reg + Get Session workspace refresh');
mustContain('#tab-reg.tab-content.active');
mustContain('#tab-session.tab-content.active');
mustContain('height: calc(100dvh - 52px)');
mustContain('grid-template-areas:\n    "input jobs"\n    "log   jobs"\n    "success error";');
mustContain('grid-template-areas:\n    "input jobs"\n    "log   jobs"\n    "error error";');
mustContain('#tab-reg .mail-mode-row');
mustContain('#tab-reg .combo-textarea,\n#tab-session .combo-textarea');
mustContain('#tab-reg .card-actions,\n#tab-session .card-actions');

console.log('ok: reg/session workspace css wired');
