"""The Outlet client: the grant flow for a server, with the credential held
once. A confidential client (app secret) starts a connection request, sends
the user to its grant URL and waits for the approval. A public client (no
secret) starts it with PKCE and finishes on the return address with
exchange(). refresh(), status() and revoke() then use the secret or the
grant's refresh token, whichever the client holds; a rotated token replaces
the old one in the client."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass

from . import grants as _grants
from . import http as _http
from .direct import direct
from .ended import ended
from .http import DEFAULT_TIMEOUT, Auth, api
from .pkce import create_grant, exchange_code
from .types import GrantInfo, GrantRequest, OutletError, OutletSession

# A connection request the user never finished is forgotten after this long.
_PENDING_TTL = 3600.0

_WAIT_NEEDS_SECRET = (
    "wait() needs the app secret. A public client finishes the connection with "
    "exchange(code, state) on the return address."
)


@dataclass
class _Pending:
    grant_request_id: str
    verifier: str
    started: float


class Outlet:
    """The Outlet client.

    app_id: your app's registered Outlet id (app_..., public).
    app_secret: your confidential app secret (apps_...), server-side only.
      Leave it out for a public client (PKCE, SPEC section 7.1).
    base_url: the vault to talk to. Defaults to https://api.useoutlet.dev/v0.
    timeout: seconds one vault call may take.
    """

    def __init__(
        self,
        app_id: str,
        app_secret: str | None = None,
        *,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.app_id = app_id
        self.app_secret = app_secret or None
        self._base_url = base_url
        self.timeout = timeout
        # grant id -> the refresh token the vault last issued (public clients)
        self._tokens: dict[str, str] = {}
        # state -> the PKCE values of a connection request not yet exchanged
        self._pending: dict[str, _Pending] = {}

    @property
    def base_url(self) -> str:
        return self._base_url or _http.DEFAULT_BASE_URL

    @property
    def public(self) -> bool:
        """True for a public client: no app secret, PKCE instead."""
        return self.app_secret is None

    # The grant flow

    def connect(
        self,
        providers: Sequence[str],
        requested_cap_usd: float | None = None,
        redirect_uri: str | None = None,
    ) -> GrantRequest:
        """Start a connection request. Send the user to the returned grant_url.

        providers: the provider the user connects. The vault takes one provider
          per connection request; use a separate request for each provider.
        requested_cap_usd: your proposed monthly Vault cap in USD. The user
          sets the cap on the approval card.
        redirect_uri: the return address (public clients: required, and it
          must be registered for the app).

        A confidential client then calls wait(); a public client calls
        exchange() with the code and state from the return address.
        """
        if isinstance(providers, str):
            providers = [providers]
        if self.public:
            started = create_grant(
                self.app_id,
                providers,
                redirect_uri or "",
                requested_cap_usd,
                base_url=self.base_url,
                timeout=self.timeout,
            )
            self._remember(started)
            return started
        r = api(
            self.base_url,
            "/grants",
            method="POST",
            body={
                "app_id": self.app_id,
                "providers": list(providers),
                "requested_cap_usd": requested_cap_usd,
                "redirect_uri": redirect_uri,
            },
            auth=Auth(app_secret=self.app_secret),
            timeout=self.timeout,
        )
        # The vault answers this path in camelCase and the PKCE path in
        # snake_case (SPEC section 7.1). Both spellings are read.
        return GrantRequest(
            id=str(r.get("grantRequestId") or r.get("grant_request_id") or ""),
            grant_url=str(r.get("grantUrl") or r.get("grant_url") or ""),
        )

    def wait(
        self,
        grant_request_id: str,
        *,
        interval: float = 1.5,
        timeout: float | None = None,
    ) -> OutletSession:
        """Confidential clients: wait for the user to approve. Polls the grant
        request every `interval` seconds, as the npm package's connect() does,
        and returns the session once the vault delivers the key. A request that
        ends before approval (revoked, capped) raises ConnectionEndedError.
        timeout: seconds to wait in all; None waits until the vault answers."""
        if self.public:
            raise OutletError(_WAIT_NEEDS_SECRET, "app_secret_required")
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            r = api(
                self.base_url,
                f"/grants/{grant_request_id}",
                auth=Auth(app_secret=self.app_secret),
                timeout=self.timeout,
            )
            state = r.get("status") if isinstance(r, dict) else None
            if state == "complete":
                return OutletSession.from_wire(r)
            if state in ("capped", "revoked"):
                raise ended(state, str(r.get("grantId") or grant_request_id), status=409)
            if deadline is not None and time.monotonic() >= deadline:
                raise OutletError(
                    f"The connection request was not approved within {timeout:g} seconds.",
                    "approval_timeout",
                )
            time.sleep(interval)

    def exchange(self, code: str, state: str, request: GrantRequest | None = None) -> OutletSession:
        """Public clients: finish the connection on the return address. Verifies
        state against the request this client started, exchanges the code and
        verifier over the back channel, and holds the session's refresh token
        for refresh(), status() and revoke(). Pass `request` when your app
        kept the GrantRequest itself (another process, say)."""
        self._forget_stale()
        if request is not None:
            if not request.verifier:
                raise OutletError("No PKCE transaction in progress.", "no_pkce_txn")
            pending: _Pending | None = _Pending(request.id, request.verifier, time.monotonic())
            expected = request.state
        else:
            if not self._pending:
                raise OutletError("No PKCE transaction in progress.", "no_pkce_txn")
            pending = self._pending.get(state) if state else None
            expected = state if pending else None
        if not code:
            raise OutletError("No authorization code in the redirect URL.", "no_code")
        if not state or pending is None or state != expected:
            raise OutletError("State mismatch — possible CSRF; aborting.", "state_mismatch")
        session = exchange_code(
            pending.grant_request_id,
            code,
            pending.verifier,
            base_url=self.base_url,
            timeout=self.timeout,
        )
        self._pending.pop(state, None)
        if session.refresh_token:
            self._tokens[session.grant_id] = session.refresh_token
        return session

    # After connect

    def refresh(self, grant_id: str, refresh_token: str | None = None) -> OutletSession:
        """Re-fetch (and possibly rotate) the keys for a grant. A public client's
        token rotates: the new one replaces the old in this client, and the
        session carries it for your own store. Pass `refresh_token` to seed a
        token this client has not seen (one you stored earlier). Raises
        ConnectionEndedError when the connection is capped, revoked or expired."""
        token = refresh_token or self._tokens.get(grant_id)
        session = _grants.refresh(
            grant_id,
            app_secret=self.app_secret,
            refresh_token=token,
            base_url=self.base_url,
            timeout=self.timeout,
        )
        if session.refresh_token:
            self._tokens[grant_id] = session.refresh_token
        return session

    def status(self, grant_id: str, refresh_token: str | None = None) -> GrantInfo:
        """Current status and spend for a grant, never key material. Raises
        ConnectionEndedError for a capped or revoked connection."""
        return _grants.status(
            grant_id,
            app_secret=self.app_secret,
            refresh_token=refresh_token or self._tokens.get(grant_id),
            base_url=self.base_url,
            timeout=self.timeout,
        )

    def revoke(self, grant_id: str, refresh_token: str | None = None) -> None:
        """Revoke a grant from the app's side. The client forgets its token."""
        _grants.revoke(
            grant_id,
            app_secret=self.app_secret,
            refresh_token=refresh_token or self._tokens.get(grant_id),
            base_url=self.base_url,
            timeout=self.timeout,
        )
        self._tokens.pop(grant_id, None)

    # Direct mode, for symmetry with the npm package's Outlet.direct()
    direct = staticmethod(direct)

    # Pending PKCE requests

    def _remember(self, started: GrantRequest) -> None:
        self._forget_stale()
        if started.state and started.verifier:
            self._pending[started.state] = _Pending(started.id, started.verifier, time.monotonic())

    def _forget_stale(self) -> None:
        cutoff = time.monotonic() - _PENDING_TTL
        for state in [s for s, p in self._pending.items() if p.started < cutoff]:
            del self._pending[state]


