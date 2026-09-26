"""A fake vault on the loopback: a real HTTP server the SDK reaches over urllib,
as the npm tests stub fetch. A test sets the route and reads back the requests
the fake saw. No network beyond 127.0.0.1."""

from __future__ import annotations

import json
import socket
import threading
from collections.abc import Callable
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest


@dataclass
class Captured:
    method: str
    path: str  # after /v0, for example "/grants/grant_1/status"
    headers: dict[str, str]  # lowercased names
    body: Any  # parsed JSON, or None


Answer = tuple[int, Any]
Route = Callable[[Captured], Answer]


def _not_found(_req: Captured) -> Answer:
    return 404, {"ok": False, "code": "not_found", "message": "vault words"}


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):  # a client that gave up mid-answer
        pass


class FakeVault:
    def __init__(self) -> None:
        self.requests: list[Captured] = []
        self.route: Route = _not_found
        vault = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args: Any) -> None:
                pass

            def _serve(self) -> None:
                length = int(self.headers.get("content-length") or 0)
                raw = self.rfile.read(length) if length else b""
                path = self.path[len("/v0") :] if self.path.startswith("/v0") else self.path
                req = Captured(
                    self.command,
                    path,
                    {k.lower(): v for k, v in self.headers.items()},
                    json.loads(raw) if raw else None,
                )
                vault.requests.append(req)
                status, answer = vault.route(req)
                data = json.dumps(answer).encode("utf-8")
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = do_DELETE = _serve

        self.server = _QuietServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}/v0"

    def answer(self, body: Any, status: int = 200) -> None:
        """Every request gets this answer."""
        self.route = lambda _req: (status, body)

    def refuse(self, code: str, status: int) -> None:
        """Every request gets this refusal, in the vault's error shape."""
        self.answer({"ok": False, "code": code, "message": "vault words"}, status)

    @property
    def last(self) -> Captured:
        return self.requests[-1]

    def reset(self) -> None:
        self.requests.clear()
        self.route = _not_found

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture(scope="session")
def _vault_server():
    vault = FakeVault()
    yield vault
    vault.close()


@pytest.fixture
def vault(_vault_server: FakeVault):
    _vault_server.reset()
    yield _vault_server
    _vault_server.reset()


@pytest.fixture
def unreachable() -> str:
    """A base URL nothing listens on."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    return f"http://127.0.0.1:{port}/v0"
