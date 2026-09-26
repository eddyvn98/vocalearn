"""Real browser MVP regression against the live app and disposable server.

Covers login/setup, six MVP games, pause/resume across reload, Excel export,
IME-safe submit, dialog focus restoration, and responsive overflow.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import wave
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "tests" / "browser-evidence"
MEANING_TO_WORD = {
    "triển khai": "deploy",
    "xác nhận": "confirm",
    "hạn chót": "deadline",
    "cải thiện": "improve",
    "đi": "go",
    "đáng tin cậy": "reliable",
    "cơ hội": "opportunity",
    "ước tính": "estimate",
}
WORD_TO_MEANING = {word: meaning for meaning, word in MEANING_TO_WORD.items()}
CLOZE_TO_ANSWER = {
    "We will ___ the app tomorrow.": "deploy",
    "Please ___ the meeting time.": "confirm",
    "The ___ is Friday.": "deadline",
    "We need to ___ the app.": "improve",
    "Yesterday, I ___ to school.": "went",
    "She is a ___ teammate.": "reliable",
    "This is a great ___.": "opportunity",
    "Can you ___ the cost?": "estimate",
}


def wait_server(server, origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Test server exited; see server.log")
        try:
            with urlopen(origin + "/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("Test server did not become ready")


def make_wav(path):
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 800)


def finish_early(page):
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    page.locator('.summary [data-action="home"]').click()
    expect(page.locator(".game-grid")).to_be_visible()


def start_game(page, game):
    page.locator(f'[data-action="practice"][data-game="{game}"]').click()
    expect(page.locator("dialog")).to_be_visible()
    start = page.locator('[data-action="startSession"]')
    expect(start).to_be_enabled()
    start.click()
    expect(page.locator(".question-panel")).to_be_visible()


def add_audio_and_test_export(page, temp):
    page.locator('[data-action="library"]').click()
    expect(page.locator("#word-rows")).to_be_visible()
    row = page.locator(".word-row").filter(has_text="deploy").first
    original_viewport = page.viewport_size
    if original_viewport["width"] > 720:
        page.set_viewport_size({"width": 390, "height": 844})
    target = row.locator(".card-select-target")
    box = target.bounding_box()
    assert box and box["width"] >= 44 and box["height"] >= 44, f"Card checkbox touch target too small: {box}"
    if original_viewport["width"] > 720:
        page.set_viewport_size(original_viewport)
    row.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator("details summary").click()
    wav_path = Path(temp) / "deploy.wav"
    make_wav(wav_path)
    page.locator("#audio-upload").set_input_files({
        "name": "deploy.wav", "mimeType": "audio/wav", "buffer": wav_path.read_bytes()
    })
    expect(page.locator("#audio-status")).to_contain_text("deploy.wav")
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()

    page.once("dialog", lambda dialog: dialog.accept())
    with page.expect_download() as download_info:
        page.locator('[data-action="export"]').click()
    export_path = Path(temp) / "acceptance.xlsx"
    download_info.value.save_as(str(export_path))
    assert export_path.stat().st_size > 1000, "Exported XLSX is unexpectedly small"
    assert export_path.read_bytes()[:2] == b"PK", "Exported XLSX is not a ZIP workbook"
    page.locator('[data-action="home"]').click()
    expect(page.locator(".game-grid")).to_be_visible()
    print("PASS: UI Excel export produces a real XLSX workbook")


def exercise_six_games(page):
    # G-01 Flash
    start_game(page, "flash")
    page.locator('[data-action="flip"]').click()
    expect(page.locator(".flash-back")).to_be_visible()
    page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    # G-02 Multiple choice
    start_game(page, "quiz")
    prompt = page.locator(".prompt h1").inner_text().strip()
    answer = MEANING_TO_WORD[prompt]
    page.locator('[data-action="choose"]').filter(has_text=answer).first.click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    # G-03 Matching
    start_game(page, "match")
    left = page.locator('[data-action="matchLeft"]').first
    expected = page.evaluate(
        "() => import('/js/state.js').then(m => m.app.session.queue[0].answers[0])"
    )
    left.click()
    page.locator('[data-action="matchRight"]').filter(has_text=expected).first.click()
    expect(page.locator('[data-action="matchLeft"]').first).to_be_disabled()
    finish_early(page)

    # G-04 Typing + IME + pause/reload/resume persistence
    start_game(page, "typing")
    prompt = page.locator(".prompt h1").inner_text().strip()
    answer = MEANING_TO_WORD[prompt]
    field = page.locator("#answer")
    field.dispatch_event("compositionstart")
    page.keyboard.press("Enter")
    expect(page.locator("#feedback")).to_have_count(0)
    field.dispatch_event("compositionend")
    partial = answer[:2]
    field.fill(partial)
    page.wait_for_timeout(100)
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.reload(wait_until="networkidle")
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="resume"]').click()
    expect(page.locator("#answer")).to_have_value(partial)
    page.locator("#answer").fill(answer)
    page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    # G-05 Spelling / arrange letters; only deploy has the test audio resource.
    start_game(page, "spell")
    page.locator('[data-action="playAudio"]').click()
    expect(page.locator('[data-action="checkLetters"]')).to_be_enabled(timeout=10000)
    for index in range(len("deploy")):
        page.locator(f'[data-action="letter"][data-index="{index}"]').click()
    page.locator('[data-action="checkLetters"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    # G-06 Fill sentence
    start_game(page, "cloze")
    prompt = page.locator(".prompt h1").inner_text().strip()
    answer = CLOZE_TO_ANSWER[prompt]
    page.locator("#answer").fill(answer)
    page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)
    print("PASS: all six MVP game families complete a real browser answer flow")


def main():
    browser_name = os.environ.get("PW_BROWSER", "chromium")
    width, height = map(int, os.environ.get("PW_VIEWPORT", "1280x900").lower().split("x"))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="voca-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        env = dict(
            os.environ,
            PORT=str(port),
            HOST="127.0.0.1",
            DB_PATH=str(Path(temp) / "test.sqlite"),
            ALLOW_SIGNUP="true",
            NODE_ENV="test",
            APP_ORIGIN=origin,
        )
        with (EVIDENCE / "server.log").open("w") as log:
            server = subprocess.Popen(
                ["node", "server/main.js"],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_server(server, origin)
                with sync_playwright() as p:
                    browser = getattr(p, browser_name).launch()
                    context = browser.new_context(
                        viewport={"width": width, "height": height},
                        accept_downloads=True,
                    )
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.goto(origin, wait_until="networkidle")
                        expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
                        assert not errors, "Browser module/runtime errors: " + repr(errors)
                        page.locator('[data-action="toggleAuth"]').click()
                        page.locator('[name="email"]').fill("e2e@example.test")
                        page.locator('[name="password"]').fill("disposable-password-123")
                        page.locator('#auth-form [type="submit"]').click()
                        expect(page.locator("#set-form")).to_be_visible()
                        page.locator('#set-form [name="name"]').fill("Acceptance")
                        page.locator('#set-form [type="submit"]').click()
                        expect(page.locator('[data-action="samples"]')).to_be_visible()
                        page.locator('[data-action="samples"]').click()
                        expect(page.locator(".metric")).to_have_count(4)

                        settings = page.locator('[data-action="settings"]:visible').first
                        settings.focus()
                        settings.click()
                        expect(page.locator("dialog")).to_be_visible()
                        expect(page.locator('[name="reminderPrimary"]')).to_be_visible()
                        assert page.evaluate(
                            "document.querySelector('#modal').contains(document.activeElement)"
                        )
                        page.keyboard.press("Escape")
                        expect(page.locator("dialog")).not_to_be_visible()
                        expect(settings).to_be_focused()

                        add_audio_and_test_export(page, temp)
                        exercise_six_games(page)

                        overflow = page.evaluate(
                            "document.documentElement.scrollWidth-document.documentElement.clientWidth"
                        )
                        assert overflow <= 1, f"Horizontal overflow: {overflow}"
                        assert not errors, "Browser runtime errors: " + repr(errors)
                        print(
                            f"PASS: {browser_name} {width}x{height} MVP browser regression"
                        )
                    finally:
                        prefix = f"{browser_name}-{width}x{height}"
                        page.screenshot(
                            path=str(EVIDENCE / f"{prefix}-last-page.png"),
                            full_page=True,
                        )
                        (EVIDENCE / f"{prefix}-page-errors.json").write_text(
                            json.dumps(errors, indent=2)
                        )
                        context.close()
                        browser.close()
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    main()
