import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import assets.routing  # Import your defined WebSocket routes

# Set the default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Standard Django ASGI app (for handling HTTP)
#django_asgi_app = get_asgi_application()

# Main ASGI application for Channels
application = ProtocolTypeRouter({
    # Handle normal HTTP requests
    "http": get_asgi_application(),

    # Handle WebSocket connections
    "websocket": AuthMiddlewareStack(
        URLRouter(
            assets.routing.websocket_urlpatterns
        )
    ),
})
