"""Chromium acceptance for Phase-3 advanced statistics routing and denominator."""
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_support import register_and_create_set, start_server, stop_server


def add_word(page, word, meaning):
    page.locator('[data-action="library"]').first.click()
    page.locator('[data-action="add"]').first.click()
    form = page.locator('#word-form')
    form.locator('[name="word"]').fill(word)
    form.locator('[name="meaning"]').fill(meaning)
    form.locator('[type="submit"]').click()
    expect(form).not_to_be_visible()


def main():
    with tempfile.TemporaryDirectory(prefix='voca-stats-e2e-') as temp:
        server, log, origin = start_server(temp)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    register_and_create_set(page, origin)
                    add_word(page, 'alpha', 'đầu tiên')
                    add_word(page, 'beta', 'thứ hai')
                    page.locator('[data-action="home"]').first.click()
                    page.locator('[data-action="stats"]').click()
                    expect(page.locator('h1')).to_have_text('Thống kê học tập')
                    expect(page.locator('body')).to_contain_text('0/2')
                    expect(page.locator('body')).to_contain_text('Đã thuộc =')
                    window = page.locator('#stats-window')
                    expect(window).to_have_value('30')
                    window.select_option('7')
                    expect(window).to_have_value('7')
                    expect(page.locator('body')).to_contain_text('Chưa có kết quả câu')
                    assert not errors, 'Statistics browser runtime errors: ' + repr(errors)
                    print('PASS: statistics route keeps explicit active-card denominator and range')
                finally:
                    context.close()
                    browser.close()
        finally:
            stop_server(server, log)


if __name__ == '__main__':
    main()
