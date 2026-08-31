// InstaFollowCheck — tool page logic (API on Render + Supabase JWT)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var openBtn = $('openBtn'), analyzeBtn = $('analyzeBtn'), logoutBtn = $('logoutBtn');
  var statusEl = $('status'), toolNote = $('toolNote');
  var logEl = $('log'), logList = $('logList');
  var resultsEl = $('results'), rowsEl = $('rows'), emptyEl = $('empty'), filterEl = $('filter');
  var copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
  var browserPanel = $('browserPanel'), browserView = $('browserView'), browserOverlay = $('browserOverlay'), browserHint = $('browserHint');
  var progressWrap = $('progressWrap'), progressFill = $('progressFill'), progressLabel = $('progressLabel');
  var VIEW_W = 1100, VIEW_H = 760;
  var API = (window.IFCAuth && IFCAuth.apiBase) || '';
  var data = { summary: {}, notFollowingBack: [] };
  var ws = null, wasLoggedIn = null, progressPhase = null, progressFallback = 0;
  var PHASES = { followers: { start: 10, span: 40 }, following: { start: 55, span: 40 } };

  function setStatus(text, ok) { statusEl.textContent = text; statusEl.classList.toggle('ok', !!ok); if (toolNote) toolNote.textContent = 'Status: ' + text; }
  function setProgress(pct) {
    if (!progressWrap) return;
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    progressWrap.hidden = false; progressFill.style.width = pct + '%'; progressLabel.textContent = pct + '%';
  }
  function addLog(text, cls) {
    var li = document.createElement('li'); li.textContent = text;
    if (cls) li.className = cls;
    logList.appendChild(li); logEl.hidden = false; logEl.scrollTop = logEl.scrollHeight;
  }
  function resetPrevious() {
    data = { summary: {}, notFollowingBack: [] };
    if (rowsEl) rowsEl.innerHTML = ''; if (logList) logList.innerHTML = '';
    if (logEl) logEl.hidden = true; if (resultsEl) resultsEl.hidden = true; if (emptyEl) emptyEl.hidden = true;
    ['statFollowers', 'statFollowing', 'statDiff'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = '–'; });
    progressPhase = null; progressFallback = 0;
  }
  function applyPhase(p, total, count) {
    var ph = PHASES[p] || { start: 0, span: 95 };
    if (total) setProgress(ph.start + ph.span * Math.min(count / total, 1));
    else {
      if (progressPhase !== p) { progressPhase = p; progressFallback = ph.start; }
      progressFallback = Math.min(progressFallback + ph.span * 0.04, ph.start + ph.span);
      setProgress(progressFallback);
    }
  }
  function apiFetch(pth, opts) {
    opts = opts || {};
    return IFCAuth.token().then(function (token) {
      var h = Object.assign({}, opts.headers || {});
      if (token) h.Authorization = 'Bearer ' + token;
      if (opts.body) h['Content-Type'] = 'application/json';
      return fetch(API + pth, Object.assign({}, opts, { headers: h }));
    });
  }
  function sendWS(m) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }
  function connectWS() {
    if (!API || ws) return;
    return IFCAuth.token().then(function (token) {
      if (!token) return;
      var wsUrl = API.replace(/^https?:\/\//, 'ws://');
      if (location.protocol === 'https:') wsUrl = API.replace(/^https:\/\//, 'wss://');
      ws = new WebSocket(wsUrl + '/ws?token=' + encodeURIComponent(token));
      ws.onopen = function () { if (browserPanel && !browserPanel.hidden) sendWS({ t: 'start' }); };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'frame' && m.img) { browserView.src = 'data:image/jpeg;base64,' + m.img; browserHint.hidden = true; }
      };
      ws.onclose = function () { ws = null; setTimeout(connectWS, 2000); };
    });
  }
  function showOverlay(t) { browserOverlay.textContent = t; browserOverlay.hidden = false; }
  function hideOverlay() { browserOverlay.hidden = true; }
  function openPanel() {
    browserPanel.hidden = false; browserHint.textContent = 'Loading browser…'; browserHint.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      browserPanel.classList.add('is-open'); browserPanel.style.maxHeight = browserPanel.scrollHeight + 'px';
    }); });
  }
  function closePanel() {
    if (!browserPanel || browserPanel.hidden) return;
    browserPanel.classList.remove('is-open'); browserPanel.style.maxHeight = '0px';
    window.setTimeout(function () { browserPanel.hidden = true; }, 700);
  }
  var toPos = function (e) { var r = browserView.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VIEW_W, y: (e.clientY - r.top) / r.height * VIEW_H }; };
  var inp = function (e) { sendWS({ t: 'input', e: e }); };
  if (browserView) {
    browserView.addEventListener('mousemove', function (e) { inp({ type: 'mousemove', pos: toPos(e) }); });
    browserView.addEventListener('mousedown', function (e) { inp({ type: 'mousedown', pos: toPos(e) }); });
    browserView.addEventListener('mouseup', function (e) { inp({ type: 'mouseup', pos: toPos(e) }); });
    browserView.addEventListener('wheel', function (e) { e.preventDefault(); var p = toPos(e); inp({ type: 'wheel', pos: p, deltaX: e.deltaX, deltaY: e.deltaY }); }, { passive: false });
    browserView.addEventListener('keydown', function (e) { e.preventDefault(); inp({ type: 'keydown', key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey }); });
    browserView.addEventListener('keyup', function (e) { inp({ type: 'keyup', key: e.key, code: e.code }); });
  }
  openBtn.addEventListener('click', function () {
    openBtn.disabled = true; if (browserView) browserView.src = ''; openPanel(); addLog('Opening the embedded browser…');
    apiFetch('/api/open', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || 'open failed'); sendWS({ t: 'start' }); })
      .catch(function (er) { addLog('Error opening browser: ' + er.message, 'is-err'); if (browserHint) { browserHint.textContent = 'Could not open the browser.'; } })
      .finally(function () { openBtn.disabled = false; });
  });
  logoutBtn.addEventListener('click', function () {
    logoutBtn.disabled = true; addLog('Logging out…');
    apiFetch('/api/logout', { method: 'POST' }).then(function () { setStatus('logged out'); if (browserView) browserView.src = ''; })
      .catch(function (er) { addLog('Error logging out: ' + er.message, 'is-err'); }).finally(function () { logoutBtn.disabled = false; refresh(); });
  });
  analyzeBtn.addEventListener('click', function () {
    analyzeBtn.disabled = true; if (browserPanel && !browserPanel.hidden) showOverlay('Analyzing in background…');
    resetPrevious(); setProgress(0); addLog('Starting analysis…');
    apiFetch('/api/analyze', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok && j.error) addLog('Error: ' + j.error, 'is-err'); })
      .catch(function (er) { addLog('Network error: ' + er.message, 'is-err'); hideOverlay(); });
  });
  function refresh() {
    apiFetch('/api/status').then(function (r) { if (!r.ok) { setStatus('unauthorized'); return null; } return r.json(); }).then(function (s) {
      if (!s) return;
      openBtn.hidden = !!s.loggedIn; analyzeBtn.hidden = !s.loggedIn; logoutBtn.hidden = !s.loggedIn;
      analyzeBtn.disabled = s.busy || !s.loggedIn; analyzeBtn.textContent = s.busy ? 'Analyzing…' : 'Analyze account';
      logoutBtn.disabled = s.busy || !s.loggedIn;
      if (s.loggedIn && !wasLoggedIn) { sendWS({ t: 'stop' }); closePanel(); if (browserView) browserView.src = ''; addLog('Logged in as @' + s.username + ' — closed the browser panel.'); }
      wasLoggedIn = s.loggedIn;
      if (s.busy) setStatus('busy – analyzing'); else if (s.loggedIn) setStatus('logged in as @' + s.username, true); else if (s.connected) setStatus('browser open, login required'); else setStatus('not connected');
    }).catch(function () { setStatus('server unreachable'); });
  }
  function fmt(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : String(n); }
  function render() {
    var list = data.notFollowingBack || [], s = data.summary || {};
    $('statFollowers').textContent = s.followersCount != null ? fmt(s.followersCount) : '–';
    $('statFollowing').textContent = s.followingCount != null ? fmt(s.followingCount) : '–';
    $('statDiff').textContent = s.notFollowingBackCount != null ? fmt(s.notFollowingBackCount) : list.length;
    resultsEl.hidden = false; rowsEl.innerHTML = '';
    list.forEach(function (u, i) {
      var tr = document.createElement('tr'); tr.dataset.username = u;
      var td1 = document.createElement('td'); td1.innerHTML = '<span class="num">' + (i + 1) + '</span>';
      var td2 = document.createElement('td'); var a = document.createElement('a'); a.href = 'https://www.instagram.com/' + u + '/'; a.target = '_blank'; a.textContent = u; td2.appendChild(a);
      var td3 = document.createElement('td'); var l = document.createElement('a'); l.href = a.href; l.target = '_blank'; l.textContent = 'open ↗'; td3.appendChild(l);
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); rowsEl.appendChild(tr);
    });
    emptyEl.hidden = list.length > 0; applyFilter();
  }
  function applyFilter() {
    var q = filterEl.value.trim().toLowerCase();
    Array.prototype.forEach.call(rowsEl.querySelectorAll('tr'), function (tr) {
      tr.style.display = !q || (tr.dataset.username).toLowerCase().indexOf(q) >= 0 ? '' : 'none';
    });
  }
  filterEl.addEventListener('input', applyFilter);
  copyBtn.addEventListener('click', function () {
    var names = Array.prototype.map.call(rowsEl.querySelectorAll('tr'), function (tr) { return tr.dataset.username; });
    if (!names.length) return;
    navigator.clipboard.writeText(names.join('\n')); copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.textContent = 'Copy list'; }, 1500);
  });
  downloadBtn.addEventListener('click', function () {
    var names = data.notFollowingBack || [];
    var blob = new Blob(['username\n' + names.map(function (n) { return '"' + n + '"'; }).join('\n')], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'not_following_back.csv'; a.click();
  });
  IFCAuth.token().then(function (token) {
    if (!token) { setStatus('unauthorized — log in first'); return; }
    var es = new EventSource(API + '/api/events?token=' + encodeURIComponent(token));
    es.onmessage = function (e) {
      var ev; try { ev = JSON.parse(e.data); } catch (x) { return; }
      if (ev.type === 'step') { addLog(ev.message); var m = ev.message || ''; if (/account detected/i.test(m)) setProgress(4); else if (/opening the followers/i.test(m)) setProgress(8); else if (/followers collected/i.test(m)) setProgress(52); else if (/opening the following/i.test(m)) setProgress(55); else if (/following collected/i.test(m)) setProgress(96); }
      if (ev.type === 'progress') { addLog('Collected ' + ev.count + ' names...'); applyPhase(ev.phase, ev.total, ev.count); }
      if (ev.type === 'error') addLog('Error: ' + ev.message, 'is-err');
      if (ev.type === 'done') { addLog('Analysis complete.', 'is-ok'); data = { summary: ev.summary || {}, notFollowingBack: ev.notFollowingBack || [] }; render(); setProgress(100); hideOverlay(); if (browserPanel && !browserPanel.hidden) sendWS({ t: 'start' }); }
    };
    connectWS(); setInterval(refresh, 2000); refresh();
  });
})();