"""Late-parent replay acceptance with two isolated browser devices."""

from datetime import datetime, timezone
import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import (
    START_MS, add_card, finish_early, login, make_wav,
    register_and_create_set, start_due, wait_server,
)

ROOT=Path(__file__).resolve().parents[1]
WORDS={"triển khai":"deploy","xác nhận":"confirm"}


def sync_now(page):
    page.locator('[data-action="syncInfo"]:visible').first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click()
    expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
    page.locator('[data-action="close"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def start_new_first(page):
    page.locator('[data-action="home"]').click()
    page.locator('[data-action="setupNew"]').click()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".study-meta")).to_contain_text("Lật thẻ")
    page.locator('[data-action="flip"]').click()
    target=page.locator(".flash-back h2").inner_text().strip()
    page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)
    return target


def answer_quiz_correct(page,target):
    expect(page.locator(".study-meta")).to_contain_text("Trắc nghiệm")
    page.locator('[data-action="choose"]').filter(has_text=target).first.click()
    expect(page.locator("#feedback")).to_be_visible()


def answer_quiz_wrong(page,target):
    expect(page.locator(".study-meta")).to_contain_text("Trắc nghiệm")
    choices=page.locator('[data-action="choose"]')
    for index in range(choices.count()):
        choice=choices.nth(index)
        if target.lower() not in choice.inner_text().lower():
            choice.click()
            expect(page.locator("#feedback")).to_be_visible()
            return
    raise AssertionError("Quiz needs a wrong alternative")


def answer_spelling(page,target):
    expect(page.locator(".study-meta")).to_contain_text("Chính tả")
    page.locator('[data-action="playAudio"]').click()
    expect(page.locator('[data-action="checkLetters"]')).to_be_enabled(timeout=10000)
    for index in range(len(target)):
        page.locator(f'[data-action="letter"][data-index="{index}"]').click()
    page.locator('[data-action="checkLetters"]').click()
    expect(page.locator("#feedback")).to_be_visible()


def replay_state(page,target):
    return page.evaluate(
        """async target => {
          const user=JSON.parse(localStorage.getItem('vocalearn-user'));
          const db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('vocalearn-'+user.id);
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
          });
          const events=await new Promise((resolve,reject)=>{
            const req=db.transaction('events').objectStore('events').getAll();
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
          });
          const {replay}=await import('/core/model.js');
          const model=replay(events),word=Object.values(model.words).find(w=>w.word===target);
          return {
            step:word.review.step,
            phase:word.review.phase,
            reclassified:word.practiceReclassified,
            failures:word.errors.failures,
            total:word.errors.total,
            scheduled:events.filter(e=>e.kind==='answer'&&e.data.wordId===word.id
              &&!['free','errors'].includes(e.data.mode)).map(e=>e.id)
          };
        }""",
        target,
    )


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: late-parent acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-late-parent-") as temp:
        temp_path=Path(temp)
        clock_file=temp_path/"clock.txt"
        clock_file.write_text(str(START_MS))
        wav=temp_path/"tone.wav"
        make_wav(wav)

        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(
            os.environ,
            PORT=str(port),HOST="127.0.0.1",
            DB_PATH=str(temp_path/"test.sqlite"),
            ALLOW_SIGNUP="true",NODE_ENV="test",
            APP_ORIGIN=origin,E2E_CLOCK_FILE=str(clock_file),
        )
        server=subprocess.Popen(["node","tests/e2e_server.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                a_ctx=browser.new_context(viewport={"width":1280,"height":900})
                a=a_ctx.new_page()
                start=datetime.fromtimestamp(START_MS/1000,tz=timezone.utc)
                a.clock.install(time=start);a.clock.pause_at(start)
                a.goto(origin,wait_until="networkidle")
                email="late-parent@example.test"
                register_and_create_set(a,email)
                add_card(a,"deploy","triển khai",wav)
                add_card(a,"confirm","xác nhận",wav)

                target=start_new_first(a)
                sync_now(a)

                b_ctx=browser.new_context(viewport={"width":1280,"height":900})
                b=b_ctx.new_page()
                b.clock.install(time=start);b.clock.pause_at(start)
                login(b,origin,email)

                now=START_MS+60_000
                clock_file.write_text(str(now))
                a.clock.fast_forward(60_000);b.clock.fast_forward(60_000)
                a.reload(wait_until="networkidle");b.reload(wait_until="networkidle")
                start_due(a);start_due(b)

                answer_quiz_correct(a,target)
                finish_early(a)
                sync_now(a)

                a_ctx.set_offline(True)
                now+=600_000
                clock_file.write_text(str(now))
                a.clock.fast_forward(600_000);b.clock.fast_forward(600_000)

                a.locator('[data-action="home"]').click()
                start_due(a)
                answer_spelling(a,target)
                finish_early(a)
                before=replay_state(a,target)
                assert before["step"]==3
                assert len(before["reclassified"])==0

                answer_quiz_wrong(b,target)
                finish_early(b)
                sync_now(b)

                a_ctx.set_offline(False)
                expect(a.locator("#notice")).to_contain_text(
                    "Lịch đã điều chỉnh sau đồng bộ",timeout=15000
                )

                a.locator('[data-action="syncInfo"]:visible').first.click()
                expect(a.locator("dialog")).to_be_visible()
                details=a.locator("dialog details").filter(has_text="Điều chỉnh lịch sau đồng bộ")
                expect(details).to_be_visible()
                details.locator("summary").click()
                expect(details).to_contain_text(target)
                expect(details).to_contain_text("thay đổi nhánh lịch")
                expect(details).to_contain_text("Log giữ lại")
                a.locator('[data-action="close"]').click()

                after=replay_state(a,target)
                assert after["step"]==1
                assert after["phase"]=="learning"
                assert len(after["reclassified"])==1
                assert after["failures"]==1
                assert after["total"]==1
                assert len(after["scheduled"])==4
                print("PASS: late parent invalidates child schedule, retains log, and shows conflict detail")

                b_ctx.close();a_ctx.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
