// app/adspark/watches/page.js
'use client';

import { useState, useEffect } from 'react';
import axios from '@/lib/axiosConfig';
import { 
  PlusIcon, 
  PlayIcon, 
  PencilIcon, 
  TrashIcon,
  EyeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import WatchForm from '@/components/adspark/WatchForm';
import Modal from '@/components/ui/Modal';

export default function WatchesPage() {
  const [watches, setWatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingWatch, setEditingWatch] = useState(null);
  const [triggering, setTriggering] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchWatches();
  }, []);

  const fetchWatches = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get('/api/adspark/watches/');
      setWatches(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error fetching watches:', error);
      setError('Failed to load watches');
      toast.error('Failed to load watches');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWatch = async (watchData) => {
    try {
      setSubmitting(true);
      const response = await axios.post('/api/adspark/watches/', watchData);
      
      setWatches(prev => [response.data, ...prev]);
      setShowModal(false);
      toast.success('Watch created successfully!');
    } catch (error) {
      console.error('Error creating watch:', error);
      toast.error('Failed to create watch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateWatch = async (watchData) => {
    try {
      setSubmitting(true);
      const response = await axios.put(`/api/adspark/watches/${editingWatch.id}/`, watchData);
      
      setWatches(prev => prev.map(watch => 
        watch.id === editingWatch.id ? response.data : watch
      ));
      setShowModal(false);
      setEditingWatch(null);
      toast.success('Watch updated successfully!');
    } catch (error) {
      console.error('Error updating watch:', error);
      toast.error('Failed to update watch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWatch = async (watchId) => {
    if (!confirm('Are you sure you want to delete this watch?')) return;
    
    try {
      await axios.delete(`/api/adspark/watches/${watchId}/`);
      setWatches(prev => prev.filter(watch => watch.id !== watchId));
      toast.success('Watch deleted successfully!');
    } catch (error) {
      console.error('Error deleting watch:', error);
      toast.error('Failed to delete watch');
    }
  };

  const handleTriggerWatch = async (watchId) => {
    try {
      setTriggering(prev => ({ ...prev, [watchId]: true }));
      const response = await axios.post(`/api/adspark/watches/${watchId}/trigger/`);
      toast.success('Watch triggered successfully!');
      console.log('Task ID:', response.data.task_id);
    } catch (error) {
      console.error('Error triggering watch:', error);
      toast.error('Failed to trigger watch');
    } finally {
      setTriggering(prev => ({ ...prev, [watchId]: false }));
    }
  };

  const handleTriggerAll = async () => {
    try {
      setTriggering(prev => ({ ...prev, all: true }));
      const response = await axios.post('/api/adspark/watches/trigger_all/');
      toast.success('All active watches triggered successfully!');
      console.log('Task ID:', response.data.task_id);
    } catch (error) {
      console.error('Error triggering all watches:', error);
      toast.error('Failed to trigger watches');
    } finally {
      setTriggering(prev => ({ ...prev, all: false }));
    }
  };

  const openEditModal = (watch) => {
    setEditingWatch(watch);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWatch(null);
  };

  const getStatusIcon = (isActive) => {
    return isActive ? (
      <CheckCircleIcon className="h-5 w-5 text-green-500" />
    ) : (
      <XCircleIcon className="h-5 w-5 text-red-500" />
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString();
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
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Watch Management</h1>
            <p className="mt-2 text-gray-600">
              Configure and manage SerpAPI search configurations
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleTriggerAll}
              disabled={triggering.all}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              <PlayIcon className="h-4 w-4 mr-2" />
              {triggering.all ? 'Triggering...' : 'Trigger All'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Watch
            </button>
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

        {/* Watches Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {watches.length === 0 ? (
            <div className="col-span-full">
              <div className="text-center py-12">
                <EyeIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No watches</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating a new watch configuration.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    New Watch
                  </button>
                </div>
              </div>
            </div>
          ) : (
            watches.map((watch) => (
              <div key={watch.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(watch.is_active)}
                        <h3 className="text-lg font-medium text-gray-900">{watch.name}</h3>
                      </div>
                      
                      <div className="mt-4 space-y-2 text-sm text-gray-600">
                        {watch.advertiser_ids && (
                          <p><span className="font-medium">Advertiser IDs:</span> {watch.advertiser_ids}</p>
                        )}
                        {watch.text && (
                          <p><span className="font-medium">Text:</span> {watch.text}</p>
                        )}
                        {watch.region && (
                          <p><span className="font-medium">Region:</span> {watch.region}</p>
                        )}
                        {watch.platform && (
                          <p><span className="font-medium">Platform:</span> {watch.platform}</p>
                        )}
                        {watch.creative_format && (
                          <p><span className="font-medium">Format:</span> {watch.creative_format}</p>
                        )}
                        {watch.political_ads && (
                          <p><span className="font-medium">Political Ads:</span> Yes</p>
                        )}
                      </div>

                      <div className="mt-4 text-xs text-gray-500">
                        <p>Created: {formatDate(watch.created_at)}</p>
                        <p>Updated: {formatDate(watch.updated_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex space-x-2">
                    <button
                      onClick={() => handleTriggerWatch(watch.id)}
                      disabled={triggering[watch.id] || !watch.is_active}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      <PlayIcon className="h-4 w-4 mr-1" />
                      {triggering[watch.id] ? 'Triggering...' : 'Trigger'}
                    </button>
                    
                    <button
                      onClick={() => openEditModal(watch)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => handleDeleteWatch(watch.id)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <Modal isOpen={showModal} onClose={closeModal}>
            <WatchForm
              watch={editingWatch}
              onSubmit={editingWatch ? handleUpdateWatch : handleCreateWatch}
              onCancel={closeModal}
              submitting={submitting}
            />
          </Modal>
        )}
      </div>
    </div>
  );
}
