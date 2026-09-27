"""Chromium acceptance for released Phase-2 Chinese study behavior."""
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_support import start_server, stop_server


def add_chinese_word(page, word, meaning, pinyin, classifier=""):
    page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]').first.click()
    form = page.locator('#word-form')
    expect(form).to_be_visible()
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    details = form.locator('details')
    if not details.get_attribute('open'):
        details.locator('summary').click()
    form.locator('[name="pinyin"]').fill(pinyin)
    if classifier:
        form.locator('[name="classifier"]').fill(classifier)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()


def sync_from_ui(page):
    page.locator('[data-action="syncInfo"]').first.click()
    expect(page.locator('#modal')).to_be_visible()
    page.locator('#modal [data-action="sync"]').click()
    expect(page.locator('[data-action="syncInfo"]').first).not_to_contain_text(
        'thay đổi chờ đồng bộ', timeout=10000
    )
    page.locator('#modal [data-action="close"]').first.click()


def main():
    with tempfile.TemporaryDirectory(prefix='voca-zh-e2e-') as temp:
        server, log, origin = start_server(temp)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(origin, wait_until='networkidle')
                    page.locator('[data-action="toggleAuth"]').click()
                    page.locator('[name="email"]').fill('phase2-chinese@example.test')
                    page.locator('[name="password"]').fill('disposable-password-123')
                    page.locator('#auth-form [type="submit"]').click()
                    expect(page.locator('#set-form')).to_be_visible(timeout=10000)

                    language = page.locator('#set-language')
                    assert language.locator('option[value="zh"]').count() == 1
                    assert language.locator('option[value="ja"]').count() == 0, (
                        'Unreleased Japanese profile must not be advertised'
                    )
                    page.locator('#set-form [name="name"]').fill('Chinese Phase 2')
                    language.select_option('zh')
                    page.locator('#set-form [name="meaningLanguage"]').select_option('vi')
                    page.locator('#set-form [type="submit"]').click()
                    expect(page.locator('[data-action="library"]')).to_be_visible()

                    add_chinese_word(page, '书', 'sách', 'shū', '本')
                    add_chinese_word(page, '输', 'thua', 'shū')
                    sync_from_ui(page)

                    page.locator('[data-action="home"]').first.click()
                    page.locator('[data-action="setupFree"]').click()
                    game = page.locator('#setup-game')
                    expect(game).to_be_visible()
                    assert game.locator('option[value="tone"]').count() == 1
                    assert game.locator('option[value="classifier"]').count() == 1
                    game.select_option('mix')
                    game.dispatch_event('change')
                    expect(page.locator('[data-mix-game="tone"]')).to_be_visible()
                    expect(page.locator('[data-mix-game="classifier"]')).to_be_visible()

                    page.locator('#setup-game').select_option('typing')
                    page.locator('#setup-game').dispatch_event('change')
                    page.locator('#setup-face').select_option('meaning')
                    expect(page.locator('#modal')).to_contain_text('2/2')
                    page.locator('#modal [data-action="startSession"]').click()

                    prompt = page.locator('.prompt h1').inner_text()
                    expected_form = '书' if 'sách' in prompt else '输'
                    answer = page.locator('#answer')
                    expect(answer).to_be_visible()
                    answer.fill('shu1')
                    page.locator('#answer-form [type="submit"]').click()
                    expect(page.locator('#feedback')).not_to_be_visible()
                    choices = page.locator('[data-action="formChoice"]')
                    expect(choices).to_have_count(2)
                    choice_text = set(choices.all_inner_texts())
                    assert choice_text == {'书', '输'}, choice_text
                    page.locator('[data-action="formChoice"]', has_text=expected_form).click()
                    expect(page.locator('#feedback')).to_be_visible()
                    page.locator('[data-action="next"]').click()
                    if page.locator('[data-action="home"]').count():
                        page.locator('[data-action="home"]').first.click()
                    elif page.locator('[data-action="pause"]').count():
                        page.locator('[data-action="pause"]').click()

                    sync_from_ui(page)
                    assert not errors, 'Chinese browser runtime errors: ' + repr(errors)
                    print('PASS: Phase-2 Chinese profile is gated and two-step typing syncs')
                finally:
                    context.close()
                    browser.close()
        finally:
            stop_server(server, log)


if __name__ == '__main__':
    main()
