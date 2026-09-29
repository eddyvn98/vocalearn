"""Phase-2 pronunciation and Han-Viet lookup editor acceptance."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_server(server, origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("server exited")
        try:
            with urlopen(origin + "/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def register(page, origin, email, set_name, language):
    page.goto(origin, wait_until="networkidle")
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill(email)
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()
    page.locator('#set-form [name="name"]').fill(set_name)
    page.locator("#set-language").select_option(language)
    page.locator("#set-meaning-language").select_option("vi")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="library"]')).to_be_visible()


def open_add(page, word, meaning):
    page.locator('[data-action="library"]').first.click()
    page.locator('[data-action="add"]').first.click()
    form = page.locator("#word-form")
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.get_by_text("Trường bổ sung", exact=True).click()
    form.get_by_text("Phát âm & câu ví dụ", exact=True).click()
    return form


def saved_word(page, spelling):
    return page.evaluate(
        """async (spelling) => {
          const {app} = await import('/js/state.js');
          const found = Object.values(app.model.words).find(
            item => !item.deleted && item.word === spelling
          );
          if (!found) return null;
          return {
            word: found.word,
            ipa: found.ipa || '',
            pinyin: found.pinyin || '',
            hanViet: found.hanViet || '',
            lookupMeta: found.lookupMeta || {}
          };
        }""",
        spelling,
    )


def english_acceptance(page, origin):
    register(page, origin, "lookup-en@example.test", "English Lookups", "en")

    def autofill_route(route):
        if "word=launch" in route.request.url:
            route.fulfill(status=200, content_type="application/json", body='''{"result":{"status":"found","cacheHit":true,"aiCacheHit":true,"aiConfigured":true,"fetchedAt":123,"fields":{"meaning":"khởi chạy","pos":"verb","ipa":"lɔːntʃ","sentence":"We will ___ tomorrow.","answers":["launch"],"synonyms":["start"],"antonyms":[],"collocations":["launch an app"],"register":"trung tính","level":"B1","mnemonic":"đưa vào hoạt động","source":"dictionaryapi.dev"},"dictionary":{"license":{"name":"test"}}}}''')
        else:
            route.fulfill(status=200, content_type="application/json", body='''{"result":{"status":"missing","cacheHit":false,"fields":{},"source":"dictionaryapi.dev"}}''')
    page.route("**/api/autofill?*", autofill_route)

    page.locator('[data-action="library"]').first.click()
    page.locator('[data-action="add"]').first.click()
    form = page.locator("#word-form")
    form.locator('[name="word"]').fill("launch")
    form.locator('[name="word"]').press("Tab")
    expect(form.locator('[name="meaning"]')).to_have_value("khởi chạy")
    expect(form.locator('[name="pos"]')).to_have_value("verb")
    expect(form.locator('[name="ipa"]')).to_have_value("lɔːntʃ")
    expect(form.locator('[name="sentence"]')).to_have_value("We will ___ tomorrow.")
    expect(form.locator('[name="collocations"]')).to_have_value("launch an app")
    expect(form.locator("#autofill-status")).to_contain_text("kho chung")
    form.locator('[name="meaning"]').fill("cách viết riêng của tôi")
    form.locator('[data-action="autofillWord"]').click()
    expect(form.locator('[name="meaning"]')).to_have_value("cách viết riêng của tôi")
    page.wait_for_function("() => import('/js/state.js').then(({app}) => !app.busy)")
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator('#modal > header [data-action="close"]').click()
    expect(page.locator("dialog")).not_to_be_visible()
    print("PASS: shared autofill runs automatically and preserves user-written overrides")

    form = open_add(page, "deploy", "triển khai")
    form.locator('[data-action="lookupReading"]').click()
    expect(form.locator('[name="ipa"]')).not_to_have_value("")
    expect(form.locator("#lookup-status")).to_contain_text("đã tra từ nguồn dữ liệu")
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

    deploy = saved_word(page, "deploy")
    assert deploy, deploy
    assert deploy["lookupMeta"]["ipa"]["source"] == "open-dict-data/ipa-dict:en_US"
    assert deploy["lookupMeta"]["ipa"]["version"]
    assert deploy["lookupMeta"]["ipa"]["license"] == "MIT"
    assert deploy["lookupMeta"]["ipa"]["confirmed"] is True
    assert deploy["lookupMeta"]["ipa"]["needsCheck"] is False

    form = open_add(page, "record", "bản ghi")
    form.locator('[data-action="lookupReading"]').click()
    expect(form.locator('[name="ipa"]')).not_to_have_value("")
    expect(form.locator("#lookup-status")).to_contain_text("có nhiều cách đọc")
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

    record = saved_word(page, "record")
    assert record, record
    assert record["lookupMeta"]["ipa"]["confirmed"] is True
    assert record["lookupMeta"]["ipa"]["needsCheck"] is True

    form = open_add(page, "vocalearn-not-a-real-dictionary-word", "không có")
    form.locator('[data-action="lookupReading"]').click()
    expect(form.locator('[name="ipa"]')).to_have_value("")
    expect(form.locator("#lookup-status")).to_contain_text("không có dữ liệu xác nhận")
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

    missing = saved_word(page, "vocalearn-not-a-real-dictionary-word")
    assert missing, missing
    assert missing["ipa"] == ""
    assert "ipa" not in missing["lookupMeta"]

    form = open_add(page, "live", "sống")
    form.locator('[data-action="lookupReading"]').click()
    expect(form.locator('[name="ipa"]')).not_to_have_value("")
    expect(form.locator("#lookup-status")).to_contain_text("có nhiều cách đọc")
    form.locator('[name="ipa"]').fill("manual-reading")
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

    manual = saved_word(page, "live")
    assert manual, manual
    assert manual["ipa"] == "manual-reading"
    assert manual["lookupMeta"]["ipa"] == {
        "source": "user",
        "version": "manual-v1",
        "license": "user-provided",
        "status": "user",
        "needsCheck": False,
        "confirmed": True,
    }


def chinese_acceptance(page, origin):
    register(page, origin, "lookup-zh@example.test", "Chinese Lookups", "zh")
    form = open_add(page, "中国", "Trung Quốc")
    form.locator('[data-action="lookupReading"]').click()
    expect(form.locator('[name="pinyin"]')).to_have_value("zhōng guó")
    expect(form.locator('[name="hanViet"]')).to_have_value("trung quốc")
    expect(form.locator("#lookup-status")).to_contain_text("Pinyin: đã tra từ nguồn dữ liệu")
    expect(form.locator("#lookup-status")).to_contain_text("Âm Hán Việt: đã tra từ nguồn dữ liệu")
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()

    word = saved_word(page, "中国")
    assert word, word
    assert word["pinyin"] == "zhōng guó"
    assert word["hanViet"] == "trung quốc"
    for field in ("pinyin", "hanViet"):
        meta = word["lookupMeta"][field]
        assert meta["source"] == "Unicode Unihan via @vearvip/hanzi-readings"
        assert "Unicode-17.0.0" in meta["version"]
        assert meta["confirmed"] is True
        assert meta["needsCheck"] is False


def main():
    if os.environ.get("PW_BROWSER", "chromium") != "chromium":
        print("SKIP: lookup editor acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-lookups-") as temp:
        port = free_port()
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
        server = subprocess.Popen(
            ["node", "server/main.js"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )
        try:
            wait_server(server, origin)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                errors = []

                english_context = browser.new_context(viewport={"width": 1280, "height": 900})
                english = english_context.new_page()
                english.on("pageerror", lambda error: errors.append(str(error)))
                english_acceptance(english, origin)
                english_context.close()

                chinese_context = browser.new_context(viewport={"width": 1280, "height": 900})
                chinese = chinese_context.new_page()
                chinese.on("pageerror", lambda error: errors.append(str(error)))
                chinese_acceptance(chinese, origin)
                chinese_context.close()

                assert not errors, repr(errors)
                browser.close()
                print("PASS: Phase-2 lookup editor persists deterministic provenance and missing-data safety")
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    main()
