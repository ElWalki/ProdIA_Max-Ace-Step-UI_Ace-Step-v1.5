/* ============================================================
   Side-Step — Theme Editor JS
   Standalone page at /theme-editor for creating & editing themes
   with live preview of all GUI components.
   ============================================================ */

const ThemeEditor = (() => {
  "use strict";

  // All editable token keys grouped by category
  const TOKEN_GROUPS = {
    "Surfaces": [
      { key: "--bg",       label: "Background" },
      { key: "--surface",  label: "Surface" },
      { key: "--panel",    label: "Panel" },
      { key: "--elevated", label: "Elevated" },
    ],
    "Borders": [
      { key: "--border",       label: "Border" },
      { key: "--border-focus", label: "Border focus" },
      { key: "--border-subtle", label: "Border subtle" },
    ],
    "Semantic Colors": [
      { key: "--primary",   label: "Primary" },
      { key: "--secondary", label: "Secondary" },
      { key: "--accent",    label: "Accent" },
      { key: "--changed",   label: "Changed" },
      { key: "--success",   label: "Success" },
      { key: "--warning",   label: "Warning" },
      { key: "--error",     label: "Error" },
    ],
    "Text": [
      { key: "--text",           label: "Text" },
      { key: "--text-bold",      label: "Text bold" },
      { key: "--muted",          label: "Muted" },
      { key: "--text-secondary", label: "Text secondary" },
    ],
    "Badges": [
      { key: "--badge-vram",    label: "VRAM badge" },
      { key: "--badge-quality", label: "Quality badge" },
      { key: "--badge-speed",   label: "Speed badge" },
      { key: "--badge-neutral", label: "Neutral badge" },
    ],
  };

  // RGB color keys that need component vars for CRT
  const _RGB_COLORS = [
    "--primary", "--secondary", "--accent", "--success",
    "--warning", "--error", "--changed"
  ];

  let _tokens = {};
  let _themeName = "My Theme";
  let _themeAuthor = "";
  let _backgroundImage = null;
  let _previewEl = null;

  const _authHeaders = window._authHeaders || (() => {
    const t = new URLSearchParams(window.location.search).get("token") ||
      (typeof window.__SIDESTEP_TOKEN__ !== "undefined" ? window.__SIDESTEP_TOKEN__ : "") || "";
    return t ? { Authorization: "Bearer " + t } : {};
  });

  function _hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** Apply current tokens to the preview frame element. */
  function _applyToPreview() {
    if (!_previewEl) return;
    for (const [k, v] of Object.entries(_tokens)) {
      _previewEl.style.setProperty(k, v);
    }
    // Set RGB component vars
    for (const key of _RGB_COLORS) {
      if (_tokens[key]) {
        const { r, g, b } = _hexToRgb(_tokens[key]);
        _previewEl.style.setProperty(key + "-r", String(r));
        _previewEl.style.setProperty(key + "-g", String(g));
        _previewEl.style.setProperty(key + "-b", String(b));
      }
    }
    // Derived vars
    if (_tokens["--primary"]) {
      const { r, g, b } = _hexToRgb(_tokens["--primary"]);
      _previewEl.style.setProperty("--primary-dim", `rgba(${r}, ${g}, ${b}, 0.10)`);
      _previewEl.style.setProperty("--primary-glow", `rgba(${r}, ${g}, ${b}, 0.25)`);
    }
    // Background image
    if (_backgroundImage) {
      _previewEl.style.backgroundImage = `url('${_backgroundImage}')`;
      _previewEl.style.backgroundSize = "cover";
      _previewEl.style.backgroundPosition = "center";
    } else {
      _previewEl.style.backgroundImage = "";
      _previewEl.style.backgroundSize = "";
      _previewEl.style.backgroundPosition = "";
    }
  }

  /** Update a single token and refresh the preview. */
  function _setToken(key, value) {
    _tokens[key] = value;
    _applyToPreview();
  }

  /** Build the editor controls in the left panel. */
  function _buildEditor() {
    const editor = document.getElementById("te-editor");
    if (!editor) return;

    // Theme metadata
    let html = `
      <div class="te-section">
        <div class="te-section__title">Theme Info</div>
        <div class="te-input-group">
          <label>Name</label>
          <input class="te-input" id="te-name" type="text" value="${_esc(_themeName)}" placeholder="My Theme">
        </div>
        <div class="te-input-group">
          <label>Author</label>
          <input class="te-input" id="te-author" type="text" value="${_esc(_themeAuthor)}" placeholder="Your name">
        </div>
        <div class="te-input-group">
          <label>Background Image URL (optional)</label>
          <input class="te-input" id="te-bg-image" type="text" value="${_esc(_backgroundImage || "")}" placeholder="https://... or leave empty">
        </div>
      </div>
      <div class="te-section">
        <div class="te-section__title">Load Existing</div>
        <div class="te-load-row">
          <select id="te-load-select"></select>
          <button class="te-btn" id="te-load-btn">[load]</button>
        </div>
      </div>
    `;

    // Color token groups
    for (const [group, fields] of Object.entries(TOKEN_GROUPS)) {
      html += `<div class="te-section"><div class="te-section__title">${group}</div>`;
      for (const { key, label } of fields) {
        const val = _tokens[key] || "#000000";
        html += `
          <div class="te-field">
            <span class="te-field__label">${label}</span>
            <input class="te-field__color" type="color" data-key="${key}" value="${val}">
            <input class="te-field__hex" type="text" data-key="${key}" value="${val}" maxlength="7">
          </div>`;
      }
      html += `</div>`;
    }

    editor.innerHTML = html;

    // Wire up events
    editor.querySelectorAll(".te-field__color").forEach(el => {
      el.addEventListener("input", (e) => {
        const key = e.target.dataset.key;
        const val = e.target.value;
        _setToken(key, val);
        const hex = editor.querySelector(`.te-field__hex[data-key="${key}"]`);
        if (hex) hex.value = val;
      });
    });

    editor.querySelectorAll(".te-field__hex").forEach(el => {
      el.addEventListener("input", (e) => {
        const key = e.target.dataset.key;
        let val = e.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          _setToken(key, val);
          const color = editor.querySelector(`.te-field__color[data-key="${key}"]`);
          if (color) color.value = val;
        }
      });
    });

    document.getElementById("te-name")?.addEventListener("input", (e) => {
      _themeName = e.target.value;
    });
    document.getElementById("te-author")?.addEventListener("input", (e) => {
      _themeAuthor = e.target.value;
    });
    document.getElementById("te-bg-image")?.addEventListener("input", (e) => {
      _backgroundImage = e.target.value || null;
      _applyToPreview();
    });

    // Load existing theme
    _populateLoadSelect();
    document.getElementById("te-load-btn")?.addEventListener("click", _loadSelected);
  }

  function _esc(str) {
    return (str || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  /** Populate the load-existing dropdown. */
  async function _populateLoadSelect() {
    const sel = document.getElementById("te-load-select");
    if (!sel) return;
    try {
      const res = await fetch("/api/themes", { headers: _authHeaders() });
      if (!res.ok) return;
      const themes = await res.json();
      sel.innerHTML = "";
      for (const t of themes) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name + (t.source === "user" ? " [user]" : "");
        sel.appendChild(opt);
      }
    } catch (e) {
      console.warn("[TE] Failed to list themes:", e);
    }
  }

  /** Load a theme by ID and populate the editor. */
  async function _loadSelected() {
    const sel = document.getElementById("te-load-select");
    if (!sel || !sel.value) return;
    try {
      const res = await fetch(`/api/themes/${encodeURIComponent(sel.value)}`, {
        headers: _authHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      _themeName = data.name || sel.value;
      _themeAuthor = data.author || "";
      _backgroundImage = data.backgroundImage || null;
      _tokens = Object.assign({}, data.tokens || {});
      _buildEditor();
      _applyToPreview();
      _setStatus("Loaded: " + _themeName);
    } catch (e) {
      console.warn("[TE] Failed to load theme:", e);
    }
  }

  /** Generate a safe filename from theme name. */
  function _toSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "custom";
  }

  /** Save the current theme to the backend. */
  async function _save() {
    const slug = _toSlug(_themeName);
    const body = {
      name: _themeName,
      author: _themeAuthor,
      version: 1,
      tokens: _tokens,
      backgroundImage: _backgroundImage,
    };
    try {
      const res = await fetch(`/api/themes/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders()),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        _setStatus("Saved as: " + slug + ".json");
        _populateLoadSelect();
      } else {
        _setStatus("Save failed: " + res.status);
      }
    } catch (e) {
      _setStatus("Save error: " + e.message);
    }
  }

  /** Export current theme as a downloadable JSON file. */
  function _export() {
    const data = {
      name: _themeName,
      author: _themeAuthor,
      version: 1,
      tokens: _tokens,
      backgroundImage: _backgroundImage,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = _toSlug(_themeName) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    _setStatus("Exported: " + a.download);
  }

  /** Import a theme from a JSON file. */
  function _import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        _themeName = data.name || file.name.replace(".json", "");
        _themeAuthor = data.author || "";
        _backgroundImage = data.backgroundImage || null;
        _tokens = Object.assign({}, data.tokens || {});
        _buildEditor();
        _applyToPreview();
        _setStatus("Imported: " + _themeName);
      } catch (e) {
        _setStatus("Import failed: " + e.message);
      }
    });
    input.click();
  }

  function _setStatus(msg) {
    const el = document.getElementById("te-status");
    if (el) el.textContent = msg;
  }

  /** Load default tokens from the CSS so editor starts with current values. */
  function _loadDefaults() {
    const cs = getComputedStyle(document.documentElement);
    for (const fields of Object.values(TOKEN_GROUPS)) {
      for (const { key } of fields) {
        const val = cs.getPropertyValue(key).trim();
        if (val) _tokens[key] = val;
      }
    }
  }

  function init() {
    _previewEl = document.getElementById("te-preview-frame");
    _loadDefaults();
    _buildEditor();
    _applyToPreview();

    // Wire top-bar buttons
    document.getElementById("te-btn-save")?.addEventListener("click", _save);
    document.getElementById("te-btn-export")?.addEventListener("click", _export);
    document.getElementById("te-btn-import")?.addEventListener("click", _import);

    _setStatus("Ready. Edit colors and see changes live.");
  }

  document.addEventListener("DOMContentLoaded", init);

  return { init };
})();
