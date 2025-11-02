/**
 * User Billing Page
 * Route: /billing
 *
 * Displays personal token balance, token packages, and billing history.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  userTokenProductsQuery,
  userTransactionsQuery,
  userBillingProfileQuery,
  userWorkspaceSubscriptionsQuery,
  usePurchaseUserTokens,
  formatCurrency,
  formatDateTime,
  BillingAPIError,
} from '@/api/billing';
import type { WorkspaceSubscription } from '@/api/billing';
import BillingLayout from '@/components/billing/BillingLayout';
import BalanceCard from '@/components/billing/BalanceCard';
import PricingGrid, { ProductCard } from '@/components/billing/PricingGrid';
import TransactionsTable from '@/components/billing/TransactionsTable';
import InvoicesTab from '@/components/billing/InvoicesTab';
import PaymentsTab from '@/components/billing/PaymentsTab';
import GradientButton from '@/components/billing/GradientButton';
import ErrorState from '@/components/billing/ErrorState';
import CreditSummaryCard from '@/components/billing/CreditSummaryCard';
import BillingToast from '@/components/billing/BillingToast';
import BillingFilterBar from '@/components/billing/BillingFilterBar';
import SegmentedTabs, { TabOption } from '@/components/billing/SegmentedTabs';
import EmptyState from '@/components/billing/EmptyState';
import SkeletonTable from '@/components/billing/SkeletonTable';
import { useBillingQueryParams } from '@/hooks/useBillingQueryParams';
import { useBillingToast } from '@/hooks/useBillingToast';
import { useBillingDateRange } from '@/hooks/useBillingDateRange';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';

type PersonalBillingTab = 'dashboard' | 'invoices' | 'payments' | 'subscriptions';

export default function UserBillingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PersonalBillingTab>('dashboard');
  const redirectToAuth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `/auth?next=${next}`;
  }, []);
  const { page, ordering, setPage, setOrdering } = useBillingQueryParams({
    pageKey: 'page',
    orderingKey: 'ordering',
    defaultOrdering: '-occurred_at',
  });
  const { ordering: statusFilter, setOrdering: setStatusFilter } = useBillingQueryParams({
    pageKey: 'page',
    orderingKey: 'status',
    defaultOrdering: '',
  });
  const {
    startValue: startDate,
    endValue: endDate,
    setStartValue,
    setEndValue,
  } = useBillingDateRange({
    startKey: 'start',
    endKey: 'end',
  });
  const { toast, pushToast, dismissToast } = useBillingToast();

  useEffect(() => {
    const token =
      (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
      (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));
    if (!token) {
      redirectToAuth();
    }
  }, [redirectToAuth]);

  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery(userTokenProductsQuery);

  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useQuery(
    userTransactionsQuery({
      page,
      page_size: 10,
      ordering,
      status: (statusFilter as any) || undefined,
      occurred_after: startDate || undefined,
      occurred_before: endDate || undefined,
    }),
  );

  const {
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery(userBillingProfileQuery);

  const {
    data: subscriptionData,
    isLoading: subscriptionsLoading,
    error: subscriptionsError,
    refetch: refetchSubscriptions,
  } = useQuery(userWorkspaceSubscriptionsQuery);

  const workspaceSubscriptions: WorkspaceSubscription[] = subscriptionData ?? [];

  const purchaseMutation = usePurchaseUserTokens();

  const handlePurchase = async (productKey: string) => {
    try {
      const result = await purchaseMutation.mutateAsync({
        product_key: productKey,
        quantity: 1,
      });
      if (result.checkout_url) {
        try {
          window.sessionStorage.setItem('auth.retainOnUnload', '1');
        } catch {
          /* ignore storage access issues */
        }
        window.location.href = result.checkout_url;
      }
    } catch (error: any) {
      const message =
        error instanceof BillingAPIError
          ? error.message
          : error?.message || 'Failed to initiate purchase. Please try again.';
      pushToast({ tone: 'error', message });
    }
  };

  const handleSortChange = useCallback(
    (field: string) => {
      const nextOrdering = ordering === field ? `-${field}` : field;
      setPage(1);
      setOrdering(nextOrdering);
    },
    [ordering, setOrdering, setPage],
  );

  const handleTabChange = useCallback((nextTab: PersonalBillingTab) => {
    setActiveTab(nextTab);
  }, []);

  const handleManageWorkspace = useCallback(
    (workspaceId?: string) => {
      if (!workspaceId) return;
      router.push(`/workspaces/${workspaceId}/billing`);
    },
    [router],
  );

  const subscriptionStatusTone = useCallback((status: string) => {
    switch (status) {
      case 'active':
        return BillingColors.success;
      case 'trialing':
        return BillingColors.warning;
      case 'past_due':
      case 'incomplete':
        return BillingColors.warning;
      case 'canceled':
      case 'unpaid':
        return BillingColors.danger;
      default:
        return BillingColors.textMuted;
    }
  }, []);

  const productCards: ProductCard[] = useMemo(
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
    [productsData],
  );

  if (productsError || profileError) {
    const err = (productsError || profileError) as any;
    if (err?.status === 401 || err?.status === 419) {
      redirectToAuth();
      return null;
    }
  }

  const tabOptions: TabOption[] = [
    { value: 'dashboard', label: 'Dashboard' },
    { value: 'invoices', label: 'Invoices' },
    { value: 'payments', label: 'Payments' },
    { value: 'subscriptions', label: 'Subscriptions' },
  ];

  return (
    <BillingLayout
      title="Billing Overview"
      subtitle="Manage your token balance and review recent usage"
      // breadcrumb={[
      //   { label: 'Home', href: '/' },
      //   { label: 'Billing' },
      // ]}
      headerAction={
        <Link href="/profile">
          <GradientButton variant="secondary" size="sm">
            Back to Profile
          </GradientButton>
        </Link>
      }
    >
      <div className="user-billing">
        {toast && (
          <div className="toast-region">
            <BillingToast
              tone={toast.tone}
              message={toast.message}
              onDismiss={dismissToast}
              actionLabel={toast.actionLabel}
              onAction={toast.onAction}
            />
          </div>
        )}

        <SegmentedTabs
          options={tabOptions}
          value={activeTab}
          onChange={(value) => handleTabChange(value as PersonalBillingTab)}
        />

        {activeTab === 'dashboard' && (
          <div className="dashboard-tab">
            <section className="panel-ghost">
              <div className="card-grid">
                <BalanceCard
                  scope="user"
                  balance={productsData?.balance || 0}
                  unit="tokens"
                  loading={productsLoading}
                  className="dashboard-card"
                />
                <CreditSummaryCard
                  balance={profileData?.credit_balance}
                  currency={profileData?.currency}
                  stripeCustomerId={profileData?.stripe_customer_id}
                  defaultPaymentMethodId={profileData?.default_payment_method_id}
                  lastSyncedAt={profileData?.last_synced_at}
                  loading={profileLoading}
                  className="dashboard-card"
                />
              </div>
              {profileError && !profileLoading && (
                <ErrorState
                  title="Failed to load credit balance"
                  description={(profileError as Error)?.message}
                  onRetry={() => window.location.reload()}
                />
              )}
            </section>

            <section className="panel-elevated">
              <h2>Token Packages</h2>
              {productsError && !productsLoading ? (
                <ErrorState
                  title="Failed to load token packages"
                  description={(productsError as Error)?.message}
                  onRetry={() => {
                    pushToast({ tone: 'info', message: 'Retrying token packages...' });
                    window.location.reload();
                  }}
                />
              ) : (
                <PricingGrid
                  products={productCards}
                  onSelect={handlePurchase}
                  variant="token"
                  loading={productsLoading}
                />
              )}
            </section>

            <section className="panel-elevated">
              <div className="section-heading">
                <h2>Recent Transactions</h2>
              </div>
              <BillingFilterBar
                status={{
                  label: 'Status',
                  value: statusFilter,
                  onChange: (value) => {
                    setPage(1);
                    setStatusFilter(value ?? '');
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
                  startValue: startDate,
                  endValue: endDate,
                  onStartChange: (value) => {
                    setPage(1);
                    setStartValue(value);
                  },
                  onEndChange: (value) => {
                    setPage(1);
                    setEndValue(value);
                  },
                }}
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
                onSortChange={handleSortChange}
              />
            </section>
          </div>
        )}

        {activeTab === 'invoices' && (
          <section className="panel-elevated">
            <div className="section-heading">
              <h2>Invoices</h2>
            </div>
            <InvoicesTab scope="user" className="panel-table" />
          </section>
        )}

        {activeTab === 'payments' && (
          <section className="panel-elevated">
            <div className="section-heading">
              <h2>Payments</h2>
            </div>
            <PaymentsTab scope="user" className="panel-table" />
          </section>
        )}

        {activeTab === 'subscriptions' && (
          <section className="panel-elevated">
            <div className="section-heading">
              <h2>Subscriptions</h2>
            </div>
            <div className="subscription-card">
              {subscriptionsLoading ? (
                <SkeletonTable rows={4} columns={6} />
              ) : subscriptionsError ? (
                <ErrorState
                  title="Failed to load subscriptions"
                  description={
                    subscriptionsError instanceof BillingAPIError
                      ? subscriptionsError.message
                      : (subscriptionsError as Error).message || 'Unable to load subscriptions.'
                  }
                  code={
                    subscriptionsError instanceof BillingAPIError
                      ? subscriptionsError.code || `HTTP_${subscriptionsError.status}`
                      : undefined
                  }
                  onRetry={() => void refetchSubscriptions()}
                />
              ) : workspaceSubscriptions.length === 0 ? (
                <EmptyState
                  icon="🌱"
                  title="No workspace subscriptions yet"
                  description="Join or create a workspace to manage subscription plans and renewals here."
                  actionLabel="Browse workspaces"
                  onAction={() => router.push('/workspaces')}
                />
              ) : (
                <div className="subscription-table">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Workspace</th>
                        <th scope="col">Plan</th>
                        <th scope="col">Status</th>
                        <th scope="col">Auto Renew</th>
                        <th scope="col">Next Renewal</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspaceSubscriptions.map((subscription: WorkspaceSubscription) => {
                        const planName = subscription.plan?.name || subscription.plan_key || 'Free';
                        const planPrice = subscription.plan?.monthly_price
                          ? formatCurrency(
                              subscription.plan.monthly_price,
                              subscription.plan.currency || 'AUD',
                            )
                          : null;
                        const nextRenewal = subscription.current_period_end
                          ? formatDateTime(subscription.current_period_end)
                          : '—';
                        return (
                          <tr key={subscription.id} className="subscription-row">
                            <td data-label="Workspace">
                              <div className="workspace-meta">
                                <span className="workspace-name">
                                  {subscription.workspace_name || 'Unnamed workspace'}
                                </span>
                                <span className="workspace-id">
                                  {subscription.workspace_id}
                                </span>
                              </div>
                            </td>
                            <td data-label="Plan">
                              <div className="plan-meta">
                                <span className="plan-name">{planName}</span>
                                {planPrice && <span className="plan-price">{planPrice}/mo</span>}
                              </div>
                            </td>
                            <td data-label="Status">
                              <span
                                className="status-chip"
                                style={{ color: subscriptionStatusTone(subscription.status) }}
                              >
                                {subscription.status}
                              </span>
                            </td>
                            <td data-label="Auto Renew" className="text-center">
                              {subscription.auto_renew_enabled ? 'On' : 'Off'}
                            </td>
                            <td data-label="Next Renewal">
                              <span className="date-text">{nextRenewal}</span>
                            </td>
                            <td data-label="Actions">
                              <button
                                type="button"
                                className="gradient-button"
                                onClick={() => handleManageWorkspace(subscription.workspace_id)}
                                disabled={!subscription.workspace_id}
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <style jsx>{`
        .user-billing {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.lg};
        }

        .toast-region {
          max-width: 560px;
        }

        .dashboard-tab {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xl};
        }

        .panel-ghost {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.lg};
        }

        .subscription-card {
          background: linear-gradient(135deg, rgba(255, 247, 242, 0.96), rgba(249, 245, 255, 0.92));
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(255, 183, 197, 0.2);
        }

        .subscription-table {
          overflow-x: auto;
          border-radius: ${BillingRadius.lg};
          backdrop-filter: blur(8px);
        }

        .subscription-table table {
          width: 100%;
          border-collapse: collapse;
          background: rgba(255, 255, 255, 0.88);
          border-radius: ${BillingRadius.lg};
          overflow: hidden;
        }

        .subscription-table thead {
          background: linear-gradient(90deg, rgba(255, 205, 178, 0.4), rgba(255, 247, 242, 0.7));
        }

        .subscription-table th {
          padding: ${BillingSpacing.sm} ${BillingSpacing.md};
          font-size: 13px;
          font-weight: 600;
          color: rgba(71, 46, 88, 0.85);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .subscription-table td {
          padding: ${BillingSpacing.sm} ${BillingSpacing.md};
          border-bottom: 1px solid rgba(15, 23, 42, 0.06);
          color: ${BillingColors.textStrong};
        }

        .subscription-table tbody tr:last-child td {
          border-bottom: none;
        }

        .subscription-table tbody tr:nth-child(even) {
          background: rgba(255, 247, 242, 0.55);
        }

        .subscription-table tbody tr:hover {
          background: rgba(255, 247, 242, 0.85);
        }

        .workspace-meta,
        .plan-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .workspace-name {
          font-size: 15px;
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .workspace-id {
          font-size: 12px;
          color: ${BillingColors.textMuted};
        }

        .plan-name {
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .plan-price,
        .date-text {
          font-size: 12px;
          color: ${BillingColors.textMuted};
        }

        .subscription-table .status-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
          font-weight: 600;
          text-transform: capitalize;
        }

        .gradient-button {
          background: linear-gradient(135deg, #ff9a9e 0%, #fecf82 100%);
          color: #fff;
          font-weight: 600;
          border: none;
          padding: 10px 18px;
          border-radius: 999px;
          box-shadow: 0 12px 24px rgba(255, 184, 107, 0.2), 0 4px 10px rgba(0, 0, 0, 0.08);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .gradient-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 32px rgba(255, 184, 107, 0.28), 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .gradient-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .text-center {
          text-align: center;
        }

        @media (max-width: 768px) {
          .subscription-table table,
          .subscription-table tbody,
          .subscription-table tr,
          .subscription-table td {
            display: block;
            width: 100%;
          }

          .subscription-table thead {
            display: none;
          }

          .subscription-table tr {
            background: rgba(255, 255, 255, 0.88);
            margin-bottom: ${BillingSpacing.md};
            border-radius: ${BillingRadius.lg};
            box-shadow: 0 12px 24px rgba(255, 184, 107, 0.14);
            padding: ${BillingSpacing.md};
          }

          .subscription-table td {
            border-bottom: none;
            padding: ${BillingSpacing.xs} 0;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
          }

          .subscription-table td::before {
            content: attr(data-label);
            font-weight: 600;
            color: ${BillingColors.textMuted};
            margin-right: ${BillingSpacing.sm};
          }

          .gradient-button {
            width: 100%;
            justify-content: center;
          }
        }

        .panel-elevated {
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          padding: ${BillingSpacing.lg};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .card-grid {
          display: grid;
          gap: ${BillingSpacing.lg};
          grid-template-columns: 1fr;
        }

        .dashboard-card {
          height: 100%;
        }

        .section-heading h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
        }

        @media (min-width: 768px) {
          .panel-elevated {
            padding: ${BillingSpacing.md};
          }
          .card-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .card-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .panel-elevated {
            padding: ${BillingSpacing.md};
          }
        }
      `}</style>
    </BillingLayout>
  );
}
