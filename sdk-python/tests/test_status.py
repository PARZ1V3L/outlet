"""status() hits the dedicated /status endpoint: a pure read returning
GrantInfo, never key material (sdk/test/status.test.ts)."""

from support import info

from useoutlet import GrantInfo, Outlet, status

WIRE_INFO = {**info("active"), "spendUsd": 1.37}


def test_calls_grants_id_status_never_the_key_delivering_poll_route(vault):
    vault.answer(WIRE_INFO)
    got = status("grant_1", app_secret="apps_x", base_url=vault.base_url)
    assert got == GrantInfo("grant_1", "active", ["openai"], 5, 1.37)
    assert got.reason is None
    assert (vault.last.method, vault.last.path) == ("GET", "/grants/grant_1/status")
    assert vault.last.headers["x-outlet-app-secret"] == "apps_x"


def test_authenticates_public_clients_with_the_grant_bearer_token(vault):
    vault.answer(WIRE_INFO)
    status("grant_1", refresh_token="rt_1", base_url=vault.base_url)
    assert vault.last.headers["authorization"] == "Bearer rt_1"


def test_the_client_reads_status_with_the_credential_it_holds(vault):
    vault.answer(WIRE_INFO)
    got = Outlet("app_x", "apps_x", base_url=vault.base_url).status("grant_1")
    assert got.spend_usd == 1.37
    assert vault.last.headers["x-outlet-app-secret"] == "apps_x"
