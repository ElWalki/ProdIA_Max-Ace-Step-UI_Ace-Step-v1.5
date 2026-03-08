/* ============================================================
   Side-Step GUI — UI Preferences (port-independent persistence)

   Stores UI state (CRT, tutorial, welcome, keybinds) on the backend
   so it survives across launches even when the server port changes
   (localStorage is origin-scoped and gets wiped on port change).

   Usage:
     await UiPrefs.load();          // call once at boot, before module inits
     UiPrefs.get("key")             // read a value  (sync, from cache)
     UiPrefs.set("key", value)      // write a value (sync cache + async POST)
     UiPrefs.remove("key")          // delete a key
   ============================================================ */

const UiPrefs = (() => {
  let _cache = {};
  let _loaded = false;
  let _saveTimer = null;
  const DEBOUNCE_MS = 400;

  const _authHeaders = window._authHeaders || (() => ({}));

  async function load() {
    if (_loaded) return;
    try {
      const res = await fetch("/api/ui-prefs", { headers: _authHeaders() });
      if (res.ok) _cache = await res.json();
    } catch (e) {
      console.warn("[UiPrefs] load failed, using empty cache:", e);
    }
    _loaded = true;
  }

  function get(key) {
    return _cache[key] !== undefined ? _cache[key] : null;
  }

  function set(key, value) {
    _cache[key] = value;
    _scheduleSave();
  }

  function remove(key) {
    delete _cache[key];
    _scheduleSave();
  }

  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flush, DEBOUNCE_MS);
  }

  async function _flush() {
    _saveTimer = null;
    try {
      await fetch("/api/ui-prefs", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders()),
        body: JSON.stringify({ data: _cache }),
      });
    } catch (e) {
      console.warn("[UiPrefs] save failed:", e);
    }
  }

  return { load, get, set, remove };
})();
