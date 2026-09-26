"""The provider registry, and direct() against every entry in it, mirroring
sdk/test/registry.test.ts."""

import re
from urllib.parse import urlparse

import pytest
from support import sample_key

from useoutlet import OutletError, direct, get_provider, provider_ids, providers

IDS = [
    "openai", "anthropic", "google", "deepseek", "xai", "moonshot", "mistral", "zai", "minimax",
    "perplexity", "openrouter", "groq", "cerebras", "together", "fireworks", "higgsfield",
    "huggingface", "fal", "replicate",
]  # fmt: skip
NAMES = [
    "OpenAI", "Anthropic", "Gemini", "DeepSeek", "Grok", "Kimi", "Mistral", "Z.ai", "MiniMax",
    "Perplexity", "OpenRouter", "Groq", "Cerebras", "Together AI", "Fireworks AI", "Higgsfield",
    "Hugging Face", "fal", "Replicate",
]  # fmt: skip
STRICT = ["openai", "anthropic", "google"]


def error_of(fn) -> OutletError:
    with pytest.raises(OutletError) as caught:
        fn()
    return caught.value


def https(url: str) -> bool:
    return urlparse(url).scheme == "https"


class TestTheProviderRegistry:
    def test_holds_the_nineteen_ids_as_company_names_display_names_as_the_wall_shows_them(self):
        assert [p.id for p in providers] == IDS
        assert [p.display_name for p in providers] == NAMES
        assert len(set(IDS)) == 19

    def test_marks_ten_makers_then_nine_hosts(self):
        assert all(p.kind == "maker" for p in providers[:10])
        assert all(p.kind == "host" for p in providers[10:])

    def test_offers_direct_and_a_named_screen_everywhere_vault_for_four(self):
        assert provider_ids("direct") == IDS
        assert provider_ids("button") == IDS
        assert provider_ids("vault") == ["openai", "anthropic", "openrouter", "fal"]

    def test_marks_every_provider_openai_compatible_except_fal_replicate_and_higgsfield(self):
        assert sorted(p.id for p in providers if not p.openai_compatible) == [
            "fal",
            "higgsfield",
            "replicate",
        ]

    @pytest.mark.parametrize("p", providers, ids=[p.id for p in providers])
    def test_a_keys_page_words_and_a_dated_docs_check(self, p):
        assert https(p.keys_url)
        for words in [p.key_term, p.create_action, p.format_hint]:
            assert words.strip() == words
            assert len(words) > 2
            assert "—" not in words
        assert any(c.mode == "direct" for c in p.checks)
        for c in p.checks:
            assert c.how in ("docs", "request")
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", c.date)
            assert https(c.source)
            # a Vault check is only ever recorded where Vault is offered
            if c.mode == "vault":
                assert p.modes.vault
        if p.key_shape:
            assert bool(p.key_shape.prefix) != bool(p.key_shape.pattern)
            if p.key_shape.pattern:
                assert p.key_shape.separator in p.key_shape.pattern
            assert https(p.key_shape.source)

    def test_a_format_hint_names_a_prefix_only_where_the_documentation_gives_one(self):
        naming = [p for p in providers if "starts with" in p.format_hint]
        assert [p.id for p in naming] == [
            "google", "deepseek", "xai", "perplexity", "openrouter", "groq", "cerebras",
            "fireworks", "huggingface", "replicate",
        ]  # fmt: skip
        for p in naming:
            assert (
                p.format_hint
                == f"Your {p.display_name} Direct API key starts with {p.key_shape.prefix}."
            )

    def test_a_provider_with_no_documented_key_shape_gets_the_no_prefix_hint(self):
        shapeless = [p for p in providers if not p.key_shape]
        assert [p.id for p in shapeless] == ["moonshot", "mistral", "minimax", "together"]
        for p in shapeless:
            assert p.format_hint == f"Paste your whole {p.display_name} Direct API key."
        assert get_provider("moonshot").format_hint == "Paste your whole Kimi Direct API key."
        assert get_provider("minimax").format_hint == "Paste your whole MiniMax Direct API key."

    def test_get_provider_answers_by_id_and_knows_nothing_else(self):
        assert get_provider("xai").display_name == "Grok"
        assert get_provider("runway") is None
        assert get_provider("constructor") is None
        assert get_provider("__class__") is None

    def test_the_replicate_shape_carries_its_documented_length(self):
        shape = get_provider("replicate").key_shape
        assert (shape.prefix, shape.length, shape.basis) == ("r8_", 40, "stated")

    def test_entries_are_read_only(self):
        with pytest.raises(AttributeError):
            providers[0].display_name = "x"  # type: ignore[misc]


class TestDirectWithEveryRegistryProvider:
    @pytest.mark.parametrize("p", providers, ids=[p.id for p in providers])
    def test_a_key_of_the_documented_shape_passes_whole(self, p):
        key = sample_key(p)
        session = direct({p.id: key})
        assert session.keys[p.id] == key
        assert session.mode == "direct"

    def test_the_fal_direct_key_passes_whole_with_its_colon(self):
        key = "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d:9f8e7d6c5b4a39281706f5e4d3c2b1a0"
        session = direct({"fal": f'  "{key}"\n'})
        assert session.keys["fal"] == key
        assert ":" in session.keys["fal"]

    def test_two_part_keys_keep_their_separator(self):
        session = direct({"zai": "keyid123.secret456", "higgsfield": "keyid123:secret456"})
        assert session.keys["zai"] == "keyid123.secret456"
        assert session.keys["higgsfield"] == "keyid123:secret456"

    @pytest.mark.parametrize("id", [p.id for p in providers if p.id not in STRICT])
    def test_the_format_hint_is_copy_a_key_of_another_shape_still_passes(self, id):
        assert direct({id: "some-other-shape-0123456789"}).keys[id] == "some-other-shape-0123456789"

    def test_openai_anthropic_and_google_keep_their_strict_format_check(self):
        for id in STRICT:
            err = error_of(lambda id=id: direct({id: "some-other-shape-0123456789"}))
            assert err.code == "invalid_key_format"

    @pytest.mark.parametrize("id", IDS)
    def test_every_existing_refusal_holds(self, id):
        assert error_of(lambda: direct({id: "   "})).code == "invalid_key_format"
        assert error_of(lambda: direct({id: "sk-admin-abc123"})).code == "admin_key_rejected"
        assert error_of(lambda: direct({id: "sk-ant-admin01-abc123"})).code == "admin_key_rejected"
        if id != "anthropic":
            assert (
                error_of(lambda: direct({id: "sk-ant-api03-abc123"})).code == "wrong_provider_key"
            )
        if id != "google":
            assert error_of(lambda: direct({id: "AIzaSyExample123"})).code == "wrong_provider_key"

    def test_error_messages_use_the_registrys_display_names(self):
        assert error_of(lambda: direct({"xai": " "})).message == "Empty Grok key."
        assert error_of(lambda: direct({"someprovider": " "})).message == "Empty someprovider key."
