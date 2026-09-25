"""Real Chromium regression: launch the app, not a static HTML fixture.

Run: python -m pip install playwright==1.57.0
     python -m playwright install chromium
     python tests/browser_e2e.py
Uses a disposable database and a fresh browser profile; never real user data.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "tests" / "browser-evidence"


def main():
    browser_name = os.environ.get("PW_BROWSER", "chromium")
    width, height = map(int, os.environ.get("PW_VIEWPORT", "1280x900").lower().split("x"))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="voca-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        env = dict(os.environ, PORT=str(port), HOST="127.0.0.1",
                   DB_PATH=str(Path(temp) / "test.sqlite"), ALLOW_SIGNUP="true",
                   NODE_ENV="test", APP_ORIGIN=origin)
        with (EVIDENCE / "server.log").open("w") as log:
            server = subprocess.Popen(["node", "server/main.js"], cwd=ROOT,
                                      env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError("Test server exited; see server.log")
                    try:
                        with urlopen(origin + "/api/health", timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Test server did not become ready")
                with sync_playwright() as p:
                    browser = getattr(p, browser_name).launch()
                    context = browser.new_context(viewport={"width": width, "height": height})
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.goto(origin, wait_until="networkidle")
                        expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
                        assert not errors, "Browser module/runtime errors: " + repr(errors)
                        print("PASS: live app modules load and login form is interactive")
                        page.locator('[data-action="toggleAuth"]').click()
                        page.locator('[name="email"]').fill("e2e@example.test")
                        page.locator('[name="password"]').fill("disposable-password-123")
                        page.locator('#auth-form [type="submit"]').click()
                        expect(page.locator("#set-form")).to_be_visible()
                        page.locator('#set-form [name="name"]').fill("Acceptance")
                        page.locator('#set-form [type="submit"]').click()
                        expect(page.locator('[data-action="samples"]')).to_be_visible()
                        page.locator('[data-action="samples"]').click()
                        expect(page.locator(".metric")).to_have_count(4)

                        settings = page.locator('[data-action="settings"]').first
                        settings.focus(); settings.click()
                        expect(page.locator("dialog")).to_be_visible()
                        assert page.evaluate("document.querySelector('#modal').contains(document.activeElement)")
                        page.keyboard.press("Escape")
                        expect(page.locator("dialog")).not_to_be_visible()
                        expect(settings).to_be_focused()

                        page.locator('[data-action="setupFree"]').click()
                        expect(page.locator("dialog")).to_be_visible()
                        page.locator('[data-action="startSession"]').click()
                        expect(page.locator(".question-panel")).to_be_visible()
                        page.locator("#answer").dispatch_event("compositionstart")
                        page.keyboard.press("Enter")
                        expect(page.locator("#feedback")).to_have_count(0)
                        page.locator("#answer").dispatch_event("compositionend")
                        page.locator('[data-action="pause"]').click()

                        overflow = page.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
                        assert overflow <= 1, f"Horizontal overflow: {overflow}"
                        print(f"PASS: {browser_name} {width}x{height} live app, focus, IME and reflow smoke")
                        assert not errors, "Browser runtime errors: " + repr(errors)
                    finally:
                        prefix = f"{browser_name}-{width}x{height}"
                        page.screenshot(path=str(EVIDENCE / f"{prefix}-last-page.png"), full_page=True)
                        (EVIDENCE / f"{prefix}-page-errors.json").write_text(json.dumps(errors, indent=2))
                        context.close()
                        browser.close()
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    main()
