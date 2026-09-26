"""The vault transport (SPEC section 7). Auth-header handling lives here so the
confidential (app secret) and public (PKCE bearer) paths cannot drift. Standard
library only: urllib."""

from __future__ import annotations

import contextlib
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.client import HTTPException
from typing import Any

from ._version import __version__
from .types import OutletError

DEFAULT_BASE_URL = "https://api.useoutlet.dev/v0"

# Seconds a single vault call may take. The client takes its own `timeout`.
DEFAULT_TIMEOUT = 30.0

# Codes the vault speaks to the DEVELOPER rather than to the user (SPEC
# section 6.2). The wire carries the code; the words live here so the message
# reads right in a traceback. Wording: Parz's word pass.
DEVELOPER_MESSAGES: dict[str, str] = {
    # The blessed line (PRICING-MODEL, SPEC section 6.2): billing never reaches
    # a user, and existing connections keep working through a lapse.
    "vault_requires_billing": (
        "Add a payment method to enable vault mode for this app. Existing connections keep working."
    ),
}


@dataclass(frozen=True)
class Auth:
    """How a request proves itself to the vault. Confidential clients send the
    app secret; public clients send a grant-scoped refresh token as Bearer
    (SPEC sections 6.1 and 7.1). The PKCE code exchange sends neither: the code
    and verifier in its body are the proof."""

    app_secret: str | None = None
    bearer: str | None = None


def api(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    auth: Auth | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> Any:
    """One vault call. Returns the parsed JSON answer, or None for an empty body.
    Raises OutletError: `vault_unavailable` when the host cannot be reached, and
    the vault's own code with its HTTP status on any refusal."""
    headers = {
        "content-type": "application/json",
        "user-agent": f"useoutlet-python/{__version__}",
    }
    if auth and auth.app_secret:
        headers["x-outlet-app-secret"] = auth.app_secret
    if auth and auth.bearer:
        headers["authorization"] = f"Bearer {auth.bearer}"
    data = None
    if body is not None:
        # A key the caller left out stays off the wire, as JSON.stringify drops
        # an undefined value.
        data = json.dumps({k: v for k, v in body.items() if v is not None}).encode("utf-8")
    request = urllib.request.Request(f"{base_url}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as e:
        code = "request_failed"
        with contextlib.suppress(ValueError, AttributeError, OSError):  # non-JSON error body
            code = json.loads(e.read().decode("utf-8")).get("code") or code
        raise OutletError(
            DEVELOPER_MESSAGES.get(code) or f"Outlet API error ({e.code})", code, e.code
        ) from None
    except (urllib.error.URLError, HTTPException, OSError):
        # A network-level failure means the host is unreachable. Surface a
        # clear, on-brand error with a door, not a raw socket error.
        raise OutletError(
            f"Couldn't reach the Outlet vault at {base_url}. Try again in a moment; "
            f"if it keeps failing, email hello@useoutlet.dev.",
            "vault_unavailable",
        ) from None
    if not raw.strip():
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        raise OutletError(f"Outlet API error ({status})", "request_failed", status) from None
