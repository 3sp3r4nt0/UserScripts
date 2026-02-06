/**
 * YouTube Downloader - Main JavaScript
 * Handles all frontend functionality including downloads, search, and UI interactions
 */

// ============================================
// Global Configuration
// ============================================
const CONFIG = {
    API_BASE_URL: '',
    MAX_CONCURRENT_DOWNLOADS: 3,
    POLL_INTERVAL: 1000,
    TOAST_DURATION: 5000,
    SEARCH_DEBOUNCE: 500,
    MAX_VIDEO_LENGTH: 3600, // 1 hour in seconds
    EXCLUDED_KEYWORDS: ['instrum', 'instrumental', 'karaoke'],
};

// ============================================
// State Management
// ============================================
const state = {
    downloads: new Map(),
    searchResults: [],
    selectedVideos: new Set(),
    settings: {
        theme: 'dark',
        maxThreads: 3,
        downloadQuality: 'best',
        mp3Folder: 'downloads/mp3',
        mp4Folder: 'downloads/mp4',
        maxVideoLength: 3600,
        skipInstrumental: true,
        skipDuplicates: true,
    },
    isSearching: false,
    activeTab: 'download',
};

// ============================================
// Utility Functions
// ============================================
const utils = {
    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Format file size
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Format duration (seconds to HH:MM:SS)
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    // Format date
    formatDate(date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(date));
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Validate URL
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    },

    // Check if video title contains excluded keywords
    containsExcludedKeywords(title) {
        const lowerTitle = title.toLowerCase();
        return CONFIG.EXCLUDED_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
    },

    // Generate hash for duplicate detection
    async generateHash(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Parse query string
    parseQueryString(queryString) {
        const params = new URLSearchParams(queryString);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },

    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // Local storage helpers
    storage: {
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.error('Error reading from localStorage:', e);
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error('Error writing to localStorage:', e);
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.error('Error removing from localStorage:', e);
            }
        },
    },
};

// ============================================
// API Service
// ============================================
const api = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Download endpoints
    async startDownload(url, format, options = {}) {
        return this.request('/api/download', {
            method: 'POST',
            body: JSON.stringify({ url, format, ...options }),
        });
    },

    async getDownloadStatus(downloadId) {
        return this.request(`/api/download/${downloadId}/status`);
    },

    async cancelDownload(downloadId) {
        return this.request(`/api/download/${downloadId}/cancel`, {
            method: 'POST',
        });
    },

    async getDownloadHistory() {
        return this.request('/api/downloads/history');
    },

    // Search endpoints
    async search(query, options = {}) {
        const params = new URLSearchParams({ q: query, ...options });
        return this.request(`/api/search?${params}`);
    },

    async getVideoInfo(url) {
        return this.request('/api/video/info', {
            method: 'POST',
            body: JSON.stringify({ url }),
        });
    },

    // Settings endpoints
    async getSettings() {
        return this.request('/api/settings');
    },

    async updateSettings(settings) {
        return this.request('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    },

    // Playlist endpoints
    async getPlaylistInfo(url) {
        return this.request('/api/playlist/info', {
            method: 'POST',
            body: JSON.stringify({ url }),
        });
    },

    async startPlaylistDownload(url, format, options = {}) {
        return this.request('/api/playlist/download', {
            method: 'POST',
            body: JSON.stringify({ url, format, ...options }),
        });
    },
};

// ============================================
// Toast Notification System
// ============================================
const toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
        };

        const toastEl = document.createElement('div');
        toastEl.className = `toast toast-${type}`;
        toastEl.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <div class="toast-message">${utils.escapeHtml(message)}</div>
            </div>
            <button class="alert-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(toastEl);

        // Auto remove
        setTimeout(() => {
            toastEl.classList.add('hide');
            setTimeout(() => toastEl.remove(), 300);
        }, duration);
    },

    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); },
    info(message) { this.show(message, 'info'); },
};

// ============================================
// Modal System
// ============================================
const modal = {
    show(modalId) {
        const backdrop = document.getElementById('modal-backdrop');
        const modalEl = document.getElementById(modalId);
        
        if (backdrop) backdrop.classList.add('show');
        if (modalEl) modalEl.classList.add('show');
        
        document.body.style.overflow = 'hidden';
    },

    hide(modalId) {
        const backdrop = document.getElementById('modal-backdrop');
        const modalEl = document.getElementById(modalId);
        
        if (backdrop) backdrop.classList.remove('show');
        if (modalEl) modalEl.classList.remove('show');
        
        document.body.style.overflow = '';
    },

    hideAll() {
        document.querySelectorAll('.modal.show').forEach(m => {
            m.classList.remove('show');
        });
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) backdrop.classList.remove('show');
        document.body.style.overflow = '';
    },

    confirm(title, message, onConfirm, onCancel = () => {}) {
        const modalHtml = `
            <div class="modal-header">
                <h4 class="modal-title">${utils.escapeHtml(title)}</h4>
                <button class="modal-close" onclick="modal.hideAll()">×</button>
            </div>
            <div class="modal-body">
                <p>${utils.escapeHtml(message)}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
                <button class="btn btn-primary" id="modal-confirm">Confirm</button>
            </div>
        `;

        let modalEl = document.getElementById('confirm-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'confirm-modal';
            modalEl.className = 'modal modal-sm';
            document.body.appendChild(modalEl);
        }

        modalEl.innerHTML = modalHtml;
        this.show('confirm-modal');

        document.getElementById('modal-confirm').onclick = () => {
            this.hideAll();
            onConfirm();
        };

        document.getElementById('modal-cancel').onclick = () => {
            this.hideAll();
            onCancel();
        };
    },
};

