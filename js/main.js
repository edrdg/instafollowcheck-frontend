// InstaFollowCheck — shared front-end: chrome + auth (Supabase) + guard pages.
(function () {
  'use strict';

  /* ---- Mobile nav ---- */
  const toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        document.body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Marquee: duplicate inner for seamless -50% loop ---- */
  document.querySelectorAll('.marquee-inner').forEach((inner) => {
    if (inner.dataset.duplicated === 'true') return;
    inner.dataset.duplicated = 'true';
    inner.innerHTML += inner.innerHTML;
  });

  /* ---- Reveal on scroll ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
        }),
        { threshold: 0.15 }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('in-view'));
    }
  }

  /* ---- Parallax for big hero numerals ---- */
  const bignum = document.querySelector('.hero-bignum');
  if (bignum) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        bignum.style.transform = `translateY(${(window.scrollY || 0) * 0.25}px)`;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---- Auth (Supabase): header + guard + forms ---- */
  if (window.IFCAuth) {
    function cleanPath(p) {
      let s = (p || '/').replace(/\.[^/.]+$/, ''); // rimuove estensione .html
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s;
    }
    async function renderAuth() {
      const user = await IFCAuth.user();
      const cta = document.querySelector('.header-cta');
      if (cta) {
        if (user) {
          cta.textContent = 'Log out';
          cta.href = '#';
          cta.onclick = async (e) => {
            e.preventDefault();
            await IFCAuth.sb.auth.signOut();
            location.replace('/');
          };
          const note = cta.nextElementSibling && cta.nextElementSibling.tagName === 'SPAN'
            ? cta.nextElementSibling : null;
          if (note) note.textContent = `@${user.email}`;
        } else {
          cta.textContent = 'Log in →';
          cta.href = '/login';
          cta.onclick = null;
        }
      }
      return !!user;
    }

    const path = cleanPath(location.pathname);

    (async () => {
      const logged = await renderAuth();
      const isTool = path === '/strumento';
      const isAuthPage = path === '/login' || path === '/signup';

      if (isTool && !logged) {
        location.replace('/login');
        return;
      }
      if (isAuthPage && logged) {
        const next = new URLSearchParams(location.search).get('next') || '/strumento';
        location.replace(next);
        return;
      }
    })();

    const authForm = document.getElementById('authForm');
    if (authForm) {
      const errEl = document.getElementById('authError');
      const btn = authForm.querySelector('button[type="submit"]');
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errEl) errEl.hidden = true;
        btn.disabled = true;
        const mode = authForm.dataset.mode || 'login';
        const email = (authForm.email.value || '').trim();
        const password = authForm.password.value || '';
        try {
          let error = null;
          if (mode === 'signup') {
            const redirectTo = (IFCAuth.origin || window.location.origin) + '/login';
            const { error: er } = await IFCAuth.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
            error = er;
            if (error) throw error;
            // Se serve conferma email, mostra avviso; altrimenti redirect.
            const { data } = await IFCAuth.sb.auth.getSession();
            if (!data.session) {
              if (errEl) { errEl.textContent = 'Account creato. Controlla la tua email per confermare e poi accedi.'; errEl.hidden = false; errEl.style.color = 'var(--accent)'; }
              btn.disabled = false;
              return;
            }
          } else {
            const { error: er } = await IFCAuth.sb.auth.signInWithPassword({ email, password });
            error = er;
            if (error) throw error;
          }
          const next = new URLSearchParams(location.search).get('next') || '/strumento';
          location.replace(next);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Something went wrong.';
            errEl.hidden = false;
          }
          btn.disabled = false;
        }
      });
    }
  }
})();