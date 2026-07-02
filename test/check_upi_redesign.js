const fs = require('fs');

const html = fs.readFileSync('web/static/index.html', 'utf8');
const css = fs.readFileSync('web/static/style.css', 'utf8');
const js = fs.readFileSync('web/static/upi.js', 'utf8');

new Function(js);

function must(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function mustNot(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`Unexpected ${label}: ${needle}`);
  }
}

mustNot(html, 'upi-kpi-card', 'removed UPI KPI card markup');
mustNot(html, 'upi-kpi-grid', 'removed UPI KPI grid markup');
mustNot(html, 'upi-dashboard-hero', 'removed UPI dashboard hero markup');

[
  'upi-dashboard-shell',
  'upi-status-ribbon',
  'upi-kpi-accounts',
  'upi-kpi-jobs',
  'upi-kpi-running',
  'upi-kpi-waiting',
  'upi-kpi-plus',
  'upi-kpi-proxy',
  'upi-btn-run',
  'upi-btn-stop-all',
  'upi-btn-clear-input',
  'upi-btn-retry-expired-free',
  'upi-btn-retry-failed',
  'upi-btn-clear-done',
  'upi-btn-clear-all',
  'upi-btn-copy-success',
  'upi-btn-copy-error',
].forEach((idOrClass) => must(html, idOrClass, `UPI markup ${idOrClass}`));

must(html, 'Start Jobs', 'compact primary action label');

[
  '#tab-upi.upi-dashboard-shell',
  '#tab-upi .upi-status-ribbon',
  '#tab-upi .upi-runtime-settings',
  '#tab-upi .upi-head-config',
  '#tab-upi .card-settings-row',
  '.upi-output-card .output-pane',
  '.upi-error-card .output-pane',
].forEach((selector) => must(css, selector, `UPI CSS ${selector}`));

must(css, 'grid-template-rows: 44px minmax(0, 1fr) 170px 120px;', 'viewport-bound UPI rows');
must(css, 'height: 44px;', 'single-line UPI status ribbon');
must(css, 'flex: 0 0 44px;', 'always-visible UPI action bar');
must(css, 'overflow: hidden;', 'UPI panel overflow control');
must(css, '#tab-upi.upi-dashboard-shell.active', 'UPI shell only displays when active');
must(css, '#tab-upi.upi-dashboard-shell:not(.active)', 'UPI shell hidden when inactive');
must(css, '#tab-upi .upi-jobs-card .card-head-actions', 'UPI jobs toolbar visibility fix');
must(css, 'flex-wrap: nowrap;', 'UPI jobs toolbar stays on one row');
must(css, 'overflow-x: auto;', 'UPI jobs toolbar fallback scroll');

[
  'kpiAccounts',
  'kpiJobs',
  'kpiRunning',
  'kpiWaiting',
  'kpiPlus',
  'updateUpiDashboardStats',
].forEach((token) => must(js, token, `UPI KPI JS ${token}`));

must(js, "/api/upi/jobs/${encodeURIComponent(jobId)}/qr", 'existing QR endpoint');
must(js, "/api/upi/jobs/${encodeURIComponent(id)}/notify", 'existing Telegram notify endpoint');

console.log('UPI redesign contract OK');