// ============================================
// Download Manager
// ============================================
const downloadManager = {
    queue: [],
    activeDownloads: new Map(),
    maxConcurrent: CONFIG.MAX_CONCURRENT_DOWNLOADS,

    init() {
        this.loadFromStorage();
        this.startQueueProcessor();
    },

    loadFromStorage() {
        const saved = utils.storage.get('downloadQueue', []);
        this.queue = saved.filter(item => item.status === 'pending');
        this.renderQueue();
    },

    saveToStorage() {
        const allDownloads = [...this.queue, ...Array.from(this.activeDownloads.values())];
        utils.storage.set('downloadQueue', allDownloads);
    },

    async addToQueue(videoInfo, format) {
        // Check for duplicates
        if (state.settings.skipDuplicates) {
            const isDuplicate = await this.checkDuplicate(videoInfo.url);
            if (isDuplicate) {
                toast.warning(`"${videoInfo.title}" is already in your download history`);
                return null;
            }
        }

        // Check video length
        if (videoInfo.duration > state.settings.maxVideoLength) {
            toast.warning(`Video exceeds maximum length of ${utils.formatDuration(state.settings.maxVideoLength)}`);
            return null;
        }

        // Check for excluded keywords
        if (state.settings.skipInstrumental && utils.containsExcludedKeywords(videoInfo.title)) {
            toast.warning(`Skipping "${videoInfo.title}" - contains excluded keywords`);
            return null;
        }

        const downloadItem = {
            id: utils.generateId(),
            url: videoInfo.url,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration,
            format: format,
            status: 'pending',
            progress: 0,
            speed: 0,
            eta: 0,
            size: 0,
            downloadedSize: 0,
            addedAt: Date.now(),
            error: null,
        };

        this.queue.push(downloadItem);
        this.saveToStorage();
        this.renderQueue();
        toast.success(`Added "${videoInfo.title}" to download queue`);

        return downloadItem;
    },

    async checkDuplicate(url) {
        const history = utils.storage.get('downloadHistory', []);
        const urlHash = await utils.generateHash(url);
        return history.some(item => item.urlHash === urlHash);
    },

    startQueueProcessor() {
        setInterval(() => {
            this.processQueue();
        }, 1000);
    },

    async processQueue() {
        if (this.activeDownloads.size >= this.maxConcurrent) return;
        if (this.queue.length === 0) return;

        const pendingItems = this.queue.filter(item => item.status === 'pending');
        if (pendingItems.length === 0) return;

        const item = pendingItems[0];
        item.status = 'downloading';
        this.activeDownloads.set(item.id, item);
        this.queue = this.queue.filter(i => i.id !== item.id);

        this.renderQueue();
        await this.startDownload(item);
    },

    async startDownload(item) {
        try {
            // Start the download via API
            const response = await api.startDownload(item.url, item.format, {
                folder: item.format === 'mp3' ? state.settings.mp3Folder : state.settings.mp4Folder,
            });

            item.downloadId = response.downloadId;

            // Start polling for status
            this.pollDownloadStatus(item);

        } catch (error) {
            item.status = 'error';
            item.error = error.message;
            this.activeDownloads.delete(item.id);
            this.renderQueue();
            toast.error(`Failed to download "${item.title}": ${error.message}`);
        }
    },

    async pollDownloadStatus(item) {
        const poll = async () => {
            if (!this.activeDownloads.has(item.id)) return;

            try {
                const status = await api.getDownloadStatus(item.downloadId);
                
                item.progress = status.progress || 0;
                item.speed = status.speed || 0;
                item.eta = status.eta || 0;
                item.downloadedSize = status.downloadedSize || 0;
                item.size = status.totalSize || 0;

                this.updateProgressUI(item);

                if (status.status === 'completed') {
                    item.status = 'completed';
                    this.activeDownloads.delete(item.id);
                    this.addToHistory(item);
                    this.renderQueue();
                    toast.success(`Downloaded "${item.title}" successfully!`);
                } else if (status.status === 'error') {
                    item.status = 'error';
                    item.error = status.error;
                    this.activeDownloads.delete(item.id);
                    this.renderQueue();
                    toast.error(`Download failed: ${status.error}`);
                } else {
                    setTimeout(poll, CONFIG.POLL_INTERVAL);
                }
            } catch (error) {
                console.error('Polling error:', error);
                setTimeout(poll, CONFIG.POLL_INTERVAL);
            }
        };

        poll();
    },

    updateProgressUI(item) {
        const progressBar = document.querySelector(`#download-${item.id} .progress-bar`);
        const progressText = document.querySelector(`#download-${item.id} .progress-text`);
        
        if (progressBar) {
            progressBar.style.width = `${item.progress}%`;
        }
        
        if (progressText) {
            progressText.innerHTML = `
                <span>${item.progress.toFixed(1)}%</span>
                <span>${utils.formatSize(item.speed)}/s • ETA: ${utils.formatDuration(item.eta)}</span>
            `;
        }
    },

    addToHistory(item) {
        const history = utils.storage.get('downloadHistory', []);
        history.unshift({
            ...item,
            urlHash: utils.generateHash(item.url),
            completedAt: Date.now(),
        });
        // Keep only last 100 items
        utils.storage.set('downloadHistory', history.slice(0, 100));
    },

    async cancelDownload(itemId) {
        const item = this.activeDownloads.get(itemId) || this.queue.find(i => i.id === itemId);
        
        if (!item) return;

        if (item.status === 'downloading' && item.downloadId) {
            try {
                await api.cancelDownload(item.downloadId);
            } catch (error) {
                console.error('Cancel error:', error);
            }
        }

        this.activeDownloads.delete(itemId);
        this.queue = this.queue.filter(i => i.id !== itemId);
        this.saveToStorage();
        this.renderQueue();
        toast.info(`Cancelled download: "${item.title}"`);
    },

    async retryDownload(itemId) {
        const history = utils.storage.get('downloadHistory', []);
        const item = history.find(i => i.id === itemId);
        
        if (item && item.status === 'error') {
            item.status = 'pending';
            item.error = null;
            item.progress = 0;
            this.queue.push(item);
            this.saveToStorage();
            this.renderQueue();
            toast.info(`Retrying download: "${item.title}"`);
        }
    },

    clearCompleted() {
        const history = utils.storage.get('downloadHistory', []);
        const completedCount = history.filter(i => i.status === 'completed').length;
        utils.storage.set('downloadHistory', history.filter(i => i.status !== 'completed'));
        this.renderQueue();
        toast.success(`Cleared ${completedCount} completed downloads`);
    },

    renderQueue() {
        const container = document.getElementById('download-queue');
        if (!container) return;

        const allItems = [
            ...Array.from(this.activeDownloads.values()),
            ...this.queue,
        ];

        if (allItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📥</div>
                    <h3 class="empty-state-title">No Active Downloads</h3>
                    <p class="empty-state-desc">Add a URL above to start downloading</p>
                </div>
            `;
            return;
        }

        container.innerHTML = allItems.map(item => this.renderDownloadItem(item)).join('');
    },

    renderDownloadItem(item) {
        const statusClasses = {
            pending: '',
            downloading: 'downloading',
            completed: 'completed',
            error: 'error',
        };

        const statusBadges = {
            pending: '<span class="badge">Pending</span>',
            downloading: '<span class="badge badge-primary">Downloading</span>',
            completed: '<span class="badge badge-success">Completed</span>',
            error: '<span class="badge badge-danger">Error</span>',
        };

        return `
            <div class="download-item ${statusClasses[item.status]}" id="download-${item.id}">
                <div class="download-thumbnail">
                    <img src="${item.thumbnail || '/static/img/placeholder.png'}" alt="${utils.escapeHtml(item.title)}">
                </div>
                <div class="download-info">
                    <div class="download-title">${utils.escapeHtml(item.title)}</div>
                    <div class="download-meta">
                        <span>⏱ ${utils.formatDuration(item.duration)}</span>
                        <span>📁 ${item.format.toUpperCase()}</span>
                        ${statusBadges[item.status]}
                    </div>
                    ${item.status === 'downloading' ? `
                        <div class="download-progress-container">
                            <div class="progress">
                                <div class="progress-bar" style="width: ${item.progress}%"></div>
                            </div>
                            <div class="progress-text">
                                <span>${item.progress.toFixed(1)}%</span>
                                <span>${utils.formatSize(item.speed)}/s</span>
                            </div>
                        </div>
                    ` : ''}
                    ${item.error ? `<div class="text-danger mt-2">${utils.escapeHtml(item.error)}</div>` : ''}
                </div>
                <div class="download-actions">
                    ${item.status === 'error' ? `
                        <button class="btn btn-sm btn-warning" onclick="downloadManager.retryDownload('${item.id}')" data-tooltip="Retry">
                            🔄
                        </button>
                    ` : ''}
                    ${item.status !== 'completed' ? `
                        <button class="btn btn-sm btn-danger" onclick="downloadManager.cancelDownload('${item.id}')" data-tooltip="Cancel">
                            ✕
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },
};

// ============================================
// Search Module
// ============================================
const searchModule = {
    async search(query, options = {}) {
        if (!query.trim()) {
            toast.warning('Please enter a search query');
            return;
        }

        state.isSearching = true;
        this.showLoading();

        try {
            const results = await api.search(query, {
                max_results: options.maxResults || 20,
                platform: options.platform || 'youtube',
            });

            state.searchResults = results.videos || [];
            this.renderResults();
            toast.success(`Found ${state.searchResults.length} videos`);

        } catch (error) {
            toast.error(`Search failed: ${error.message}`);
            this.showError(error.message);
        } finally {
            state.isSearching = false;
        }
    },

    showLoading() {
        const container = document.getElementById('search-results');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-5">
                    <div class="spinner spinner-lg mx-auto"></div>
                    <p class="mt-3 text-secondary">Searching...</p>
                </div>
            `;
        }
    },

    showError(message) {
        const container = document.getElementById('search-results');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <span class="alert-icon">✕</span>
                    <div class="alert-content">
                        <div class="alert-title">Search Error</div>
                        <p>${utils.escapeHtml(message)}</p>
                    </div>
                </div>
            `;
        }
    },

    renderResults() {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (state.searchResults.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3 class="empty-state-title">No Results Found</h3>
                    <p class="empty-state-desc">Try different keywords or check your spelling</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="d-flex justify-between align-center mb-4">
                <span class="text-secondary">${state.searchResults.length} results</span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline" onclick="searchModule.selectAll()">Select All</button>
                    <button class="btn btn-sm btn-outline" onclick="searchModule.deselectAll()">Deselect All</button>
                    <button class="btn btn-sm btn-primary" onclick="searchModule.downloadSelected()">
                        Download Selected (${state.selectedVideos.size})
                    </button>
                </div>
            </div>
            <div class="search-results">
                ${state.searchResults.map(video => this.renderResultItem(video)).join('')}
            </div>
        `;
    },

    renderResultItem(video) {
        const isSelected = state.selectedVideos.has(video.url);
        const isExcluded = utils.containsExcludedKeywords(video.title);
        const isTooLong = video.duration > state.settings.maxVideoLength;

        return `
            <div class="search-result-item ${isSelected ? 'selected' : ''} ${isExcluded || isTooLong ? 'opacity-50' : ''}"
                 onclick="searchModule.toggleSelection('${video.url}')"
                 data-url="${video.url}">
                <div class="search-result-thumbnail">
                    <img src="${video.thumbnail}" alt="${utils.escapeHtml(video.title)}">
                    <span class="search-result-duration">${utils.formatDuration(video.duration)}</span>
                    <div class="search-result-checkbox">
                        ${isSelected ? '✓' : ''}
                    </div>
                </div>
                <div class="search-result-info">
                    <div class="search-result-title">${utils.escapeHtml(video.title)}</div>
                    <div class="search-result-channel">${utils.escapeHtml(video.channel || 'Unknown')}</div>
                    ${isExcluded ? '<span class="badge badge-warning">Instrumental</span>' : ''}
                    ${isTooLong ? '<span class="badge badge-danger">Too Long</span>' : ''}
                </div>
            </div>
        `;
    },

    toggleSelection(url) {
        if (state.selectedVideos.has(url)) {
            state.selectedVideos.delete(url);
        } else {
            state.selectedVideos.add(url);
        }
        this.renderResults();
    },

    selectAll() {
        state.searchResults.forEach(video => {
            if (!utils.containsExcludedKeywords(video.title) && video.duration <= state.settings.maxVideoLength) {
                state.selectedVideos.add(video.url);
            }
        });
        this.renderResults();
    },

    deselectAll() {
        state.selectedVideos.clear();
        this.renderResults();
    },

    async downloadSelected() {
        if (state.selectedVideos.size === 0) {
            toast.warning('Please select at least one video');
            return;
        }

        const format = document.querySelector('input[name="format"]:checked')?.value || 'mp3';
        
        for (const url of state.selectedVideos) {
            const video = state.searchResults.find(v => v.url === url);
            if (video) {
                await downloadManager.addToQueue(video, format);
            }
        }

        state.selectedVideos.clear();
        this.renderResults();
        toast.success('Added selected videos to download queue');
    },
};

// ============================================
// Settings Module
// ============================================
const settingsModule = {
    init() {
        this.loadSettings();
        this.bindEvents();
    },

    loadSettings() {
        const saved = utils.storage.get('settings', {});
        Object.assign(state.settings, saved);
        this.applyTheme();
    },

    saveSettings() {
        utils.storage.set('settings', state.settings);
        toast.success('Settings saved');
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', state.settings.theme);
    },

    bindEvents() {
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = state.settings.theme === 'light';
            themeToggle.addEventListener('change', (e) => {
                state.settings.theme = e.target.checked ? 'light' : 'dark';
                this.applyTheme();
                this.saveSettings();
            });
        }

        // Max threads
        const maxThreads = document.getElementById('max-threads');
        if (maxThreads) {
            maxThreads.value = state.settings.maxThreads;
            maxThreads.addEventListener('change', (e) => {
                state.settings.maxThreads = parseInt(e.target.value);
                downloadManager.maxConcurrent = state.settings.maxThreads;
                this.saveSettings();
            });
        }

        // Max video length
        const maxLength = document.getElementById('max-video-length');
        if (maxLength) {
            maxLength.value = state.settings.maxVideoLength / 60;
            maxLength.addEventListener('change', (e) => {
                state.settings.maxVideoLength = parseInt(e.target.value) * 60;
                this.saveSettings();
            });
        }

        // Skip instrumental
        const skipInstrumental = document.getElementById('skip-instrumental');
        if (skipInstrumental) {
            skipInstrumental.checked = state.settings.skipInstrumental;
            skipInstrumental.addEventListener('change', (e) => {
                state.settings.skipInstrumental = e.target.checked;
                this.saveSettings();
            });
        }

        // Skip duplicates
        const skipDuplicates = document.getElementById('skip-duplicates');
        if (skipDuplicates) {
            skipDuplicates.checked = state.settings.skipDuplicates;
            skipDuplicates.addEventListener('change', (e) => {
                state.settings.skipDuplicates = e.target.checked;
                this.saveSettings();
            });
        }

        // Folder settings
        const mp3Folder = document.getElementById('mp3-folder');
        if (mp3Folder) {
            mp3Folder.value = state.settings.mp3Folder;
            mp3Folder.addEventListener('change', (e) => {
                state.settings.mp3Folder = e.target.value;
                this.saveSettings();
            });
        }

        const mp4Folder = document.getElementById('mp4-folder');
        if (mp4Folder) {
            mp4Folder.value = state.settings.mp4Folder;
            mp4Folder.addEventListener('change', (e) => {
                state.settings.mp4Folder = e.target.value;
                this.saveSettings();
            });
        }
    },

    resetToDefaults() {
        modal.confirm(
            'Reset Settings',
            'Are you sure you want to reset all settings to default values?',
            () => {
                utils.storage.remove('settings');
                location.reload();
            }
        );
    },

    exportSettings() {
        const settings = JSON.stringify(state.settings, null, 2);
        const blob = new Blob([settings], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ytdl-settings.json';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Settings exported');
    },

    importSettings(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                Object.assign(state.settings, settings);
                this.saveSettings();
                this.applyTheme();
                toast.success('Settings imported successfully');
                location.reload();
            } catch (error) {
                toast.error('Invalid settings file');
            }
        };
        reader.readAsText(file);
    },
};

