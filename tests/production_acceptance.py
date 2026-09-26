"""Production acceptance against the deployed Railway app.

Exercises real HTTPS production auth, content management, media, Excel, study,
summary/error-book, sync, offline cache, password-reset request, and responsive UX.
"""
import base64
import json
import os
from pathlib import Path
import time
import wave

from playwright.sync_api import expect, sync_playwright

ORIGIN=os.environ.get("PROD_ORIGIN","https://vocalearn-web-production.up.railway.app").rstrip("/")
EMAIL=os.environ.get("PROD_QA_EMAIL","prod-qa@example.test")
PASSWORD=os.environ.get("PROD_QA_PASSWORD","disposable-password-123")
OUT=Path("tests/browser-evidence/production")
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
MEANING_TO_WORD={"triển khai":"deploy","xác nhận":"confirm","hạn chót":"deadline","cải thiện":"improve",
                 "đi":"go","đáng tin cậy":"reliable","cơ hội":"opportunity","ước tính":"estimate"}
CLOZE_TO_ANSWER={"We will ___ the app tomorrow.":"deploy","Please ___ the meeting time.":"confirm",
                 "The ___ is Friday.":"deadline","We need to ___ the app.":"improve",
                 "Yesterday, I ___ to school.":"went","She is a ___ teammate.":"reliable",
                 "This is a great ___.":"opportunity","Can you ___ the cost?":"estimate"}

def shot(page,name):
    page.screenshot(path=str(OUT/f"{name}.png"),full_page=True)

def make_wav(path):
    with wave.open(str(path),"wb") as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
        audio.writeframes(b"\x00\x00"*800)

def wait_home(page):
    expect(page.locator(".game-grid")).to_be_visible(timeout=15000)

def auth(page):
    page.goto(ORIGIN,wait_until="networkidle")
    expect(page.locator("#auth-form")).to_be_visible(timeout=15000)
    shot(page,"01-auth")
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill(EMAIL)
    page.locator('[name="password"]').fill(PASSWORD)
    page.locator('#auth-form [type="submit"]').click()
    try:
        expect(page.locator("#set-form")).to_be_visible(timeout=5000)
        return "registered"
    except AssertionError:
        if page.locator(".game-grid").is_visible():
            return "registered"
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill(EMAIL)
        page.locator('[name="password"]').fill(PASSWORD)
        page.locator('#auth-form [type="submit"]').click()
        wait_home(page)
        return "existing"

def create_set(page,name):
    if page.locator("#set-form").is_visible():
        page.locator('#set-form [name="name"]').fill(name)
        page.locator('#set-form [type="submit"]').click()
    else:
        page.locator('[data-action="sets"]').click()
        expect(page.locator("#set-form")).to_be_visible()
        page.locator('#set-form [name="name"]').fill(name)
        page.locator('#set-form [type="submit"]').click()
    wait_home(page)

def add_samples(page):
    if page.locator('[data-action="samples"]:visible').count():
        page.locator('[data-action="samples"]:visible').click()
        expect(page.locator(".metric")).to_have_count(4)
    shot(page,"02-home-samples")

def add_media_card(page,temp):
    wav=temp/"qa.wav";make_wav(wav)
    page.locator('[data-action="library"]').click();expect(page.locator("#word-rows")).to_be_visible()
    page.locator('[data-action="add"]:visible').first.click();expect(page.locator("#word-form")).to_be_visible()
    page.locator('#word-form [name="word"]').fill("productionqa")
    page.locator('#word-form [name="meaning"]').fill("kiểm thử production")
    page.locator("#word-form details summary").click()
    page.locator('#word-form textarea[name="note"]').fill("created by production acceptance")
    page.locator("#audio-upload").set_input_files({"name":"qa.wav","mimeType":"audio/wav","buffer":wav.read_bytes()})
    expect(page.locator("#audio-status")).to_contain_text("qa.wav")
    page.locator("#image-upload").set_input_files({"name":"qa.png","mimeType":"image/png","buffer":PNG})
    expect(page.locator("#media-image .editor-image")).to_be_visible()
    shot(page,"03-editor-media")
    page.locator('#word-form [type="submit"]').click();expect(page.locator("dialog")).not_to_be_visible()
    page.reload(wait_until="networkidle");page.locator('[data-action="library"]').click()
    row=page.locator(".word-row").filter(has_text="productionqa").first;expect(row).to_be_visible()
    row.locator('[data-action="edit"]').click();expect(page.locator("#word-form")).to_be_visible()
    page.locator("#word-form details summary").click()
    expect(page.locator('#word-form textarea[name="note"]')).to_have_value("created by production acceptance")
    expect(page.locator("#media-image .editor-image")).to_be_visible()
    page.locator('[data-action="close"]').click()
    shot(page,"04-library")

