"""Phase-3 local speech acceptance with deterministic device adapter."""
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
        except OSError:time.sleep(.1)
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
        browser=p.chromium.launch()
        context=browser.new_context(viewport={"width":1280,"height":900})
        context.add_init_script("""window.__vocaSpeechTestAdapter={
          calls:0,
          probe:async()=>({available:true,reason:null,tested:true,offline:true,version:'test-local-asr'}),
          recognize:async function(){this.calls++;if(this.calls===1){const e=new Error('mic');e.code='mic';throw e;}
            if(this.calls===2)return 'wrong word';return 'deploy';}
        };""")
        page=context.new_page();errors=[];posts=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("request",lambda request:posts.append(request.url) if request.method=="POST" else None)
        page.goto(origin,wait_until="networkidle")
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill("speech@example.test")
        page.locator('[name="password"]').fill("disposable-password-123")
        page.locator('#auth-form [type="submit"]').click()
        expect(page.locator("#set-form")).to_be_visible()
        page.locator('#set-form [name="name"]').fill("Speech")
        page.locator("#set-language").select_option("en")
        page.locator("#set-meaning-language").select_option("vi")
        page.locator('#set-form [type="submit"]').click()
        page.locator('[data-action="library"]').first.click();page.locator('[data-action="add"]').first.click()
        form=page.locator("#word-form");form.locator('[name="word"]').fill("deploy");form.locator('[name="meaning"]').fill("triển khai")
        form.locator('[type="submit"]').click();expect(form).not_to_be_visible()
        page.locator('[data-action="home"]').first.click();page.locator('[data-action="setupFree"]').click()
        expect(page.locator("#setup-game")).to_contain_text("Nói từ")
        page.locator("#setup-game").select_option("speak");page.locator("#setup-game").dispatch_event("change")
        page.locator('[data-action="startSession"]').click()
        expect(page.locator("[data-speech-record]")).to_be_visible()
        posts.clear()

        page.locator("[data-speech-record]").click()
        expect(page.locator("[role=status]")).to_contain_text("Lỗi kỹ thuật")
        state=page.evaluate("() => import('/js/state.js').then(m => m.app.session.queue[0].speechAttempt)")
        assert state["validAttempts"]==0,state
        expect(page.locator("#feedback")).to_have_count(0)

        page.locator("[data-speech-record]").click()
        expect(page.locator("[role=status]")).to_contain_text("wrong word")
        state=page.evaluate("() => import('/js/state.js').then(m => m.app.session.queue[0].speechAttempt)")
        assert state["validAttempts"]==1,state
        expect(page.locator("#feedback")).to_have_count(0)

        page.locator("[data-speech-record]").click()
        expect(page.locator("#feedback")).to_be_visible()
        expect(page.locator("#feedback")).to_contain_text("Khó")
        assert not any("/api/media" in url for url in posts),posts
        assert not errors,errors
        context.close();browser.close()
        print("PASS: local speech gate, technical no-penalty, second valid Hard and no audio upload")
    finally:
      server.terminate()
      try:server.wait(timeout=10)
      except subprocess.TimeoutExpired:server.kill();server.wait()

if __name__=="__main__":main()
