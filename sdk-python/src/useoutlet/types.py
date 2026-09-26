"""Core types (SPEC section 7): the session, the grant info, the request, the errors."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

GrantStatus = Literal["active", "capped", "revoked", "pending"]
CapReason = Literal["spend", "unreadable", "currency"]
Mode = Literal["direct", "vault"]
EndReason = Literal["capped", "revoked", "expired", "refused"]


def _float(value: Any, default: float = 0.0) -> float:
    return default if value is None else float(value)


@dataclass
class OutletSession:
    """What connect and refresh hand back, in both modes.

    grant_id: the durable reference to the user's grant. Store this, not the keys.
    keys: provider API keys by provider id, scoped to your app and spend-capped.
      Inject straight into the provider's official SDK. Treat as secrets: keep
      them in memory or encrypted storage only.
    cap_usd: the cap the user approved (it may be lower than requested). Direct
      mode has no meter, so there it is float("inf").
    expires_at: ISO 8601 expiry; call refresh() after this.
    mode: "direct" is a user-pasted key checked locally. "vault" is a capped,
      revocable App key from the Outlet vault. None means vault.
    refresh_token: public clients only. The grant-scoped token that authorizes
      refresh(), status() and revoke(). It rotates on every refresh.
    """

    grant_id: str
    keys: dict[str, str] = field(repr=False)
    cap_usd: float
    expires_at: str
    mode: Mode | None = None
    refresh_token: str | None = field(default=None, repr=False)

    @classmethod
    def from_wire(cls, r: dict[str, Any]) -> OutletSession:
        """The vault's answer (camelCase on the wire) as a session. A refresh_token
        rides along when the vault sent one (the public-client flow)."""
        return cls(
            grant_id=str(r.get("grantId", "")),
            keys={str(k): str(v) for k, v in (r.get("keys") or {}).items()},
            cap_usd=_float(r.get("capUsd")),
            expires_at=str(r.get("expiresAt", "")),
            mode=r.get("mode"),
            refresh_token=r.get("refresh_token") or None,
        )


@dataclass
class GrantInfo:
    """The status() answer: a pure read, never key material.

    spend_usd is the vault's last meter reading: month-to-date, up to about
    five minutes stale, 0 for a grant not yet metered. reason says why a capped
    grant stopped and is present only when status is "capped": "spend" (its
    monthly cap), "unreadable" (the meter could not read the provider's usage
    for an hour) or "currency" (the provider reports the account's usage in a
    currency other than USD).
    """

    grant_id: str
    status: GrantStatus
    providers: list[str]
    cap_usd: float
    spend_usd: float
    reason: CapReason | None = None

    @classmethod
    def from_wire(cls, r: dict[str, Any]) -> GrantInfo:
        return cls(
            grant_id=str(r.get("grantId", "")),
            status=r.get("status", "pending"),
            providers=[str(p) for p in (r.get("providers") or [])],
            cap_usd=_float(r.get("capUsd")),
            spend_usd=_float(r.get("spendUsd")),
            reason=r.get("reason"),
        )


@dataclass
class GrantRequest:
    """A started connection request: where to send the user, and for a public
    client the PKCE values to hold until exchange().

    id: the grant request id (it becomes the grant id once approved).
    grant_url: the Outlet grant screen. Send the user there.
    state: public clients only. Compare with the value on the return address.
    verifier: public clients only. The PKCE secret. Never sent until the
      exchange, never logged.
    """

    id: str
    grant_url: str
    state: str | None = None
    verifier: str | None = field(default=None, repr=False)


class OutletError(Exception):
    """Every error the SDK raises.

    code: machine-readable, for example "grant_revoked" or "cap_reached".
    status: the HTTP status, when the vault answered.
    """

    def __init__(self, message: str, code: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}({self.message!r}, code={self.code!r}, status={self.status!r})"
        )


# What a developer reads in the traceback, by reason. Wording: Parz's word
# pass (NEVER-DEAD-END-2026-09-26), the same lines as the npm package.
ENDED_MESSAGES: dict[str, str] = {
    "capped": (
        "This Vault connection is paused at its cap. When the user raises the cap on "
        "useoutlet.dev, refresh() returns the key."
    ),
    "revoked": "This Vault connection was revoked. Ask the user to connect again.",
    "expired": "This Vault connection can no longer be refreshed. Ask the user to connect again.",
    "refused": "The provider refused this Direct API key. Ask the user for a new one.",
}


class ConnectionEndedError(OutletError):
    """A connection the app can no longer use.

    reason says why: the Vault connection is paused at its cap ("capped"), was
    revoked or disconnected ("revoked"), can no longer be refreshed because its
    refresh token is gone ("expired"), or the provider refused the Direct API
    key ("refused"). Raised by status(), refresh() and wait(). info holds the
    vault's answer when status() gave one (capped and revoked). provider names
    the provider the key belonged to, when known. code is "connection_ended".
    """

    def __init__(
        self,
        reason: EndReason,
        grant_id: str,
        *,
        info: GrantInfo | None = None,
        provider: str | None = None,
        status: int | None = None,
        message: str | None = None,
    ) -> None:
        super().__init__(message or ENDED_MESSAGES[reason], "connection_ended", status)
        self.reason: EndReason = reason
        self.grant_id = grant_id
        self.info = info
        self.provider = provider
