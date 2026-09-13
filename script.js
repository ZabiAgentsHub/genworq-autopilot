/* =============================================================
   GENWORQ — script.js
   Vanilla JS. Dependencies (CDN, loaded before this file): GSAP core,
   GSAP ScrollTrigger, Lenis. Nothing else.

   ---------------------------------------------------------------
   FORENSIC STUDY — outputs (done before code was written)
   ---------------------------------------------------------------
   1. Recurring motion patterns from recent agency/portfolio SOTD work
      that this build reuses:
      a) Pinned "chapters": a section holds the viewport while media
         scrubs and type reveals in beats (Mission, Pillars, Command Room).
      b) Overlap transitions: the hero is sticky and gets covered by the
         next section; pinned sections release and the next slides in
         beneath. No hard cuts anywhere.
      c) Kinetic type: word-by-word assembly at display scale, italic
         serif accent words, count-ups, and a pointer-draggable rail with
         velocity skew.

   2. Scroll narrative / timeline (v2: one video, the hero)
      HERO      sticky. Load intro (eyebrow → H1 words → sub → CTAs →
                stat row count-up → cue). Scrub: content drifts up +
                fades, video scales 1 → 1.08 while the MARQUEE and
                MISSION slide over it.
      MISSION   sticky 250vh; 22 words assemble (scrub); "grind"
                strikes through in orange; "moves" scales up.
      PILLARS   desktop: sticky 400vh; three panels cross-dissolve with
                y-offset; progress bar + counter track progress.
                mobile / reduced: stacked cards, entry reveals only.
      AGENTS    graphite band; headline + three agent cards reveal once.
      RIBBON    orange full-bleed conversion band; reveals once.
      WORK      header + cards reveal once; rail is draggable with
                momentum and velocity skew.
      PROCESS   four steps reveal once; orange top rule lights per step.
      CTA       reveals once. FOOTER holds the contact form.

   3. Type scale (1.333): 0.75 / 1 / 1.333 / 1.777 / 2.369 / 3.157 /
      4.209 rem. Display H1: clamp(4rem, 12vw, 13.75rem) (desktop),
      clamp(3rem, 14vw, 6rem) (mobile). Tokens locked in :root (style.css).

   4. Faces: Fraunces (display, opsz 144, wght 300–400, italic accents)
      + Inter (body 400/500/600). Fallbacks: ui-serif/Georgia and
      ui-sans-serif/system-ui.

   5. ScrollTrigger registry (≤ 12, all markers:false)
      #   trigger          scrub   hold          notes
      1   .hero            0.6     sticky        hero exit (hero is CSS sticky)
      2   .mission         0.8     sticky 250vh  word assembly
      3   .pillars         0.8     sticky 400vh  desktop only
      4   .agents          —       —             reveal once
      5   .ribbon          —       —             reveal once
      6   .work            —       —             reveal once
      7   .process         —       —             reveal once, steps light
      8   .cta             —       —             reveal once
      9-11  .pillar ×3     —       —             mobile/reduced only,
                                                replaces #3
      "Hold" = the section supplies the scroll distance and its stage is
      CSS position:sticky; ScrollTrigger scrubs across the section instead
      of pinning. Same behaviour as pin:true, none of the pin-spacer reflow
      cost (TBT budget). Nav frost is driven by the scroll callback.
      Hero stat counters run inside the load intro, not a trigger.

   The Operator and Command Room renders (scene-02, scene-03) are kept in
   /assets/ for other pages; the Operator story section was removed from the home page.
   ============================================================= */

