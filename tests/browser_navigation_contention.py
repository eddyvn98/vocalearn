"""Browser Back/Forward and same-opportunity tab contention acceptance."""

from datetime import datetime, timezone
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import wave
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
START_MS=1_799_352_000_000


def wait_server(server,origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Test server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("Test server did not become ready")


def make_wav(path):
    with wave.open(str(path),"wb") as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
        audio.writeframes(b"\x00\x00"*800)


def register(page):
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill("nav-e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()
    page.locator('#set-form [name="name"]').fill("Navigation acceptance")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="add"]')).to_be_visible()


def add_card(page,word,meaning,wav_path):
    if page.locator('[data-action="add"]:visible').count()==0:
        page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]:visible').first.click()
    page.locator('#word-form [name="word"]').fill(word)
    page.locator('#word-form [name="meaning"]').fill(meaning)
    page.get_by_text("Trường bổ sung", exact=True).click()
    page.get_by_text("Ảnh & âm thanh", exact=True).click()
    page.locator("#audio-upload").set_input_files({
        "name":f"{word}.wav","mimeType":"audio/wav","buffer":wav_path.read_bytes()
    })
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def sync_now(page):
    page.locator('[data-action="syncInfo"]:visible').first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click()
    expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
    page.locator('[data-action="close"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def local_answer_events(page,opportunity_id=None):
    return page.evaluate(
        """async opportunityId => {
          const user=JSON.parse(localStorage.getItem('vocalearn-user'));
          const db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('vocalearn-'+user.id);
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
          });
          const events=await new Promise((resolve,reject)=>{
            const req=db.transaction('events').objectStore('events').getAll();
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
          });
          return events.filter(e=>e.kind==='answer'&&(!opportunityId||e.data.opportunityId===opportunityId));
        }""",
        opportunity_id,
    )


def history_acceptance(page):
    page.locator('[data-action="home"]').click()
    page.locator('[data-action="setupFree"]').click()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".question-panel")).to_be_visible()
    answer=page.locator("#answer")
    answer.fill("de")
    expect(answer).to_have_value("de")

    page.go_back()
    expect(page.locator(".game-grid")).to_be_visible()
    expect(page.locator(".resume")).to_be_visible()
    page.go_forward()
    expect(page.locator(".question-panel")).to_be_visible()
    expect(page.locator("#answer")).to_have_value("de")
    print("PASS: browser Back/Forward preserves active study input")

    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    page.go_back()
    expect(page.locator(".game-grid")).to_be_visible()
    expect(page.locator(".question-panel")).to_have_count(0)
    page.go_forward()
    expect(page.locator(".summary")).to_be_visible()
    page.locator('.summary [data-action="home"]').click()

    page.locator('[data-action="library"]').click()
    row=page.locator(".word-row").filter(has_text="deploy").first
    row.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    page.go_back()
    expect(page.locator("dialog")).not_to_be_visible()
    page.go_forward()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator('[data-action="close"]').click()
    expect(page.locator("dialog")).not_to_be_visible()

    page.locator('[data-action="import"]').click()
    expect(page.locator("#import-file")).to_be_visible()
    page.go_back()
    expect(page.locator("dialog")).not_to_be_visible()
    page.go_forward()
    expect(page.locator("#import-file")).to_be_visible()
    page.locator('[data-action="close"]').click()
    print("PASS: editor/import dialogs are safe across Back/Forward")


def start_new_first_step(page):
    page.locator('[data-action="home"]').click()
    page.locator('[data-action="setupNew"]').click()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".study-meta")).to_contain_text("Lật thẻ")
    page.locator('[data-action="flip"]').click()
    target=page.locator(".flash-back h2").inner_text().strip()
    page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="pause"]').click()
    page.locator('.resume [data-action="finish"]').click()
    page.locator('.summary [data-action="home"]').click()
    return target


def start_due_quiz(page):
    page.locator('[data-action="setupReview"]').click()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".study-meta")).to_contain_text("Trắc nghiệm")
    return page.locator(".prompt h1").inner_text().strip()


def contention(browser,context,page,origin,clock_file,now_ms):
    target=start_new_first_step(page)
    sync_now(page)
    now_ms+=60_000
    clock_file.write_text(str(now_ms))
    page.clock.fast_forward(60_000)
    page.reload(wait_until="networkidle")
    prompt=start_due_quiz(page)

    tab=context.new_page()
    tab_time=datetime.fromtimestamp(now_ms/1000,tz=timezone.utc)
    tab.clock.install(time=tab_time);tab.clock.pause_at(tab_time)
    tab.goto(origin,wait_until="networkidle")
    expect(tab.locator(".resume")).to_be_visible()
    tab.locator('.resume [data-action="resume"]').click()
    expect(tab.locator(".study-meta")).to_contain_text("Trắc nghiệm")

    qid=page.locator('[data-action="choose"]').first.get_attribute("data-action")
    assert qid=="choose"
    choices=page.locator('[data-action="choose"]')
    wrong=None
    for i in range(choices.count()):
        label=choices.nth(i).inner_text()
        if target.lower() not in label.lower():
            wrong=choices.nth(i);break
    assert wrong is not None,"Quiz needs a distinguishable wrong option"

    # First writer intentionally records the failure.
    wrong.click()
    expect(page.locator("#feedback")).to_be_visible()

    # Stale second tab tries to submit the correct answer for the same shared question.
    correct=tab.locator('[data-action="choose"]').filter(has_text=target).first
    correct.click()
    expect(tab.locator("#notice")).to_contain_text("tab khác")
    expect(tab.locator("#feedback")).to_be_visible()

    events=local_answer_events(page)
    scheduled=[e for e in events if e["data"]["mode"] in ("new","review")]
    quiz=[e for e in scheduled if e["data"]["game"]=="quiz"]
    assert len(quiz)==1,f"Expected one final quiz event, got {len(quiz)}"
    opportunity=quiz[0]["data"]["opportunityId"]
    assert len(local_answer_events(page,opportunity))==1

    page.locator('[data-action="pause"]').click()
    page.locator('.resume [data-action="finish"]').click()
    page.locator('.summary [data-action="home"]').click()
    sync_now(page)
    page.locator('[data-action="library"]').click()
    row=page.locator(".word-row").filter(has_text=target).first
    expect(row).to_contain_text("Sổ từ sai")
    row.locator('[data-action="edit"]').click()
    expect(page.locator(".info")).to_contain_text("1")
    page.locator('[data-action="close"]').click()
    tab.close()
    print("PASS: two tabs submit one scheduled opportunity with one final event/error effect")


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: navigation/contention acceptance runs on Chromium only");return
    with tempfile.TemporaryDirectory(prefix="voca-nav-e2e-") as temp:
        temp_path=Path(temp)
        clock_file=temp_path/"clock.txt";clock_file.write_text(str(START_MS))
        wav=temp_path/"tone.wav";make_wav(wav)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(temp_path/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin,E2E_CLOCK_FILE=str(clock_file))
        server=subprocess.Popen(["node","tests/e2e_server.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page()
                start=datetime.fromtimestamp(START_MS/1000,tz=timezone.utc)
                page.clock.install(time=start);page.clock.pause_at(start)
                page.goto(origin,wait_until="networkidle")
                register(page)
                add_card(page,"deploy","triển khai",wav)
                add_card(page,"confirm","xác nhận",wav)
                history_acceptance(page)
                contention(browser,context,page,origin,clock_file,START_MS)
                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
