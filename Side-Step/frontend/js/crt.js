/* ============================================================
   Side-Step GUI — CRT Shader (WebGL Overlay)

   WebGL fullscreen quad renders ALL CRT overlay effects in one
   draw call: coarse scanlines, aperture grille, film grain,
   occasional moiré interference, VHS horizontal jitter,
   vignette, corner shadows, warm phosphor tint.

   CSS handles curvature (border-radius), phosphor glow
   (text-shadow / box-shadow), depth shadow, chromatic
   aberration. No SVG filters — they cause click-through
   bugs in Electron and smear text.

   Techniques from RetroArch CRT shaders (ShaderGlass repo):
   Lottes, zfast_crt, Guest HD, Godot VHS+CRT.

   Easter egg: type "sidestepold" while no input is focused.
   Settings: toggle + strength slider in Visual section.
   ============================================================ */

const CRT = (() => {
  "use strict";

  const VERT_SRC = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG_SRC = `
    precision mediump float;

    uniform vec2  u_res;
    uniform float u_strength;
    uniform float u_time;

    // --- Pseudo-random hash (no texture needed) ---
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      float s = u_strength;
      vec2 uv = gl_FragCoord.xy / u_res;
      vec2 cuv = uv * 2.0 - 1.0;
      float t = u_time;

      // --- Coarse scanlines (2px period, scrolling) ---
      float scanY = gl_FragCoord.y + t * 18.0;
      float scanPhase = mod(scanY, 2.0);
      float scanline = smoothstep(0.0, 0.6, scanPhase) *
                        (1.0 - smoothstep(1.4, 2.0, scanPhase));
      scanline = 1.0 - scanline * 0.35 * s;

      // --- Aperture grille (Lottes Trinitron, 3px RGB columns) ---
      float gx = mod(gl_FragCoord.x, 3.0);
      vec3 grille = vec3(
        smoothstep(0.0, 0.8, 1.0 - abs(gx - 0.5)),
        smoothstep(0.0, 0.8, 1.0 - abs(gx - 1.5)),
        smoothstep(0.0, 0.8, 1.0 - abs(gx - 2.5))
      );

      // --- Film grain (coarse 4x4 pixel blocks, temporal) ---
      vec2 grainCoord = floor(gl_FragCoord.xy / 4.0);
      float grain = hash(grainCoord + fract(t * 7.13) * 100.0);
      grain = (grain - 0.5) * 0.14 * s;

      // --- VHS horizontal jitter (subtle per-scanline offset) ---
      float jitterSeed = hash(vec2(floor(gl_FragCoord.y * 0.5), floor(t * 30.0)));
      float jitter = (jitterSeed - 0.5) * 0.4 * s;

      // --- Moiré interference (rare, wave-like) ---
      float moirePhase = sin(t * 0.3) * 0.5 + 0.5;
      float moireGate = smoothstep(0.92, 0.96, moirePhase);
      float moire = 0.0;
      if (moireGate > 0.0) {
        float my = gl_FragCoord.y + t * 80.0;
        float mx = gl_FragCoord.x + jitter * 2.0;
        moire = sin(my * 0.08 + mx * 0.03) * sin(my * 0.13) * 0.12 * s * moireGate;
      }

      // --- Vignette (smooth radial falloff) ---
      float vdist = length(cuv * vec2(1.05, 0.95));
      float vig = smoothstep(0.45, 1.15, vdist);

      // --- Edge chromatic aberration (RGB channel split along radial axis) ---
      float edgeDist = length(cuv);
      float chromaAmt = smoothstep(0.35, 1.0, edgeDist) * 0.012 * s;
      vec2 radialDir = cuv / (edgeDist + 0.0001);
      vec2 rUV = uv + radialDir * chromaAmt;
      vec2 bUV = uv - radialDir * chromaAmt;
      float rChan = smoothstep(0.0, 0.01, rUV.x) * smoothstep(0.0, 0.01, rUV.y)
                  * smoothstep(0.0, 0.01, 1.0 - rUV.x) * smoothstep(0.0, 0.01, 1.0 - rUV.y);
      float bChan = smoothstep(0.0, 0.01, bUV.x) * smoothstep(0.0, 0.01, bUV.y)
                  * smoothstep(0.0, 0.01, 1.0 - bUV.x) * smoothstep(0.0, 0.01, 1.0 - bUV.y);
      vec3 chromaFringe = vec3(
        chromaAmt * 6.0 * (1.0 - rChan),
        0.0,
        chromaAmt * 6.0 * (1.0 - bChan)
      );

      // --- Corner shadows (zfast_crt CORNER) ---
      vec2 ac = abs(cuv);
      float corner = smoothstep(0.78, 1.02, max(ac.x * 1.05, ac.y));

      // --- Subtle screen flicker ---
      float flicker = 1.0 - 0.008 * s * sin(t * 8.7 + sin(t * 3.1) * 2.0);

      // --- Warm phosphor tint ---
      vec3 warmth = vec3(1.0, 0.92, 0.78);

      // --- Combine ---
      float darkScan = scanline * flicker;
      float darkVig  = 1.0 - vig * 0.5 * s;
      float darkCorn = 1.0 - corner * 0.4 * s;
      float totalDark = 1.0 - darkScan * darkVig * darkCorn;
      totalDark += grain + moire;

      float grilleAmt = 0.06 * s;
      float warmAmt   = 0.03 * s;
      vec3 tintColor = grille * grilleAmt + warmth * warmAmt;

      tintColor += chromaFringe;

      float alpha = clamp(totalDark + (grilleAmt + warmAmt) * 0.5, 0.0, 0.85);
      vec3 color = tintColor / max(alpha, 0.001);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  // ---- State ----

  let _bannerClicks = 0;
  let _bannerTimer = 0;
  const CLICK_THRESHOLD = 3;
  const CLICK_WINDOW = 1500;

  let _discovered = false;
  let _active = false;
  let _strength = 0.70;

  let _canvas = null;
  let _gl = null;
  let _program = null;
  let _uRes = null;
  let _uStrength = null;
  let _uTime = null;
  let _startTime = 0;
  let _raf = 0;

  // ---- Storage (backend-persisted via UiPrefs) ----

  function _load() {
    if (typeof UiPrefs === "undefined") return;
    const d = UiPrefs.get("crt_discovered");
    const a = UiPrefs.get("crt_active");
    const s = UiPrefs.get("crt_strength");
    if (d === true || d === "1") _discovered = true;
    if (a === true || a === "1") _active = true;
    if (s !== null && s !== undefined) _strength = parseFloat(s) || 0.70;
  }

  function _save() {
    if (typeof UiPrefs === "undefined") return;
    UiPrefs.set("crt_discovered", _discovered);
    UiPrefs.set("crt_active", _active);
    UiPrefs.set("crt_strength", _strength);
  }

  // ---- WebGL setup ----

  function _compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("[CRT] shader compile:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function _initGL() {
    _canvas = document.getElementById("crt-canvas");
    if (!_canvas) return false;

    _gl = _canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!_gl) {
      console.warn("[CRT] WebGL not available");
      return false;
    }

    const vs = _compileShader(_gl, _gl.VERTEX_SHADER, VERT_SRC);
    const fs = _compileShader(_gl, _gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;

    _program = _gl.createProgram();
    _gl.attachShader(_program, vs);
    _gl.attachShader(_program, fs);
    _gl.linkProgram(_program);
    if (!_gl.getProgramParameter(_program, _gl.LINK_STATUS)) {
      console.error("[CRT] link:", _gl.getProgramInfoLog(_program));
      return false;
    }

    _gl.useProgram(_program);
    _uRes = _gl.getUniformLocation(_program, "u_res");
    _uStrength = _gl.getUniformLocation(_program, "u_strength");
    _uTime = _gl.getUniformLocation(_program, "u_time");

    const aPos = _gl.getAttribLocation(_program, "a_pos");
    const buf = _gl.createBuffer();
    _gl.bindBuffer(_gl.ARRAY_BUFFER, buf);
    _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), _gl.STATIC_DRAW);
    _gl.enableVertexAttribArray(aPos);
    _gl.vertexAttribPointer(aPos, 2, _gl.FLOAT, false, 0, 0);

    _gl.enable(_gl.BLEND);
    _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA);

    _startTime = performance.now() / 1000;
    return true;
  }

  function _resize() {
    if (!_canvas || !_gl) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(_canvas.clientWidth * dpr);
    const h = Math.round(_canvas.clientHeight * dpr);
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width = w;
      _canvas.height = h;
    }
  }

  // ---- Render loop ----

  function _frame() {
    if (!_active || _strength <= 0 || !_gl) {
      _raf = 0;
      return;
    }
    _resize();
    _gl.viewport(0, 0, _canvas.width, _canvas.height);
    _gl.uniform2f(_uRes, _canvas.width, _canvas.height);
    _gl.uniform1f(_uStrength, _strength);
    _gl.uniform1f(_uTime, performance.now() / 1000 - _startTime);
    _gl.clear(_gl.COLOR_BUFFER_BIT);
    _gl.drawArrays(_gl.TRIANGLES, 0, 6);
    _raf = requestAnimationFrame(_frame);
  }

  function _startLoop() {
    if (_raf) return;
    _raf = requestAnimationFrame(_frame);
  }

  function _stopLoop() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
    if (_gl) _gl.clear(_gl.COLOR_BUFFER_BIT);
  }

  // ---- Apply state ----

  function _applyCurvature() {
    const ws = document.querySelector(".workspace");
    if (!ws) return;
    if (_active && _strength > 0) {
      ws.style.borderRadius = Math.round(10 * _strength) + "px";
      ws.style.overflow = "hidden";
    } else {
      ws.style.borderRadius = "";
      ws.style.overflow = "";
    }
  }

  function _updateSettingsVisibility() {
    const hdr = document.getElementById("settings-visual-section");
    const body = document.getElementById("settings-visual-body");
    // Always show Visual section (theme picker is always available)
    // CRT controls within it are visible but only functional if discovered
    if (hdr) hdr.style.display = "";
    if (body) body.style.display = "";
    // Hide CRT-specific controls if not discovered
    const crtToggle = document.getElementById("crt-toggle");
    const crtStrength = document.getElementById("crt-strength");
    if (crtToggle) crtToggle.closest(".form-group").style.display = _discovered ? "" : "none";
    if (crtStrength) crtStrength.closest(".form-group").style.display = _discovered ? "" : "none";
  }

  function _apply() {
    const html = document.documentElement;
    const ws = document.querySelector(".workspace");
    if (_active && _strength > 0) {
      html.classList.add("crt-active");
      if (ws) ws.style.filter = "";
      _startLoop();
    } else {
      html.classList.remove("crt-active");
      if (ws) ws.style.filter = "";
      _stopLoop();
    }
    _applyCurvature();
    _updateSettingsVisibility();

    const toggle = document.getElementById("crt-toggle");
    const slider = document.getElementById("crt-strength");
    const valEl = document.getElementById("crt-strength-val");
    if (toggle) toggle.checked = _active;
    if (slider) slider.value = _strength;
    if (valEl) valEl.textContent = Math.round(_strength * 100) + "%";
  }

  // ---- Public API ----

  function setActive(on) {
    _active = !!on;
    _save();
    _apply();
  }

  function setStrength(val) {
    _strength = Math.max(0, Math.min(1, parseFloat(val) || 0));
    _save();
    _apply();
  }

  function discover() {
    const wasNew = !_discovered;
    _discovered = true;
    _active = true;
    if (wasNew) _strength = 0.70;
    _save();
    _apply();
    if (typeof showToast === "function") {
      showToast(wasNew ? "You found a secret! CRT mode activated." : "CRT mode re-activated.", "ok");
    }
  }

  function reset() {
    _discovered = false;
    _active = false;
    _strength = 0.70;
    _bannerClicks = 0;
    clearTimeout(_bannerTimer);
    _save();
    _apply();
  }

  function _onBannerClick() {
    _bannerClicks++;
    clearTimeout(_bannerTimer);
    if (_bannerClicks >= CLICK_THRESHOLD) {
      _bannerClicks = 0;
      discover();
    } else {
      _bannerTimer = setTimeout(() => { _bannerClicks = 0; }, CLICK_WINDOW);
    }
  }

  function init() {
    _load();

    if (!_initGL()) {
      console.warn("[CRT] WebGL init failed — CRT effects unavailable");
    }

    const logo = document.getElementById("logo-container");
    if (logo) logo.addEventListener("click", _onBannerClick);

    const toggle = document.getElementById("crt-toggle");
    const slider = document.getElementById("crt-strength");
    if (toggle) toggle.addEventListener("change", () => setActive(toggle.checked));
    if (slider) slider.addEventListener("input", () => setStrength(slider.value));

    window.addEventListener("resize", _resize);

    _apply();
  }

  return { init, discover, reset, setActive, setStrength, isActive: () => _active, isDiscovered: () => _discovered };
})();
