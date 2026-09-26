"""Shared fixtures' data: wire answers and a made-up key of each documented shape."""

from __future__ import annotations

from typing import Any

from useoutlet import ProviderEntry

FILL = "abc123def456ghi789jkl012mno345pqr678stu901"


def sample_key(p: ProviderEntry) -> str:
    """A made-up key of the shape a registry entry documents. Never a real key."""
    shape = p.key_shape
    if shape and shape.prefix:
        body = shape.length - len(shape.prefix) if shape.length else 24
        return shape.prefix + FILL[:body]
    if shape and shape.separator:
        return f"keyid123{shape.separator}secret456"
    return "opaque-token-xyz-123456"


def info(status: str, reason: str | None = None) -> dict[str, Any]:
    """A status answer on the wire."""
    wire: dict[str, Any] = {
        "grantId": "grant_1",
        "status": status,
        "providers": ["openai"],
        "capUsd": 5,
        "spendUsd": 5.02,
    }
    if reason:
        wire["reason"] = reason
    return wire


def refused(code: str) -> dict[str, Any]:
    """The vault's refusal body."""
    return {"ok": False, "code": code, "message": "vault words"}


WIRE_SESSION: dict[str, Any] = {
    "grantId": "grant_1",
    "keys": {"openai": "sk-scoped"},
    "capUsd": 5,
    "expiresAt": "2026-08-01T00:00:00Z",
}
