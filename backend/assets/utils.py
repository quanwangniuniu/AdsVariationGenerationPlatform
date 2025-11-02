# assets/utils.py
from itsdangerous import TimestampSigner, BadSignature, SignatureExpired
from django.conf import settings
import requests
from pathlib import Path
import os
from dotenv import load_dotenv

#load .env
current_file = Path(__file__)
backend_dir = current_file.parent.parent
env_path = backend_dir.parent / '.env'
load_dotenv(env_path)

signer = TimestampSigner(settings.SECRET_KEY)

def generate_signed_token(asset_id):
    """Generate a signed token for the given asset ID"""
    return signer.sign(str(asset_id)).decode()

def verify_signed_token(token, max_age=3600):
    """
    Verify a signed token (valid for 1 hour by default).

    Args:
        token (str): The signed token to verify.
        max_age (int): Maximum age in seconds (default: 3600, i.e. 1 hour).

    Returns:
        int: The original asset ID if verification succeeds.
        None: If the token is invalid or expired.
    """
    try:
        unsigned = signer.unsign(token, max_age=max_age)
        return int(unsigned)
    except (BadSignature, SignatureExpired):
        return None

def scan_with_virustotal(file_obj):
    """
    Upload a file to VirusTotal for scanning.
    Return a dict with scan results (safe/unsafe + details).
    """
    api_key = os.getenv("VIRUSTOTAL_API_KEY")
    if not api_key:
        raise RuntimeError("VirusTotal API key not configured, this cause problems")

    url = "https://www.virustotal.com/api/v3/files"
    headers = {"x-apikey": api_key}
    files = {"file": (file_obj.name, file_obj, "application/octet-stream")}

    try:
        resp = requests.post(url, headers=headers, files=files)
        resp.raise_for_status()
    except Exception as e:
        return {"safe": False, "error": str(e)}

    data = resp.json()
    analysis_id = data["data"]["id"]
    return check_virustotal_result(analysis_id)


def check_virustotal_result(analysis_id):
    """
    Query VirusTotal scan result.
    Returns a dict with:
    - safe (bool)
    - malicious (int)
    - suspicious (int)
    - harmless (int)
    - undetected (int)
    - permalink (str)
    """
    api_key = os.getenv("VIRUSTOTAL_API_KEY")
    if not api_key:  # Fixed: was checking for undefined API_KEY
        raise RuntimeError("VirusTotal API key not configured, this cause problems")
    headers = {"x-apikey": api_key}
    url = f"https://www.virustotal.com/api/v3/analyses/{analysis_id}"

    import time
    for attempt in range(60):  # Poll up to ~20s
        resp = requests.get(url, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"VirusTotal API error: {resp.text}")

        data = resp.json()
        attributes = data["data"]["attributes"]
        status = attributes["status"]

        if status == "completed":
            stats = attributes["stats"]

            result = {
                "safe": stats["malicious"] == 0 and stats["suspicious"] == 0,
                "malicious": stats["malicious"],
                "suspicious": stats["suspicious"],
                "harmless": stats["harmless"],
                "undetected": stats["undetected"],
                "permalink": f"https://www.virustotal.com/gui/file-analysis/{analysis_id}",
            }
            return result
        elif status == "queued":
            print(f"Scan queued, attempt {attempt + 1}/30")
        else:
            print(f"Scan status: {status}, attempt {attempt + 1}/30")
        time.sleep(2)

    # Timeout case
    return {
        "safe": False,
        "error": "Timeout waiting for VirusTotal result",
        "permalink": f"https://www.virustotal.com/gui/file-analysis/{analysis_id}",
    }

def format_file_size(size_bytes: int) -> str:
    """
    Automatically converts the number of bytes to B/KB/MB/GB/TB and returns a friendly string.
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 ** 3:
        return f"{size_bytes / (1024 ** 2):.2f} MB"
    elif size_bytes < 1024 ** 4:
        return f"{size_bytes / (1024 ** 3):.2f} GB"
    else:
        return f"{size_bytes / (1024 ** 4):.2f} TB"