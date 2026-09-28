"""Post-deploy acceptance for the real shared dictionary autofill path."""
import os
import re
import time
import uuid
from playwright.sync_api import expect, sync_playwright

ORIGIN=os.environ.get("PRODUCTION_ORIGIN","https://vocalearn-web-production.up.railway.app").rstrip("/")

def main():
    email=f"autofill.qa.{time.strftime('%Y%m%d-%H%M%S')}.{uuid.uuid4().hex[:6]}@example.test"
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={"width":1280,"height":900})
        page.goto(ORIGIN,wait_until="networkidle")
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill(email)
        page.locator('[name="password"]').fill("autofill-qa-password-2026")
        page.locator('#auth-form [type="submit"]').click()
        expect(page.locator("#set-form")).to_be_visible()
        page.locator('#set-form [name="name"]').fill("Autofill QA")
        page.locator("#set-language").select_option("en")
        page.locator("#set-meaning-language").select_option("vi")
        page.locator('#set-form [type="submit"]').click()
        page.locator('[data-action="library"]').first.click()
        page.locator('[data-action="add"]').first.click()
        form=page.locator("#word-form")
        form.locator('[name="word"]').fill("confirm")
        form.locator('[name="word"]').press("Tab")
        status=form.locator("#autofill-status")
        expect(status).to_have_text(re.compile(r"kho chung"),timeout=8000)
        expect(form.locator('[name="meaning"]')).not_to_have_value("")
        expect(form.locator('[name="ipa"]')).not_to_have_value("")
        expect(form.locator('[name="pos"]')).not_to_have_value("")
        source=form.locator('[name="source"]').input_value()
        assert "MinhQND Dictionary" in source, source
        original=form.locator('[name="meaning"]').input_value()
        form.locator('[name="meaning"]').fill("nghĩa riêng của người dùng")
        form.locator('[data-action="autofillWord"]').click()
        expect(status).not_to_have_text("Đang tra kho dùng chung…",timeout=20000)
        expect(form.locator('[name="meaning"]')).to_have_value("nghĩa riêng của người dùng")
        form.locator('[type="submit"]').click()
        expect(form).not_to_be_visible(timeout=10000)
        row=page.locator(".word-row").filter(has_text="confirm").first
        row.locator('[data-action="edit"]').click()
        expect(page.locator('[name="meaning"]')).to_have_value("nghĩa riêng của người dùng")
        print("PASS: production local lexical autofill")
        print("first meaning:",original or "(AI enrichment not configured/available)")
        browser.close()

if __name__=="__main__":
    main()
