#!/usr/bin/env python3
"""The README's quickstart, as printed (the CI job "quickstart-python").

Reads the "## Quickstart" section of sdk-python/README.md and takes its three
code blocks verbatim: the install line, the script, the run line. In a fresh
venv it runs the install line with one substitution, the path of the wheel
`python -m build` made of this checkout in place of the package name, so the
script runs this branch's SDK and not the published one. Then it writes the
script as quickstart.py, starts a fake vault on 127.0.0.1 that answers the two
calls the script makes, and runs the printed run line with the app secret the
script reads in the environment. The fake stands in for api.useoutlet.dev
through a sitecustomize.py in the fresh venv, which sets the SDK's default
base URL before the printed code runs; the printed code itself is untouched.
It checks that the script exits 0 and prints the grant URL, and that the fake
saw nothing but the connection request and its polls, each carrying the app
secret.

    python scripts/quickstart_as_printed.py [dist/useoutlet-x.y.z-py3-none-any.whl]
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SDK = Path(__file__).resolve().parents[1]
SECRET = "apps_quickstart"
GRANT_URL = "https://useoutlet.dev/grant/gr_quickstart"


def log(*a: object) -> None:
    print("[quickstart]", *a, flush=True)


def fail(why: str) -> None:
    print("[quickstart] FAIL:", why, file=sys.stderr, flush=True)
    sys.exit(1)


# 1. The printed blocks.
readme = (SDK / "README.md").read_text("utf-8")
start = readme.find("\n## Quickstart\n")
if start < 0:
    fail("README.md has no '## Quickstart' section")
rest = readme[start + len("\n## Quickstart\n") :]
stop = re.search(r"\n##+ ", rest)
section = rest if stop is None else rest[: stop.start()]
blocks = [(m.group(1), m.group(2)) for m in re.finditer(r"```(\w+)\n(.*?)```", section, re.S)]
if [lang for lang, _ in blocks] != ["sh", "python", "sh"]:
    found = [lang for lang, _ in blocks]
    fail(f"expected three blocks (sh, python, sh) in the Quickstart section, found {found}")
install_line = blocks[0][1].strip()
script = blocks[1][1]
run_line = blocks[2][1].strip()
if install_line != "pip install useoutlet":
    fail(f"unexpected install line: {install_line}")
if run_line != "python quickstart.py":
    fail(f"unexpected run line: {run_line}")

# 2. The wheel of this checkout.
wheel = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else next(iter(sorted((SDK / "dist").glob("useoutlet-*.whl"))), None)
)
if wheel is None or not wheel.exists():
    fail("no useoutlet-*.whl in dist/: run `python -m build` first")

# 3. A fresh venv, the printed install line with the wheel in place of the name.
work = Path(tempfile.mkdtemp(prefix="outlet-quickstart-"))
venv = work / "venv"
subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
bin_dir = venv / ("Scripts" if os.name == "nt" else "bin")
env = {
    **os.environ,
    "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
    "VIRTUAL_ENV": str(venv),
}
env.pop("PYTHONPATH", None)
substituted = install_line.replace("useoutlet", shlex.quote(str(wheel)), 1)
log(f"install line as printed: {install_line}; run with the wheel: {substituted}")
subprocess.run(shlex.split(substituted), check=True, cwd=work, env=env)
(work / "quickstart.py").write_text(script, "utf-8")


# 4. A fake vault on the loopback: the confidential path the script takes.
seen: list[tuple[str, str, str | None, object]] = []
polls = 0


class Vault(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a: object) -> None:
        pass

    def _answer(self, status: int, body: object) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        raw = self.rfile.read(int(self.headers.get("content-length") or 0))
        body = json.loads(raw) if raw else None
        seen.append(("POST", self.path, self.headers.get("x-outlet-app-secret"), body))
        if self.path != "/v0/grants":
            self._answer(404, {"ok": False, "code": "not_found", "message": "grant not found"})
            return
        self._answer(201, {"grantRequestId": "gr_quickstart", "grantUrl": GRANT_URL})

    def do_GET(self) -> None:
        global polls
        seen.append(("GET", self.path, self.headers.get("x-outlet-app-secret"), None))
        if self.path != "/v0/grants/gr_quickstart":
            self._answer(404, {"ok": False, "code": "not_found", "message": "grant not found"})
            return
        polls += 1
        if polls == 1:
            self._answer(200, {"status": "pending"})
            return
        provider = next(
            (
                b["providers"][0]
                for m, p, _s, b in seen
                if m == "POST" and isinstance(b, dict) and b.get("providers")
            ),
            "openai",
        )
        self._answer(
            200,
            {
                "status": "complete",
                "grantId": "grant_quickstart",
                "keys": {provider: "app-key-from-the-fake-vault"},
                "capUsd": 10,
                "expiresAt": "2026-12-31T00:00:00Z",
            },
        )


server = ThreadingHTTPServer(("127.0.0.1", 0), Vault)
threading.Thread(target=server.serve_forever, daemon=True).start()
base_url = f"http://127.0.0.1:{server.server_address[1]}/v0"

# The one stand-in: the fake's address as the SDK's default, set before the
# printed code runs. sitecustomize is imported by every interpreter start in
# this venv.
purelib = subprocess.run(
    [str(bin_dir / "python"), "-c", "import sysconfig; print(sysconfig.get_paths()['purelib'])"],
    check=True,
    capture_output=True,
    text=True,
    env=env,
).stdout.strip()
(Path(purelib) / "sitecustomize.py").write_text(
    f"import useoutlet.http\nuseoutlet.http.DEFAULT_BASE_URL = {base_url!r}\n", "utf-8"
)
log(
    f"the fake vault at {base_url} stands in for api.useoutlet.dev; app secret in OUTLET_APP_SECRET"
)

# 5. The printed run line.
log("$", run_line)
run = subprocess.run(
    shlex.split(run_line),
    cwd=work,
    env={**env, "OUTLET_APP_SECRET": SECRET},
    capture_output=True,
    text=True,
    timeout=90,
)
server.shutdown()
sys.stdout.write(run.stdout)
sys.stderr.write(run.stderr)

problems = []
if run.returncode != 0:
    problems.append(f"the script exited {run.returncode}")
if GRANT_URL not in run.stdout:
    problems.append("the script did not print the grant URL the vault answered")
posts = [r for r in seen if r[0] == "POST"]
gets = [r for r in seen if r[0] == "GET"]
if [r[1] for r in posts] != ["/v0/grants"]:
    problems.append(f"expected one POST /v0/grants, saw {[r[1] for r in posts]}")
if not gets or any(r[1] != "/v0/grants/gr_quickstart" for r in gets):
    problems.append(f"expected polls of /v0/grants/gr_quickstart, saw {[r[1] for r in gets]}")
if any(r[2] != SECRET for r in seen):
    problems.append("a request reached the vault without the app secret")
if posts and (
    not isinstance(posts[0][3], dict)
    or not posts[0][3].get("providers")
    or not posts[0][3].get("app_id")
):
    problems.append(f"the connection request body is not the one the SDK sends: {posts[0][3]!r}")
if problems:
    fail("\n  ".join(problems))
log(
    f"PASS: the printed script connected through {wheel.name} against the fake vault "
    f"({len(seen)} requests, all on {base_url}, each with the app secret)"
)
