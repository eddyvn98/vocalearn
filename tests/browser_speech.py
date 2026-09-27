"""Phase-3 Speak browser acceptance using an explicitly tested local ASR adapter."""
import os
from pathlib import Path
import socket,subprocess,tempfile,time
from urllib.request import urlopen
from playwright.sync_api import expect,sync_playwright

ROOT=Path(__file__).resolve().parents[1]
def wait_server(server,origin):
    for _ in range(100):
        if server.poll() is not None: raise RuntimeError("server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:return
        except OSError: time.sleep(.1)
    raise RuntimeError("server did not start")

def main():
  with tempfile.TemporaryDirectory(prefix="voca-g3-speech-") as temp:
    with socket.socket() as sock:sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    origin=f"http://127.0.0.1:{port}"
    env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",DB_PATH=str(Path(temp)/"test.sqlite"),
             ALLOW_SIGNUP="true",NODE_ENV="test",APP_ORIGIN=origin)
    server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
      wait_server(server,origin)
      with sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={"width":1280,"height":900})
        page.add_init_script("""window.__VOCALearnLocalASR={
          tested:true,local:true,offline:true,permission:'granted',version:'acceptance-v1',languages:['en'],calls:0,
          recognize:async function(){
            this.calls++;
            if(this.calls===1){const e=new Error('mic unavailable');e.code='mic';throw e;}
            if(this.calls===2)return {transcript:'orange',activeMs:600};
            return {transcript:'apple',activeMs:600};
          }
        };""")
        errors=[];page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(origin,wait_until="networkidle")
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill("speech@example.test")
        page.locator('[name="password"]').fill("disposable-password-123")
        page.locator('#auth-form [type="submit"]').click()
        expect(page.locator("#set-form")).to_be_visible()
        page.locator('#set-form [name="name"]').fill("Speech Phase 3")
        page.locator("#set-language").select_option("en");page.locator("#set-meaning-language").select_option("vi")
        page.locator('#set-form [type="submit"]').click()
        page.locator('[data-action="library"]').first.click();page.locator('[data-action="add"]').first.click()
        form=page.locator("#word-form");form.locator('[name="word"]').fill("apple");form.locator('[name="meaning"]').fill("quả táo")
        form.locator('[type="submit"]').click();expect(form).not_to_be_visible()
        page.locator('[data-action="home"]').first.click();page.locator('[data-action="setupFree"]').click()
        game=page.locator("#setup-game");expect(game.locator('option[value="speak"]')).to_have_count(1)
        game.select_option("speak");game.dispatch_event("change")
        page.locator("#setup-face").select_option("meaning");page.locator("#setup-face").dispatch_event("change")
        expect(page.locator('[data-action="startSession"]')).to_be_enabled()
        page.locator('[data-action="startSession"]').click();expect(page.locator(".study-shell")).to_be_visible()
        page.locator('[data-action="speechStart"]').click()
        expect(page.locator(".speech-panel")).to_contain_text("không tính")
        valid=page.evaluate("() => import('/js/state.js').then(m => m.app.session.queue[0].speechState.validAttempts)")
        assert valid==0,valid
        page.locator('[data-action="speechStart"]').click()
        expect(page.locator(".speech-panel")).to_contain_text("orange")
        valid=page.evaluate("() => import('/js/state.js').then(m => m.app.session.queue[0].speechState.validAttempts)")
        assert valid==1,valid
        page.locator('[data-action="speechStart"]').click();expect(page.locator("#feedback")).to_be_visible()
        expect(page.locator("#feedback")).to_contain_text("Khó")
        assert not errors,repr(errors)
        browser.close();print("PASS: Phase-3 Speak local-ASR gating and technical-error attempt semantics")
    finally:
      server.terminate()
      try:server.wait(timeout=10)
      except subprocess.TimeoutExpired:server.kill();server.wait()

if __name__=="__main__":main()
