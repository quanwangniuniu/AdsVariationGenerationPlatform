// app/adspark/page.js
'use client';

import { useState, useEffect } from 'react';
import axios from '@/lib/axiosConfig'; // Use global axios config with CSRF support
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PlayIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  PhotoIcon,
  VideoCameraIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import '../../../styles/globals.css'

export default function AdSparkDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch creative statistics
      const statsResponse = await axios.get('/api/adspark/creatives/stats/');
      setStats(statsResponse.data);

      // Fetch recent creatives
      const recentResponse = await axios.get('/api/adspark/creatives/', {
        params: { page_size: 5, ordering: '-fetched_at' }
      });
      setRecentActivity(recentResponse.data.results || recentResponse.data || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const triggerAllWatches = async () => {
    try {
      setTriggering(true);
      const response = await axios.post('/api/adspark/watches/trigger_all/');
      toast.success('All active watches triggered successfully!');
      console.log('Task ID:', response.data.task_id);
    } catch (error) {
      console.error('Error triggering watches:', error);
      toast.error('Failed to trigger watches');
    } finally {
      setTriggering(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getFormatIcon = (format) => {
    switch (format) {
      case 'image': return PhotoIcon;
      case 'video': return VideoCameraIcon;
      case 'text': return DocumentTextIcon;
      default: return DocumentTextIcon;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AdSpark Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor and manage your ad creative data from Google Ads Transparency Center
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/adspark/watches" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <MagnifyingGlassIcon className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Manage Watches</h3>
                <p className="text-sm text-gray-500">Configure SerpAPI searches</p>
              </div>
            </div>
          </Link>

          <Link href="/adspark/creatives" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <EyeIcon className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Browse Creatives</h3>
                <p className="text-sm text-gray-500">View ad creatives</p>
              </div>
            </div>
          </Link>

          <Link href="/adspark/advertisers" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BuildingOfficeIcon className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Advertisers</h3>
                <p className="text-sm text-gray-500">View advertiser data</p>
              </div>
            </div>
          </Link>

          <button
            onClick={triggerAllWatches}
            disabled={triggering}
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow disabled:opacity-50"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <PlayIcon className="h-8 w-8 text-orange-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {triggering ? 'Triggering...' : 'Trigger All'}
                </h3>
                <p className="text-sm text-gray-500">Run all active watches</p>
              </div>
            </div>
          </button>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <EyeIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Creatives</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(stats.total_creatives || 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BuildingOfficeIcon className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Advertisers</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(stats.total_advertisers || 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ChartBarIcon className="h-8 w-8 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Recent (7 days)</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(stats.recent_creatives_7_days || 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <PhotoIcon className="h-8 w-8 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Avg Dimensions</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {stats.average_dimensions?.avg_width && stats.average_dimensions?.avg_height
                      ? `${Math.round(stats.average_dimensions.avg_width)}×${Math.round(stats.average_dimensions.avg_height)}`
                      : 'N/A'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          </div>
          <div className="p-6">
            {recentActivity.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((creative) => {
                  const FormatIcon = getFormatIcon(creative.format);
                  return (
                    <div key={creative.ad_creative_id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        <FormatIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {creative.advertiser?.name || 'Unknown Advertiser'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {creative.format} • {creative.platform} • {creative.target_domain}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-sm text-gray-500">
                        {new Date(creative.fetched_at).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
