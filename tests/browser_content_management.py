"""Browser acceptance for extended card fields, topic scope and scoped bulk operations."""

import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]


def create_topic(page,name,parent=None):
    page.locator('[data-action="topics"]').click()
    expect(page.locator("#topic-form")).to_be_visible()
    page.locator('#topic-form [name="name"]').fill(name)
    if parent:
        page.locator('#topic-form [name="parentId"]').select_option(label=parent)
    page.locator('#topic-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def add_card(page,word,meaning,topics=(),extended=False):
    if page.locator('[data-action="add"]:visible').count()==0:
        page.locator('[data-action="library"]').click()
    page.locator('[data-action="add"]:visible').first.click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator('#word-form [name="word"]').fill(word)
    page.locator('#word-form [name="meaning"]').fill(meaning)
    for topic in topics:
        page.locator(f'#word-form input[name="category"]').filter(has=page.locator("xpath=..")).count()
        page.locator(f'label:has-text("{topic}") input[name="category"]').check()
    if extended:
        page.locator("#word-form details summary").click()
        page.locator('[name="level"]').fill("B1")
        page.locator('[name="variants"]').fill("banks, banking")
        page.locator('[name="tags"]').fill("finance, office")
        page.locator('[name="custom"]').fill("Source: Internal notes\nPriority: high")
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def sync_now(page):
    page.locator('[data-action="syncInfo"]:visible').first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator('[data-action="sync"]').click()
    expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
    page.locator('[data-action="close"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def generations(page):
    return page.evaluate(
        """async () => {
          const {app}=await import('/js/state.js');
          return Object.fromEntries(Object.values(app.model.words).map(w=>[
            w.word+'|'+w.meaning,{id:w.id,generation:w.generation,deleted:w.deleted,categories:w.categoryIds}
          ]));
        }"""
    )


def choose_scope(page,name):
    page.locator('[data-action="scope"]').click()
    expect(page.locator("#scope-form")).to_be_visible()
    page.locator(f'label:has-text("{name}") input[name="scope"]').check()
    page.locator('#scope-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: content-management acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-content-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(
            os.environ,PORT=str(port),HOST="127.0.0.1",
            DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
            NODE_ENV="test",APP_ORIGIN=origin,
        )
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                context=browser.new_context(viewport={"width":1280,"height":900})
                page=context.new_page()
                page.goto(origin,wait_until="networkidle")
                register_and_create_set(page,"content-e2e@example.test")
                page.locator('[data-action="library"]').click()

                create_topic(page,"Work")
                create_topic(page,"Meetings","Work")
                add_card(page,"bank","ngân hàng",("Work","Meetings"),extended=True)
                add_card(page,"bank","bờ sông",("Work","Meetings"))
                add_card(page,"deploy","triển khai")
                expect(page.locator(".word-row")).to_have_count(3)
                expect(page.locator(".word-row").filter(has_text="bank")).to_have_count(2)

                # Required/extended fields are editable and custom fields participate in search.
                row=page.locator(".word-row").filter(has_text="ngân hàng")
                row.locator('[data-action="edit"]').click()
                page.locator("#word-form details summary").click()
                expect(page.locator('[name="level"]')).to_have_value("B1")
                expect(page.locator('[name="variants"]')).to_have_value("banks, banking")
                expect(page.locator('[name="tags"]')).to_have_value("finance, office")
                expect(page.locator('[name="custom"]')).to_contain_text("Source: Internal notes")
                expect(page.locator('label:has-text("Work") input[name="category"]')).to_be_checked()
                expect(page.locator('label:has-text("Meetings") input[name="category"]')).to_be_checked()
                page.locator('[data-action="close"]').click()

                page.locator("#search").fill("Internal notes")
                expect(page.locator(".word-row")).to_have_count(1)
                page.locator("#search").fill("")
                sync_now(page)
                page.reload(wait_until="networkidle")
                page.locator('[data-action="library"]').click()
                expect(page.locator(".word-row")).to_have_count(3)
                print("PASS: extended/custom fields and multi-topic membership survive sync/reload")

                # Parent scope recursively includes child memberships but excludes uncategorized deploy.
                choose_scope(page,"Work")
                expect(page.locator(".word-row")).to_have_count(2)
                expect(page.locator(".word-row").filter(has_text="bank")).to_have_count(2)
                expect(page.locator(".word-row").filter(has_text="deploy")).to_have_count(0)

                before=generations(page)
                page.locator('[data-action="selectScope"]').click()
                expect(page.locator(".resume")).to_contain_text("2 thẻ đã chọn")
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="bulkReset"]').click()
                after=generations(page)
                assert after["bank|ngân hàng"]["generation"]!=before["bank|ngân hàng"]["generation"]
                assert after["bank|bờ sông"]["generation"]!=before["bank|bờ sông"]["generation"]
                assert after["deploy|triển khai"]["generation"]==before["deploy|triển khai"]["generation"]

                # Remove only the child membership from current recursive scope; parent keeps both visible.
                page.locator('[data-action="selectScope"]').click()
                page.locator('[data-action="bulkTopic"]').click()
                page.locator('#bulk-topic-form [name="operation"]').select_option("remove")
                page.locator('#bulk-topic-form [name="categoryId"]').select_option(label="Meetings")
                page.locator('#bulk-topic-form [type="submit"]').click()
                expect(page.locator(".word-row")).to_have_count(2)
                row=page.locator(".word-row").filter(has_text="ngân hàng")
                row.locator('[data-action="edit"]').click()
                expect(page.locator('label:has-text("Work") input[name="category"]')).to_be_checked()
                expect(page.locator('label:has-text("Meetings") input[name="category"]')).not_to_be_checked()
                page.locator('[data-action="close"]').click()

                # Delete only the scoped cards, then bulk-restore them from trash.
                page.locator('[data-action="selectScope"]').click()
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="bulkDelete"]').click()
                expect(page.locator(".word-row")).to_have_count(0)
                page.locator('[data-action="clearFilter"]').click()
                expect(page.locator(".word-row")).to_have_count(1)
                expect(page.locator(".word-row")).to_contain_text("deploy")

                page.locator('[data-action="trash"]').click()
                expect(page.locator("dialog")).to_contain_text("2 thẻ")
                page.once("dialog",lambda dialog: dialog.accept())
                page.locator('[data-action="restoreAllDeleted"]').click()
                page.locator('[data-action="close"]').click()
                expect(page.locator(".word-row")).to_have_count(3)
                ids=generations(page)
                assert ids["bank|ngân hàng"]["id"]!=ids["bank|bờ sông"]["id"]
                assert ids["bank|ngân hàng"]["deleted"] is False
                assert ids["bank|bờ sông"]["deleted"] is False
                assert ids["deploy|triển khai"]["deleted"] is False
                print("PASS: recursive scope bounds reset/topic/delete operations and bulk restore preserves sense IDs")

                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
