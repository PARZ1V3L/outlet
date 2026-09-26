"""What is written from the registry stays the registry: the providers.json in
this package is the one `npm run build` writes, byte for byte, the same file
the npm package ships and the docs read (sdk/test/support-data.test.ts)."""

import json
from importlib import resources
from pathlib import Path

import pytest

from useoutlet import providers
from useoutlet.providers import providers_json

ROOT = Path(__file__).resolve().parents[2]


def packaged() -> bytes:
    return resources.files("useoutlet").joinpath("providers.json").read_bytes()


def test_the_packaged_providers_json_is_the_registry_as_npm_run_build_writes_it():
    assert packaged() == (ROOT / "docs" / "providers.json").read_bytes()


def test_the_packaged_providers_json_equals_the_npm_packages_copy_byte_for_byte():
    dist = ROOT / "sdk" / "dist" / "providers.json"
    if not dist.exists():
        pytest.skip("sdk/dist/providers.json is not built: run `npm run build` in sdk/")
    assert packaged() == dist.read_bytes()


def test_the_parsed_registry_is_the_file():
    rows = json.loads(providers_json())["providers"]
    assert [row["id"] for row in rows] == [p.id for p in providers]
    assert len(rows) == 19
    assert providers_json().encode("utf-8") == packaged()
