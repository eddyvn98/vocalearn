"""Browser acceptance for reconciled session summary and error-book evidence UX."""

import os
from pathlib import Path
import socket
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

from browser_acceptance_next import register_and_create_set, wait_server

ROOT=Path(__file__).resolve().parents[1]


def metric(page,label,value):
    item=page.locator(".summary .metric").filter(has_text=label)
    expect(item).to_have_count(1)
    expect(item.locator("strong")).to_have_text(str(value))


def finish(page):
    page.locator('[data-action="pause"]').click()
    expect(page.locator(".resume")).to_be_visible()
    page.locator('.resume [data-action="finish"]').click()
    expect(page.locator(".summary")).to_be_visible()


def main():
    if os.environ.get("PW_BROWSER","chromium")!="chromium":
        print("SKIP: summary/error-book acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-summary-e2e-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
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
                page=context.new_page();page.goto(origin,wait_until="networkidle")
                register_and_create_set(page,"summary-e2e@example.test")
                page.locator('[data-action="samples"]').click()
                expect(page.locator(".metric")).to_have_count(4)

                # First new-learning interaction is started/pending, not graduated.
                page.locator('[data-action="setupNew"]').click()
                page.locator('[data-action="startSession"]').click()
                expect(page.locator(".study-meta")).to_contain_text("Lật thẻ")
                page.locator('[data-action="flip"]').click()
                page.locator('[data-action="remember"]').click()
                expect(page.locator("#feedback")).to_be_visible()
                finish(page)
                metric(page,"Từ mới đã bắt đầu",1)
                metric(page,"Từ mới đã tốt nghiệp",0)
                expect(page.locator(".summary")).to_contain_text("thẻ còn bước học đang chờ")
                expect(page.locator(".summary")).to_contain_text("thay đổi chưa đồng bộ")
                page.reload(wait_until="networkidle")
                metric(page,"Từ mới đã bắt đầu",1)
                metric(page,"Từ mới đã tốt nghiệp",0)
                print("PASS: waiting learning step is pending, not mislabeled as graduated")

                page.locator('.summary [data-action="home"]').click()
                page.locator('[data-action="practice"][data-game="typing"]').click()
                page.locator('[data-action="startSession"]').click()
                expect(page.locator("#answer")).to_be_visible()
                correct=page.evaluate("() => import('/js/state.js').then(m => m.current().answers[0])")

                # Record a failure episode offline, finish, reload offline, then reconnect.
                context.set_offline(True)
                page.locator("#answer").fill("definitely-wrong")
                page.locator("#answer-form [type='submit']").click()
                expect(page.locator("#input-error")).not_to_be_empty()
                page.locator("#answer").fill(correct)
                page.locator("#answer-form [type='submit']").click()
                expect(page.locator("#feedback")).to_be_visible()
                finish(page)
                metric(page,"Vào sổ từ sai",1)
                expect(page.locator(".summary")).to_contain_text("thay đổi chưa đồng bộ")

                page.reload(wait_until="domcontentloaded")
                metric(page,"Vào sổ từ sai",1)
                context.set_offline(False)
                page.wait_for_timeout(1000)
                page.locator('[data-action="syncInfo"]:visible').first.click()
                page.locator('[data-action="sync"]').click()
                expect(page.locator("dialog")).to_contain_text("0 thay đổi chờ đồng bộ")
                page.locator('[data-action="close"]').click()
                metric(page,"Vào sổ từ sai",1)

                page.locator('.summary [data-action="errors"]').click()
                row=page.locator(".word-row").filter(has_text=correct).first
                expect(row).to_be_visible()
                details=row.locator(".error-evidence")
                details.locator("summary").click()
                expect(details).to_contain_text("Số lỗi trong đợt hiện tại: 1")
                expect(details).to_contain_text("Tổng lỗi lịch sử: 1")
                expect(details).to_contain_text("vẫn cần ít nhất 1 game nhớ lại")
                expect(details).to_contain_text("cách nhau ít nhất 10 phút")
                expect(details).to_contain_text("Đặt lại lịch học không xóa tổng lỗi lịch sử")
                print("PASS: offline/reconnect keeps summary counts stable and error-book exit evidence is explainable")

                context.close();browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()


if __name__=="__main__":
    main()
