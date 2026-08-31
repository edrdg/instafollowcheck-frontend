// InstaFollowCheck — wrapper Supabase per il frontend statico
(function () {
  var cfg = window.IFC_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { console.error('IFC_CONFIG mancante'); return; }
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var ls = [];
  sb.auth.onAuthStateChange(function () { for (var i = 0; i < ls.length; i++) ls[i](); });
  window.IFCAuth = {
    sb: sb,
    apiBase: (cfg.API_BASE || '').replace(/\/$/, ''),
    session: function () { return sb.auth.getSession().then(function (d) { return d.data.session || null; }); },
    token: function () { return this.session().then(function (s) { return s ? s.access_token : null; }); },
    user: function () { return this.session().then(function (s) { return s ? s.user : null; }); },
    onAuth: function (f) { ls.push(f); }
  };
})();