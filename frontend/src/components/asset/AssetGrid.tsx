// components/asset/AssetGrid.tsx
'use client';

import { useState } from 'react';

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

interface AssetGridProps {
  ws: Workspace | null;
  assets: Asset[];
  canUploadAssets: boolean;
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onApiGET: <T>(url: string) => Promise<T | null>;
  onSetAssets: (assets: Asset[]) => void;
}

export default function AssetGrid({ 
  ws, 
  assets, 
  canUploadAssets,
  onShowMsg, 
  onApiSend, 
  onApiGET, 
  onSetAssets 
}: AssetGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'videos'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter assets based on type and search term
  const filteredAssets = assets.filter(asset => {
    const matchesType = filterType === 'all' || 
      (filterType === 'images' && asset.mime_type.startsWith('image/')) ||
      (filterType === 'videos' && asset.mime_type.startsWith('video/'));
    
    const matchesSearch = !searchTerm || 
      asset.uploader_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.file.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesSearch;
  });

  async function deleteAsset(assetId: string) {
    if (!ws) return;
    const confirmed = window.confirm('Are you sure you want to delete this asset?');
    if (!confirmed) return;
    
    const result = await onApiSend(`/api/workspaces/${ws.id}/assets/${assetId}/`, 'DELETE');
    if (result !== null) {
      onShowMsg('Asset deleted successfully', 'success');
      // Refresh assets list
      const updatedAssets = await onApiGET<any>(`/api/workspaces/${ws.id}/assets?page_size=1000`);
      if (updatedAssets) {
        onSetAssets(Array.isArray(updatedAssets) ? updatedAssets : updatedAssets.results || []);
      }
    }
  }

  async function downloadAsset(assetId: string) {
    if (!ws) return;
    try {
      const response = await onApiGET<any>(`/api/workspaces/${ws.id}/assets/${assetId}/get_download_url/`);
      if (response?.url) {
        window.open(response.url, '_blank');
      }
    } catch (error) {
      onShowMsg('Failed to download asset', 'error');
    }
  }

  function getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    return '📄';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  return (
    <>
      <header className="page-header">
        <h1>Asset Library</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {/* Controls */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Assets ({filteredAssets.length})</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Search */}
            <input
              className="input"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '200px' }}
            />
            
            {/* Filter */}
            <select
              className="input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'images' | 'videos')}
              style={{ width: 'auto', padding: '6px 10px' }}
            >
              <option value="all">All Types</option>
              <option value="images">Images</option>
              <option value="videos">Videos</option>
            </select>

            {/* View Mode */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`ghost ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                style={{ padding: '6px 10px' }}
              >
                ⊞ Grid
              </button>
              <button
                className={`ghost ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                style={{ padding: '6px 10px' }}
              >
                ☰ List
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Assets Display */}
      {filteredAssets.length === 0 ? (
        <section className="card">
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <p>No assets found. {canUploadAssets ? 'Upload your first asset to get started!' : 'You don\'t have permission to upload assets.'}</p>
          </div>
        </section>
      ) : (
        <section className="card">
          {viewMode === 'grid' ? (
            <div className="asset-grid">
              {filteredAssets.map((asset) => (
                <div key={asset.id} className="asset-card">
                  <div className="asset-preview">
                    {asset.mime_type.startsWith('image/') ? (
                      <img 
                        src={asset.file} 
                        alt={asset.file} 
                        className="asset-image"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const sibling = (e.target as HTMLImageElement).nextElementSibling;
                          if (sibling instanceof HTMLElement) {
                            sibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : (
                      <div className="asset-placeholder">
                        <span style={{ fontSize: '48px' }}>{getFileIcon(asset.mime_type)}</span>
                      </div>
                    )}
                    <div className="asset-overlay">
                      <button 
                        className="asset-action-btn"
                        onClick={() => downloadAsset(asset.id)}
                        title="Download"
                      >
                        ⬇️
                      </button>
                      {canUploadAssets && (
                        <button 
                          className="asset-action-btn danger"
                          onClick={() => deleteAsset(asset.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="asset-info">
                    <div className="asset-name" title={asset.file}>
                      {asset.file.split('/').pop()}
                    </div>
                    <div className="asset-meta">
                      <span>{asset.file_size_display}</span>
                      <span>•</span>
                      <span>{formatDate(asset.uploaded_at)}</span>
                    </div>
                    <div className="asset-uploader">
                      by {asset.uploader_name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploader</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      {asset.mime_type.startsWith('image/') ? (
                        <img 
                          src={asset.file} 
                          alt={asset.file} 
                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const sibling = (e.target as HTMLImageElement).nextElementSibling;
                            if (sibling instanceof HTMLElement) {
                              sibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          {getFileIcon(asset.mime_type)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{asset.file.split('/').pop()}</td>
                    <td>
                      <span className="badge">
                        {asset.mime_type.startsWith('image/') ? 'Image' : 'Video'}
                      </span>
                    </td>
                    <td>{asset.file_size_display}</td>
                    <td>{asset.uploader_name}</td>
                    <td>{formatDate(asset.uploaded_at)}</td>
                    <td className="actions">
                      <button 
                        className="primary small" 
                        onClick={() => downloadAsset(asset.id)}
                      >
                        Download
                      </button>
                      {canUploadAssets && (
                        <button 
                          className="danger outline small" 
                          onClick={() => deleteAsset(asset.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary.small { padding:6px 10px; font-size:12px; }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .ghost.active { background: linear-gradient(135deg,#f9a8d4,#fbbf24); color:#fff; }
        .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline { padding:10px 14px; border-radius:12px; background:#fff; color:#dc2626; border:2px solid #f87171; font-weight:700; cursor:pointer; }
        .danger.outline.small { padding:6px 10px; font-size:12px; }
        .danger.outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }
        .actions { display:flex; gap:8px; }
        .muted { color:#6b7280; font-size:12px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: linear-gradient(135deg, #fce7f3, #fef3c7); color: #92400e; }
        
        /* Asset Grid Styles */
        .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .asset-card { background: #fff; border-radius: 12px; overflow: hidden; border: 2px solid #f3e8ff; transition: all 0.2s ease; }
        .asset-card:hover { border-color: #f9a8d4; box-shadow: 0 4px 12px rgba(249,168,212,.2); }
        .asset-preview { position: relative; aspect-ratio: 1; overflow: hidden; }
        .asset-image { width: 100%; height: 100%; object-fit: cover; }
        .asset-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
        .asset-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; gap: 8px; opacity: 0; transition: opacity 0.2s ease; }
        .asset-card:hover .asset-overlay { opacity: 1; }
        .asset-action-btn { background: rgba(255,255,255,0.9); border: none; border-radius: 6px; padding: 8px; cursor: pointer; font-size: 16px; transition: all 0.2s ease; }
        .asset-action-btn:hover { background: #fff; transform: scale(1.1); }
        .asset-action-btn.danger:hover { background: #fee2e2; }
        .asset-info { padding: 12px; }
        .asset-name { font-weight: 600; color: #374151; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .asset-meta { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
        .asset-uploader { font-size: 11px; color: #9ca3af; }
      `}</style>
    </>
  );
}
