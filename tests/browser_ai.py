"""Phase-2 AI editor acceptance with a local self-hosted-provider stub."""
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

class Provider(BaseHTTPRequestHandler):
    def do_POST(self):
        length=int(self.headers.get("content-length","0"))
        self.rfile.read(length)
        content=json.dumps({"meaningCandidates":["triển khai","đưa vào vận hành"],"mnemonic":"deploy = đưa lên"})
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

def main():
    provider_port=free_port()
    provider=ThreadingHTTPServer(("127.0.0.1",provider_port),Provider)
    thread=threading.Thread(target=provider.serve_forever,daemon=True);thread.start()
    with tempfile.TemporaryDirectory(prefix="voca-ai-") as temp:
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
                page.locator('[name="email"]').fill("ai@example.test")
                page.locator('[name="password"]').fill("disposable-password-123")
                page.locator('#auth-form [type="submit"]').click()
                page.locator('#set-form [name="name"]').fill("English")
                page.locator('#set-form [type="submit"]').click()
                page.locator('[data-action="library"]').first.click()
                page.locator('[data-action="add"]').first.click()
                form=page.locator("#word-form");form.locator('[name="word"]').fill("deploy")
                form.locator('[type="submit"]').click()
                expect(form).not_to_be_visible()
                page.get_by_role("button",name="Sửa thẻ",exact=True).click()
                panel=page.locator("#ai-panel");expect(panel).to_be_visible()
                expect(panel.locator('[data-action="aiStart"]')).to_be_enabled()
                panel.locator('[data-action="aiStart"]').click()
                expect(panel.get_by_text("triển khai",exact=True)).to_be_visible(timeout=10000)
                panel.locator('[data-action="aiMeaning"][data-index="0"]').click()
                expect(page.locator('#word-form [name="meaning"]')).to_have_value("triển khai")
                page.locator('[data-action="close"]').first.click()
                page.get_by_text("triển khai",exact=True).wait_for(timeout=5000)
                assert not errors,repr(errors)
                browser.close()
                print("PASS: Phase-2 AI jobs protect editor flow and explicit meaning choice")
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
    provider.shutdown();provider.server_close()

if __name__=="__main__":
    main()
