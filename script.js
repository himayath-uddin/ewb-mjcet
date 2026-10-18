/* ── Intro Animation Controller ── */
(function () {
  var overlay = document.getElementById('intro-overlay');
  if (!overlay) return;

  var video = document.getElementById('intro-video');

  /* Graceful video fallback: hide video element if autoplay is blocked */
  if (video) {
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        video.style.display = 'none';
      });
    }
  }

  /* Mark intro as seen for this browser session */
  sessionStorage.setItem('ewb-intro-seen', '1');

  /* Make overlay non-interactive once exit animation begins */
  setTimeout(function () {
    if (overlay.parentNode) overlay.style.pointerEvents = 'none';
  }, 3180);

  /* Remove overlay from DOM after animation completes (~3.9s) */
  setTimeout(function () {
    if (overlay.parentNode) overlay.remove();
    document.body.classList.remove('intro-playing');
  }, 3900);

  /* Clean up hero reveal classes once Gaussian blur transition finishes (~4.85s) */
  setTimeout(function () {
    document.body.classList.remove('hero-revealing');
  }, 4850);
})();

/* Helper to replay intro & hero reveal animation easily for preview & testing */
window.replayReveal = function () {
  sessionStorage.removeItem('ewb-intro-seen');
  window.location.reload();
};

/* ── Direct Router /admin redirect check ── */
if (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin')) {
  window.location.href = 'admin/';
}

/* ── Scroll Reveal Intersection Observer (Initialized early to prevent reload glitches) ── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.14 });
window.revealObserver = revealObserver;

function reobserveReveals() {
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("is-visible");
    } else {
      revealObserver.observe(el);
    }
  });
}

/* ── Timeline entry observer (staggered reveal) ── */
const timelineObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const delay = parseInt(entry.target.style.getPropertyValue("--i") || 0) * 110;
    setTimeout(() => entry.target.classList.add("is-visible"), delay);
    timelineObserver.unobserve(entry.target);
  });
}, { threshold: 0.15 });
window.timelineObserver = timelineObserver;

/* ── Scroll-driven timeline progress line ── */
function initTimelineProgress() {
  const timelineContainer = document.querySelector("[data-reports]");
  const progressBar = document.querySelector(".timeline-progress");
  if (progressBar && timelineContainer) {
    const updateProgress = () => {
      const rect = timelineContainer.getBoundingClientRect();
      const containerHeight = rect.height;
      const scrolled = -rect.top;
      const viewportMid = window.innerHeight * 0.5;
      const progress = Math.min(Math.max((scrolled + viewportMid) / containerHeight, 0), 1);
      progressBar.style.height = `${progress * 100}%`;
    };
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
  }
}

/* ── Smart DOM Helpers (In-place updates prevent DOM rebuilds & animation jumps) ── */
function safeText(el, val) {
  if (el && val !== undefined && el.textContent !== String(val)) {
    el.textContent = val;
  }
}

function safeHtml(el, val) {
  if (el && val !== undefined && el.innerHTML !== String(val)) {
    el.innerHTML = val;
  }
}

function safeSrc(el, val) {
  if (el && val && el.getAttribute("src") !== val) {
    el.src = val;
  }
}

function updateSectionIfChanged(container, newHtml, isCardList = true) {
  if (!container) return;
  const trimmed = newHtml.trim();
  if (container.dataset.lastHtml === trimmed) return;
  container.dataset.lastHtml = trimmed;

  const rect = container.getBoundingClientRect();
  const isNearViewport = rect.top < (window.innerHeight + 120);
  container.innerHTML = trimmed;

  if (isCardList) {
    if (isNearViewport) {
      container.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    } else {
      reobserveReveals();
    }
  }
}