// ============================================
// Tab Navigation
// ============================================
const tabs = {
    init() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    },

    switchTab(tabName) {
        state.activeTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    },
};

// ============================================
// Form Handlers
// ============================================
const formHandlers = {
    init() {
        this.bindUrlForm();
        this.bindSearchForm();
        this.bindPlaylistForm();
    },

    bindUrlForm() {
        const form = document.getElementById('url-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const urlInput = document.getElementById('video-url');
            const formatInput = document.querySelector('input[name="format"]:checked');
            
            if (!urlInput.value.trim()) {
                toast.warning('Please enter a valid URL');
                return;
            }

            if (!utils.isValidUrl(urlInput.value)) {
                toast.error('Please enter a valid URL');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> Loading...';

            try {
                const videoInfo = await api.getVideoInfo(urlInput.value);
                await downloadManager.addToQueue(videoInfo, formatInput?.value || 'mp3');
                urlInput.value = '';
            } catch (error) {
                toast.error(`Failed to get video info: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '⬇ Download';
            }
        });
    },

    bindSearchForm() {
        const form = document.getElementById('search-form');
        if (!form) return;

        const searchInput = document.getElementById('search-query');
        
        // Debounced search
        const debouncedSearch = utils.debounce((query) => {
            if (query.length >= 3) {
                searchModule.search(query);
            }
        }, CONFIG.SEARCH_DEBOUNCE);

        searchInput?.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = searchInput?.value.trim();
            if (query) {
                searchModule.search(query);
            }
        });
    },

    bindPlaylistForm() {
        const form = document.getElementById('playlist-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const urlInput = document.getElementById('playlist-url');
            const formatInput = document.querySelector('input[name="playlist-format"]:checked');
            
                        
            if (!urlInput.value.trim()) {
                toast.warning('Please enter a playlist URL');
                return;
            }

            if (!utils.isValidUrl(urlInput.value)) {
                toast.error('Please enter a valid URL');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> Loading playlist...';

            try {
                const playlistInfo = await api.getPlaylistInfo(urlInput.value);
                
                if (playlistInfo.videos && playlistInfo.videos.length > 0) {
                    // Show playlist modal with video list
                    this.showPlaylistModal(playlistInfo, formatInput?.value || 'mp3');
                } else {
                    toast.warning('No videos found in this playlist');
                }
            } catch (error) {
                toast.error(`Failed to load playlist: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📋 Load Playlist';
            }
        });
    },

    showPlaylistModal(playlistInfo, format) {
        const modalContent = `
            <div class="modal-header">
                <h4 class="modal-title">📋 ${utils.escapeHtml(playlistInfo.title)}</h4>
                <button class="modal-close" onclick="modal.hideAll()">×</button>
            </div>
            <div class="modal-body">
                <div class="playlist-info mb-4">
                    <p class="text-secondary">
                        ${playlistInfo.videos.length} videos • ${utils.escapeHtml(playlistInfo.channel || 'Unknown')}
                    </p>
                </div>
                <div class="playlist-actions mb-3">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="select-all-playlist" checked>
                        <span class="checkmark"></span>
                        Select All
                    </label>
                    <div class="d-flex gap-2 mt-2">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" id="skip-long-videos" ${state.settings.maxVideoLength ? 'checked' : ''}>
                            <span class="checkmark"></span>
                            Skip videos longer than ${utils.formatDuration(state.settings.maxVideoLength)}
                        </label>
                    </div>
                    <div class="d-flex gap-2 mt-2">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" id="skip-instrumental-playlist" ${state.settings.skipInstrumental ? 'checked' : ''}>
                            <span class="checkmark"></span>
                            Skip instrumental tracks
                        </label>
                    </div>
                </div>
                <div class="playlist-videos" style="max-height: 400px; overflow-y: auto;">
                    ${playlistInfo.videos.map((video, index) => `
                        <div class="playlist-video-item" data-index="${index}">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" class="playlist-video-checkbox" 
                                       data-url="${video.url}" 
                                       data-index="${index}"
                                       ${this.shouldSkipVideo(video) ? '' : 'checked'}>
                                <span class="checkmark"></span>
                            </label>
                            <img src="${video.thumbnail}" alt="" class="playlist-video-thumb">
                            <div class="playlist-video-info">
                                <div class="playlist-video-title">${utils.escapeHtml(video.title)}</div>
                                <div class="playlist-video-meta">
                                    ${utils.formatDuration(video.duration)}
                                    ${utils.containsExcludedKeywords(video.title) ? '<span class="badge badge-warning ml-2">Instrumental</span>' : ''}
                                    ${video.duration > state.settings.maxVideoLength ? '<span class="badge badge-danger ml-2">Too Long</span>' : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="modal.hideAll()">Cancel</button>
                <button class="btn btn-primary" id="download-playlist-btn">
                    ⬇ Download Selected
                </button>
            </div>
        `;

        let modalEl = document.getElementById('playlist-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'playlist-modal';
            modalEl.className = 'modal modal-lg';
            document.body.appendChild(modalEl);
        }

        modalEl.innerHTML = modalContent;
        modal.show('playlist-modal');

        // Bind modal events
        this.bindPlaylistModalEvents(playlistInfo, format);
    },

    shouldSkipVideo(video) {
        if (state.settings.skipInstrumental && utils.containsExcludedKeywords(video.title)) {
            return true;
        }
        if (video.duration > state.settings.maxVideoLength) {
            return true;
        }
        return false;
    },

    bindPlaylistModalEvents(playlistInfo, format) {
        // Select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-playlist');
        selectAllCheckbox?.addEventListener('change', (e) => {
            document.querySelectorAll('.playlist-video-checkbox').forEach(checkbox => {
                const index = parseInt(checkbox.dataset.index);
                const video = playlistInfo.videos[index];
                if (!this.shouldSkipVideo(video) || !e.target.checked) {
                    checkbox.checked = e.target.checked;
                }
            });
        });

        // Skip long videos checkbox
        const skipLongCheckbox = document.getElementById('skip-long-videos');
        skipLongCheckbox?.addEventListener('change', (e) => {
            document.querySelectorAll('.playlist-video-checkbox').forEach(checkbox => {
                const index = parseInt(checkbox.dataset.index);
                const video = playlistInfo.videos[index];
                if (video.duration > state.settings.maxVideoLength) {
                    checkbox.checked = !e.target.checked;
                }
            });
        });

        // Skip instrumental checkbox
        const skipInstrumentalCheckbox = document.getElementById('skip-instrumental-playlist');
        skipInstrumentalCheckbox?.addEventListener('change', (e) => {
            document.querySelectorAll('.playlist-video-checkbox').forEach(checkbox => {
                const index = parseInt(checkbox.dataset.index);
                const video = playlistInfo.videos[index];
                if (utils.containsExcludedKeywords(video.title)) {
                    checkbox.checked = !e.target.checked;
                }
            });
        });

        // Download button
        const downloadBtn = document.getElementById('download-playlist-btn');
        downloadBtn?.addEventListener('click', async () => {
            const selectedCheckboxes = document.querySelectorAll('.playlist-video-checkbox:checked');
            
            if (selectedCheckboxes.length === 0) {
                toast.warning('Please select at least one video');
                return;
            }

            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<span class="spinner spinner-sm"></span> Adding to queue...';

            let addedCount = 0;
            for (const checkbox of selectedCheckboxes) {
                const index = parseInt(checkbox.dataset.index);
                const video = playlistInfo.videos[index];
                
                try {
                    await downloadManager.addToQueue(video, format);
                    addedCount++;
                } catch (error) {
                    console.error('Error adding video:', error);
                }
            }

            modal.hideAll();
            toast.success(`Added ${addedCount} videos to download queue`);
        });
    },
};

// ============================================
// History Module
// ============================================
const historyModule = {
    init() {
        this.render();
    },

    getHistory() {
        return utils.storage.get('downloadHistory', []);
    },

    render() {
        const container = document.getElementById('download-history');
        if (!container) return;

        const history = this.getHistory();

        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📜</div>
                    <h3 class="empty-state-title">No Download History</h3>
                    <p class="empty-state-desc">Your completed downloads will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="d-flex justify-between align-center mb-4">
                <span class="text-secondary">${history.length} downloads</span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline" onclick="historyModule.exportHistory()">
                        📤 Export
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="historyModule.clearHistory()">
                        🗑 Clear All
                    </button>
                </div>
            </div>
            <div class="history-list">
                ${history.map(item => this.renderHistoryItem(item)).join('')}
            </div>
        `;
    },

    renderHistoryItem(item) {
        const statusIcons = {
            completed: '✓',
            error: '✕',
        };

        const statusClasses = {
            completed: 'text-success',
            error: 'text-danger',
        };

        return `
            <div class="history-item">
                <div class="history-thumbnail">
                    <img src="${item.thumbnail || '/static/img/placeholder.png'}" alt="">
                </div>
                <div class="history-info">
                    <div class="history-title">${utils.escapeHtml(item.title)}</div>
                    <div class="history-meta">
                        <span>${item.format.toUpperCase()}</span>
                        <span>•</span>
                        <span>${utils.formatDuration(item.duration)}</span>
                        <span>•</span>
                        <span>${utils.formatDate(item.completedAt || item.addedAt)}</span>
                        <span class="${statusClasses[item.status]}">${statusIcons[item.status]}</span>
                    </div>
                    ${item.error ? `<div class="text-danger text-sm">${utils.escapeHtml(item.error)}</div>` : ''}
                </div>
                <div class="history-actions">
                    ${item.status === 'error' ? `
                        <button class="btn btn-sm btn-warning" onclick="downloadManager.retryDownload('${item.id}')" data-tooltip="Retry">
                            🔄
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline" onclick="historyModule.copyUrl('${item.url}')" data-tooltip="Copy URL">
                        📋
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="historyModule.removeItem('${item.id}')" data-tooltip="Remove">
                        🗑
                    </button>
                </div>
            </div>
        `;
    },

    copyUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            toast.success('URL copied to clipboard');
        }).catch(() => {
            toast.error('Failed to copy URL');
        });
    },

    removeItem(itemId) {
        const history = this.getHistory();
        const filtered = history.filter(item => item.id !== itemId);
        utils.storage.set('downloadHistory', filtered);
        this.render();
        toast.info('Removed from history');
    },

    clearHistory() {
        modal.confirm(
            'Clear History',
            'Are you sure you want to clear all download history? This cannot be undone.',
            () => {
                utils.storage.remove('downloadHistory');
                this.render();
                toast.success('History cleared');
            }
        );
    },

    exportHistory() {
        const history = this.getHistory();
        const csv = this.convertToCSV(history);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `download-history-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('History exported');
    },

    convertToCSV(history) {
        const headers = ['Title', 'URL', 'Format', 'Duration', 'Status', 'Date'];
        const rows = history.map(item => [
            `"${item.title.replace(/"/g, '""')}"`,
            item.url,
            item.format,
            utils.formatDuration(item.duration),
            item.status,
            utils.formatDate(item.completedAt || item.addedAt),
        ]);
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    },
};

// ============================================
// Keyboard Shortcuts
// ============================================
const keyboardShortcuts = {
    shortcuts: {
        'ctrl+v': 'pasteUrl',
        'ctrl+s': 'openSettings',
        'ctrl+h': 'openHistory',
        'escape': 'closeModals',
        'ctrl+1': () => tabs.switchTab('download'),
        'ctrl+2': () => tabs.switchTab('search'),
        'ctrl+3': () => tabs.switchTab('playlist'),
        'ctrl+4': () => tabs.switchTab('history'),
    },

    init() {
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
    },

    handleKeydown(e) {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                e.target.blur();
            }
            return;
        }

        const key = this.getKeyString(e);
        const action = this.shortcuts[key];

        if (action) {
            e.preventDefault();
            if (typeof action === 'function') {
                action();
            } else {
                this.executeAction(action);
            }
        }
    },

    getKeyString(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        parts.push(e.key.toLowerCase());
        return parts.join('+');
    },

    executeAction(action) {
        switch (action) {
            case 'pasteUrl':
                this.pasteUrl();
                break;
            case 'openSettings':
                modal.show('settings-modal');
                break;
            case 'openHistory':
                tabs.switchTab('history');
                break;
            case 'closeModals':
                modal.hideAll();
                break;
        }
    },

    async pasteUrl() {
        try {
            const text = await navigator.clipboard.readText();
            if (utils.isValidUrl(text)) {
                const urlInput = document.getElementById('video-url');
                if (urlInput) {
                    urlInput.value = text;
                    urlInput.focus();
                    toast.info('URL pasted from clipboard');
                }
            }
        } catch (error) {
            console.error('Clipboard access denied:', error);
        }
    },
};

