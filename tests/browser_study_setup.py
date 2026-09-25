"""Live-browser acceptance for study setup, face matrix and mixed practice."""

import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]


def finish_early(page):
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    page.locator('.summary [data-action="home"]').click()
    expect(page.locator(".game-grid")).to_be_visible()


def question_state(page):
    return page.evaluate(
        """async () => {
          const {app,current}=await import('/js/state.js');
          const q=current();
          return {
            game:q.game,face:q.face,answerFace:q.answerFace,prompt:q.prompt,
            answers:q.answers,config:q.config,
            modelEasyMs:app.model.settings.easyMs,
            queueGames:app.session.queue.map(item=>item.game)
          };
        }"""
    )


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: study setup acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-setup-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(
            os.environ,PORT=str(port),HOST="127.0.0.1",
            DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
            NODE_ENV="test",APP_ORIGIN=origin,
        )
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page()
                page.goto(origin,wait_until="networkidle")
                email="setup-e2e@example.test"
                register_and_create_set(page,email)
                page.locator('[data-action="samples"]').click()
                expect(page.locator(".metric")).to_have_count(4)

                # Mixed practice uses only the games the learner explicitly leaves enabled.
                page.locator('[data-action="practice"][data-game="mix"]').click()
                expect(page.locator("dialog")).to_be_visible()
                expect(page.locator("dialog")).to_contain_text("Game dùng trong Trộn")
                for game in ["spell","dictation","cloze","clozeChoice"]:
                    box=page.locator(f'[data-mix-game="{game}"]')
                    if box.is_checked():
                        box.uncheck()
                        expect(page.locator(f'[data-mix-game="{game}"]')).not_to_be_checked()
                for game in ["flash","quiz","typing"]:
                    expect(page.locator(f'[data-mix-game="{game}"]')).to_be_checked()
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="startSession"]').click()
                expect(page.locator(".question-panel")).to_be_visible()
                state=question_state(page)
                assert set(state["queueGames"]).issubset({"flash","quiz","typing"})
                assert len(set(state["queueGames"]))>=2
                finish_early(page)
                print("PASS: mixed practice honors enabled per-card games only")

                # Invalid prompt face must block rather than silently substitute.
                page.locator('[data-action="practice"][data-game="typing"]').click()
                page.locator("#setup-face").select_option("audio")
                expect(page.locator('[data-action="startSession"]')).to_be_disabled()
                expect(page.locator("dialog")).to_contain_text("Tổ hợp mặt hỏi không hợp lệ")
                expect(page.locator("dialog")).to_contain_text("0/8")
                page.locator("#setup-face").select_option("meaning")
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="close"]').click()

                # Quiz answer face is explicit, distinct, and validated for readiness.
                page.locator('[data-action="practice"][data-game="quiz"]').click()
                page.locator("#setup-face").select_option("meaning")
                page.locator("#setup-answer-face").select_option("meaning")
                expect(page.locator('[data-action="startSession"]')).to_be_disabled()
                expect(page.locator("dialog")).to_contain_text("Mặt đáp phải hợp lệ")
                page.locator("#setup-answer-face").select_option("ipa")
                expect(page.locator('[data-action="startSession"]')).to_be_disabled()
                expect(page.locator("dialog")).to_contain_text("Thiếu dữ liệu cho mặt đáp")
                page.locator("#setup-answer-face").select_option("word")
                expect(page.locator('[data-action="startSession"]')).to_be_enabled()
                page.locator('[data-action="startSession"]').click()
                expect(page.locator(".question-panel")).to_be_visible()
                before=question_state(page)
                assert before["game"]=="quiz"
                assert before["face"]=="meaning"
                assert before["answerFace"]=="word"
                assert before["config"]["easyMs"]==5000

                # Change settings from another tab; current question/config snapshot must not mutate.
                tab=context.new_page()
                tab.goto(origin,wait_until="networkidle")
                expect(tab.locator(".game-grid")).to_be_visible()
                tab.locator('[data-action="settings"]:visible').first.click()
                expect(tab.locator("#settings-form")).to_be_visible()
                tab.locator("#settings-form details summary").click()
                expect(tab.locator('[name="easyMs"]')).to_be_visible()
                tab.locator('[name="easyMs"]').fill("9000")
                tab.locator('#settings-form [type="submit"]').click()
                expect(tab.locator("dialog")).not_to_be_visible()
                page.wait_for_function("() => import(\'/js/state.js\').then(m => m.app.model.settings.easyMs === 9000)")
                after=question_state(page)
                assert after["prompt"]==before["prompt"]
                assert after["answers"]==before["answers"]
                assert after["config"]["easyMs"]==5000

                page.locator('[data-action="choose"]').filter(has_text=before["answers"][0]).first.click()
                expect(page.locator("#feedback")).to_be_visible()
                finish_early(page)
                tab.close()
                print("PASS: face readiness blocks invalid setup and current question snapshot stays frozen")

                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