class AsyncOutlet:
    """The same client for asyncio apps. Each call runs the sync client in a
    worker thread (asyncio.to_thread), so the event loop is never blocked. The
    standard library has no async HTTP client, and this package adds none."""

    def __init__(
        self,
        app_id: str,
        app_secret: str | None = None,
        *,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.sync = Outlet(app_id, app_secret, base_url=base_url, timeout=timeout)

    @property
    def public(self) -> bool:
        return self.sync.public

    async def connect(
        self,
        providers: Sequence[str],
        requested_cap_usd: float | None = None,
        redirect_uri: str | None = None,
    ) -> GrantRequest:
        return await asyncio.to_thread(
            self.sync.connect, providers, requested_cap_usd, redirect_uri
        )

    async def wait(
        self, grant_request_id: str, *, interval: float = 1.5, timeout: float | None = None
    ) -> OutletSession:
        return await asyncio.to_thread(
            self.sync.wait, grant_request_id, interval=interval, timeout=timeout
        )

    async def exchange(
        self, code: str, state: str, request: GrantRequest | None = None
    ) -> OutletSession:
        return await asyncio.to_thread(self.sync.exchange, code, state, request)

    async def refresh(self, grant_id: str, refresh_token: str | None = None) -> OutletSession:
        return await asyncio.to_thread(self.sync.refresh, grant_id, refresh_token)

    async def status(self, grant_id: str, refresh_token: str | None = None) -> GrantInfo:
        return await asyncio.to_thread(self.sync.status, grant_id, refresh_token)

    async def revoke(self, grant_id: str, refresh_token: str | None = None) -> None:
        await asyncio.to_thread(self.sync.revoke, grant_id, refresh_token)

    direct = staticmethod(direct)
