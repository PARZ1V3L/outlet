"""PKCE: the challenge, the grant request and the code exchange, mirroring
sdk/test/pkce.test.ts. The npm package's handleRedirect() is the client's
exchange() here."""

import base64
import hashlib
import json

import pytest

import useoutlet.pkce as pkce_module
from useoutlet import (
    GrantRequest,
    Outlet,
    OutletError,
    create_grant,
    exchange_code,
    pkce_challenge,
    refresh,
)


def expected_challenge(verifier: str) -> str:
    """Reference S256 challenge, computed independently of the SDK."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


GRANT_ANSWER = {"grant_request_id": "gr_1", "grant_url": "https://useoutlet.dev/grant/gr_1"}
TOKEN_ANSWER = {
    "grantId": "g_1",
    "keys": {"anthropic": "sk-ant-api03-x"},
    "capUsd": 5,
    "expiresAt": "2026-07-01T00:00:00Z",
    "refresh_token": "rt_abc",
}

# RFC 7636 Appendix B: the reference verifier, its 32 octets, and the S256
# challenge the spec prints for it.
RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
RFC_BYTES = base64.urlsafe_b64decode(RFC_VERIFIER + "=")


@pytest.fixture
def rfc_randomness(monkeypatch):
    """Randomness pinned to the RFC bytes, so the SDK's derivation is what gets checked."""
    calls: list[int] = []

    def fixed(n: int) -> bytes:
        calls.append(n)
        return RFC_BYTES[:n]

    monkeypatch.setattr(pkce_module, "_random_bytes", fixed)
    return calls


class TestPkceChallenge:
    def test_derives_challenge_base64url_sha256_of_verifier_method_s256(self):
        c = pkce_challenge()
        assert c.method == "S256"
        assert len(c.verifier) == 43  # 32 random bytes, base64url unpadded
        assert not set("+/=") & set(c.challenge)  # url-safe, unpadded
        assert c.challenge == expected_challenge(c.verifier)

    def test_is_random_per_call(self):
        assert pkce_challenge().verifier != pkce_challenge().verifier

    def test_reproduces_the_rfc_7636_appendix_b_vector(self, rfc_randomness):
        assert len(RFC_BYTES) == 32
        c = pkce_challenge()
        assert c.verifier == RFC_VERIFIER
        assert c.challenge == RFC_CHALLENGE
        assert c.method == "S256"


class TestCreateGrant:
    def test_posts_pkce_params_with_no_secret_returns_verifier_and_state(self, vault):
        vault.answer(GRANT_ANSWER, 201)
        started = create_grant(
            "app_x", ["anthropic"], "https://app.example/cb", base_url=vault.base_url
        )
        assert started.id == "gr_1"
        assert started.grant_url == "https://useoutlet.dev/grant/gr_1"
        assert len(started.verifier) == 43
        assert started.state

        req = vault.last
        assert (req.method, req.path) == ("POST", "/grants")
        assert "x-outlet-app-secret" not in req.headers
        assert "authorization" not in req.headers
        assert req.headers["content-type"] == "application/json"
        assert req.body["code_challenge_method"] == "S256"
        assert req.body["code_challenge"] == expected_challenge(started.verifier)
        assert req.body["redirect_uri"] == "https://app.example/cb"
        assert req.body["state"] == started.state
        assert req.body["app_id"] == "app_x"
        assert req.body["providers"] == ["anthropic"]
        assert "requested_cap_usd" not in req.body  # left out, not null

    def test_requires_a_redirect_uri(self, vault):
        with pytest.raises(OutletError) as e:
            create_grant("app_x", ["anthropic"], "", base_url=vault.base_url)
        assert e.value.code == "redirect_uri_required"
        assert vault.requests == []

    def test_keeps_the_verifier_off_the_wire(self, vault, rfc_randomness):
        vault.answer(GRANT_ANSWER, 201)
        started = create_grant(
            "app_x", ["anthropic"], "https://app.example/cb", 10, base_url=vault.base_url
        )
        assert rfc_randomness == [32, 16]  # verifier, then state
        assert started.verifier == RFC_VERIFIER
        assert vault.last.body["code_challenge"] == RFC_CHALLENGE
        assert vault.last.body["requested_cap_usd"] == 10
        assert RFC_VERIFIER not in json.dumps(vault.last.body)
        assert "verifier" not in json.dumps(vault.last.body)
        assert "verifier" not in repr(started)


