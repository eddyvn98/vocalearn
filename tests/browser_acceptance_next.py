"""Next MVP acceptance slice: timed learning, offline/reconnect, multi-tab/device.

Runs against the live app with a disposable database. The browser and server share a
controlled clock for the 1 -> 10 -> 10 minute new-learning sequence.
"""
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

ROOT = Path(__file__).resolve().parents[1]
START_MS = 1_799_352_000_000  # 2027-01-07T12:00:00Z
WORDS = {"triển khai": "deploy", "xác nhận": "confirm"}


def wait_server(server, origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Test server exited")
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


def register_and_create_set(page, email):
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill(email)
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()
    page.locator('#set-form [name="name"]').fill("Timed acceptance")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="add"]')).to_be_visible()


def login(page, origin, email):
    page.goto(origin, wait_until="networkidle")
    page.locator('[name="email"]').fill(email)
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator(".game-grid")).to_be_visible()


def add_card(page, word, meaning, wav_path):
    page.locator('[data-action="add"]:visible').first.click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator('#word-form [name="word"]').fill(word)
    page.locator('#word-form [name="meaning"]').fill(meaning)
    page.locator("#word-form details summary").click()
    page.locator("#audio-upload").set_input_files({
        "name": f"{word}.wav",
        "mimeType": "audio/wav",
        "buffer": wav_path.read_bytes(),
    })
    expect(page.locator("#audio-status")).to_contain_text(".wav")
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def finish_early(page):
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()
    page.locator('.summary [data-action="home"]').click()
    expect(page.locator(".game-grid")).to_be_visible()


def start_due(page):
    page.locator('[data-action="setupReview"]').click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".question-panel")).to_be_visible()


def advance(page, clock_file, now_ms, delta_ms):
    now_ms += delta_ms
    clock_file.write_text(str(now_ms))
    page.clock.fast_forward(delta_ms)
    return now_ms


def complete_timed_learning(page, clock_file, now_ms):
    page.locator('[data-action="setupNew"]').click()
    page.locator('[data-action="startSession"]').click()
    expect(page.locator(".question-panel")).to_be_visible()
    expect(page.locator(".study-meta")).to_contain_text("Lật thẻ")
    page.locator('[data-action="flip"]').click()
    target = page.locator(".flash-back h2").inner_text().strip()
    assert target in WORDS.values()
    page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)
    expect(page.locator(".wait-panel")).to_be_visible()

    now_ms = advance(page, clock_file, now_ms, 60_000)
    start_due(page)
    expect(page.locator(".study-meta")).to_contain_text("Trắc nghiệm")
    prompt = page.locator(".prompt h1").inner_text().strip()
    page.locator('[data-action="choose"]').filter(has_text=WORDS[prompt]).first.click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    page.reload(wait_until="networkidle")
    expect(page.locator(".wait-panel")).to_be_visible()
    now_ms = advance(page, clock_file, now_ms, 600_000)
    start_due(page)
    expect(page.locator(".study-meta")).to_contain_text("Chính tả")
    page.locator('[data-action="playAudio"]').click()
    expect(page.locator('[data-action="checkLetters"]')).to_be_enabled(timeout=10000)
    for index in range(len(target)):
        page.locator(f'[data-action="letter"][data-index="{index}"]').click()
    page.locator('[data-action="checkLetters"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    now_ms = advance(page, clock_file, now_ms, 600_000)
    start_due(page)
    expect(page.locator(".study-meta")).to_contain_text("Gõ từ")
    prompt = page.locator(".prompt h1").inner_text().strip()
    assert WORDS[prompt] == target
    page.locator("#answer").fill(target)
    page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)

    page.locator('[data-action="library"]').click()
    row = page.locator(".word-row").filter(has_text=target).first
    expect(row).to_contain_text("Đang ôn")
    print("PASS: browser new-learning chain honors 1/10/10-minute gates and reload")
    return now_ms


def offline_reconnect(page, context):
    page.locator('[data-action="home"]').click()
    page.locator('[data-action="practice"][data-game="typing"]').click()
    page.locator('[data-action="startSession"]').click()
    prompt = page.locator(".prompt h1").inner_text().strip()
    answer = WORDS[prompt]
    context.set_offline(True)
    page.locator("#answer").fill(answer)
    page.locator("#answer").press("Enter")
    expect(page.locator("#feedback")).to_be_visible()
    finish_early(page)
    expect(page.locator('[data-action="syncInfo"]:visible').first).to_contain_text("chờ đồng bộ")

    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".game-grid")).to_be_visible(timeout=10000)
    expect(page.locator('[data-action="syncInfo"]:visible').first).to_contain_text("chờ đồng bộ")
    context.set_offline(False)
    page.locator('[data-action="syncInfo"]:visible').first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click()
    page.locator('[data-action="close"]').click()
    expect(page.locator('[data-action="syncInfo"]:visible').first).not_to_contain_text("chờ đồng bộ")
    print("PASS: offline answer survives reload and syncs once after reconnect")


def multi_client(browser, context, page, origin, email):
    tab = context.new_page()
    tab.goto(origin, wait_until="networkidle")
    expect(tab.locator(".game-grid")).to_be_visible()
    page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]').click()
    page.locator('#word-form [name="word"]').fill("handoff")
    page.locator('#word-form [name="meaning"]').fill("bàn giao")
    page.locator('#word-form [type="submit"]').click()
    expect(tab.locator(".metric")).to_be_visible()
    tab.locator('[data-action="library"]').click()
    expect(tab.locator(".word-row").filter(has_text="handoff")).to_be_visible(timeout=10000)

    device = browser.new_context(viewport={"width": 1280, "height": 900})
    other = device.new_page()
    login(other, origin, email)
    other.locator('[data-action="library"]').click()
    expect(other.locator(".word-row").filter(has_text="handoff")).to_be_visible(timeout=10000)
    device.close()
    tab.close()
    print("PASS: multi-tab propagation and second-profile sync both show new content")


def main():
    browser_name = os.environ.get("PW_BROWSER", "chromium")
    if browser_name != "chromium":
        print("SKIP: next acceptance slice runs on Chromium only")
        return
    with tempfile.TemporaryDirectory(prefix="voca-next-e2e-") as temp:
        temp_path = Path(temp)
        clock_file = temp_path / "clock.txt"
        clock_file.write_text(str(START_MS))
        wav_path = temp_path / "tone.wav"
        make_wav(wav_path)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        env = dict(os.environ, PORT=str(port), HOST="127.0.0.1",
                   DB_PATH=str(temp_path / "test.sqlite"), ALLOW_SIGNUP="true",
                   NODE_ENV="test", APP_ORIGIN=origin, E2E_CLOCK_FILE=str(clock_file))
        server = subprocess.Popen(["node", "tests/e2e_server.js"], cwd=ROOT, env=env)
        try:
            wait_server(server, origin)
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                page = context.new_page()
                page.clock.install(time=datetime.fromtimestamp(START_MS / 1000, tz=timezone.utc))
                page.goto(origin, wait_until="networkidle")
                expect(page.locator("#auth-form")).to_be_visible()
                email = "next-e2e@example.test"
                register_and_create_set(page, email)
                add_card(page, "deploy", "triển khai", wav_path)
                add_card(page, "confirm", "xác nhận", wav_path)
                page.evaluate("navigator.serviceWorker.ready")
                now_ms = complete_timed_learning(page, clock_file, START_MS)
                offline_reconnect(page, context)
                clock_file.write_text(str(now_ms))
                multi_client(browser, context, page, origin, email)
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
