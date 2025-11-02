/**
 * Workspace Billing Page
 * Route: /workspaces/[workspaceId]/billing
 *
 * Displays workspace subscription, token balance, and billing tabs
 * (Transactions, Invoices, Payments, Webhook Events)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  workspaceTokenProductsQuery,
  workspaceSubscriptionQuery,
  workspacePlansQuery,
  workspaceTransactionsQuery,
  workspaceAutoRenewQuery,
  workspaceUsageQuery,
  workspaceBillingOwnerQuery,
  userBillingProfileQuery,
  usePurchaseWorkspaceTokens,
  usePurchaseWorkspacePlan,
  useToggleWorkspaceAutoRenew,
  useReleaseWorkspaceBillingOwner,
  formatCurrency,
  BillingAPIError,
  formatDate,
  WorkspaceUsageSnapshot,
} from '@/api/billing';
import BillingLayout from '@/components/billing/BillingLayout';
import BalanceCard from '@/components/billing/BalanceCard';
import PlanSnapshot from '@/components/billing/PlanSnapshot';
import PricingGrid, { ProductCard } from '@/components/billing/PricingGrid';
import SegmentedTabs, { TabOption } from '@/components/billing/SegmentedTabs';
import TransactionsTable from '@/components/billing/TransactionsTable';
import GradientButton from '@/components/billing/GradientButton';
import ErrorState from '@/components/billing/ErrorState';
import BillingOwnerCard from '@/components/billing/BillingOwnerCard';
import InvoicesTab from '@/components/billing/InvoicesTab';
import PaymentsTab from '@/components/billing/PaymentsTab';
import WebhookEventsTab from '@/components/billing/WebhookEventsTab';
import WorkspaceUsageCard from '@/components/billing/WorkspaceUsageCard';
import BillingToast from '@/components/billing/BillingToast';
import BillingStateBanner, {
  BillingDashboardBannerState,
  BillingStateBannerProps,
} from '@/components/billing/BillingStateBanner';
import { useBillingQueryParams } from '@/hooks/useBillingQueryParams';
import BillingFilterBar from '@/components/billing/BillingFilterBar';
import { useBillingToast } from '@/hooks/useBillingToast';
import { useBillingDateRange } from '@/hooks/useBillingDateRange';
import {
  BillingColors,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';

type BillingTab = 'dashboard' | 'transactions' | 'invoices' | 'payments' | 'webhooks';

type BillingDashboardState = BillingDashboardBannerState | 'active';

const RENEWAL_NOTICE_DAYS = 7;
const USAGE_WARNING_THRESHOLD = 0.8;

function daysUntil(dateString?: string | null): number | null {
  if (!dateString) return null;
  const target = new Date(dateString).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  return diff / (1000 * 60 * 60 * 24);
}

function isWithinDays(dateString: string | null | undefined, days: number): boolean {
  const diff = daysUntil(dateString);
  return diff !== null && diff <= days && diff >= 0;
}

function getUsageRatios(usage?: WorkspaceUsageSnapshot | null) {
  if (!usage) {
    return {
      memberRatio: 0,
      storageRatio: 0,
      maxRatio: 0,
    };
  }

  const memberRatio = usage.max_users > 0 ? usage.member_count / usage.max_users : 0;
  const storageRatio = usage.max_storage_gb > 0 ? usage.storage_used_gb / usage.max_storage_gb : 0;
  return {
    memberRatio,
    storageRatio,
    maxRatio: Math.max(memberRatio, storageRatio),
  };
}

function extractErrorDetails(error: unknown) {
  if (!error) return null;
  if (error instanceof BillingAPIError) {
    return {
      title: 'Unable to load billing data',
      message: error.message,
      code: error.code || `HTTP_${error.status}`,
    };
  }
  if (error instanceof Error) {
    return {
      title: 'Unable to load billing data',
      message: error.message,
      code: undefined,
    };
  }
  return {
    title: 'Unable to load billing data',
    message: 'An unknown error occurred.',
    code: undefined,
  };
}

export default function WorkspaceBillingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId as string;

  const redirectToAuth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `/auth?next=${next}`;
  }, []);

  const [activeTab, setActiveTab] = useState<BillingTab>('dashboard');
  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof window === 'undefined') return;
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Sync activeTab with URL query parameter on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['dashboard', 'transactions', 'invoices', 'payments', 'webhooks'].includes(tabParam)) {
      setActiveTab(tabParam as BillingTab);
    }
  }, [searchParams]);

  // Function to handle tab changes with URL sync
  const handleTabChange = useCallback((newTab: BillingTab) => {
    setActiveTab(newTab);
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('tab', newTab);
    const search = current.toString();
    const query = search ? `?${search}` : '';
    router.push(`/workspaces/${workspaceId}/billing${query}`);
  }, [router, workspaceId, searchParams]);

  const { page, ordering, setPage, setOrdering } = useBillingQueryParams({
    pageKey: 'txPage',
    orderingKey: 'txOrder',
    defaultOrdering: '-occurred_at',
  });
  const { ordering: txStatus, setOrdering: setTxStatus } = useBillingQueryParams({
    pageKey: 'txPage',
    orderingKey: 'txStatus',
    defaultOrdering: '',
  });
  const {
    startValue: txStart,
    endValue: txEnd,
    setStartValue: setTxStart,
    setEndValue: setTxEnd,
  } = useBillingDateRange({ startKey: 'txStart', endKey: 'txEnd' });
  const { toast, pushToast, dismissToast } = useBillingToast();

  // Fetch workspace data
  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery(workspaceTokenProductsQuery(workspaceId));

  const {
    data: subscription,
    isLoading: subscriptionLoading,
    error: subscriptionError,
    refetch: refetchSubscription,
  } = useQuery(workspaceSubscriptionQuery(workspaceId));

  const {
    data: autoRenewData,
    isLoading: autoRenewLoading,
    error: autoRenewError,
    refetch: _refetchAutoRenew,
  } = useQuery(workspaceAutoRenewQuery(workspaceId));

  const {
    data: usageData,
    isLoading: usageLoading,
    error: usageError,
    refetch: refetchUsage,
  } = useQuery(workspaceUsageQuery(workspaceId));

  const {
    data: ownerData,
    isLoading: ownerLoading,
    error: ownerError,
    refetch: refetchOwner,
  } = useQuery(workspaceBillingOwnerQuery(workspaceId));

  const {
    data: plansData,
    isLoading: plansLoading,
    error: plansError,
    refetch: refetchPlans,
  } = useQuery(workspacePlansQuery(workspaceId));

  // Redirect to auth on unauthorized responses
  useEffect(() => {
    const maybeErrors = [
      productsError,
      autoRenewError,
      subscriptionError,
      plansError,
      usageError,
      ownerError,
    ];
    const unauthorized = maybeErrors.find((err) => {
      if (!err) return false;
      const status = (err as any).status;
      return status === 401 || status === 419;
    });
    if (unauthorized) {
      redirectToAuth();
    }
  }, [
    productsError,
    autoRenewError,
    subscriptionError,
    plansError,
    usageError,
    ownerError,
    redirectToAuth,
  ]);

  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useQuery(
    workspaceTransactionsQuery(workspaceId, {
      page,
      page_size: 10,
      ordering,
      status: (txStatus as any) || undefined,
      occurred_after: txStart || undefined,
      occurred_before: txEnd || undefined,
    })
  );

  const { data: viewerProfile } = useQuery(userBillingProfileQuery);

  const blockingError = subscriptionError ?? plansError;

  // Mutations
  const purchaseTokenMutation = usePurchaseWorkspaceTokens(workspaceId);
  const purchasePlanMutation = usePurchaseWorkspacePlan(workspaceId);
  const autoRenewMutation = useToggleWorkspaceAutoRenew(workspaceId);
  const releaseOwnerMutation = useReleaseWorkspaceBillingOwner(workspaceId);

  const planSnapshotSubscription = useMemo(() => {
    if (!subscription) return null;
    return {
      ...subscription,
      auto_renew_enabled:
        autoRenewData?.auto_renew_enabled ?? subscription.auto_renew_enabled,
    };
  }, [subscription, autoRenewData]);

  const planList = useMemo(() => plansData?.plans ?? [], [plansData]);
  const usageRatios = getUsageRatios(usageData);
  const usageStatus: 'normal' | 'warning' | 'critical' = usageRatios.maxRatio >= 1
    ? 'critical'
    : usageRatios.maxRatio >= USAGE_WARNING_THRESHOLD
    ? 'warning'
    : 'normal';
  const usageStatusMessage = usageStatus === 'critical'
    ? 'Workspace has exceeded plan limits. Upgrade to restore full access.'
    : usageStatus === 'warning'
    ? 'You are nearing your plan limits. Consider upgrading to unlock more capacity.'
    : null;
  const usageBannerMessage = usageError ? null : usageStatusMessage;

  const renewalSoon = planSnapshotSubscription
    ? isWithinDays(planSnapshotSubscription.current_period_end, RENEWAL_NOTICE_DAYS)
    : false;
  const statusNeedsAttention = planSnapshotSubscription
    ? ['past_due', 'unpaid', 'incomplete'].includes(planSnapshotSubscription.status)
    : false;
  const isCanceled = planSnapshotSubscription?.status === 'canceled';
  const trialDaysRemaining = planSnapshotSubscription?.trial_end
    ? daysUntil(planSnapshotSubscription.trial_end)
    : null;
  const isTrialing = planSnapshotSubscription
    ? planSnapshotSubscription.status === 'trialing' ||
      (trialDaysRemaining !== null && trialDaysRemaining > 0)
    : false;

  let billingState: BillingDashboardState;
  if (!planSnapshotSubscription) {
    billingState = subscriptionLoading ? 'active' : 'unsubscribed';
  } else if (statusNeedsAttention || isCanceled) {
    billingState = 'error';
  } else if (isTrialing) {
    billingState = 'trialing';
  } else if (usageStatus === 'critical') {
    billingState = 'usage-exceeded';
  } else if (usageStatus === 'warning') {
    billingState = 'usage-warning';
  } else if (renewalSoon) {
    billingState = 'renewal-soon';
  } else {
    billingState = 'active';
  }

  const usagePercent = Number.isFinite(usageRatios.maxRatio)
    ? Math.min(100, Math.round(usageRatios.maxRatio * 100))
    : null;

  const planHighlight = (() => {
    if (!planSnapshotSubscription) return null;
    if (statusNeedsAttention) {
      return {
        tone: 'danger' as const,
        message: 'Recent renewal failed. Update billing details to avoid disruption.',
      };
    }
    if (isCanceled) {
      return {
        tone: 'danger' as const,
        message: 'Subscription has been cancelled. Renew to restore benefits.',
      };
    }
    if (billingState === 'renewal-soon' && planSnapshotSubscription.current_period_end) {
      return {
        tone: 'warning' as const,
        message: `Renews on ${formatDate(planSnapshotSubscription.current_period_end)}`,
      };
    }
    return null;
  })();

  const bannerConfig = useMemo<
    (Partial<BillingStateBannerProps> & { state: BillingDashboardBannerState }) | null
  >(() => {
    if (billingState === 'active') return null;

    const toPlans = () => scrollToSection('billing-plans');
    const toTokens = () => scrollToSection('billing-token-packages');

    if (billingState === 'unsubscribed') {
      return {
        state: 'unsubscribed' as BillingDashboardBannerState,
        action: {
          label: 'View subscription plans',
          onClick: toPlans,
        },
        secondaryAction: {
          label: 'Browse token packs',
          onClick: toTokens,
          variant: 'secondary' as const,
        },
      };
    }

    if (billingState === 'trialing') {
      return {
        state: 'trialing' as BillingDashboardBannerState,
        renewalDate: planSnapshotSubscription?.trial_end ?? null,
        action: {
          label: 'Review plans',
          onClick: toPlans,
        },
      };
    }

    if (billingState === 'renewal-soon') {
      return {
        state: 'renewal-soon' as BillingDashboardBannerState,
        renewalDate: planSnapshotSubscription?.current_period_end ?? null,
        secondaryAction: {
          label: 'View payment history',
          onClick: () => handleTabChange('payments'),
          variant: 'secondary' as const,
        },
      };
    }

    if (billingState === 'usage-warning') {
      return {
        state: 'usage-warning' as BillingDashboardBannerState,
        usagePercent,
        action: {
          label: 'Explore upgrade options',
          onClick: toPlans,
        },
      };
    }

    if (billingState === 'usage-exceeded') {
      return {
        state: 'usage-exceeded' as BillingDashboardBannerState,
        usagePercent,
        action: {
          label: 'Upgrade plan now',
          onClick: toPlans,
        },
        secondaryAction: {
          label: 'Check usage details',
          onClick: () => scrollToSection('workspace-usage'),
          variant: 'secondary' as const,
        },
      };
    }

    if (billingState === 'error') {
      return {
        state: 'error' as BillingDashboardBannerState,
        errorCode: planSnapshotSubscription?.status ?? null,
        description:
          planHighlight?.message ||
          'We were unable to process recent billing activity. Visit the payments tab to review outstanding items.',
        action: {
          label: 'Go to payments tab',
          onClick: () => handleTabChange('payments'),
        },
        secondaryAction: statusNeedsAttention
          ? {
              label: 'Retry latest payment',
              onClick: () => handleTabChange('payments'),
              variant: 'secondary' as const,
            }
          : undefined,
      };
    }

    return null;
  }, [
    billingState,
    handleTabChange,
    planHighlight?.message,
    planSnapshotSubscription?.current_period_end,
    planSnapshotSubscription?.status,
    planSnapshotSubscription?.trial_end,
    scrollToSection,
    statusNeedsAttention,
    usagePercent,
  ]);

  const autoRenewDisabledReason = autoRenewMutation.isPending
    ? 'Saving changes...'
    : autoRenewError
    ? ((autoRenewError as BillingAPIError)?.message ?? 'Unable to manage auto renew at the moment.')
    : undefined;

  const handleAutoRenewToggle = async (enabled: boolean) => {
    try {
      await autoRenewMutation.mutateAsync({ enabled });
      pushToast({
        tone: 'success',
        message: enabled
          ? 'Auto renew is now enabled for this workspace.'
          : 'Auto renew has been turned off for this workspace.',
      });
    } catch (error) {
      let message = 'Failed to update auto renew. Please try again.';
      if (error instanceof BillingAPIError) {
        message = error.message || message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        message = String((error as { message?: string }).message) || message;
      }
      pushToast({ tone: 'error', message });
    }
  };

  const handleReleaseOwnership = async () => {
    try {
      await releaseOwnerMutation.mutateAsync();
      pushToast({
        tone: 'success',
        message: 'Billing ownership released successfully.',
      });
      refetchOwner();
    } catch (error) {
      let message = 'Failed to release ownership. Please try again.';
      if (error instanceof BillingAPIError) {
        message = error.message || message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        message = String((error as { message?: string }).message) || message;
      }
      pushToast({
        tone: 'error',
        message,
        actionLabel: 'Retry',
        onAction: handleReleaseOwnership,
      });
    }
  };

  // Handle token purchase
  const handlePurchaseToken = async (productKey: string) => {
    try {
      const result = await purchaseTokenMutation.mutateAsync({
        product_key: productKey,
        quantity: 1,
      });
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (error: any) {
      let message = 'Failed to initiate purchase';
      if (error instanceof BillingAPIError) {
        message = error.message || message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        message = String((error as { message?: string }).message) || message;
      }
      pushToast({ tone: 'error', message });
    }
  };

  // Handle plan upgrade
  const handlePurchasePlan = async (planKey: string) => {
    try {
      const result = await purchasePlanMutation.mutateAsync({
        target_plan: planKey,
      });
      if ('checkout_url' in result && result.checkout_url) {
        window.location.href = result.checkout_url;
      } else if ('plan_change_request' in result) {
        pushToast({
          tone: 'success',
          message: 'Plan change scheduled successfully.',
        });
        refetchSubscription();
        refetchPlans();
      } else {
        pushToast({
          tone: 'success',
          message: 'Plan change request submitted.',
        });
      }
    } catch (error: any) {
      let message = 'Failed to change plan';
      if (error instanceof BillingAPIError) {
        message = error.message || message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        message = String((error as { message?: string }).message) || message;
      }
      pushToast({ tone: 'error', message });
    }
  };

  const usageErrorMessage = useMemo(() => {
    if (!usageError) return null;
    if (usageError instanceof BillingAPIError) return usageError.message;
    if (usageError && typeof usageError === 'object' && 'message' in usageError) {
      const msg = (usageError as { message?: string }).message;
      return typeof msg === 'string' ? msg : null;
    }
    return null;
  }, [usageError]);

  const ownerErrorMessage = useMemo(() => {
    if (!ownerError) return null;
    if (ownerError instanceof BillingAPIError) return ownerError.message;
    if (ownerError && typeof ownerError === 'object' && 'message' in ownerError) {
      const msg = (ownerError as { message?: string }).message;
      return typeof msg === 'string' ? msg : null;
    }
    return null;
  }, [ownerError]);

  const ownerDisplay = ownerData?.owner ?? planSnapshotSubscription?.billing_owner ?? null;
  const viewerUserId = viewerProfile?.user?.id;
  const isBillingOwner = ownerDisplay && viewerUserId
    ? String(ownerDisplay.id) === String(viewerUserId)
    : false;
  const ownerStripeCustomerId = isBillingOwner
    ? ownerData?.stripe_customer_id ?? planSnapshotSubscription?.stripe_customer_id ?? null
    : null;
  const ownerCreditBalance = isBillingOwner ? ownerData?.credit_balance ?? null : null;

  // Transform products
  const tokenCards: ProductCard[] = useMemo(
    () =>
      (productsData?.products || []).map((product) => ({
        key: product.key,
        name: product.name,
        description: product.description,
        priceDisplay: formatCurrency(product.price_amount, product.currency),
        tokens: product.token_amount,
        currency: product.currency,
        isActive: product.is_active,
        disabledReason: !product.is_active ? 'Unavailable' : undefined,
      })),
    [productsData]
  );

  const planCards: ProductCard[] = useMemo(() => {
    const currentPlanKey =
      planSnapshotSubscription?.plan?.key ?? planSnapshotSubscription?.plan_key ?? null;
    return planList.map((plan) => {
      const features = [
        typeof plan.max_users === 'number' ? `${plan.max_users.toLocaleString()} seats` : null,
        typeof plan.max_storage_gb === 'number' ? `${plan.max_storage_gb} GB storage` : null,
      ].filter(Boolean) as string[];

      const isCurrent = currentPlanKey ? plan.key === currentPlanKey : plan.is_current;

      return {
        key: plan.key,
        name: plan.name,
        description: plan.description || undefined,
        priceDisplay: formatCurrency(plan.monthly_price, plan.currency || 'AUD'),
        currency: plan.currency || 'AUD',
        features,
        isActive: true,
        isCurrentPlan: isCurrent,
        disabledReason: isCurrent ? 'Current Plan' : undefined,
      };
    });
  }, [planList, planSnapshotSubscription]);

  const tabOptions: TabOption[] = [
    { value: 'dashboard', label: 'Dashboard' },
    { value: 'invoices', label: 'Invoices' },
    { value: 'payments', label: 'Payments' },
    { value: 'transactions', label: 'Transactions' },
    { value: 'webhooks', label: 'Webhooks' },
  ];

  if (blockingError) {
    const details = extractErrorDetails(blockingError);
    return (
      <BillingLayout
        title="Workspace Billing"
        subtitle="Manage subscription, tokens, and billing history"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Workspace', href: '/workspace' },
          { label: 'Billing' },
        ]}
        headerAction={
          <Link href="/workspace">
            <GradientButton variant="secondary" size="sm">
              Back to Workspace
            </GradientButton>
          </Link>
        }
      >
        <ErrorState
          title={details?.title || 'Unable to load billing data'}
          description={details?.message}
          code={details?.code}
          onRetry={() => {
            refetchSubscription();
            refetchPlans();
          }}
          onContactSupport={() => window.open('mailto:support@example.com', '_blank')}
        />
      </BillingLayout>
    );
  }

  return (
    <BillingLayout
      title="Workspace Billing"
      subtitle="Manage subscription, tokens, and billing history"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Workspace', href: '/workspace' },
        { label: 'Billing' },
      ]}
      headerAction={
        <Link href="/workspace">
          <GradientButton variant="secondary" size="sm">
            Back to Workspace
          </GradientButton>
        </Link>
      }
    >
      <div className="workspace-billing" data-billing-state={billingState}>
        {toast && (
          <div className="toast-region">
            <BillingToast
              tone={toast.tone}
              message={toast.message}
              actionLabel={toast.actionLabel}
              onAction={toast.onAction}
              onDismiss={dismissToast}
            />
          </div>
        )}

        {bannerConfig && (
          <BillingStateBanner
            state={bannerConfig.state}
            title={bannerConfig.title}
            description={bannerConfig.description}
            usagePercent={bannerConfig.usagePercent}
            renewalDate={bannerConfig.renewalDate}
            errorCode={bannerConfig.errorCode}
            action={bannerConfig.action}
            secondaryAction={bannerConfig.secondaryAction}
          />
        )}

        <div className="tabs-wrapper">
          <SegmentedTabs
            options={tabOptions}
            value={activeTab}
            onChange={(value) => handleTabChange(value as BillingTab)}
          />
        </div>

        {activeTab === 'dashboard' && (
          <div className="dashboard-tab">
            <section id="subscription-overview" className="panel-section panel-ghost">
              <div className="section-heading">
                <h2>Subscription Overview</h2>
              </div>
              <div className="card-grid">
                <PlanSnapshot
                  subscription={planSnapshotSubscription}
                  loading={subscriptionLoading || autoRenewLoading}
                  onToggle={handleAutoRenewToggle}
                  toggleDisabledReason={autoRenewDisabledReason}
                  highlight={planHighlight}
                  className="dashboard-card"
                />
                <BillingOwnerCard
                  owner={ownerDisplay}
                  stripeCustomerId={ownerStripeCustomerId}
                  creditBalance={ownerCreditBalance}
                  loading={ownerLoading}
                  error={ownerErrorMessage}
                  onRelease={isBillingOwner ? handleReleaseOwnership : undefined}
                  releaseDisabled={releaseOwnerMutation.isPending}
                  releaseDisabledReason={
                    releaseOwnerMutation.isPending ? 'Processing request' : undefined
                  }
                  releasing={releaseOwnerMutation.isPending}
                  showSensitive={isBillingOwner}
                  className="dashboard-card"
                />
                <div id="workspace-usage">
                  <WorkspaceUsageCard
                    usage={usageData ?? null}
                    loading={usageLoading}
                    error={usageErrorMessage}
                    onRefresh={() => refetchUsage()}
                    status={usageStatus}
                    statusMessage={usageBannerMessage}
                    className="dashboard-card"
                  />
                </div>
              </div>
            </section>

            <section id="billing-token-balance" className="panel-section panel-ghost">
              <h2 className="section-title">Token Balance</h2>
              {productsError ? (
                <ErrorState
                  title="Unable to load token balance"
                  description={(productsError as BillingAPIError)?.message || 'Please try again later.'}
                  code={(productsError as BillingAPIError)?.code}
                  onRetry={() => refetchProducts()}
                />
              ) : (
                <BalanceCard
                  scope="workspace"
                  balance={productsData?.balance || 0}
                  unit="tokens"
                  workspaceName="Current Workspace"
                  loading={productsLoading}
                  className="dashboard-card"
                />
              )}
            </section>

            <section id="billing-token-packages" className="panel-section panel-ghost">
              <h3 className="section-subtitle">Token Packages</h3>
              {productsError ? (
                <ErrorState
                  title="Failed to load token packages"
                  description={(productsError as BillingAPIError)?.message || 'Please try again later.'}
                  code={(productsError as BillingAPIError)?.code}
                  onRetry={() => refetchProducts()}
                />
              ) : (
                <PricingGrid
                  products={tokenCards}
                  onSelect={handlePurchaseToken}
                  variant="token"
                  loading={productsLoading}
                />
              )}
            </section>

            <section id="billing-plans" className="panel-section panel-ghost">
              <h3 className="section-subtitle">Subscription Plans</h3>
              {plansError ? (
                <ErrorState
                  title="Failed to load plans"
                  description={(plansError as BillingAPIError)?.message || 'Please try again later.'}
                  code={(plansError as BillingAPIError)?.code}
                  onRetry={() => {
                    refetchPlans();
                    refetchSubscription();
                  }}
                />
              ) : (
                <PricingGrid
                  products={planCards}
                  onSelect={handlePurchasePlan}
                  variant="plan"
                  loading={plansLoading}
                />
              )}
            </section>
          </div>
        )}

        {activeTab === 'transactions' && (
          <section id="workspace-transactions" className="panel-section panel-elevated">
            <div className="section-heading">
              <h2>Transaction History</h2>
            </div>
            <BillingFilterBar
              context="workspace-transaction"
              status={{
                label: 'Status',
                value: txStatus,
                onChange: (value) => {
                  setPage(1);
                  setTxStatus(value ?? '');
                },
                options: [
                  { label: 'Posted', value: 'posted' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Void', value: 'void' },
                ],
              }}
              dateRange={{
                startLabel: 'From',
                endLabel: 'To',
                startValue: txStart,
                endValue: txEnd,
                onStartChange: (value) => {
                  setPage(1);
                  setTxStart(value);
                },
                onEndChange: (value) => {
                  setPage(1);
                  setTxEnd(value);
                },
              }}
              category={undefined}
            />
            <TransactionsTable
              data={transactionsData?.results}
              isLoading={transactionsLoading}
              error={transactionsError as Error}
              pagination={{
                page,
                pageSize: 10,
                total: transactionsData?.count,
              }}
              onPageChange={setPage}
              onSortChange={(field) => {
                const nextOrdering = ordering === field ? `-${field}` : field;
                setPage(1);
                setOrdering(nextOrdering);
              }}
              showInitiator
            />
          </section>
        )}

        {activeTab === 'invoices' && (
          <section id="workspace-invoices" className="panel-section panel-elevated">
            <div className="section-heading">
              <h2>Workspace Invoices</h2>
            </div>
            <InvoicesTab workspaceId={workspaceId} />
          </section>
        )}

        {activeTab === 'payments' && (
          <section id="workspace-payments" className="panel-section panel-elevated">
            <div className="section-heading">
              <h2>Payment History</h2>
            </div>
            <PaymentsTab workspaceId={workspaceId} />
          </section>
        )}

        {activeTab === 'webhooks' && (
          <section id="workspace-webhooks" className="panel-section panel-elevated">
            <div className="section-heading">
              <h2>Webhook Events</h2>
            </div>
            <WebhookEventsTab workspaceId={workspaceId} />
          </section>
        )}
      </div>

      <style jsx>{`
        .workspace-billing {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.lg};
        }

        .toast-region {
          max-width: 560px;
        }

        .tabs-wrapper {
          display: flex;
          justify-content: flex-start;
        }

        .dashboard-tab {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xl};
        }

        .panel-section {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .panel-ghost {
          background: transparent;
          padding: 0;
          box-shadow: none;
          gap: ${BillingSpacing.lg};
        }

        .panel-elevated {
          background: rgba(255, 255, 255, 0.94);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
        }

        .section-heading h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
        }

        .section-title {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .section-subtitle {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .card-grid {
          display: grid;
          gap: ${BillingSpacing.lg};
          grid-template-columns: 1fr;
        }

        .dashboard-card {
          height: 100%;
        }

        @media (min-width: 768px) {
          .card-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .card-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 1024px) {
          .panel-elevated {
            padding: ${BillingSpacing.md};
          }
        }

        @media (max-width: 640px) {
          .panel-section {
            gap: ${BillingSpacing.sm};
          }

          .panel-elevated {
            padding: ${BillingSpacing.md};
          }

          .tabs-wrapper {
            justify-content: center;
          }
        }
      `}</style>
    </BillingLayout>
  );
}
