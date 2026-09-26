"""The vault unreachable, and the codes the vault speaks to the developer
(sdk/test/vault.test.ts)."""

import time

import pytest

from useoutlet import Outlet, OutletError


class TestVaultModeWhileTheVaultIsUnreachable:
    def test_connect_softens_a_network_failure_into_vault_unavailable(self, unreachable):
        with pytest.raises(OutletError) as e:
            Outlet("app_test", "apps_x", base_url=unreachable).connect(["openai"])
        assert e.value.code == "vault_unavailable"
        assert e.value.status is None
        assert "Try again in a moment" in e.value.message
        assert "hello@useoutlet.dev" in e.value.message
        assert e.value.message.startswith(f"Couldn't reach the Outlet vault at {unreachable}.")

    def test_a_public_connect_softens_the_same_way(self, unreachable):
        with pytest.raises(OutletError) as e:
            Outlet("app_test", base_url=unreachable).connect(
                ["openai"], redirect_uri="https://app.example/cb"
            )
        assert e.value.code == "vault_unavailable"

    def test_status_on_a_vault_grant_softens_the_same_way(self, unreachable):
        with pytest.raises(OutletError) as e:
            Outlet("app_test", "apps_x", base_url=unreachable).status("grant_abc123")
        assert e.value.code == "vault_unavailable"

    def test_a_vault_that_never_answers_is_unavailable_too(self, vault):
        def slow(_req):
            time.sleep(0.5)
            return 200, {"status": "pending"}

        vault.route = slow
        outlet = Outlet("app_test", "apps_x", base_url=vault.base_url, timeout=0.1)
        with pytest.raises(OutletError) as e:
            outlet.status("grant_abc123")
        assert e.value.code == "vault_unavailable"
        time.sleep(0.5)  # let the fake finish its slow answer before the next test


class TestVaultRequiresBillingSpeaksToTheDeveloper:
    def test_connect_carries_the_checkout_hint_with_code_and_status_intact(self, vault):
        vault.refuse("vault_requires_billing", 402)
        with pytest.raises(OutletError) as e:
            Outlet("app_test", "apps_x", base_url=vault.base_url).connect(["openai"])
        assert e.value.code == "vault_requires_billing"
        assert e.value.status == 402
        assert e.value.message == (
            "Add a payment method to enable vault mode for this app. "
            "Existing connections keep working."
        )

    def test_other_codes_keep_the_generic_message(self, vault):
        vault.refuse("app_unregistered", 401)
        with pytest.raises(OutletError) as e:
            Outlet("app_test", "apps_x", base_url=vault.base_url).status("grant_abc123")
        assert e.value.code == "app_unregistered"
        assert e.value.status == 401
        assert e.value.message == "Outlet API error (401)"

    def test_a_refusal_without_a_json_body_is_request_failed(self, vault):
        vault.answer("not json", 500)  # the fake still JSON-encodes: a string body
        with pytest.raises(OutletError) as e:
            Outlet("app_test", "apps_x", base_url=vault.base_url).status("grant_abc123")
        assert e.value.code == "request_failed"
        assert e.value.message == "Outlet API error (500)"
