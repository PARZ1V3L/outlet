"""direct() with OpenAI-compatible providers, mirroring sdk/test/providers.test.ts."""

import pytest

from useoutlet import Outlet, OutletError


def test_accepts_a_named_openai_compatible_provider_key_groq():
    s = Outlet.direct({"groq": "gsk_abc123def456ghi789jkl"})
    assert s.keys["groq"] == "gsk_abc123def456ghi789jkl"
    assert s.mode == "direct"


def test_accepts_an_arbitrary_provider_not_in_the_named_list():
    s = Outlet.direct({"someprovider": "opaque-token-xyz-123456"})
    assert s.keys["someprovider"] == "opaque-token-xyz-123456"


def test_does_not_false_flag_a_deepseek_key_as_an_openai_key():
    s = Outlet.direct({"deepseek": "sk-deepseek1234567890abcdef"})
    assert s.keys["deepseek"] == "sk-deepseek1234567890abcdef"


def test_still_refuses_an_admin_key_for_any_provider():
    with pytest.raises(OutletError) as e:
        Outlet.direct({"groq": "sk-admin-danger123"})
    assert e.value.code == "admin_key_rejected"


def test_still_catches_a_distinctive_mix_up_anthropic_key_in_a_groq_field():
    with pytest.raises(OutletError) as e:
        Outlet.direct({"groq": "sk-ant-api03-whatever"})
    assert e.value.code == "wrong_provider_key"


def test_rejects_an_empty_key_for_an_openai_compatible_provider():
    with pytest.raises(OutletError) as e:
        Outlet.direct({"groq": "   "})
    assert e.value.code == "invalid_key_format"
