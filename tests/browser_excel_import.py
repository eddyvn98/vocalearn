"""Live-browser Excel import acceptance: embedded image, durable preview, conflict choice, retry."""

import base64
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def wait_server(server, origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Test server exited")
        try:
            with urlopen(origin + "/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("Test server did not become ready")


def register_source(page):
    page.goto(page.url, wait_until="networkidle")
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill("excel-e2e@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    expect(page.locator("#set-form")).to_be_visible()
    page.locator('#set-form [name="name"]').fill("Excel Source")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator('[data-action="samples"]')).to_be_visible()
    page.locator('[data-action="samples"]').click()
    expect(page.locator(".metric")).to_have_count(4)


def edit_deploy(page, image_path=None, note=None):
    page.locator('[data-action="library"]').click()
    row = page.locator(".word-row").filter(has_text="deploy").first
    row.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator("#word-form details summary").click()
    if note is not None:
        page.locator('#word-form textarea[name="note"]').fill(note)
    if image_path is not None:
        page.locator("#image-upload").set_input_files(
            {"name": "deploy.png", "mimeType": "image/png", "buffer": image_path.read_bytes()}
        )
        expect(page.locator("#media-image .editor-image")).to_be_visible()
    page.locator('#word-form [type="submit"]').click()
    expect(page.locator("dialog")).not_to_be_visible()


def export_deploy(page, path):
    row = page.locator(".word-row").filter(has_text="deploy").first
    row.locator(".card-select").check()
    page.once("dialog", lambda dialog: dialog.accept())
    with page.expect_download() as info:
        page.locator('[data-action="export"]').click()
    info.value.save_as(str(path))
    assert path.read_bytes()[:2] == b"PK"


def create_target_set(page):
    page.locator('[data-action="sets"]').click()
    expect(page.locator("#set-form")).to_be_visible()
    page.locator('#set-form [name="name"]').fill("Excel Target")
    page.locator('#set-form [type="submit"]').click()
    expect(page.locator(".game-grid")).to_be_visible()
    page.locator('[data-action="library"]').click()
    expect(page.locator("#word-rows")).to_be_visible()


def preview_xlsx(page, xlsx):
    page.locator('[data-action="import"]').click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator("#import-file").set_input_files(
        {
            "name": "vocalearn-import.xlsx",
            "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "buffer": xlsx.read_bytes(),
        }
    )
    expect(page.locator("#preview-import")).to_be_visible(timeout=10000)
    page.locator("#preview-import").click()
    expect(page.locator("#import-preview .conflict")).to_be_visible(timeout=10000)


def open_deploy_editor(page):
    row = page.locator(".word-row").filter(has_text="deploy")
    expect(row).to_have_count(1)
    row.first.locator('[data-action="edit"]').click()
    expect(page.locator("#word-form")).to_be_visible()
    page.locator("#word-form details summary").click()
    return row


def main():
    if os.environ.get("PW_BROWSER", "chromium") != "chromium":
        print("SKIP: Excel import acceptance runs on Chromium only")
        return

    with tempfile.TemporaryDirectory(prefix="voca-excel-e2e-") as temp:
        temp_path = Path(temp)
        image_path = temp_path / "deploy.png"
        image_path.write_bytes(PNG)
        xlsx = temp_path / "deploy.xlsx"

        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        env = dict(
            os.environ,
            PORT=str(port),
            HOST="127.0.0.1",
            DB_PATH=str(temp_path / "test.sqlite"),
            ALLOW_SIGNUP="true",
            NODE_ENV="test",
            APP_ORIGIN=origin,
        )
        server = subprocess.Popen(["node", "server/main.js"], cwd=ROOT, env=env)
        try:
            wait_server(server, origin)
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
                page = context.new_page()
                page.goto(origin, wait_until="networkidle")
                register_source(page)
                edit_deploy(page, image_path=image_path, note="from spreadsheet")
                export_deploy(page, xlsx)
                create_target_set(page)

                # New-card import: embedded image must be parsed into preview and survive a reload.
                preview_xlsx(page, xlsx)
                expect(page.locator("#import-preview .editor-image")).to_be_visible()
                expect(page.locator("#import-preview")).to_contain_text("1 thêm")
                page.reload(wait_until="networkidle")
                page.locator('[data-action="library"]').click()
                page.locator('[data-action="import"]').click()
                expect(page.locator("#import-preview .editor-image")).to_be_visible()
                expect(page.locator('[data-action="confirmImport"]')).to_be_enabled()
                page.locator('[data-action="confirmImport"]').click()
                expect(page.locator("dialog")).not_to_be_visible()

                open_deploy_editor(page)
                expect(page.locator("#media-image .editor-image")).to_be_visible()
                expect(page.locator('#word-form textarea[name="note"]')).to_have_value("from spreadsheet")
                page.keyboard.press("Escape")

                # Create a local conflict, then retry the same workbook. Default merge must not duplicate.
                edit_deploy(page, note="local choice")
                preview_xlsx(page, xlsx)
                expect(page.locator("#import-preview")).to_contain_text("1 cập nhật")
                expect(page.locator('[data-import-field="note"]')).not_to_be_checked()
                page.locator('[data-action="confirmImport"]').click()
                expect(page.locator("dialog")).not_to_be_visible()
                open_deploy_editor(page)
                expect(page.locator('#word-form textarea[name="note"]')).to_have_value("local choice")
                page.keyboard.press("Escape")
                expect(page.locator(".word-row").filter(has_text="deploy")).to_have_count(1)

                # Explicit conflict choice imports the spreadsheet value, still without a duplicate row.
                preview_xlsx(page, xlsx)
                page.locator('[data-import-field="note"]').check()
                page.locator('[data-action="confirmImport"]').click()
                expect(page.locator("dialog")).not_to_be_visible()
                open_deploy_editor(page)
                expect(page.locator('#word-form textarea[name="note"]')).to_have_value("from spreadsheet")
                expect(page.locator("#media-image .editor-image")).to_be_visible()
                page.keyboard.press("Escape")
                expect(page.locator(".word-row").filter(has_text="deploy")).to_have_count(1)

                print("PASS: Excel import preserves embedded image, draft reload, conflict choice and retry dedup")
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
