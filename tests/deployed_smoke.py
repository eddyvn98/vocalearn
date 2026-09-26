"""Smoke-test the deployed VocaLearn UI in real Chromium.

Requires APP_ORIGIN, for example:
  APP_ORIGIN=https://vocalearn-web-production.up.railway.app python tests/deployed_smoke.py
"""
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "tests" / "deployed-evidence"
ORIGIN = os.environ["APP_ORIGIN"].rstrip("/")


def check_viewport(browser, name, width, height):
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    page_errors = []
    console_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    try:
        response = page.goto(ORIGIN, wait_until="networkidle", timeout=30000)
        assert response is not None and response.ok, (
            f"{name}: root request failed: "
            f"{None if response is None else response.status}"
        )
        expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
        expect(page.locator("body")).to_contain_text("VocaLearn")
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - window.innerWidth"
        )
        assert overflow <= 1, f"{name}: horizontal overflow {overflow}px"
        assert not page_errors, f"{name}: page errors: {page_errors!r}"
        assert not console_errors, f"{name}: console errors: {console_errors!r}"
        page.screenshot(
            path=str(EVIDENCE / f"{name}.png"),
            full_page=True,
        )
        return {
            "viewport": {"width": width, "height": height},
            "url": page.url,
            "title": page.title(),
            "horizontalOverflowPx": overflow,
            "pageErrors": page_errors,
            "consoleErrors": console_errors,
        }
    finally:
        context.close()


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            report = {
                "origin": ORIGIN,
                "desktop": check_viewport(browser, "desktop-1440", 1440, 900),
                "mobile": check_viewport(browser, "mobile-390", 390, 844),
            }
        finally:
            browser.close()
    (EVIDENCE / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