class TestExchangeCode:
    def test_posts_code_and_verifier_to_grants_token_and_maps_refresh_token(self, vault):
        vault.answer(TOKEN_ANSWER)
        session = exchange_code("gr_1", "code_1", "ver_1", base_url=vault.base_url)
        assert session.grant_id == "g_1"
        assert session.keys["anthropic"] == "sk-ant-api03-x"
        assert session.refresh_token == "rt_abc"
        assert session.cap_usd == 5
        assert session.expires_at == "2026-07-01T00:00:00Z"

        req = vault.last
        assert (req.method, req.path) == ("POST", "/grants/token")
        assert req.body == {"grant_request_id": "gr_1", "code": "code_1", "code_verifier": "ver_1"}
        assert "x-outlet-app-secret" not in req.headers
        assert "authorization" not in req.headers


class TestPublicClientGrantOpsCarryTheRefreshToken:
    def test_refresh_sends_authorization_bearer_not_the_app_secret(self, vault):
        vault.answer(
            {"grantId": "g_1", "keys": {}, "capUsd": 5, "expiresAt": "2026-07-01T00:00:00Z"}
        )
        refresh("g_1", refresh_token="rt_abc", base_url=vault.base_url)
        assert vault.last.headers["authorization"] == "Bearer rt_abc"
        assert "x-outlet-app-secret" not in vault.last.headers


class TestExchange:
    """The client's exchange(): the npm package's handleRedirect() for a server."""

    def started(self, vault) -> tuple[Outlet, GrantRequest]:
        vault.answer(GRANT_ANSWER, 201)
        outlet = Outlet("app_x", base_url=vault.base_url)
        assert outlet.public
        request = outlet.connect(["anthropic"], redirect_uri="https://app.example/cb")
        return outlet, request

    def test_verifies_state_exchanges_the_code_clears_the_transaction(self, vault):
        outlet, request = self.started(vault)
        vault.answer({**TOKEN_ANSWER, "refresh_token": "rt_1"})
        session = outlet.exchange("code_1", request.state)
        assert session.refresh_token == "rt_1"
        assert vault.last.path == "/grants/token"
        assert vault.last.body["code"] == "code_1"
        assert vault.last.body["code_verifier"] == request.verifier
        assert vault.last.body["grant_request_id"] == "gr_1"
        # the transaction is gone: the same return address cannot be replayed
        with pytest.raises(OutletError) as e:
            outlet.exchange("code_1", request.state)
        assert e.value.code == "no_pkce_txn"

    def test_rejects_a_state_mismatch_and_never_exchanges(self, vault):
        outlet, _request = self.started(vault)
        seen = len(vault.requests)
        with pytest.raises(OutletError) as e:
            outlet.exchange("code_1", "WRONG")
        assert e.value.code == "state_mismatch"
        assert e.value.message == "State mismatch. Possible CSRF; aborting."
        assert len(vault.requests) == seen

    def test_errors_when_no_transaction_is_in_progress(self, vault):
        with pytest.raises(OutletError) as e:
            Outlet("app_x", base_url=vault.base_url).exchange("c", "s")
        assert e.value.code == "no_pkce_txn"
        assert vault.requests == []

    def test_errors_when_the_code_is_missing(self, vault):
        outlet, request = self.started(vault)
        with pytest.raises(OutletError) as e:
            outlet.exchange("", request.state)
        assert e.value.code == "no_code"

    def test_exchanges_a_request_the_app_kept_itself(self, vault):
        _outlet, request = self.started(vault)
        vault.answer(TOKEN_ANSWER)
        elsewhere = Outlet("app_x", base_url=vault.base_url)  # another process, say
        session = elsewhere.exchange("code_1", request.state, request=request)
        assert session.grant_id == "g_1"
        assert vault.last.body["code_verifier"] == request.verifier
        with pytest.raises(OutletError) as e:
            elsewhere.exchange("code_1", "other", request=request)
        assert e.value.code == "state_mismatch"
        with pytest.raises(OutletError) as e:
            elsewhere.exchange("code_1", "s", request=GrantRequest("gr_2", "https://x"))
        assert e.value.code == "no_pkce_txn"  # a confidential request has no PKCE

    def test_a_public_client_needs_a_return_address(self, vault):
        with pytest.raises(OutletError) as e:
            Outlet("app_x", base_url=vault.base_url).connect(["anthropic"])
        assert e.value.code == "redirect_uri_required"
        assert vault.requests == []