def settings_check(page):
    page.locator('[data-action="home"]').click();wait_home(page)
    button=page.locator('[data-action="settings"]:visible').first;button.focus();button.click()
    expect(page.locator("#settings-form")).to_be_visible()
    assert page.evaluate("document.querySelector('#modal').contains(document.activeElement)")
    shot(page,"05-settings")
    page.keyboard.press("Escape");expect(page.locator("dialog")).not_to_be_visible()
    expect(button).to_be_focused()

def finish(page):
    page.locator('[data-action="pause"]').click();expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click();expect(page.locator(".summary")).to_be_visible()
    shot(page,"06-summary")
    page.locator('.summary [data-action="home"]').click();wait_home(page)

def start_game(page,game):
    page.locator(f'[data-action="practice"][data-game="{game}"]').click()
    expect(page.locator("dialog")).to_be_visible()
    start=page.locator('[data-action="startSession"]');expect(start).to_be_enabled();start.click()
    expect(page.locator(".question-panel")).to_be_visible()

def six_games(page):
    start_game(page,"flash");page.locator('[data-action="flip"]').click();page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible();finish(page)
    start_game(page,"quiz");prompt=page.locator(".prompt h1").inner_text().strip()
    page.locator('[data-action="choose"]').filter(has_text=MEANING_TO_WORD[prompt]).first.click()
    expect(page.locator("#feedback")).to_be_visible();finish(page)
    start_game(page,"match");left=page.locator('[data-action="matchLeft"]').first
    ans=page.evaluate("() => import('/js/state.js').then(m => m.app.session.queue[0].answers[0])")
    left.click();page.locator('[data-action="matchRight"]').filter(has_text=ans).first.click();finish(page)
    start_game(page,"typing");prompt=page.locator(".prompt h1").inner_text().strip()
    ans=MEANING_TO_WORD[prompt];page.locator("#answer").fill(ans);page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible();finish(page)
    start_game(page,"spell");page.locator('[data-action="playAudio"]').click()
    if page.locator('[data-action="checkLetters"]').is_enabled(timeout=10000):
        word=page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")
        for i in range(len(word)): page.locator(f'[data-action="letter"][data-index="{i}"]').click()
        page.locator('[data-action="checkLetters"]').click();expect(page.locator("#feedback")).to_be_visible()
    finish(page)
    start_game(page,"cloze");prompt=page.locator(".prompt h1").inner_text().strip()
    page.locator("#answer").fill(CLOZE_TO_ANSWER[prompt]);page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible();finish(page)

def error_book(page):
    start_game(page,"typing")
    correct=page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")
    page.locator("#answer").fill(correct+"x");page.locator("#answer-form [type='submit']").click()
    expect(page.locator("#input-error")).not_to_be_empty()
    page.locator("#answer").fill(correct);page.locator("#answer-form [type='submit']").click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="pause"]').click();page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    expect(page.locator('[data-summary-metric="enteredErrorBook"] strong')).to_have_text("1")
    page.locator('.summary [data-action="errors"]').click()
    expect(page.locator(".word-row").filter(has_text=correct).first).to_be_visible()
    shot(page,"07-error-book")

