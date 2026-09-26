"""Public-client grant flow: PKCE (SPEC section 7.1, ADR 0005).

For apps with no app secret. Grant creation is bound by PKCE (RFC 7636, S256);
the return address carries an authorization code, never a key; the
back-channel exchange swaps the code and verifier for the session and a
grant-scoped refresh token.

The Outlet client drives these two steps for you (connect() then
exchange()). An app that keeps the PKCE values in its own store, across
processes, calls create_grant() and exchange_code() itself.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from . import http as _http
from .http import DEFAULT_TIMEOUT, api
from .types import GrantRequest, OutletError, OutletSession

# The randomness behind the verifier and the state. A module attribute so a
# test can pin the RFC 7636 Appendix B vector.
_random_bytes = secrets.token_bytes


def base64url(data: bytes) -> str:
    """RFC 4648 base64url without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


@dataclass(frozen=True)
class PkceChallenge:
    verifier: str
    challenge: str
    method: Literal["S256"] = "S256"


def pkce_challenge() -> PkceChallenge:
    """RFC 7636 S256 challenge. The verifier is 43 base64url chars (32 bytes),
    inside the spec's 43 to 128 range; challenge = BASE64URL(SHA256(verifier))."""
    verifier = base64url(_random_bytes(32))
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return PkceChallenge(verifier=verifier, challenge=base64url(digest))


def create_grant(
    app_id: str,
    providers: Sequence[str],
    redirect_uri: str,
    requested_cap_usd: float | None = None,
    *,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> GrantRequest:
    """Step 1: create the grant request with PKCE params. No secret. Returns the
    grant URL plus the verifier and state to keep until exchange_code()."""
    if not redirect_uri:
        raise OutletError(
            "redirect_uri is required for the public-client (PKCE) flow.",
            "redirect_uri_required",
        )
    if isinstance(providers, str):
        providers = [providers]
    challenge = pkce_challenge()
    state = base64url(_random_bytes(16))
    r = api(
        base_url or _http.DEFAULT_BASE_URL,
        "/grants",
        method="POST",
        body={
            "app_id": app_id,
            "providers": list(providers),
            "requested_cap_usd": requested_cap_usd,
            "redirect_uri": redirect_uri,
            "code_challenge": challenge.challenge,
            "code_challenge_method": challenge.method,
            "state": state,
        },
        timeout=timeout,
    )
    return GrantRequest(
        id=str(r["grant_request_id"]),
        grant_url=str(r["grant_url"]),
        state=state,
        verifier=challenge.verifier,
    )


def exchange_code(
    grant_request_id: str,
    code: str,
    code_verifier: str,
    *,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> OutletSession:
    """Step 2: exchange the code from the return address plus the verifier for
    the session. The code proves the user approved; the verifier proves this
    client started the flow. Authenticated by the proof, not a secret. The
    session carries the grant-scoped refresh_token."""
    r = api(
        base_url or _http.DEFAULT_BASE_URL,
        "/grants/token",
        method="POST",
        body={
            "grant_request_id": grant_request_id,
            "code": code,
            "code_verifier": code_verifier,
        },
        timeout=timeout,
    )
    return OutletSession.from_wire(r)
