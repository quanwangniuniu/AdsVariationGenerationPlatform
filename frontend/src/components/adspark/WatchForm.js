'use client';

import { useState, useEffect } from 'react';

export default function WatchForm({ watch, onSubmit, onCancel, submitting }) {
  const [formData, setFormData] = useState({
    name: '',
    advertiser_ids: '',
    text: '',
    region: '',
    platform: '',
    creative_format: '',
    political_ads: false,
    is_active: true
  });

  useEffect(() => {
    if (watch) {
      setFormData({
        name: watch.name || '',
        advertiser_ids: watch.advertiser_ids || '',
        text: watch.text || '',
        region: watch.region || '',
        platform: watch.platform || '',
        creative_format: watch.creative_format || '',
        political_ads: watch.political_ads || false,
        is_active: watch.is_active !== undefined ? watch.is_active : true
      });
    }
  }, [watch]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clean up empty strings
    const cleanedData = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [
        key, 
        typeof value === 'string' && value.trim() === '' ? null : value
      ])
    );
    
    onSubmit(cleanedData);
  };

  const isFormValid = () => {
    return formData.name.trim().length > 0 && 
           (formData.advertiser_ids.trim().length > 0 || formData.text.trim().length > 0);
  };

  return (
    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
      <div className="sm:flex sm:items-start">
        <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            {watch ? 'Edit Watch' : 'Create New Watch'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Watch Name *
              </label>
              <input
                type="text"
                name="name"
                id="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., Apple Search Ads"
              />
            </div>

            {/* Advertiser IDs */}
            <div>
              <label htmlFor="advertiser_ids" className="block text-sm font-medium text-gray-700">
                Advertiser IDs
              </label>
              <input
                type="text"
                name="advertiser_ids"
                id="advertiser_ids"
                value={formData.advertiser_ids}
                onChange={handleChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., AR17828074650563772417 (comma-separated for multiple)"
              />
              <p className="mt-1 text-xs text-gray-500">
                Comma-separated list of advertiser IDs from Google Ads Transparency Center
              </p>
            </div>

            {/* Text Search */}
            <div>
              <label htmlFor="text" className="block text-sm font-medium text-gray-700">
                Text Search
              </label>
              <input
                type="text"
                name="text"
                id="text"
                value={formData.text}
                onChange={handleChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., apple.com or free text search"
              />
              <p className="mt-1 text-xs text-gray-500">
                Free text search or domain name (e.g., apple.com)
              </p>
            </div>

            {/* Region */}
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-700">
                Region
              </label>
              <select
                name="region"
                id="region"
                value={formData.region}
                onChange={handleChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select a region</option>
                <option value="2840">United States (2840)</option>
                <option value="2036">Australia (2036)</option>
                <option value="124">Canada (124)</option>
                <option value="826">United Kingdom (826)</option>
                <option value="276">Germany (276)</option>
                <option value="250">France (250)</option>
                <option value="380">Italy (380)</option>
                <option value="724">Spain (724)</option>
                <option value="392">Japan (392)</option>
                <option value="410">South Korea (410)</option>
                <option value="356">India (356)</option>
                <option value="076">Brazil (076)</option>
                <option value="484">Mexico (484)</option>
              </select>
            </div>

            {/* Platform */}
            <div>
              <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
                Platform
              </label>
              <select
                name="platform"
                id="platform"
                value={formData.platform}
                onChange={handleChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All platforms</option>
                <option value="SEARCH">Google Search</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="PLAY">Google Play</option>
                <option value="MAPS">Google Maps</option>
                <option value="SHOPPING">Google Shopping</option>
              </select>
            </div>

            {/* Creative Format */}
            <div>
              <label htmlFor="creative_format" className="block text-sm font-medium text-gray-700">
                Creative Format
              </label>
              <select
                name="creative_format"
                id="creative_format"
                value={formData.creative_format}
                onChange={handleChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All formats</option>
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>

            {/* Political Ads */}
            <div className="flex items-center">
              <input
                type="checkbox"
                name="political_ads"
                id="political_ads"
                checked={formData.political_ads}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="political_ads" className="ml-2 block text-sm text-gray-900">
                Filter for political ads only
              </label>
            </div>

            {/* Active Status */}
            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_active"
                id="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                Active (can be triggered)
              </label>
            </div>

            {/* Validation Message */}
            {!isFormValid() && (
              <div className="text-sm text-red-600">
                * Watch name is required. Either advertiser IDs or text search must be provided.
              </div>
            )}

            {/* Buttons */}
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={!isFormValid() || submitting}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {submitting ? 'Saving...' : (watch ? 'Update Watch' : 'Create Watch')}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
