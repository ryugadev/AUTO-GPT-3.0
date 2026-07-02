const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const upi = read('web/static/upi.js');
const css = read('web/static/style.css');
const manager = read('web/manager.py');
const server = read('web/server.py');

function must(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label || needle} missing`);
  }
}

new Function(upi);

must(manager, '"telegram_qr_sent": bool(self._telegram_qr_message_id)', 'job telegram sent flag');
must(server, '@app.post("/api/upi/jobs/{job_id}/notify")', 'manual notify endpoint');
must(server, 'job_id=job.id', 'manual notify tracks job id');
must(server, 'return JSONResponse({"ok": True, "job": job.to_dict()})', 'manual notify returns job');

must(upi, "data-action=\"send-telegram\"", 'send telegram button');
must(upi, "/api/upi/jobs/${encodeURIComponent(id)}/notify", 'send telegram API call');
must(upi, "cur.telegram_qr_sent = true", 'manual sent fallback state');
must(upi, "cho_quet ${stats.waitingScan}", 'waiting scan summary');
must(upi, "plus ${stats.plus}", 'plus summary');
must(upi, "upi-telegram-sent", 'telegram sent row class');

must(css, '#tab-upi .job.upi-telegram-sent', 'sent row green style');
must(css, '.upi-send-telegram-btn', 'send button style');
must(css, '.upi-telegram-sent-badge', 'sent badge style');

console.log('ok: upi telegram notify ui wired');
