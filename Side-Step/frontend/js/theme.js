/* ============================================================
   Side-Step GUI — Theme System

   Loads user-selectable themes (JSON files with CSS variable
   overrides) and applies them to :root at runtime.

   Themes are stored as JSON in assets/themes/ (built-in) and
   .sidestep/themes/ (user-created).

   Usage:
     await Theme.init();             // call once at boot (after UiPrefs.load())
     await Theme.apply("amber_terminal");  // switch theme
     Theme.reset();                  // revert to CSS defaults
     Theme.list();                   // fetch available theme names
     Theme.current();                // name of active theme
   ============================================================ */

const Theme = (() => {
  "use strict";

  let _currentName = "default";
  let _currentTokens = {};
  const _RGB_COLORS = [
    "--primary", "--secondary", "--accent", "--success",
    "--warning", "--error", "--changed"
  ];

  const _authHeaders = window._authHeaders || (() => ({}));

  /** Parse a hex color (#rrggbb or #rgb) into {r, g, b} 0-255. */
  function _hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** Set --key-r, --key-g, --key-b component variables for a color. */
  function _setRgbComponents(key, hex) {
    const { r, g, b } = _hexToRgb(hex);
    const el = document.documentElement;
    el.style.setProperty(key + "-r", String(r));
    el.style.setProperty(key + "-g", String(g));
    el.style.setProperty(key + "-b", String(b));
  }

  /** Recompute --primary-dim and --primary-glow from the current --primary. */
  function _updateDerivedVars(tokens) {
    const primary = tokens["--primary"];
    if (primary) {
      const { r, g, b } = _hexToRgb(primary);
      document.documentElement.style.setProperty(
        "--primary-dim", `rgba(${r}, ${g}, ${b}, 0.10)`
      );
      document.documentElement.style.setProperty(
        "--primary-glow", `rgba(${r}, ${g}, ${b}, 0.25)`
      );
    }
  }

  /** Apply a tokens object to :root. */
  function _applyTokens(tokens) {
    const el = document.documentElement;
    for (const [k, v] of Object.entries(tokens)) {
      el.style.setProperty(k, v);
    }
    // Set RGB component vars for CRT bloom
    for (const key of _RGB_COLORS) {
      if (tokens[key]) _setRgbComponents(key, tokens[key]);
    }
    _updateDerivedVars(tokens);
  }

  /** Apply background image (or clear it). */
  function _applyBgImage(url) {
    const el = document.documentElement;
    if (url) {
      el.style.setProperty("--bg-image", `url('${url}')`);
      document.body.style.backgroundImage = `var(--bg-image)`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      el.style.removeProperty("--bg-image");
      document.body.style.backgroundImage = "";
      document.body.style.backgroundSize = "";
      document.body.style.backgroundPosition = "";
      document.body.style.backgroundAttachment = "";
    }
  }

  /** Remove all inline style overrides from :root. */
  function reset() {
    const el = document.documentElement;
    // Remove all token overrides
    for (const k of Object.keys(_currentTokens)) {
      el.style.removeProperty(k);
    }
    // Remove RGB component vars
    for (const key of _RGB_COLORS) {
      el.style.removeProperty(key + "-r");
      el.style.removeProperty(key + "-g");
      el.style.removeProperty(key + "-b");
    }
    el.style.removeProperty("--primary-dim");
    el.style.removeProperty("--primary-glow");
    _applyBgImage(null);
    _currentTokens = {};
    _currentName = "default";
  }

  /** Fetch and apply a theme by name. */
  async function apply(name) {
    if (!name || name === "default") {
      reset();
      _currentName = "default";
      if (typeof UiPrefs !== "undefined") UiPrefs.set("theme", "default");
      return;
    }
    try {
      const res = await fetch(`/api/themes/${encodeURIComponent(name)}`, {
        headers: _authHeaders()
      });
      if (!res.ok) {
        console.warn(`[Theme] failed to load theme "${name}":`, res.status);
        return;
      }
      const data = await res.json();
      reset();
      _currentName = name;
      _currentTokens = data.tokens || {};
      _applyTokens(_currentTokens);
      _applyBgImage(data.backgroundImage || null);
      if (typeof UiPrefs !== "undefined") UiPrefs.set("theme", name);
    } catch (e) {
      console.warn("[Theme] apply error:", e);
    }
  }

  /** Fetch the list of available theme names + display names. */
  async function list() {
    try {
      const res = await fetch("/api/themes", { headers: _authHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("[Theme] list error:", e);
    }
    return [];
  }

  /** Return the name of the currently active theme. */
  function current() {
    return _currentName;
  }

  /** Populate the theme <select> dropdown in Settings. */
  async function _populateDropdown() {
    const sel = document.getElementById("theme-select");
    if (!sel) return;
    const themes = await list();
    sel.innerHTML = "";
    for (const t of themes) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name + (t.source === "user" ? " [user]" : "");
      if (t.id === _currentName) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      apply(sel.value);
    });

    // Wire up [edit] button to open theme editor with auth token
    const editBtn = document.getElementById("btn-open-theme-editor");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const tok = new URLSearchParams(window.location.search).get("token") ||
          (typeof window.__SIDESTEP_TOKEN__ !== "undefined" ? window.__SIDESTEP_TOKEN__ : "");
        const url = tok ? `/theme-editor?token=${encodeURIComponent(tok)}` : "/theme-editor";
        window.open(url, "_blank");
      });
    }
  }

  /** Initialize: load saved preference and apply. */
  async function init() {
    const saved = (typeof UiPrefs !== "undefined") ? UiPrefs.get("theme") : null;
    if (saved && saved !== "default") {
      await apply(saved);
    } else {
      // Even for default, set RGB component vars from the CSS defaults
      const cs = getComputedStyle(document.documentElement);
      for (const key of _RGB_COLORS) {
        const val = cs.getPropertyValue(key).trim();
        if (val) _setRgbComponents(key, val);
      }
      _updateDerivedVars({
        "--primary": cs.getPropertyValue("--primary").trim()
      });
    }
    // Populate dropdown after theme is applied (deferred so DOM is ready)
    requestAnimationFrame(() => _populateDropdown());
  }

  return { init, apply, reset, list, current };
})();
