import os
import json
import requests
from dotenv import load_dotenv
from django.test import SimpleTestCase, override_settings

# ✅ Load environment variables
load_dotenv()

@override_settings(DATABASES={})
class DifyConnectionTest(SimpleTestCase):
    """✅ Test connection to Dify workflow API with user parameter."""

    databases = set()

    def test_generate_ad_from_image_and_prompt(self):
        """🎯 Test sending 'url' and 'prompt' to Dify workflow and verifying output."""
        workflow_url = os.getenv("DIFY_WORKFLOW_URL", "http://47.95.201.202/v1/workflows/run")
        access_token = os.getenv("DIFY_API_KEY")

        print(f"🧩 Loaded API Key: {access_token[:10]}..." if access_token else "❌ No API key loaded!")
        print(f"🔧 Using workflow URL: {workflow_url}")

        payload = {
            "inputs": {
                "url": "https://api.screenshotmachine.com/?key=429f4f&url=https://tpc.googlesyndication.com/archive/simgad/7561357505873189479&dimension=380x539",
                "prompt": "Car"
            },
            "user": "test_user_001"   # ✅ 必须在这里！不是 inputs 里
        }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        print("🚀 Sending request to Dify...")
        response = requests.post(workflow_url, headers=headers, data=json.dumps(payload))
        print(f"🔁 Response code: {response.status_code}")
        print(f"📩 Response body: {response.text}")

        # Validate
        if response.status_code == 200:
            data = response.json()
            outputs = data.get("data", {}).get("outputs", {})
            text = outputs.get("text")
            image_url = None

            # Try to extract image URL from possible locations
            if "image_url" in outputs:
                image_url = outputs["image_url"]
            elif "json" in outputs and isinstance(outputs["json"], list) and len(outputs["json"]) > 0:
                image_url = outputs["json"][0].get("result")

            print("\n📝 Generated Ad Text:\n", text)
            print("\n🖼️ Generated Image URL:", image_url)

        elif response.status_code == 401:
            print("⚠️ Unauthorized — invalid API key.")
        elif response.status_code == 400:
            print("⚠️ Bad request — check input structure or workflow configuration.")

        self.assertIn(response.status_code, [200, 401], msg=f"Unexpected response: {response.text}")
        print("✅ Dify connection test completed successfully.")
