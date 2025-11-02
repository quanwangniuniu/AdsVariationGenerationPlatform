'use client';

import { 
  PhotoIcon, 
  VideoCameraIcon, 
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  CalendarIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';

export default function CreativeGrid({ creatives, onCreativeClick }) {
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
    return new Date(dateString).toLocaleDateString();
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {creatives.map((creative) => {
        const FormatIcon = getFormatIcon(creative.format);
        const formatColor = getFormatColor(creative.format);
        
        return (
          <div
            key={creative.ad_creative_id}
            onClick={() => onCreativeClick(creative)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
          >
            {/* Creative Image/Preview */}
            <div className="aspect-video bg-gray-100 relative overflow-hidden">
              {creative.image_url ? (
                <img
                  src={creative.image_url}
                  alt={`Creative ${creative.ad_creative_id}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100" style={{ display: creative.image_url ? 'none' : 'flex' }}>
                <FormatIcon className="h-12 w-12 text-gray-400" />
              </div>
              
              {/* Format Badge */}
              <div className="absolute top-2 right-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${formatColor}`}>
                  <FormatIcon className="h-3 w-3 mr-1" />
                  {creative.format}
                </span>
              </div>
            </div>

            {/* Creative Info */}
            <div className="p-4">
              {/* Advertiser */}
              <div className="flex items-center mb-2">
                <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-1" />
                <span className="text-sm font-medium text-gray-900 truncate">
                  {creative.advertiser?.name || 'Unknown Advertiser'}
                </span>
              </div>

              {/* Platform */}
              {creative.platform && (
                <div className="mb-2">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {creative.platform}
                  </span>
                </div>
              )}

              {/* Target Domain */}
              {creative.target_domain && (
                <div className="mb-2">
                  <span className="text-xs text-gray-600 truncate block">
                    {creative.target_domain}
                  </span>
                </div>
              )}

              {/* Dimensions */}
              {creative.width && creative.height && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">
                    {creative.width} × {creative.height}
                  </span>
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  <span>{formatDate(creative.first_shown)}</span>
                </div>
                {creative.details_link && (
                  <a
                    href={creative.details_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLinkIcon className="h-3 w-3 mr-1" />
                    Details
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
