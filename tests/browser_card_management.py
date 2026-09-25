"""Browser acceptance for card metadata, custom fields, topic scope and bulk operations."""

import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]


def add_word(page,word,meaning,priority=None):
    if page.locator('[data-action="add"]:visible').count()==0:
        page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]:visible').first.click()
    page.locator('#word-form [name="word"]').fill(word)
    page.locator('#word-form [name="meaning"]').fill(meaning)
    page.locator("#word-form details summary").click()
    if priority is not None:
        page.get_by_label("Priority").select_option(priority)
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def create_topic(page,name,parent=None):
    page.locator('[data-action="topics"]').click()
    expect(page.locator("#topic-form")).to_be_visible()
    if parent:
        row=page.locator(".topic-row").filter(has_text=parent).first
        row.locator('[data-action="addSubtopic"]').click()
        expect(page.locator("#topic-form")).to_be_visible()
    page.locator('#topic-form [name="name"]').fill(name)
    page.locator('#topic-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def edit_topics(page,meaning,names):
    row=page.locator(".word-row").filter(has_text=meaning).first
    row.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    for name in names:
        page.get_by_label(name,exact=True).check()
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def choose_scope(page,name):
    page.locator('[data-action="scope"]').click()
    expect(page.locator("#scope-form")).to_be_visible()
    page.get_by_label(name,exact=False).check()
    page.locator('#scope-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def clear_scope(page):
    page.locator('[data-action="scope"]').click()
    expect(page.locator("#scope-form")).to_be_visible()
    page.locator('[data-action="clearScope"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def state_for_banks(page):
    return page.evaluate(
        """async () => {
          const {app}=await import('/js/state.js');
          return Object.values(app.model.words).filter(w=>w.word==='bank').map(w=>({
            id:w.id,meaning:w.meaning,generation:w.generation,deleted:w.deleted,
            categories:[...w.categoryIds],custom:w.custom||{}
          })).sort((a,b)=>a.meaning.localeCompare(b.meaning,'vi'));
        }"""
    )


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: card management acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-cards-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page()
                page.goto(origin,wait_until="networkidle")
                register_and_create_set(page,"cards-e2e@example.test")
                page.locator('[data-action="library"]').click()

                # Per-set custom field definition.
                page.locator('[data-action="customFields"]').click()
                expect(page.locator("#custom-field-form")).to_be_visible()
                page.locator('#custom-field-form [name="label"]').fill("Priority")
                page.locator('#custom-field-form [name="type"]').select_option("select")
                page.locator('#custom-field-form [name="options"]').fill("low, high")
                page.locator('#custom-field-form [type="submit"]').click()
                expect(page.locator("dialog")).to_contain_text("Priority")
                page.locator('[data-action="close"]').click()

                # Same spelling, different meaning must remain separate cards.
                add_word(page,"bank","ngân hàng","high")
                add_word(page,"bank","bờ sông","low")
                expect(page.locator(".word-row").filter(has_text="bank")).to_have_count(2)
                banks=state_for_banks(page)
                assert len(banks)==2 and banks[0]["id"]!=banks[1]["id"]
                assert {b["custom"][next(iter(b["custom"]))] for b in banks}=={"high","low"}

                page.reload(wait_until="networkidle")
                page.locator('[data-action="library"]').click()
                row=page.locator(".word-row").filter(has_text="ngân hàng").first
                row.locator('[data-action="edit"]').click()
                expect(page.get_by_label("Priority")).to_have_value("high")
                page.locator('[data-action="close"]').click()
                print("PASS: custom field and sense-separated cards survive reload")

                # Hierarchical topics and multi-membership.
                create_topic(page,"Work")
                create_topic(page,"BIM","Work")
                create_topic(page,"Finance")
                edit_topics(page,"ngân hàng",["BIM","Finance"])
                edit_topics(page,"bờ sông",["Finance"])

                choose_scope(page,"Work")
                expect(page.locator(".word-row")).to_have_count(1)
                expect(page.locator(".word-row")).to_contain_text("ngân hàng")
                page.locator('[data-action="toggleSelectAll"]').click()
                page.locator('[data-action="bulkTopic"]').click()
                page.locator('#bulk-topic-form [name="categoryId"]').select_option(
                    label="BIM"
                )
                page.locator('#bulk-topic-form [name="operation"]').select_option("remove")
                page.locator('#bulk-topic-form [type="submit"]').click()
                expect(page.locator(".word-row")).to_have_count(0)

                clear_scope(page)
                expect(page.locator(".word-row")).to_have_count(2)
                # Card still retains its independent Finance membership after BIM removal.
                after=state_for_banks(page)
                money=next(b for b in after if b["meaning"]=="ngân hàng")
                assert len(money["categories"])==1
                print("PASS: recursive scope and bulk topic removal preserve other memberships")

                # Scoped selection/reset touches only one card.
                target=page.locator(".word-row").filter(has_text="bờ sông").first
                target.locator('[data-action="toggleSelect"]').check()
                before={b["meaning"]:b["generation"] for b in state_for_banks(page)}
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="bulkReset"]').click()
                after={b["meaning"]:b["generation"] for b in state_for_banks(page)}
                assert before["bờ sông"]!=after["bờ sông"]
                assert before["ngân hàng"]==after["ngân hàng"]

                # Delete selected card and restore all deleted cards.
                target=page.locator(".word-row").filter(has_text="bờ sông").first
                target.locator('[data-action="toggleSelect"]').check()
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="bulkDelete"]').click()
                expect(page.locator(".word-row")).to_have_count(1)
                page.locator('[data-action="trash"]').click()
                expect(page.locator('[data-action="restoreAllWords"]')).to_be_visible()
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="restoreAllWords"]').click()
                page.locator('[data-action="close"]').click()
                expect(page.locator(".word-row")).to_have_count(2)
                print("PASS: scoped reset/delete and bulk restore affect only intended cards")

                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
