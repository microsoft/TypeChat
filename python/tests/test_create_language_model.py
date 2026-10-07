"""
Tests for create_language_model's selection of a model from environment variables.

These only inspect the constructed model, so no request is sent.
"""

import pytest

import typechat

_AZURE_ENDPOINT = "https://myres.openai.azure.com/openai/deployments/gpt4/chat/completions?api-version=2023-05-15"


def test_blank_openai_key_with_azure_configured_selects_azure():
    # The shape produced by copying .env.example and filling in only the Azure section.
    model = typechat.create_language_model(
        {
            "OPENAI_MODEL": "",
            "OPENAI_API_KEY": "",
            "AZURE_OPENAI_ENDPOINT": _AZURE_ENDPOINT,
            "AZURE_OPENAI_API_KEY": "azure-secret",
        }
    )
    assert model.url == _AZURE_ENDPOINT
    assert model.headers["api-key"] == "azure-secret"


def test_openai_key_takes_precedence_over_azure_key():
    model = typechat.create_language_model(
        {
            "OPENAI_MODEL": "gpt-4o",
            "OPENAI_API_KEY": "openai-secret",
            "AZURE_OPENAI_ENDPOINT": _AZURE_ENDPOINT,
            "AZURE_OPENAI_API_KEY": "azure-secret",
        }
    )
    assert model.url == "https://api.openai.com/v1/chat/completions"
    assert model.headers["Authorization"] == "Bearer openai-secret"
    assert "api-key" not in model.headers


def test_blank_keys_are_treated_as_missing():
    with pytest.raises(ValueError, match="OPENAI_API_KEY or AZURE_OPENAI_API_KEY"):
        typechat.create_language_model(
            {
                "OPENAI_API_KEY": "",
                "AZURE_OPENAI_ENDPOINT": _AZURE_ENDPOINT,
                "AZURE_OPENAI_API_KEY": "",
            }
        )


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
