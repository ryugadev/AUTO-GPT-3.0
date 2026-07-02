// settings_panel.js — Tab "Settings" với sidebar dọc.
// Section đầu: cấu hình proxy pool (repeater nhiều proxy URL để xoay vòng).
//
// Nguồn dữ liệu: backend Settings Store qua /api/proxy/pool (GET/POST) +
// /api/proxy/test-all. KHÔNG dùng localStorage cho config (theo project rules).
(function () {
  "use strict";

  // ── Auth helper (reuse pattern app.js/hme.js) ──────────────────────────
  function api(path, opts) {
    opts = opts || {};
    var token =
      (window.GptUi && window.GptUi.getAuthToken && window.GptUi.getAuthToken()) || "";
    var headers = Object.assign(
      { "Content-Type": "application/json" },
      token ? { "X-API-Token": token } : {},
      opts.headers || {}
    );
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + ": " + t);
        });
      }
      return r.json();
    });
  }

  var $ = function (id) { return document.getElementById(id); };

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Mask credential khi hiển thị trạng thái (user:pass@host → ***@host)
  function maskProxy(url) {
    if (!url) return "direct";
    var m = String(url).match(/^([a-z][a-z0-9+.-]*):\/\/([^@/]+)@(.+)$/i);
    return m ? m[1] + "://***@" + m[3] : url;
  }

  // ── State ──────────────────────────────────────────────────────────────
  var state = {
    rows: [],          // [{id, value}] — danh sách proxy đang edit
    mode: "round_robin",
    lastResults: null, // map proxy → {ok, public_ip, detail}
    loaded: false,
    busy: false,
  };
  var _rowSeq = 0;

  var dom = {};

  function cacheDom() {
    dom.section = $("settings-section-proxies");
    dom.rowsHost = $("proxy-pool-rows");
    dom.modeSelect = $("proxy-pool-mode");
    dom.summary = $("proxy-pool-summary");
    dom.btnAdd = $("proxy-pool-add");
    dom.btnPaste = $("proxy-pool-paste");
    dom.btnClearDead = $("proxy-pool-clear-dead");
    dom.btnClearAll = $("proxy-pool-clear-all");
    dom.btnTestAll = $("proxy-pool-test-all");
    dom.btnSave = $("proxy-pool-save");
    dom.statusLine = $("proxy-pool-status");
    dom.loginFlow = $("login-flow-select");
    // Paste modal
    dom.pasteModal = $("proxy-paste-modal");
    dom.pasteTextarea = $("proxy-paste-textarea");
    dom.pasteClose = $("proxy-paste-close");
    dom.pasteCancel = $("proxy-paste-cancel");
    dom.pasteApply = $("proxy-paste-apply");
    // Sidebar
    dom.navItems = Array.prototype.slice.call(
      document.querySelectorAll("#tab-settings .settings-nav-item")
    );
    dom.panes = Array.prototype.slice.call(
      document.querySelectorAll("#tab-settings [data-settings-pane]")
    );
    // Telegram section
    dom.tgBotToken = $("telegram-bot-token");
    dom.tgChatId = $("telegram-chat-id");
    dom.tgSave = $("telegram-save");
    dom.tgTest = $("telegram-test");
    dom.tgStatus = $("telegram-status");
    dom.tgBadge = $("telegram-status-badge");
    dom.tgSyncGroups = $("telegram-sync-groups");
    dom.tgResetGroups = $("telegram-reset-groups");
    dom.tgGroupsBody = $("telegram-groups-body");
    dom.tgAddTitle = $("telegram-add-title");
    dom.tgAddChatId = $("telegram-add-chat-id");
    dom.tgAddBotToken = $("telegram-add-bot-token");
    dom.tgAddGroup = $("telegram-add-group");
    dom.tgGroupSearch = $("telegram-group-search");
    ensureTelegramGroupsUi();
    dom.tgResetAllInline = $("telegram-refresh-inline");
  }

  function ensureTelegramGroupsUi() {
    if (!dom.tgStatus || $("telegram-groups-body")) return;
    var toolbar = dom.tgStatus.previousElementSibling;
    if (toolbar && toolbar.classList && toolbar.classList.contains("proxy-pool-toolbar")) {
      var sync = document.createElement("button");
      sync.id = "telegram-sync-groups";
      sync.className = "btn btn-ghost btn-small";
      sync.type = "button";
      sync.textContent = "Sync groups";
      var reset = document.createElement("button");
      reset.id = "telegram-reset-groups";
      reset.className = "btn btn-ghost btn-small";
      reset.type = "button";
      reset.textContent = "Refresh";
      toolbar.insertBefore(sync, dom.tgTest);
      toolbar.insertBefore(reset, dom.tgTest);
      dom.tgSyncGroups = sync;
      dom.tgResetGroups = reset;
    }
    var wrap = document.createElement("div");
    wrap.className = "telegram-groups-wrap";
    wrap.innerHTML =
      '<div class="telegram-status-grid">' +
      '<div class="telegram-status-card"><span class="telegram-status-icon">BOT</span><div><span>Bot Status</span><strong id="telegram-stat-bot">Disconnected</strong></div></div>' +
      '<div class="telegram-status-card"><span class="telegram-status-icon">API</span><div><span>API Health</span><strong>Healthy</strong></div></div>' +
      '<div class="telegram-status-card"><span class="telegram-status-icon">CHAT</span><div><span>Default Chat</span><strong id="telegram-stat-chat">-</strong></div></div>' +
      '<div class="telegram-status-card"><span class="telegram-status-icon">SYNC</span><div><span>Last Sync</span><strong id="telegram-stat-sync">Live</strong></div></div>' +
      '</div>' +
      '<div class="telegram-metric-grid">' +
      '<div class="telegram-metric-card"><span>Groups</span><strong id="telegram-metric-groups">0</strong><em>notification targets</em></div>' +
      '<div class="telegram-metric-card"><span>QR Sent</span><strong id="telegram-metric-sent">0</strong><em>delivery counter</em></div>' +
      '<div class="telegram-metric-card"><span>Upload Success</span><strong id="telegram-metric-plus">0</strong><em>plus confirmed</em></div>' +
      '<div class="telegram-metric-card"><span>Success Rate</span><strong id="telegram-metric-rate">0%</strong><em>existing ratio</em></div>' +
      '</div>' +
      '<div class="telegram-groups-head"><div><strong>Telegram QR groups</strong>' +
      '<span class="muted">Bot tu dong lay group tu getUpdates.</span></div>' +
      '<div class="telegram-head-tools"><label class="telegram-search"><span>Search</span><input type="search" id="telegram-group-search" placeholder="Search group or chat ID" autocomplete="off" /></label>' +
      '<span class="badge badge-muted" id="telegram-groups-count">0 groups</span></div></div>' +
      '<div class="telegram-add-row">' +
      '<label><span>Name</span><input type="text" id="telegram-add-title" placeholder="UPI SCAN 2" /></label>' +
      '<label><span>Chat ID</span><input type="text" id="telegram-add-chat-id" placeholder="-5380146103" /></label>' +
      '<label><span>Bot token</span><input type="password" id="telegram-add-bot-token" placeholder="optional - rieng group nay" /></label>' +
      '<button id="telegram-add-group" class="btn btn-primary btn-small" type="button">+ Add group</button>' +
      '</div>' +
      '<div class="telegram-card-toolbar"><span class="telegram-actions-head">Groups console <button id="telegram-refresh-inline" class="btn btn-ghost btn-small" type="button" title="Cap nhat so lieu moi nhat">Refresh</button></span></div>' +
      '<table class="telegram-groups-table"><tbody id="telegram-groups-body">' +
      '<tr><td colspan="8"><div class="telegram-empty">Chua co group. Add bot vao group, gui /start@bot roi bam Sync groups.</div></td></tr>' +
      '</tbody></table>';
    dom.tgStatus.parentNode.insertBefore(wrap, dom.tgStatus);
    dom.tgGroupsBody = $("telegram-groups-body");
    dom.tgResetAllInline = $("telegram-refresh-inline");
    dom.tgAddTitle = $("telegram-add-title");
    dom.tgAddChatId = $("telegram-add-chat-id");
    dom.tgAddBotToken = $("telegram-add-bot-token");
    dom.tgAddGroup = $("telegram-add-group");
    dom.tgGroupSearch = $("telegram-group-search");
  }

  // ── Sidebar section switching ────────────────────────────────────────────
  function activateSection(sectionId) {
    dom.navItems.forEach(function (btn) {
      var on = btn.dataset.settingsSection === sectionId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    dom.panes.forEach(function (pane) {
      pane.classList.toggle("active", pane.dataset.settingsPane === sectionId);
    });
  }

  // ── Row rendering ──────────────────────────────────────────────────────
  function makeRow(value) {
    return { id: "pp-" + _rowSeq++, value: value || "" };
  }

  function renderRows() {
    if (state.rows.length === 0) {
      dom.rowsHost.innerHTML =
        '<div class="proxy-pool-empty muted">Chưa có proxy nào. Bấm "Thêm proxy" hoặc "Dán hàng loạt".</div>';
      updateSummary();
      return;
    }
    var html = state.rows
      .map(function (row, idx) {
        var res = state.lastResults ? state.lastResults[row.value.trim()] : null;
        var rowCls = "proxy-pool-row";
        var dotCls = "proxy-dot";
        var statusCls = "proxy-pool-row-status";
        var statusTxt = "";
        if (res) {
          if (res.ok) {
            rowCls += " proxy-row-ok";
            dotCls = "proxy-dot proxy-dot-ok";
            statusCls += " proxy-status-ok";
            statusTxt = res.public_ip ? "IP " + escHtml(res.public_ip) : "live";
          } else {
            rowCls += " proxy-row-fail";
            dotCls = "proxy-dot proxy-dot-fail";
            statusCls += " proxy-status-fail";
            statusTxt = res.detail || "dead";
          }
        }
        var statusTitle = res && res.detail ? res.detail : (statusTxt || "chua test");
        return (
          '<div class="' + rowCls + '" data-row-id="' + row.id + '">' +
            '<span class="' + dotCls + '" title="' + escHtml(statusTxt || "chưa test") + '"></span>' +
            '<span class="proxy-pool-index">#' + (idx + 1) + "</span>" +
            '<label class="proxy-pool-address"><span>Proxy Address</span>' +
              '<input type="text" class="proxy-pool-input" data-row-id="' + row.id + '"' +
                ' value="' + escHtml(row.value) + '"' +
                ' placeholder="http://user:pass@host:port" spellcheck="false" autocomplete="off" />' +
            '</label>' +
            '<span class="' + statusCls + '" title="' + escHtml(statusTitle) + '">' + escHtml(statusTxt || "unknown") + "</span>" +
            '<button class="icon-btn icon-danger proxy-pool-remove" data-row-id="' + row.id +
              '" type="button" title="Xoá" aria-label="Xoá proxy">' +
              (window.GptUi ? window.GptUi.icon("remove") : "×") +
            "</button>" +
          "</div>"
        );
      })
      .join("");
    dom.rowsHost.innerHTML = html;
    updateSummary();
  }

  function updateSummary() {
    var total = state.rows.filter(function (r) { return r.value.trim(); }).length;
    var live = 0;
    var dead = 0;
    if (state.lastResults) {
      state.rows.forEach(function (r) {
        var res = state.lastResults[r.value.trim()];
        if (res) { res.ok ? live++ : dead++; }
      });
    }
    var txt = total + " proxy";
    if (state.lastResults) txt += " · " + live + " live · " + dead + " dead";
    dom.summary.textContent = txt;
    dom.summary.className = "badge " + (dead > 0 ? "badge-warn" : (live > 0 ? "badge-success" : "badge-muted"));
    var metricTotal = $("proxy-metric-total");
    var metricLive = $("proxy-metric-live");
    var metricMode = $("proxy-metric-mode");
    var metricLogin = $("proxy-metric-login");
    if (metricTotal) metricTotal.textContent = String(total);
    if (metricLive) metricLive.textContent = String(live);
    if (metricMode && dom.modeSelect) {
      var selected = dom.modeSelect.options[dom.modeSelect.selectedIndex];
      metricMode.textContent = selected ? selected.text.replace(/\s*\(.+\)\s*$/, "") : dom.modeSelect.value;
    }
    if (metricLogin && dom.loginFlow) {
      metricLogin.textContent = dom.loginFlow.value || "anti409";
    }
  }

  // Sync giá trị từ input DOM về state (trước khi save/test)
  function syncRowsFromDom() {
    var inputs = dom.rowsHost.querySelectorAll(".proxy-pool-input");
    Array.prototype.forEach.call(inputs, function (inp) {
      var row = state.rows.find(function (r) { return r.id === inp.dataset.rowId; });
      if (row) row.value = inp.value;
    });
  }

  function collectProxies() {
    syncRowsFromDom();
    var seen = {};
    var out = [];
    state.rows.forEach(function (r) {
      var v = r.value.trim();
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out;
  }

  function setStatus(text, kind) {
    dom.statusLine.textContent = text || "";
    dom.statusLine.className = "proxy-pool-status muted" + (kind ? " proxy-pool-status-" + kind : "");
    if (text && window.GptUi && typeof window.GptUi.toast === "function") {
      var isActionProgress = /^(\u0110ang|Dang)\s/i.test(text);
      if (!kind && !isActionProgress) return;
      var type = kind === "fail" ? "error" : (kind === "ok" ? "success" : "info");
      window.GptUi.toast(text, { type: type, duration: type === "info" ? 1400 : undefined });
    }
  }

  // ── Load from backend ──────────────────────────────────────────────────
  function load() {
    loadLoginFlow();
    return api("/api/proxy/pool")
      .then(function (data) {
        state.mode = data.rotation_mode || "round_robin";
        dom.modeSelect.value = state.mode;
        var proxies = data.proxies || [];
        state.rows = proxies.map(function (p) { return makeRow(p); });
        if (state.rows.length === 0) state.rows.push(makeRow(""));
        state.loaded = true;
        renderRows();
        var rt = data.runtime || {};
        if (rt.total) {
          setStatus("Đã lưu " + rt.total + " proxy · " + (rt.live || 0) + " live.", null);
        }
      })
      .catch(function (err) {
        setStatus("Load thất bại: " + err.message, "fail");
      });
  }

  // ── Save ───────────────────────────────────────────────────────────────
  function save() {
    if (state.busy) return;
    var proxies = collectProxies();
    state.busy = true;
    dom.btnSave.disabled = true;
    setStatus("Đang lưu…", null);
    api("/api/proxy/pool", {
      method: "POST",
      body: JSON.stringify({ proxies: proxies, rotation_mode: dom.modeSelect.value }),
    })
      .then(function (data) {
        state.mode = data.rotation_mode;
        // Normalize lại danh sách theo backend (đã dedupe)
        state.rows = (data.proxies || []).map(function (p) { return makeRow(p); });
        if (state.rows.length === 0) state.rows.push(makeRow(""));
        state.lastResults = null;
        renderRows();
        var extra = data.settings_persist_error ? " (cảnh báo: " + data.settings_persist_error + ")" : "";
        setStatus("Đã lưu " + proxies.length + " proxy." + extra, data.settings_persist_error ? "fail" : "ok");
      })
      .catch(function (err) {
        setStatus("Lưu thất bại: " + err.message, "fail");
      })
      .finally(function () {
        state.busy = false;
        dom.btnSave.disabled = false;
      });
  }

  // ── Test All ─────────────────────────────────────────────────────────────
  function testAll() {
    if (state.busy) return;
    var proxies = collectProxies();
    if (proxies.length === 0) {
      setStatus("Không có proxy để test.", "fail");
      return;
    }
    state.busy = true;
    dom.btnTestAll.disabled = true;
    setStatus("Đang test " + proxies.length + " proxy…", null);
    api("/api/proxy/test-all", {
      method: "POST",
      body: JSON.stringify({ proxies: proxies }),
    })
      .then(function (data) {
        var map = {};
        (data.results || []).forEach(function (item) {
          map[item.proxy] = item;
        });
        state.lastResults = map;
        renderRows();
        setStatus(
          "Test xong: " + (data.live || 0) + " live / " + (data.dead || 0) + " dead / " + (data.total || 0) + " tổng.",
          (data.dead || 0) > 0 ? "fail" : "ok"
        );
      })
      .catch(function (err) {
        setStatus("Test thất bại: " + err.message, "fail");
      })
      .finally(function () {
        state.busy = false;
        dom.btnTestAll.disabled = false;
      });
  }

  // ── Telegram section ─────────────────────────────────────────────────
  function clearAllProxies() {
    if (state.busy) return;
    syncRowsFromDom();
    var count = state.rows.filter(function (r) { return r.value.trim(); }).length;
    state.rows = [makeRow("")];
    state.lastResults = null;
    renderRows();
    setStatus("Da xoa " + count + " proxy khoi danh sach. Bam Luu de cap nhat database.", "ok");
  }

  function clearDeadProxies() {
    if (state.busy) return;
    syncRowsFromDom();
    if (!state.lastResults) {
      setStatus("Hay Test All truoc khi xoa die.", "fail");
      return;
    }
    var removed = 0;
    state.rows = state.rows.filter(function (row) {
      var value = row.value.trim();
      if (!value) return false;
      var res = state.lastResults[value];
      if (res && res.ok === false) {
        removed++;
        return false;
      }
      return true;
    });
    if (state.rows.length === 0) state.rows.push(makeRow(""));
    state.lastResults = null;
    renderRows();
    setStatus("Da xoa " + removed + " proxy die. Bam Luu de cap nhat database.", removed ? "ok" : null);
  }

  var tgState = { loaded: false, busy: false };
  var tgRefreshTimer = null;

  function setTgStatus(text, kind) {
    if (!dom.tgStatus) return;
    dom.tgStatus.textContent = text || "";
    dom.tgStatus.className = "proxy-pool-status muted" + (kind ? " proxy-pool-status-" + kind : "");
    if (text && window.GptUi && typeof window.GptUi.toast === "function") {
      var isActionProgress = /^(\u0110ang|Dang)\s/i.test(text);
      if (!kind && !isActionProgress) return;
      var type = kind === "fail" ? "error" : (kind === "ok" ? "success" : "info");
      window.GptUi.toast(text, { type: type, duration: type === "info" ? 1400 : undefined });
    }
  }

  function setTgBadge(configured) {
    if (!dom.tgBadge) return;
    dom.tgBadge.textContent = configured ? "đã cấu hình" : "chưa cấu hình";
    dom.tgBadge.className = "badge " + (configured ? "badge-success" : "badge-muted");
  }

  // ── Login flow (session.login_flow — setting toàn cục) ──────────────────
  function loadLoginFlow() {
    if (!dom.loginFlow) return Promise.resolve();
    return api("/api/settings/session.login_flow")
      .then(function (data) {
        dom.loginFlow.value = (data && data.value === "legacy") ? "legacy" : "anti409";
        updateSummary();
      })
      .catch(function () {
        dom.loginFlow.value = "anti409";  // 404/chưa set → default
        updateSummary();
      });
  }

  function saveLoginFlow() {
    if (!dom.loginFlow) return;
    var val = dom.loginFlow.value === "legacy" ? "legacy" : "anti409";
    api("/api/settings/session.login_flow", {
      method: "PUT",
      body: JSON.stringify({ value: val }),
    })
      .then(function () {
        setStatus("Login flow: " + val, "ok");
        updateSummary();
      })
      .catch(function (err) {
        setStatus("Lưu login flow thất bại: " + err.message, "fail");
      });
  }

  function loadTelegram() {
    if (!dom.tgBotToken) return Promise.resolve();
    return api("/api/telegram/config")
      .then(function (data) {
        dom.tgBotToken.value = data.bot_token || "";
        dom.tgChatId.value = data.chat_id || "";
        renderTelegramGroups(data.groups || [], data.chat_id || "");
        setTgBadge(!!data.configured);
        tgState.loaded = true;
        startTelegramAutoRefresh();
      })
      .catch(function (err) {
        setTgStatus("Load thất bại: " + err.message, "fail");
      });
  }

  function renderTelegramGroups(groups, selectedChatId) {
    if (!dom.tgGroupsBody) return;
    groups = Array.isArray(groups) ? groups : [];
    var countEl = $("telegram-groups-count");
    if (countEl) countEl.textContent = groups.length + " groups";
    var totalSent = groups.reduce(function (sum, g) { return sum + Number(g.qr_sent || 0); }, 0);
    var totalPlus = groups.reduce(function (sum, g) { return sum + Number(g.plus_count || 0); }, 0);
    var totalRate = totalSent > 0 ? Math.round((totalPlus / totalSent) * 100) + "%" : "0%";
    var botConfigured = dom.tgBotToken && dom.tgBotToken.value.trim();
    var statBot = $("telegram-stat-bot");
    var statChat = $("telegram-stat-chat");
    var statSync = $("telegram-stat-sync");
    var metricGroups = $("telegram-metric-groups");
    var metricSent = $("telegram-metric-sent");
    var metricPlus = $("telegram-metric-plus");
    var metricRate = $("telegram-metric-rate");
    if (statBot) statBot.textContent = botConfigured ? "Connected" : "Disconnected";
    if (statChat) statChat.textContent = selectedChatId || "-";
    if (statSync) statSync.textContent = "Live";
    if (metricGroups) metricGroups.textContent = String(groups.length);
    if (metricSent) metricSent.textContent = String(totalSent);
    if (metricPlus) metricPlus.textContent = String(totalPlus);
    if (metricRate) metricRate.textContent = totalRate;
    if (!groups.length) {
      dom.tgGroupsBody.innerHTML = '<tr><td colspan="8"><div class="telegram-empty">Chua co group. Add bot vao group, gui /start@bot roi bam Sync groups.</div></td></tr>';
      return;
    }
    dom.tgGroupsBody.innerHTML = groups.map(function (g) {
      var sent = Number(g.qr_sent || 0);
      var plus = Number(g.plus_count || 0);
      var rateNum = sent > 0 ? Math.round((plus / sent) * 100) : 0;
      var rate = rateNum + "%";
      var checked = g.enabled === false ? "" : " checked";
      var isSelected = String(g.chat_id) === String(selectedChatId);
      var selected = isSelected ? '<span class="telegram-selected-badge">selected</span>' : "";
      var tokenLabel = g.bot_token ? "Private token" : "Global token";
      var searchText = [g.title || "", g.chat_id || "", g.type || ""].join(" ").toLowerCase();
      return '<tr data-chat-id="' + escHtml(g.chat_id) + '" data-search="' + escHtml(searchText) + '" class="telegram-group-card ' + (isSelected ? 'is-selected' : '') + '">' +
        '<td class="telegram-card-main"><div class="telegram-group-name"><span class="telegram-group-avatar">TG</span><div><strong>' + escHtml(g.title || g.chat_id) + '</strong><div class="telegram-group-type">' + escHtml(g.type || "group") + '</div></div>' + selected + '</div>' +
        '<div class="telegram-card-meta"><span class="telegram-badge ' + (checked ? 'telegram-badge-ok' : 'telegram-badge-off') + '">' + (checked ? "Enabled" : "Disabled") + '</span><code class="telegram-chat-id">' + escHtml(g.chat_id) + '</code></div></td>' +
        '<td class="telegram-card-token"><label><span>Bot Token</span><input class="telegram-row-token" data-tg-field="bot_token" type="password" value="' + escHtml(g.bot_token || "") + '" placeholder="' + tokenLabel + '" autocomplete="off" /></label></td>' +
        '<td class="telegram-card-toggle"><span>Enable</span><label class="telegram-mini-toggle"><input type="checkbox" data-tg-action="toggle"' + checked + ' /><span></span></label></td>' +
        '<td class="telegram-card-stats"><label><span>QR Sent</span><input class="telegram-stat-input" data-tg-field="qr_sent" type="number" min="0" step="1" value="' + sent + '" /></label>' +
        '<label><span>Len Plus</span><input class="telegram-stat-input telegram-stat-input-plus" data-tg-field="plus_count" type="number" min="0" step="1" value="' + plus + '" /></label></td>' +
        '<td class="telegram-card-rate"><div><span>Success Rate</span><strong class="telegram-rate">' + rate + '</strong></div><div class="telegram-progress" aria-label="' + rate + '"><span style="width:' + Math.min(100, Math.max(0, rateNum)) + '%"></span></div></td>' +
        '<td class="telegram-row-actions"><button class="btn btn-ghost btn-small" data-tg-action="select" type="button">Chon</button>' +
        '<button class="btn btn-primary btn-small" data-tg-action="save" type="button">Luu</button>' +
        '<button class="btn btn-ghost btn-small" data-tg-action="test" type="button">Test</button>' +
        '<button class="btn btn-ghost btn-small" data-tg-action="stats" type="button">Thong ke</button>' +
        '<button class="btn btn-danger btn-small" data-tg-action="reset" type="button">Dat lai</button></td>' +
      '</tr>';
    }).join("");
    applyTelegramGroupFilter();
  }

  function applyTelegramGroupFilter() {
    if (!dom.tgGroupSearch || !dom.tgGroupsBody) return;
    var q = dom.tgGroupSearch.value.trim().toLowerCase();
    Array.prototype.forEach.call(dom.tgGroupsBody.querySelectorAll("tr[data-chat-id]"), function (row) {
      row.hidden = !!q && row.dataset.search.indexOf(q) === -1;
    });
  }

  function refreshTelegramGroups() {
    if (dom.tgGroupsBody && dom.tgGroupsBody.contains(document.activeElement)) {
      return Promise.resolve();
    }
    return api("/api/telegram/config").then(function (data) {
      renderTelegramGroups(data.groups || [], data.chat_id || "");
      return data;
    });
  }

  function startTelegramAutoRefresh() {
    if (tgRefreshTimer) return;
    tgRefreshTimer = window.setInterval(function () {
      if (!tgState.loaded || tgState.busy) return;
      refreshTelegramGroups().catch(function () {});
    }, 5000);
  }

  function saveTelegram() {
    if (tgState.busy) return;
    tgState.busy = true;
    dom.tgSave.disabled = true;
    setTgStatus("Đang lưu…", null);
    api("/api/telegram/config", {
      method: "POST",
      body: JSON.stringify({
        bot_token: dom.tgBotToken.value.trim(),
        chat_id: dom.tgChatId.value.trim(),
      }),
    })
      .then(function (data) {
        setTgBadge(!!data.configured);
        var extra = data.persist_error ? " (cảnh báo: " + data.persist_error + ")" : "";
        setTgStatus("Đã lưu." + extra, data.persist_error ? "fail" : "ok");
      })
      .catch(function (err) {
        setTgStatus("Lưu thất bại: " + err.message, "fail");
      })
      .finally(function () {
        tgState.busy = false;
        dom.tgSave.disabled = false;
      });
  }

  function testTelegram() {
    if (tgState.busy) return;
    tgState.busy = true;
    dom.tgTest.disabled = true;
    setTgStatus("Đang gửi test…", null);
    // Lưu trước rồi test để dùng giá trị mới nhất.
    api("/api/telegram/config", {
      method: "POST",
      body: JSON.stringify({
        bot_token: dom.tgBotToken.value.trim(),
        chat_id: dom.tgChatId.value.trim(),
      }),
    })
      .then(function () { return api("/api/telegram/test", { method: "POST" }); })
      .then(function () { setTgStatus("Đã gửi tin test — kiểm tra Telegram.", "ok"); })
      .catch(function (err) { setTgStatus("Test thất bại: " + err.message, "fail"); })
      .finally(function () {
        tgState.busy = false;
        dom.tgTest.disabled = false;
      });
  }

  // ── Paste modal ──────────────────────────────────────────────────────────
  function openPaste() {
    dom.pasteTextarea.value = "";
    dom.pasteModal.style.display = "flex";
    dom.pasteTextarea.focus();
  }
  function closePaste() {
    dom.pasteModal.style.display = "none";
  }
  function applyPaste() {
    var lines = dom.pasteTextarea.value.split("\n");
    syncRowsFromDom();
    var existing = {};
    state.rows.forEach(function (r) {
      var v = r.value.trim();
      if (v) existing[v] = 1;
    });
    // Bỏ row rỗng cuối nếu đang trống
    state.rows = state.rows.filter(function (r) { return r.value.trim(); });
    var added = 0;
    lines.forEach(function (line) {
      var v = line.trim();
      if (v && !existing[v]) {
        existing[v] = 1;
        state.rows.push(makeRow(v));
        added++;
      }
    });
    if (state.rows.length === 0) state.rows.push(makeRow(""));
    state.lastResults = null;
    renderRows();
    closePaste();
    setStatus("Đã thêm " + added + " proxy. Nhớ bấm Lưu.", null);
  }

  // ── Event wiring ───────────────────────────────────────────────────────
  function bindEvents() {
    dom.navItems.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateSection(btn.dataset.settingsSection);
      });
    });

    dom.btnAdd.addEventListener("click", function () {
      syncRowsFromDom();
      state.rows.push(makeRow(""));
      renderRows();
      // Focus input vừa thêm
      var inputs = dom.rowsHost.querySelectorAll(".proxy-pool-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    dom.btnPaste.addEventListener("click", openPaste);
    if (dom.btnClearDead) dom.btnClearDead.addEventListener("click", clearDeadProxies);
    if (dom.btnClearAll) dom.btnClearAll.addEventListener("click", clearAllProxies);
    dom.btnTestAll.addEventListener("click", testAll);
    dom.btnSave.addEventListener("click", save);

    if (dom.tgSave) dom.tgSave.addEventListener("click", saveTelegram);
    if (dom.tgTest) dom.tgTest.addEventListener("click", testTelegram);
    if (dom.tgSyncGroups) dom.tgSyncGroups.addEventListener("click", function () {
      setTgStatus("Dang dong bo group...", null);
      api("/api/telegram/groups/sync", { method: "POST" })
        .then(function (data) {
          renderTelegramGroups(data.groups || [], (data.selected_group && data.selected_group.chat_id) || dom.tgChatId.value.trim());
          setTgStatus("Da dong bo group.", "ok");
        })
        .catch(function (err) { setTgStatus("Dong bo group that bai: " + err.message, "fail"); });
    });
    if (dom.tgResetGroups) dom.tgResetGroups.addEventListener("click", function () {
      refreshTelegramGroups()
        .then(function (data) {
          renderTelegramGroups(data.groups || [], data.chat_id || dom.tgChatId.value.trim());
          setTgStatus("Da cap nhat so lieu group.", "ok");
        })
        .catch(function (err) { setTgStatus("Cap nhat that bai: " + err.message, "fail"); });
    });
    if (dom.tgResetAllInline) dom.tgResetAllInline.addEventListener("click", function () {
      refreshTelegramGroups()
        .then(function (data) {
          renderTelegramGroups(data.groups || [], data.chat_id || dom.tgChatId.value.trim());
          setTgStatus("Da cap nhat so lieu group.", "ok");
        })
        .catch(function (err) { setTgStatus("Cap nhat that bai: " + err.message, "fail"); });
    });
    if (dom.tgAddGroup) dom.tgAddGroup.addEventListener("click", function () {
      var chatId = (dom.tgAddChatId && dom.tgAddChatId.value || "").trim();
      var title = (dom.tgAddTitle && dom.tgAddTitle.value || "").trim();
      var botToken = (dom.tgAddBotToken && dom.tgAddBotToken.value || "").trim();
      if (!chatId) {
        setTgStatus("Nhap Chat ID group truoc.", "fail");
        return;
      }
      dom.tgAddGroup.disabled = true;
      api("/api/telegram/groups", {
        method: "POST",
        body: JSON.stringify({ chat_id: chatId, title: title || chatId, type: "group", bot_token: botToken }),
      })
        .then(function (data) {
          renderTelegramGroups(data.groups || [], dom.tgChatId.value.trim());
          if (dom.tgAddChatId) dom.tgAddChatId.value = "";
          if (dom.tgAddTitle) dom.tgAddTitle.value = "";
          if (dom.tgAddBotToken) dom.tgAddBotToken.value = "";
          setTgStatus("Da them group.", "ok");
        })
        .catch(function (err) { setTgStatus("Them group that bai: " + err.message, "fail"); })
        .finally(function () { dom.tgAddGroup.disabled = false; });
    });
    if (dom.tgGroupSearch) dom.tgGroupSearch.addEventListener("input", applyTelegramGroupFilter);
    if (dom.tgGroupsBody) dom.tgGroupsBody.addEventListener("click", function (e) {
      var el = e.target.closest("[data-tg-action]");
      if (!el) return;
      var row = el.closest("tr[data-chat-id]");
      if (!row) return;
      var chatId = row.dataset.chatId;
      var action = el.dataset.tgAction;
      if (action === "select") {
        dom.tgChatId.value = chatId;
        saveTelegram();
      } else if (action === "save") {
        var tokenInput = row.querySelector('[data-tg-field="bot_token"]');
        var sentInput = row.querySelector('[data-tg-field="qr_sent"]');
        var plusInput = row.querySelector('[data-tg-field="plus_count"]');
        el.disabled = true;
        api("/api/telegram/groups/" + encodeURIComponent(chatId), {
          method: "POST",
          body: JSON.stringify({
            bot_token: tokenInput ? tokenInput.value.trim() : "",
            qr_sent: sentInput ? Math.max(0, parseInt(sentInput.value || "0", 10) || 0) : undefined,
            plus_count: plusInput ? Math.max(0, parseInt(plusInput.value || "0", 10) || 0) : undefined,
          }),
        })
          .then(function (data) {
            renderTelegramGroups(data.groups || [], dom.tgChatId.value.trim());
            setTgStatus("Da luu group.", "ok");
          })
          .catch(function (err) { setTgStatus("Luu group that bai: " + err.message, "fail"); })
          .finally(function () { el.disabled = false; });
      } else if (action === "test") {
        var testTokenInput = row.querySelector('[data-tg-field="bot_token"]');
        api("/api/telegram/groups/" + encodeURIComponent(chatId), {
          method: "POST",
          body: JSON.stringify({ bot_token: testTokenInput ? testTokenInput.value.trim() : "" }),
        })
          .then(function () {
            return api("/api/telegram/groups/" + encodeURIComponent(chatId) + "/test", { method: "POST" });
          })
          .then(function () { setTgStatus("Da gui tin test group.", "ok"); })
          .catch(function (err) { setTgStatus("Test group that bai: " + err.message, "fail"); });
      } else if (action === "stats") {
        api("/api/telegram/groups/stats", {
          method: "POST",
          body: JSON.stringify({ chat_id: chatId }),
        })
          .then(function () { setTgStatus("Da gui thong ke ve group.", "ok"); })
          .catch(function (err) { setTgStatus("Gui thong ke that bai: " + err.message, "fail"); });
      } else if (action === "reset") {
        api("/api/telegram/groups/reset", {
          method: "POST",
          body: JSON.stringify({ chat_id: chatId }),
        })
          .then(function (data) {
            renderTelegramGroups(data.groups || [], dom.tgChatId.value.trim());
            setTgStatus("Da dat lai thong ke group.", "ok");
          })
          .catch(function (err) { setTgStatus("Reset group that bai: " + err.message, "fail"); });
      }
    });
    if (dom.tgGroupsBody) dom.tgGroupsBody.addEventListener("change", function (e) {
      var el = e.target;
      if (el.dataset.tgAction !== "toggle") return;
      var row = el.closest("tr[data-chat-id]");
      if (!row) return;
      api("/api/telegram/groups/" + encodeURIComponent(row.dataset.chatId), {
        method: "POST",
        body: JSON.stringify({ enabled: !!el.checked }),
      })
        .then(function (data) { renderTelegramGroups(data.groups || [], dom.tgChatId.value.trim()); })
        .catch(function (err) {
          el.checked = !el.checked;
          setTgStatus("Luu group that bai: " + err.message, "fail");
        });
    });
    if (dom.loginFlow) dom.loginFlow.addEventListener("change", saveLoginFlow);

    dom.modeSelect.addEventListener("change", function () {
      state.mode = dom.modeSelect.value;
      updateSummary();
    });

    // Delegation: remove row + input edit invalidate test result
    dom.rowsHost.addEventListener("click", function (e) {
      var btn = e.target.closest(".proxy-pool-remove");
      if (!btn) return;
      syncRowsFromDom();
      state.rows = state.rows.filter(function (r) { return r.id !== btn.dataset.rowId; });
      if (state.rows.length === 0) state.rows.push(makeRow(""));
      renderRows();
    });

    dom.rowsHost.addEventListener("input", function (e) {
      var inp = e.target.closest(".proxy-pool-input");
      if (!inp) return;
      var row = state.rows.find(function (r) { return r.id === inp.dataset.rowId; });
      if (row) row.value = inp.value;
    });

    // Paste modal
    dom.pasteClose.addEventListener("click", closePaste);
    dom.pasteCancel.addEventListener("click", closePaste);
    dom.pasteApply.addEventListener("click", applyPaste);
    dom.pasteModal.addEventListener("click", function (e) {
      if (e.target === dom.pasteModal) closePaste();
    });
  }

  // ── Lazy-load khi mở tab Settings lần đầu ────────────────────────────────
  function init() {
    cacheDom();
    if (!dom.section) return; // tab không tồn tại
    bindEvents();
    activateSection("proxies");

    document.addEventListener("gpt:tab", function (e) {
      if (e.detail && e.detail.tab === "settings" && !state.loaded) {
        load();
      }
      if (e.detail && e.detail.tab === "settings" && !tgState.loaded) {
        loadTelegram();
      }
    });

    // Nếu tab settings đã active sẵn lúc reload (ui.active_tab persisted)
    if (document.getElementById("tab-settings").classList.contains("active") && !state.loaded) {
      load();
      loadTelegram();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
