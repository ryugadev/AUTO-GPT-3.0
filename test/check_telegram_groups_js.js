const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
for (const rel of ['web/static/upi.js', 'web/static/settings_panel.js']) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  new Function(src);
}

console.log('ok: telegram group ui js syntax');
