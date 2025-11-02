import os
import logging
from typing import Optional, Tuple
from urllib.parse import quote

import django
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from AdSpark.models import Creative
from dotenv import load_dotenv
from pathlib import Path


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

#load .env
current_file = Path(__file__)
backend_dir = current_file.parent.parent
env_path = backend_dir.parent / '.env'

load_dotenv(env_path)

class ScreenshotGeneratorError(Exception):
    """Custom exception for screenshot generation errors."""
    pass


DEFAULT_WIDTH = 500
DEFAULT_HEIGHT = 750


class ScreenshotGenerator:
    """
    A utility class for generating screenshot URLs using ScreenshotMachine API.

    Requires SCREENSHOT_API_KEY environment variable to be set.
    Register at https://www.screenshotmachine.com/ to get your API key.
    """

    BASE_API_URL = "https://api.screenshotmachine.com/"

    def __init__(self):
        self.api_key = self._get_api_key()

    def _get_api_key(self) -> str:
        """Retrieve and validate API key from environment variables."""
        api_key = os.getenv("SCREENSHOT_API_KEY")
        if not api_key:
            raise ScreenshotGeneratorError(
                "SCREENSHOT_API_KEY environment variable is not set. "
                "Please register at https://www.screenshotmachine.com/ and set your API key."
            )
        return api_key

    def _validate_creative(self, creative: Creative) -> Tuple[int, int]:
        """Validate creative object has required fields and return usable dimensions."""
        if not creative.image_url:
            raise ScreenshotGeneratorError(f"Creative {creative.ad_creative_id} has no image_url")

        width = creative.width or 0
        height = creative.height or 0

        if width <= 0:
            logger.warning(
                "Creative %s missing valid width (%s); falling back to default %s",
                creative.ad_creative_id,
                creative.width,
                DEFAULT_WIDTH,
            )
            width = DEFAULT_WIDTH

        if height <= 0:
            logger.warning(
                "Creative %s missing valid height (%s); falling back to default %s",
                creative.ad_creative_id,
                creative.height,
                DEFAULT_HEIGHT,
            )
            height = DEFAULT_HEIGHT

        return width, height

    def _build_screenshot_url(self, image_url: str, width: int, height: int) -> str:
        """Build the screenshot API URL with proper URL encoding."""
        encoded_image_url = quote(image_url, safe=':/?#[]@!$&\'()*+,;=')

        return (
            f"{self.BASE_API_URL}?"
            f"key={self.api_key}&"
            f"url={encoded_image_url}&"
            f"dimension={width}x{height}"
        )

    def generate_screenshot_url(self, ad_creative_id: str) -> Optional[str]:
        """
        Generate screenshot URL for a given creative ID.

        Args:
            ad_creative_id: The ID of the creative to generate screenshot for

        Returns:
            Screenshot URL string if successful, None if failed

        Raises:
            ScreenshotGeneratorError: For validation and configuration errors
        """
        if not ad_creative_id or not ad_creative_id.strip():
            logger.error("ad_creative_id cannot be empty or None")
            return None

        ad_creative_id = ad_creative_id.strip()

        try:
            # Fetch creative from database
            creative = Creative.objects.get(ad_creative_id=ad_creative_id)
            logger.info(f"Found creative with ID: {ad_creative_id}")

            # Validate creative data and determine dimensions
            width, height = self._validate_creative(creative)

            # Generate screenshot URL
            screenshot_url = self._build_screenshot_url(creative.image_url, width, height)

            logger.info(f"Successfully generated screenshot URL for creative {ad_creative_id}")
            return screenshot_url

        except ObjectDoesNotExist:
            logger.error(f"Creative with ad_creative_id '{ad_creative_id}' not found in database")
            return None

        except ScreenshotGeneratorError as e:
            logger.error(f"Screenshot generation failed for creative {ad_creative_id}: {e}")
            return None

        except Exception as e:
            logger.error(f"Unexpected error generating screenshot for creative {ad_creative_id}: {e}")
            return None


# Convenience function for backward compatibility
def generate_screenshot_url(ad_creative_id: str) -> Optional[str]:
    """
    Generate screenshot URL for a given creative ID.

    This is a convenience function that maintains backward compatibility
    with the original function signature.

    Args:
        ad_creative_id: The ID of the creative to generate screenshot for

    Returns:
        Screenshot URL string if successful, None if failed
    """
    try:
        generator = ScreenshotGenerator()
        return generator.generate_screenshot_url(ad_creative_id)
    except ScreenshotGeneratorError as e:
        logger.error(f"Configuration error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error initializing ScreenshotGenerator: {e}")
        return None

'''
if __name__ == "__main__":
    # Example: input an ad_creative_id
    test_id = input("Enter ad_creative_id: ")
    generate_screenshot_url(test_id)
'''
