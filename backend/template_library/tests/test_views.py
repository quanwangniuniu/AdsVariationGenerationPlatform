import pytest

from template_library.views import TemplateViewSet


@pytest.mark.parametrize(
    "detail,expected",
    [
        (
            {
                "content": [
                    {
                        "code": ["TEMPLATE_TOO_LONG"],
                        "message": ["Template must be 48 words or fewer."],
                    }
                ]
            },
            {
                "code": "TEMPLATE_TOO_LONG",
                "message": "Template must be 48 words or fewer.",
            },
        ),
        (
            {
                "code": ["TEMPLATE_EMPTY"],
                "message": ["Template content is required."],
            },
            {
                "code": "TEMPLATE_EMPTY",
                "message": "Template content is required.",
            },
        ),
    ],
)
def test_extract_error_handles_nested_structures(detail, expected):
    assert TemplateViewSet._extract_error(detail) == expected


def test_extract_error_falls_back_to_default_code():
    detail = ["Unexpected error"]
    result = TemplateViewSet._extract_error(detail)
    assert result == {
        "code": "TEMPLATE_VALIDATION_FAILED",
        "message": "Template could not be validated.",
    }