/* ── Master Real-Time Dynamic Content Engine ── */
function applyDynamicContent(content) {
  if (!content) return;
  const f = content.fields || {};

  // 1. Hero Copy & Headings
  safeText(document.querySelector('.hero-copy .eyebrow'), f.heroEyebrow);

  const heroH1 = document.querySelector('.hero-copy h1');
  if (heroH1) {
    const mainTitle = f.heroTitleMain !== undefined ? f.heroTitleMain : "Engineers Without Borders";
    const accentTitle = f.heroTitleAccent !== undefined ? f.heroTitleAccent : "MJCET";
    const h1Html = `${mainTitle} <span>${accentTitle}</span>`;
    safeHtml(heroH1, h1Html);
  }

  safeText(document.querySelector('.hero-line'), f.heroLine);
  safeText(document.querySelector('.hero-text'), f.heroText);

  // Sync Footer Tagline & Intro Slogan
  safeText(document.querySelector('.footer-brand small'), f.heroLine);
  safeText(document.querySelector('.intro-slogan'), f.heroLine);

  // 2. Visual Identity & Logos
  if (f.brandLogo) {
    document.querySelectorAll('.brand-logo').forEach((img) => safeSrc(img, f.brandLogo));
  }
  safeSrc(document.querySelector('.identity-card img'), f.heroLogo);
  safeSrc(document.querySelector('.intro-logo'), f.introLogo);

  // Action Photos & Captions
  safeSrc(document.querySelector('.main-photo img'), f.heroMainImage);
  safeText(document.querySelector('.main-photo figcaption'), f.heroMainCaption);

  safeSrc(document.querySelector('.side-photo img'), f.heroSideImage);
  safeText(document.querySelector('.side-photo figcaption'), f.heroSideCaption);

  // 3. Floating Metric Badges
  safeText(document.querySelector('.metric-water strong'), f.waterMetricValue);
  safeText(document.querySelector('.metric-water span'), f.waterMetricLabel);

  safeText(document.querySelector('.metric-energy strong'), f.learningMetricValue);
  safeText(document.querySelector('.metric-energy span'), f.learningMetricLabel);

  safeText(document.querySelector('.coordinate-card span'), f.locationLabel);
  safeText(document.querySelector('.coordinate-card b'), f.locationTitle);

  // 3b. Impact Statistics Counter Bar (5 Key Metrics)
  const impactItems = document.querySelectorAll('#impact .impact-item, #impact article');
  if (impactItems.length >= 5) {
    const statsData = [
      { num: f.impactStat1Number !== undefined ? f.impactStat1Number : "20+", label: f.impactStat1Label !== undefined ? f.impactStat1Label : "Years of impact" },
      { num: f.impactStat2Number !== undefined ? f.impactStat2Number : "100+", label: f.impactStat2Label !== undefined ? f.impactStat2Label : "Student members" },
      { num: f.impactStat3Number !== undefined ? f.impactStat3Number : "50+", label: f.impactStat3Label !== undefined ? f.impactStat3Label : "Activities & projects" },
      { num: f.impactStat4Number !== undefined ? f.impactStat4Number : "28+", label: f.impactStat4Label !== undefined ? f.impactStat4Label : "E-learning centers" },
      { num: f.impactStat5Number !== undefined ? f.impactStat5Number : "500+", label: f.impactStat5Label !== undefined ? f.impactStat5Label : "Households surveyed" },
    ];

    statsData.forEach((stat, i) => {
      const item = impactItems[i];
      if (!item) return;

      const numStr = String(stat.num ?? "").trim();
      const numMatch = numStr.match(/^(\d+)(.*)$/);
      const parsedNumber = numMatch ? parseInt(numMatch[1], 10) : (parseInt(numStr, 10) || 0);
      const suffix = numMatch && numMatch[2] ? numMatch[2] : (numStr && !/\d$/.test(numStr) ? "" : "+");

      item.dataset.counter = String(parsedNumber);
      item.dataset.counterSuffix = suffix;

      const strongEl = item.querySelector("strong");
      if (strongEl) {
        strongEl.textContent = `${parsedNumber}${suffix}`;
      }

      const labelEl = item.querySelector("span");
      if (labelEl) {
        safeText(labelEl, stat.label);
      }

      item.setAttribute("aria-label", `${parsedNumber}${suffix} ${stat.label}`);
    });
  }

  // 4. About Section Headings & Pillar Cards
  safeText(document.querySelector('#about .section-intro .eyebrow'), f.aboutEyebrow);
  safeText(document.querySelector('#about .section-intro h2'), f.aboutTitle);
  safeText(document.querySelector('#about .section-intro p'), f.aboutText);

  if (Array.isArray(content.aboutCards) && content.aboutCards.length) {
    const aboutGrid = document.querySelector('#about .about-grid');
    if (aboutGrid) {
      const cardsHtml = content.aboutCards.map((card, idx) => `
        <article class="about-card reveal" style="--i:${idx}">
          <span class="card-index">${String(idx + 1).padStart(2, '0')}</span>
          <h3>${card.title || ''}</h3>
          <p>${card.text || ''}</p>
        </article>
      `).join('');
      updateSectionIfChanged(aboutGrid, cardsHtml, true);
    }
  }

  // 5. Engineering Focus Domains (With in-place marquee preservation)
  safeText(document.querySelector('.focus-section .section-intro .eyebrow'), f.focusEyebrow);
  safeText(document.querySelector('.focus-section .section-intro h2'), f.focusTitle);

  if (Array.isArray(content.focusAreas) && content.focusAreas.length) {
    const focusContainer = document.querySelector('[data-focus]');
    if (focusContainer) {
      const cardsData = content.focusAreas.map((fa) => ({
        icon: fa.icon || fa[0] || '',
        title: fa.title || fa[1] || '',
        text: fa.text || fa[2] || ''
      }));

      const track = focusContainer.querySelector('.focus-track');
      const existingCards = track ? track.querySelectorAll('.focus-card') : [];

      // If track exists and card count matches 2x (original + duplicate loop), update text in place without restarting CSS marquee
      if (track && existingCards.length === cardsData.length * 2) {
        cardsData.forEach((fa, i) => {
          const card1 = existingCards[i];
          const card2 = existingCards[i + cardsData.length];
          [card1, card2].forEach((card) => {
            if (!card) return;
            safeText(card.querySelector('span'), fa.icon);
            safeText(card.querySelector('h3'), fa.title);
            safeText(card.querySelector('p'), fa.text);
          });
        });
      } else {
        const cardsHtml = cardsData.map((fa, index) => `
          <article class="focus-card" style="--i:${index}">
            <span>${fa.icon}</span>
            <h3>${fa.title}</h3>
            <p>${fa.text}</p>
          </article>
        `).join('');
        focusContainer.innerHTML = `<div class="focus-track">${cardsHtml}${cardsHtml}</div>`;
      }
    }
  }

  // 6. Featured Case Study
  safeSrc(document.querySelector('.case-media img'), f.caseImage);
  safeText(document.querySelector('.case-tag'), f.caseTag);
  safeText(document.querySelector('.case-copy .eyebrow'), f.caseEyebrow);
  safeText(document.querySelector('.case-copy h2'), f.caseTitle);
  safeText(document.querySelector('.case-copy > p'), f.caseText);

  // 7. Signature Projects Portfolio
  safeText(document.querySelector('#projects .section-intro .eyebrow'), f.projectsEyebrow);
  safeText(document.querySelector('#projects .section-intro h2'), f.projectsTitle);
  safeText(document.querySelector('#projects .section-intro p'), f.projectsText);

  if (Array.isArray(content.projects) && content.projects.length) {
    const pGrid = document.querySelector('[data-projects]');
    if (pGrid) {
      const projectsHtml = content.projects.map((p, index) => `
        <article class="project-card reveal" style="--i:${index}">
          <div class="project-media">
            <img src="${p.image || ''}" alt="${p.title || ''}" />
            <span>${p.tag || ''}</span>
          </div>
          <div class="project-body">
            <h3>${p.title || ''}</h3>
            <dl>
              <dt>Problem</dt><dd>${p.problem || ''}</dd>
              <dt>Engineering Response</dt><dd>${p.response || ''}</dd>
              <dt>Outcome</dt><dd>${p.outcome || ''}</dd>
            </dl>
          </div>
        </article>
      `).join('');
      updateSectionIfChanged(pGrid, projectsHtml, true);
    }
  }

  // 8. Activities & Events Stream
  safeText(document.querySelector('#events .section-intro .eyebrow'), f.eventsEyebrow);
  safeText(document.querySelector('#events .section-intro h2'), f.eventsTitle);

  if (Array.isArray(content.events) && content.events.length) {
    const evRail = document.querySelector('[data-events]');
    if (evRail) {
      const eventsHtml = content.events.map((ev, index) => {
        const title = ev.title || ev[0] || '';
        const date = ev.date || ev[1] || '';
        const category = ev.category || ev[2] || '';
        const image = ev.image || ev[3] || '';
        const desc = ev.text || ev[4] || '';
        return `
          <article class="event-card reveal" style="--i:${index}">
            <img src="${image}" alt="${title}" />
            <div class="event-meta"><span>${category}</span><time>${date}</time></div>
            <h3>${title}</h3>
            <p>${desc}</p>
          </article>
        `;
      }).join('');
      updateSectionIfChanged(evRail, eventsHtml, true);
    }
  }

  // 9. Documented Legacy Timeline (Reports)
  safeText(document.querySelector('#reports .section-intro .eyebrow'), f.reportsEyebrow);
  safeText(document.querySelector('#reports .section-intro h2'), f.reportsTitle);
  safeText(document.querySelector('#reports .section-intro p'), f.reportsText);

  if (Array.isArray(content.reports) && content.reports.length) {
    const timelineContainer = document.querySelector('[data-reports]');
    if (timelineContainer) {
      const reportsHtml = content.reports.map((r, index) => {
        const year = r.year || r[0] || '';
        const copy = r.text || r[1] || '';
        return `
          <div class="report-entry" style="--i:${index}">
            <article class="report-node" style="--i:${index}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${year}</strong>
              <p>${copy}</p>
            </article>
            <div class="timeline-dot"></div>
          </div>
        `;
      }).join('');

      const targetHtml = `<div class="timeline-progress"></div>` + reportsHtml;
      updateSectionIfChanged(timelineContainer, targetHtml, false);

      initTimelineProgress();
      if (window.timelineObserver) {
        timelineContainer.querySelectorAll('.report-entry:not(.is-visible)').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            el.classList.add('is-visible');
          } else {
            window.timelineObserver.observe(el);
          }
        });
      }
    }
  }

  // 10. Leadership & Governance Team
  safeText(document.querySelector('#team .section-intro .eyebrow'), f.teamEyebrow);
  safeText(document.querySelector('#team .section-intro h2'), f.teamTitle);

  if (Array.isArray(content.team) && content.team.length) {
    const tmGrid = document.querySelector('.team-grid');
    if (tmGrid) {
      const teamHtml = content.team.map((m, index) => {
        if (m.kind === 'cabinet' || (!m.image && m.roles)) {
          const rList = Array.isArray(m.roles) ? m.roles : (m.roles ? String(m.roles).split(',') : []);
          return `
            <article class="team-card cabinet-card reveal" style="--i:${index}">
              <span>${m.role || ''}</span>
              <h3>${m.name || ''}</h3>
              <p>${m.text || ''}</p>
              <div class="role-pills">${rList.map((r) => `<b>${String(r).trim()}</b>`).join('')}</div>
            </article>
          `;
        }
        return `
          <article class="team-card reveal" style="--i:${index}">
            <img src="${m.image || ''}" alt="${m.name || ''}, ${m.role || ''}" style="object-fit: cover; object-position: center top;" />
            <span>${m.role || ''}</span>
            <h3>${m.name || ''}</h3>
            <p>${m.text || ''}</p>
          </article>
        `;
      }).join('');
      updateSectionIfChanged(tmGrid, teamHtml, true);
    }
  }

  // 11. Recruitment Banner & Role Chips
  safeText(document.querySelector('#join .eyebrow'), f.joinEyebrow);
  safeText(document.querySelector('#join h2'), f.joinTitle);
  safeText(document.querySelector('#join p'), f.joinText);

  if (f.joinBackground) {
    const joinSec = document.querySelector('#join');
    if (joinSec) {
      joinSec.style.backgroundImage = `linear-gradient(135deg, rgba(8, 21, 19, 0.93), rgba(8, 115, 71, 0.88)), url("${f.joinBackground}")`;
    }
  }

  if (Array.isArray(content.joinTracks) && content.joinTracks.length) {
    const jGrid = document.querySelector('[data-join]');
    if (jGrid) {
      const chipsHtml = content.joinTracks.map((t) => `<span>${typeof t === 'string' ? t : (t.value || t)}</span>`).join('');
      updateSectionIfChanged(jGrid, chipsHtml, false);
    }
  }

  // Final check to observe any remaining reveal elements
  reobserveReveals();
}

