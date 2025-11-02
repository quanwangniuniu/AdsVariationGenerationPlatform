from rest_framework.routers import DefaultRouter

from .views import ApiAccessLogViewSet

router = DefaultRouter()
router.register(r"logs", ApiAccessLogViewSet, basename="audit-log")

urlpatterns = router.urls
