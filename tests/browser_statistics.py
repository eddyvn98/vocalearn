"""Phase-3 advanced statistics browser acceptance."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def wait_server(server,origin):
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("server did not start")

def main():
    with tempfile.TemporaryDirectory(prefix="voca-g3-stats-") as temp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",
                 DB_PATH=str(Path(temp)/"test.sqlite"),ALLOW_SIGNUP="true",
                 NODE_ENV="test",APP_ORIGIN=origin)
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env,
                                stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                page=browser.new_page(viewport={"width":1280,"height":900})
                errors=[];page.on("pageerror",lambda error: errors.append(str(error)))
                page.goto(origin,wait_until="networkidle")
                page.locator('[data-action="toggleAuth"]').click()
                page.locator('[name="email"]').fill("stats@example.test")
                page.locator('[name="password"]').fill("disposable-password-123")
                page.locator('#auth-form [type="submit"]').click()
                expect(page.locator("#set-form")).to_be_visible()
                page.locator('#set-form [name="name"]').fill("Statistics")
                page.locator('#set-form [type="submit"]').click()
                expect(page.locator('[data-action="samples"]')).to_be_visible()
                page.locator('[data-action="samples"]').click()
                page.locator('[data-action="statistics"]').click()
                expect(page.locator("h1")).to_have_text("Thống kê")
                metrics=page.locator(".metrics .metric")
                expect(metrics).to_have_count(3)
                expect(page.locator(".panel")).to_contain_text("Chưa có hoạt động")
                page.go_back();expect(page.locator('[data-action="statistics"]')).to_be_visible()
                page.go_forward();expect(page.locator("h1")).to_have_text("Thống kê")
                page.locator('[data-action="scope"]').click()
                expect(page.locator("dialog")).to_be_visible()
                assert not errors,repr(errors)
                browser.close()
                print("PASS: Phase-3 statistics navigation, metrics and empty activity state")
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait()

if __name__=="__main__":
    main()
