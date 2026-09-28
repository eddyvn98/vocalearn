"""Chromium acceptance for Phase-2 AI suggestions and offline sentence pool."""
import tempfile
from playwright.sync_api import expect, sync_playwright
from browser_support import start_server, stop_server
def main():
    with tempfile.TemporaryDirectory(prefix="voca-ai-e2e-") as temp:
        server, log, origin = start_server(temp, {"TEST_AI_PROVIDER": "true"})
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch();context = browser.new_context(viewport={"width":1280,"height":900});page=context.new_page();errors=[]
                page.on("pageerror",lambda error: errors.append(str(error)))
                try:
                    page.goto(origin,wait_until="networkidle");page.locator('[data-action="toggleAuth"]').click()
                    page.locator('[name="email"]').fill("phase2-ai@example.test");page.locator('[name="password"]').fill("disposable-password-123")
                    page.locator('#auth-form [type="submit"]').click();expect(page.locator("#set-form")).to_be_visible(timeout=10000)
                    page.locator('#set-form [name="name"]').fill("AI Work");page.locator('#set-form [type="submit"]').click()
                    page.locator('[data-action="library"]').click();page.locator('[data-action="add"]').first.click()
                    form=page.locator("#word-form");form.locator('[name="word"]').fill("deploy");form.locator('[name="meaning"]').fill("triển khai");form.locator('[type="submit"]').click()
                    row=page.locator(".word-row",has_text="deploy");row.locator('[data-action="ai"]').click();expect(page.locator("#modal")).to_contain_text("AI · deploy")
                    page.locator('[data-action="aiGenerate"][data-kind="sentences"]').click()
                    expect(page.locator("#modal")).to_contain_text("We use deploy in practice example",timeout=10000)
                    page.locator('#modal [data-action="close"]').click();page.locator('[data-action="home"]').first.click()
                    page.locator('[data-action="setupFree"]').click();page.locator("#setup-game").select_option("cloze");page.locator("#setup-game").dispatch_event("change")
                    expect(page.locator("#modal")).to_contain_text("1/1");page.locator('#modal [data-action="startSession"]').click()
                    expect(page.locator(".prompt")).to_contain_text("___");page.locator("#answer").fill("deploy");page.locator('#answer-form [type="submit"]').click()
                    expect(page.locator("#feedback")).to_be_visible();assert not errors,"AI browser runtime errors: "+repr(errors)
                    print("PASS: AI sentence pool generates, syncs and grades")
                finally: context.close();browser.close()
        finally: stop_server(server,log)
if __name__=="__main__": main()
