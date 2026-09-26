"""useoutlet: connect your users' AI accounts to your app.

Status: direct mode is live today. Vault mode (connect / refresh / status /
revoke) is open. Register your app at useoutlet.dev/register.

    from useoutlet import Outlet

    outlet = Outlet(app_id="app_yourapp", app_secret=os.environ["OUTLET_APP_SECRET"])
    request = outlet.connect(providers=["openai"], requested_cap_usd=10)
    # send the user to request.grant_url, then
    session = outlet.wait(request.id)

    # use the official provider SDK: Outlet is not in the data path
    ai = OpenAI(api_key=session.keys["openai"])

A connection that ends (capped, revoked or expired) is a ConnectionEndedError
from status(), refresh() and wait(). The Connect your AI button, the CLI and
the MCP docs server live in the npm package, @useoutlet/sdk.
"""

from ._version import __version__
from .client import AsyncOutlet, Outlet
from .direct import direct
from .grants import refresh, revoke, status
from .pkce import PkceChallenge, create_grant, exchange_code, pkce_challenge
from .providers import (
    KeyShape,
    ProviderCheck,
    ProviderEntry,
    ProviderKind,
    ProviderMode,
    ProviderModes,
    get_provider,
    provider_ids,
    providers,
)
from .types import (
    CapReason,
    ConnectionEndedError,
    EndReason,
    GrantInfo,
    GrantRequest,
    GrantStatus,
    Mode,
    OutletError,
    OutletSession,
)

__all__ = [
    "AsyncOutlet",
    "CapReason",
    "ConnectionEndedError",
    "EndReason",
    "GrantInfo",
    "GrantRequest",
    "GrantStatus",
    "KeyShape",
    "Mode",
    "Outlet",
    "OutletError",
    "OutletSession",
    "PkceChallenge",
    "ProviderCheck",
    "ProviderEntry",
    "ProviderKind",
    "ProviderMode",
    "ProviderModes",
    "__version__",
    "create_grant",
    "direct",
    "exchange_code",
    "get_provider",
    "pkce_challenge",
    "provider_ids",
    "providers",
    "refresh",
    "revoke",
    "status",
]
