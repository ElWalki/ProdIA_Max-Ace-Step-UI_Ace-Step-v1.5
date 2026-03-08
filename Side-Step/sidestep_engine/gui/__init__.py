"""
Side-Step GUI — Electron (preferred) / pywebview / browser backend.

Launch with ``sidestep --gui`` or::

    from sidestep_engine.gui import launch
    launch(port=8770)
"""

from __future__ import annotations

import logging
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import threading
import webbrowser
from typing import Sequence

# Silence noisy GTK/Qt/Chromium warnings from pywebview
os.environ.setdefault("PYWEBVIEW_LOG", "warning")
os.environ.setdefault(
    "QTWEBENGINE_CHROMIUM_FLAGS",
    "--ignore-gpu-blocklist --enable-gpu-rasterization",
)

# Qt WebEngine on Linux (Arch/Manjaro/NixOS) needs --no-sandbox for correct rendering/interaction
if os.name != "nt" and "darwin" not in sys.platform.lower():
    existing = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "")
    if "--no-sandbox" not in existing:
        os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = f"{existing} --no-sandbox".strip()

# Hint window manager to use dark titlebar / window decorations
os.environ.setdefault("GTK_THEME", "Adwaita:dark")
os.environ.setdefault("GTK_CSD", "1")  # client-side decorations
os.environ.setdefault("QT_QPA_PLATFORMTHEME", "qt5ct")

logger = logging.getLogger(__name__)


def _resolve_qt_permission_policies(qwebpage_cls: object) -> tuple[object, object]:
    """Return granted/denied policy values for Qt5/Qt6 compatibility."""
    permission_policy = getattr(qwebpage_cls, "PermissionPolicy", None)
    if permission_policy is not None:
        granted = getattr(permission_policy, "PermissionGrantedByUser", None)
        denied = getattr(permission_policy, "PermissionDeniedByUser", None)
        if granted is not None and denied is not None:
            return granted, denied

    # Older bindings expose these constants directly on QWebPage/QWebEnginePage.
    granted = getattr(qwebpage_cls, "PermissionGrantedByUser", 1)
    denied = getattr(qwebpage_cls, "PermissionDeniedByUser", 2)
    return granted, denied


def _patch_pywebview_qt_permissions(qt_module: object) -> bool:
    """Patch pywebview Qt permission callback for strict enum-typed Qt6 APIs."""
    browser_view = getattr(qt_module, "BrowserView", None)
    web_page_cls = getattr(browser_view, "WebPage", None)
    qwebpage_cls = getattr(qt_module, "QWebPage", None)
    handler = getattr(web_page_cls, "onFeaturePermissionRequested", None)

    if web_page_cls is None or qwebpage_cls is None or handler is None:
        return False
    if getattr(handler, "__sidestep_qt_patch__", False):
        return True

    feature_enum = getattr(qwebpage_cls, "Feature", None)
    media_features = tuple(
        getattr(feature_enum, name)
        for name in ("MediaAudioCapture", "MediaVideoCapture", "MediaAudioVideoCapture")
        if feature_enum is not None and hasattr(feature_enum, name)
    )
    granted_policy, denied_policy = _resolve_qt_permission_policies(qwebpage_cls)

    def _patched_on_feature_permission_requested(self, url, feature):
        allow = feature in media_features
        policy = granted_policy if allow else denied_policy
        try:
            self.setFeaturePermission(url, feature, policy)
        except TypeError:
            # Compatibility fallback for older bindings that still expect ints.
            legacy_policy = 1 if allow else 2
            self.setFeaturePermission(url, feature, legacy_policy)

    _patched_on_feature_permission_requested.__sidestep_qt_patch__ = True
    web_page_cls.onFeaturePermissionRequested = _patched_on_feature_permission_requested
    return True


