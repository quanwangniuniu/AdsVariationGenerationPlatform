// components/asset/StorageDashboard.tsx
'use client';

import { useMemo } from 'react';

type Asset = {
  id: string;
  workspace_id: string;
  uploader_name: string;
  file: string;
  size: number;
  file_size_display: string;
  mime_type: string;
  checksum: string;
  uploaded_at: string;
  is_active: boolean;
};

type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

interface StorageDashboardProps {
  ws: Workspace | null;
  assets: Asset[];
  onShowMsg: (text: string, type: 'success' | 'error') => void;
}

export default function StorageDashboard({ 
  ws, 
  assets, 
  onShowMsg 
}: StorageDashboardProps) {
  
  // Calculate storage statistics
  const storageStats = useMemo(() => {
    if (!ws || !Array.isArray(assets)) {
      return {
        totalUsed: 0,
        totalUsedText: '0 B',
        maxStorage: 0,
        maxStorageText: '0 B',
        usagePercent: 0,
        imageCount: 0,
        videoCount: 0,
        totalFiles: 0,
        imageSize: 0,
        videoSize: 0,
        imageSizeText: '0 B',
        videoSizeText: '0 B'
      };
    }

    const totalUsed = assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    const maxStorage = ws.max_storage_gb * 1024 * 1024 * 1024;
    
    const imageAssets = assets.filter(asset => asset.mime_type.startsWith('image/'));
    const videoAssets = assets.filter(asset => asset.mime_type.startsWith('video/'));
    
    const imageSize = imageAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    const videoSize = videoAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);

    return {
      totalUsed,
      totalUsedText: humanSize(totalUsed),
      maxStorage,
      maxStorageText: humanSize(maxStorage),
      usagePercent: maxStorage ? Math.round((totalUsed / maxStorage) * 100) : 0,
      imageCount: imageAssets.length,
      videoCount: videoAssets.length,
      totalFiles: assets.length,
      imageSize,
      videoSize,
      imageSizeText: humanSize(imageSize),
      videoSizeText: humanSize(videoSize)
    };
  }, [ws, assets]);

  // Get storage status color
  const getStorageStatusColor = (percent: number): string => {
    if (percent >= 90) return '#dc2626'; // Red
    if (percent >= 75) return '#f59e0b'; // Orange
    if (percent >= 50) return '#eab308'; // Yellow
    return '#10b981'; // Green
  };

  // Get storage status message
  const getStorageStatusMessage = (percent: number): string => {
    if (percent >= 90) return 'Storage almost full! Consider cleaning up old files.';
    if (percent >= 75) return 'Storage getting full. Monitor your usage.';
    if (percent >= 50) return 'Storage usage is moderate.';
    return 'Storage usage is healthy.';
  };

  // Get cleanup suggestions
  const getCleanupSuggestions = (): string[] => {
    const suggestions: string[] = [];
    
    if (storageStats.usagePercent >= 80) {
      suggestions.push('Consider deleting unused or duplicate files');
      suggestions.push('Compress large images to reduce file sizes');
    }
    
    if (storageStats.videoCount > 10) {
      suggestions.push('Review and remove old video files if no longer needed');
    }
    
    if (storageStats.imageCount > 50) {
      suggestions.push('Consider organizing images into folders or albums');
    }
    
    if (storageStats.usagePercent >= 90) {
      suggestions.push('Upgrade your workspace plan for more storage space');
    }
    
    return suggestions;
  };

  function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  // Get largest files
  const largestFiles = useMemo(() => {
    return [...assets]
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 5);
  }, [assets]);

  // Get recent uploads
  const recentUploads = useMemo(() => {
    return [...assets]
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
      .slice(0, 5);
  }, [assets]);

  return (
    <>
      <header className="page-header">
        <h1>Storage Dashboard</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {/* Storage Overview */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Storage Overview</h3>
          <div className="storage-status" style={{ color: getStorageStatusColor(storageStats.usagePercent) }}>
            {storageStats.usagePercent}% Used
          </div>
        </div>
        
        <div className="storage-info">
          <div className="storage-bar">
            <div 
              className="storage-fill" 
              style={{ 
                width: `${Math.min(storageStats.usagePercent, 100)}%`,
                backgroundColor: getStorageStatusColor(storageStats.usagePercent)
              }}
            />
          </div>
          <div className="storage-details">
            <span className="storage-used">{storageStats.totalUsedText}</span>
            <span className="storage-separator">of</span>
            <span className="storage-total">{storageStats.maxStorageText}</span>
          </div>
          <div className="storage-message" style={{ color: getStorageStatusColor(storageStats.usagePercent) }}>
            {getStorageStatusMessage(storageStats.usagePercent)}
          </div>
        </div>
      </section>

      {/* File Statistics */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>File Statistics</h3>
        </div>
        
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-icon">📁</div>
            <div className="stat-content">
              <div className="stat-value">{storageStats.totalFiles}</div>
              <div className="stat-label">Total Files</div>
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-icon">🖼️</div>
            <div className="stat-content">
              <div className="stat-value">{storageStats.imageCount}</div>
              <div className="stat-label">Images</div>
              <div className="stat-size">{storageStats.imageSizeText}</div>
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-icon">🎥</div>
            <div className="stat-content">
              <div className="stat-value">{storageStats.videoCount}</div>
              <div className="stat-label">Videos</div>
              <div className="stat-size">{storageStats.videoSizeText}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Largest Files */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Largest Files</h3>
        </div>
        
        {largestFiles.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
            No files uploaded yet
          </div>
        ) : (
          <div className="file-list">
            {largestFiles.map((asset) => (
              <div key={asset.id} className="file-item">
                <div className="file-icon">
                  {asset.mime_type.startsWith('image/') ? '🖼️' : '🎥'}
                </div>
                <div className="file-info">
                  <div className="file-name">{asset.file.split('/').pop()}</div>
                  <div className="file-meta">
                    {asset.file_size_display} • {formatDate(asset.uploaded_at)} • by {asset.uploader_name}
                  </div>
                </div>
                <div className="file-size">{asset.file_size_display}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Uploads */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Recent Uploads</h3>
        </div>
        
        {recentUploads.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
            No recent uploads
          </div>
        ) : (
          <div className="file-list">
            {recentUploads.map((asset) => (
              <div key={asset.id} className="file-item">
                <div className="file-icon">
                  {asset.mime_type.startsWith('image/') ? '🖼️' : '🎥'}
                </div>
                <div className="file-info">
                  <div className="file-name">{asset.file.split('/').pop()}</div>
                  <div className="file-meta">
                    {asset.file_size_display} • {formatDate(asset.uploaded_at)} • by {asset.uploader_name}
                  </div>
                </div>
                <div className="file-date">{formatDate(asset.uploaded_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cleanup Suggestions */}
      {getCleanupSuggestions().length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Storage Optimization</h3>
          </div>
          
          <div className="suggestions-list">
            {getCleanupSuggestions().map((suggestion, index) => (
              <div key={index} className="suggestion-item">
                <div className="suggestion-icon">💡</div>
                <div className="suggestion-text">{suggestion}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .muted { color:#6b7280; font-size:12px; }
        
        /* Storage Overview Styles */
        .storage-status { font-weight: 700; font-size: 14px; }
        .storage-info { margin-top: 16px; }
        .storage-bar { height: 12px; background: #f3e8ff; border-radius: 999px; overflow: hidden; margin-bottom: 12px; }
        .storage-fill { height: 100%; transition: all 0.3s ease; }
        .storage-details { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .storage-used { font-weight: 700; color: #374151; }
        .storage-separator { color: #6b7280; }
        .storage-total { color: #6b7280; }
        .storage-message { font-size: 12px; font-weight: 600; }
        
        /* Statistics Grid */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
        .stat-item { display: flex; align-items: center; gap: 12px; padding: 16px; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; }
        .stat-icon { font-size: 24px; }
        .stat-content { flex: 1; }
        .stat-value { font-size: 20px; font-weight: 700; color: #374151; margin-bottom: 2px; }
        .stat-label { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
        .stat-size { font-size: 11px; color: #9ca3af; }
        
        /* File List Styles */
        .file-list { display: flex; flex-direction: column; gap: 8px; }
        .file-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; }
        .file-icon { font-size: 20px; }
        .file-info { flex: 1; }
        .file-name { font-weight: 600; color: #374151; margin-bottom: 2px; }
        .file-meta { font-size: 12px; color: #6b7280; }
        .file-size, .file-date { font-size: 12px; color: #6b7280; font-weight: 600; }
        
        /* Suggestions Styles */
        .suggestions-list { display: flex; flex-direction: column; gap: 12px; }
        .suggestion-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: #fef3c7; border-radius: 8px; border: 1px solid #fbbf24; }
        .suggestion-icon { font-size: 16px; }
        .suggestion-text { color: #92400e; font-size: 14px; }
        
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: 1fr; }
          .storage-details { flex-direction: column; align-items: flex-start; gap: 4px; }
        }
      `}</style>
    </>
  );
}
