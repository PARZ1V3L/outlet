"""The provider registry: every provider the Connect your AI button has a named
Direct screen for, with the facts each screen shows and the record of how each
fact was checked. The rows come from providers.json, which `npm run build` in
sdk/ writes from sdk/src/providers.ts for the npm package, the docs and this
package alike. The registry is the one source; this package carries a copy.

Ids are company names. Display names are the names people know the product
by. A provider's kind is "maker" (it serves its own models) or "host" (it
serves other makers' models).

direct() accepts any provider's key as an opaque value. key_shape and
format_hint describe a key to the person pasting it. Neither refuses one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from typing import Any, Literal

ProviderKind = Literal["maker", "host"]
ProviderMode = Literal["direct", "button", "vault"]


@dataclass(frozen=True)
class KeyShape:
    """What the provider's documentation says a key looks like."""

    # "stated": the page says it in a sentence. "example": the page shows it in an example.
    basis: Literal["stated", "example"]
    # The documentation page that states or shows it.
    source: str
    # The characters the key starts with.
    prefix: str | None = None
    # Two parts joined by `separator`, written the way the documentation writes them.
    pattern: str | None = None
    separator: str | None = None
    # The length in characters, where the documentation gives one.
    length: int | None = None


@dataclass(frozen=True)
class ProviderCheck:
    """One check of a provider in one mode. "docs": read against the provider's
    documentation. "request": proved with a real request."""

    mode: Literal["direct", "vault"]
    how: Literal["docs", "request"]
    # The day of the check, YYYY-MM-DD.
    date: str
    # The documentation page read, or the operation requested.
    source: str


@dataclass(frozen=True)
class ProviderModes:
    direct: bool
    button: bool
    vault: bool


@dataclass(frozen=True)
class ProviderEntry:
    id: str
    display_name: str
    kind: ProviderKind
    # The provider's page for creating a key.
    keys_url: str
    # The provider's own word for the key.
    key_term: str
    # The guide's second step, in the provider's words.
    create_action: str
    # The line under the paste field. Copy, never a check.
    format_hint: str
    # None where the documentation read does not give one.
    key_shape: KeyShape | None
    # The provider documents an endpoint the OpenAI SDK can call through `base_url`.
    openai_compatible: bool
    modes: ProviderModes
    checks: tuple[ProviderCheck, ...]


def _entry(row: dict[str, Any]) -> ProviderEntry:
    shape = row.get("keyShape")
    return ProviderEntry(
        id=row["id"],
        display_name=row["displayName"],
        kind=row["kind"],
        keys_url=row["keysUrl"],
        key_term=row["keyTerm"],
        create_action=row["createAction"],
        format_hint=row["formatHint"],
        key_shape=None
        if shape is None
        else KeyShape(
            basis=shape["basis"],
            source=shape["source"],
            prefix=shape.get("prefix"),
            pattern=shape.get("pattern"),
            separator=shape.get("separator"),
            length=shape.get("length"),
        ),
        openai_compatible=bool(row["openaiCompatible"]),
        modes=ProviderModes(**row["modes"]),
        checks=tuple(ProviderCheck(**c) for c in row["checks"]),
    )


def providers_json() -> str:
    """The registry as shipped in this package: the text of providers.json."""
    return resources.files("useoutlet").joinpath("providers.json").read_text("utf-8")


providers: tuple[ProviderEntry, ...] = tuple(
    _entry(row) for row in json.loads(providers_json())["providers"]
)
"""The registry, in registry order: the ten makers, then the nine hosts."""

_by_id: dict[str, ProviderEntry] = {p.id: p for p in providers}


def get_provider(id: str) -> ProviderEntry | None:
    """The registry entry for an id, or None for a provider outside it."""
    return _by_id.get(id)


def provider_ids(mode: ProviderMode) -> list[str]:
    """The ids of the providers a mode covers, in registry order."""
    return [p.id for p in providers if getattr(p.modes, mode)]
