// components/asset/FileUpload.tsx
'use client';

import { useState, useRef, useCallback } from 'react';

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

type UploadStatus = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'scanning' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
};

interface FileUploadProps {
  ws: Workspace | null;
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onRefreshAssets: () => Promise<void>;
}

export default function FileUpload({ 
  ws, 
  onShowMsg, 
  onApiSend, 
  onRefreshAssets
}: FileUploadProps) {
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov']
  };

  const maxFileSizes = {
    'image/png': 10 * 1024 * 1024, // 10MB
    'image/jpeg': 10 * 1024 * 1024, // 10MB
    'image/webp': 10 * 1024 * 1024, // 10MB
    'video/mp4': 100 * 1024 * 1024, // 100MB
    'video/quicktime': 100 * 1024 * 1024, // 100MB
  };

  function validateFile(file: File): string | null {
    // Check file type
    if (!Object.keys(allowedTypes).includes(file.type)) {
      return `Unsupported file type: ${file.type}. Supported types: PNG, JPG, JPEG, WebP, MP4, MOV`;
    }

    // Check file size
    const maxSize = maxFileSizes[file.type as keyof typeof maxFileSizes];
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return `File too large: ${Math.round(file.size / (1024 * 1024))}MB. Maximum size: ${maxSizeMB}MB`;
    }

    return null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getFileIcon(file: File): string {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎥';
    return '📄';
  }

  async function uploadFile(file: File): Promise<void> {
    if (!ws) return;

    const uploadId = Math.random().toString(36).substr(2, 9);
    const uploadStatus: UploadStatus = {
      id: uploadId,
      file,
      status: 'pending',
      progress: 0,
      message: 'Preparing upload...'
    };

    setUploads(prev => [...prev, uploadStatus]);

    try {
      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setUploads(prev => prev.map(u => 
          u.id === uploadId 
            ? { ...u, status: 'failed', message: 'Validation failed', error: validationError }
            : u
        ));
        return;
      }

      // Update status to uploading
      setUploads(prev => prev.map(u => 
        u.id === uploadId 
          ? { ...u, status: 'uploading', message: 'Uploading...', progress: 0 }
          : u
      ));

      // Create form data
      const formData = new FormData();
      formData.append('tmp_file', file);

      // Upload file
      const response = await onApiSend<any>(`/api/workspaces/${ws.id}/upload/`, 'POST', formData, 'multipart/form-data');
      
      if (response) {
        // Update status to scanning
        setUploads(prev => prev.map(u => 
          u.id === uploadId 
            ? { ...u, status: 'scanning', message: 'Scanning for security threats...', progress: 100 }
            : u
        ));

        // Start WebSocket connection for scan status
        const pendingId = response.pending_id;
        if (pendingId) {
          connectWebSocket(pendingId, uploadId);
        } else {
          // If no pending_id, assume completed
          setUploads(prev => prev.map(u => 
            u.id === uploadId 
              ? { ...u, status: 'completed', message: 'Upload completed successfully!' }
              : u
          ));
          onRefreshAssets();
        }
      } else {
        setUploads(prev => prev.map(u => 
          u.id === uploadId 
            ? { ...u, status: 'failed', message: 'Upload failed', error: 'Server error' }
            : u
        ));
      }
    } catch (error: any) {
      setUploads(prev => prev.map(u => 
        u.id === uploadId 
          ? { ...u, status: 'failed', message: 'Upload failed', error: error.message }
          : u
      ));
    }
  }

  function buildScanSocketUrl(pendingId: string): string {
    const candidates = [WS_BASE, API_BASE].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const base = candidate.trim();
      if (!base) continue;
      try {
        const url = new URL(base);
        const protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol;
        return `${protocol}//${url.host}/ws/scan/${pendingId}/`;
      } catch {
        if (/^wss?:\/\//i.test(base)) {
          const normalized = base.replace(/\/+$/, '');
          return `${normalized}/ws/scan/${pendingId}/`;
        }
      }
    }

    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws/scan/${pendingId}/`;
    }

    return `/ws/scan/${pendingId}/`;
  }

  function connectWebSocket(pendingId: string, uploadId: string): void {
    const wsUrl = buildScanSocketUrl(pendingId);
    
    try {
      const socket = new WebSocket(wsUrl);
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setUploads(prev => prev.map(u => {
            if (u.id === uploadId) {
              switch (data.status) {
                case 'in_progress':
                  return { ...u, status: 'scanning', message: data.msg || 'Scanning...' };
                case 'completed':
                  onRefreshAssets();
                  return { ...u, status: 'completed', message: data.msg || 'Scan completed successfully!' };
                case 'failed':
                  return { ...u, status: 'failed', message: data.msg || 'Scan failed', error: 'Security scan failed' };
                default:
                  return { ...u, message: data.msg || 'Processing...' };
              }
            }
            return u;
          }));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setUploads(prev => prev.map(u => 
          u.id === uploadId 
            ? { ...u, status: 'scanning', message: 'Scan in progress... live updates unavailable.', error: undefined }
            : u
        ));
        setTimeout(() => {
          void onRefreshAssets();
        }, 2000);
      };

      socket.onclose = () => {
        console.log('WebSocket connection closed');
        setUploads(prev => prev.map(u => {
          if (u.id !== uploadId) return u;
          if (u.status === 'completed' || u.status === 'failed') return u;
          return { ...u, message: u.message || 'Scan in progress... awaiting completion.' };
        }));
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setUploads(prev => prev.map(u => 
        u.id === uploadId 
          ? { ...u, status: 'scanning', message: 'Scan in progress... live updates unavailable.', error: undefined }
          : u
      ));
      void onRefreshAssets();
    }
  }

  function removeUpload(uploadId: string): void {
    setUploads(prev => prev.filter(u => u.id !== uploadId));
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    Array.from(files).forEach(file => {
      uploadFile(file);
    });
  }, [ws]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  return (
    <>
      <header className="page-header">
        <h1>Upload Assets</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {/* Upload Area */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Upload Files</h3>
        </div>
        
        <div 
          className={`upload-area ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <h4>Drop files here or click to browse</h4>
            <p className="muted">
              Supported formats: PNG, JPG, JPEG, WebP (max 10MB), MP4, MOV (max 100MB)
            </p>
            <button className="primary" type="button">
              Choose Files
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.mp4,.mov"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </section>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Upload Progress</h3>
            <button 
              className="ghost small"
              onClick={() => setUploads([])}
            >
              Clear All
            </button>
          </div>
          
          <div className="upload-list">
            {uploads.map((upload) => (
              <div key={upload.id} className="upload-item">
                <div className="upload-info">
                  <div className="upload-icon-small">
                    {getFileIcon(upload.file)}
                  </div>
                  <div className="upload-details">
                    <div className="upload-name">{upload.file.name}</div>
                    <div className="upload-meta">
                      {formatFileSize(upload.file.size)} • {upload.message}
                    </div>
                  </div>
                </div>
                
                <div className="upload-status">
                  {upload.status === 'uploading' && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}
                  
                  {upload.status === 'scanning' && (
                    <div className="scanning-indicator">
                      <div className="spinner" />
                      <span>Scanning...</span>
                    </div>
                  )}
                  
                  {upload.status === 'completed' && (
                    <div className="status-success">✅ Completed</div>
                  )}
                  
                  {upload.status === 'failed' && (
                    <div className="status-error">❌ Failed</div>
                  )}
                  
                  <button 
                    className="remove-btn"
                    onClick={() => removeUpload(upload.id)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
                
                {upload.error && (
                  <div className="upload-error">
                    {upload.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .ghost.small { padding:6px 10px; font-size:12px; }
        .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .muted { color:#6b7280; font-size:12px; }
        
        /* Upload Area Styles */
        .upload-area { 
          border: 2px dashed #d1d5db; 
          border-radius: 12px; 
          padding: 40px; 
          text-align: center; 
          cursor: pointer; 
          transition: all 0.2s ease;
          background: #fafafa;
        }
        .upload-area:hover, .upload-area.drag-over { 
          border-color: #f9a8d4; 
          background: #fdf2f8; 
        }
        .upload-content { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .upload-icon { font-size: 48px; margin-bottom: 8px; }
        .upload-content h4 { margin: 0; color: #374151; }
        .upload-content p { margin: 0; }
        
        /* Upload List Styles */
        .upload-list { display: flex; flex-direction: column; gap: 12px; }
        .upload-item { 
          background: #fff; 
          border: 1px solid #e5e7eb; 
          border-radius: 8px; 
          padding: 12px; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
        }
        .upload-info { display: flex; align-items: center; gap: 12px; flex: 1; }
        .upload-icon-small { font-size: 24px; }
        .upload-details { flex: 1; }
        .upload-name { font-weight: 600; color: #374151; margin-bottom: 2px; }
        .upload-meta { font-size: 12px; color: #6b7280; }
        .upload-status { display: flex; align-items: center; gap: 12px; }
        
        /* Progress Bar */
        .progress-bar { width: 100px; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #f9a8d4, #fbbf24); transition: width 0.3s ease; }
        
        /* Status Indicators */
        .scanning-indicator { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
        .spinner { width: 16px; height: 16px; border: 2px solid #e5e7eb; border-top: 2px solid #f9a8d4; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-success { color: #059669; font-size: 12px; font-weight: 600; }
        .status-error { color: #dc2626; font-size: 12px; font-weight: 600; }
        
        .remove-btn { 
          background: none; 
          border: none; 
          color: #6b7280; 
          cursor: pointer; 
          padding: 4px; 
          border-radius: 4px; 
          font-size: 14px;
        }
        .remove-btn:hover { background: #f3f4f6; color: #dc2626; }
        
        .upload-error { 
          margin-top: 8px; 
          padding: 8px; 
          background: #fee2e2; 
          color: #dc2626; 
          border-radius: 4px; 
          font-size: 12px; 
          border: 1px solid #fecaca;
        }
      `}</style>
    </>
  );
}
