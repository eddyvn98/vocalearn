"""Phase-2 AT-23 sentence-pool browser acceptance."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]

SENTENCES=[
    {"text":"Teams deploy changes every Friday.","targetForm":"deploy","acceptedAnswers":["deploy"]},
    {"text":"We deploy after tests pass.","targetForm":"deploy","acceptedAnswers":["deploy"]},
    {"text":"They deploy the patch tonight.","targetForm":"deploy","acceptedAnswers":["deploy"]},
    {"text":"Engineers deploy safely.","targetForm":"deploy","acceptedAnswers":["deploy"]},
    {"text":"I deploy from the release branch.","targetForm":"deploy","acceptedAnswers":["deploy"]},
]

class Provider(BaseHTTPRequestHandler):
    def do_POST(self):
        length=int(self.headers.get("content-length","0"))
        self.rfile.read(length)
        content=json.dumps({"sentences":SENTENCES})
        body=json.dumps({"choices":[{"message":{"content":content}}]}).encode()
        self.send_response(200);self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*args):
        pass

def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0));return sock.getsockname()[1]

def wait_server(process,origin):
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError("server exited")
        try:
            with urlopen(origin+"/api/health",timeout=1) as response:
                if response.status==200:return
        except OSError: time.sleep(0.1)
    raise RuntimeError("server did not start")

def choose_cloze(page):
    page.locator('[data-action="home"]').first.click()
    page.locator('[data-action="setupFree"]').click()
    game=page.locator("#setup-game")
    game.select_option("cloze");game.dispatch_event("change")
    start=page.locator('[data-action="startSession"]')
    expect(start).to_be_enabled(timeout=20000)
    start.click()
    expect(page.locator(".prompt h1")).to_be_visible()
    return page.locator(".prompt h1").inner_text()

def main():
    provider_port=free_port()
    provider=ThreadingHTTPServer(("127.0.0.1",provider_port),Provider)
    threading.Thread(target=provider.serve_forever,daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="voca-sentences-") as temp:
        port=free_port();origin=f"http://127.0.0.1:{port}"
        env=dict(os.environ,PORT=str(port),HOST="127.0.0.1",DB_PATH=str(Path(temp)/"test.sqlite"),
                 ALLOW_SIGNUP="true",NODE_ENV="test",APP_ORIGIN=origin,
                 AI_BASE_URL=f"http://127.0.0.1:{provider_port}/v1",AI_MODEL="local-test")
        server=subprocess.Popen(["node","server/main.js"],cwd=ROOT,env=env,
                                stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            wait_server(server,origin)
            with sync_playwright() as p:
                browser=p.chromium.launch()
                page=browser.new_page(viewport={"width":1280,"height":900})
                errors=[];page.on("pageerror",lambda error:errors.append(str(error)))
                page.goto(origin,wait_until="networkidle")
                page.locator('[data-action="toggleAuth"]').click()
                page.locator('[name="email"]').fill("sentences@example.test")
                page.locator('[name="password"]').fill("disposable-password-123")
                page.locator('#auth-form [type="submit"]').click()
                page.locator('#set-form [name="name"]').fill("English")
                page.locator('#set-form [type="submit"]').click()
                page.locator('[data-action="library"]').first.click()
                page.locator('[data-action="add"]').first.click()
                form=page.locator("#word-form")
                form.locator('[name="word"]').fill("deploy")
                form.locator('[name="meaning"]').fill("triển khai")
                form.locator('[type="submit"]').click()
                expect(form).not_to_be_visible()

                first=choose_cloze(page)
                page.locator("#answer").fill("deployed")
                page.locator('#answer-form [type="submit"]').click()
                expect(page.locator("#feedback")).to_be_visible(timeout=5000)
                assert "Chưa đúng" in page.locator("#feedback").inner_text()
                page.locator('[data-action="next"]').click()
                expect(page.locator(".summary")).to_be_visible()

                second=choose_cloze(page)
                assert second!=first,(first,second)
                page.locator('[data-action="pause"]').click()

                page.locator('[data-action="library"]').first.click()
                page.get_by_role("button",name="Sửa thẻ",exact=True).click()
                page.get_by_text("Trường bổ sung",exact=True).click()
                page.get_by_text("Phát âm & câu ví dụ",exact=True).click()
                reports=page.locator('[data-action="sentenceReport"]')
                expect(reports).to_have_count(5)
                reports.first.click()
                page.get_by_text("Trường bổ sung",exact=True).click()
                page.get_by_text("Phát âm & câu ví dụ",exact=True).click()
                expect(page.locator('[data-action="sentenceReport"]')).to_have_count(4)

                assert not errors,repr(errors)
                browser.close()
                print("PASS: AT-23 sentence pool runtime, strict inflection, rotation and report")
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
    provider.shutdown();provider.server_close()

if __name__=="__main__":
    main()
