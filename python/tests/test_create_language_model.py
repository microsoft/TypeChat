"""
Tests for create_language_model's handling of the OpenAI organization variables.

These only inspect the constructed model, so no request is sent.
"""

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
