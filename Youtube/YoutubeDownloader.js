// ==UserScript==
// @name         YouTube Playlist Downloader
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  YouTube playlist downloader with modern UI, queue management, and multiple features
// @author       3sp3r4nt0
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function() {
    'use strict';

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        endpoint: GM_getValue('endpoint', 'http://127.0.0.1:6975/download'),
        concurrentDownloads: GM_getValue('concurrentDownloads', 3),
        delayBetweenRequests: GM_getValue('delayBetweenRequests', 1000),
        autoDownload: GM_getValue('autoDownload', false),
        notifications: GM_getValue('notifications', true),
        theme: GM_getValue('theme', 'dark'),
        format: GM_getValue('format', 'mp3'),
        quality: GM_getValue('quality', 'best')
    };

    // ==================== STYLES ====================
    GM_addStyle(`
        /* Main Container */
        #ytdl-pro-container {
            position: fixed;
            top: 0;
            right: -450px;
            width: 450px;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            box-shadow: -5px 0 30px rgba(0,0,0,0.3);
            z-index: 999999;
            transition: right 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            flex-direction: column;
        }

        #ytdl-pro-container.open {
            right: 0;
        }

        /* Toggle Button */
        #ytdl-toggle-btn {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 10px;
            cursor: pointer;
            z-index: 999998;
            border-radius: 10px 0 0 10px;
            box-shadow: -5px 0 15px rgba(0,0,0,0.2);
            font-size: 20px;
            transition: all 0.3s;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            font-weight: bold;
            letter-spacing: 2px;
        }

        #ytdl-toggle-btn:hover {
            padding-right: 15px;
            box-shadow: -8px 0 20px rgba(0,0,0,0.3);
        }

        /* Header */
        .ytdl-header {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid rgba(255,255,255,0.1);
        }

        .ytdl-header h2 {
            margin: 0;
            color: white;
            font-size: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .ytdl-close-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.2s;
        }

        .ytdl-close-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: rotate(90deg);
        }

        /* Tabs */
        .ytdl-tabs {
            display: flex;
            background: rgba(0,0,0,0.1);
            padding: 0;
            margin: 0;
        }

        .ytdl-tab {
            flex: 1;
            padding: 15px;
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.7);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            border-bottom: 3px solid transparent;
        }

        .ytdl-tab:hover {
            background: rgba(255,255,255,0.1);
            color: white;
        }

        .ytdl-tab.active {
            color: white;
            border-bottom-color: #fff;
            background: rgba(255,255,255,0.1);
        }

        /* Content Area */
        .ytdl-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .ytdl-tab-content {
            display: none;
        }

        .ytdl-tab-content.active {
            display: block;
        }

        /* Playlist Info */
        .ytdl-playlist-info {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            color: white;
        }

        .ytdl-playlist-info h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
        }

        .ytdl-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 10px;
        }

        .ytdl-stat {
            background: rgba(0,0,0,0.2);
            padding: 10px;
            border-radius: 8px;
            text-align: center;
        }

        .ytdl-stat-value {
            font-size: 24px;
            font-weight: bold;
            display: block;
        }

        .ytdl-stat-label {
            font-size: 11px;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        /* Video List */
        .ytdl-video-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .ytdl-video-item {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.2s;
            cursor: pointer;
            border: 2px solid transparent;
        }

        .ytdl-video-item:hover {
            background: rgba(255,255,255,0.15);
            transform: translateX(-5px);
        }

        .ytdl-video-item.selected {
            border-color: #4ade80;
            background: rgba(74, 222, 128, 0.2);
        }

        .ytdl-video-item.downloading {
            border-color: #fbbf24;
            background: rgba(251, 191, 36, 0.2);
        }

        .ytdl-video-item.completed {
            border-color: #4ade80;
            background: rgba(74, 222, 128, 0.15);
            opacity: 0.7;
        }

        .ytdl-video-item.failed {
            border-color: #ef4444;
            background: rgba(239, 68, 68, 0.2);
        }

        .ytdl-video-checkbox {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }

        .ytdl-video-thumb {
            width: 80px;
            height: 45px;
            border-radius: 5px;
            object-fit: cover;
            flex-shrink: 0;
        }

        .ytdl-video-info {
            flex: 1;
            min-width: 0;
        }

        .ytdl-video-title {
            color: white;
            font-size: 13px;
            font-weight: 500;
            margin: 0 0 5px 0;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .ytdl-video-meta {
            font-size: 11px;
            color: rgba(255,255,255,0.7);
        }

        .ytdl-video-status {
            font-size: 20px;
            flex-shrink: 0;
        }

        /* Progress Bar */
        .ytdl-progress {
            background: rgba(0,0,0,0.2);
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 8px;
        }

        .ytdl-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #4ade80, #22c55e);
            transition: width 0.3s;
            border-radius: 3px;
        }

        /* Controls */
        .ytdl-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .ytdl-btn {
            flex: 1;
            min-width: 120px;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .ytdl-btn-primary {
            background: linear-gradient(135deg, #4ade80, #22c55e);
            color: white;
        }

        .ytdl-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(74, 222, 128, 0.4);
        }

        .ytdl-btn-secondary {
            background: rgba(255,255,255,0.2);
            color: white;
        }

        .ytdl-btn-secondary:hover {
            background: rgba(255,255,255,0.3);
        }

        .ytdl-btn-danger {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
        }

        .ytdl-btn-danger:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(239, 68, 68, 0.4);
        }

        .ytdl-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        /* Settings */
        .ytdl-setting {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 15px;
        }

        .ytdl-setting label {
            color: white;
            font-size: 13px;
            font-weight: 500;
            display: block;
            margin-bottom: 8px;
        }

        .ytdl-setting input[type="text"],
        .ytdl-setting input[type="number"],
        .ytdl-setting select {
            width: 100%;
            padding: 10px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            background: rgba(0,0,0,0.2);
            color: white;
            font-size: 13px;
        }

        .ytdl-setting input[type="text"]:focus,
        .ytdl-setting input[type="number"]:focus,
        .ytdl-setting select:focus {
            outline: none;
            border-color: #4ade80;
        }

        .ytdl-setting input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }

        .ytdl-checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Queue */
        .ytdl-queue-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            margin-bottom: 10px;
            color: white;
        }

        .ytdl-queue-status {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
        }

        /* Scrollbar */
        .ytdl-content::-webkit-scrollbar {
            width: 8px;
        }

        .ytdl-content::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.2);
        }

        .ytdl-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.3);
            border-radius: 4px;
        }

        .ytdl-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.5);
        }

        /* Search */
        .ytdl-search {
            margin-bottom: 15px;
        }

        .ytdl-search input {
            width: 100%;
            padding: 12px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            background: rgba(0,0,0,0.2);
            color: white;
            font-size: 14px;
        }

        .ytdl-search input::placeholder {
            color: rgba(255,255,255,0.5);
        }

        .ytdl-search input:focus {
            outline: none;
            border-color: #4ade80;
        }

        /* Loading Spinner */
        .ytdl-spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: ytdl-spin 0.6s linear infinite;
        }

        @keyframes ytdl-spin {
            to { transform: rotate(360deg); }
        }

        /* Empty State */
        .ytdl-empty {
            text-align: center;
            padding: 40px 20px;
            color: rgba(255,255,255,0.7);
        }

        .ytdl-empty-icon {
            font-size: 48px;
            margin-bottom: 10px;
            opacity: 0.5;
        }

        /* Toast Notifications */
        .ytdl-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            z-index: 1000000;
            animation: ytdl-slideIn 0.3s;
            max-width: 300px;
        }

        @keyframes ytdl-slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .ytdl-toast.success {
            border-left: 4px solid #4ade80;
        }

        .ytdl-toast.error {
            border-left: 4px solid #ef4444;
        }

        .ytdl-toast.info {
            border-left: 4px solid #3b82f6;
        }
    `);

    // ==================== STATE ====================
    let state = {
        videos: [],
        selectedVideos: new Set(),
        downloadQueue: [],
        downloading: new Set(),
        completed: new Set(),
        failed: new Set(),
        stats: {
            total: 0,
            selected: 0,
            downloaded: 0,
            failed: 0
        },
        isOpen: false,
        activeTab: 'videos',
        searchQuery: ''
    };

    // ==================== UTILITY FUNCTIONS ====================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `ytdl-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'ytdl-slideIn 0.3s reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);

        if (CONFIG.notifications && typeof GM_notification !== 'undefined') {
            GM_notification({
                title: 'YT Downloader Pro',
                text: message,
                timeout: 3000
            });
        }
    }

    function saveConfigToStorage() {
        Object.keys(CONFIG).forEach(key => {
            GM_setValue(key, CONFIG[key]);
        });
        showToast('Settings saved!', 'success');
    }

    function extractPlaylistVideos() {
        const videos = [];
        const videoElements = document.querySelectorAll('ytd-playlist-panel-video-renderer');

        videoElements.forEach((element, index) => {
            const link = element.querySelector('a#wc-endpoint');
            if (!link || !link.href) return;

            const url = new URL(link.href, 'https://www.youtube.com');
            const videoId = url.searchParams.get('v');
            if (!videoId) return;

            const titleElement = element.querySelector('#video-title');
            const title = titleElement ? (titleElement.getAttribute('title') || titleElement.textContent.trim()) : 'Unknown';

            const thumbElement = element.querySelector('img.yt-core-image');
            const thumbnail = thumbElement ? thumbElement.src : '';

            const durationElement = element.querySelector('.yt-badge-shape__text');
            const duration = durationElement ? durationElement.textContent.trim() : '';

            const channelElement = element.querySelector('#byline');
            const channel = channelElement ? channelElement.textContent.trim() : '';

            videos.push({
                id: videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title,
                thumbnail,
                duration,
                channel,
                index: index + 1
            });
        });

        return videos;
    }

    async function downloadVideo(video) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ input: video.url });

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.endpoint,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: data,
                timeout: 30000,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Network error'));
                },
                ontimeout: function() {
                    reject(new Error('Timeout'));
                }
            });
        });
    }

    // ==================== DOWNLOAD MANAGER ====================
    class DownloadManager {
        constructor() {
            this.queue = [];
            this.activeDownloads = 0;
            this.isPaused = false;
        }

        addToQueue(videos) {
            videos.forEach(video => {
                if (!this.queue.find(v => v.id === video.id)) {
                    this.queue.push(video);
                }
            });
            this.processQueue();
        }

        async processQueue() {
            if (this.isPaused || this.queue.length === 0) return;

            while (this.activeDownloads < CONFIG.concurrentDownloads && this.queue.length > 0) {
                const video = this.queue.shift();
                this.downloadVideo(video);
            }
        }

        async downloadVideo(video) {
            this.activeDownloads++;
            state.downloading.add(video.id);
            updateUI();

            try {
                await downloadVideo(video);
                state.completed.add(video.id);
                state.downloading.delete(video.id);
                state.stats.downloaded++;
                showToast(`✓ ${video.title}`, 'success');
            } catch (error) {
                state.failed.add(video.id);
                state.downloading.delete(video.id);
                state.stats.failed++;
                showToast(`✗ ${video.title}: ${error.message}`, 'error');
            }

            this.activeDownloads--;
            updateUI();

            await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
            this.processQueue();
        }

        pause() {
            this.isPaused = true;
            showToast('Download paused', 'info');
        }

        resume() {
            this.isPaused = false;
            showToast('Download resumed', 'info');
            this.processQueue();
        }

        clear() {
            this.queue = [];
            this.isPaused = false;
            showToast('Queue cleared', 'info');
        }
    }

    const downloadManager = new DownloadManager();

    // ==================== UI FUNCTIONS ====================
    function togglePanel() {
        state.isOpen = !state.isOpen;
        const container = document.getElementById('ytdl-pro-container');
        container.classList.toggle('open');
    }

    function switchTab(tabName) {
        state.activeTab = tabName;

        document.querySelectorAll('.ytdl-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.ytdl-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`ytdl-${tabName}-tab`).classList.add('active');

        if (tabName === 'queue') {
            updateQueueList();
        }
    }

    function refreshPlaylist() {
        state.videos = extractPlaylistVideos();
        state.stats.total = state.videos.length;

        if (state.videos.length === 0) {
            showToast('No playlist found. Open a YouTube playlist first.', 'error');
            return;
        }

        // Get playlist title
        const playlistTitleElement = document.querySelector('ytd-playlist-panel-renderer h3 a');
        const playlistTitle = playlistTitleElement ? playlistTitleElement.textContent : 'Current Playlist';
        document.getElementById('ytdl-playlist-title').textContent = playlistTitle;

        updateUI();
        showToast(`Found ${state.videos.length} videos!`, 'success');
    }

    function selectAll() {
        const filteredVideos = getFilteredVideos();
        filteredVideos.forEach(video => state.selectedVideos.add(video.id));
        updateUI();
    }

    function deselectAll() {
        state.selectedVideos.clear();
        updateUI();
    }

    function toggleVideo(videoId) {
        if (state.selectedVideos.has(videoId)) {
            state.selectedVideos.delete(videoId);
        } else {
            state.selectedVideos.add(videoId);
        }
        updateUI();
    }

    function downloadSelected() {
        const selected = state.videos.filter(v => state.selectedVideos.has(v.id));

        if (selected.length === 0) {
            showToast('Please select at least one video!', 'error');
            return;
        }

        downloadManager.addToQueue(selected);
        showToast(`Added ${selected.length} videos to queue`, 'success');
        switchTab('queue');
    }

    function pauseResume() {
        if (downloadManager.isPaused) {
            downloadManager.resume();
            document.getElementById('ytdl-pause-text').textContent = 'Pause';
        } else {
            downloadManager.pause();
            document.getElementById('ytdl-pause-text').textContent = 'Resume';
        }
    }

    function clearQueue() {
        if (confirm('Clear all queued downloads?')) {
            downloadManager.clear();
            updateUI();
        }
    }

    function retryFailed() {
        const failed = state.videos.filter(v => state.failed.has(v.id));
        if (failed.length === 0) {
            showToast('No failed downloads to retry', 'info');
            return;
        }

        failed.forEach(v => state.failed.delete(v.id));
        downloadManager.addToQueue(failed);
        showToast(`Retrying ${failed.length} failed downloads`, 'info');
    }

    function saveSettings() {
        CONFIG.endpoint = document.getElementById('ytdl-setting-endpoint').value;
        CONFIG.format = document.getElementById('ytdl-setting-format').value;
        CONFIG.concurrentDownloads = parseInt(document.getElementById('ytdl-setting-concurrent').value);
        CONFIG.delayBetweenRequests = parseInt(document.getElementById('ytdl-setting-delay').value);
        CONFIG.notifications = document.getElementById('ytdl-setting-notifications').checked;
        CONFIG.autoDownload = document.getElementById('ytdl-setting-auto').checked;

        saveConfigToStorage();
    }

    function getFilteredVideos() {
        if (!state.searchQuery) return state.videos;

        return state.videos.filter(video =>
            video.title.toLowerCase().includes(state.searchQuery) ||
            video.channel.toLowerCase().includes(state.searchQuery)
        );
    }

    function updateVideoList() {
        const listContainer = document.getElementById('ytdl-video-list');
        const filteredVideos = getFilteredVideos();

        if (filteredVideos.length === 0) {
            listContainer.innerHTML = `
                <div class="ytdl-empty">
                    <div class="ytdl-empty-icon">📭</div>
                    <div>No videos found</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filteredVideos.map(video => {
            const isSelected = state.selectedVideos.has(video.id);
            const isDownloading = state.downloading.has(video.id);
            const isCompleted = state.completed.has(video.id);
            const isFailed = state.failed.has(video.id);

            let statusIcon = '';
            let className = 'ytdl-video-item';

            if (isDownloading) {
                statusIcon = '<div class="ytdl-spinner"></div>';
                className += ' downloading';
            } else if (isCompleted) {
                statusIcon = '✅';
                className += ' completed';
            } else if (isFailed) {
                statusIcon = '❌';
                className += ' failed';
            }

            if (isSelected && !isCompleted) {
                className += ' selected';
            }

            return `
                <div class="${className}" data-video-id="${video.id}">
                    <input type="checkbox" class="ytdl-video-checkbox" ${isSelected ? 'checked' : ''} data-video-id="${video.id}">
                    <img src="${video.thumbnail}" class="ytdl-video-thumb" alt="">
                    <div class="ytdl-video-info">
                        <div class="ytdl-video-title">${video.index}. ${video.title}</div>
                        <div class="ytdl-video-meta">
                            ${video.channel} • ${video.duration}
                        </div>
                    </div>
                    <div class="ytdl-video-status">${statusIcon}</div>
                </div>
            `;
        }).join('');
    }

    function updateQueueList() {
        const queueContainer = document.getElementById('ytdl-queue-list');

        const allInProgress = [
            ...Array.from(state.downloading).map(id => ({ id, status: 'downloading' })),
            ...downloadManager.queue.map(v => ({ id: v.id, status: 'queued' }))
        ];

        if (allInProgress.length === 0) {
            queueContainer.innerHTML = `
                <div class="ytdl-empty">
                    <div class="ytdl-empty-icon">📋</div>
                    <div>Queue is empty</div>
                </div>
            `;
            return;
        }

        queueContainer.innerHTML = allInProgress.map(item => {
            const video = state.videos.find(v => v.id === item.id);
            if (!video) return '';

            const statusText = item.status === 'downloading' ? '⏳ Downloading...' : '⏸️ Queued';
            const statusClass = item.status === 'downloading' ? 'downloading' : 'queued';

            return `
                <div class="ytdl-queue-item ${statusClass}">
                    <div class="ytdl-queue-status">
                        <img src="${video.thumbnail}" class="ytdl-video-thumb" alt="">
                        <div style="flex: 1;">
                            <div class="ytdl-video-title">${video.title}</div>
                            <div class="ytdl-video-meta">${statusText}</div>
                        </div>
                    </div>
                    ${item.status === 'downloading' ? '<div class="ytdl-spinner"></div>' : ''}
                </div>
            `;
        }).join('');
    }

    function updateStats() {
        state.stats.selected = state.selectedVideos.size;
        state.stats.downloaded = state.completed.size;
        state.stats.failed = state.failed.size;

        document.getElementById('ytdl-total').textContent = state.stats.total;
        document.getElementById('ytdl-selected').textContent = state.stats.selected;
        document.getElementById('ytdl-downloaded').textContent = state.stats.downloaded;
    }

    function updateUI() {
        updateVideoList();
        updateStats();
        if (state.activeTab === 'queue') {
            updateQueueList();
        }
    }

    // ==================== UI CREATION ====================
    function createUI() {
        // Toggle Button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'ytdl-toggle-btn';
        toggleBtn.innerHTML = '⬇ DOWNLOADER';
        document.body.appendChild(toggleBtn);

        // Main Container
        const container = document.createElement('div');
        container.id = 'ytdl-pro-container';
        container.innerHTML = `
            <div class="ytdl-header">
                <h2>
                    <span>📥</span>
                    <span>YT Downloader Pro</span>
                </h2>
                <button class="ytdl-close-btn" id="ytdl-close">✕</button>
            </div>

            <div class="ytdl-tabs">
                <button class="ytdl-tab active" data-tab="videos">📹 Videos</button>
                <button class="ytdl-tab" data-tab="queue">⏳ Queue</button>
                <button class="ytdl-tab" data-tab="settings">⚙️ Settings</button>
            </div>

            <div class="ytdl-content">
                <!-- Videos Tab -->
                <div class="ytdl-tab-content active" id="ytdl-videos-tab">
                    <div class="ytdl-playlist-info">
                        <h3 id="ytdl-playlist-title">No playlist detected</h3>
                        <div class="ytdl-stats">
                            <div class="ytdl-stat">
                                <span class="ytdl-stat-value" id="ytdl-total">0</span>
                                <span class="ytdl-stat-label">Total</span>
                            </div>
                            <div class="ytdl-stat">
                                <span class="ytdl-stat-value" id="ytdl-selected">0</span>
                                <span class="ytdl-stat-label">Selected</span>
                            </div>
                            <div class="ytdl-stat">
                                <span class="ytdl-stat-value" id="ytdl-downloaded">0</span>
                                <span class="ytdl-stat-label">Downloaded</span>
                            </div>
                        </div>
                    </div>

                    <div class="ytdl-search">
                        <input type="text" id="ytdl-search-input" placeholder="🔍 Search videos...">
                    </div>

                    <div class="ytdl-controls">
                        <button class="ytdl-btn ytdl-btn-primary" id="ytdl-refresh">
                            🔄 Refresh
                        </button>
                        <button class="ytdl-btn ytdl-btn-secondary" id="ytdl-select-all">
                            ☑️ Select All
                        </button>
                        <button class="ytdl-btn ytdl-btn-secondary" id="ytdl-deselect-all">
                            ◻️ Deselect All
                        </button>
                        <button class="ytdl-btn ytdl-btn-primary" id="ytdl-download-selected" style="flex: 2;">
                            ⬇️ Download Selected
                        </button>
                    </div>

                    <div id="ytdl-video-list" class="ytdl-video-list"></div>
                </div>

                <!-- Queue Tab -->
                <div class="ytdl-tab-content" id="ytdl-queue-tab">
                    <div class="ytdl-controls">
                        <button class="ytdl-btn ytdl-btn-primary" id="ytdl-pause-resume">
                            ⏯️ <span id="ytdl-pause-text">Pause</span>
                        </button>
                        <button class="ytdl-btn ytdl-btn-danger" id="ytdl-clear-queue">
                            🗑️ Clear Queue
                        </button>
                        <button class="ytdl-btn ytdl-btn-secondary" id="ytdl-retry-failed">
                            🔄 Retry Failed
                        </button>
                    </div>

                    <div id="ytdl-queue-list"></div>
                </div>

                <!-- Settings Tab -->
                <div class="ytdl-tab-content" id="ytdl-settings-tab">
                    <div class="ytdl-setting">
                        <label>🌐 Download Endpoint</label>
                        <input type="text" id="ytdl-setting-endpoint" value="${CONFIG.endpoint}">
                    </div>

                    <div class="ytdl-setting">
                        <label>🎵 Format</label>
                        <select id="ytdl-setting-format">
                            <option value="mp3" ${CONFIG.format === 'mp3' ? 'selected' : ''}>MP3 (Audio)</option>
                            <option value="mp4" ${CONFIG.format === 'mp4' ? 'selected' : ''}>MP4 (Video)</option>
                            <option value="best" ${CONFIG.format === 'best' ? 'selected' : ''}>Best Quality</option>
                        </select>
                    </div>

                    <div class="ytdl-setting">
                        <label>⚡ Concurrent Downloads</label>
                        <input type="number" id="ytdl-setting-concurrent" min="1" max="10" value="${CONFIG.concurrentDownloads}">
                    </div>

                    <div class="ytdl-setting">
                        <label>⏱️ Delay Between Requests (ms)</label>
                        <input type="number" id="ytdl-setting-delay" min="0" max="10000" step="100" value="${CONFIG.delayBetweenRequests}">
                    </div>

                    <div class="ytdl-setting">
                        <div class="ytdl-checkbox-group">
                            <input type="checkbox" id="ytdl-setting-notifications" ${CONFIG.notifications ? 'checked' : ''}>
                            <label for="ytdl-setting-notifications">🔔 Enable Notifications</label>
                        </div>
                    </div>

                    <div class="ytdl-setting">
                        <div class="ytdl-checkbox-group">
                            <input type="checkbox" id="ytdl-setting-auto" ${CONFIG.autoDownload ? 'checked' : ''}>
                            <label for="ytdl-setting-auto">⚡ Auto-download on playlist load</label>
                        </div>
                    </div>

                    <button class="ytdl-btn ytdl-btn-primary" id="ytdl-save-settings" style="width: 100%; margin-top: 20px;">
                        💾 Save Settings
                    </button>

                    <div style="margin-top: 30px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px; color: white; font-size: 12px;">
                        <strong>📖 Instructions:</strong><br><br>
                        1. Make sure Hitomi Downloader is running<br>
                        2. Open a YouTube playlist<br>
                        3. Select videos you want to download<br>
                        4. Click "Download Selected"<br>
                        5. Monitor progress in Queue tab
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // Add event listeners with proper event delegation
        setupEventListeners();
    }

    // ==================== EVENT LISTENERS ====================
    function setupEventListeners() {
        // Toggle button
        document.getElementById('ytdl-toggle-btn').addEventListener('click', togglePanel);

        // Close button
        document.getElementById('ytdl-close').addEventListener('click', togglePanel);

        // Tabs
        document.querySelectorAll('.ytdl-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                switchTab(e.target.dataset.tab);
            });
        });

        // Search
        document.getElementById('ytdl-search-input').addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            updateVideoList();
        });

        // Video tab buttons
        document.getElementById('ytdl-refresh').addEventListener('click', refreshPlaylist);
        document.getElementById('ytdl-select-all').addEventListener('click', selectAll);
        document.getElementById('ytdl-deselect-all').addEventListener('click', deselectAll);
        document.getElementById('ytdl-download-selected').addEventListener('click', downloadSelected);

        // Queue tab buttons
        document.getElementById('ytdl-pause-resume').addEventListener('click', pauseResume);
        document.getElementById('ytdl-clear-queue').addEventListener('click', clearQueue);
        document.getElementById('ytdl-retry-failed').addEventListener('click', retryFailed);

        // Settings button
        document.getElementById('ytdl-save-settings').addEventListener('click', saveSettings);

        // Video list - use event delegation
        document.getElementById('ytdl-video-list').addEventListener('click', (e) => {
            const videoItem = e.target.closest('.ytdl-video-item');
            if (videoItem) {
                const videoId = videoItem.dataset.videoId;
                if (videoId) {
                    toggleVideo(videoId);
                }
            }
        });

        // Checkbox clicks
        document.getElementById('ytdl-video-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('ytdl-video-checkbox')) {
                e.stopPropagation();
                const videoId = e.target.dataset.videoId;
                if (videoId) {
                    toggleVideo(videoId);
                }
            }
        });
    }

    // ==================== INITIALIZATION ====================
    function init() {
        createUI();

        // Auto-detect playlist and refresh
        const observer = new MutationObserver(() => {
            const playlistPanel = document.querySelector('ytd-playlist-panel-renderer');
            if (playlistPanel && state.videos.length === 0) {
                setTimeout(refreshPlaylist, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial check
        setTimeout(() => {
            const playlistPanel = document.querySelector('ytd-playlist-panel-renderer');
            if (playlistPanel) {
                refreshPlaylist();
            }
        }, 2000);

        showToast('YT Downloader Pro loaded! 🚀', 'success');
    }

    // Start when page is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();