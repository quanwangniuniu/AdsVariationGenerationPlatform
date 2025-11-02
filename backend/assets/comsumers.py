import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ScanStatusConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pending_id: str | None = None
        self.group_name: str | None = None
    async def connect(self):
        # Extract the pending_id from the URL route
        self.pending_id = self.scope['url_route']['kwargs']['pending_id']
        self.group_name = f"scan_{self.pending_id}"

        # Join the group for this pending scan
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # Leave the group when the socket disconnects
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def scan_update(self, event):
        # Receive a message from the group and send it to the WebSocket client
        await self.send(text_data=json.dumps(event["message"]))
