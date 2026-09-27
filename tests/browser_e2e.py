"""Real Chromium regression for the critical offline-first browser journey.

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


def add_word(page, word, meaning):
    page.locator('[data-action="add"]').first.click()
    form = page.locator("#word-form")
    expect(form).to_be_visible()
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()


def wait_for_server(server, origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Test server exited; see server.log")
        try:
            with urlopen(origin + "/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("Test server did not become ready")


def login(page):
    expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
    page.locator('[name="email"]').fill("e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator('[data-action="library"]')).to_be_visible(timeout=10000)


def sync_from_ui(page):
    page.locator('[data-action="syncInfo"]').first.click()
    expect(page.locator("#modal")).to_be_visible()
    page.locator('#modal [data-action="sync"]').click()
    page.locator('#modal [data-action="close"]').click()


def run_journey(page, context, browser, origin, errors):
    page.goto(page.url, wait_until="networkidle")
    expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
    assert not errors, "Browser module/runtime errors: " + repr(errors)

    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill("e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()

    page.locator('#set-form [name="name"]').fill("English E2E")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="add"]').first).to_be_visible()
    add_word(page, "apple", "quả táo")
    expect(page.locator("body")).to_contain_text("1")
    print("PASS: register -> create set -> add card")

    page.evaluate("() => navigator.serviceWorker.ready")
    page.reload(wait_until="networkidle")
    expect(page.locator('[data-action="library"]')).to_be_visible()
    page.locator('[data-action="library"]').click()
    expect(page.locator('[data-action="add"]').first).to_be_visible()
    expect(page.locator("body")).to_contain_text("apple")
    print("PASS: reload restores authenticated local state")

    context.set_offline(True)
    add_word(page, "banana", "quả chuối")
    status = page.locator('[data-action="syncInfo"]').first
    expect(status).to_contain_text("thay đổi chờ đồng bộ")
    pending_before = status.inner_text()

    page.reload(wait_until="domcontentloaded")
    expect(page.locator('[data-action="add"]').first).to_be_visible(timeout=10000)
    expect(page.locator("body")).to_contain_text("Đang offline")
    expect(page.locator('[data-action="syncInfo"]').first).to_contain_text(
        "thay đổi chờ đồng bộ"
    )
    page.locator('[data-action="library"]').click()
    expect(page.locator("body")).to_contain_text("banana")
    print("PASS: offline edit survives a real page reload")

    context.set_offline(False)
    expect(page.locator('[data-action="syncInfo"]').first).not_to_contain_text(
        "thay đổi chờ đồng bộ", timeout=10000
    )
    page.reload(wait_until="networkidle")
    page.locator('[data-action="library"]').click()
    expect(page.locator("body")).to_contain_text("apple")
    expect(page.locator("body")).to_contain_text("banana")
    assert pending_before, "Expected an offline pending-sync status"
    print("PASS: reconnect syncs pending events without losing cards")

    second = browser.new_context(viewport={"width": 1280, "height": 900})
    second_page = second.new_page()
    second_errors = []
    second_page.on("pageerror", lambda error: second_errors.append(str(error)))
    try:
        second_page.goto(origin, wait_until="networkidle")
        login(second_page)
        second_page.locator('[data-action="library"]').click()
        expect(second_page.locator("body")).to_contain_text("apple")
        expect(second_page.locator("body")).to_contain_text("banana")

        second.set_offline(True)
        add_word(second_page, "cherry", "quả anh đào")
        expect(second_page.locator('[data-action="syncInfo"]').first).to_contain_text(
            "thay đổi chờ đồng bộ"
        )
        second_page.reload(wait_until="domcontentloaded")
        expect(second_page.locator("body")).to_contain_text("cherry")
        second.set_offline(False)
        expect(second_page.locator('[data-action="syncInfo"]').first).not_to_contain_text(
            "thay đổi chờ đồng bộ", timeout=10000
        )

        sync_from_ui(page)
        page.locator('[data-action="library"]').click()
        expect(page.locator("body")).to_contain_text("cherry")
        print("PASS: second browser profile reconnects and merges into first profile")
        assert not second_errors, "Second profile runtime errors: " + repr(second_errors)
    finally:
        second.close()

    tab = context.new_page()
    tab_errors = []
    tab.on("pageerror", lambda error: tab_errors.append(str(error)))
    try:
        tab.goto(origin, wait_until="networkidle")
        expect(tab.locator('[data-action="library"]')).to_be_visible(timeout=10000)
        tab.locator('[data-action="library"]').click()
        add_word(page, "delta", "thay đổi")
        add_word(tab, "echo", "tiếng vọng")
        expect(page.locator("body")).to_contain_text("echo", timeout=10000)
        expect(tab.locator("body")).to_contain_text("delta", timeout=10000)
        print("PASS: multi-tab IndexedDB transactions broadcast without losing edits")
        assert not tab_errors, "Second tab runtime errors: " + repr(tab_errors)
    finally:
        tab.close()

    assert not errors, "Browser runtime errors: " + repr(errors)


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="voca-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        env = dict(
            os.environ,
            PORT=str(port),
            HOST="127.0.0.1",
            DB_PATH=str(Path(temp) / "test.sqlite"),
            ALLOW_SIGNUP="true",
            NODE_ENV="test",
            APP_ORIGIN=origin,
        )
        with (EVIDENCE / "server.log").open("w") as log:
            server = subprocess.Popen(
                ["node", "server/main.js"],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_for_server(server, origin)
                with sync_playwright() as p:
                    browser = p.chromium.launch()
                    context = browser.new_context(viewport={"width": 1280, "height": 900})
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.goto(origin, wait_until="domcontentloaded")
                        run_journey(page, context, browser, origin, errors)
                    finally:
                        page.screenshot(
                            path=str(EVIDENCE / "last-page.png"), full_page=True
                        )
                        (EVIDENCE / "page-errors.json").write_text(
                            json.dumps(errors, indent=2)
                        )
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
