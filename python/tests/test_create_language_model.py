"""
Tests for create_language_model's handling of the OpenAI organization variables.

These only inspect the constructed model, so no request is sent.
"""

import pytest
import typechat

def test_openai_organization_is_sent_as_organization_header():
    model = typechat.create_language_model(
        {
            "OPENAI_MODEL": "gpt-4o",
            "OPENAI_API_KEY": "openai-secret",
            "OPENAI_ORGANIZATION": "org-123",
        }
    )
    assert model.headers["OpenAI-Organization"] == "org-123"


def test_openai_org_is_still_sent_as_organization_header():
    model = typechat.create_language_model(
        {
            "OPENAI_MODEL": "gpt-4o",
            "OPENAI_API_KEY": "openai-secret",
            "OPENAI_ORG": "org-legacy",
        }
    )
    assert model.headers["OpenAI-Organization"] == "org-legacy"


def test_openai_organization_takes_precedence_over_openai_org():
    model = typechat.create_language_model(
        {
            "OPENAI_MODEL": "gpt-4o",
            "OPENAI_API_KEY": "openai-secret",
            "OPENAI_ORGANIZATION": "org-123",
            "OPENAI_ORG": "org-legacy",
        }
    )
    assert model.headers["OpenAI-Organization"] == "org-123"


def test_azure_positional_api_key_arguments_keep_legacy_headers():
    model = typechat.create_azure_openai_language_model("azure-test-key", "https://example.invalid/chat/completions")
    assert model.headers == {
        "Authorization": "Bearer azure-test-key",
        "api-key": "azure-test-key",
    }
    assert model.default_params == {}


def test_azure_keyword_api_key_arguments_keep_legacy_headers():
    model = typechat.create_azure_openai_language_model(
        api_key="azure-test-key",
        endpoint="https://example.invalid/chat/completions",
    )
    assert model.headers["api-key"] == "azure-test-key"
    assert model.headers["Authorization"] == "Bearer azure-test-key"


def test_azure_environment_factory_does_not_interpret_identity_as_a_provider():
    model = typechat.create_language_model({
        "AZURE_OPENAI_API_KEY": "identity",
        "AZURE_OPENAI_ENDPOINT": "https://example.invalid/chat/completions",
    })
    assert model.headers["api-key"] == "identity"
    assert model.headers["Authorization"] == "Bearer identity"


def test_openai_environment_configuration_still_takes_precedence_over_azure():
    model = typechat.create_language_model({
        "OPENAI_API_KEY": "openai-test-key",
        "OPENAI_MODEL": "gpt-test",
        "AZURE_OPENAI_API_KEY": "azure-test-key",
        "AZURE_OPENAI_ENDPOINT": "https://example.invalid/chat/completions",
    })
    assert model.url == "https://api.openai.com/v1/chat/completions"
    assert model.default_params == {"model": "gpt-test"}
    assert model.headers["Authorization"] == "Bearer openai-test-key"
    assert "api-key" not in model.headers


def test_azure_rejects_ambiguous_authentication():
    with pytest.raises(ValueError, match="not both"):
        typechat.create_azure_openai_language_model(
            "azure-test-key",
            "https://example.invalid/chat/completions",
            token_provider=lambda: "token",
        )


def test_azure_requires_authentication():
    with pytest.raises(ValueError, match="API key or a token provider"):
        typechat.create_azure_openai_language_model(None, "https://example.invalid/chat/completions")
