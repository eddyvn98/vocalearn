"""Live acceptance for the source-first English autofill chain."""
import re
import time
import uuid
from playwright.sync_api import expect, sync_playwright

ORIGIN="https://vocalearn-web-production.up.railway.app"

def main():
    stamp=time.strftime("%Y%m%d-%H%M%S")
    email=f"source.qa.{stamp}.{uuid.uuid4().hex[:6]}@example.test"
    password="Qa-"+uuid.uuid4().hex+"-A1!"
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={"width":1280,"height":900})
        health=context.request.get(ORIGIN+"/api/health")
        assert health.status==200
        health_json=health.json()
        assert health_json.get("commit")=="42610bd86ddb08753795e495dfb7399200c33bde",health_json

        page=context.new_page()
        page.goto(ORIGIN,wait_until="networkidle")
        page.locator('[data-action="toggleAuth"]').click()
        page.locator('[name="email"]').fill(email)
        page.locator('[name="password"]').fill(password)
        page.locator('#auth-form [type="submit"]').click()
        expect(page.locator("#set-form")).to_be_visible(timeout=10000)

        page.locator('#set-form [name="name"]').fill("Source Chain QA")
        page.locator("#set-language").select_option("en")
        page.locator("#set-meaning-language").select_option("vi")
        page.locator('#set-form [type="submit"]').click()
        page.locator('[data-action="library"]').first.click()
        page.locator('[data-action="add"]').first.click()

        form=page.locator("#word-form")
        form.locator('[name="word"]').fill("confirm")
        form.locator('[name="word"]').press("Tab")
        expect(form.locator("#autofill-status")).to_have_text(re.compile(r"kho chung"),timeout=12000)
        page.get_by_text("Trường bổ sung",exact=True).click()

        expect(form.locator('[name="meaning"]')).not_to_have_value("")
        expect(form.locator('[name="ipa"]')).not_to_have_value("")
        expect(form.locator('[name="pos"]')).not_to_have_value("")
        expect(form.locator('[name="level"]')).to_have_value("B1",timeout=12000)
        expect(form.locator('[name="collocations"]')).not_to_have_value("",timeout=12000)

        variants=form.locator('[name="variants"]').input_value()
        assert all(x in variants for x in ["confirms","confirmed","confirming"]),variants
        source=form.locator('[name="source"]').input_value()
        for required in ["MinhQND Dictionary","CEFR-J","Morphology","Datamuse"]:
            assert required in source,source
        assert "AI fallback" not in source,source

        print("PASS: live source-first autofill")
        print("commit:",health_json.get("commit"))
        print("meaning:",form.locator('[name="meaning"]').input_value())
        print("level:",form.locator('[name="level"]').input_value())
        print("variants:",variants)
        print("collocations:",form.locator('[name="collocations"]').input_value())
        print("wordFamily:",form.locator('[name="wordFamily"]').input_value() or "(not available from current sources)")
        print("source:",source)
        context.close()
        browser.close()

if __name__=="__main__":
    main()
