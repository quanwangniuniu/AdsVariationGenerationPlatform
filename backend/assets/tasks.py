# tasks.py
import os
from django.core.files.base import File
from django.utils import timezone
from datetime import timedelta
from .models import PendingAsset, Asset
from .utils import scan_with_virustotal
from celery import shared_task
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .serializers import AssetUploadSerializer
from pathlib import Path
from dotenv import load_dotenv

current_file = Path(__file__)
backend_dir = current_file.parent.parent
env_path = backend_dir.parent / '.env'
load_dotenv(env_path)

@shared_task
def cleanup_soft_deleted():
    cutoff = timezone.now() - timedelta(days=30)
    Asset.objects.filter(is_active=False, deleted_at__lt=cutoff).delete()

def notify_frontend(pending_id, message):
    """
    Send a real-time message to the WebSocket group
    associated with the given pending_id.
    """
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"scan_{pending_id}",
        {"type": "scan_update", "message": message}
    )


@shared_task
def process_pending_asset(pending_id):
    """
    Background task to process a PendingAsset:
    1. Update status to in_progress and notify frontend
    2. Run VirusTotal scan
    3. If error or malicious → fail and notify frontend
    4. If safe → convert to Asset and mark as completed
    """

    # Try to fetch the pending record
    try:
        pending = PendingAsset.objects.get(id=pending_id)
    except PendingAsset.DoesNotExist:
        return

    # Step 1: mark as in progress
    pending.status = "in_progress"
    pending.save(update_fields=["status"])
    notify_frontend(pending_id, {"status": "in_progress", "msg": "Scan started"})

    # Step 2: run VirusTotal scan
    with pending.tmp_file.open("rb") as f:
        result = scan_with_virustotal(f)

    # Step 3a: handle errors
    if "error" in result:
        pending.status = "failed"
        pending.scan_result = result
        pending.save(update_fields=["status", "scan_result"])
        notify_frontend(pending_id, {"status": "failed", "msg": "Scan error"})
        return

    # Step 3b: handle malicious/suspicious detection
    if not result["safe"]:
        pending.status = "failed"
        pending.scan_result = result
        pending.save(update_fields=["status", "scan_result"])
        notify_frontend(pending_id, {"status": "failed", "msg": "Malicious file detected"})
        return

    # Step 4: safe → promote to Asset
    with pending.tmp_file.open("rb") as file_handle:
        file_obj = File(file_handle, name=pending.original_name)
        serializer = AssetUploadSerializer(
            data={"file": file_obj},
            context={"pending": pending},
        )
        serializer.is_valid(raise_exception=True)
        asset = serializer.save(workspace=pending.workspace)

    pending.status = "completed"
    pending.scan_result = result
    pending.save(update_fields=["status", "scan_result"])
    notify_frontend(pending_id, {"status": "completed", "msg": "Scan completed"})

# // Open a WebSocket connection to the backend
# // Replace `15` with the actual pending_id you want to subscribe to
# const socket = new WebSocket("ws://127.0.0.1:8000/ws/scan/15/");
#
# // Listen for incoming messages from the server
# socket.onmessage = function(event) {
#   // Parse the JSON data sent from the backend
#   const data = JSON.parse(event.data);
#
#   // Log the scan status update to the browser console
#   console.log("Scan status update:", data);
#
#   // Example: you could also update the UI dynamically here
#   // document.getElementById("scan-status").innerText = data.status;
# };