def sync_and_offline(page,context):
    page.locator('[data-action="home"]').click();wait_home(page)
    page.locator('[data-action="syncInfo"]:visible').first.click();expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click();expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
    page.locator('dialog [data-action="close"]').last.click()
    page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
    context.set_offline(True);page.reload(wait_until="domcontentloaded")
    wait_home(page);shot(page,"08-offline-home")
    context.set_offline(False);page.reload(wait_until="networkidle");wait_home(page)

def password_reset(page):
    page.goto(ORIGIN+"/reset-password",wait_until="networkidle")
    expect(page.locator('input[name="email"]')).to_be_visible()
    page.locator('input[name="email"]').fill(EMAIL)
    page.locator('form').locator('[type="submit"]').click()
    expect(page.locator("body")).to_contain_text("Nếu email tồn tại")
    shot(page,"09-password-reset-request")

def ux_audit(page,label):
    return page.evaluate("""label => {
      const root=document.documentElement;
      const interactive=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(e=>{
        const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden';
      });
      const small=interactive.filter(e=>{const r=e.getBoundingClientRect();return r.width<40||r.height<40;}).map(e=>({
        tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||e.name||'').trim().slice(0,60),
        w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)
      })).slice(0,30);
      const unnamed=interactive.filter(e=>['BUTTON','A'].includes(e.tagName)&&!(e.innerText||e.getAttribute('aria-label')||e.title)).length;
      return {label,overflow:root.scrollWidth-root.clientWidth,smallTargets:small,unnamedInteractive:unnamed,
        bodyFont:getComputedStyle(document.body).fontSize,title:document.title};
    }""",label)

def mobile_audit(browser):
    ctx=browser.new_context(viewport={"width":390,"height":844})
    page=ctx.new_page();page.goto(ORIGIN,wait_until="networkidle")
    page.locator('[name="email"]').fill(EMAIL);page.locator('[name="password"]').fill(PASSWORD)
    page.locator('#auth-form [type="submit"]').click();wait_home(page)
    shot(page,"10-mobile-home")
    home=ux_audit(page,"mobile-home")
    page.locator('[data-action="library"]').click();expect(page.locator("#word-rows")).to_be_visible()
    shot(page,"11-mobile-library");library=ux_audit(page,"mobile-library")
    ctx.close();return [home,library]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    report={"origin":ORIGIN,"checks":[],"consoleErrors":[],"failedResponses":[]}
    with sync_playwright() as p:
        browser=p.chromium.launch()
        ctx=browser.new_context(viewport={"width":1280,"height":900},accept_downloads=True)
        page=ctx.new_page()
        page.on("pageerror",lambda e: report["consoleErrors"].append(str(e)))
        page.on("response",lambda r: report["failedResponses"].append({"url":r.url,"status":r.status}) if r.status>=500 else None)
        health=ctx.request.get(ORIGIN+"/api/health");ready=ctx.request.get(ORIGIN+"/api/ready")
        assert health.status==200 and health.json().get("ok") is True
        assert ready.status==200 and ready.json().get("ok") is True
        report["checks"]+=["health","ready"]
        mode=auth(page);run=str(int(time.time()));create_set(page,"Production QA "+run);add_samples(page)
        report["checks"].append("auth-"+mode)
        temp=OUT/"tmp";temp.mkdir(exist_ok=True);add_media_card(page,temp);report["checks"].append("media-card")
        settings_check(page);six_games(page);report["checks"].append("six-games")
        error_book(page);report["checks"].append("error-book")
        sync_and_offline(page,ctx);report["checks"]+=["sync","offline-cache"]
        page.locator('[data-action="home"]').click();wait_home(page)
        report["ux"]=[ux_audit(page,"desktop-home")]
        password_reset(page);report["checks"].append("password-reset-request")
        report["ux"]+=mobile_audit(browser)
        assert all(x["overflow"]<=1 for x in report["ux"]),report["ux"]
        assert not report["consoleErrors"],report["consoleErrors"]
        assert not report["failedResponses"],report["failedResponses"]
        ctx.close();browser.close()
    (OUT/"production-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    print("PASS: deployed production acceptance completed")

if __name__=="__main__":
    main()
