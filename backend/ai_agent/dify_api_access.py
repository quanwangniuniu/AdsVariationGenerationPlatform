import os
import logging
from typing import Dict, Optional
import requests
from requests.exceptions import RequestException, Timeout, HTTPError, ConnectionError
from dotenv import load_dotenv
from pathlib import Path

#load .env
current_file = Path(__file__)
backend_dir = current_file.parent.parent
env_path = backend_dir.parent / '.env'

load_dotenv(env_path)
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("DIFY_API_KEY")
WORKFLOW_ID = "k2TLVUcw3qqhh9Cf"


class DifyWorkflowError(Exception):
    """Custom exception for Dify workflow related errors"""
    pass


def validate_inputs(image_url: str, gener_prompt: str, user_id: str) -> None:
    """Validate input parameters"""
    if not image_url or not image_url.strip():
        raise ValueError("Image URL cannot be empty")

    if not gener_prompt or not gener_prompt.strip():
        raise ValueError("Generation prompt cannot be empty")

    if not user_id or not user_id.strip():
        raise ValueError("User ID cannot be empty")

    # Check prompt length limit (Dify API requirement)
    if len(gener_prompt) > 48:
        raise ValueError(f"Prompt must be 48 characters or less. Current length: {len(gener_prompt)} characters")

    # Basic URL format validation
    if not (image_url.startswith('http://') or image_url.startswith('https://')):
        raise ValueError("Image URL must be a valid HTTP/HTTPS URL")


def run_dify_workflow(image_url: str, gener_prompt: str, user_id: str) -> Dict[str, Optional[str]]:
    """
    Run a Dify workflow with given image URL, prompt, and user ID.

    :param image_url: URL of the input image
    :param gener_prompt: Prompt text for generation
    :param user_id: Unique identifier of the user
    :return: Dictionary with generated text and result URL
    :raises DifyWorkflowError: When workflow execution fails
    :raises ValueError: When input validation fails
    """

    # Validate API key
    if not API_KEY:
        raise DifyWorkflowError("API_KEY environment variable is not set")

    # Validate input parameters
    try:
        validate_inputs(image_url, gener_prompt, user_id)
    except ValueError as e:
        logger.error(f"Input validation failed: {e}")
        raise

    url = "http://47.95.201.202/v1/workflows/run"

    payload = {
        "inputs": {
            "url": image_url,
            "prompt": gener_prompt
        },
        "response_mode": "blocking",
        "user": user_id
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    logger.info(f"Sending request to Dify workflow for user: {user_id}")

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()

    except Timeout:
        error_msg = "Request timed out after 30 seconds. The server may be overloaded."
        logger.error(error_msg)
        raise DifyWorkflowError(error_msg)

    except ConnectionError:
        error_msg = "Failed to connect to Dify API server. Please check your network connection."
        logger.error(error_msg)
        raise DifyWorkflowError(error_msg)

    except HTTPError as e:
        if response.status_code == 401:
            error_msg = "Authentication failed. Please check your API key."
        elif response.status_code == 403:
            error_msg = "Access forbidden. You may not have permission to use this workflow."
        elif response.status_code == 404:
            error_msg = "Workflow not found. Please check the workflow ID."
        elif response.status_code == 429:
            error_msg = "Rate limit exceeded. Please wait before making another request."
        elif 500 <= response.status_code < 600:
            error_msg = f"Server error ({response.status_code}). Please try again later."
        else:
            error_msg = f"HTTP error {response.status_code}: {response.text}"

        logger.error(error_msg)
        raise DifyWorkflowError(error_msg)

    except RequestException as e:
        error_msg = f"Request failed due to network error: {str(e)}"
        logger.error(error_msg)
        raise DifyWorkflowError(error_msg)

    # Parse response
    try:
        data = response.json()
    except ValueError as e:
        error_msg = "Invalid JSON response received from API"
        logger.error(f"{error_msg}: {response.text}")
        raise DifyWorkflowError(error_msg)

    # Check for API errors
    if "error" in data:
        error_msg = f"API returned error: {data.get('error', 'Unknown error')}"
        logger.error(error_msg)
        raise DifyWorkflowError(error_msg)

    # Parse output data
    try:
        if "data" not in data:
            raise KeyError("Missing 'data' field in response")

        outputs = data["data"]["outputs"]
        final_text = outputs.get("text", "")
        json_list = outputs.get("json", [])

        # Safely get result URL
        result_url = None
        if json_list and isinstance(json_list, list) and len(json_list) > 0:
            if isinstance(json_list[0], dict):
                result_url = json_list[0].get("result")

        logger.info(f"Workflow completed successfully for user: {user_id}")

        return {
            "text": final_text,
            "variant_url": result_url
        }

    except (KeyError, TypeError, IndexError) as e:
        error_msg = f"Unexpected response format from API: {str(e)}"
        logger.error(f"{error_msg}. Response data: {data}")
        raise DifyWorkflowError(error_msg)
'''
Sample return result:
{'text': 'OMG this blush is EVERYTHING! 💕 Just tried it and my cheeks look like I’ve been kissed by an angel 👼✨ So natural yet BUILDABLE—from soft day vibes to full glam night! Perfect for no-makeup makeup days 😍 Who else is obsessed with cream blushes? Drop your faves below! 👇 #CreamBlush #MakeupObsessed #NaturalGlow #BlushReview', 'variant_url': 'http://qianfan-modelbuilder-img-gen.bj.bcebos.com/irag-1.0/2f750b346f464ea1b3b1a26e6fe65231/2f750b346f464ea1b3b1a26e6fe65231/img-0a264da5-9c96-4ad7-5581-b9813ec873d3.png?authorization=bce-auth-v1%2F50c8bb753dcb4e1d8646bb1ffefd3503%2F2025-09-08T03%3A46%3A30Z%2F86400%2Fhost%2F6516f32162e541610f971e2774ee99465b21d67a4473748066632b3532bb8fed'}

'''

# Example usage
if __name__ == "__main__":
    try:
        result = run_dify_workflow(
            "https://api.screenshotmachine.com/?key=429f4f&url=https://tpc.googlesyndication.com/archive/simgad/7561357505873189479&dimension=380x539",
            "South Park",
            "user-001"
        )
        print(result)
    except Exception as e:
        print(f"Error: {e}")