def _apply_qt_permission_patch(webview_module: object) -> bool:
    """Apply runtime pywebview Qt permission patch when Qt backend is available."""
    qt_module = getattr(getattr(webview_module, "platforms", None), "qt", None)
    if qt_module is None:
        try:
            from webview.platforms import qt as qt_module
        except Exception:
            return False

    try:
        return _patch_pywebview_qt_permissions(qt_module)
    except Exception:
        logger.debug("[Side-Step GUI] Qt permission patch failed", exc_info=True)
        return False


def _port_free(host: str, port: int) -> bool:
    """Return True if *port* is available to bind on *host*."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


# ---------------------------------------------------------------------------
#  Electron helpers
# ---------------------------------------------------------------------------

def _electron_dir() -> pathlib.Path:
    """Return the path to the frontend/electron/ directory."""
    return pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "electron"


def _electron_install_hint() -> str:
    """Return platform-specific command to (re)install local Electron deps."""
    if os.name == "nt":
        return "Set-Location frontend/electron; npm install --no-fund --no-audit"
    return "cd frontend/electron && npm install --no-fund --no-audit"


def _electron_hard_repair_hint() -> str:
    """Return platform-specific command to clean and reinstall Electron deps."""
    if os.name == "nt":
        return (
            "Set-Location frontend/electron; "
            "if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }; "
            "if (Test-Path package-lock.json) { Remove-Item package-lock.json -Force }; "
            "npm install --no-fund --no-audit"
        )
    return "cd frontend/electron && rm -rf node_modules package-lock.json && npm install --no-fund --no-audit"


def _local_electron_paths() -> tuple[pathlib.Path, pathlib.Path]:
    """Return (binary_shim, electron_cli_js) paths for local node_modules install."""
    edir = _electron_dir()
    bin_name = "electron.cmd" if os.name == "nt" else "electron"
    local_bin = edir / "node_modules" / ".bin" / bin_name
    local_cli = edir / "node_modules" / "electron" / "cli.js"
    return local_bin, local_cli


def _find_electron_direct() -> str | None:
    """On Windows, locate the real electron.exe in dist/ to bypass .cmd shim.

    The npm ``.bin/electron.cmd`` wrapper goes through ``cmd.exe`` → ``node``
    → ``cli.js`` → ``electron.exe``.  ``subprocess.Popen.wait()`` only tracks
    the outermost ``cmd.exe`` process, which can exit before the actual
    Electron binary.  Using the direct binary avoids this.
    """
    if os.name != "nt":
        return None
    edir = _electron_dir()
    direct = edir / "node_modules" / "electron" / "dist" / "electron.exe"
    if direct.is_file():
        return str(direct)
    return None


def _run_npm_install(edir: pathlib.Path, cmd: Sequence[str], label: str) -> tuple[bool, str]:
    """Run npm command in electron dir; returns (ok, tail_message)."""
    logger.info("[Side-Step GUI] %s: %s", label, " ".join(cmd))
    try:
        result = subprocess.run(
            list(cmd),
            cwd=str(edir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except Exception as exc:
        logger.warning("[Side-Step GUI] %s failed to start: %s", label, exc)
        return False, str(exc)

    if result.returncode == 0:
        return True, ""

    combined = (result.stderr or result.stdout or "").strip().splitlines()
    tail = combined[-1] if combined else "unknown npm error"
    logger.warning("[Side-Step GUI] %s failed (exit %s): %s", label, result.returncode, tail)
    return False, tail


def _purge_corrupt_node_modules(edir: pathlib.Path) -> bool:
    """Remove local node_modules and lockfile after a failed repair attempt."""
    removed_any = False
    for target in (edir / "node_modules", edir / "package-lock.json"):
        if not target.exists():
            continue
        try:
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            removed_any = True
        except Exception as exc:
            logger.warning("[Side-Step GUI] Failed to remove %s: %s", target, exc)
            return False
    return removed_any


def _try_repair_local_electron() -> bool:
    """Attempt to self-heal local Electron install via npm install."""
    if not shutil.which("npm"):
        logger.info("[Side-Step GUI] npm not found; cannot auto-repair local Electron")
        return False

    edir = _electron_dir()
    package_json = edir / "package.json"
    if not package_json.is_file():
        logger.info("[Side-Step GUI] package.json not found in %s", edir)
        return False

    ok, _ = _run_npm_install(
        edir,
        ["npm", "install", "--no-fund", "--no-audit"],
        "Attempting local Electron repair",
    )
    if ok:
        logger.info("[Side-Step GUI] Electron auto-repair finished successfully")
        return True

    logger.info("[Side-Step GUI] Local Electron install may be corrupt; trying clean reinstall")
    if not _purge_corrupt_node_modules(edir):
        logger.info("[Side-Step GUI] Clean reinstall prep failed; run: %s", _electron_hard_repair_hint())
        return False

    ok, _ = _run_npm_install(
        edir,
        ["npm", "install", "--no-fund", "--no-audit"],
        "Retrying Electron repair after cleanup",
    )
    if ok:
        logger.info("[Side-Step GUI] Electron clean reinstall finished successfully")
        return True

    logger.info("[Side-Step GUI] Clean reinstall failed; run: %s", _electron_hard_repair_hint())
    return False


def _find_electron() -> str | None:
    """Locate the Electron binary.  Returns an absolute path or None."""
    # On Windows, prefer the direct electron.exe to avoid .cmd wrapper
    # process-tracking issues (proc.wait() returning prematurely).
    direct = _find_electron_direct()
    if direct:
        return direct

    local_bin, local_cli = _local_electron_paths()

    if local_bin.is_file():
        if local_cli.is_file():
            return str(local_bin)

        logger.warning(
            "[Side-Step GUI] Local Electron install is incomplete (missing %s).",
            local_cli,
        )
        if _try_repair_local_electron():
            local_bin, local_cli = _local_electron_paths()
            if local_bin.is_file() and local_cli.is_file():
                return str(local_bin)

        logger.info(
            "[Side-Step GUI] Reinstall local Electron with: %s",
            _electron_install_hint(),
        )
        logger.info(
            "[Side-Step GUI] If install still fails, clean reinstall with: %s",
            _electron_hard_repair_hint(),
        )

    # Fallback: globally installed electron on PATH
    global_bin = shutil.which("electron")
    if global_bin:
        return global_bin

    return None


def _launch_electron(url: str, token: str) -> bool:
    """Try to open the GUI in Electron.  Returns True on success."""
    electron_bin = _find_electron()
    if not electron_bin:
        logger.info("[Side-Step GUI] Electron binary not found")
        return False

    edir = _electron_dir()
    main_js = edir / "main.js"
    if not main_js.is_file():
        logger.info("[Side-Step GUI] main.js not found in %s", edir)
        return False

    cmd = [electron_bin, str(edir), f"--url={url}", f"--token={token}"]
    _safe_cmd = [c if not c.startswith("--token=") else "--token=<redacted>" for c in cmd]
    logger.info("[Side-Step GUI] Launching Electron: %s", " ".join(_safe_cmd))

    env = os.environ.copy()
    if os.name != "nt" and "darwin" not in sys.platform.lower():
        env.setdefault("GDK_BACKEND", "x11")

    try:
        proc = subprocess.Popen(cmd, env=env)
        exit_code = proc.wait()
        if exit_code != 0:
            logger.warning(
                "[Side-Step GUI] Electron exited immediately with code %s; reinstall with: %s",
                exit_code,
                _electron_install_hint(),
            )
            logger.info(
                "[Side-Step GUI] If install still fails, clean reinstall with: %s",
                _electron_hard_repair_hint(),
            )
            return False
        return True
    except FileNotFoundError:
        logger.info("[Side-Step GUI] Electron binary not executable")
        return False
    except Exception as exc:
        logger.warning("[Side-Step GUI] Electron launch failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
#  pywebview helpers (fallback)
# ---------------------------------------------------------------------------

def _launch_pywebview(auth_url: str, token: str) -> bool:
    """Try to open the GUI in pywebview.  Returns True on success."""
    try:
        import webview  # pywebview
    except ImportError:
        logger.info("[Side-Step GUI] pywebview not installed")
        return False

    try:
        _apply_qt_permission_patch(webview)

        _maximized = True

        class _WinAPI:
            """Exposed to JS as window.pywebview.api.*"""
            def minimize(self):
                for w in webview.windows:
                    w.minimize()

            def toggle_maximize(self):
                nonlocal _maximized
                for w in webview.windows:
                    if _maximized:
                        w.restore()
                    else:
                        w.maximize()
                _maximized = not _maximized

            def close(self):
                for w in webview.windows:
                    w.destroy()

            def get_position(self):
                for w in webview.windows:
                    return {"x": w.x, "y": w.y}
                return {"x": 0, "y": 0}

            def move_window(self, x, y):
                for w in webview.windows:
                    w.move(int(x), int(y))

            def on_boot_error(self, msg: str):
                logger.error("[Side-Step GUI] Boot failed: %s", msg)
                print(f"[ERROR] GUI boot failed: {msg}")

            def get_token(self) -> str:
                return token

        api = _WinAPI()
        win = webview.create_window(
            "Side-Step", auth_url,
            width=1400, height=900,
            background_color="#16161E",
            frameless=False,
            js_api=api,
        )

        def _on_started():
            try:
                win.maximize()
            except Exception:
                pass

        webview.start(func=_on_started)
        return True
    except Exception as exc:
        logger.warning("[Side-Step GUI] pywebview failed: %s", exc)
        print(f"[WARN] Native window unavailable: {exc}")
        return False


# ---------------------------------------------------------------------------
#  Main entry point
# ---------------------------------------------------------------------------

def launch(host: str = "127.0.0.1", port: int = 8770) -> None:
    """Start the FastAPI server and open a GUI window.

    Priority: Electron > pywebview > system browser.
    """
    from sidestep_engine.gui.security import generate_token
    from sidestep_engine.gui.server import create_app

    # Find a free port (try up to 10)
    original_port = port
    for _ in range(10):
        if _port_free(host, port):
            break
        port += 1
    else:
        print(f"[FAIL] Ports {original_port}–{port} all in use. Kill the old server or pick a different port.")
        return

    if port != original_port:
        print(f"[INFO] Port {original_port} in use, using {port} instead.")

    token = generate_token()
    app = create_app(token=token, port=port)

    def _run_server() -> None:
        import uvicorn
        uvicorn.run(app, host=host, port=port, log_level="warning")

    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()

    url = f"http://{host}:{port}"
    auth_url = f"{url}/?token={token}"
    logger.info("[Side-Step GUI] Server starting on %s", url)

    import time
    time.sleep(0.5)

    # --- Attempt 1: Electron (full Chromium, best GPU/WebGL support) ---
    if _launch_electron(url, token):
        import os as _os
        _os._exit(0)

    # --- Attempt 2: pywebview (Qt WebEngine / WebKitGTK fallback) ---
    logger.info("[Side-Step GUI] Trying pywebview fallback…")
    if _launch_pywebview(auth_url, token):
        import os as _os
        _os._exit(0)

    # --- Attempt 3: System browser ---
    logger.warning("[Side-Step GUI] Opening in system browser")
    print("[INFO] No native window available — opening in your default browser.")
    print(f"       Install Electron for the best experience:  {_electron_install_hint()}")
    print(f"       If install fails, clean reinstall:          {_electron_hard_repair_hint()}")
    webbrowser.open(auth_url)
    _keep_alive(server_thread)


def _keep_alive(server_thread: threading.Thread) -> None:
    """Block until the browser signals shutdown or Ctrl+C."""
    print("[INFO] GUI running in browser. Close the tab or press Ctrl+C to stop.")
    try:
        # server_thread is daemon — it dies when main thread exits.
        # Block in small increments so KeyboardInterrupt is responsive.
        while server_thread.is_alive():
            server_thread.join(timeout=1.0)
    except KeyboardInterrupt:
        pass
    print("\n[OK] Server stopped.")
