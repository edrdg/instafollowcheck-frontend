// InstaFollowCheck — tool page logic for the online (static) frontend.
// Parla col backend su Render (API base da IFC_CONFIG), autenticandosi col JWT
// di Supabase; progress in SSE, browser embed in WebSocket.
(function () {
  const $ = (id) => document.getElementById(id);
  const openBtn = $('openBtn');
  const analyzeBtn = $('analyzeBtn');
  const logoutBtn = $('logoutBtn');
  const statusEl = $('status');
  const toolNote = $('toolNote');
  const logEl = $('log');
  const logList = $('logList');
  const resultsEl = $('results');
  const rowsEl = $('rows');
  const emptyEl = $('empty');
  const filterEl = $('filter');
  const copyBtn = $('copyBtn');
  const downloadBtn = $('downloadBtn');
  const browserPanel = $('browserPanel');
  const browserView = $('browserView');
  const browserOverlay = $('browserOverlay');
  const browserHint = $('browserHint');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressLabel = $('progressLabel');

  const VIEW_W = 1100;
  const VIEW_H = 760;
  const API = (window.IFCAuth && IFCAuth.apiBase) || '';

  let data = { summary: {}, notFollowingBack: [] };
  let ws = null;
  let es = null;
  let progressPhase = null;
  let progressFallback = 0;
  let wasLoggedIn = null;

  const PHASES = { followers: { start: 10, span: 40 }, following: { start: 55, span: 40 } };

  function setStatus(text, ok = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('ok', ok);
    if (toolNote) toolNote.textContent = 'Status: ' + text;
  }
  function setProgress(pct) {
    if (!progressWrap) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    progressWrap.hidden = false;
    progressFill.style.width = p + '%';
    progressLabel.textContent = p + '%';
    const bar = progressWrap.querySelector('[role="progressbar"]');
    if (bar) bar.setAttribute('aria-valuenow', p);
  }
  function addLog(text, cls = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.classList.add(cls);
    logList.appendChild(li);
    logEl.hidden = false;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function resetPreviousAnalysis() {
    data = { summary: {}, notFollowingBack: [] };
    if (rowsEl) rowsEl.innerHTML = '';
    if (logList) logList.innerHTML = '';
    if (logEl) logEl.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;
    ['statFollowers', 'statFollowing', 'statDiff'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '–'; });
    progressPhase = null;
    progressFallback = 0;
  }
  function applyPhaseProgress(phase, total, count) {
    const ph = PHASES[phase] || { start: 0, span: 95 };
    if (total) {
      setProgress(ph.start + ph.span * Math.min(count / total, 1));
    } else {
      if (progressPhase !== phase) { progressPhase = phase; progressFallback = ph.start; }
      progressFallback = Math.min(progressFallback + ph.span * 0.04, ph.start + ph.span);
      setProgress(progressFallback);
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    const token = await IFCAuth.token();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, Object.assign({}, options, { headers }));
    return res;
  }

  // ---- Embedded browser (WebSocket) ----
  async function connectWS() {
    if (!API || ws) return;
    const token = await IFCAuth.token();
    if (!token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${API.replace(/^https?:\/\//, '')}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => { if (browserPanel && !browserPanel.hidden) sendWS({ t: 'start' }); };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 'frame' && m.img) { browserView.src = 'data:image/jpeg;base64,' + m.img; browserHint.hidden = true; }
    };
    ws.onclose = () => { ws = null; setTimeout(connectWS, 2000); };
  }
  function sendWS(m) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

  function resumeStream() { sendWS({ t: 'start' }); }
  function showHint(text) { browserHint.textContent = text; browserHint.hidden = false; }
  function showOverlay(text) { browserOverlay.textContent = text; browserOverlay.hidden = false; }
  function hideOverlay() { browserOverlay.hidden = true; }

  function openPanel() {
    if (!browserPanel) return;
    browserPanel.hidden = false;
    showHint('Loading browser…');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      browserPanel.classList.add('is-open');
      browserPanel.style.maxHeight = browserPanel.scrollHeight + 'px';
    }));
  }
  function closePanel() {
    if (!browserPanel || !browserPanel.isConnected || browserPanel.hidden) return;
    browserPanel.classList.remove('is-open');
    browserPanel.style.maxHeight = '0px';
    const onEnd = () => { browserPanel.hidden = true; browserPanel.style.maxHeight = ''; browserPanel.removeEventListener('transitionend', onEnd); };
    browserPanel.addEventListener('transitionend', onEnd);
    window.setTimeout(() => { if (!browserPanel.hidden) { browserPanel.hidden = true; browserPanel.style.maxHeight = ''; } }, 700);
  }

  function pagePos(e) {
    const r = browserView.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  }
  function sendInput(e) { sendWS({ t: 'input', e }); }

  if (browserView && 'ontouchstart' in window) {
    browserView.addEventListener('click', (e) => { const p = pagePos(e); sendInput({ type: 'mousedown', pos: p }); sendInput({ type: 'mouseup', pos: p }); });
  } else {
    browserView.addEventListener('mousemove', (e) => sendInput({ type: 'mousemove', pos: pagePos(e) }));
    browserView.addEventListener('mousedown', (e) => sendInput({ type: 'mousedown', pos: pagePos(e) }));
    browserView.addEventListener('mouseup', (e) => sendInput({ type: 'mouseup', pos: pagePos(e) }));
    browserView.addEventListener('wheel', (e) => { e.preventDefault(); const p = pagePos(e); sendInput({ type: 'wheel', pos: p, deltaX: e.deltaX, deltaY: e.deltaY }); }, { passive: false });
  }
  browserView.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) return;
    sendInput({ type: 'keydown', key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
  });
  browserView.addEventListener('keyup', (e) => sendInput({ type: 'keyup', key: e.key, code: e.code }));

  // ---- Actions ----
  openBtn.addEventListener('click', async () => {
    openBtn.disabled = true;
    if (browserView) browserView.src = '';
    openPanel();
    addLog('Opening the embedded browser…');
    try {
      const r = await apiFetch('/api/open', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'open failed');
      resumeStream();
    } catch (err) {
      addLog(`Error opening browser: ${err.message}`, 'is-err');
      if (browserHint) { browserHint.textContent = 'Could not open the browser.'; browserHint.hidden = false; }
    } finally { openBtn.disabled = false; }
  });

  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    addLog('Logging out…');
    try {
      const r = await apiFetch('/api/logout', { method: 'POST' });
      if (!r.ok) throw new Error('logout failed');
      setStatus('logged out');
      if (browserView) browserView.src = '';
    } catch (err) { addLog(`Error logging out: ${err.message}`, 'is-err'); }
    logoutBtn.disabled = false;
    refresh();
  });

  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    if (browserPanel && !browserPanel.hidden) showOverlay('Analyzing in background…');
    resetPreviousAnalysis();
    setProgress(0);
    addLog('Starting analysis…');
    try {
      const r = await apiFetch('/api/analyze', { method: 'POST' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j.error) addLog(`Error: ${j.error}`, 'is-err');
      }
    } catch (err) { addLog(`Network error: ${err.message}`, 'is-err'); hideOverlay(); }
  });

  // ---- Status ----
  async function refresh() {
    try {
      const r = await apiFetch('/api/status');
      if (!r.ok) { setStatus('unauthorized'); return; }
      const s = await r.json();
      openBtn.hidden = !!s.loggedIn;
      analyzeBtn.hidden = !s.loggedIn;
      logoutBtn.hidden = !s.loggedIn;
      analyzeBtn.disabled = s.busy || !s.loggedIn;
      analyzeBtn.textContent = s.busy ? 'Analyzing…' : 'Analyze account';
      logoutBtn.disabled = s.busy || !s.loggedIn;

      if (s.loggedIn && !wasLoggedIn) {
        sendWS({ t: 'stop' });
        closePanel();
        if (browserView) browserView.src = '';
        addLog(`Logged in as @${s.username} — closed the browser panel.`);
      }
      wasLoggedIn = s.loggedIn;

      if (s.busy) setStatus('busy – analyzing');
      else if (s.loggedIn) setStatus(`logged in as @${s.username}`, true);
      else if (s.connected) setStatus('browser open, login required');
      else setStatus('not connected');
    } catch (_) { setStatus('server unreachable'); }
  }

  // ---- Rendering ----
  function fmt(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : String(n); }
  function render() {
    const list = data.notFollowingBack || [];
    const s = data.summary || {};
    $('statFollowers').textContent = s.followersCount != null ? fmt(s.followersCount) : '–';
    $('statFollowing').textContent = s.followingCount != null ? fmt(s.followingCount) : '–';
    $('statDiff').textContent = s.notFollowingBackCount != null ? fmt(s.notFollowingBackCount) : list.length;
    resultsEl.hidden = false;
    rowsEl.innerHTML = '';
    list.forEach((u, i) => {
      const tr = document.createElement('tr');
      tr.dataset.username = u;
      const td1 = document.createElement('td'); td1.innerHTML = `<span class="num">${i + 1}</span>`;
      const td2 = document.createElement('td');
      const a = document.createElement('a'); a.href = `https://www.instagram.com/${u}/`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = u;
      td2.appendChild(a);
      const td3 = document.createElement('td');
      const link = document.createElement('a'); link.href = a.href; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'open ↗';
      td3.appendChild(link);
      tr.append(td1, td2, td3);
      rowsEl.appendChild(tr);
    });
    emptyEl.hidden = list.length > 0;
    applyFilter();
  }
  function applyFilter() {
    const q = filterEl.value.trim().toLowerCase();
    Array.from(rowsEl.querySelectorAll('tr')).forEach((tr) => {
      const u = tr.dataset.username || '';
      tr.style.display = !q || u.toLowerCase().includes(q) ? '' : 'none';
    });
  }
  filterEl.addEventListener('input', applyFilter);
  copyBtn.addEventListener('click', async () => {
    const names = Array.from(rowsEl.querySelectorAll('tr')).map((tr) => tr.dataset.username);
    if (!names.length) return;
    await navigator.clipboard.writeText(names.join('\n'));
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy list'), 1500);
  });
  downloadBtn.addEventListener('click', () => {
    const names = data.notFollowingBack || [];
    const csv = 'username\n' + names.map((n) => `"${n}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'not_following_back.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Init (richiede il token Supabase) ----
  (async function init() {
    const token = await IFCAuth.token();
    if (!token) { setStatus('unauthorized — log in first'); return; }
    // SSE
    es = new EventSource(`${API}/api/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'step') {
        addLog(ev.message);
        const m = ev.message || '';
        if (/account detected/i.test(m)) setProgress(4);
        else if (/opening the followers/i.test(m)) setProgress(8);
        else if (/followers collected/i.test(m)) setProgress(52);
        else if (/opening the following/i.test(m)) setProgress(55);
        else if (/following collected/i.test(m)) setProgress(96);
      }
      if (ev.type === 'progress') { addLog(`Collected ${ev.count} names...`); applyPhaseProgress(ev.phase, ev.total, ev.count); }
      if (ev.type === 'error') addLog(`Error: ${ev.message}`, 'is-err');
      if (ev.type === 'done') {
        addLog('Analysis complete.', 'is-ok');
        data = { summary: ev.summary || {}, notFollowingBack: ev.notFollowingBack || [] };
        render();
        setProgress(100);
        hideOverlay();
        if (browserPanel && !browserPanel.hidden) resumeStream();
      }
    };
    connectWS();
    setInterval(refresh, 2000);
    refresh();
  })();
})();