// ============================================
// Drag and Drop
// ============================================
const dragDrop = {
    init() {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const text = e.dataTransfer.getData('text');
            if (text && utils.isValidUrl(text)) {
                const urlInput = document.getElementById('video-url');
                if (urlInput) {
                    urlInput.value = text;
                    toast.info('URL dropped successfully');
                }
            }
        });
    },
};

// ============================================
// Stats Module
// ============================================
const statsModule = {
    init() {
        this.render();
    },

    getStats() {
        const history = utils.storage.get('downloadHistory', []);
        const completed = history.filter(h => h.status === 'completed');
        const failed = history.filter(h => h.status === 'error');
        
        const totalDuration = completed.reduce((acc, h) => acc + (h.duration || 0), 0);
        const mp3Count = completed.filter(h => h.format === 'mp3').length;
        const mp4Count = completed.filter(h => h.format === 'mp4').length;

        return {
            total: history.length,
            completed: completed.length,
            failed: failed.length,
            totalDuration,
            mp3Count,
            mp4Count,
        };
    },

    render() {
        const container = document.getElementById('stats-container');
        if (!container) return;

        const stats = this.getStats();

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">📥</div>
                    <div class="stat-value">${stats.completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱</div>
                    <div class="stat-value">${utils.formatDuration(stats.totalDuration)}</div>
                    <div class="stat-label">Total Duration</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🎵</div>
                    <div class="stat-value">${stats.mp3Count}</div>
                    <div class="stat-label">MP3 Files</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🎬</div>
                    <div class="stat-value">${stats.mp4Count}</div>
                    <div class="stat-label">MP4 Files</div>
                </div>
            </div>
        `;
    },
};

// ============================================
// Network Status
// ============================================
const networkStatus = {
    init() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        this.updateIndicator();
    },

    handleOnline() {
        toast.success('Connection restored');
        this.updateIndicator();
    },

    handleOffline() {
        toast.error('No internet connection');
        this.updateIndicator();
    },

    updateIndicator() {
        const indicator = document.getElementById('network-indicator');
        if (indicator) {
            indicator.className = navigator.onLine ? 'status-online' : 'status-offline';
            indicator.title = navigator.onLine ? 'Online' : 'Offline';
        }
    },

    isOnline() {
        return navigator.onLine;
    },
};

// ============================================
// Clipboard Handler
// ============================================
const clipboardHandler = {
    init() {
        // Watch for clipboard changes when window is focused
        window.addEventListener('focus', () => this.checkClipboard());
    },

    async checkClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (utils.isValidUrl(text) && this.isVideoUrl(text)) {
                const urlInput = document.getElementById('video-url');
                if (urlInput && !urlInput.value) {
                    this.showClipboardSuggestion(text);
                }
            }
        } catch (error) {
            // Clipboard access denied - silently fail
        }
    },

    isVideoUrl(url) {
        const videoPatterns = [
            /youtube\.com\/watch/,
            /youtu\.be\//,
            /vimeo\.com/,
            /dailymotion\.com/,
            /soundcloud\.com/,
            /twitch\.tv/,
            /facebook\.com.*video/,
            /instagram\.com/,
            /tiktok\.com/,
        ];
        return videoPatterns.some(pattern => pattern.test(url));
    },

    showClipboardSuggestion(url) {
        const existingSuggestion = document.querySelector('.clipboard-suggestion');
        if (existingSuggestion) existingSuggestion.remove();

        const suggestion = document.createElement('div');
        suggestion.className = 'clipboard-suggestion';
        suggestion.innerHTML = `
            <span>📋 Video URL detected in clipboard</span>
            <button class="btn btn-sm btn-primary" onclick="clipboardHandler.paste('${url}')">
                Paste
            </button>
            <button class="btn btn-sm btn-outline" onclick="this.parentElement.remove()">
                ✕
            </button>
        `;

        const urlInput = document.getElementById('video-url');
        if (urlInput) {
            urlInput.parentElement.appendChild(suggestion);
        }
    },

    paste(url) {
        const urlInput = document.getElementById('video-url');
        if (urlInput) {
            urlInput.value = url;
            urlInput.focus();
        }
        document.querySelector('.clipboard-suggestion')?.remove();
    },
};

// ============================================
// Service Worker Registration (PWA Support)
// ============================================
const pwaHandler = {
    init() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/static/js/sw.js')
                    .then(registration => {
                        console.log('SW registered:', registration);
                    })
                    .catch(error => {
                        console.log('SW registration failed:', error);
                    });
            });
        }
    },
};

// ============================================
// Theme Persistence
// ============================================
const themeHandler = {
    init() {
        // Apply saved theme immediately
        const savedTheme = utils.storage.get('settings', {}).theme || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle if exists
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = savedTheme === 'light';
        }
    },

    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        state.settings.theme = newTheme;
        utils.storage.set('settings', state.settings);
    },
};

// ============================================
// Responsive Handler
// ============================================
const responsiveHandler = {
    init() {
        this.handleResize();
        window.addEventListener('resize', utils.debounce(() => this.handleResize(), 250));
    },

    handleResize() {
        const isMobile = window.innerWidth < 768;
        document.body.classList.toggle('is-mobile', isMobile);
        
        // Adjust sidebar on mobile
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && isMobile) {
            sidebar.classList.remove('expanded');
        }
    },

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('expanded');
        }
    },
};

// ============================================
// Auto-save Form Data
// ============================================
const formPersistence = {
    init() {
        this.restoreFormData();
        this.bindAutoSave();
    },

    restoreFormData() {
        const savedData = utils.storage.get('formData', {});
        
        Object.keys(savedData).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = savedData[id];
                } else if (element.type === 'radio') {
                    if (element.value === savedData[id]) {
                        element.checked = true;
                    }
                } else {
                    element.value = savedData[id];
                }
            }
        });
    },

    bindAutoSave() {
        const saveableInputs = document.querySelectorAll('[data-persist]');
        saveableInputs.forEach(input => {
            input.addEventListener('change', () => this.saveFormData());
        });
    },

    saveFormData() {
        const formData = {};
        const saveableInputs = document.querySelectorAll('[data-persist]');
        
        saveableInputs.forEach(input => {
            if (input.type === 'checkbox') {
                formData[input.id] = input.checked;
            } else if (input.type === 'radio') {
                if (input.checked) {
                    formData[input.name] = input.value;
                }
            } else {
                formData[input.id] = input.value;
            }
        });
        
        utils.storage.set('formData', formData);
    },
};

// ============================================
// Error Boundary
// ============================================
const errorBoundary = {
    init() {
        window.onerror = (msg, url, lineNo, columnNo, error) => {
            this.logError({ msg, url, lineNo, columnNo, error });
            return false;
        };

        window.onunhandledrejection = (event) => {
            this.logError({ msg: event.reason });
        };
    },

    logError(errorInfo) {
        console.error('Application Error:', errorInfo);
        
        // Could send to error tracking service
        // this.sendToErrorTracking(errorInfo);
    },
};

// ============================================
// Initialize Application
// ============================================
const app = {
    async init() {
        console.log('🚀 Initializing YouTube Downloader...');

        try {
            // Initialize core modules
            toast.init();
            themeHandler.init();
            errorBoundary.init();
            
            // Initialize UI components
            tabs.init();
            modal.init?.();
            
            // Initialize functional modules
            settingsModule.init();
            downloadManager.init();
            formHandlers.init();
            historyModule.init();
            statsModule.init();
            
            // Initialize enhancement modules
            keyboardShortcuts.init();
            dragDrop.init();
            networkStatus.init();
            clipboardHandler.init();
            responsiveHandler.init();
            formPersistence.init();
            
            // PWA support
            pwaHandler.init();

            // Mark as initialized
            document.body.classList.add('app-initialized');
            console.log('✅ Application initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            toast.error('Failed to initialize application. Please refresh the page.');
        }
    },
};

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// ============================================
// Expose Global Functions for HTML onclick handlers
// ============================================
window.downloadManager = downloadManager;
window.searchModule = searchModule;
window.settingsModule = settingsModule;
window.historyModule = historyModule;
window.modal = modal;
window.toast = toast;
window.tabs = tabs;
window.clipboardHandler = clipboardHandler;
window.responsiveHandler = responsiveHandler;
window.themeHandler = themeHandler;