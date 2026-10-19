(function () {
  const LOGIN_KEY = "ewb-mjcet-admin-session";
  const base = window.EWB_BASE_CONTENT || { fields: {}, aboutCards: [], focusAreas: [], projects: [], events: [], reports: [], team: [], joinTracks: [] };
  let content = window.EWBContent.read(base);
  let activeSection = "overview";
  let isDirty = false;
  let autoSyncEnabled = false;
  let broadcastDebounceTimer = null;
  let autoSaveDebounceTimer = null;
  let toastTimer = null;

  // ── Strict Single-Session In-Memory Security ──
  // Enforce in-memory authentication persistence so credentials NEVER persist to IndexedDB/localStorage
  if (typeof firebase !== "undefined" && firebase.auth) {
    try {
      if (firebase.auth.Auth && firebase.auth.Auth.Persistence) {
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
      }
    } catch (e) {}

    // If this tab does not have an active login session, immediately force sign-out any cached user!
    if (sessionStorage.getItem(LOGIN_KEY) !== "1") {
      try {
        firebase.auth().signOut().catch(() => {});
      } catch (e) {}
    }
  }

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  
  const getAt = (path) => path.split(".").reduce((value, key) => value?.[key], content);
  
  const setAt = (path, value) => {
    const keys = path.split(".");
    const finalKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], content);
    if (target) {
      target[finalKey] = value;
    }
  };

  function assetUrl(value) {
    if (!value) return "";
    const str = String(value);
    if (str.startsWith("public/")) return `/${str}`;
    if (str.startsWith("../public/")) return `/${str.slice(3)}`;
    return str;
  }

  /* ── UI Feedback & Toast Notifications ── */
  function showToast(message, type = "success") {
    const toast = document.getElementById("admin-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `admin-toast is-visible ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2800);
  }

  function updateSyncStatus(statusText, isLive = true) {
    const label = $("[data-sync-label]");
    const pill = $("[data-live-status]");
    if (label) label.textContent = statusText;
    if (pill) {
      pill.classList.toggle("is-pulsing", isLive);
    }
  }

  function updateSaveButtons(dirty) {
    isDirty = dirty;
    const topbarBtn = $("[data-save-topbar]");
    const topbarLabel = $("[data-save-btn-label]");
    const bottomBtn = $("[data-save-section]");
    const bottomState = $("[data-save-state-text]");

    if (topbarLabel) {
      topbarLabel.textContent = dirty ? "Save & Publish" : "Saved ✓";
    }
    if (topbarBtn) {
      topbarBtn.classList.toggle("btn-dirty", dirty);
    }
    if (bottomBtn) {
      bottomBtn.disabled = !dirty;
      bottomBtn.textContent = dirty ? "Save & Publish" : "Saved ✓";
    }
    if (bottomState) {
      bottomState.textContent = dirty ? "Unsaved changes ready to publish" : "All changes published live";
    }
  }

  function markDirty() {
    updateSaveButtons(true);
    updateSyncStatus("Syncing live...", true);
  }

  /* ── Core Save & Live Broadcast Engine ── */
  async function save() {
    updateSyncStatus("Saving...", true);
    try {
      await window.EWBContent.saveToCloud(content);
      updateSaveButtons(false);
      updateSyncStatus("Cloud Synced ✓", true);
      showToast("✓ Changes saved & published live to Firebase!");
      updateBadgeCounts();
    } catch (error) {
      updateSyncStatus("Storage Error", false);
      showToast("Storage error: image may be too large. Use an image path instead.", "error");
    }
  }

  function handleLiveInput(path, rawValue) {
    const value = normalizeSpecialValues(path, rawValue);
    setAt(path, value);
    markDirty();

    if (autoSyncEnabled) {
      // 1. Instant zero-latency live broadcast to website tab while typing (~25ms)
      clearTimeout(broadcastDebounceTimer);
      broadcastDebounceTimer = setTimeout(() => {
        window.EWBContent.broadcastLive(content);
      }, 25);

      // 2. Debounced auto-save to localStorage (~300ms)
      clearTimeout(autoSaveDebounceTimer);
      autoSaveDebounceTimer = setTimeout(() => {
        try {
          window.EWBContent.save(content);
          updateSaveButtons(false);
          updateSyncStatus("Live Synced ✓", true);
        } catch (err) {
          console.warn("Auto-save storage limit check", err);
        }
      }, 300);
    }
  }

  async function resetAll() {
    const confirmed = confirm("Are you sure you want to reset all content back to factory defaults?\n\nThis will restore the original EWB-MJCET website data.");
    if (!confirmed) return;
    try {
      content = window.EWBContent.reset(base);
      await window.EWBContent.saveToCloud(content);
      updateSaveButtons(false);
      updateSyncStatus("Reset to Defaults ✓", true);
      showToast("✓ All content has been reset to defaults!");
      updateBadgeCounts();
      renderSection();
    } catch (err) {
      alert("Error resetting content: " + err);
    }
  }

  function updateBadgeCounts() {
    const badges = {
      focusAreas: content.focusAreas?.length || 0,
      projects: content.projects?.length || 0,
      events: content.events?.length || 0,
      reports: content.reports?.length || 0,
      team: content.team?.length || 0
    };
    Object.entries(badges).forEach(([key, count]) => {
      const el = $(`[data-count="${key}"]`);
      if (el) el.textContent = count;
    });
  }

  /* ── Form Field Generator ── */
  function field(path, label, type = "text", full = false, help = "") {
    const value = getAt(path) ?? "";
    const classes = `field${full ? " full" : ""}`;

    if (type === "image") {
      return `
        <div class="${classes}">
          <label>
            <span class="field-title">${escapeHtml(label)}</span>
            <div class="image-row">
              <input data-path="${path}" value="${escapeHtml(value)}" placeholder="Image path or paste URL" />
              <label class="upload-button" title="Choose file from computer">
                <span>📁 Upload</span>
                <input data-upload="${path}" type="file" accept="image/*" />
              </label>
              <button type="button" class="clear-button" data-clear-image="${path}" title="Clear image">✕</button>
            </div>
            <div class="preview-wrap">
              <img class="image-preview" data-preview="${path}" src="${escapeHtml(assetUrl(value))}" alt="Preview" onerror="this.style.opacity='0.2'" onload="this.style.opacity='1'" />
              <span class="preview-tag">Preview</span>
            </div>
          </label>
          ${help ? `<small>${escapeHtml(help)}</small>` : ""}
        </div>
      `;
    }

    const control = type === "textarea" 
      ? `<textarea data-path="${path}" rows="3">${escapeHtml(value)}</textarea>` 
      : `<input data-path="${path}" value="${escapeHtml(value)}" />`;

    return `
      <div class="${classes}">
        <label>
          <span class="field-title">${escapeHtml(label)}</span>
          ${control}
        </label>
        ${help ? `<small>${escapeHtml(help)}</small>` : ""}
      </div>
    `;
  }

  function sectionIntro(text) {
    return `<div class="editor-intro-box"><p class="editor-intro">${text}</p></div>`;
  }

  function editorCard(title, description, body) {
    return `
      <section class="editor-card">
        <div class="editor-card-header">
          <h2>${title}</h2>
          ${description ? `<p>${description}</p>` : ""}
        </div>
        <div class="field-grid">${body}</div>
      </section>
    `;
  }

  function listEditor(title, description, arrayPath, schema, defaultItem) {
    const items = getAt(arrayPath) || [];
    return `
      <section class="repeat-section">
        <div class="repeat-header">
          <div>
            <h2>${title} <span class="repeat-count-badge">${items.length}</span></h2>
            <p>${description}</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm add-button" data-add="${arrayPath}">+ Add Card</button>
        </div>
        <div class="repeat-cards-grid">
          ${items.map((item, index) => {
            const displayTitle = typeof item === "string" 
              ? item 
              : (item.title || item.name || item.year || item.value || `Item ${index + 1}`);
            return `
              <article class="repeat-card">
                <div class="repeat-card-top">
                  <span class="repeat-card-index">#${String(index + 1).padStart(2, "0")}</span>
                  <span class="repeat-card-title">${escapeHtml(displayTitle)}</span>
                  <button type="button" class="remove-button" data-remove="${arrayPath}" data-index="${index}" title="Remove this card">✕ Remove</button>
                </div>
                <div class="field-grid">
                  ${schema.map((itemSchema) => field(
                    arrayPath === "joinTracks" ? `${arrayPath}.${index}` : `${arrayPath}.${index}.${itemSchema.key}`,
                    itemSchema.label,
                    itemSchema.type || "text",
                    itemSchema.full || false,
                    itemSchema.help || ""
                  )).join("")}
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  /* ── Section Renderers ── */
  function renderOverview() {
    const area = $("[data-editor-area]");
    area.innerHTML = `
      <div class="overview-grid">
        <section class="overview-card hero-highlight">
          <span class="eyebrow">Studio Dashboard</span>
          <h2>Real-Time Dynamic Content Studio</h2>
          <p>
            Edits made in this admin panel broadcast <b>instantly in real time</b> to your website. 
            Keep your live website open in another tab to observe immediate updates on every keystroke.
          </p>
          <div class="overview-status-indicator">
            <span class="pulse-dot"></span>
            <b>Real-time synchronization active</b>
          </div>
          <div class="overview-metrics">
            <div data-go="projects">
              <b>${content.projects?.length || 0}</b>
              <span>Projects</span>
            </div>
            <div data-go="events">
              <b>${content.events?.length || 0}</b>
              <span>Events</span>
            </div>
            <div data-go="about">
              <b>${content.focusAreas?.length || 0}</b>
              <span>Focus Domains</span>
            </div>
            <div data-go="reports">
              <b>${content.reports?.length || 0}</b>
              <span>Reports</span>
            </div>
            <div data-go="team">
              <b>${content.team?.length || 0}</b>
              <span>Team Members</span>
            </div>
          </div>
        </section>

        <section class="overview-card quick-links-card">
          <span class="eyebrow">Quick Navigation</span>
          <h2>Edit Website Sections</h2>
          <p>Jump directly into any part of the site to customize text, photographs, and cards:</p>
          <div class="quick-list">
            <button type="button" data-go="hero"><span>✨</span> Hero Headline, Identity & Impact Counters</button>
            <button type="button" data-go="about"><span>📖</span> About Chapter & 6 Focus Domains</button>
            <button type="button" data-go="caseStudy"><span>⭐</span> Featured Case Study</button>
            <button type="button" data-go="projects"><span>🚀</span> Signature Project Portfolio Cards</button>
            <button type="button" data-go="events"><span>📅</span> Activities & Events Stream</button>
            <button type="button" data-go="reports"><span>📜</span> Legacy Timeline Reports</button>
            <button type="button" data-go="team"><span>👥</span> Faculty Mentors & Team Leadership</button>
            <button type="button" data-go="join"><span>🎯</span> Recruitment Card & Background</button>
          </div>
        </section>
      </div>

      <div class="system-status-banner">
        <div class="system-status-left">
          <span class="status-icon">💡</span>
          <div>
            <strong>Instant Keyboard Save Shortcut</strong>
            <p>Press <code>Ctrl + S</code> (or <code>Cmd + S</code> on Mac) at any time to immediately publish all changes.</p>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-reset-all>Reset to Defaults</button>
      </div>
    `;

    area.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => setSection(btn.dataset.go));
    });
    const resetBtn = area.querySelector("[data-reset-all]");
    if (resetBtn) resetBtn.addEventListener("click", resetAll);
  }

  function renderHero() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Update the opening screen: headings, tagline, introduction copy, brand logos, hero photographs, captions, and floating metrics.") +
      editorCard("Hero Typography & Headings", "Highlighted text and slogans that greet visitors on first arrival.",
        field("fields.heroEyebrow", "College Eyebrow", "text", true, "e.g. Muffakham Jah College of Engineering & Technology") +
        field("fields.heroTitleMain", "Main Title", "text", false, "e.g. Engineers Without Borders") +
        field("fields.heroTitleAccent", "Accent Title", "text", false, "e.g. MJCET") +
        field("fields.heroLine", "Tagline / Slogan", "text", true, "Syncs across hero, intro overlay, and footer.") +
        field("fields.heroText", "Introduction Paragraph", "textarea", true, "Concise summary of chapter mission.")
      ) +
      editorCard("Hero Visual Identity & Photos", "Logos, action photographs, and video path for the intro reveal.",
        field("fields.brandLogo", "Navbar & Footer Official Logo", "image", false) +
        field("fields.heroLogo", "Identity Card Logo", "image", false) +
        field("fields.introLogo", "Intro Reveal Overlay Logo", "image", false) +
        field("fields.introVideo", "Intro Video Background Path", "text", false, "Path to MP4 clip (e.g. public/assets/video.mp4)") +
        field("fields.heroMainImage", "Main Action Photograph", "image", false) +
        field("fields.heroMainCaption", "Main Photo Caption", "text", false) +
        field("fields.heroSideImage", "Secondary Field Photograph", "image", false) +
        field("fields.heroSideCaption", "Secondary Photo Caption", "text", false)
      ) +
      editorCard("Floating Metric Badges & Location", "Interactive glass badges floating over the hero photographs.",
        field("fields.waterMetricValue", "Water Metric Value", "text", false, "e.g. RO") +
        field("fields.waterMetricLabel", "Water Metric Label", "text", false, "e.g. Clean water systems") +
        field("fields.learningMetricValue", "Education Metric Value", "text", false, "e.g. 28+") +
        field("fields.learningMetricLabel", "Education Metric Label", "text", false, "e.g. E-learning centers") +
        field("fields.locationLabel", "Location Tag", "text", false, "e.g. HYD / TELANGANA") +
        field("fields.locationTitle", "Location Title", "text", false, "e.g. Community engineering map")
      ) +
      editorCard("Impact Statistics Counter Bar", "The dark-emerald floating counter bar positioned directly beneath the hero section with 5 milestone statistics.",
        field("fields.impactStat1Number", "Statistic 1: Number (Sprout)", "text", false, "e.g. 20+") +
        field("fields.impactStat1Label", "Statistic 1: Label", "text", false, "e.g. Years of impact") +
        field("fields.impactStat2Number", "Statistic 2: Number (Student Members)", "text", false, "e.g. 100+") +
        field("fields.impactStat2Label", "Statistic 2: Label", "text", false, "e.g. Student members") +
        field("fields.impactStat3Number", "Statistic 3: Number (Activities & Projects)", "text", false, "e.g. 50+") +
        field("fields.impactStat3Label", "Statistic 3: Label", "text", false, "e.g. Activities & projects") +
        field("fields.impactStat4Number", "Statistic 4: Number (E-Learning Centers)", "text", false, "e.g. 28+") +
        field("fields.impactStat4Label", "Statistic 4: Label", "text", false, "e.g. E-learning centers") +
        field("fields.impactStat5Number", "Statistic 5: Number (Households Surveyed)", "text", false, "e.g. 500+") +
        field("fields.impactStat5Label", "Statistic 5: Label", "text", false, "e.g. Households surveyed")
      );
    bindEditorEvents();
  }

  function renderAbout() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Edit the chapter identity story, the three pillar cards, and the six rotating engineering focus domains.") +
      editorCard("About Section Headings", "The mission intro positioned right after the impact counters.",
        field("fields.aboutEyebrow", "Section Eyebrow", "text", false) +
        field("fields.aboutTitle", "Section Heading", "text", true) +
        field("fields.aboutText", "Mission Description", "textarea", true)
      ) +
      listEditor("About Pillar Cards", "Key value pillars presented as numbered glass cards.",
        "aboutCards",
        [
          { key: "title", label: "Card Title" },
          { key: "text", label: "Card Description", type: "textarea", full: true }
        ],
        { title: "New Pillar", text: "Describe this aspect of EWB MJCET." }
      ) +
      editorCard("Focus Domains Heading", "Section title above the moving engineering domains rail.",
        field("fields.focusEyebrow", "Section Eyebrow", "text", false) +
        field("fields.focusTitle", "Section Heading", "text", true)
      ) +
      listEditor("Engineering Focus Domains", "The icon, title, and technical scope of each focus area.",
        "focusAreas",
        [
          { key: "icon", label: "Domain Code / Icon (e.g. H2O, IT, CIV, SOL)" },
          { key: "title", label: "Domain Name" },
          { key: "text", label: "Scope & Activities Description", type: "textarea", full: true }
        ],
        { icon: "NEW", title: "New Domain", text: "Scope of community engineering work." }
      );
    bindEditorEvents();
  }

  function renderCaseStudy() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Configure the flagship Featured Case Study section (Erramanzil Government High School transformation).") +
      editorCard("Featured Case Study Details", "Highlight a comprehensive engineering intervention with photograph and story.",
        field("fields.caseTag", "Feature Tag", "text", false, "e.g. Featured Case Study") +
        field("fields.caseImage", "Case Study Site Photograph", "image", true) +
        field("fields.caseEyebrow", "Project Subtitle / Eyebrow", "text", true, "e.g. Erramanzil Government High School") +
        field("fields.caseTitle", "Main Headline", "text", true, "e.g. A flagship school infrastructure transformation.") +
        field("fields.caseText", "Detailed Narrative", "textarea", true, "Complete summary of problems solved and engineering deliverables.")
      );
    bindEditorEvents();
  }

  function renderProjects() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Manage the Signature Projects portfolio. Each card features an image, domain category tag, problem statement, engineering response, and measurable outcome.") +
      editorCard("Projects Section Header", "Introductory title and description for the portfolio grid.",
        field("fields.projectsEyebrow", "Section Eyebrow", "text", false) +
        field("fields.projectsTitle", "Section Heading", "text", true) +
        field("fields.projectsText", "Section Description", "textarea", true)
      ) +
      listEditor("Project Portfolio Cards", "Signature public community projects.",
        "projects",
        [
          { key: "title", label: "Project Title" },
          { key: "tag", label: "Category Tag (e.g. Infrastructure, Digital Education)" },
          { key: "image", label: "Project Photo", type: "image", full: true },
          { key: "problem", label: "Problem Found", type: "textarea", full: true },
          { key: "response", label: "Engineering Response", type: "textarea", full: true },
          { key: "outcome", label: "Measurable Outcome", type: "textarea", full: true }
        ],
        { title: "New Project", tag: "Innovation", image: "", problem: "Community gap identified.", response: "Engineered student solution.", outcome: "Tangible positive impact." }
      );
    bindEditorEvents();
  }

  function renderEvents() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Highlight recent initiatives, expert technical talks, plantation drives, and audits in the activity stream.") +
      editorCard("Events Section Header", "Introductory copy above the horizontal activity rail.",
        field("fields.eventsEyebrow", "Section Eyebrow", "text", false) +
        field("fields.eventsTitle", "Section Heading", "text", true)
      ) +
      listEditor("Activity Stream Cards", "Public event and activity cards.",
        "events",
        [
          { key: "title", label: "Event Title" },
          { key: "date", label: "Date / Month Year (e.g. Sept 2025)" },
          { key: "category", label: "Category (e.g. Clean Tech, Plantation, Audit)" },
          { key: "image", label: "Event Photograph", type: "image", full: true },
          { key: "text", label: "Event Description", type: "textarea", full: true }
        ],
        { title: "New Activity", date: "October 2026", category: "Community", image: "", text: "Overview of chapter participation and impact." }
      );
    bindEditorEvents();
  }

  function renderReports() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Manage the Documented Legacy Timeline. Each entry displays an academic year and verified project highlights.") +
      editorCard("Reports Section Header", "Introductory copy for the legacy timeline.",
        field("fields.reportsEyebrow", "Section Eyebrow", "text", false) +
        field("fields.reportsTitle", "Section Heading", "text", true) +
        field("fields.reportsText", "Section Narrative", "textarea", true)
      ) +
      listEditor("Legacy Timeline Reports", "Historical chapter milestones and verified annual reports.",
        "reports",
        [
          { key: "year", label: "Academic Year (e.g. 2025-26)" },
          { key: "text", label: "Milestone Summary", type: "textarea", full: true }
        ],
        { year: "2026-27", text: "New chapter milestones and sustainable field initiatives." }
      );
    bindEditorEvents();
  }

  function renderTeam() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Update faculty mentors, leadership coordinators, and the student cabinet.") +
      editorCard("Team Section Header", "Headings introducing the leadership body.",
        field("fields.teamEyebrow", "Section Eyebrow", "text", false) +
        field("fields.teamTitle", "Section Heading", "text", true)
      ) +
      listEditor("Team & Leadership Cards", "Mentors and student governing body cabinet.",
        "team",
        [
          { key: "role", label: "Designation / Role (e.g. Director, EWB India)" },
          { key: "name", label: "Full Name or Cabinet Title" },
          { key: "image", label: "Member Photo", type: "image", full: true },
          { key: "text", label: "Bio / Scope of Mentorship", type: "textarea", full: true },
          { key: "roles", label: "Roles List (comma-separated for cabinet pills)", help: "Only needed for cabinet cards." }
        ],
        { kind: "person", image: "", role: "Team Lead", name: "Student Engineer", text: "Role description.", roles: "" }
      );
    bindEditorEvents();
  }

  function renderJoin() {
    $("[data-editor-area]").innerHTML = 
      sectionIntro("Control the green recruitment card, including background photo, heading, text, and role recruitment chips.") +
      editorCard("Recruitment Banner Copy & Background", "Visual card encouraging students to join project teams.",
        field("fields.joinEyebrow", "Banner Eyebrow", "text", false) +
        field("fields.joinTitle", "Banner Headline", "text", true) +
        field("fields.joinText", "Banner Narrative", "textarea", true) +
        field("fields.joinBackground", "Background Photograph", "image", true, "Background photo overlaid with dark emerald gradient.")
      ) +
      listEditor("Available Role Chips", "Pill chips showing engineering and coordination disciplines.",
        "joinTracks",
        [
          { key: "value", label: "Role Track Name" }
        ],
        "New Discipline"
      );
    bindEditorEvents();
  }

  function normalizeSpecialValues(path, value) {
    if (path.startsWith("team.") && path.endsWith(".roles")) {
      return Array.isArray(value) ? value : String(value).split(",").map((r) => r.trim()).filter(Boolean);
    }
    return value;
  }

  function bindEditorEvents() {
    const area = $("[data-editor-area]");

    // Text & Textarea inputs
    area.querySelectorAll("[data-path]").forEach((input) => {
      input.addEventListener("input", () => {
        handleLiveInput(input.dataset.path, input.value);
        const preview = area.querySelector(`[data-preview="${input.dataset.path}"]`);
        if (preview) preview.src = assetUrl(input.value);
      });
    });

    // File uploads
    area.querySelectorAll("[data-upload]").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 1.5 * 1024 * 1024) {
          alert("This file is large (" + (file.size / 1024 / 1024).toFixed(1) + "MB). Browser storage works best with images under 1MB or file paths.");
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          handleLiveInput(input.dataset.upload, result);
          const pathInput = area.querySelector(`[data-path="${input.dataset.upload}"]`);
          const preview = area.querySelector(`[data-preview="${input.dataset.upload}"]`);
          if (pathInput) pathInput.value = result;
          if (preview) preview.src = result;
        };
        reader.readAsDataURL(file);
      });
    });

    // Clear Image Buttons
    area.querySelectorAll("[data-clear-image]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const path = btn.dataset.clearImage;
        handleLiveInput(path, "");
        const pathInput = area.querySelector(`[data-path="${path}"]`);
        const preview = area.querySelector(`[data-preview="${path}"]`);
        if (pathInput) pathInput.value = "";
        if (preview) preview.src = "";
      });
    });

    // Add Card Buttons
    area.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const arrayPath = btn.dataset.add;
        let target = getAt(arrayPath);
        if (!Array.isArray(target)) {
          setAt(arrayPath, []);
          target = getAt(arrayPath);
        }

        const templates = {
          aboutCards: { title: "New Pillar", text: "Describe this aspect of EWB MJCET." },
          focusAreas: { icon: "ENG", title: "New Domain", text: "Scope of community engineering work." },
          projects: { title: "New Project", tag: "Innovation", image: "", problem: "Problem identified.", response: "Engineered response.", outcome: "Measurable outcome." },
          events: { title: "New Activity", date: "October 2026", category: "Community", image: "", text: "Overview of chapter participation." },
          reports: { year: "2026-27", text: "New chapter milestones and sustainable field initiatives." },
          team: { kind: "person", image: "", role: "Team Lead", name: "Student Engineer", text: "Role description.", roles: "" },
          joinTracks: "New Discipline"
        };

        const newItem = templates[arrayPath] || {};
        target.push(newItem);
        handleLiveInput(arrayPath, target);
        renderSection();
        updateBadgeCounts();
        showToast(`+ Added new card to ${arrayPath}`);
      });
    });

    // Remove Card Buttons
    area.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const arrayPath = btn.dataset.remove;
        const index = Number(btn.dataset.index);
        const target = getAt(arrayPath);
        if (Array.isArray(target) && target[index] !== undefined) {
          target.splice(index, 1);
          handleLiveInput(arrayPath, target);
          renderSection();
          updateBadgeCounts();
          showToast(`Removed card from ${arrayPath}`);
        }
      });
    });
  }

  function renderSection() {
    const titles = {
      overview: ["Studio Dashboard", "Website Overview"],
      hero: ["Homepage", "Hero, Identity & Impact Counters"],
      about: ["Chapter Story", "About & Focus Domains"],
      caseStudy: ["Flagship Project", "Featured Case Study"],
      projects: ["Portfolio", "Signature Projects"],
      events: ["Activity Stream", "Events & Programs"],
      reports: ["Legacy Timeline", "Documented Reports"],
      team: ["People & Governance", "Team & Leadership"],
      join: ["Recruitment", "Recruitment Banner"]
    };

    const sectionMeta = titles[activeSection] || ["Studio", "Content Editor"];
    $("[data-admin-kicker]").textContent = sectionMeta[0];
    $("[data-admin-title]").textContent = sectionMeta[1];

    const renderers = {
      overview: renderOverview,
      hero: renderHero,
      about: renderAbout,
      caseStudy: renderCaseStudy,
      projects: renderProjects,
      events: renderEvents,
      reports: renderReports,
      team: renderTeam,
      join: renderJoin
    };

    if (renderers[activeSection]) {
      renderers[activeSection]();
    }

    // Append sticky bottom action bar for editor sections
    if (activeSection !== "overview") {
      $("[data-editor-area]").insertAdjacentHTML("beforeend", `
        <div class="section-save-bar">
          <div class="save-bar-info">
            <strong data-save-state-text>${isDirty ? "Unsaved changes ready to publish" : "All changes published live"}</strong>
            <span>Changes sync across open tabs automatically in real-time.</span>
          </div>
          <div class="save-bar-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-discard-section>Discard Unsaved</button>
            <button type="button" class="btn btn-primary" data-save-section ${isDirty ? "" : "disabled"}>
              ${isDirty ? "Save & Publish" : "Saved ✓"}
            </button>
          </div>
        </div>
      `);

      const saveBtn = $("[data-save-section]");
      if (saveBtn) saveBtn.addEventListener("click", save);

      const discardBtn = $("[data-discard-section]");
      if (discardBtn) {
        discardBtn.addEventListener("click", () => {
          content = window.EWBContent.read(base);
          updateSaveButtons(false);
          renderSection();
          showToast("Reverted unsaved edits back to saved state.");
        });
      }
    }

    updateBadgeCounts();
  }

  function setSection(section) {
    activeSection = section;
    document.querySelectorAll("[data-section]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === section);
    });
    renderSection();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Custom Gear Cursor Controller in Studio ── */
  function setupCursor() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const cursor = $(".custom-gear-cursor");
    if (!cursor) return;

    document.documentElement.classList.add("custom-cursor-active");
    window.addEventListener("pointermove", (e) => {
      cursor.classList.add("is-visible");
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      const aura = $(".cursor-aura");
      if (aura) {
        aura.style.setProperty("--x", `${e.clientX}px`);
        aura.style.setProperty("--y", `${e.clientY}px`);
      }
    });

    // Click Response: brief clockwise rotation (~300ms) matching main website
    let clickTimeout = null;
    let lastClickTime = 0;
    function handleClick(e) {
      if (e.button === 0) {
        const now = Date.now();
        if (now - lastClickTime < 30) return;
        lastClickTime = now;

        cursor.classList.remove("cursor--click");
        void cursor.offsetWidth; // Force reflow
        cursor.classList.add("cursor--click");

        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          cursor.classList.remove("cursor--click");
          clickTimeout = null;
        }, 300);
      }
    }

    window.addEventListener("pointerdown", handleClick);
    window.addEventListener("mousedown", handleClick);

    document.addEventListener("pointerover", (e) => {
      const isInteractive = Boolean(e.target.closest("button, a, input, textarea, label.upload-button, [role='button']"));
      cursor.classList.toggle("cursor--hover", isInteractive);
    });
  }

  /* ── Event Attachments & App Initialization ── */
  function init() {
    // 1. Login Authentication Handler (Firebase Auth with seamless fallback)
    const loginForm = $("[data-login-form]");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = new FormData(loginForm);
        const usernameInput = (data.get("username") || "").trim();
        const passwordInput = (data.get("password") || "").trim();
        const err = $("[data-login-error]");
        const submitBtn = loginForm.querySelector("button[type='submit']");
        const originalBtnText = submitBtn ? submitBtn.innerHTML : "Enter dashboard <span>→</span>";

        if (err) err.textContent = "";

        // Check if Firebase Auth is available
        if (typeof firebase !== "undefined" && firebase.auth) {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = "Authenticating... <span>⏳</span>";
          }

          // Map "admin" to "admin@ewbmjcet.org" if not an email
          const email = usernameInput.includes("@") ? usernameInput : `${usernameInput}@ewbmjcet.org`;

          try {
            if (firebase.auth.Auth && firebase.auth.Auth.Persistence) {
              await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
            }
            await firebase.auth().signInWithEmailAndPassword(email, passwordInput);
            sessionStorage.setItem(LOGIN_KEY, "1");
            showApp();
            showToast("Authenticated with Firebase");
            return;
          } catch (authError) {
            console.warn("[Admin Auth] Firebase login notice:", authError);
            // Fallback for demo credentials if network or auth error occurs
            if ((usernameInput === "admin" || email === "admin@ewbmjcet.org") &&
                (passwordInput === "ewb@mjcet2026" || passwordInput === "ewb@2026")) {
              sessionStorage.setItem(LOGIN_KEY, "1");
              showApp();
              showToast("Logged in via demo access");
              return;
            }
            if (err) {
              err.textContent = "Invalid username or password. Please try again.";
            }
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalBtnText;
            }
          }
        } else {
          // Local fallback without Firebase
          if (usernameInput === "admin" && (passwordInput === "ewb@mjcet2026" || passwordInput === "ewb@2026")) {
            sessionStorage.setItem(LOGIN_KEY, "1");
            showApp();
          } else {
            if (err) err.textContent = "Invalid username or password. Please try again.";
          }
        }
      });
    }

    // 1b. Show / Hide Password Toggle
    const passwordInput = document.getElementById("admin-password-input") || $("input[name='password']");
    const showPasswordCheckbox = document.getElementById("show-password-checkbox");
    const passwordToggleBtn = document.getElementById("password-toggle-btn");

    function setPasswordVisibility(visible) {
      if (!passwordInput) return;
      passwordInput.type = visible ? "text" : "password";
      if (showPasswordCheckbox) showPasswordCheckbox.checked = visible;
      if (passwordToggleBtn) {
        passwordToggleBtn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
        passwordToggleBtn.setAttribute("title", visible ? "Hide password" : "Show password");
        const eyeShow = passwordToggleBtn.querySelector(".eye-show");
        const eyeHide = passwordToggleBtn.querySelector(".eye-hide");
        if (eyeShow && eyeHide) {
          eyeShow.style.display = visible ? "none" : "block";
          eyeHide.style.display = visible ? "block" : "none";
        }
      }
    }

    if (showPasswordCheckbox) {
      showPasswordCheckbox.addEventListener("change", (e) => {
        setPasswordVisibility(e.target.checked);
      });
    }

    if (passwordToggleBtn) {
      passwordToggleBtn.addEventListener("click", () => {
        const isCurrentlyPassword = passwordInput && passwordInput.type === "password";
        setPasswordVisibility(isCurrentlyPassword);
      });
    }

    // 2. Sign Out Handler
    const signOutBtn = $("[data-sign-out]");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async () => {
        if (typeof firebase !== "undefined" && firebase.auth) {
          try {
            await firebase.auth().signOut();
          } catch (e) {}
        }
        sessionStorage.removeItem(LOGIN_KEY);
        location.reload();
      });
    }

    // 3. Navigation Switching
    document.querySelectorAll("[data-section]").forEach((btn) => {
      btn.addEventListener("click", () => setSection(btn.dataset.section));
    });

    // 4. Topbar Save Button
    const topbarSaveBtn = $("[data-save-topbar]");
    if (topbarSaveBtn) {
      topbarSaveBtn.addEventListener("click", save);
    }

    // 5. Auto-Sync Toggle (Defaulted to OFF)
    const autoSyncCheckbox = document.getElementById("auto-sync-toggle");
    if (autoSyncCheckbox) {
      autoSyncCheckbox.checked = false;
      autoSyncEnabled = false;
      autoSyncCheckbox.addEventListener("change", (e) => {
        autoSyncEnabled = e.target.checked;
        showToast(autoSyncEnabled ? "Real-time sync enabled" : "Real-time sync paused");
        updateSyncStatus(autoSyncEnabled ? "Live Synced" : "Manual Save Mode", autoSyncEnabled);
      });
    }

    // 6. Reset to Defaults Button
    const resetAllBtn = $("[data-reset-all]");
    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", resetAll);
    }

    // 7. Global Keyboard Shortcut (Ctrl+S / Cmd+S)
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    });

    // 8. Strict Single-Session Authentication Guard
    if (typeof firebase !== "undefined" && firebase.auth) {
      if (firebase.auth.Auth && firebase.auth.Auth.Persistence) {
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
      }
      firebase.auth().onAuthStateChanged((user) => {
        const hasActiveSession = sessionStorage.getItem(LOGIN_KEY) === "1";
        if (user && hasActiveSession) {
          showApp();
        } else if (hasActiveSession) {
          showApp();
        } else {
          // Strictly force sign-in for any new tab / session
          if (user) {
            firebase.auth().signOut().catch(() => {});
          }
          showLogin();
        }
      });
    } else if (sessionStorage.getItem(LOGIN_KEY) === "1") {
      showApp();
    } else {
      showLogin();
    }

    setupCursor();
  }

  function showApp() {
    const loginView = $("[data-login-view]");
    const appView = $("[data-admin-app]");
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;

    // Always ensure Real-time Sync is OFF by default when entering dashboard
    autoSyncEnabled = false;
    const autoSyncCheckbox = document.getElementById("auto-sync-toggle");
    if (autoSyncCheckbox) autoSyncCheckbox.checked = false;
    updateSyncStatus("Manual Save Mode", false);

    updateBadgeCounts();
    renderSection();
  }

  function showLogin() {
    sessionStorage.removeItem(LOGIN_KEY);
    const loginView = $("[data-login-view]");
    const appView = $("[data-admin-app]");
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
    updateBadgeCounts();
  }

  init();
})();