(() => {
  'use strict';

  const doc = document.documentElement;
  doc.classList.add('js'); // fallback for hosts that strip the inline head script
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  // `?reduce` in the URL forces the static (reduced-motion) build for QA.
  const reducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    new URLSearchParams(window.location.search).has('reduce');
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document);

  let lenis = null;

  /* One ScrollTrigger.refresh per frame, however many sources ask for it
     (fonts, load, video metadata) — refresh is the most expensive call here. */
  const scheduleRefresh = (() => {
    let id = 0;
    return () => {
      cancelAnimationFrame(id);
      id = requestAnimationFrame(() => ScrollTrigger.refresh());
    };
  })();


  /* ---------- cubic-bezier → GSAP ease ("smoothOut") ---------- */
  function cubicBezier(x1, y1, x2, y2) {
    const A = (a1, a2) => 1 - 3 * a2 + 3 * a1;
    const B = (a1, a2) => 3 * a2 - 6 * a1;
    const C = (a1) => 3 * a1;
    const calc = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
    const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (calc(t, x1, x2) - x) / s;
      }
      return calc(t, y1, y2);
    };
  }

  /* ---------- Boot ---------- */
  function boot() {
    if (reducedMotion || !hasGSAP) {
      staticMode();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    gsap.registerEase('smoothOut', cubicBezier(0.6, 0.05, 0.15, 0.95));
    gsap.defaults({ ease: 'smoothOut' });
    ScrollTrigger.config({ ignoreMobileResize: true });
    ScrollTrigger.defaults({ markers: false });

    initScroll();
    initNav();
    initCursor();
    initHero();
    initMission();
    initPillars();
    initReveal('.agents', '.agents .r', { start: 'top 72%', stagger: 0.08 });
    initReveal('.ribbon', '.ribbon .r', { start: 'top 85%', stagger: 0.1 });
    initWork();
    initProcess();
    initCTA();
    initVideos();
    initContact();

    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(scheduleRefresh); // ScrollTrigger already refreshes itself on `load`.
  }

  /* ---------- Static / reduced-motion mode ---------- */
  function staticMode() {
    doc.classList.add('reduced', 'native-scroll');
    $$('video').forEach((v) => {
      v.removeAttribute('autoplay');
      v.pause();
      const wrap = v.closest('[data-media]');
      if (wrap) wrap.classList.add('is-fallback');
    });
    initNav();
    initContact();
  }

  /* ---------- Smooth scroll (Lenis) + ScrollTrigger sync ---------- */
  function initScroll() {
    // Escape hatch: iOS momentum scrolling conflicts → native scroll.
    const useLenis = typeof Lenis !== 'undefined' && !isIOS;

    if (useLenis) {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 1.0,
        smoothWheel: true,
        syncTouch: false,
      });
      lenis.on('scroll', (e) => {
        ScrollTrigger.update();
        onScroll(e.scroll);
      });
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      doc.classList.add('lenis');
    } else {
      doc.classList.add('native-scroll');
      let ticking = false;
      window.addEventListener(
        'scroll',
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            onScroll(window.scrollY);
            ticking = false;
          });
        },
        { passive: true }
      );
    }

    // In-page anchors route through Lenis so pinned sections resolve correctly.
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id.length < 2) return;
        const target = $(id);
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
        else target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  /* ---------- Nav frost after 80px ---------- */
  let navScrolled = false;
  const nav = $('#nav');
  function onScroll(y) {
    const next = y > 80;
    if (next !== navScrolled) {
      navScrolled = next;
      nav.classList.toggle('is-scrolled', next);
    }
  }
  function initNav() {
    onScroll(window.scrollY || 0);
    if (!hasGSAP || reducedMotion) {
      let ticking = false;
      window.addEventListener(
        'scroll',
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            onScroll(window.scrollY);
            ticking = false;
          });
        },
        { passive: true }
      );
    }
  }

  /* ---------- Custom cursor (desktop, fine pointer only) ---------- */
  function initCursor() {
    if (isTouch || isMobile()) return;
    doc.classList.add('has-cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    const xDot = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power3' });
    const yDot = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power3' });
    const xRing = gsap.quickTo(ring, 'x', { duration: 0.32, ease: 'power3' });
    const yRing = gsap.quickTo(ring, 'y', { duration: 0.32, ease: 'power3' });
    const hoverables = 'a, button, [data-ticker], .card';
    let hovering = false;

    window.addEventListener(
      'pointermove',
      (e) => {
        xDot(e.clientX); yDot(e.clientY);
        xRing(e.clientX); yRing(e.clientY);
      },
      { passive: true }
    );
    const setHover = (state) => {
      if (state === hovering) return;
      hovering = state;
      gsap.to(ring, { scale: state ? 1 : 0.4, opacity: state ? 1 : 0, duration: 0.3, ease: 'power3.out' });
      gsap.to(dot, { scale: state ? 0 : 1, duration: 0.3, ease: 'power3.out' });
    };
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest(hoverables)) setHover(true);
    });
    document.addEventListener('pointerout', (e) => {
      const to = e.relatedTarget;
      if (to && to.closest && to.closest(hoverables)) return;
      if (e.target.closest && e.target.closest(hoverables)) setHover(false);
    });
    document.addEventListener('mouseleave', () => gsap.to([dot, ring], { opacity: 0, duration: 0.3 }));
    document.addEventListener('mouseenter', () => gsap.to(dot, { opacity: 1, duration: 0.3 }));
  }

  /* ---------- HERO: load intro + scrubbed exit ---------- */
  function initHero() {
    const hero = $('.hero');
    const words = $$('.hero__title .word');
    const intro = gsap.timeline({ paused: true, defaults: { ease: 'smoothOut' } });

    const nums = $$('.hero__stats .stat__num[data-count]');
    nums.forEach((n) => (n.textContent = '0'));

    intro
      .fromTo('.hero__eyebrow', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8 })
      .fromTo(words, { autoAlpha: 0, y: 50, rotateX: -12 }, { autoAlpha: 1, y: 0, rotateX: 0, duration: 1.0, stagger: 0.06 }, '-=0.45')
      .fromTo('.hero__sub', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.6')
      .fromTo('.hero__actions > *', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08 }, '-=0.6')
      .fromTo('.hero__stats', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.5')
      .add(() => {
        nums.forEach((n, i) => {
          const obj = { v: 0 };
          gsap.to(obj, {
            v: Number(n.dataset.count), duration: 1.6, delay: i * 0.1, ease: 'power3.out',
            onUpdate: () => (n.textContent = Math.round(obj.v)),
          });
        });
      }, '-=0.5')
      .fromTo('.scroll-cue', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, '-=0.2');

    gsap.set(['.hero__eyebrow', words, '.hero__sub', '.hero__actions > *', '.hero__stats', '.scroll-cue'], { autoAlpha: 0 });

    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 700))]).then(() => intro.play());

    // Exit: content drifts up as the stats strip slides over the sticky hero.
    gsap
      .timeline({
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6, markers: false },
      })
      .to('.hero__content', { y: -140, opacity: 0, ease: 'none' }, 0)
      .to('.hero__video', { scale: 1.08, ease: 'none' }, 0)
      .to('.scroll-cue', { opacity: 0, ease: 'none', duration: 0.3 }, 0);
  }

  /* ---------- Generic once-only reveal for a section ---------- */
  function initReveal(triggerSel, targetSel, opts = {}) {
    const trigger = $(triggerSel);
    const targets = $$(targetSel);
    if (!trigger || !targets.length) return null;
    return gsap.timeline({
      scrollTrigger: { trigger, start: opts.start || 'top 70%', once: true, markers: false },
    }).fromTo(targets, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: opts.stagger || 0.06 });
  }

  /* ---------- MISSION: pinned word assembly ---------- */
  function initMission() {
    const section = $('.mission');
    const words = $$('.mission__text .w');
    const strike = $('.mission__text .strike');
    const grind = $('.w--strike');
    const moves = $('.w--scale');
    const gi = words.indexOf(grind);
    const mi = words.indexOf(moves);
    const step = 0.08;

    // .mission is 250vh tall; .mission__pin is CSS sticky inside it.
    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.8, markers: false },
    });

    const ink = getComputedStyle($('.mission__text')).color;
    const accent = getComputedStyle(section).getPropertyValue('--brand-text').trim() || '#C94A06';
    tl.to(words, { color: ink, y: 0, duration: 0.5, ease: 'none', stagger: { each: step } }, 0)
      .to(strike, { scaleX: 1, duration: 0.35, ease: 'none' }, gi * step + 0.35)
      .to(moves, { scale: 1.1, marginRight: '0.28em', color: accent, duration: 0.4, ease: 'none' }, mi * step + 0.3)
      .to({}, { duration: 0.6 }); // hold on the finished sentence
  }

  /* ---------- PILLARS: pinned sequence (desktop) / stacked (mobile) ---------- */
  function initPillars() {
    const mm = gsap.matchMedia();

    mm.add('(min-width: 769px)', () => {
      const section = $('.pillars');
      const pillars = $$('.pillar');
      const bar = $('.pillars__bar i');
      const count = $('.pillars__count');
      let active = 0;

      gsap.set(pillars, { autoAlpha: 0, y: 0 });
      gsap.set(pillars[0], { autoAlpha: 1 });

      // .pillars is 400vh tall; .pillars__pin is CSS sticky inside it.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.8,
          markers: false,
          onUpdate: (self) => {
            const i = Math.min(2, Math.floor(self.progress * 3));
            if (i === active) return;
            active = i;
            count.textContent = `0${i + 1} / 03`;
            pillars.forEach((p, idx) => p.classList.toggle('is-active', idx === i));
          },
        },
      });

      pillars.forEach((p, i) => {
        const left = p.querySelector('.pillar__left');
        const right = p.querySelector('.pillar__right');
        if (i > 0) {
          tl.fromTo(p, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'none' }, '<0.1');
          tl.fromTo(left, { y: 90 }, { y: 0, duration: 0.55, ease: 'none' }, '<');
          tl.fromTo(right, { y: 140 }, { y: 0, duration: 0.65, ease: 'none' }, '<');
        }
        tl.to({}, { duration: 1 }); // hold
        if (i < pillars.length - 1) {
          tl.to(p, { autoAlpha: 0, duration: 0.4, ease: 'none' });
          tl.to([left, right], { y: -70, duration: 0.4, ease: 'none' }, '<');
        }
      });
      tl.to(bar, { scaleX: 1, duration: tl.duration(), ease: 'none' }, 0);

      return () => {
        pillars.forEach((p) => p.classList.remove('is-active'));
        pillars[0].classList.add('is-active');
      };
    });

    mm.add('(max-width: 768px)', () => {
      const pillars = $$('.pillar');
      gsap.set(pillars, { clearProps: 'all' });
      pillars.forEach((p) => {
        gsap.fromTo(
          p.children,
          { autoAlpha: 0, y: 40 },
          {
            autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12,
            scrollTrigger: { trigger: p, start: 'top 82%', once: true, markers: false },
          }
        );
      });
    });
  }

  /* ---------- PROCESS: steps reveal, orange rule lights per step ---------- */
  function initProcess() {
    const section = $('.process');
    const steps = $$('.step');
    if (!section) return;
    const tl = initReveal('.process', '.process .r', { start: 'top 70%', stagger: 0.1 });
    if (!tl) return;
    steps.forEach((s, i) => tl.add(() => s.classList.add('is-lit'), 0.35 + i * 0.18));
  }

  /* ---------- CONTACT FORM ----------
     Swap YOUR_FORM_ID in index.html for a Formspree (or similar) endpoint.
     Until then the form opens the visitor's mail app with the message
     pre-filled, so it never silently does nothing. */
  function initContact() {
    const form = $('[data-contact]');
    if (!form) return;
    const note = form.querySelector('.contact__note');
    const say = (msg) => { if (note) note.textContent = msg; };
    form.addEventListener('submit', (e) => {
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const message = form.message.value.trim();
      if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        e.preventDefault();
        say('Add your name and a valid email so we can reply.');
        return;
      }
      if (form.action.includes('YOUR_FORM_ID')) {
        e.preventDefault();
        const subject = encodeURIComponent(`Strategy call request from ${name}`);
        const body = encodeURIComponent(`${message || '(no message)'}\n\n— ${name}\n${email}`);
        window.location.href = `mailto:hello@genworq.com?subject=${subject}&body=${body}`;
        say('Opening your email app with the message ready to send.');
        return;
      }
      say('Sending…');
    });
  }

  /* ---------- WORK: reveal + draggable rail ---------- */
  function initWork() {
    const section = $('.work');
    const cards = $$('.card'); // originals only — captured before the rail clones them
    initDrag($('[data-ticker]'));
    gsap
      .timeline({ scrollTrigger: { trigger: section, start: 'top 70%', once: true, markers: false } })
      .fromTo($$('.r', section), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.06 })
      .fromTo(cards, { x: 160, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 1.1, stagger: { amount: 0.6 } }, '-=0.5');
  }

  /* Infinite industries rail: the card set is cloned once so the track can
     wrap seamlessly; it drifts on its own (paused on hover / drag / offscreen)
     and stays fully draggable with momentum and velocity skew. */
  function initDrag(el) {
    if (!el) return;
    const track = el.querySelector('.ticker__track');
    const originals = Array.from(track.children);
    originals.forEach((li) => {
      const clone = li.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });

    const state = { x: 0 };
    const speed = Number(el.dataset.railSpeed) || 36; // px per second
    const setX = gsap.quickSetter(track, 'x', 'px');
    const skewTo = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3.out' });
    let loopW = 0;
    let dragging = false, hovering = false, visible = false, flinging = false;
    let startX = 0, startPointer = 0, lastX = 0, lastT = 0, vel = 0, moved = 0;

    const measure = () => {
      const first = originals[0];
      const firstClone = track.children[originals.length];
      loopW = firstClone.offsetLeft - first.offsetLeft;
    };
    const wrap = (v) => (loopW ? ((v % loopW) - loopW) % loopW : v); // keeps v in (-loopW, 0]
    const apply = () => setX(state.x);

    measure();
    window.addEventListener('resize', () => { measure(); state.x = wrap(state.x); apply(); });

    // Drift only while on screen and idle.
    gsap.ticker.add((_t, dt) => {
      if (!visible || dragging || hovering || flinging) return;
      state.x = wrap(state.x - (speed * dt) / 1000);
      apply();
    });
    const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { rootMargin: '10% 0px' });
    io.observe(el);

    if (!isTouch) {
      el.addEventListener('pointerenter', () => (hovering = true));
      el.addEventListener('pointerleave', () => (hovering = false));
    }

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      moved = 0;
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
      gsap.killTweensOf(state);
      flinging = false;
      startPointer = e.clientX;
      startX = state.x;
      lastX = e.clientX;
      lastT = performance.now();
      vel = 0;
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startPointer;
      moved = Math.max(moved, Math.abs(dx));
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vel = (e.clientX - lastX) / dt; // px per ms
      lastX = e.clientX;
      lastT = now;
      state.x = wrap(startX + dx);
      apply();
      skewTo(Math.max(-8, Math.min(8, -vel * 6)));
    });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-dragging');
      skewTo(0);
      flinging = true;
      gsap.to(state, {
        x: state.x + vel * 280,
        duration: 0.9,
        ease: 'power3.out',
        onUpdate: () => { state.x = wrap(state.x); apply(); },
        onComplete: () => (flinging = false),
      });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    // Suppress accidental clicks inside cards after a real drag.
    el.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* ---------- CTA ---------- */
  function initCTA() {
    initReveal('.cta', '.cta .r', { start: 'top 70%', stagger: 0.1 });
  }

  /* ---------- VIDEO: hero autoplay loop with poster fallback ---------- */
  function initVideos() {
    const hero = $('.hero__video');
    if (!hero) return;
    hero.addEventListener('error', () => {
      const wrap = hero.closest('[data-media]');
      if (wrap) wrap.classList.add('is-fallback');
    }, { once: true });
    const p = hero.play();
    if (p && p.catch) p.catch(() => {}); // autoplay blocked → poster holds the frame
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
