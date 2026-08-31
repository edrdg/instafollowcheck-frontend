// InstaFollowCheck — shared front-end: chrome + auth (Supabase) + guard
(function () {
  'use strict';
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var o = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    });
  }
  document.querySelectorAll('.marquee-inner').forEach(function (m) {
    if (m.dataset.duplicated === 'true') return;
    m.dataset.duplicated = 'true';
    m.innerHTML += m.innerHTML;
  });
  var rv = document.querySelectorAll('.reveal');
  if (rv.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
      }, { threshold: 0.15 });
      rv.forEach(function (el) { io.observe(el); });
    } else { rv.forEach(function (el) { el.classList.add('in-view'); }); }
  }
  var bn = document.querySelector('.hero-bignum');
  if (bn) {
    var tk = false;
    window.addEventListener('scroll', function () {
      if (tk) return; tk = true;
      requestAnimationFrame(function () { bn.style.transform = 'translateY(' + (window.scrollY || 0) * 0.25 + 'px)'; tk = false; });
    }, { passive: true });
  }

  if (window.IFCAuth) {
    function clean(p) {
      var s = (p || '/').replace(/\.[^/.]+$/, '');
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s;
    }
    var path = clean(location.pathname);

    function renderAuth() {
      return IFCAuth.user().then(function (user) {
        var cta = document.querySelector('.header-cta');
        if (cta) {
          if (user) {
            cta.textContent = 'Log out';
            cta.href = '#';
            cta.onclick = function (e) { e.preventDefault(); IFCAuth.sb.auth.signOut().then(function () { location.replace('/'); }); };
          } else {
            cta.textContent = 'Log in →';
            cta.href = '/login';
            cta.onclick = null;
          }
        }
        return !!user;
      });
    }

    renderAuth().then(function (logged) {
      var tool = path === '/strumento';
      var authp = path === '/login' || path === '/signup';
      if (tool && !logged) { location.replace('/login'); return; }
      if (authp && logged) { location.replace('/strumento'); }
    });

    var af = document.getElementById('authForm');
    if (af) {
      var err = document.getElementById('authError');
      var btn = af.querySelector('button[type="submit"]');
      af.addEventListener('submit', function (e) {
        e.preventDefault();
        if (err) err.hidden = true;
        btn.disabled = true;
        var mode = af.dataset.mode || 'login';
        var email = (af.email.value || '').trim();
        var pass = af.password.value || '';
        var reload = function () { location.replace(new URLSearchParams(location.search).get('next') || '/strumento'); };
        if (mode === 'signup') {
          IFCAuth.sb.auth.signUp({ email: email, password: pass })
            .then(function (r) { if (r.error) throw r.error; return IFCAuth.sb.auth.getSession(); })
            .then(function (sd) {
              if (sd.data && sd.data.session) { reload(); }
              else {
                if (err) { err.textContent = 'Account creato. Controlla la tua email per confermare e poi accedi.'; err.style.color = 'var(--accent)'; err.hidden = false; }
                btn.disabled = false;
              }
            })
            .catch(function (er) { if (err) { err.textContent = (er && er.message) || 'Errore'; err.hidden = false; } btn.disabled = false; });
        } else {
          IFCAuth.sb.auth.signInWithPassword({ email: email, password: pass })
            .then(function (r) { if (r.error) throw r.error; reload(); })
            .catch(function (er) { if (err) { err.textContent = (er && er.message) || 'Errore'; err.hidden = false; } btn.disabled = false; });
        }
      });
    }
  }
})();