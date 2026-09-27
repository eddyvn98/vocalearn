"""Phase-3 Japanese profile browser acceptance."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def wait_server(server,origin):
    for _ in range(100):
        if server.poll() is not None: raise RuntimeError("server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:return
        except OSError: time.sleep(0.1)
    raise RuntimeError("server did not start")

def add_word(page,word,meaning,kana,on="",kun=""):
    page.locator('[data-action="library"]').first.click()
    page.locator('[data-action="add"]').first.click()
    form=page.locator("#word-form")
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.locator("details summary").click()
    form.locator('[name="kana"]').fill(kana)
    form.locator('[name="onReading"]').fill(on)
    form.locator('[name="kunReading"]').fill(kun)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

def answer_current(page):
    prompt=page.locator(".prompt h1").inner_text()
    mapping={"ăn":"たべる","cảm ơn":"ありがとう","cà phê":"こーひー"}
    reading=next(value for key,value in mapping.items() if key in prompt)
    field=page.locator("#answer")
    field.dispatch_event("compositionstart")
    field.fill(reading)
    page.keyboard.press("Enter")
    expect(page.locator("#feedback")).to_have_count(0)
    field.dispatch_event("compositionend")
    field.press("Enter")
    confirm=page.locator('[data-action="formChoice"]')
    if confirm.count():
        expect(confirm).to_have_count(1)
        confirm.click()
    expect(page.locator("#feedback")).to_be_visible()
    return prompt

def main():
    with tempfile.TemporaryDirectory(prefix="voca-g3-ja-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env,
                                stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                page=browser.new_page(viewport={"width":1280,"height":900})
                errors=[];page.on("pageerror",lambda error: errors.append(str(error)))
                page.goto(origin,wait_until="networkidle")
                page.locator('[data-action="toggleAuth"]').click()
                page.locator('[name="email"]').fill("japanese@example.test")
                page.locator('[name="password"]').fill("disposable-password-123")
                page.locator('#auth-form [type="submit"]').click()
                expect(page.locator("#set-form")).to_be_visible()
                language=page.locator("#set-language")
                assert language.locator('option[value="ja"]').count()==1
                page.locator('#set-form [name="name"]').fill("Japanese Phase 3")
                language.select_option("ja")
                page.locator('#set-meaning-language').select_option("vi")
                page.locator('#set-form [type="submit"]').click()
                expect(page.locator('[data-action="library"]')).to_be_visible()

                add_word(page,"食べる","ăn","たべる",kun="たべる")
                add_word(page,"ありがとう","cảm ơn","ありがとう")
                add_word(page,"コーヒー","cà phê","コーヒー")
                page.locator('[data-action="home"]').first.click()
                page.locator('[data-action="setupFree"]').click()
                game=page.locator("#setup-game");game.select_option("typing");game.dispatch_event("change")
                page.locator("#setup-face").select_option("meaning")
                page.locator("#setup-face").dispatch_event("change")
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="startSession"]').click()
                seen=[]
                for _ in range(3):
                    seen.append(answer_current(page))
                    nxt=page.locator('[data-action="next"]')
                    if nxt.count():nxt.click()
                assert any("ăn" in x for x in seen)
                assert any("cảm ơn" in x for x in seen)
                assert any("cà phê" in x for x in seen)
                assert not errors,repr(errors)
                browser.close()
                print("PASS: Phase-3 Japanese kana, IME-safe typing and whole-word form flow")
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()

if __name__=="__main__":
    main()
