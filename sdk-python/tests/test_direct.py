"""direct(): the local key check, mirroring sdk/test/direct.test.ts case for case."""

import pytest

from useoutlet import Outlet, OutletError, direct, refresh, revoke, status

OPENAI_KEY = "sk-proj-abc123def456"
ANTHROPIC_KEY = "sk-ant-api03-abc123"
GOOGLE_KEY = "AIzaSyExample123"


def error_of(fn) -> OutletError:
    with pytest.raises(OutletError) as caught:
        fn()
    return caught.value


class TestHappyPath:
    def test_accepts_valid_keys_for_all_providers_and_returns_a_session(self):
        session = direct({"openai": OPENAI_KEY, "anthropic": ANTHROPIC_KEY, "google": GOOGLE_KEY})
        assert session.keys["openai"] == OPENAI_KEY
        assert session.keys["anthropic"] == ANTHROPIC_KEY
        assert session.keys["google"] == GOOGLE_KEY
        assert session.grant_id.startswith("direct_")
        assert session.mode == "direct"
        assert session.cap_usd == float("inf")
        assert session.expires_at == "9999-12-31T23:59:59Z"
        assert session.refresh_token is None

    def test_accepts_legacy_and_service_account_openai_prefixes(self):
        for key in ["sk-abc123legacy", "sk-svcacct-abc123"]:
            assert direct({"openai": key}).keys["openai"] == key

    def test_cleans_clipboard_noise_whitespace_and_quotes(self):
        assert direct({"openai": f'  "{OPENAI_KEY}" \n'}).keys["openai"] == OPENAI_KEY

    def test_is_exposed_on_the_client(self):
        assert Outlet.direct({"openai": OPENAI_KEY}).mode == "direct"
        assert Outlet("app_x").direct({"openai": OPENAI_KEY}).mode == "direct"

    def test_local_ids_differ(self):
        ids = {direct({"openai": OPENAI_KEY}).grant_id for _ in range(20)}
        assert len(ids) == 20


class TestAdminKeysAreAlwaysRefused:
    def test_rejects_an_anthropic_admin_key_even_in_the_anthropic_field(self):
        err = error_of(lambda: direct({"anthropic": "sk-ant-admin01-xyz"}))
        assert err.code == "admin_key_rejected"
        assert "ADMIN" in err.message

    def test_rejects_an_openai_admin_key_even_in_the_openai_field(self):
        assert error_of(lambda: direct({"openai": "sk-admin-xyz"})).code == "admin_key_rejected"

    def test_rejects_admin_keys_pasted_into_the_wrong_field_too(self):
        assert (
            error_of(lambda: direct({"openai": "sk-ant-admin01-xyz"})).code == "admin_key_rejected"
        )


class TestProviderMixUpsGetSpecificHints:
    def test_anthropic_key_pasted_as_openai(self):
        err = error_of(lambda: direct({"openai": ANTHROPIC_KEY}))
        assert err.code == "wrong_provider_key"
        assert "ANTHROPIC" in err.message

    def test_openai_key_pasted_as_anthropic(self):
        err = error_of(lambda: direct({"anthropic": OPENAI_KEY}))
        assert err.code == "wrong_provider_key"
        assert "OPENAI" in err.message

    def test_google_key_pasted_as_openai(self):
        err = error_of(lambda: direct({"openai": GOOGLE_KEY}))
        assert err.code == "wrong_provider_key"
        assert "GOOGLE" in err.message

    def test_openai_key_pasted_as_google(self):
        assert error_of(lambda: direct({"google": OPENAI_KEY})).code == "wrong_provider_key"


class TestFormatAndInputErrors:
    def test_rejects_an_empty_keys_mapping(self):
        assert error_of(lambda: direct({})).code == "no_keys"

    def test_rejects_empty_and_garbage_keys(self):
        assert error_of(lambda: direct({"openai": "   "})).code == "invalid_key_format"
        assert error_of(lambda: direct({"anthropic": "not-a-key"})).code == "invalid_key_format"

    def test_the_format_message_names_the_accepted_prefixes(self):
        err = error_of(lambda: direct({"openai": "not-a-key"}))
        assert err.message == (
            "This doesn't look like a OpenAI API key "
            "(expected it to start with sk-proj- or sk-svcacct- or sk-)."
        )


class TestVaultOperationsOnDirectSessionsFailWithDirections:
    @pytest.mark.parametrize("op", [refresh, status, revoke])
    def test_module_function(self, op):
        session = direct({"openai": OPENAI_KEY})
        err = error_of(lambda: op(session.grant_id))
        assert err.code == "direct_mode_session"
        assert "provider's website" in err.message

    @pytest.mark.parametrize("name", ["refresh", "status", "revoke"])
    def test_client_method(self, name):
        session = direct({"openai": OPENAI_KEY})
        outlet = Outlet("app_x", "apps_x")
        err = error_of(lambda: getattr(outlet, name)(session.grant_id))
        assert err.code == "direct_mode_session"
