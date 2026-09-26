"""Connection ends against the fake vault (sdk/test/ended.test.ts, without the
fetch wrapper the npm package has and Python does not): a capped, revoked or
expired Vault connection is one typed error, ConnectionEndedError, from
status(), refresh() and the client's wait()."""

import pytest
from support import info, refused

from useoutlet import ConnectionEndedError, GrantInfo, Outlet, OutletError, direct, refresh, status
from useoutlet.ended import ended, is_connection_ended

CAPPED_MESSAGE = (
    "This Vault connection is paused at its cap. When the user raises the cap on "
    "useoutlet.dev, refresh() returns the key."
)


def status_or_refuse(vault, answer, code):
    vault.route = lambda req: (
        (200, answer) if req.path.endswith("/status") else (409, refused(code))
    )


class TestVaultCapped:
    @pytest.mark.parametrize("reason", ["spend", "unreadable", "currency"])
    def test_status_and_refresh_raise_connection_ended_capped(self, vault, reason):
        status_or_refuse(vault, info("capped", reason), "grant_capped")
        with pytest.raises(ConnectionEndedError) as a:
            status("grant_1", refresh_token="rt_1", base_url=vault.base_url)
        e = a.value
        assert isinstance(e, OutletError)
        assert (e.code, e.reason, e.grant_id, e.provider, e.status) == (
            "connection_ended", "capped", "grant_1", "openai", 409,
        )  # fmt: skip
        assert e.info == GrantInfo.from_wire(info("capped", reason))
        assert e.info.reason == reason
        assert e.message == CAPPED_MESSAGE
        assert str(e) == CAPPED_MESSAGE
        with pytest.raises(ConnectionEndedError) as b:
            refresh("grant_1", refresh_token="rt_1", base_url=vault.base_url)
        assert (b.value.reason, b.value.grant_id, b.value.status) == ("capped", "grant_1", 409)
        assert b.value.info is None
        assert b.value.__cause__ is not None
        assert b.value.__cause__.code == "grant_capped"


class TestVaultRevokedOrDisconnected:
    def test_status_and_refresh_raise_connection_ended_revoked(self, vault):
        status_or_refuse(vault, info("revoked"), "grant_revoked")
        with pytest.raises(ConnectionEndedError) as a:
            status("grant_1", app_secret="apps_x", base_url=vault.base_url)
        assert (a.value.code, a.value.reason, a.value.grant_id) == (
            "connection_ended", "revoked", "grant_1",
        )  # fmt: skip
        assert a.value.info == GrantInfo.from_wire(info("revoked"))
        assert (
            a.value.message == "This Vault connection was revoked. Ask the user to connect again."
        )
        with pytest.raises(ConnectionEndedError) as b:
            refresh("grant_1", app_secret="apps_x", base_url=vault.base_url)
        assert b.value.reason == "revoked"


class TestRefreshTokenExpiredOrRotatedAway:
    def test_status_and_refresh_raise_connection_ended_expired_on_the_vaults_401(self, vault):
        vault.refuse("unauthorized", 401)
        for call in (status, refresh):
            with pytest.raises(ConnectionEndedError) as e:
                call("grant_1", refresh_token="rt_old", base_url=vault.base_url)
            assert (e.value.reason, e.value.grant_id, e.value.status) == ("expired", "grant_1", 401)
            assert e.value.message == (
                "This Vault connection can no longer be refreshed. Ask the user to connect again."
            )

    def test_every_other_refusal_stays_the_plain_outlet_error_it_was(self, vault):
        vault.refuse("app_unregistered", 401)
        with pytest.raises(OutletError) as e:
            status("grant_1", app_secret="apps_x", base_url=vault.base_url)
        assert not isinstance(e.value, ConnectionEndedError)
        assert e.value.code == "app_unregistered"
        vault.refuse("grant_pending", 409)
        with pytest.raises(OutletError) as p:
            refresh("grant_1", app_secret="apps_x", base_url=vault.base_url)
        assert not isinstance(p.value, ConnectionEndedError)
        assert p.value.code == "grant_pending"

    def test_an_open_connection_answers_as_before(self, vault):
        fresh = {
            "grantId": "grant_1",
            "keys": {"openai": "sk-new"},
            "capUsd": 5,
            "expiresAt": "2026-10-01T00:00:00Z",
            "refresh_token": "rt_2",
        }
        vault.route = lambda req: (200, info("active") if req.path.endswith("/status") else fresh)
        got = status("grant_1", refresh_token="rt_1", base_url=vault.base_url)
        assert got == GrantInfo.from_wire(info("active"))
        s = refresh("grant_1", refresh_token="rt_1", base_url=vault.base_url)
        assert s.keys["openai"] == "sk-new"
        assert s.refresh_token == "rt_2"


