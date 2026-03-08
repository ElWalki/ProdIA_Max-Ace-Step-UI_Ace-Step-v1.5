/* ============================================================
   Side-Step GUI — Custom Select Dropdowns
   Wraps native <select class="select"> with a styled overlay.
   The real <select> stays in the DOM for form data; this adds
   a visual presentation layer on top.
   ============================================================ */

const CustomSelect = (() => {
  "use strict";

  let _activeDropdown = null;

  function _close() {
    if (!_activeDropdown) return;
    const { overlay, wrapper } = _activeDropdown;
    overlay.classList.add("cs-closing");
    wrapper.classList.remove("cs-open");
    setTimeout(() => { overlay.remove(); }, 150);
    _activeDropdown = null;
  }

  function _open(wrapper, sel) {
    if (_activeDropdown) _close();

    const overlay = document.createElement("div");
    overlay.className = "cs-dropdown";
    const options = [...sel.options];
    if (!options.length) { overlay.innerHTML = '<div class="cs-empty">No options</div>'; }
    else {
      options.forEach((opt, i) => {
        const item = document.createElement("div");
        item.className = "cs-option" + (i === sel.selectedIndex ? " cs-selected" : "");
        if (opt.disabled) item.classList.add("cs-disabled");
        item.textContent = opt.textContent;
        item.dataset.value = opt.value;
        item.dataset.idx = i;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          if (opt.disabled) return;
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          _syncLabel(wrapper, sel);
          _close();
        });
        overlay.appendChild(item);
      });
    }

    const rect = wrapper.getBoundingClientRect();
    overlay.style.top = (rect.bottom + 2) + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.maxHeight = Math.min(280, window.innerHeight - rect.bottom - 16) + "px";
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      const selected = overlay.querySelector(".cs-selected");
      if (selected) selected.scrollIntoView({ block: "nearest" });
    });

    wrapper.classList.add("cs-open");
    _activeDropdown = { overlay, wrapper, sel };
  }

  function _syncLabel(wrapper, sel) {
    const label = wrapper.querySelector(".cs-label");
    if (!label) return;
    const opt = sel.options[sel.selectedIndex];
    label.textContent = opt ? opt.textContent : "";
  }

  function _wrap(sel) {
    if (sel.dataset.csWrapped) return;
    sel.dataset.csWrapped = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "cs-wrapper";

    const face = document.createElement("div");
    face.className = "cs-face";

    const label = document.createElement("span");
    label.className = "cs-label";
    const opt = sel.options[sel.selectedIndex];
    label.textContent = opt ? opt.textContent : "";

    const arrow = document.createElement("span");
    arrow.className = "cs-arrow";
    arrow.textContent = "\u25BE";

    face.appendChild(label);
    face.appendChild(arrow);

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    wrapper.appendChild(face);

    face.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_activeDropdown && _activeDropdown.wrapper === wrapper) { _close(); return; }
      _open(wrapper, sel);
    });

    sel.addEventListener("change", () => _syncLabel(wrapper, sel));

    const obs = new MutationObserver(() => _syncLabel(wrapper, sel));
    obs.observe(sel, { childList: true, subtree: true, attributes: true });
  }

  function init() {
    document.querySelectorAll("select.select").forEach(_wrap);

    document.addEventListener("click", (e) => {
      if (_activeDropdown && !e.target.closest(".cs-dropdown") && !e.target.closest(".cs-face")) {
        _close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _activeDropdown) _close();
    });
  }

  function refresh() {
    document.querySelectorAll("select.select").forEach((sel) => {
      if (sel.dataset.csWrapped) {
        const wrapper = sel.closest(".cs-wrapper");
        if (wrapper) _syncLabel(wrapper, sel);
      } else {
        _wrap(sel);
      }
    });
  }

  return { init, refresh };
})();
