"""Phase-2 Chinese browser acceptance."""
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
        if server.poll() is not None:
            raise RuntimeError("server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("server did not start")

def add_word(page,word,meaning,pinyin,classifier=""):
    page.locator('[data-action="library"]').first.click()
    page.locator('[data-action="add"]').first.click()
    form=page.locator("#word-form")
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.get_by_text("Trường bổ sung", exact=True).click()
    form.get_by_text("Phát âm & câu ví dụ", exact=True).click()
    form.locator('[name="pinyin"]').fill(pinyin)
    if classifier:
        form.locator('[name="classifier"]').fill(classifier)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

def main():
    with tempfile.TemporaryDirectory(prefix="voca-phase2-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
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
                errors=[]
                page.on("pageerror",lambda error: errors.append(str(error)))
                page.goto(origin,wait_until="networkidle")
                page.locator('[data-action="toggleAuth"]').click()
                page.locator('[name="email"]').fill("phase2@example.test")
                page.locator('[name="password"]').fill("disposable-password-123")
                page.locator('#auth-form [type="submit"]').click()
                expect(page.locator("#set-form")).to_be_visible()
                language=page.locator("#set-language")
                assert language.locator('option[value="zh"]').count()==1
                assert language.locator('option[value="ja"]').count()==1
                page.locator('#set-form [name="name"]').fill("Chinese Phase 2")
                language.select_option("zh")
                page.locator('#set-meaning-language').select_option("vi")
                page.locator('#set-form [type="submit"]').click()
                expect(page.locator('[data-action="library"]')).to_be_visible()

                add_word(page,"书","sách","shū","本")
                add_word(page,"输","thua","shū")
                page.locator('[data-action="home"]').first.click()
                page.locator('[data-action="setupFree"]').click()
                game=page.locator("#setup-game")
                assert game.locator('option[value="tone"]').count()==1
                assert game.locator('option[value="classifier"]').count()==1
                game.select_option("typing")
                game.dispatch_event("change")
                page.locator("#setup-face").select_option("meaning")
                page.locator("#setup-face").dispatch_event("change")
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="startSession"]').click()

                prompt=page.locator(".prompt h1").inner_text()
                expected="书" if "sách" in prompt else "输"
                page.locator("#answer").fill("shu1")
                page.locator('#answer-form [type="submit"]').click()
                expect(page.locator("#feedback")).to_have_count(0)
                choices=page.locator('[data-action="formChoice"]')
                expect(choices).to_have_count(2)
                assert set(choices.all_inner_texts())=={"书","输"}
                choices.filter(has_text=expected).click()
                expect(page.locator("#feedback")).to_be_visible()
                assert not errors,repr(errors)
                browser.close()
                print("PASS: Phase-2 Chinese profile and two-step typing")
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()

if __name__=="__main__":
    main()