class TestDirect:
    def test_status_and_refresh_still_say_there_is_no_vault_grant_behind_a_direct_session(self):
        session = direct({"openai": "sk-proj-refusedkey123"})
        for call in (status, refresh):
            with pytest.raises(OutletError) as e:
                call(session.grant_id)
            assert e.value.code == "direct_mode_session"

    def test_the_refused_end_names_the_provider(self):
        e = ended("refused", "direct_1", provider="openai", status=401)
        assert e.message == "OpenAI refused this Direct API key. Ask the user for a new one."
        assert (e.reason, e.provider, e.status) == ("refused", "openai", 401)
        e = ended("refused", "direct_1", provider="someprovider")
        assert e.message == "someprovider refused this Direct API key. Ask the user for a new one."
        e = ended("refused", "direct_1")
        assert e.message == "The provider refused this Direct API key. Ask the user for a new one."


class TestWait:
    """The confidential poll (the npm package's connect() loop): a connection
    request that ends before approval ends the wait."""

    def test_polls_with_the_app_secret_until_the_key_is_delivered(self, vault):
        polls: list[str] = []

        def route(req):
            polls.append(req.path)
            if len(polls) < 3:
                return 200, {"status": "pending"}
            return 200, {
                "status": "complete",
                "grantId": "grant_1",
                "keys": {"openai": "sk-scoped"},
                "capUsd": 5,
                "expiresAt": "2026-10-01T00:00:00Z",
            }

        vault.route = route
        session = Outlet("app_x", "apps_x", base_url=vault.base_url).wait("gr_1", interval=0)
        assert session.grant_id == "grant_1"
        assert session.keys["openai"] == "sk-scoped"
        assert session.mode is None
        assert polls == ["/grants/gr_1"] * 3
        assert all(r.method == "GET" for r in vault.requests)
        assert all(r.headers["x-outlet-app-secret"] == "apps_x" for r in vault.requests)

    @pytest.mark.parametrize("state", ["revoked", "capped"])
    def test_a_request_that_ends_before_approval_ends_the_wait(self, vault, state):
        vault.answer({"status": state, "grantId": "grant_1"})
        with pytest.raises(ConnectionEndedError) as e:
            Outlet("app_x", "apps_x", base_url=vault.base_url).wait("gr_1", interval=0)
        assert (e.value.reason, e.value.grant_id) == (state, "grant_1")

    def test_a_public_client_cannot_wait(self, vault):
        with pytest.raises(OutletError) as e:
            Outlet("app_x", base_url=vault.base_url).wait("gr_1")
        assert e.value.code == "app_secret_required"
        assert vault.requests == []

    def test_gives_up_after_the_timeout(self, vault):
        vault.answer({"status": "pending"})
        with pytest.raises(OutletError) as e:
            Outlet("app_x", "apps_x", base_url=vault.base_url).wait(
                "gr_1", interval=0, timeout=0.05
            )
        assert e.value.code == "approval_timeout"
        assert "0.05 seconds" in e.value.message
        assert len(vault.requests) >= 1

    def test_a_vault_refusal_passes_through(self, vault):
        vault.refuse("app_unregistered", 401)
        with pytest.raises(OutletError) as e:
            Outlet("app_x", "apps_x", base_url=vault.base_url).wait("gr_1", interval=0)
        assert e.value.code == "app_unregistered"


class TestIsConnectionEnded:
    def test_recognises_the_error_and_a_look_alike_from_another_copy(self):
        assert is_connection_ended(ended("capped", "grant_1"))

        class Other(Exception):
            code = "connection_ended"
            reason = "revoked"
            grant_id = "grant_1"

        assert is_connection_ended(Other())
        assert not is_connection_ended(OutletError("x", "grant_pending"))
        assert not is_connection_ended(None)
