from celery import shared_task
from django.utils import timezone
from django.db import transaction
import logging

from .models import AdVariant, WorkspaceAdVariant
from .dify_api_access import run_dify_workflow
from .generate_screenshot import generate_screenshot_url

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_ad_variant_async(self, variant_id, original_ad_id, prompt, user_id):
    """
    Asynchronously generate an ad variant

    Args:
        variant_id: ID of the AdVariant instance
        original_ad_id: ID of the original ad
        prompt: User prompt
        user_id: User ID
    """
    try:
        # Retrieve the ad variant instance
        ad_variant = AdVariant.objects.get(id=variant_id)

        # Update status to processing
        with transaction.atomic():
            ad_variant.generation_status = 'processing'
            ad_variant.save()

        logger.info(f"Starting async generation for ad variant {variant_id}")

        # Call Dify API
        dify_result = run_dify_workflow(
            image_url=generate_screenshot_url(original_ad_id),
            gener_prompt=prompt,
            user_id=str(user_id)
        )

        # Update ad variant result
        with transaction.atomic():
            ad_variant.variant_description = dify_result.get('text', '')
            ad_variant.variant_image_url = dify_result.get('variant_url', '')
            ad_variant.generation_status = 'completed'
            ad_variant.generation_completed_at = timezone.now()
            ad_variant.ai_response_metadata = dify_result
            ad_variant.confidence_score = _calculate_confidence_score(dify_result)
            ad_variant.save()

        logger.info(f"Successfully generated ad variant {variant_id}")

        return {
            'status': 'success',
            'variant_id': variant_id,
            'message': 'Ad variant generated successfully'
        }

    except AdVariant.DoesNotExist:
        logger.error(f"Ad variant {variant_id} does not exist")
        return {
            'status': 'error',
            'variant_id': variant_id,
            'message': 'Ad variant does not exist'
        }

    except Exception as exc:
        logger.error(f"Error while generating ad variant {variant_id}: {str(exc)}")

        # Update status to failed
        try:
            ad_variant = AdVariant.objects.get(id=variant_id)
            with transaction.atomic():
                ad_variant.generation_status = 'failed'
                ad_variant.generation_completed_at = timezone.now()
                ad_variant.ai_response_metadata = {"error": str(exc)}
                ad_variant.save()
        except AdVariant.DoesNotExist:
            pass

        # Retry if retries are available
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying ad variant generation {variant_id} (attempt {self.request.retries + 1})")
            raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

        return {
            'status': 'error',
            'variant_id': variant_id,
            'message': f'Generation failed: {str(exc)}'
        }


def _calculate_confidence_score(dify_result):
    """
    Calculate a confidence score based on the API response
    """
    try:
        text = dify_result.get('text', '')
        variant_url = dify_result.get('variant_url', '')

        # Basic scoring logic
        score = 0.5  # Base score

        if text and len(text.strip()) > 0:
            score += 0.3  # Text generated successfully

        if variant_url and variant_url.startswith('http'):
            score += 0.2  # Valid image URL generated

        return min(score, 1.0)

    except Exception:
        return 0.5  # Default score if calculation fails
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_workspace_ad_variant_async(self, variant_id, original_ad_id, prompt, workspace_id, user_id):
    """Asynchronously generate a workspace-scoped ad variant."""
    try:
        variant = WorkspaceAdVariant.objects.get(id=variant_id)

        with transaction.atomic():
            variant.generation_status = 'processing'
            variant.save(update_fields=['generation_status'])

        logger.info(
            f"Starting async generation for workspace ad variant {variant_id} in workspace {workspace_id}"
        )

        dify_result = run_dify_workflow(
            image_url=generate_screenshot_url(original_ad_id),
            gener_prompt=prompt,
            user_id=str(user_id)
        )

        with transaction.atomic():
            variant.variant_description = dify_result.get('text', '')
            variant.variant_image_url = dify_result.get('variant_url', '')
            variant.generation_status = 'completed'
            variant.generation_completed_at = timezone.now()
            variant.ai_response_metadata = dify_result
            variant.confidence_score = _calculate_confidence_score(dify_result)
            variant.save()

        logger.info(f"Successfully generated workspace ad variant {variant_id}")

        return {
            'status': 'success',
            'variant_id': variant_id,
            'workspace_id': workspace_id,
            'message': 'Workspace ad variant generated successfully'
        }

    except WorkspaceAdVariant.DoesNotExist:
        logger.error(f"Workspace ad variant {variant_id} does not exist")
        return {
            'status': 'error',
            'variant_id': variant_id,
            'workspace_id': workspace_id,
            'message': 'Workspace ad variant does not exist'
        }

    except Exception as exc:
        logger.error(
            f"Error while generating workspace ad variant {variant_id} (workspace {workspace_id}): {str(exc)}"
        )

        try:
            variant = WorkspaceAdVariant.objects.get(id=variant_id)
            with transaction.atomic():
                variant.generation_status = 'failed'
                variant.generation_completed_at = timezone.now()
                variant.ai_response_metadata = {"error": str(exc)}
                variant.save()
        except WorkspaceAdVariant.DoesNotExist:
            pass

        if self.request.retries < self.max_retries:
            attempt = self.request.retries + 1
            logger.info(
                f"Retrying workspace ad variant generation {variant_id} (workspace {workspace_id}) attempt {attempt}"
            )
            raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

        return {
            'status': 'error',
            'variant_id': variant_id,
            'workspace_id': workspace_id,
            'message': f'Generation failed: {str(exc)}'
        }

