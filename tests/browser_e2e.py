"""Real Chromium regression for the critical offline-first browser journey.

Run: python -m pip install playwright==1.57.0
     python -m playwright install chromium
     python tests/browser_e2e.py
Uses a disposable database and a fresh browser profile; never real user data.
"""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "tests" / "browser-evidence"


def add_word(page, word, meaning):
    page.locator('[data-action="add"]').first.click()
    form = page.locator("#word-form")
    expect(form).to_be_visible()
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()


def wait_for_server(server, origin):
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


def login(page):
    expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
    page.locator('[name="email"]').fill("e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator('[data-action="library"]')).to_be_visible(timeout=10000)


def sync_from_ui(page):
    page.locator('[data-action="syncInfo"]').first.click()
    expect(page.locator("#modal")).to_be_visible()
    page.locator('#modal [data-action="sync"]').click()
    page.locator('#modal [data-action="close"]').click()


def run_journey(page, context, browser, origin, errors, clock_path):
    page.goto(page.url, wait_until="networkidle")
    expect(page.locator("#auth-form")).to_be_visible(timeout=10000)
    assert not errors, "Browser module/runtime errors: " + repr(errors)

    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill("e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()

    page.locator('#set-form [name="name"]').fill("English E2E")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="add"]').first).to_be_visible()
    add_word(page, "apple", "quả táo")
    expect(page.locator("body")).to_contain_text("1")
    page.locator('[data-action="library"]').click()
    apple_row = page.locator(".word-row", has_text="apple")
    expect(apple_row).to_be_visible()
    apple_row.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    page.locator("#image-upload").set_input_files(
        {"name": "apple.png", "mimeType": "image/png", "buffer": png}
    )
    details = page.locator("#word-form details")
    if not details.get_attribute("open"):
        details.locator("summary").click()
    expect(page.locator("#media-image img")).to_be_visible()
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("#word-form")).not_to_be_visible()

    page.locator('[data-action="settings"]').first.click()
    expect(page.locator("#settings-form")).to_be_visible()
    settings_details = page.locator("#settings-form details")
    if not settings_details.get_attribute("open"):
        settings_details.locator("summary").click()
    page.locator('#settings-form [name="maxInterval"]').fill("30")
    page.locator('#settings-form [type="submit"]').click()
    expect(page.locator("#settings-form")).not_to_be_visible()
    page.locator('[data-action="settings"]').first.click()
    settings_details = page.locator("#settings-form details")
    if not settings_details.get_attribute("open"):
        settings_details.locator("summary").click()
    expect(page.locator('#settings-form [name="maxInterval"]')).to_have_value("30")
    page.locator('#modal [data-action="close"]').click()
    page.locator('[data-action="library"]').click()
    page.locator('[data-action="customFields"]').click()
    expect(page.locator("#custom-field-form")).to_be_visible()
    page.locator('#custom-field-form [name="name"]').fill("Source")
    page.locator('#custom-field-form [name="type"]').select_option("select")
    page.locator('#custom-field-form [name="options"]').fill("Meeting, Docs")
    page.locator('#custom-field-form [type="submit"]').click()
    expect(page.locator("#modal")).to_contain_text("Source")
    page.locator('#modal [data-action="close"]').click()
    apple_row = page.locator(".word-row", has_text="apple")
    apple_row.locator('[data-action="edit"]').click()
    details = page.locator("#word-form details")
    if not details.get_attribute("open"):
        details.locator("summary").click()
    custom_select = page.locator('#word-form select[name^="custom:"]')
    expect(custom_select).to_be_visible()
    custom_select.select_option(label="Meeting")
    page.locator('#word-form [type="submit"]').click()
    apple_row = page.locator(".word-row", has_text="apple")
    apple_row.locator('[data-action="edit"]').click()
    details = page.locator("#word-form details")
    if not details.get_attribute("open"):
        details.locator("summary").click()
    expect(page.locator('#word-form select[name^="custom:"]')).to_have_value("Meeting")
    page.locator('#modal [data-action="close"]').click()
    print("PASS: custom field definition and card value persist")
    
    # Language-profile smoke: Chinese set creation exposes Chinese-specific editor fields.
    page.locator('[data-action="sets"]').click()
    set_form = page.locator("#set-form")
    set_form.locator('[name="name"]').fill("Chinese")
    set_form.locator('[name="language"]').select_option("zh")
    set_form.locator('[name="meaningLanguage"]').select_option("vi")
    set_form.locator('button[type="submit"]').click()
    page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]').first.click()
    details = page.locator("#word-form details")
    details.locator("summary").click()
    expect(page.locator('[name="pinyin"]')).to_be_visible()
    expect(page.locator('[name="hanViet"]')).to_be_visible()
    expect(page.locator('[name="radical"]')).to_be_visible()
    page.locator('[name="word"]').fill("你好")
    page.locator('[name="meaning"]').fill("xin chào")
    page.locator('[name="pinyin"]').fill("nǐ hǎo")
    page.locator('[name="classifier"]').fill("句")
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("#word-form")).not_to_be_visible()
    chinese_data = page.evaluate("""async () => {
      const user = JSON.parse(localStorage.getItem('vocalearn-user'));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('vocalearn-' + user.id);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      const events = await new Promise((resolve, reject) => {
        const req = db.transaction('events').objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      db.close();
      const event = events.filter(e => e.kind === 'word' && e.data.patch.word === '你好').at(-1);
      return {pinyinSyllables:event?.data.patch.pinyinSyllables,classifiers:event?.data.patch.classifiers};
    }""")
    assert chinese_data["pinyinSyllables"] == [{"base":"ni","tone":3},{"base":"hao","tone":3}]
    assert chinese_data["classifiers"] == ["句"]
    page.locator('[data-action="sets"]').click()
    page.locator('[data-action="selectSet"]', has_text="English").click()
    print("PASS: Chinese study set exposes language-specific editor fields")
    print("PASS: register -> create set -> add card -> persist advanced settings")

    page.locator('[data-action="home"]').click()
    page.locator('[data-action="setupNew"]').click()
    expect(page.locator("#modal")).to_be_visible()
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator('[data-action="flip"]')).to_be_visible()
    page.locator('[data-action="flip"]').click()
    remember = page.locator('[data-action="remember"]')
    expect(remember).to_be_visible()
    remember.evaluate("(el) => { el.click(); el.click(); }")
    expect(page.locator("#feedback")).to_be_visible()

    answer_count = page.evaluate("""async () => {
      const user = JSON.parse(localStorage.getItem('vocalearn-user'));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('vocalearn-' + user.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const events = await new Promise((resolve, reject) => {
        const req = db.transaction('events').objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return events.filter(e => e.kind === 'answer').length;
    }""")
    assert answer_count == 1, "Double UI submit created duplicate final answers"
    page.locator('[data-action="next"]').click()
    expect(page.locator('[data-action="home"]').first).to_be_visible()
    page.locator('[data-action="home"]').first.click()
    print("PASS: duplicate UI action still records one final answer")

    # Advance the trusted server clock through the 1/10/10-minute learning waits.
    # With one card, step 1 quiz falls back to flash; step 2 spell falls back to typing.
    # The first answer was recorded before this block; anchor fake time to its persisted effectiveAt.
    base_clock = page.evaluate("""async () => {
      const user = JSON.parse(localStorage.getItem('vocalearn-user'));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('vocalearn-' + user.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const events = await new Promise((resolve, reject) => {
        const req = db.transaction('events').objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const answers = events.filter(e => e.kind === 'answer');
      return Math.max(...answers.map(e => e.effectiveAt || e.at));
    }""")
    phase_now = base_clock + 61_000
    clock_path.write_text(str(phase_now))
    page.clock.install(time=phase_now)
    sync_from_ui(page)
    page.reload(wait_until="networkidle")
    page.locator('[data-action="setupReview"]').click()
    expect(page.locator("#modal")).to_contain_text("1/1")
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator('[data-action="flip"]')).to_be_visible()
    page.locator('[data-action="flip"]').click()
    page.locator('[data-action="remember"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="next"]').click()
    page.locator('[data-action="home"]').first.click()

    phase_now = base_clock + 61_000 + 601_000
    clock_path.write_text(str(phase_now))
    page.clock.set_fixed_time(phase_now)
    sync_from_ui(page)
    page.reload(wait_until="networkidle")
    page.locator('[data-action="setupReview"]').click()
    expect(page.locator("#modal")).to_contain_text("1/1")
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator("#answer")).to_be_visible()
    page.locator("#answer").fill("apple")
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="next"]').click()
    page.locator('[data-action="home"]').first.click()

    phase_now = base_clock + 61_000 + 1_202_000
    clock_path.write_text(str(phase_now))
    page.clock.set_fixed_time(phase_now)
    sync_from_ui(page)
    page.reload(wait_until="networkidle")
    page.locator('[data-action="setupReview"]').click()
    expect(page.locator("#modal")).to_contain_text("1/1")
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator("#answer")).to_be_visible()
    page.locator("#answer").fill("apple")
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="next"]').click()
    page.locator('[data-action="home"]').first.click()
    page.clock.set_fixed_time(int(time.time() * 1000))
    clock_path.write_text(str(int(time.time() * 1000)))
    print("PASS: trusted fake clock completes 1/10/10-minute learning progression")

    page.locator('[data-action="setupFree"]').click()
    expect(page.locator("#modal")).to_be_visible()
    game_select = page.locator("#setup-game")
    if game_select.count():
        game_select.select_option("typing")
    face_select = page.locator("#setup-face")
    expect(face_select).to_be_visible()
    face_select.select_option("ipa")
    game_select.select_option("quiz")
    game_select.select_option("typing")
    expect(page.locator("#setup-face")).to_have_value("ipa")
    page.locator('#modal [data-action="close"]').click()
    page.locator('[data-action="setupFree"]').click()
    expect(page.locator("#setup-game")).to_have_value("typing")
    expect(page.locator("#setup-face")).to_have_value("ipa")
    page.locator("#setup-face").select_option("meaning")
    page.locator('#modal [data-action="startSession"]').click()
    print("PASS: game/face setup persists per study set")

    # Browser-level matching: complete both pairs using visible labels.
    page.locator('[data-action="pause"]').click()
    expect(page.locator('[data-action="library"]').first).to_be_visible()
    page.locator('[data-action="library"]').first.click()
    add_word(page, "banana", "quả chuối")
    # A newly-created card may still be only local here. Sync before opening a
    # setup whose eligibility depends on the complete two-card pool.
    sync_from_ui(page)
    page.reload(wait_until="networkidle")
    page.locator('[data-action="home"]').first.click()
    expect(page.locator('[data-action="setupFree"]')).to_be_visible()
    page.locator('[data-action="setupFree"]').click()
    expect(page.locator("#setup-game")).to_be_visible()
    page.locator("#setup-game").select_option("match")
    page.locator("#setup-game").dispatch_event("change")
    expect(page.locator("#modal")).to_contain_text("2/2")
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator('[data-action="matchLeft"]').first).to_be_visible()
    for word, meaning in [("apple", "quả táo"), ("banana", "quả chuối")]:
        left = page.locator('[data-action="matchLeft"]', has_text=word)
        expect(left).to_be_visible()
        left.click()
        page.locator('[data-action="matchRight"]', has_text=meaning).click()
        expect(left).to_be_disabled()
    page.locator('[data-action="finish"]').click()
    expect(page.locator('[data-action="home"]').first).to_be_visible()
    page.locator('[data-action="home"]').first.click()
    print("PASS: matching interaction records both correct pairs")

    # Browser-level cloze: persist a sentence-specific answer, then answer it.
    page.locator('[data-action="library"]').click()
    apple_row = page.locator(".word-row", has_text="apple")
    apple_row.locator('[data-action="edit"]').click()
    details = page.locator("#word-form details")
    if not details.get_attribute("open"):
        details.locator("summary").click()
    page.locator('#word-form [name="sentence"]').fill("I ate an ___ today.")
    page.locator('#word-form [name="answers"]').fill("apple")
    page.locator('#word-form [type="submit"]').click()
    page.locator('[data-action="home"]').first.click()
    page.locator('[data-action="setupFree"]').click()
    page.locator("#setup-game").select_option("cloze")
    page.locator("#setup-game").dispatch_event("change")
    expect(page.locator("#modal")).to_contain_text("1/2")
    page.locator('#modal [data-action="startSession"]').click()
    expect(page.locator("#answer")).to_be_visible()
    expect(page.locator(".prompt")).to_contain_text("I ate an ___ today.")
    page.locator("#answer").fill("apple")
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#feedback")).to_be_visible()
    page.locator('[data-action="next"]').click()
    page.locator('[data-action="home"]').first.click()
    print("PASS: cloze uses the sentence-specific answer")

    # Start a normal typing session for browser Back + retry/reload persistence.
    page.locator('[data-action="setupFree"]').click()
    page.locator("#setup-game").select_option("typing")
    page.locator("#setup-game").dispatch_event("change")
    page.locator("#setup-face").select_option("meaning")
    page.locator('#modal [data-action="startSession"]').click()
    answer = page.locator("#answer")
    expect(answer).to_be_visible()
    answer.fill("draft answer")
    answer_count_before_back = page.evaluate("""async () => {
      const user = JSON.parse(localStorage.getItem('vocalearn-user'));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('vocalearn-' + user.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const events = await new Promise((resolve, reject) => {
        const req = db.transaction('events').objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return events.filter(e => e.kind === 'answer').length;
    }""")
    page.go_back()
    expect(page.locator('[data-action="resume"]').first).to_be_visible(timeout=10000)
    page.go_forward()
    expect(page.locator("#answer")).to_have_value("draft answer")
    answer_count_after_back = page.evaluate("""async () => {
      const user = JSON.parse(localStorage.getItem('vocalearn-user'));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('vocalearn-' + user.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const events = await new Promise((resolve, reject) => {
        const req = db.transaction('events').objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return events.filter(e => e.kind === 'answer').length;
    }""")
    assert answer_count_after_back == answer_count_before_back, "Browser Back submitted an unfinished answer"
    print("PASS: browser Back preserves draft answer without submitting it")
    answer = page.locator("#answer")
    prompt_text = page.locator(".prompt").inner_text()
    retry_value = "applf" if "táo" in prompt_text else "bananb"
    correct_value = "apple" if "táo" in prompt_text else "banana"
    answer.fill(retry_value)
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#input-error")).to_contain_text("Sai 1 ký tự")
    page.reload(wait_until="networkidle")
    expect(page.locator('[data-action="resume"]').first).to_be_visible(timeout=10000)
    page.locator('[data-action="resume"]').first.click()
    expect(page.locator("#answer")).to_have_value(retry_value)
    expect(page.locator("#input-error")).to_contain_text("Sai 1 ký tự")
    page.locator("#answer").fill(correct_value)
    page.locator('#answer-form [type="submit"]').click()
    expect(page.locator("#feedback")).to_contain_text("Đúng sau khi sửa")
    page.locator('[data-action="next"]').click()
    if page.locator('[data-action="home"]').count():
        page.locator('[data-action="home"]').first.click()
    else:
        page.locator('[data-action="pause"]').click()
    print("PASS: retry state survives reload and finishes once")

    page.evaluate("() => navigator.serviceWorker.ready")
    page.reload(wait_until="networkidle")
    expect(page.locator('[data-action="library"]')).to_be_visible()
    page.locator('[data-action="library"]').click()
    expect(page.locator('[data-action="add"]').first).to_be_visible()
    expect(page.locator("body")).to_contain_text("apple")
    print("PASS: reload restores authenticated local state")

    context.set_offline(True)
    add_word(page, "grape", "quả nho")
    status = page.locator('[data-action="syncInfo"]').first
    expect(status).to_contain_text("thay đổi chờ đồng bộ")
    pending_before = status.inner_text()

    page.reload(wait_until="domcontentloaded")
    expect(page.locator('[data-action="library"]')).to_be_visible(timeout=10000)
    expect(page.locator("body")).to_contain_text("Đang offline")
    expect(page.locator('[data-action="syncInfo"]').first).to_contain_text(
        "thay đổi chờ đồng bộ"
    )
    page.locator('[data-action="library"]').click()
    expect(page.locator('[data-action="add"]').first).to_be_visible()
    expect(page.locator("body")).to_contain_text("grape")
    print("PASS: offline edit survives a real page reload")

    context.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.locator('[data-action="syncInfo"]').first.click()
    sync_button = page.locator('[data-action="sync"]')
    if sync_button.count():
        sync_button.click()
    expect(page.locator('[data-action="syncInfo"]').first).not_to_contain_text(
        "thay đổi chờ đồng bộ", timeout=10000
    )
    page.reload(wait_until="networkidle")
    page.locator('[data-action="library"]').click()
    expect(page.locator("body")).to_contain_text("apple")
    expect(page.locator("body")).to_contain_text("grape")
    assert pending_before, "Expected an offline pending-sync status"
    print("PASS: reconnect syncs pending events without losing cards")

    second = browser.new_context(viewport={"width": 1280, "height": 900})
    second_page = second.new_page()
    second_errors = []
    second_page.on("pageerror", lambda error: second_errors.append(str(error)))
    try:
        second_page.goto(origin, wait_until="networkidle")
        login(second_page)
        second_page.locator('[data-action="library"]').click()
        expect(second_page.locator("body")).to_contain_text("apple")
        expect(second_page.locator("body")).to_contain_text("banana")
        apple_second = second_page.locator(".word-row", has_text="apple")
        apple_second.locator('[data-action="edit"]').click()
        details_second = second_page.locator("#word-form details")
        if not details_second.get_attribute("open"):
            details_second.locator("summary").click()
        expect(second_page.locator("#media-image img")).to_be_visible(timeout=10000)
        second_page.locator('#modal [data-action="close"]').click()
        print("PASS: content-addressed image syncs into a second browser profile")

        second.set_offline(True)
        add_word(second_page, "cherry", "quả anh đào")
        expect(second_page.locator('[data-action="syncInfo"]').first).to_contain_text(
            "thay đổi chờ đồng bộ"
        )
        second_page.reload(wait_until="domcontentloaded")
        expect(second_page.locator("body")).to_contain_text("cherry")
        second.set_offline(False)
        expect(second_page.locator('[data-action="syncInfo"]').first).not_to_contain_text(
            "thay đổi chờ đồng bộ", timeout=10000
        )

        sync_from_ui(page)
        page.locator('[data-action="library"]').click()
        expect(page.locator("body")).to_contain_text("cherry")
        print("PASS: second browser profile reconnects and merges into first profile")
        assert not second_errors, "Second profile runtime errors: " + repr(second_errors)
    finally:
        second.close()

    tab = context.new_page()
    tab_errors = []
    tab.on("pageerror", lambda error: tab_errors.append(str(error)))
    try:
        tab.goto(origin, wait_until="networkidle")
        expect(tab.locator('[data-action="library"]')).to_be_visible(timeout=10000)
        tab.locator('[data-action="library"]').click()
        add_word(page, "delta", "thay đổi")
        add_word(tab, "echo", "tiếng vọng")
        expect(page.locator("body")).to_contain_text("echo", timeout=10000)
        expect(tab.locator("body")).to_contain_text("delta", timeout=10000)
        print("PASS: multi-tab IndexedDB transactions broadcast without losing edits")
        assert not tab_errors, "Second tab runtime errors: " + repr(tab_errors)
    finally:
        tab.close()

    assert not errors, "Browser runtime errors: " + repr(errors)


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="voca-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        clock_path = Path(temp) / "clock.txt"
        clock_path.write_text(str(int(time.time() * 1000)))
        env = dict(
            os.environ,
            PORT=str(port),
            HOST="127.0.0.1",
            DB_PATH=str(Path(temp) / "test.sqlite"),
            ALLOW_SIGNUP="true",
            NODE_ENV="test",
            APP_ORIGIN=origin,
            TEST_CLOCK_PATH=str(clock_path),
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
                wait_for_server(server, origin)
                with sync_playwright() as p:
                    browser = p.chromium.launch()
                    context = browser.new_context(viewport={"width": 1280, "height": 900})
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.goto(origin, wait_until="domcontentloaded")
                        run_journey(page, context, browser, origin, errors, clock_path)
                    finally:
                        page.screenshot(
                            path=str(EVIDENCE / "last-page.png"), full_page=True
                        )
                        (EVIDENCE / "page-errors.json").write_text(
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
