"""The grant calls after connect: refresh, revoke, status (SPEC section 7).
Module-level functions that take the credential as arguments; the Outlet
client wraps them and holds the refresh token for you. A connection that has
ended answers as a ConnectionEndedError from status() and refresh() (ended.py)."""

from __future__ import annotations

from typing import NoReturn

from . import http as _http
from .direct import assert_vault_grant
from .ended import ended_from_info, ended_from_vault
from .http import DEFAULT_TIMEOUT, Auth, api
from .types import GrantInfo, OutletError, OutletSession


def auth_of(app_secret: str | None, refresh_token: str | None) -> Auth:
    """Confidential clients authenticate with the app secret; public clients
    (PKCE, SPEC section 7.1) carry a grant-scoped refresh token instead."""
    return Auth(bearer=refresh_token) if refresh_token else Auth(app_secret=app_secret)


def _raise_surfaced(e: OutletError, grant_id: str) -> NoReturn:
    """A vault refusal that means the connection ended becomes the typed error;
    every other refusal passes through as it was."""
    end = ended_from_vault(e, grant_id)
    if end is not None:
        raise end from e
    raise e


def refresh(
    grant_id: str,
    *,
    app_secret: str | None = None,
    refresh_token: str | None = None,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> OutletSession:
    """Re-fetch (and possibly rotate) keys for an existing grant. Public clients
    (refresh_token) get a ROTATED token back (OAuth 2.1 section 6.1): the token
    they presented is void the moment the vault answers, so persist the
    returned refresh_token before making another call. The old one now 401s.
    Raises ConnectionEndedError when the connection is capped, revoked, or the
    token no longer refreshes it."""
    assert_vault_grant(grant_id)
    try:
        r = api(
            base_url or _http.DEFAULT_BASE_URL,
            f"/grants/{grant_id}/refresh",
            method="POST",
            auth=auth_of(app_secret, refresh_token),
            timeout=timeout,
        )
    except OutletError as e:
        _raise_surfaced(e, grant_id)
    return OutletSession.from_wire(r)


def revoke(
    grant_id: str,
    *,
    app_secret: str | None = None,
    refresh_token: str | None = None,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> None:
    """App-initiated revocation (users can always revoke from their account page)."""
    assert_vault_grant(grant_id)
    api(
        base_url or _http.DEFAULT_BASE_URL,
        f"/grants/{grant_id}",
        method="DELETE",
        auth=auth_of(app_secret, refresh_token),
        timeout=timeout,
    )


def status(
    grant_id: str,
    *,
    app_secret: str | None = None,
    refresh_token: str | None = None,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> GrantInfo:
    """Current status and spend for a grant. A pure read: the vault's /status
    endpoint never returns key material. spend_usd is the vault's last meter
    reading: month-to-date, up to about five minutes stale, 0 for a grant not
    yet metered. A connection that has ended raises ConnectionEndedError
    instead (its `info` holds the answer), so an app never reads a capped or
    revoked connection as one to keep calling with."""
    assert_vault_grant(grant_id)
    try:
        r = api(
            base_url or _http.DEFAULT_BASE_URL,
            f"/grants/{grant_id}/status",
            auth=auth_of(app_secret, refresh_token),
            timeout=timeout,
        )
    except OutletError as e:
        _raise_surfaced(e, grant_id)
    info = GrantInfo.from_wire(r)
    end = ended_from_info(info)
    if end is not None:
        raise end
    return info
