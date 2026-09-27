"""Phase-3 handwriting browser acceptance with deterministic local stroke fixture."""
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

def draw(page,x1,y1,x2,y2):
    canvas=page.locator("[data-handwriting-canvas]")
    box=canvas.bounding_box();assert box
    page.mouse.move(box["x"]+box["width"]*x1/100,box["y"]+box["height"]*y1/100)
    page.mouse.down()
    for n in range(1,9):
        r=n/8
        page.mouse.move(box["x"]+box["width"]*(x1+(x2-x1)*r)/100,
                        box["y"]+box["height"]*(y1+(y2-y1)*r)/100)
    page.mouse.up()

def main():
  with tempfile.TemporaryDirectory(prefix="voca-g3-hand-") as temp:
    with socket.socket() as sock:sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    origin=f"http://127.0.0.1:{port}"
    env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",DB_PATH=str(Path(temp)/"test.sqlite"),
             ALLOW_SIGNUP="true",NODE_ENV="test",APP_ORIGIN=origin)
    server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
      wait_server(server,origin)
      with sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={"width":1280,"height":900})
        errors=[];page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(origin,wait_until="networkidle")
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill("handwriting@example.test")
        page.locator('[name="password"]').fill("disposable-password-123")
        page.locator('#auth-form [type="submit"]').click()
        expect(page.locator("#set-form")).to_be_visible()
        page.locator('#set-form [name="name"]').fill("Handwriting")
        page.locator("#set-language").select_option("zh")
        page.locator("#set-meaning-language").select_option("vi")
        page.locator('#set-form [type="submit"]').click()
        page.locator('[data-action="library"]').first.click();page.locator('[data-action="add"]').first.click()
        form=page.locator("#word-form");form.locator('[name="word"]').fill("十");form.locator('[name="meaning"]').fill("mười")
        form.locator("details summary").click();form.locator('[name="pinyin"]').fill("shí");form.locator('[type="submit"]').click()
        expect(form).not_to_be_visible()
        page.evaluate("""async()=>{const s=await import('/js/state.js'),m=await import('/js/storage.js');
          const w=Object.values(s.app.model.words)[0];
          const strokeData={language:'zh',source:'acceptance fixture',version:'test-v1',license:'test-only',
            complete:true,missing:[],characters:[{char:'十',format:'points',strokes:[[[20,50],[80,50]],[[50,20],[50,80]]]}]};
          await m.transact([m.prepare('word',{id:w.id,setId:w.setId,patch:{strokeData},baseFields:w.fields})]);
          s.app.model=m.model();}""")
        page.locator('[data-action="home"]').first.click();page.locator('[data-action="setupFree"]').click()
        page.locator("#setup-game").select_option("handwriting");page.locator("#setup-game").dispatch_event("change")
        expect(page.locator("#setup-handwriting-level")).to_be_visible()
        page.locator("#setup-handwriting-level").select_option("guided")
        page.locator("#setup-handwriting-level").dispatch_event("change")
        page.locator('[data-action="startSession"]').click()
        expect(page.locator("[data-handwriting-canvas]")).to_be_visible()
        draw(page,20,50,80,50);expect(page.locator(".handwriting-meta")).to_contain_text("Nét 2/2")
        draw(page,50,20,50,80);expect(page.locator("#feedback")).to_be_visible()
        expect(page.locator("#feedback")).to_contain_text("Khó")
        assert not errors,repr(errors)
        browser.close();print("PASS: Phase-3 handwriting guided multi-stroke flow")
    finally:
      server.terminate()
      try:server.wait(timeout=10)
      except subprocess.TimeoutExpired:server.kill();server.wait()

if __name__=="__main__":main()