// Initial Content Hydration and Multi-Layer Real-Time Subscription
(function initHydration() {
  if (window.EWBContent && window.EWB_BASE_CONTENT) {
    const initialContent = window.EWBContent.read(window.EWB_BASE_CONTENT);
    applyDynamicContent(initialContent);

    // Subscribe to multi-channel sync (BroadcastChannel + storage pulse + window events + focus)
    window.EWBContent.subscribe((updatedContent) => {
      applyDynamicContent(updatedContent);
    });
  }
})();

/* ── UI Interactivity & Navigation Listeners ── */
const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu-button]");
const aura = document.querySelector(".cursor-aura");

if (header) {
  window.addEventListener("scroll", () => {
    header.classList.toggle("is-scrolled", window.scrollY > 18);
  }, { passive: true });
}

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuButton.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });

  const navLinks = nav.querySelectorAll("a");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      menuButton.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute("id");
        const link = nav.querySelector(`a[href="#${id}"]`);
        if (link) {
          navLinks.forEach((a) => a.classList.remove("active"));
          link.classList.add("active");
        }
      }
    });
  }, { rootMargin: "-40% 0px -40% 0px" });

  document.querySelectorAll("section[id], header[id]").forEach((section) => {
    sectionObserver.observe(section);
  });
}

