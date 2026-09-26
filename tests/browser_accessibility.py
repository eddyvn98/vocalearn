"""Automated accessibility evidence that does not require physical hardware."""

import os, socket, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]

AUDIT_JS=r"""() => {
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const rgb=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):null};
  const lum=c=>{const a=c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2]};
  const ratio=(a,b)=>{const A=lum(a),B=lum(b);return (Math.max(A,B)+.05)/(Math.min(A,B)+.05)};
  const bg=e=>{let n=e;while(n){const c=rgb(getComputedStyle(n).backgroundColor);if(c&&getComputedStyle(n).backgroundColor!=='rgba(0, 0, 0, 0)')return c;n=n.parentElement}return [255,255,255]};
  const text=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
  const low=text.map(e=>{const s=getComputedStyle(e),fg=rgb(s.color),r=fg?ratio(fg,bg(e)):99,size=parseFloat(s.fontSize),bold=parseInt(s.fontWeight)>=700;const large=size>=24||(size>=18.66&&bold);return {tag:e.tagName,text:e.textContent.trim().slice(0,80),ratio:r,need:large?3:4.5}}).filter(x=>x.ratio+0.01<x.need);
  const small=[...document.querySelectorAll('button,.btn,input,select,textarea')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,name:(e.getAttribute('aria-label')||e.innerText||e.name||'').trim(),w:r.width,h:r.height}}).filter(x=>x.w<44||x.h<44);
  return {low,small,scroll:document.documentElement.scrollWidth,width:innerWidth};
}"""


def audit(page,label):
    a=page.evaluate(AUDIT_JS)
    assert a["scroll"]<=a["width"]+1, f"{label}: horizontal overflow {a['scroll']}>{a['width']}"
    assert not a["low"], f"{label}: text contrast failures {a['low'][:8]}"
    assert not a["small"], f"{label}: product 44px target failures {a['small'][:8]}"


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: accessibility automation runs on Chromium")
        return
    with tempfile.TemporaryDirectory(prefix="voca-a11y-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":390,"height":844})
                page=context.new_page();page.goto(origin,wait_until="networkidle")
                audit(page,"auth-390")
                register_and_create_set(page,"a11y-e2e@example.test")
                audit(page,"home-390")

                # Keyboard-only open/close of a modal and focus restoration.
                trigger=page.locator('[data-action="settings"]:visible').first
                trigger.focus();page.keyboard.press("Enter")
                expect(page.locator("dialog")).to_be_visible()
                assert page.evaluate("() => document.querySelector('dialog').contains(document.activeElement)")
                page.keyboard.press("Escape")
                expect(page.locator("dialog")).not_to_be_visible()
                assert trigger.evaluate("(e)=>document.activeElement===e")

                # WCAG reflow: 320 CSS px is the 400% equivalent of a 1280px desktop viewport.
                page.set_viewport_size({"width":320,"height":700})
                audit(page,"home-320-reflow")
                print("PASS: automated contrast, 44px targets, keyboard modal focus and 320/390 reflow")
                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()

if __name__=="__main__":
    main()
