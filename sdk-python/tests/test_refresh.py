"""refresh() token rotation (OAuth 2.1 section 6.1, SPEC section 7.1), mirroring
sdk/test/refresh.test.ts, plus the client that holds the token: the rotated
token replaces the old one."""

import pytest
from support import WIRE_SESSION

from useoutlet import ConnectionEndedError, Outlet, refresh


class TestPublicClientBearer:
    def test_surfaces_the_rotated_token_and_strips_the_wire_key(self, vault):
        vault.answer({**WIRE_SESSION, "refresh_token": "rt_new"})
        s = refresh("grant_1", refresh_token="rt_old", base_url=vault.base_url)
        assert s.refresh_token == "rt_new"
        assert not hasattr(s, "refreshToken")
        assert s.keys["openai"] == "sk-scoped"
        req = vault.last
        assert (req.method, req.path) == ("POST", "/grants/grant_1/refresh")
        assert req.headers["authorization"] == "Bearer rt_old"
        assert req.body is None


class TestConfidentialClientAppSecret:
    def test_passes_the_session_through_unchanged_no_refresh_token(self, vault):
        vault.answer(WIRE_SESSION)
        s = refresh("grant_1", app_secret="apps_x", base_url=vault.base_url)
        assert s.refresh_token is None
        assert s.grant_id == "grant_1"
        assert s.mode is None  # absent on the wire = vault
        assert vault.last.headers["x-outlet-app-secret"] == "apps_x"
        assert "authorization" not in vault.last.headers


class TestTheClientHoldsTheToken:
    def test_the_rotated_token_replaces_the_old_in_the_client(self, vault):
        outlet = Outlet("app_x", base_url=vault.base_url)
        vault.answer({**WIRE_SESSION, "refresh_token": "rt_2"})
        first = outlet.refresh("grant_1", refresh_token="rt_1")  # seeded from the app's store
        assert first.refresh_token == "rt_2"
        assert vault.last.headers["authorization"] == "Bearer rt_1"

        vault.answer(
            {
                "grantId": "grant_1",
                "status": "active",
                "providers": ["openai"],
                "capUsd": 5,
                "spendUsd": 0,
            }
        )
        outlet.status("grant_1")
        assert vault.last.headers["authorization"] == "Bearer rt_2"

        vault.answer({**WIRE_SESSION, "refresh_token": "rt_3"})
        assert outlet.refresh("grant_1").refresh_token == "rt_3"
        assert vault.last.headers["authorization"] == "Bearer rt_2"

        vault.answer({"ok": True})
        outlet.revoke("grant_1")
        assert (vault.last.method, vault.last.path) == ("DELETE", "/grants/grant_1")
        assert vault.last.headers["authorization"] == "Bearer rt_3"

        # after revoke the client holds nothing for the grant: a public client
        # then sends no credential at all, and the vault's 401 is the end
        vault.refuse("unauthorized", 401)
        with pytest.raises(ConnectionEndedError) as e:
            outlet.status("grant_1")
        assert e.value.reason == "expired"
        assert "authorization" not in vault.last.headers

    def test_a_confidential_client_uses_its_secret_unless_a_token_is_given(self, vault):
        outlet = Outlet("app_x", "apps_x", base_url=vault.base_url)
        vault.answer(WIRE_SESSION)
        outlet.refresh("grant_1")
        assert vault.last.headers["x-outlet-app-secret"] == "apps_x"
        assert "authorization" not in vault.last.headers
        outlet.refresh("grant_1", refresh_token="rt_1")
        assert vault.last.headers["authorization"] == "Bearer rt_1"
        assert "x-outlet-app-secret" not in vault.last.headers

    def test_an_explicit_token_is_used_and_its_rotation_kept(self, vault):
        outlet = Outlet("app_x", base_url=vault.base_url)
        vault.answer({**WIRE_SESSION, "refresh_token": "rt_b"})
        outlet.refresh("grant_1", refresh_token="rt_a")
        vault.answer({"ok": True})
        outlet.revoke("grant_1")
        assert vault.last.headers["authorization"] == "Bearer rt_b"
