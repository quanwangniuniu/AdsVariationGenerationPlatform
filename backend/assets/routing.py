from django.urls import re_path
from .comsumers import ScanStatusConsumer

websocket_urlpatterns = [
    re_path(r"ws/scan/(?P<pending_id>\d+)/$", ScanStatusConsumer.as_asgi()),
]
