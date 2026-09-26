"""Smoke-test the real Railway production web shell without creating user data."""

import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ORIGIN=os.environ.get("PRODUCTION_ORIGIN","https://vocalearn-web-production.up.railway.app").rstrip("/")
EVIDENCE=Path("tests/browser-evidence")
EVIDENCE.mkdir(parents=True,exist_ok=True)


def assert_no_overflow(page,label):
    state=page.evaluate("""() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth
    })""")
    assert state["scroll"]<=state["width"]+1, f"{label}: horizontal overflow {state}"


def assert_agent_operable(page):
    """Basic public-shell checks that matter to browser agents and keyboard users."""
    audit=page.evaluate("""() => {
      const visible = el => {
        const r=el.getBoundingClientRect(), s=getComputedStyle(el);
        return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
      };
      const name = el => (el.getAttribute('aria-label') || el.innerText || el.value || '').trim();
      const controls=[...document.querySelectorAll('button,a[href],input,select,textarea')].filter(visible);
      const unnamed=controls.filter(el => {
        if(el.matches('input,select,textarea')){
          const label=el.labels && [...el.labels].map(x=>x.innerText.trim()).join(' ');
          return !(label || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
        }
        return !name(el);
      }).map(el=>el.outerHTML.slice(0,180));
      const nonNativeActions=[...document.querySelectorAll('[data-action]')]
        .filter(visible)
        .filter(el=>!el.matches('button,a[href],input[type=button],input[type=submit]'))
        .map(el=>el.outerHTML.slice(0,180));
      return {
        main: document.querySelectorAll('main').length,
        forms: document.querySelectorAll('form').length,
        unnamed,
        nonNativeActions
      };
    }""")
    assert audit["main"]==1, f"agent audit: expected one main landmark: {audit}"
    assert audit["forms"]>=1, f"agent audit: no actionable form: {audit}"
    assert not audit["unnamed"], f"agent audit: unnamed controls: {audit['unnamed']}"
    assert not audit["nonNativeActions"], f"agent audit: non-native actions: {audit['nonNativeActions']}"

    email=page.locator('input[name="email"]')
    password=page.locator('input[name="password"]')
    submit=page.locator('#auth-form button[type="submit"]')
    toggle=page.locator('[data-action="toggleAuth"]')
    expect(email).to_be_visible()
    expect(password).to_be_visible()
    expect(submit).to_be_visible()
    expect(toggle).to_be_visible()

    email.focus()
    page.keyboard.press("Tab")
    assert page.evaluate("() => document.activeElement?.name")==="password"
    page.keyboard.press("Tab")
    assert page.evaluate("() => document.activeElement?.type")==="submit"
    page.keyboard.press("Tab")
    assert page.evaluate("() => document.activeElement?.dataset?.action")==="toggleAuth"


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={"width":1440,"height":1000})

        health=context.request.get(ORIGIN+"/api/health")
        assert health.status==200, f"health status {health.status}"
        health_json=health.json()
        assert health_json.get("ok") is True

        ready=context.request.get(ORIGIN+"/api/ready")
        assert ready.status==200, f"ready status {ready.status}"
        ready_json=ready.json()
        assert ready_json.get("ok") is True
        assert isinstance(ready_json.get("schemaVersion"),int)

        me=context.request.get(ORIGIN+"/api/me")
        assert me.status==401, f"anonymous /api/me should be 401, got {me.status}"

        manifest=context.request.get(ORIGIN+"/manifest.webmanifest")
        assert manifest.status==200, f"manifest status {manifest.status}"
        manifest_json=manifest.json()
        assert manifest_json.get("name") or manifest_json.get("short_name")

        page=context.new_page()
        page_errors=[]
        console_errors=[]
        page.on("pageerror",lambda error: page_errors.append(str(error)))
        page.on("console",lambda msg: console_errors.append(msg.text) if msg.type=="error" else None)

        response=page.goto(ORIGIN,wait_until="networkidle")
        assert response and response.ok, f"root status {response.status if response else 'no response'}"
        expect(page.locator("#auth-form")).to_be_visible()
        expect(page).to_have_title("VocaLearn")
        assert page.locator('link[rel="manifest"]').get_attribute("href")=="/manifest.webmanifest"
        assert_no_overflow(page,"desktop")
        assert_agent_operable(page)
        page.screenshot(path=str(EVIDENCE/"production-desktop.png"),full_page=True)

        assert not page_errors, f"page errors: {page_errors}"
        unexpected_console=[m for m in console_errors if "status of 401" not in m]
        assert not unexpected_console, f"console errors: {unexpected_console}"

        sw_ready=page.evaluate("""() => navigator.serviceWorker.ready.then(reg => Boolean(reg.active))""")
        assert sw_ready is True
        page.reload(wait_until="networkidle")
        expect(page.locator("#auth-form")).to_be_visible()
        assert page.evaluate("() => Boolean(navigator.serviceWorker.controller)") is True

        page.set_viewport_size({"width":390,"height":844})
        expect(page.locator("#auth-form")).to_be_visible()
        assert_no_overflow(page,"mobile-390")
        page.screenshot(path=str(EVIDENCE/"production-mobile-390.png"),full_page=True)

        page.set_viewport_size({"width":320,"height":780})
        assert_no_overflow(page,"mobile-320")

        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
        assert_no_overflow(page,"offline-shell-320")
        context.set_offline(False)

        print("PASS: Railway production web shell")
        print("origin:",ORIGIN)
        print("health:",health_json)
        print("ready:",ready_json)
        print("checks: health, readiness, anonymous auth boundary, manifest, clean browser load, agent-operable auth shell, service worker, offline reload, 1440/390/320 overflow")

        context.close()
        browser.close()


if __name__=="__main__":
    main()
