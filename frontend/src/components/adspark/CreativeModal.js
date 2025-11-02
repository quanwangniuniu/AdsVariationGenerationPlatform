'use client';

import { 
  PhotoIcon, 
  VideoCameraIcon, 
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  XMarkIcon,
  GlobeAltIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';

export default function CreativeModal({ creative, isOpen, onClose }) {
  const getFormatIcon = (format) => {
    switch (format) {
      case 'image': return PhotoIcon;
      case 'video': return VideoCameraIcon;
      case 'text': return DocumentTextIcon;
      default: return DocumentTextIcon;
    }
  };

  const getFormatColor = (format) => {
    switch (format) {
      case 'image': return 'text-blue-600 bg-blue-100';
      case 'video': return 'text-purple-600 bg-purple-100';
      case 'text': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getRegionName = (regionCode) => {
    const regions = {
      '2840': 'United States',
      '2036': 'Australia',
      '124': 'Canada',
      '826': 'United Kingdom',
      '276': 'Germany',
      '250': 'France',
      '380': 'Italy',
      '724': 'Spain',
      '392': 'Japan',
      '410': 'South Korea',
      '356': 'India',
      '076': 'Brazil',
      '484': 'Mexico'
    };
    return regions[regionCode] || regionCode;
  };

  if (!creative) return null;

  const FormatIcon = getFormatIcon(creative.format);
  const formatColor = getFormatColor(creative.format);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${formatColor}`}>
              <FormatIcon className="h-4 w-4 mr-1" />
              {creative.format}
            </span>
            <h3 className="text-lg font-medium text-gray-900">
              Creative {creative.ad_creative_id}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Creative Preview */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Creative Preview</h4>
              
              {/* Image/Video Preview */}
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
                {creative.image_url ? (
                  <img
                    src={creative.image_url}
                    alt={`Creative ${creative.ad_creative_id}`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100" style={{ display: creative.image_url ? 'none' : 'flex' }}>
                  <FormatIcon className="h-16 w-16 text-gray-400" />
                </div>
              </div>

              {/* Video Link */}
              {creative.video_link && (
                <div className="mb-4">
                  <a
                    href={creative.video_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <VideoCameraIcon className="h-4 w-4 mr-1" />
                    View Video
                    <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                  </a>
                </div>
              )}

              {/* Details Link */}
              {creative.details_link && (
                <div>
                  <a
                    href={creative.details_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-1" />
                    View on Google Ads Transparency Center
                  </a>
                </div>
              )}
            </div>

            {/* Right Column - Creative Details */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Creative Details</h4>
              
              <div className="space-y-4">
                {/* Advertiser */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Advertiser
                  </label>
                  <div className="flex items-center mt-1">
                    <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-900">
                      {creative.advertiser?.name || 'Unknown Advertiser'}
                    </span>
                  </div>
                  {creative.advertiser?.advertiser_id && (
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {creative.advertiser.advertiser_id}
                    </p>
                  )}
                </div>

                {/* Platform */}
                {creative.platform && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Platform
                    </label>
                    <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-gray-100 text-gray-800 mt-1">
                      {creative.platform}
                    </span>
                  </div>
                )}

                {/* Target Domain */}
                {creative.target_domain && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Target Domain
                    </label>
                    <div className="flex items-center mt-1">
                      <GlobeAltIcon className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">{creative.target_domain}</span>
                    </div>
                  </div>
                )}

                {/* Dimensions */}
                {creative.width && creative.height && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Dimensions
                    </label>
                    <div className="flex items-center mt-1">
                      <ArrowsPointingOutIcon className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">
                        {creative.width} × {creative.height} pixels
                      </span>
                    </div>
                    {creative.aspect_ratio && (
                      <p className="text-xs text-gray-500 mt-1">
                        Aspect ratio: {creative.aspect_ratio}
                      </p>
                    )}
                  </div>
                )}

                {/* Region */}
                {creative.region && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Region
                    </label>
                    <span className="text-sm text-gray-900 mt-1">
                      {getRegionName(creative.region)}
                    </span>
                  </div>
                )}

                {/* Dates */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Campaign Dates
                  </label>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center">
                      <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">
                        First shown: {formatDate(creative.first_shown)}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">
                        Last shown: {formatDate(creative.last_shown)}
                      </span>
                    </div>
                    {creative.fetched_at && (
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          Fetched: {formatDate(creative.fetched_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Duration */}
                {creative.duration_days !== null && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Campaign Duration
                    </label>
                    <span className="text-sm text-gray-900 mt-1">
                      {creative.duration_days} days
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
