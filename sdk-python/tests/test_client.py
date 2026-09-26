"""The Outlet client: connect on both paths, the default base URL, the async
twin, and what a repr shows."""

import asyncio

from support import WIRE_SESSION

import useoutlet.client as client_module
import useoutlet.http as http_module
from useoutlet import AsyncOutlet, GrantRequest, Outlet, OutletSession

CAMEL = {"grantRequestId": "gr_1", "grantUrl": "https://useoutlet.dev/grant/gr_1"}
SNAKE = {"grant_request_id": "gr_1", "grant_url": "https://useoutlet.dev/grant/gr_1"}


class TestConfidentialConnect:
    def test_posts_the_request_with_the_app_secret_and_returns_the_grant_request(self, vault):
        vault.answer(CAMEL, 201)
        outlet = Outlet("app_x", "apps_x", base_url=vault.base_url)
        assert not outlet.public
        request = outlet.connect(
            ["openai"], requested_cap_usd=10, redirect_uri="https://app.example/cb"
        )
        assert request == GrantRequest("gr_1", "https://useoutlet.dev/grant/gr_1")
        assert request.state is None and request.verifier is None
        req = vault.last
        assert (req.method, req.path) == ("POST", "/grants")
        assert req.headers["x-outlet-app-secret"] == "apps_x"
        assert req.headers["content-type"] == "application/json"
        assert req.headers["user-agent"].startswith("useoutlet-python/")
        assert req.body == {
            "app_id": "app_x",
            "providers": ["openai"],
            "requested_cap_usd": 10,
            "redirect_uri": "https://app.example/cb",
        }
        assert "code_challenge" not in req.body

    def test_leaves_out_what_was_not_given(self, vault):
        vault.answer(CAMEL, 201)
        Outlet("app_x", "apps_x", base_url=vault.base_url).connect(["openai"])
        assert vault.last.body == {"app_id": "app_x", "providers": ["openai"]}

    def test_reads_the_snake_case_spelling_too(self, vault):
        vault.answer(SNAKE, 201)
        request = Outlet("app_x", "apps_x", base_url=vault.base_url).connect(["openai"])
        assert (request.id, request.grant_url) == ("gr_1", "https://useoutlet.dev/grant/gr_1")

    def test_a_single_provider_string_becomes_a_list(self, vault):
        vault.answer(CAMEL, 201)
        Outlet("app_x", "apps_x", base_url=vault.base_url).connect("openai")
        assert vault.last.body["providers"] == ["openai"]

    def test_an_empty_secret_makes_a_public_client(self):
        assert Outlet("app_x", "").public
        assert Outlet("app_x", None).public
        assert not Outlet("app_x", "apps_x").public


class TestPublicConnect:
    def test_posts_pkce_params_holds_the_request_and_returns_its_secrets(self, vault):
        vault.answer(SNAKE, 201)
        outlet = Outlet("app_x", base_url=vault.base_url)
        request = outlet.connect(["anthropic"], 10, "https://app.example/cb")
        assert request.id == "gr_1"
        assert len(request.state) == 22  # 16 random bytes, base64url unpadded
        assert len(request.verifier) == 43
        assert "x-outlet-app-secret" not in vault.last.headers
        assert vault.last.body["code_challenge_method"] == "S256"
        assert vault.last.body["requested_cap_usd"] == 10
        assert request.state in outlet._pending

    def test_forgets_a_request_the_user_never_finished(self, vault, monkeypatch):
        vault.answer(SNAKE, 201)
        outlet = Outlet("app_x", base_url=vault.base_url)
        request = outlet.connect(["anthropic"], redirect_uri="https://app.example/cb")
        monkeypatch.setattr(client_module, "_PENDING_TTL", -1.0)
        outlet.connect(["anthropic"], redirect_uri="https://app.example/cb")
        assert request.state not in outlet._pending


class TestBaseUrl:
    def test_defaults_to_the_production_vault(self):
        assert Outlet("app_x").base_url == "https://api.useoutlet.dev/v0"
        assert http_module.DEFAULT_BASE_URL == "https://api.useoutlet.dev/v0"

    def test_follows_the_default_set_before_the_call(self, monkeypatch):
        # the seam the quickstart harness uses: the fake vault stands in for
        # api.useoutlet.dev with the printed code untouched
        monkeypatch.setattr(http_module, "DEFAULT_BASE_URL", "http://127.0.0.1:1/v0")
        assert Outlet("app_x").base_url == "http://127.0.0.1:1/v0"
        assert Outlet("app_x", base_url="http://staging/v0").base_url == "http://staging/v0"


class TestAsyncOutlet:
    def test_runs_the_grant_flow_off_the_event_loop(self, vault):
        polls = []

        def route(req):
            if req.method == "POST":
                return 201, CAMEL
            polls.append(req.path)
            if len(polls) == 1:
                return 200, {"status": "pending"}
            return 200, {"status": "complete", **WIRE_SESSION}

        vault.route = route

        async def flow():
            outlet = AsyncOutlet("app_x", "apps_x", base_url=vault.base_url)
            assert not outlet.public
            request = await outlet.connect(["openai"], requested_cap_usd=10)
            return await outlet.wait(request.id, interval=0)

        session = asyncio.run(flow())
        assert session.grant_id == "grant_1"
        assert polls == ["/grants/gr_1", "/grants/gr_1"]

    def test_the_other_calls_reach_the_sync_client(self, vault):
        async def flow():
            outlet = AsyncOutlet("app_x", base_url=vault.base_url)
            vault.answer({**WIRE_SESSION, "refresh_token": "rt_2"})
            fresh = await outlet.refresh("grant_1", refresh_token="rt_1")
            vault.answer(
                {
                    "grantId": "grant_1",
                    "status": "active",
                    "providers": ["openai"],
                    "capUsd": 5,
                    "spendUsd": 0,
                }
            )
            info = await outlet.status("grant_1")
            vault.answer({"ok": True})
            await outlet.revoke("grant_1")
            return fresh, info

        fresh, info = asyncio.run(flow())
        assert fresh.refresh_token == "rt_2"
        assert info.status == "active"
        assert vault.last.headers["authorization"] == "Bearer rt_2"
        assert AsyncOutlet.direct({"openai": "sk-proj-x"}).mode == "direct"


class TestReprsHideSecrets:
    def test_session_and_request(self):
        session = OutletSession.from_wire({**WIRE_SESSION, "refresh_token": "rt_secret"})
        assert "sk-scoped" not in repr(session)
        assert "rt_secret" not in repr(session)
        assert "grant_1" in repr(session)
        request = GrantRequest("gr_1", "https://x", state="st", verifier="very-secret")
        assert "very-secret" not in repr(request)
        assert "st" in repr(request)
