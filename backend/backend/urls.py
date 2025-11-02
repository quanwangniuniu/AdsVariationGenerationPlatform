"""
URL configuration for backend project.

Routes include administration, API modules, health checks, and metrics endpoints.
"""
import os
from prometheus_client import CollectorRegistry, multiprocess, generate_latest, REGISTRY
from django.contrib import admin
from django.urls import path, include, get_resolver, URLPattern, URLResolver
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from django.views.generic import TemplateView

# Initialize Prometheus registry
# Use multiprocess collector only if PROMETHEUS_MULTIPROC_DIR is set (production)
# Otherwise use default registry (development)
if os.environ.get('PROMETHEUS_MULTIPROC_DIR'):
    registry = CollectorRegistry()
    multiprocess.MultiProcessCollector(registry)
else:
    registry = REGISTRY

def health_check(request):
    return HttpResponse("OK", content_type="text/plain")


def billing_metrics(request):
    payload = generate_latest(registry)
    return HttpResponse(payload, content_type="text/plain; version=0.0.4")
def debug_urls(request):
    """
    Return a readable list of all URL patterns, including nested includes.
    """
    def extract_patterns(patterns, prefix=''):
        urls = []
        for pattern in patterns:
            if isinstance(pattern, URLPattern):
                urls.append(f"{prefix}{pattern.pattern}  (name={pattern.name}) -> {pattern.callback.__module__}.{pattern.callback.__name__}")
            elif isinstance(pattern, URLResolver):
                urls.extend(extract_patterns(pattern.url_patterns, prefix + str(pattern.pattern)))
        return urls

    resolver = get_resolver()
    all_patterns = extract_patterns(resolver.url_patterns)

    # 输出为 HTML <pre> 保持格式
    return HttpResponse(f"<pre>{chr(10).join(all_patterns)}</pre>")

urlpatterns = [
    path('admin/', admin.site.urls),
    #path('api/', include('campaigns.urls')),
    path('api/test/', include('test_app.urls')),
    path('api/adspark/', include('AdSpark.urls')),
    path('api/billing/', include('billing.urls', namespace='billing')),
    path('api/audit/', include('audit.urls')),
    path('django/debug-urls/', debug_urls, name='debug_urls'),
    path('api/account/', include('accounts.urls')),
    path('', TemplateView.as_view(template_name='account_2.html'), name='home'),
    path('django/home/', TemplateView.as_view(template_name='account_2.html'), name='django_home'),
    path('health/', health_check, name='health_check'),
    path('metrics/billing/', billing_metrics, name='billing_metrics'),
    path('api/advariants/',include('ai_agent.urls')),
    path('api/', include('workspace.urls')),
    path('api/',include('assets.urls')),
    path('api/', include('template_library.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
