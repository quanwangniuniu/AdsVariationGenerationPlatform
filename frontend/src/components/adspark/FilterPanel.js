'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline';

export default function FilterPanel({ filters, onFilterChange, onClose }) {
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleChange = (key, value) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleApply = () => {
    onFilterChange(localFilters);
  };

  const handleClear = () => {
    const clearedFilters = Object.keys(localFilters).reduce((acc, key) => {
      acc[key] = '';
      return acc;
    }, {});
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <FunnelIcon className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Search */}
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="text"
            id="search"
            value={localFilters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            placeholder="Search advertisers or domains..."
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {/* Advertiser Name */}
        <div>
          <label htmlFor="advertiser__name" className="block text-sm font-medium text-gray-700 mb-1">
            Advertiser
          </label>
          <input
            type="text"
            id="advertiser__name"
            value={localFilters.advertiser__name}
            onChange={(e) => handleChange('advertiser__name', e.target.value)}
            placeholder="Filter by advertiser name..."
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {/* Platform */}
        <div>
          <label htmlFor="platform" className="block text-sm font-medium text-gray-700 mb-1">
            Platform
          </label>
          <select
            id="platform"
            value={localFilters.platform}
            onChange={(e) => handleChange('platform', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All platforms</option>
            <option value="SEARCH">Google Search</option>
            <option value="YOUTUBE">YouTube</option>
            <option value="PLAY">Google Play</option>
            <option value="MAPS">Google Maps</option>
            <option value="SHOPPING">Google Shopping</option>
          </select>
        </div>

        {/* Format */}
        <div>
          <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-1">
            Format
          </label>
          <select
            id="format"
            value={localFilters.format}
            onChange={(e) => handleChange('format', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All formats</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>

        {/* Region */}
        <div>
          <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">
            Region
          </label>
          <select
            id="region"
            value={localFilters.region}
            onChange={(e) => handleChange('region', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All regions</option>
            <option value="2840">United States</option>
            <option value="2036">Australia</option>
            <option value="124">Canada</option>
            <option value="826">United Kingdom</option>
            <option value="276">Germany</option>
            <option value="250">France</option>
            <option value="380">Italy</option>
            <option value="724">Spain</option>
            <option value="156">China</option>
            <option value="392">Japan</option>
            <option value="410">South Korea</option>
            <option value="356">India</option>
            <option value="076">Brazil</option>
            <option value="484">Mexico</option>
          </select>
        </div>

        {/* Target Domain */}
        <div>
          <label htmlFor="target_domain" className="block text-sm font-medium text-gray-700 mb-1">
            Target Domain
          </label>
          <input
            type="text"
            id="target_domain"
            value={localFilters.target_domain}
            onChange={(e) => handleChange('target_domain', e.target.value)}
            placeholder="e.g., apple.com"
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <div className="flex space-x-3">
          <button
            onClick={handleApply}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClear}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Clear All
          </button>
        </div>

        {hasActiveFilters && (
          <div className="text-sm text-gray-500">
            Active filters applied
          </div>
        )}
      </div>
    </div>
  );
}
