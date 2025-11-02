// app/adspark/creatives/page.js
'use client';

import { useState, useEffect } from 'react';
import axios from '@/lib/axiosConfig';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon,
  PhotoIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  EyeIcon,
  ChartBarIcon,
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import CreativeGrid from '@/components/adspark/CreativeGrid';
import CreativeModal from '@/components/adspark/CreativeModal';
import FilterPanel from '@/components/adspark/FilterPanel';

export default function CreativesPage() {
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    advertiser__name: '',
    platform: '',
    format: '',
    region: '',
    target_domain: '',
    search: ''
  });
  const [ordering, setOrdering] = useState('-first_shown');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    page_size: 20
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchCreatives();
  }, [filters, ordering, currentPage]);

  const fetchCreatives = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        ...filters,
        ordering,
        page: currentPage,
        page_size: pagination.page_size
      };
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null) {
          delete params[key];
        }
      });
      
      const response = await axios.get('/api/adspark/creatives/', { params });
      
      if (response.data.results) {
        setCreatives(response.data.results);
        setPagination({
          count: response.data.count,
          next: response.data.next,
          previous: response.data.previous,
          page_size: pagination.page_size
        });
      } else {
        setCreatives(response.data);
        setPagination({
          count: response.data.length,
          next: null,
          previous: null,
          page_size: pagination.page_size
        });
      }
    } catch (error) {
      console.error('Error fetching creatives:', error);
      setError('Failed to load creatives');
      toast.error('Failed to load creatives');
      setCreatives([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleOrderingChange = (newOrdering) => {
    setOrdering(newOrdering);
    setCurrentPage(1);
  };

  const handleCreativeClick = (creative) => {
    setSelectedCreative(creative);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCreative(null);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const getFormatIcon = (format) => {
    switch (format) {
      case 'image': return PhotoIcon;
      case 'video': return VideoCameraIcon;
      case 'text': return DocumentTextIcon;
      default: return DocumentTextIcon;
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const totalPages = Math.ceil(pagination.count / pagination.page_size);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Ad Creatives</h1>
              <p className="mt-2 text-gray-600">
                Browse and analyze ad creatives from Google Ads Transparency Center
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <FunnelIcon className="h-4 w-4 mr-2" />
                Filters
              </button>
            </div>
          </div>

          {/* Results Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  Showing {formatNumber(creatives.length)} of {formatNumber(pagination.count)} creatives
                </span>
                {Object.values(filters).some(f => f !== '') && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    Filtered
                  </span>
                )}
              </div>
              
              {/* Ordering */}
              <div className="flex items-center space-x-2">
                <ArrowsUpDownIcon className="h-4 w-4 text-gray-400" />
                <select
                  value={ordering}
                  onChange={(e) => handleOrderingChange(e.target.value)}
                  className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="-first_shown">Newest First</option>
                  <option value="first_shown">Oldest First</option>
                  <option value="-last_shown">Recently Updated</option>
                  <option value="-fetched_at">Recently Fetched</option>
                  <option value="advertiser__name">Advertiser A-Z</option>
                  <option value="-advertiser__name">Advertiser Z-A</option>
                </select>
              </div>
            </div>
          </div>
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

        {/* Filter Panel */}
        {showFilters && (
          <div className="mb-6">
            <FilterPanel 
              filters={filters} 
              onFilterChange={handleFilterChange}
              onClose={() => setShowFilters(false)}
            />
          </div>
        )}

        {/* Creatives Grid */}
        <div className="mb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-12">
              <EyeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No creatives found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {error ? 'Unable to load creatives. Please try again.' : 'Try adjusting your filters or create a watch to fetch new data.'}
              </p>
            </div>
          ) : (
            <CreativeGrid 
              creatives={creatives}
              onCreativeClick={handleCreativeClick}
            />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!pagination.previous}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!pagination.next}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!pagination.previous}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          page === currentPage
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!pagination.next}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* Creative Modal */}
        {showModal && selectedCreative && (
          <CreativeModal
            creative={selectedCreative}
            isOpen={showModal}
            onClose={closeModal}
          />
        )}
      </div>
    </div>
  );
}
