import itertools, os, socket, subprocess, tempfile, time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
_ACCOUNT_SEQ = itertools.count(1)

def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def wait_for_server(server, origin):
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

def start_server(temp_dir):
    port = free_port()
    origin = f"http://127.0.0.1:{port}"
    clock_path = Path(temp_dir) / "clock.txt"
    clock_path.write_text(str(int(time.time() * 1000)))
    env = dict(os.environ, PORT=str(port), HOST="127.0.0.1",
        DB_PATH=str(Path(temp_dir) / "test.sqlite"), ALLOW_SIGNUP="true",
        NODE_ENV="test", APP_ORIGIN=origin, TEST_CLOCK_PATH=str(clock_path))
    log = (Path(temp_dir) / "server.log").open("w")
    server = subprocess.Popen(["node","server/main.js"], cwd=ROOT, env=env,
        stdout=log, stderr=subprocess.STDOUT)
    wait_for_server(server, origin)
    return server, log, origin

def stop_server(server, log):
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill(); server.wait()
    log.close()

def register_and_create_set(page, origin):
    page.goto(origin, wait_until="networkidle")
    page.locator('[data-action="toggleAuth"]').click()
    page.locator('[name="email"]').fill(f"aux-e2e-{next(_ACCOUNT_SEQ)}@example.test")
    page.locator('[name="password"]').fill("disposable-password-123")
    page.locator('#auth-form [type="submit"]').click()
    page.locator("#set-form").wait_for(state="visible", timeout=10000)
    page.locator('#set-form [name="name"]').fill("Aux E2E")
    page.locator('#set-form [type="submit"]').click()
