// app/adspark/advertisers/page.js
'use client';

import { useState, useEffect } from 'react';
import axios from '@/lib/axiosConfig';
import { 
  MagnifyingGlassIcon, 
  BuildingOfficeIcon,
  EyeIcon,
  CalendarIcon,
  PhotoIcon,
  VideoCameraIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';

export default function AdvertisersPage() {
  const [advertisers, setAdvertisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAdvertiser, setSelectedAdvertiser] = useState(null);
  const [advertiserCreatives, setAdvertiserCreatives] = useState([]);
  const [loadingCreatives, setLoadingCreatives] = useState(false);

  useEffect(() => {
    fetchAdvertisers();
  }, []);

  const fetchAdvertisers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get('/api/adspark/advertisers/');
      setAdvertisers(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error fetching advertisers:', error);
      setError('Failed to load advertisers');
      toast.error('Failed to load advertisers');
      setAdvertisers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvertiserCreatives = async (advertiserId) => {
    try {
      setLoadingCreatives(true);
      const response = await axios.get(`/api/adspark/advertisers/${advertiserId}/creatives/`);
      setAdvertiserCreatives(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error fetching advertiser creatives:', error);
      toast.error('Failed to load advertiser creatives');
      setAdvertiserCreatives([]);
    } finally {
      setLoadingCreatives(false);
    }
  };

  const handleAdvertiserClick = (advertiser) => {
    setSelectedAdvertiser(advertiser);
    fetchAdvertiserCreatives(advertiser.advertiser_id);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
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

  const filteredAdvertisers = advertisers.filter(advertiser =>
    advertiser.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    advertiser.advertiser_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold text-gray-900">Advertisers</h1>
          <p className="mt-2 text-gray-600">
            Browse advertisers and their ad creatives
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Advertisers List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Advertisers</h2>
                
                {/* Search */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search advertisers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {filteredAdvertisers.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    {searchTerm ? 'No advertisers found' : 'No advertisers available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredAdvertisers.map((advertiser) => (
                      <div
                        key={advertiser.advertiser_id}
                        onClick={() => handleAdvertiserClick(advertiser)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedAdvertiser?.advertiser_id === advertiser.advertiser_id
                            ? 'bg-blue-50 border-r-2 border-blue-500'
                            : ''
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {advertiser.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              ID: {advertiser.advertiser_id}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-2 text-xs text-gray-500">
                          <div className="flex items-center space-x-4">
                            <span>First seen: {formatDate(advertiser.first_seen_at)}</span>
                            <span>Last seen: {formatDate(advertiser.last_seen_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Advertiser Details and Creatives */}
          <div className="lg:col-span-2">
            {selectedAdvertiser ? (
              <div className="space-y-6">
                {/* Advertiser Details */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <BuildingOfficeIcon className="h-8 w-8 text-blue-600" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedAdvertiser.name}</h2>
                      <p className="text-sm text-gray-500">ID: {selectedAdvertiser.advertiser_id}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        First Seen
                      </label>
                      <div className="flex items-center mt-1">
                        <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {formatDate(selectedAdvertiser.first_seen_at)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Last Seen
                      </label>
                      <div className="flex items-center mt-1">
                        <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {formatDate(selectedAdvertiser.last_seen_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advertiser Creatives */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Ad Creatives</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {loadingCreatives ? 'Loading...' : `${formatNumber(advertiserCreatives.length)} creatives found`}
                    </p>
                  </div>

                  <div className="p-6">
                    {loadingCreatives ? (
                      <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="md" />
                      </div>
                    ) : advertiserCreatives.length === 0 ? (
                      <div className="text-center py-8">
                        <EyeIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No creatives found</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          This advertiser doesn't have any creatives yet.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {advertiserCreatives.map((creative) => {
                          const FormatIcon = getFormatIcon(creative.format);
                          return (
                            <div
                              key={creative.ad_creative_id}
                              className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                            >
                              <div className="flex items-center space-x-2 mb-2">
                                <FormatIcon className="h-4 w-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-600 uppercase">
                                  {creative.format}
                                </span>
                              </div>
                              
                              <div className="space-y-1">
                                {creative.platform && (
                                  <p className="text-xs text-gray-500">
                                    Platform: {creative.platform}
                                  </p>
                                )}
                                {creative.target_domain && (
                                  <p className="text-xs text-gray-500 truncate">
                                    Domain: {creative.target_domain}
                                  </p>
                                )}
                                {creative.width && creative.height && (
                                  <p className="text-xs text-gray-500">
                                    {creative.width} × {creative.height}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500">
                                  First shown: {formatDate(creative.first_shown)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No advertiser selected</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select an advertiser from the list to view their details and creatives.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
