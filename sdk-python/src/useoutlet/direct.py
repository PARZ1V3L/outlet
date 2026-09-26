"""Direct (paste) mode. Vault mode is open: register your app at useoutlet.dev/register.

The user pastes their own provider API key; direct() checks it locally and
returns the same OutletSession shape that the vault flow returns, so upgrading
later is a one-line change. No network: the key never leaves the process and
is never sent to Outlet.

    session = direct({"openai": user_pasted_key})
    ai = OpenAI(api_key=session.keys["openai"])

Works with any provider: pass its key under that provider's id. For an
OpenAI-compatible one (for example {"groq": key}), point the OpenAI SDK at the
provider's base URL. The provider registry (providers.py) names the nineteen
with a named Direct screen. Its key shapes and format hints are for the person
pasting a key. direct() refuses no key over them.
"""

from __future__ import annotations

import secrets
import time
from collections.abc import Mapping
from typing import NoReturn

from .providers import get_provider
from .types import OutletError, OutletSession

# First-class providers with well-defined key shapes get strict checks.
# Order within openai matters: the generic "sk-" entry must come last.
_ACCEPTED: dict[str, list[str]] = {
    "openai": ["sk-proj-", "sk-svcacct-", "sk-"],
    "anthropic": ["sk-ant-"],
    "google": ["AIza"],
}

_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _display_name(provider: str) -> str:
    """The registry's display name for nicer error messages. A provider outside
    the registry falls back to the raw id the developer passed."""
    entry = get_provider(provider)
    return entry.display_name if entry else provider


def _fail(message: str, code: str) -> NoReturn:
    raise OutletError(message, code)


def _clean(raw: str) -> str:
    """Pasted keys arrive with the user's clipboard noise: surrounding whitespace,
    sometimes quotes from a config file. Clean before judging, so honest pastes
    do not fail format checks."""
    return raw.strip().strip("\"'")


def _validate_key(provider: str, raw: str) -> str:
    key = _clean(raw)
    name = _display_name(provider)

    if not key:
        _fail(f"Empty {name} key.", "invalid_key_format")

    # Admin keys are the user's root org credential. Direct mode exists
    # precisely so apps never hold one. Refuse loudly for ANY provider, not
    # just the named.
    if key.startswith("sk-ant-admin"):
        _fail(
            "This is an Anthropic ADMIN key. It controls the whole organization. "
            "Never paste an admin key into an app. Use a regular API key "
            "(starts with sk-ant-api).",
            "admin_key_rejected",
        )
    if key.startswith("sk-admin-"):
        _fail(
            "This is an OpenAI ADMIN key. It controls the whole organization. "
            "Never paste an admin key into an app. Use a project API key "
            "(starts with sk-proj-).",
            "admin_key_rejected",
        )

    # Provider-exclusive prefixes pasted into the wrong field are a mistake no
    # matter which provider you named: "sk-ant-" is Anthropic-only, "AIza" is
    # Google-only. The generic "sk-" is NOT exclusive (DeepSeek, Qwen, Moonshot
    # and others use it), so it is only judged among the first-class three.
    if provider != "anthropic" and key.startswith("sk-ant-"):
        _fail(
            f"That looks like an ANTHROPIC key, but it was pasted into the {name} field.",
            "wrong_provider_key",
        )
    if provider != "google" and key.startswith("AIza"):
        _fail(
            f"That looks like a GOOGLE key, but it was pasted into the {name} field.",
            "wrong_provider_key",
        )

    # First-class providers (OpenAI, Anthropic, Google): strict format and mix-up.
    if provider in _ACCEPTED:
        if provider != "openai" and key.startswith("sk-") and not key.startswith("sk-ant-"):
            _fail(
                f"That looks like an OPENAI key, but it was pasted into the {name} field.",
                "wrong_provider_key",
            )
        prefixes = _ACCEPTED[provider]
        if not any(key.startswith(p) for p in prefixes):
            _fail(
                f"This doesn't look like a {name} API key (expected it to start with "
                f"{' or '.join(prefixes)}).",
                "invalid_key_format",
            )
        return key

    # Any other provider's key is an opaque value: a token, a JWT, a generic
    # "sk-", or two parts around a colon or a dot (fal, Higgsfield, Z.ai). We
    # accept any non-empty, non-admin key whole rather than reject a valid key
    # we cannot model. The registry's key shapes are never enforced here.
    return key


def _base36(n: int) -> str:
    digits = ""
    while n:
        n, r = divmod(n, 36)
        digits = _BASE36[r] + digits
    return digits or "0"


def _local_id() -> str:
    """Not a secret: a local handle apps can log and store safely."""
    tail = "".join(secrets.choice(_BASE36) for _ in range(6))
    return f"direct_{_base36(int(time.time() * 1000))}{tail}"


def direct(keys: Mapping[str, str]) -> OutletSession:
    """Check pasted provider keys and return a session, entirely locally.

    keys: the provider API keys the user pasted, by provider id. Checked
    locally (format and provider mix-ups for OpenAI, Anthropic and Google; a
    safety check that refuses admin keys for everyone), never transmitted
    anywhere by the SDK.
    """
    if not keys:
        _fail("direct() needs at least one provider key.", "no_keys")
    checked = {provider: _validate_key(provider, raw) for provider, raw in keys.items()}
    return OutletSession(
        grant_id=_local_id(),
        keys=checked,
        # No Outlet meter in direct mode; real caps arrive with vault mode.
        cap_usd=float("inf"),
        # Direct keys live until the user revokes them in their provider console.
        expires_at="9999-12-31T23:59:59Z",
        mode="direct",
    )


def assert_vault_grant(grant_id: str) -> None:
    """Vault operations (refresh, status, revoke) have nothing to act on for a
    direct-mode session. Fail with directions rather than a confusing 404."""
    if grant_id.startswith("direct_"):
        _fail(
            "This is a direct-mode session: there is no vault grant behind it. "
            "To revoke, delete the key on the provider's website.",
            "direct_mode_session",
        )
