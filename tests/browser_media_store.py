"""Browser acceptance for content-addressed offline media storage."""

import base64
import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import login, register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]
PNG=base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
LEGACY="data:image/png;base64,"+base64.b64encode(PNG).decode()


def add_image_card(page,word,meaning,image):
    if page.locator('[data-action="add"]:visible').count()==0:
        page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]:visible').first.click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator('#word-form [name="word"]').fill(word)
    page.locator('#word-form [name="meaning"]').fill(meaning)
    page.locator("#word-form details summary").click()
    page.locator("#image-upload").set_input_files({
        "name":"same.png","mimeType":"image/png","buffer":image.read_bytes()
    })
    expect(page.locator("#media-image .editor-image")).to_have_attribute("data-media-status","available")
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def sync_now(page):
    page.locator('[data-action="syncInfo"]:visible').first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click()
    expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
    page.locator('dialog [data-action="close"]').last.click()
    expect(page.locator("dialog")).not_to_be_visible()


def local_stats(page):
    return page.evaluate("() => import('/js/media-store.js').then(m => m.localMediaStats())")


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: media-store acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-media-e2e-") as temp:
        temp_path=Path(temp)
        image=temp_path/"same.png";image.write_bytes(PNG)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(temp_path/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page();page.goto(origin,wait_until="networkidle")
                email="media-e2e@example.test"
                register_and_create_set(page,email)

                # Large source images are resized, and identical normalized bytes deduplicate.
                result=page.evaluate("""async () => {
                  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;
                  const ctx=canvas.getContext('2d');ctx.fillStyle='#456';ctx.fillRect(0,0,1200,600);
                  const source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
                  const {ingestBlob}=await import('/js/media-store.js');
                  const {getMediaRecord}=await import('/js/storage.js');
                  const first=await ingestBlob(source,'image'),second=await ingestBlob(source,'image');
                  const record=await getMediaRecord(first),bitmap=await createImageBitmap(record.blob);
                  const out={first,second,width:bitmap.width,height:bitmap.height,size:record.size,mime:record.mime};
                  bitmap.close();return out;
                }""")
                assert result["first"]==result["second"]
                assert max(result["width"],result["height"])<=800
                assert result["size"]<=1_500_000 and result["mime"]=="image/webp"

                add_image_card(page,"cat","con mèo",image)
                add_image_card(page,"dog","con chó",image)
                words=page.evaluate("""() => import('/js/state.js').then(({app}) =>
                  Object.values(app.model.words).filter(w=>['cat','dog'].includes(w.word)).map(w=>w.image))""")
                assert len(words)==2 and words[0]==words[1] and words[0].startswith("media:")
                assert local_stats(page)["count"]==2  # one referenced image + one deliberate orphan
                sync_now(page)
                remote=page.evaluate("() => fetch('/api/media-info').then(r=>r.json())")
                assert remote["count"]==1

                page.locator('[data-action="offlineResources"]').click()
                expect(page.locator("dialog")).to_contain_text("1 tài nguyên đang được thẻ sử dụng")
                page.locator('[data-action="cleanupMediaLocal"]').click()
                page.wait_for_function("""async () => {
                  const {localMediaStats}=await import('/js/media-store.js');
                  return (await localMediaStats()).count===1;
                }""")
                expect(page.locator("dialog")).to_contain_text("Bộ nhớ tệp cục bộ")
                assert local_stats(page)["count"]==1
                page.locator('dialog [data-action="close"]').last.click()
                print("PASS: image compression, hash dedup, separate upload and local cleanup")

                # A fresh device downloads once, then renders the same blob while offline.
                second=browser.new_context(viewport={"width":1280,"height":900})
                device=second.new_page();login(device,origin,email)
                device.locator('[data-action="library"]').click()
                device.locator('[data-action="offlineResources"]').click()
                expect(device.locator("dialog")).to_contain_text("1 chưa tải trên thiết bị")
                device.locator('dialog [data-action="close"]').last.click()
                device.locator('[data-action="library"]').click()
                device.locator(".word-row").filter(has_text="cat").first.locator('[data-action="edit"]').click()
                pic=device.locator("#media-image .editor-image")
                expect(pic).to_have_attribute("data-media-status","available",timeout=10000)
                assert pic.get_attribute("src").startswith("blob:")
                device.locator('dialog [data-action="close"]').last.click()
                assert local_stats(device)["count"]==1
                second.set_offline(True);device.reload(wait_until="domcontentloaded")
                device.locator('[data-action="library"]').click()
                device.locator(".word-row").filter(has_text="cat").first.locator('[data-action="edit"]').click()
                expect(device.locator("#media-image .editor-image")).to_have_attribute("data-media-status","available")
                device.locator('dialog [data-action="close"]').last.click()
                second.set_offline(False);second.close()
                print("PASS: remote media hydrates into IndexedDB and remains available offline")

                # Legacy inline media migrates to a hashed resource without losing the card.
                page.evaluate("""async uri => {
                  const storage=await import('/js/storage.js'),state=await import('/js/state.js');
                  await storage.transact([storage.prepare('word',{
                    id:'legacy-card',setId:state.app.setId,
                    patch:{word:'legacy',meaning:'dữ liệu cũ',image:uri},baseFields:{}
                  })]);
                  state.app.model=storage.model();
                }""",LEGACY)
                page.reload(wait_until="networkidle")
                page.wait_for_function("""() => import('/js/state.js').then(({app}) =>
                  app.model.words['legacy-card']?.image?.startsWith('media:'))""")
                legacy_ref=page.evaluate("() => import('/js/state.js').then(({app}) => app.model.words['legacy-card'].image)")
                assert legacy_ref.startswith("media:")
                sync_now(page)
                print("PASS: legacy data URI migrates to a content-addressed media ref")

                # A missing offline image blocks grading and creates no mistake/answer event.
                fake="media:"+"f"*64
                page.evaluate("""async ref => {
                  const storage=await import('/js/storage.js'),state=await import('/js/state.js');
                  await storage.transact([storage.prepare('word',{
                    id:'000-missing',setId:state.app.setId,
                    patch:{word:'ghost',meaning:'bóng ma',image:ref},baseFields:{}
                  })]);
                  state.app.model=storage.model();
                }""",fake)
                page.locator('[data-action="home"]').click()
                page.locator('[data-action="practice"][data-game="typing"]').click()
                page.locator("#setup-face").select_option("image")
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="startSession"]').click()
                expect(page.locator(".question-panel")).to_be_visible()
                current=page.evaluate("() => import('/js/state.js').then(m => m.current().wordId)")
                assert current=="000-missing"
                context.set_offline(True)
                page.locator("#answer").fill("ghost")
                page.locator("#answer-form [type='submit']").click()
                expect(page.locator("#study-error")).to_contain_text("Tài nguyên của câu này chưa có",timeout=10000)
                events=page.evaluate("""async () => {
                  const {localEvents}=await import('/js/storage.js');
                  return localEvents().filter(e=>e.data?.wordId==='000-missing'&&['answer','attempt'].includes(e.kind)).length;
                }""")
                assert events==0
                context.set_offline(False)
                print("PASS: unavailable media blocks grading without creating a mistake")

                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