if (aura) {
  window.addEventListener("pointermove", (event) => {
    aura.style.setProperty("--x", `${event.clientX}px`);
    aura.style.setProperty("--y", `${event.clientY}px`);
  }, { passive: true });
}

// Trigger initial reveal observation
reobserveReveals();

/* ── Numerical Counter Animation ── */
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const target = Number(entry.target.dataset.counter);
    const suffix = entry.target.dataset.counterSuffix !== undefined ? entry.target.dataset.counterSuffix : "+";
    const output = entry.target.querySelector("strong");
    if (!output || isNaN(target)) return;
    const duration = 1300;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      output.textContent = `${Math.round(target * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    counterObserver.unobserve(entry.target);
  });
}, { threshold: 0.5 });

document.querySelectorAll("[data-counter]").forEach((stat) => counterObserver.observe(stat));

/* ── Subtle Click/Tap Pulse for Impact Stat Items ── */
document.querySelectorAll(".impact-strip article").forEach((card) => {
  const triggerPulse = () => {
    card.classList.remove("is-clicked");
    void card.offsetWidth; // trigger reflow
    card.classList.add("is-clicked");
    setTimeout(() => card.classList.remove("is-clicked"), 500);
  };
  card.addEventListener("click", triggerPulse);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerPulse();
    }
  });
});

/* ── Custom Gear Cursor Controller (Desktop Fine Pointer Only) ── */
(function initGearCursor() {
  const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!supportsFinePointer) return;

  const cursorEl = document.querySelector('.custom-gear-cursor');
  if (!cursorEl) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerpFactor = prefersReducedMotion ? 1.0 : 0.38;

  let mouseX = -100;
  let mouseY = -100;
  let currentX = -100;
  let currentY = -100;
  let isMoving = false;
  let isVisible = false;
  let rafId = null;

  // Mark HTML with active class to hide native pointer cleanly
  document.documentElement.classList.add('custom-cursor-active');

  const dotEl = cursorEl.querySelector('.gear-dot');
  let dotX = 0;
  let dotY = 0;

  function render() {
    const dx = mouseX - currentX;
    const dy = mouseY - currentY;

    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      currentX += dx * lerpFactor;
      currentY += dy * lerpFactor;
      cursorEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

      // Smooth inertia motion for center dot while hovering across the page
      if (dotEl && !cursorEl.classList.contains('cursor--hover') && !cursorEl.classList.contains('cursor--link')) {
        const targetDotX = Math.max(-2.5, Math.min(2.5, -dx * 0.12));
        const targetDotY = Math.max(-2.5, Math.min(2.5, -dy * 0.12));
        dotX += (targetDotX - dotX) * 0.22;
        dotY += (targetDotY - dotY) * 0.22;
        dotEl.style.transform = `translate(${dotX.toFixed(2)}px, ${dotY.toFixed(2)}px)`;
      }

      rafId = requestAnimationFrame(render);
    } else {
      currentX = mouseX;
      currentY = mouseY;
      cursorEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

      if (dotEl && !cursorEl.classList.contains('cursor--hover') && !cursorEl.classList.contains('cursor--link')) {
        dotX += (0 - dotX) * 0.25;
        dotY += (0 - dotY) * 0.25;
        if (Math.abs(dotX) < 0.05 && Math.abs(dotY) < 0.05) {
          dotEl.style.transform = '';
        } else {
          dotEl.style.transform = `translate(${dotX.toFixed(2)}px, ${dotY.toFixed(2)}px)`;
        }
      }

      isMoving = false;
      rafId = null;
    }
  }

  function startMovement() {
    if (!isMoving) {
      isMoving = true;
      rafId = requestAnimationFrame(render);
    }
  }

  // Pointer & Mouse Move Tracking
  function handleMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!isVisible) {
      isVisible = true;
      cursorEl.classList.add('is-visible');
      currentX = mouseX;
      currentY = mouseY;
      cursorEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }

    startMovement();
  }

  window.addEventListener('pointermove', handleMove, { passive: true });
  window.addEventListener('mousemove', handleMove, { passive: true });

  // Click Response: brief clockwise rotation (~300ms) with debounce to avoid rapid click jitter
  let clickTimeout = null;
  function handleClick(e) {
    if (e.button === 0) {
      cursorEl.classList.remove('cursor--click');
      void cursorEl.offsetWidth; // Force reflow
      cursorEl.classList.add('cursor--click');

      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        cursorEl.classList.remove('cursor--click');
        clickTimeout = null;
      }, 300);
    }
  }

  window.addEventListener('pointerdown', handleClick);
  window.addEventListener('mousedown', handleClick);

  // Window Boundaries
  document.addEventListener('mouseleave', () => {
    isVisible = false;
    cursorEl.classList.remove('is-visible');
  });

  document.addEventListener('mouseenter', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    isVisible = true;
    cursorEl.classList.add('is-visible');
    currentX = mouseX;
    currentY = mouseY;
    cursorEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
  });

  // Contextual Hover States
  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    cursorEl.classList.remove('cursor--hover', 'cursor--link', 'cursor--input', 'cursor--impact');

    if (target.closest('input, textarea, [contenteditable="true"]')) {
      cursorEl.classList.add('cursor--input');
      return;
    }

    if (target.closest('.impact-strip, .impact-strip *')) {
      cursorEl.classList.add('cursor--hover', 'cursor--impact');
      if (dotEl) dotEl.style.transform = '';
      return;
    }

    if (target.closest('a[href]')) {
      cursorEl.classList.add('cursor--link');
      if (dotEl) dotEl.style.transform = '';
      return;
    }

    if (target.closest('button, [role="button"], .btn, .project-card, .event-card, .focus-card, .team-card, .menu-button, summary, [data-menu-button]')) {
      cursorEl.classList.add('cursor--hover');
      if (dotEl) dotEl.style.transform = '';
      return;
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
      cursorEl.classList.remove('cursor--hover', 'cursor--link', 'cursor--input', 'cursor--impact');
      if (dotEl) dotEl.style.transform = '';
    }
  });
})();
