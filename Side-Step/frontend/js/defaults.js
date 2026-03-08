/* Side-Step GUI — Centralized Defaults Loader
   Reads defaults.json (later: /api/defaults) and applies to all form fields. */

const Defaults = (() => {
  'use strict';
  let _data = {};

  async function load() {
    try {
      // Prefer server-authoritative defaults (single source of truth)
      const _ac = new AbortController();
      const _t = setTimeout(() => _ac.abort(), 3000);
      const apiResp = await fetch('/api/defaults', { signal: _ac.signal }).finally(() => clearTimeout(_t));
      if (apiResp.ok) {
        const apiData = await apiResp.json();
        Object.keys(_data).forEach(k => delete _data[k]);
        Object.keys(apiData).forEach(k => { _data[k] = apiData[k]; });
        return;
      }
    } catch (_) { /* API unavailable — fall through to static file */ }
    try {
      const resp = await fetch('js/defaults.json');
      const raw = await resp.json();
      // Strip _comment keys
      Object.keys(_data).forEach(k => delete _data[k]);
      Object.keys(raw).forEach(k => { if (!k.startsWith('_')) _data[k] = raw[k]; });
    } catch (e) { console.warn('[Defaults] Could not load defaults.json:', e); }
  }

  function get(id) {
    return _data[id] !== undefined ? String(_data[id]) : undefined;
  }

  function apply() {
    const changed = [];
    Object.entries(_data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const strVal = String(val);
      if (el.type === 'checkbox') {
        const want = val === true;
        if (el.checked !== want) { el.checked = want; changed.push(el); }
        el.dataset.default = String(want);
      } else if (el.tagName === 'SELECT') {
        const opt = [...el.options].find(o => o.value === strVal);
        if (opt && el.value !== strVal) { el.value = strVal; changed.push(el); }
        el.dataset.default = strVal;
      } else {
        if (el.value !== strVal) { el.value = strVal; changed.push(el); }
        el.dataset.default = strVal;
      }
    });
    // Fire change events so reactivity, custom selects, and visibility handlers update
    changed.forEach(el => {
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    });
    // Sync custom select labels if available
    if (typeof CustomSelect !== 'undefined' && CustomSelect.refresh) {
      try { CustomSelect.refresh(); } catch (_) {}
    }
  }

  return { load, get, apply };
})();
