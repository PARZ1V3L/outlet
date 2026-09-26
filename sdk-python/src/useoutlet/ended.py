"""Connection ends: the vault's refusals and status answers turned into
ConnectionEndedError. Every end passes through ended(). The npm package also
tells the page's Connect your AI button; a server has no button to tell."""

from __future__ import annotations

from .providers import get_provider
from .types import ConnectionEndedError, EndReason, GrantInfo, OutletError


def ended(
    reason: EndReason,
    grant_id: str,
    *,
    info: GrantInfo | None = None,
    provider: str | None = None,
    status: int | None = None,
) -> ConnectionEndedError:
    """The typed error for a connection that ended."""
    message = None
    if reason == "refused" and provider:
        entry = get_provider(provider)
        name = entry.display_name if entry else provider
        message = f"{name} refused this Direct API key. Ask the user for a new one."
    return ConnectionEndedError(
        reason, grant_id, info=info, provider=provider, status=status, message=message
    )


def ended_from_vault(e: OutletError, grant_id: str) -> ConnectionEndedError | None:
    """The connection end behind a vault refusal, or None when the code is not
    one: 409 grant_capped, 409 grant_revoked, and 401 unauthorized for a refresh
    token the vault no longer knows (rotated away or gone)."""
    if e.code == "grant_capped":
        return ended("capped", grant_id, status=e.status)
    if e.code == "grant_revoked":
        return ended("revoked", grant_id, status=e.status)
    if e.code == "unauthorized":
        return ended("expired", grant_id, status=e.status)
    return None


def ended_from_info(info: GrantInfo) -> ConnectionEndedError | None:
    """The connection end a status answer reports, or None while it is open."""
    if info.status not in ("capped", "revoked"):
        return None
    provider = info.providers[0] if info.providers else None
    return ended(info.status, info.grant_id, info=info, provider=provider, status=409)


def is_connection_ended(e: object) -> bool:
    """True for a ConnectionEndedError, from this package or another copy of it."""
    if isinstance(e, ConnectionEndedError):
        return True
    return (
        getattr(e, "code", None) == "connection_ended"
        and isinstance(getattr(e, "reason", None), str)
        and isinstance(getattr(e, "grant_id", None), str)
    )
