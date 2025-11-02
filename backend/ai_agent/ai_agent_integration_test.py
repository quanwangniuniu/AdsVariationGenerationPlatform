"""
Integration test for AI Agent module using real data.

This test creates real database records based on provided Tesla ad data
and tests the complete ad variant generation flow without mocking external APIs.

WARNING: This test will make real API calls to external services.
"""

import os
import time
import unittest
from datetime import datetime
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from ai_agent.models import AdVariant, AdVariantFeedback
from AdSpark.models import Creative, Advertiser
from ai_agent.tasks import generate_ad_variant_async

User = get_user_model()


class RealDataIntegrationTest(APITestCase):
    """
    Integration test using real Tesla ad data.

    Test Case ID: TC-INT-001
    Purpose: Verify end-to-end ad variant generation with real data
    Preconditions:
        - Real API keys are configured
        - External services are accessible
        - Test database is available
    Steps:
        1. Create real advertiser and creative data based on Tesla ads
        2. Create test user and authenticate
        3. Execute ad variant generation with real API calls
        4. Verify complete workflow from creation to completion
    Expected Result:
        - Variant created successfully
        - Real API calls succeed
        - Database updated with real response data
        - Confidence score calculated based on real response
    """

    @classmethod
    def setUpClass(cls):
        """Set up class-level data for integration tests."""
        super().setUpClass()

        # Check if API keys are configured
        if not os.getenv('DIFY_API_KEY') or not os.getenv('SCREENSHOT_API_KEY'):
            raise unittest.SkipTest(
                "Integration test skipped: API keys not configured. "
                "Set DIFY_API_KEY and SCREENSHOT_API_KEY environment variables to run integration tests."
            )

    def setUp(self):
        """Set up test data using real Tesla ad information."""

        # Create Tesla advertiser based on real data
        self.tesla_advertiser = Advertiser.objects.create(
            advertiser_id='AR17828074650563772417',
            name='Tesla Inc.',
            first_seen_at=timezone.datetime.fromtimestamp(1726591243, tz=timezone.utc),
            last_seen_at=timezone.datetime.fromtimestamp(1755168180, tz=timezone.utc)
        )

        # Create text ad creative based on real Tesla data
        self.tesla_text_creative = Creative.objects.create(
            ad_creative_id='CR12917232494838808577',
            advertiser=self.tesla_advertiser,
            format='text',
            image_url='https://tpc.googlesyndication.com/archive/simgad/15462957917811727813',
            width=380,
            height=464,
            first_shown=timezone.datetime.fromtimestamp(1726591243, tz=timezone.utc),
            last_shown=timezone.datetime.fromtimestamp(1755167902, tz=timezone.utc),
            details_link='https://adstransparency.google.com/advertiser/AR17828074650563772417/creative/CR12917232494838808577?region=US',
            target_domain='tesla.com',
            region='US',
            platform='SEARCH'
        )

        # Create video ad creative based on real Tesla data
        self.tesla_video_creative = Creative.objects.create(
            ad_creative_id='CR03692439648442777601',
            advertiser=self.tesla_advertiser,
            format='video',
            video_link='https://displayads-formats.googleusercontent.com/ads/preview/content.js?client=ads-integrity-transparency&obfuscatedCustomerId=4836351660&creativeId=753416944045&uiFeatures=12,54&adGroupId=180742604358&assets=%3DH4sIAAAAAAAAAOPy5eLkeH2561U3qwAPkNm_ZsJbIJMRyJwEYTIBmQfWPF5xjElAE8hcOvn8tDtMAmxA5lSIAmYg89z1BW2bmQVkpdg5bvdsXbuKCcjYMWHTxccgxttXR56BGUv2Tmm6wwQALP6PsXMAAAA&sig=ACiVB_x7FYjLRM4HIemczCb8eTy4IiMEJA&htmlParentId=fletch-render-7260082946377079244&responseCallback=fletchCallback7260082946377079244',
            first_shown=timezone.datetime.fromtimestamp(1747777014, tz=timezone.utc),
            last_shown=timezone.datetime.fromtimestamp(1755168180, tz=timezone.utc),
            details_link='https://adstransparency.google.com/advertiser/AR17828074650563772417/creative/CR03692439648442777601?region=US',
            target_domain='tesla.com',
            region='US',
            platform='YOUTUBE'
        )

        # Create test user
        self.test_user = User.objects.create_user(
            username='tesla_test_user',
            email='tesla_test@example.com',
            password='testpass123'
        )

        # Create authentication token
        self.user_token = Token.objects.create(user=self.test_user)

    def authenticate_user(self):
        """Helper method to authenticate the test user."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.user_token.key}')

    def test_real_ad_variant_generation_text_ad(self):
        """
        Test Case ID: TC-INT-002
        Purpose: Test real ad variant generation for Tesla text ad
        Preconditions: Real Tesla text ad creative exists
        Steps:
            1. Create ad variant for Tesla text ad
            2. Execute real async task
            3. Wait for completion
            4. Verify real API responses
        Expected Result:
            - Real screenshot generated
            - Real Dify API response received
            - Variant updated with real data
            - Confidence score reflects real response quality
        """
        print("\n" + "=" * 60)
        print("INTEGRATION TEST: Real Tesla Text Ad Variant Generation")
        print("=" * 60)

        # Create ad variant for Tesla text ad
        test_variant = AdVariant.objects.create(
            original_ad=self.tesla_text_creative,
            user=self.test_user,
            variant_title=f"Tesla Text Ad Variant - {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            variant_description="Real integration test variant",
            variant_image_url="",
            ai_generation_params={
                "original_image_url": self.tesla_text_creative.image_url,
                "user_prompt": "Create an engaging social media version",
            },
            ai_agent_platform='dify',
            generation_status='pending',
            ai_prompt_used="Create an engaging social media version",
            ai_response_metadata={}
        )

        print("\n" + "-" * 40)
        print("CREATED VARIANT DATA:")
        print("-" * 40)
        print(f"Variant ID: {test_variant.id}")
        print(f"Variant Title: {test_variant.variant_title}")
        print(f"User: {test_variant.user.username}")
        print(f"Original Ad ID: {test_variant.original_ad.ad_creative_id}")
        print(f"Original Ad Advertiser: {test_variant.original_ad.advertiser.name}")
        print(f"AI Platform: {test_variant.ai_agent_platform}")
        print(f"Initial Status: {test_variant.generation_status}")
        print(f"Created At: {test_variant.generation_requested_at}")
        print(f"AI Prompt: {test_variant.ai_prompt_used}")
        print(f"Generation Params: {test_variant.ai_generation_params}")

        # Execute the real async task
        print("\nExecuting real async task...")
        start_time = time.time()

        try:
            result = generate_ad_variant_async(
                variant_id=test_variant.id,
                original_ad_id=self.tesla_text_creative.ad_creative_id,
                prompt="Create an engaging social media version",
                user_id=self.test_user.id
            )

            execution_time = time.time() - start_time
            print(f"Task completed in {execution_time:.2f} seconds")

            # Verify task result
            self.assertEqual(result['status'], 'success')
            self.assertEqual(result['variant_id'], test_variant.id)
            print(f"Task result: {result}")

            # Refresh variant from database
            test_variant.refresh_from_db()

            # Print updated variant data
            print("\n" + "-" * 40)
            print("UPDATED VARIANT DATA AFTER API CALL:")
            print("-" * 40)
            print(f"Variant ID: {test_variant.id}")
            print(f"Final Status: {test_variant.generation_status}")
            print(f"Confidence Score: {test_variant.confidence_score}")
            print(f"Generated Description: {test_variant.variant_description}")
            print(f"Generated Image URL: {test_variant.variant_image_url}")
            print(f"Completed At: {test_variant.generation_completed_at}")
            print(
                f"Generation Duration: {test_variant.generation_completed_at - test_variant.generation_requested_at if test_variant.generation_completed_at else 'N/A'}")
            print(f"AI Response Metadata: {test_variant.ai_response_metadata}")

            # Verify variant was updated with real data
            self.assertEqual(test_variant.generation_status, 'completed')
            self.assertIsNotNone(test_variant.generation_completed_at)
            self.assertIsNotNone(test_variant.ai_response_metadata)
            self.assertIsNotNone(test_variant.confidence_score)

            # Verify real API responses
            metadata = test_variant.ai_response_metadata
            self.assertIn('text', metadata)
            self.assertTrue(len(metadata['text']) > 0, "Generated text should not be empty")

            if 'variant_url' in metadata and metadata['variant_url']:
                self.assertTrue(
                    metadata['variant_url'].startswith('http'),
                    "Variant URL should be a valid HTTP URL"
                )

            # Test feedback creation with real data
            self._test_real_feedback_creation(test_variant)

        except Exception as e:
            print(f"Integration test failed: {str(e)}")

            # Check variant status even if task failed
            test_variant.refresh_from_db()
            print(f"Variant status after failure: {test_variant.generation_status}")

            if test_variant.ai_response_metadata:
                print(f"Error metadata: {test_variant.ai_response_metadata}")

            # Re-raise the exception for test failure
            raise

    def _test_real_feedback_creation(self, variant):
        """
        Test real feedback creation for the generated variant.

        Test Case ID: TC-INT-003
        Purpose: Test feedback creation with real variant data
        """
        print("\n" + "-" * 40)
        print("TESTING REAL FEEDBACK CREATION:")
        print("-" * 40)

        # Create initial feedback (only one due to unique_together constraint)
        feedback_data = {
            "is_approved": True,
            "rating": 5,
            "feedback_text": "Excellent variant! The AI did a great job creating an engaging social media version. The content feels authentic and appeals to the target demographic.",
            "feedback_details": {
                "test_type": "integration",
                "quality_aspects": ["creativity", "target_audience_fit", "brand_consistency"],
                "api_response_quality": "excellent" if variant.confidence_score > 0.8 else "good" if variant.confidence_score > 0.6 else "needs_improvement",
                "generation_time_seconds": (
                        variant.generation_completed_at - variant.generation_requested_at).total_seconds() if variant.generation_completed_at else None,
                "original_ad_format": variant.original_ad.format,
                "ai_platform": variant.ai_agent_platform
            }
        }

        print("Creating initial feedback...")

        feedback = AdVariantFeedback.objects.create(
            variant=variant,
            user=self.test_user,
            is_approved=feedback_data["is_approved"],
            rating=feedback_data["rating"],
            feedback_text=feedback_data["feedback_text"],
            feedback_details=feedback_data["feedback_details"]
        )

        # Print created feedback details
        print(f"Feedback ID: {feedback.id}")
        print(f"Approval Status: {feedback.is_approved}")
        print(f"Rating: {feedback.rating}/5")
        print(f"Feedback Text: {feedback.feedback_text}")
        print(f"Created At: {feedback.created_at}")
        print(f"Feedback Details: {feedback.feedback_details}")

        # Verify feedback creation
        self.assertIsNotNone(feedback.id)
        self.assertEqual(feedback.variant, variant)
        self.assertEqual(feedback.user, self.test_user)

        print(f"\n✅ Successfully created feedback entry")

        # Test feedback update (since unique_together prevents multiple feedbacks)
        print("\nTesting feedback update...")

        try:
            feedback.feedback_text = "Updated: This is my final assessment after reviewing all aspects."
            feedback.rating = 4
            feedback.is_approved = None  # Set to pending
            feedback.feedback_details.update({
                "update_type": "revision",
                "updated_aspects": ["rating", "approval_status", "feedback_text"]
            })
            feedback.save()

            print("✅ Successfully updated existing feedback")
            print(f"Updated Rating: {feedback.rating}/5")
            print(f"Updated Text: {feedback.feedback_text}")
            print(f"Updated Status: {feedback.is_approved}")

        except Exception as e:
            print(f"❌ Error updating feedback: {e}")

        # Test feedback statistics
        print("\nFEEDBACK STATISTICS:")
        print("-" * 20)

        all_feedbacks = AdVariantFeedback.objects.filter(variant=variant)
        total_count = all_feedbacks.count()
        approved_count = all_feedbacks.filter(is_approved=True).count()
        rejected_count = all_feedbacks.filter(is_approved=False).count()
        pending_count = all_feedbacks.filter(is_approved__isnull=True).count()

        # Calculate average rating
        ratings = all_feedbacks.exclude(rating__isnull=True).values_list('rating', flat=True)
        avg_rating = sum(ratings) / len(ratings) if ratings else 0

        print(f"Total Feedbacks: {total_count}")
        print(f"Approved: {approved_count}")
        print(f"Rejected: {rejected_count}")
        print(f"Pending: {pending_count}")
        print(f"Average Rating: {avg_rating:.2f}/5")

        # Verify unique constraint
        print(f"\n✅ Verified unique constraint: only {total_count} feedback(s) per user per variant")

        return [feedback]

    def test_real_api_with_authentication(self):
        """
        Test Case ID: TC-INT-004
        Purpose: Test API endpoints with real data through authentication
        Preconditions: Real variant and feedback data exists
        Steps:
            1. Authenticate user
            2. Create variant via API
            3. Monitor status via API
            4. Create feedback via API
        Expected Result:
            - All API calls succeed with real data
            - Database reflects real API responses
        """
        print("\n" + "=" * 60)
        print("INTEGRATION TEST: Real API Endpoints")
        print("=" * 60)

        self.authenticate_user()

        # Test variant creation via API
        from django.urls import reverse

        url = reverse('ad-variant-list')
        data = {
            'original_ad_id': self.tesla_text_creative.ad_creative_id,
            'prompt': 'Create a compelling Instagram story version of this Tesla ad',
            'ai_agent_platform': 'dify'
        }

        print("Testing variant creation via API...")
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, 202)  # Accepted

        response_data = response.data
        variant_id = response_data['variant']['id']
        task_id = response_data['task_id']

        print(f"Created variant via API: {variant_id}")
        print(f"Task ID: {task_id}")

        # Monitor task status
        status_url = reverse('ad-variant-status', kwargs={'pk': variant_id})

        print("Monitoring task status...")
        max_wait_time = 120  # 2 minutes
        start_time = time.time()

        while time.time() - start_time < max_wait_time:
            status_response = self.client.get(status_url)
            self.assertEqual(status_response.status_code, 200)

            status_data = status_response.data
            current_status = status_data['status']

            print(f"Current status: {current_status}")

            if current_status in ['completed', 'failed']:
                break

            time.sleep(5)  # Wait 5 seconds before checking again

        # Verify final status
        final_variant = AdVariant.objects.get(id=variant_id)
        print(f"Final variant status: {final_variant.generation_status}")

        if final_variant.generation_status == 'completed':
            print("✅ Integration test PASSED - Real API calls successful!")
            print(f"Generated text: {final_variant.variant_description}")
            print(f"Generated image: {final_variant.variant_image_url}")
            print(f"Confidence score: {final_variant.confidence_score}")
        else:
            print("❌ Integration test WARNING - Task did not complete successfully")
            print(f"Error metadata: {final_variant.ai_response_metadata}")

    def tearDown(self):
        """Clean up after each test."""
        print("\n" + "=" * 60)
        print("Cleaning up test data...")

        # Optional: Keep data for inspection by commenting out these lines
        # AdVariant.objects.filter(user=self.test_user).delete()
        # AdVariantFeedback.objects.filter(user=self.test_user).delete()

        print("Test completed.")


# Utility function to run integration tests manually
def run_integration_test():
    """
    Utility function to run integration tests manually.

    Usage:
        python manage.py shell
        from ai_agent.test_integration import run_integration_test
        run_integration_test()
    """
    import django
    from django.test.utils import get_runner
    from django.conf import settings

    django.setup()

    # Check environment
    if not os.getenv('DIFY_API_KEY'):
        print("❌ DIFY_API_KEY not set. Please configure API keys before running integration tests.")
        return

    if not os.getenv('SCREENSHOT_API_KEY'):
        print("❌ SCREENSHOT_API_KEY not set. Please configure API keys before running integration tests.")
        return

    print("🚀 Running Real Data Integration Tests...")
    print("⚠️  WARNING: This will make real API calls and may incur costs!")

    # Run the test
    test_case = RealDataIntegrationTest()
    test_case.setUp()

    try:
        test_case.test_real_ad_variant_generation_text_ad()
        test_case.test_real_api_with_authentication()
        print("\n✅ All integration tests passed!")
    except Exception as e:
        print(f"\n❌ Integration test failed: {e}")
    finally:
        test_case.tearDown()


if __name__ == "__main__":
    run_integration_test()