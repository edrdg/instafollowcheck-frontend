// InstaFollowCheck — wrapper Supabase per il frontend statico.
// Espone il client, la sessione corrente, il token dell'utente e l'API base.
(function () {
  const cfg = window.IFC_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.error('IFC_CONFIG mancante (SUPABASE_URL/ANON_KEY)');
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const listeners = [];
  sb.auth.onAuthStateChange(() => listeners.forEach((f) => f()));

  window.IFCAuth = {
    sb,
    apiBase: (cfg.API_BASE || '').replace(/\/$/, ''),
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session || null;
    },
    async token() {
      const s = await this.session();
      return s ? s.access_token : null;
    },
    async user() {
      const s = await this.session();
      return s ? s.user : null;
    },
    onAuth(f) { listeners.push(f); },
    origin: (cfg.PUBLIC_ORIGIN || '').replace(/\/$/, ''),
  };
})();