// ==UserScript==
// @name         GitHub AI Malware Detector
// @namespace    github-malware-detector
// @version      4.2
// @description  Detect and tag/hide potential AI-generated malware repositories on GitHub with shared blocklist
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      github.com
// @connect      api.github.com
// @connect      chacy.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[GHMD] v4.32 loaded');

    const CONFIG = {
        SYNC_LIST_ID: 'NNOsRB',
        SYNC_BASE_URL: 'http://chacy.com',
        SYNC_INTERVAL: 300000,
        API_CHECK_ENABLED: true,
        API_CHECK_RECURSIVE: false,
        API_MAX_DEPTH: 4,
        API_RATE_LIMIT_BUFFER: 10
    };

    const STORAGE_KEYS = {
        CACHE: 'ghmd_cache_v43',
        BLOCKLIST: 'ghmd_blocklist_v43',
        SETTINGS: 'ghmd_settings_v43',
        REMOTE_ITEMS: 'ghmd_remote_items_v43',
        LAST_SYNC: 'ghmd_last_sync_v43',
        API_RATE_REMAINING: 'ghmd_api_rate_v43'
    };

    const REASONS = {
        API_ZIP: { id: 'API_ZIP', label: 'API-ZIP', color: '#da3633', score: 50, desc: 'ZIP files found via API scan' },
        DOM_ZIP: { id: 'DOM_ZIP', label: 'DOM-ZIP', color: '#ff6b6b', score: 50, desc: 'ZIP files detected in repository file listing' },
        ZIP: { id: 'ZIP', label: 'ZIP', color: '#da3633', score: 30, desc: 'Contains .zip file links in README' },
        RAW_ZIP: { id: 'RAW_ZIP', label: 'RAW-ZIP', color: '#da3633', score: 45, desc: 'Direct raw .zip download links' },
        EMOJI: { id: 'EMOJI', label: 'EMOJI', color: '#9e6a03', score: 15, desc: 'Excessive emoji usage (>8)' },
        BOILERPLATE: { id: 'BOILERPLATE', label: 'BOILER', color: '#9e6a03', score: 15, desc: 'Generic boilerplate text detected' },
        NO_RELEASES: { id: 'NO_RELEASES', label: 'NO-REL', color: '#6e7681', score: 0, desc: 'No releases published' },
        ZERO_STARS: { id: 'ZERO_STARS', label: '0-STAR', color: '#6e7681', score: 0, desc: 'Repository has zero stars' },
        SINGLE_BRANCH: { id: 'SINGLE_BRANCH', label: '1-BRANCH', color: '#6e7681', score: 5, desc: 'Only one branch exists' },
        DOWNLOAD_SPAM: { id: 'DOWNLOAD_SPAM', label: 'DL-SPAM', color: '#da3633', score: 5, desc: 'Excessive download/install mentions' },
        SUSPICIOUS: { id: 'SUSPICIOUS', label: 'SUSPECT', color: '#da3633', score: 50, desc: 'Suspicious links (Telegram, Discord, etc.)' },
        FEW_CONTRIBUTORS: { id: 'FEW_CONTRIBUTORS', label: 'FEW-CONTRIB', color: '#6e7681', score: 0, desc: '1-2 contributors only' },
        EXE_LINK: { id: 'EXE_LINK', label: 'EXE', color: '#da3633', score: 15, desc: 'Contains .exe file links' },
        MULTI_ZIP: { id: 'MULTI_ZIP', label: 'MULTI-ZIP', color: '#da3633', score: 35, desc: 'Multiple ZIP files in repository' },
        README_ONLY_COMMIT: { id: 'README_ONLY_COMMIT', label: 'README-EDIT', color: '#d29922', score: 20, desc: 'Latest commit only edits README' },
        REF_NO_RELEASE: { id: 'REF_NO_RELEASE', label: 'REF-NO-REL', color: '#da3633', score: 20, desc: 'README references releases but none exist' },
        HIDDEN_ZIP: { id: 'HIDDEN_ZIP', label: 'HIDDEN-ZIP', color: '#da3633', score: 25, desc: 'ZIP files in subdirectories' },
        FRESH_ACCOUNT: { id: 'FRESH_ACCOUNT', label: 'FRESH', color: '#d29922', score: 10, desc: 'Repository owner account is very new' },
        OBFUSCATED: { id: 'OBFUSCATED', label: 'OBFUSC', color: '#da3633', score: 30, desc: 'Obfuscated or encoded content detected' }
    };

    const BOILERPLATE_PATTERNS = [
        /your-email@example\.com/i,
        /your-username/i,
        /download now/i,
        /getting started/i,
        /system requirements/i,
        /technologies used/i,
        /click here/i,
        /we are here to help/i,
        /feel free to/i,
        /enjoy your seamless/i,
        /additional information/i,
        /be sure to check back/i,
        /easy to use/i,
        /user-friendly/i,
        /📥 Download Link/i,
        /step-by-step/i
    ];

    const SUSPICIOUS_PATTERNS = [
        /password.*[:=]\s*\d+/i,
        /t3legram\.me/i,
        /d1scord\.gg/i,
        /bit\.ly\//i,
        /tinyurl\.com/i,
        /mediafire\.com/i,
        /mega\.nz/i,
        /Download & Install/i,
        /gofile\.io/i,
        /anonfiles\.com/i,
        /sendspace\.com/i,
        /zippyshare\.com/i
    ];

    const OBFUSCATION_PATTERNS = [
        /eval\s*\(\s*atob/i,
        /fromCharCode/i,
        /\\x[0-9a-f]{2}/i,
        /\\u[0-9a-f]{4}/i,
        /base64_decode/i,
        /exec\s*\(\s*base64/i
    ];

    let state = {
        cache: {},
        blocklist: { users: [], repos: [] },
        settings: {
            mode: 'tag',
            threshold: 40,
            enabledReasons: Object.keys(REASONS),
            autoBlockContributors: false,
            syncEnabled: true,
            autoSync: true,
            syncInterval: 5,
            uploadNewBlocks: true,
            showNotifications: true,
            panelPosition: 'right',
            panelCollapsed: false,
            darkMode: true,
            trustedStarThreshold: 2000,
            apiCheckEnabled: true,
            apiCheckRecursive: true,
            domZipCheckEnabled: true
        },
        remoteItems: {},
        lastSync: 0,
        processing: new Set(),
        scannedCount: 0,
        isScanning: false,
        isSyncing: false,
        currentRepo: null,
        activeTab: 'dashboard',
        syncStats: { uploaded: 0, downloaded: 0, lastSync: null },
        apiRateRemaining: 60,
        apiRateReset: 0
    };

    let syncInterval = null;

    // ==================== INITIALIZATION ====================

    function init() {
        console.log('[GHMD] Initializing...');
        loadState();
        injectStyles();
        createUI();

        if (state.settings.syncEnabled) {
            setTimeout(() => syncBlocklist(), 1000);
        }

        setupAutoSync();
        setTimeout(() => checkRepoPage(), 500);
        setTimeout(() => scanPage(), 800);
        setupObserver();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => checkRepoPage(), 300);
            }
        }).observe(document.body, { subtree: true, childList: true });
    }

    // ==================== DOM ZIP DETECTION ====================

    function parseZipFilesFromDOM(doc, baseUrl = '') {
        const zipFiles = [];
        const seenPaths = new Set();

        // Extract repo info from URL or document
        let repoBase = '';
        const urlMatch = baseUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (urlMatch) {
            repoBase = `/${urlMatch[1]}/${urlMatch[2]}`;
        }

        // Strategy 1: React Directory Rows (Modern GitHub UI)
        const directoryRows = doc.querySelectorAll('tr.react-directory-row');

        directoryRows.forEach(row => {
            // Skip parent directory row
            if (row.querySelector('[data-testid="up-tree"]')) return;

            // Find file links
            const linkSelectors = [
                '.react-directory-truncate a.Link--primary',
                '.react-directory-filename-cell a.Link--primary',
                'a.Link--primary[href*="/blob/"]'
            ];

            let link = null;
            for (const selector of linkSelectors) {
                link = row.querySelector(selector);
                if (link) break;
            }

            if (!link) return;

            const href = link.getAttribute('href') || '';
            const fileName = link.getAttribute('title') || link.textContent.trim();

            // Check if it's a ZIP file
            if (href.includes('/blob/') && fileName.toLowerCase().endsWith('.zip')) {
                // Exclude GitHub's archive downloads
                if (href.includes('/archive/') || href.includes('/zipball/')) return;

                const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);
                const filePath = pathMatch ? decodeURIComponent(pathMatch[1]) : fileName;

                if (!seenPaths.has(filePath)) {
                    seenPaths.add(filePath);
                    zipFiles.push({
                        name: fileName,
                        path: filePath,
                        href: href,
                        fullUrl: 'https://github.com' + href,
                        source: 'dom',
                        inSubdir: filePath.includes('/')
                    });
                }
            }
        });

        // Strategy 2: Table-based rows (fallback for older UI)
        if (directoryRows.length === 0) {
            const tableRows = doc.querySelectorAll('table tbody tr, div[role="row"]');

            tableRows.forEach(row => {
                if (row.querySelector('th')) return;

                const link = row.querySelector('a[href*="/blob/"]');
                if (!link) return;

                const href = link.getAttribute('href') || '';
                const fileName = link.getAttribute('title') || link.textContent.trim();

                if (fileName.toLowerCase().endsWith('.zip')) {
                    if (href.includes('/archive/')) return;

                    const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);
                    const filePath = pathMatch ? decodeURIComponent(pathMatch[1]) : fileName;

                    if (!seenPaths.has(filePath)) {
                        seenPaths.add(filePath);
                        zipFiles.push({
                            name: fileName,
                            path: filePath,
                            href: href,
                            fullUrl: 'https://github.com' + href,
                            source: 'dom',
                            inSubdir: filePath.includes('/')
                        });
                    }
                }
            });
        }

        // Strategy 3: Direct link search
        doc.querySelectorAll('a[href$=".zip"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (!href.includes('/blob/')) return;
            if (href.includes('/archive/') || href.includes('/releases/')) return;

            const fileName = link.getAttribute('title') || link.textContent.trim() || href.split('/').pop();
            const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);
            const filePath = pathMatch ? decodeURIComponent(pathMatch[1]) : fileName;

            if (!seenPaths.has(filePath)) {
                seenPaths.add(filePath);
                zipFiles.push({
                    name: fileName,
                    path: filePath,
                    href: href,
                    fullUrl: href.startsWith('http') ? href : 'https://github.com' + href,
                    source: 'dom',
                    inSubdir: filePath.includes('/')
                });
            }
        });

        // Strategy 4: JSON Payload (for SPA content)
        doc.querySelectorAll('script[type="application/json"]').forEach(script => {
            try {
                const jsonText = script.textContent;
                if (!jsonText.includes('.zip')) return;

                const data = JSON.parse(jsonText);
                extractZipFromPayload(data, zipFiles, seenPaths);
            } catch (e) {
                // Ignore parse errors
            }
        });

        return zipFiles;
    }

    function extractZipFromPayload(data, zipFiles, seenPaths) {
        if (!data || typeof data !== 'object') return;

        const processItem = (item) => {
            if (!item || typeof item !== 'object') return;

            if (item.name && item.path && item.contentType === 'file') {
                const name = item.name;
                const path = item.path;

                if (name.toLowerCase().endsWith('.zip') && !seenPaths.has(path)) {
                    seenPaths.add(path);
                    zipFiles.push({
                        name: name,
                        path: path,
                        size: item.size || 0,
                        source: 'dom-json',
                        inSubdir: path.includes('/')
                    });
                }
            }
        };

        const traverse = (obj) => {
            if (Array.isArray(obj)) {
                obj.forEach(item => {
                    processItem(item);
                    traverse(item);
                });
            } else if (obj && typeof obj === 'object') {
                processItem(obj);
                Object.values(obj).forEach(val => traverse(val));
            }
        };

        traverse(data);
    }

    // ==================== API ZIP DETECTION ====================

    async function checkRepoForZipFiles(owner, repo, path = '', depth = 0) {
        if (!state.settings.apiCheckEnabled) {
            return { zipFiles: [], error: null };
        }

        if (state.apiRateRemaining <= CONFIG.API_RATE_LIMIT_BUFFER) {
            log('API rate limit low, skipping API check');
            return { zipFiles: [], error: 'rate_limit' };
        }

        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: apiUrl,
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                },
                onload: async (response) => {
                    const rateRemaining = response.responseHeaders.match(/x-ratelimit-remaining:\s*(\d+)/i);
                    const rateReset = response.responseHeaders.match(/x-ratelimit-reset:\s*(\d+)/i);

                    if (rateRemaining) {
                        state.apiRateRemaining = parseInt(rateRemaining[1], 10);
                    }
                    if (rateReset) {
                        state.apiRateReset = parseInt(rateReset[1], 10) * 1000;
                    }

                    updateAPIRateDisplay();

                    if (response.status === 403) {
                        log('API rate limit reached');
                        resolve({ zipFiles: [], error: 'rate_limit' });
                        return;
                    }

                    if (response.status !== 200) {
                        resolve({ zipFiles: [], error: 'api_error' });
                        return;
                    }

                    try {
                        const contents = JSON.parse(response.responseText);

                        if (!Array.isArray(contents)) {
                            resolve({ zipFiles: [], error: null });
                            return;
                        }

                        let zipFiles = [];
                        let directories = [];

                        for (const item of contents) {
                            if (item.type === 'file' && item.name.toLowerCase().endsWith('.zip')) {
                                zipFiles.push({
                                    name: item.name,
                                    path: item.path,
                                    size: item.size,
                                    downloadUrl: item.download_url,
                                    source: 'api',
                                    inSubdir: item.path.includes('/')
                                });
                            } else if (item.type === 'dir' &&
                                       state.settings.apiCheckRecursive &&
                                       depth < CONFIG.API_MAX_DEPTH) {
                                directories.push(item.path);
                            }
                        }

                        for (const dir of directories) {
                            if (state.apiRateRemaining <= CONFIG.API_RATE_LIMIT_BUFFER) break;
                            const subResult = await checkRepoForZipFiles(owner, repo, dir, depth + 1);
                            zipFiles = zipFiles.concat(subResult.zipFiles);
                        }

                        resolve({ zipFiles, error: null });
                    } catch (e) {
                        resolve({ zipFiles: [], error: 'parse_error' });
                    }
                },
                onerror: () => {
                    resolve({ zipFiles: [], error: 'network_error' });
                },
                ontimeout: () => {
                    resolve({ zipFiles: [], error: 'timeout' });
                }
            });
        });
    }

    function updateAPIRateDisplay() {
        const el = document.getElementById('ghmd-api-rate');
        if (el) {
            const color = state.apiRateRemaining > 30 ? '#3fb950' :
                         state.apiRateRemaining > 10 ? '#d29922' : '#f85149';
            el.innerHTML = `<span style="color:${color}">${state.apiRateRemaining}/60</span>`;
        }
    }

    // ==================== SYNC FUNCTIONS ====================

    function setupAutoSync() {
        if (syncInterval) clearInterval(syncInterval);

        if (state.settings.autoSync && state.settings.syncEnabled) {
            const interval = (state.settings.syncInterval || 5) * 60 * 1000;
            syncInterval = setInterval(() => syncBlocklist(), interval);
            console.log('[GHMD] Auto-sync enabled, interval:', interval / 1000, 'seconds');
        }
    }

    function syncBlocklist() {
        if (state.isSyncing) {
            log('Sync already in progress');
            return;
        }

        state.isSyncing = true;
        updateSyncStatus('syncing');
        log('Fetching community list...');

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.SYNC_BASE_URL}/output-list.php?id=${CONFIG.SYNC_LIST_ID}&last_pull=0`,
            headers: {
                'Accept': '*/*',
                'X-Requested-With': 'XMLHttpRequest'
            },
            onload: (response) => {
                state.isSyncing = false;

                if (response.status !== 200) {
                    log('Sync failed: HTTP ' + response.status);
                    updateSyncStatus('error');
                    return;
                }

                const items = parseRemoteList(response.responseText);

                items.forEach(item => {
                    state.remoteItems[item.username] = {
                        itemId: item.itemId,
                        votes: item.votes,
                        synced: true
                    };
                });

                state.lastSync = Date.now();
                state.syncStats.downloaded = items.length;
                state.syncStats.lastSync = new Date().toLocaleString();

                saveState();
                updateSyncStatus('success');
                renderBlocklist();
                updateStats();

                log(`Synced: ${items.length} community entries`);
                reapplyAll();
            },
            onerror: (err) => {
                state.isSyncing = false;
                log('Sync error: ' + (err.message || 'Network error'));
                updateSyncStatus('error');
            }
        });
    }

    function parseRemoteList(html) {
        const items = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<ul>${html}</ul>`, 'text/html');

        doc.querySelectorAll('li').forEach(li => {
            let itemId = null;
            const voteLink = li.querySelector('a.vote_up, a[class*="vote_up"]');

            if (voteLink) {
                const onclick = voteLink.getAttribute('onclick') || '';
                const match = onclick.match(/vote\s*\(\s*this\s*,\s*(\d+)/);
                if (match) itemId = match[1];
            }

            if (!itemId) {
                const delLink = li.querySelector('a[onclick*="deleteItem"]');
                if (delLink) {
                    const onclick = delLink.getAttribute('onclick') || '';
                    const match = onclick.match(/deleteItem\s*\(\s*(\d+)/);
                    if (match) itemId = match[1];
                }
            }

            const titleEl = li.querySelector('.item_title');
            const username = titleEl?.textContent?.trim();

            const voteEl = li.querySelector('.vote_total');
            let votes = 0;
            if (voteEl) {
                const voteText = voteEl.textContent.trim();
                const parsed = parseInt(voteText, 10);
                votes = isNaN(parsed) ? 0 : parsed;
            }

            if (username && itemId) {
                items.push({ username, itemId, votes });
            } else if (username) {
                items.push({ username, itemId: null, votes });
            }
        });

        return items;
    }

    function uploadToRemote(username) {
        if (!state.settings.uploadNewBlocks || !state.settings.syncEnabled) return;

        if (state.remoteItems[username]) {
            upvoteRemote(username);
            return;
        }

        log(`Uploading ${username} to community blocklist...`);

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.SYNC_BASE_URL}/add-item.php?list_id=${CONFIG.SYNC_LIST_ID}&title=${encodeURIComponent(username)}`,
            headers: {
                'Accept': '*/*',
                'X-Requested-With': 'XMLHttpRequest'
            },
            onload: (response) => {
                if (response.responseText.includes('Added')) {
                    log(`Uploaded ${username}`);
                    state.syncStats.uploaded++;
                    if (state.settings.showNotifications) {
                        showNotification(`Shared ${username} with community`);
                    }
                    setTimeout(() => syncBlocklist(), 2000);
                }
            }
        });
    }

    function upvoteRemote(username) {
        const item = state.remoteItems[username];
        if (!item || !item.itemId) return;

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.SYNC_BASE_URL}/vote.php?item_id=${item.itemId}&vote=1`,
            headers: {
                'Accept': '*/*',
                'X-Requested-With': 'XMLHttpRequest'
            },
            onload: () => {
                if (state.remoteItems[username]) {
                    state.remoteItems[username].votes++;
                    saveState();
                }
            }
        });
    }

    function updateSyncStatus(status) {
        const indicator = document.getElementById('ghmd-sync-indicator');
        if (!indicator) return;

        switch (status) {
            case 'syncing':
                indicator.textContent = 'Syncing...';
                indicator.style.color = '#58a6ff';
                break;
            case 'success':
                indicator.textContent = 'Synced';
                indicator.style.color = '#3fb950';
                setTimeout(() => {
                    if (indicator) {
                        indicator.textContent = `Last: ${new Date().toLocaleTimeString()}`;
                        indicator.style.color = '#8b949e';
                    }
                }, 2000);
                break;
            case 'error':
                indicator.textContent = 'Sync failed';
                indicator.style.color = '#f85149';
                break;
        }
    }

    function showNotification(message) {
        const notif = document.createElement('div');
        notif.className = 'ghmd-notification';
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => notif.classList.add('show'), 10);
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }

    // ==================== REPO PAGE ANALYSIS ====================

    function checkRepoPage() {
        const pathMatch = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
        if (!pathMatch) return;

        const owner = pathMatch[1];
        const repo = pathMatch[2];

        const excludedOwners = ['topics', 'explore', 'trending', 'search', 'collections',
                                'sponsors', 'marketplace', 'events', 'notifications',
                                'settings', 'new', 'login', 'signup', 'orgs'];
        if (excludedOwners.includes(owner)) return;

        const excludedPaths = ['issues', 'pulls', 'actions', 'projects', 'wiki',
                               'security', 'pulse', 'settings', 'discussions'];
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length > 2 && excludedPaths.includes(pathParts[2])) return;

        const repoHeader = document.querySelector('[itemprop="name"]');
        if (!repoHeader) return;

        const fullName = `${owner}/${repo}`;
        state.currentRepo = { owner, repo, fullName };

        runAPICheckForRepo(owner, repo, fullName);
        showRepoAnalysis(fullName);
    }

    async function runAPICheckForRepo(owner, repo, fullName) {
        if (!state.settings.apiCheckEnabled) return;

        if (state.cache[fullName]?.apiChecked) return;

        log(`Running API check for ${fullName}...`);

        const result = await checkRepoForZipFiles(owner, repo);

        if (result.error) {
            log(`API check error: ${result.error}`);
            return;
        }

        if (!state.cache[fullName]) {
            state.cache[fullName] = {
                score: 0,
                reasons: [],
                contributors: [owner],
                stars: 0,
                ts: Date.now()
            };
        }

        state.cache[fullName].apiChecked = true;
        state.cache[fullName].apiZipFiles = result.zipFiles;

        if (result.zipFiles.length > 0) {
            if (!state.cache[fullName].reasons.includes('API_ZIP')) {
                state.cache[fullName].reasons.push('API_ZIP');
                state.cache[fullName].score += REASONS.API_ZIP.score;
            }

            // Check for hidden ZIPs in subdirectories
            const hiddenZips = result.zipFiles.filter(f => f.inSubdir);
            if (hiddenZips.length > 0 && !state.cache[fullName].reasons.includes('HIDDEN_ZIP')) {
                state.cache[fullName].reasons.push('HIDDEN_ZIP');
                state.cache[fullName].score += REASONS.HIDDEN_ZIP.score;
            }

            if (result.zipFiles.length > 2 && !state.cache[fullName].reasons.includes('MULTI_ZIP')) {
                state.cache[fullName].reasons.push('MULTI_ZIP');
                state.cache[fullName].score += REASONS.MULTI_ZIP.score;
            }

            log(`Found ${result.zipFiles.length} ZIP file(s) in ${fullName}`);
        }

        saveState();
        showRepoAnalysis(fullName);
    }

    function showRepoAnalysis(fullName) {
        setTimeout(() => {
            const sidebar = document.querySelector('.Layout-sidebar, [data-pjax-container]');
            if (!sidebar) return;

            const existing = document.getElementById('ghmd-repo-analysis');
            if (existing) existing.remove();

            const analysis = state.cache[fullName];
            const isBlocked = state.blocklist.users.includes(state.currentRepo.owner);
            const remoteInfo = state.remoteItems[state.currentRepo.owner];
            const isTrusted = analysis && analysis.stars >= state.settings.trustedStarThreshold;

            if (!analysis && !isBlocked && !remoteInfo) return;

            const container = document.createElement('div');
            container.id = 'ghmd-repo-analysis';
            container.className = 'ghmd-repo-panel';

            // Combine all ZIP files for display
            let allZipFiles = [];
            if (analysis) {
                if (analysis.apiZipFiles) allZipFiles = allZipFiles.concat(analysis.apiZipFiles);
                if (analysis.domZipFiles) allZipFiles = allZipFiles.concat(analysis.domZipFiles);
            }

            // Deduplicate by path
            const seenPaths = new Set();
            allZipFiles = allZipFiles.filter(f => {
                if (seenPaths.has(f.path)) return false;
                seenPaths.add(f.path);
                return true;
            });

            let content = `
                <div class="ghmd-repo-header">
                    <span class="ghmd-repo-icon">🛡️</span>
                    <span class="ghmd-repo-title">Malware Analysis</span>
                </div>
            `;

            if (isTrusted) {
                content += `
                    <div class="ghmd-badge ghmd-badge-trusted">
                        <span>✓ Trusted Repository</span>
                        <span class="ghmd-badge-value">${formatStarCount(analysis.stars)} stars</span>
                    </div>
                `;
            }

            if (remoteInfo) {
                content += `
                    <div class="ghmd-badge ghmd-badge-community">
                        <span>ℹ️ Community Data</span>
                        <span class="ghmd-badge-value">${remoteInfo.votes} votes</span>
                    </div>
                `;
            }

            if (isBlocked) {
                content += `
                    <div class="ghmd-badge ghmd-badge-blocked">
                        <span>🚫 USER BLOCKED</span>
                    </div>
                    <button class="ghmd-btn ghmd-btn-full" id="ghmd-unblock-user">Unblock ${state.currentRepo.owner}</button>
                `;
            } else if (analysis) {
                const score = analysis.score || 0;
                const scoreClass = isTrusted ? 'trusted' : (score >= 50 ? 'danger' : score >= 30 ? 'warning' : 'safe');

                content += `
                    <div class="ghmd-score ghmd-score-${scoreClass}">
                        <span class="ghmd-score-value">${score}</span>
                        <span class="ghmd-score-label">${isTrusted ? 'Trusted' : 'Risk Score'}</span>
                    </div>
                `;

                if (allZipFiles.length > 0) {
                    content += `
                        <div class="ghmd-section">
                            <div class="ghmd-section-title">⚠️ ZIP Files Found (${allZipFiles.length})</div>
                            <div class="ghmd-zip-list">
                    `;
                    allZipFiles.forEach(file => {
                        const sourceLabel = file.source === 'api' ? 'API' : file.source === 'dom-json' ? 'DOM' : 'DOM';
                        const subdirIcon = file.inSubdir ? '📁' : '📄';
                        content += `
                            <div class="ghmd-zip-item">
                                <span class="ghmd-zip-name">${subdirIcon} ${escapeHtml(file.name)}</span>
                                <span class="ghmd-zip-meta">
                                    <span class="ghmd-zip-source">${sourceLabel}</span>
                                    ${file.size ? `<span class="ghmd-zip-size">${formatSize(file.size)}</span>` : ''}
                                </span>
                            </div>
                        `;
                    });
                    content += `</div></div>`;
                }

                content += `
                    <div class="ghmd-section">
                        <div class="ghmd-section-title">Detection Flags</div>
                        <div class="ghmd-flags">
                `;

                if (analysis.reasons && analysis.reasons.length > 0) {
                    analysis.reasons.forEach(reasonKey => {
                        const reason = REASONS[reasonKey];
                        if (reason) {
                            content += `<span class="ghmd-flag" style="background:${reason.color}${isTrusted ? ';opacity:0.5' : ''}" title="${reason.desc}">${reason.label} +${reason.score}</span>`;
                        }
                    });
                } else {
                    content += `<span class="ghmd-no-flags">No issues detected</span>`;
                }

                content += `</div></div>`;

                if (analysis.stars !== undefined) {
                    content += `<div class="ghmd-info-row"><span>Stars:</span><span>${formatStarCount(analysis.stars)}${isTrusted ? ' ✓' : ''}</span></div>`;
                }

                if (analysis.latestCommit) {
                    content += `<div class="ghmd-info-row"><span>Latest Commit:</span><span>${escapeHtml(analysis.latestCommit)}</span></div>`;
                }

                if (analysis.contributors && analysis.contributors.length > 0) {
                    content += `
                        <div class="ghmd-section">
                            <div class="ghmd-section-title">Contributors (${analysis.contributors.length})</div>
                            <div class="ghmd-contributors">
                    `;
                    analysis.contributors.slice(0, 10).forEach(user => {
                        const isUserBlocked = state.blocklist.users.includes(user);
                        const userRemoteInfo = state.remoteItems[user];
                        content += `
                            <div class="ghmd-contributor">
                                <a href="/${user}" target="_blank">${user}</a>
                                <span>
                                    ${userRemoteInfo ? `<span class="ghmd-vote-small">${userRemoteInfo.votes}</span>` : ''}
                                    ${isUserBlocked ? '<span class="ghmd-blocked-tag">BLOCKED</span>' : ''}
                                </span>
                            </div>
                        `;
                    });
                    content += `</div></div>`;
                }

                content += `<div class="ghmd-actions-row">`;
                if (!state.blocklist.users.includes(state.currentRepo.owner)) {
                    content += `<button class="ghmd-btn ghmd-btn-danger" id="ghmd-block-owner">Block ${state.currentRepo.owner}</button>`;
                }
                if (analysis.contributors && analysis.contributors.length > 1) {
                    content += `<button class="ghmd-btn ghmd-btn-purple" id="ghmd-block-all-contrib">Block All (${analysis.contributors.length})</button>`;
                }
                content += `<button class="ghmd-btn ghmd-btn-secondary" id="ghmd-remove-cache">Clear</button>`;
                content += `</div>`;
            }

            container.innerHTML = content;

            const aboutSection = sidebar.querySelector('.BorderGrid-row, .Layout-sidebar > div:first-child');
            if (aboutSection) {
                aboutSection.parentNode.insertBefore(container, aboutSection);
            } else {
                sidebar.insertBefore(container, sidebar.firstChild);
            }

            bindRepoAnalysisEvents(fullName);
        }, 1000);
    }

    function bindRepoAnalysisEvents(fullName) {
        const analysis = state.cache[fullName];

        document.getElementById('ghmd-unblock-user')?.addEventListener('click', () => {
            state.blocklist.users = state.blocklist.users.filter(u => u !== state.currentRepo.owner);
            saveState();
            renderBlocklist();
            updateStats();
            log('Unblocked: ' + state.currentRepo.owner);
            showRepoAnalysis(fullName);
            reapplyAll();
        });

        document.getElementById('ghmd-block-owner')?.addEventListener('click', () => {
            blockUser(state.currentRepo.owner);
            showRepoAnalysis(fullName);
        });

        document.getElementById('ghmd-block-all-contrib')?.addEventListener('click', () => {
            if (analysis) {
                blockContributors(analysis.contributors, fullName);
                showRepoAnalysis(fullName);
            }
        });

        document.getElementById('ghmd-remove-cache')?.addEventListener('click', () => {
            delete state.cache[fullName];
            saveState();
            updateStats();
            log('Removed from cache: ' + fullName);
            document.getElementById('ghmd-repo-analysis')?.remove();
        });
    }

    // ==================== UTILITY FUNCTIONS ====================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatStarCount(stars) {
        if (stars >= 1000000) {
            return (stars / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        } else if (stars >= 1000) {
            return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        }
        return stars.toString();
    }

    function blockUser(username) {
        if (!state.blocklist.users.includes(username)) {
            state.blocklist.users.push(username);
            saveState();
            renderBlocklist();
            updateStats();
            log('Blocked: ' + username);
            uploadToRemote(username);
            reapplyAll();
        }
    }

    function blockContributors(contributors, repoName) {
        if (!contributors || contributors.length === 0) return;

        let blocked = 0;
        contributors.forEach(user => {
            if (!state.blocklist.users.includes(user)) {
                state.blocklist.users.push(user);
                uploadToRemote(user);
                blocked++;
            }
        });

        if (blocked > 0) {
            saveState();
            renderBlocklist();
            updateStats();
            log(`Blocked ${blocked} contributors from ${repoName}`);
        }
    }

    function loadState() {
        try {
            state.cache = JSON.parse(GM_getValue(STORAGE_KEYS.CACHE, '{}'));
            state.blocklist = JSON.parse(GM_getValue(STORAGE_KEYS.BLOCKLIST, '{"users":[],"repos":[]}'));
            state.remoteItems = JSON.parse(GM_getValue(STORAGE_KEYS.REMOTE_ITEMS, '{}'));
            state.lastSync = parseInt(GM_getValue(STORAGE_KEYS.LAST_SYNC, '0')) || 0;
            state.apiRateRemaining = parseInt(GM_getValue(STORAGE_KEYS.API_RATE_REMAINING, '60')) || 60;

            const saved = GM_getValue(STORAGE_KEYS.SETTINGS, null);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.settings = { ...state.settings, ...parsed };

                // Ensure new reasons are enabled by default
                const allReasons = Object.keys(REASONS);
                allReasons.forEach(reason => {
                    if (!state.settings.enabledReasons.includes(reason)) {
                        state.settings.enabledReasons.push(reason);
                        console.log('[GHMD] Added new detection rule:', reason);
                    }
                });
            }

            if (typeof state.settings.trustedStarThreshold !== 'number') {
                state.settings.trustedStarThreshold = 2000;
            }

            if (typeof state.settings.domZipCheckEnabled !== 'boolean') {
                state.settings.domZipCheckEnabled = true;
            }

            console.log('[GHMD] Loaded - cache:', Object.keys(state.cache).length,
                        'blocked:', state.blocklist.users.length,
                        'community:', Object.keys(state.remoteItems).length);
        } catch (e) {
            console.error('[GHMD] Load error', e);
        }
    }

    function saveState() {
        GM_setValue(STORAGE_KEYS.CACHE, JSON.stringify(state.cache));
        GM_setValue(STORAGE_KEYS.BLOCKLIST, JSON.stringify(state.blocklist));
        GM_setValue(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        GM_setValue(STORAGE_KEYS.REMOTE_ITEMS, JSON.stringify(state.remoteItems));
        GM_setValue(STORAGE_KEYS.LAST_SYNC, state.lastSync.toString());
        GM_setValue(STORAGE_KEYS.API_RATE_REMAINING, state.apiRateRemaining.toString());
    }

    // ==================== STYLES ====================

    function injectStyles() {
        GM_addStyle(`
            /* ===== MAIN PANEL ===== */
            #ghmd-panel {
                position: fixed;
                top: 60px;
                right: 10px;
                background: #0d1117;
                border: 1px solid #30363d;
                border-radius: 8px;
                z-index: 99999;
                font-size: 11px;
                color: #c9d1d9;
                width: 340px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                max-height: 85vh;
                display: flex;
                flex-direction: column;
            }
            #ghmd-panel.ghmd-left { right: auto; left: 10px; }

            /* ===== HEADER ===== */
            #ghmd-header {
                padding: 12px 16px;
                background: #161b22;
                border-bottom: 1px solid #30363d;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #ghmd-header h3 {
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                color: #f0f6fc;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ghmd-header-icon {
                width: 18px;
                height: 18px;
                background: #238636;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
            }
            .ghmd-header-actions { display: flex; gap: 4px; }
            .ghmd-header-btn {
                background: #21262d;
                border: 1px solid #30363d;
                color: #8b949e;
                width: 28px;
                height: 28px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ghmd-header-btn:hover { background: #30363d; color: #f0f6fc; }

            /* ===== TABS ===== */
            #ghmd-tabs {
                display: flex;
                background: #161b22;
                border-bottom: 1px solid #30363d;
                padding: 0;
            }
            .ghmd-tab {
                flex: 1;
                padding: 10px 8px;
                cursor: pointer;
                color: #8b949e;
                font-size: 10px;
                font-weight: 500;
                text-align: center;
                border-bottom: 2px solid transparent;
                transition: all 0.15s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .ghmd-tab:hover { color: #c9d1d9; background: rgba(255,255,255,0.02); }
            .ghmd-tab.active {
                color: #58a6ff;
                border-bottom-color: #58a6ff;
                background: rgba(88,166,255,0.05);
            }

            /* ===== TAB CONTENT ===== */
            #ghmd-tab-content {
                flex: 1;
                overflow-y: auto;
                padding: 14px;
            }
            .ghmd-tab-panel { display: none; }
            .ghmd-tab-panel.active { display: block; }

            /* ===== STATS GRID ===== */
            .ghmd-stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
                margin-bottom: 14px;
            }
            .ghmd-stat-card {
                background: #161b22;
                padding: 14px 12px;
                border-radius: 6px;
                text-align: center;
                border: 1px solid #21262d;
            }
            .ghmd-stat-value {
                font-size: 22px;
                font-weight: 700;
                color: #58a6ff;
                font-variant-numeric: tabular-nums;
            }
            .ghmd-stat-label {
                font-size: 9px;
                color: #8b949e;
                margin-top: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* ===== API RATE INDICATOR ===== */
            .ghmd-api-rate-bar {
                background: #161b22;
                border: 1px solid #21262d;
                border-radius: 6px;
                padding: 10px 12px;
                margin-bottom: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 10px;
            }
            .ghmd-api-rate-label { color: #8b949e; }

            /* ===== SYNC BAR ===== */
            .ghmd-sync-bar {
                background: #161b22;
                padding: 10px 12px;
                border-radius: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                border: 1px solid #21262d;
            }
            .ghmd-sync-btn {
                background: #238636;
                color: #fff;
                border: none;
                padding: 6px 14px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .ghmd-sync-btn:hover { background: #2ea043; }
            .ghmd-sync-btn:disabled { background: #21262d; color: #8b949e; cursor: not-allowed; }

            /* ===== MODE BUTTONS ===== */
            .ghmd-mode-btns { display: flex; gap: 6px; margin: 10px 0; }
            .ghmd-mode-btns button {
                flex: 1;
                background: #21262d;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 10px 8px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                transition: all 0.15s;
            }
            .ghmd-mode-btns button:hover { background: #30363d; border-color: #484f58; }
            .ghmd-mode-btns button.ghmd-active {
                background: #238636;
                border-color: #238636;
                color: #fff;
            }

            /* ===== REASON FILTERS ===== */
            .ghmd-reason-filters {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin: 10px 0;
            }
            .ghmd-reason-chip {
                font-size: 9px;
                padding: 5px 8px;
                border-radius: 4px;
                cursor: pointer;
                opacity: 0.35;
                border: 1px solid transparent;
                transition: all 0.15s;
                font-weight: 600;
                color: #fff;
            }
            .ghmd-reason-chip:hover { opacity: 0.6; }
            .ghmd-reason-chip.active { opacity: 1; border-color: rgba(255,255,255,0.2); }

            /* ===== SECTIONS ===== */
            .ghmd-section { margin-bottom: 16px; }
            .ghmd-section-header {
                font-size: 10px;
                font-weight: 600;
                color: #8b949e;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 6px;
                border-bottom: 1px solid #21262d;
            }

            /* ===== INFO BOX ===== */
            .ghmd-info-box {
                background: #161b22;
                border: 1px solid #30363d;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 14px;
                font-size: 10px;
                color: #8b949e;
                line-height: 1.5;
            }
            .ghmd-info-box strong { color: #c9d1d9; }

            /* ===== BLOCKLIST ===== */
            .ghmd-blocklist { max-height: 300px; overflow-y: auto; }
            .ghmd-blocklist-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                background: #161b22;
                margin: 4px 0;
                border-radius: 6px;
                border: 1px solid #21262d;
                transition: border-color 0.15s;
            }
            .ghmd-blocklist-item:hover { border-color: #30363d; }
            .ghmd-blocklist-user { display: flex; align-items: center; gap: 8px; }
            .ghmd-blocklist-votes {
                color: #8957e5;
                font-size: 10px;
                font-weight: 600;
            }
            .ghmd-blocklist-remove {
                color: #f85149;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                transition: background 0.15s;
            }
            .ghmd-blocklist-remove:hover { background: rgba(248, 81, 73, 0.15); }

            /* ===== SETTINGS ===== */
            .ghmd-setting {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #21262d;
            }
            .ghmd-setting:last-child { border-bottom: none; }
            .ghmd-setting-label { display: flex; flex-direction: column; flex: 1; }
            .ghmd-setting-title { font-weight: 500; color: #c9d1d9; font-size: 11px; }
            .ghmd-setting-desc { font-size: 10px; color: #6e7681; margin-top: 3px; }

            .ghmd-toggle {
                position: relative;
                width: 40px;
                height: 22px;
                background: #21262d;
                border-radius: 11px;
                cursor: pointer;
                transition: background 0.2s;
                flex-shrink: 0;
            }
            .ghmd-toggle.active { background: #238636; }
            .ghmd-toggle::after {
                content: '';
                position: absolute;
                top: 3px;
                left: 3px;
                width: 16px;
                height: 16px;
                background: #fff;
                border-radius: 50%;
                transition: left 0.2s;
            }
            .ghmd-toggle.active::after { left: 21px; }

            .ghmd-input {
                background: #0d1117;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px 10px;
                border-radius: 6px;
                font-size: 11px;
                width: 70px;
                text-align: center;
            }
            .ghmd-input:focus { outline: none; border-color: #58a6ff; }

            /* ===== LOG ===== */
            .ghmd-log {
                max-height: 240px;
                overflow-y: auto;
                font-size: 10px;
                background: #0d1117;
                padding: 12px;
                border-radius: 6px;
                font-family: 'SF Mono', Monaco, Consolas, monospace;
                border: 1px solid #21262d;
            }
            .ghmd-log-entry {
                padding: 4px 0;
                border-bottom: 1px solid #161b22;
                line-height: 1.4;
            }
            .ghmd-log-time { color: #484f58; }

            /* ===== BUTTONS ===== */
            .ghmd-btn {
                background: #21262d;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 500;
                transition: all 0.15s;
            }
            .ghmd-btn:hover { background: #30363d; border-color: #484f58; }
            .ghmd-btn-primary { background: #238636; border-color: #238636; color: #fff; }
            .ghmd-btn-primary:hover { background: #2ea043; }
            .ghmd-btn-danger { background: #da3633; border-color: #da3633; color: #fff; }
            .ghmd-btn-danger:hover { background: #f85149; }
            .ghmd-btn-purple { background: #8957e5; border-color: #8957e5; color: #fff; }
            .ghmd-btn-purple:hover { background: #a371f7; }
            .ghmd-btn-secondary { background: #21262d; }
            .ghmd-btn-full { width: 100%; margin-top: 8px; }
            .ghmd-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }

            /* ===== SEARCH ===== */
            .ghmd-search {
                width: 100%;
                background: #0d1117;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 10px 12px;
                border-radius: 6px;
                font-size: 11px;
                margin-bottom: 12px;
                box-sizing: border-box;
            }
            .ghmd-search:focus { outline: none; border-color: #58a6ff; }
            .ghmd-search::placeholder { color: #484f58; }

            /* ===== MINIMIZED STATE ===== */
            #ghmd-panel.ghmd-minimized #ghmd-tabs,
            #ghmd-panel.ghmd-minimized #ghmd-tab-content { display: none; }
            #ghmd-panel.ghmd-minimized { width: auto; min-width: 180px; }

            /* ===== REPO PAGE PANEL ===== */
            .ghmd-repo-panel {
                border: 1px solid #30363d;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
                background: #0d1117;
                color: #c9d1d9;
                font-size: 12px;
            }
            .ghmd-repo-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 14px;
                font-weight: 600;
                font-size: 13px;
                color: #f0f6fc;
            }
            .ghmd-repo-icon {
                font-size: 16px;
            }
            .ghmd-badge {
                padding: 8px 12px;
                border-radius: 6px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                font-weight: 500;
            }
            .ghmd-badge-value { font-weight: 700; }
            .ghmd-badge-trusted { background: #238636; color: #fff; }
            .ghmd-badge-community { background: #8957e5; color: #fff; }
            .ghmd-badge-blocked { background: #da3633; color: #fff; justify-content: center; font-weight: 700; }

            .ghmd-score {
                text-align: center;
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 14px;
            }
            .ghmd-score-value { font-size: 32px; font-weight: 700; display: block; }
            .ghmd-score-label { font-size: 10px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; }
            .ghmd-score-danger { background: #da3633; color: #fff; }
            .ghmd-score-warning { background: #9e6a03; color: #fff; }
            .ghmd-score-safe { background: #238636; color: #fff; }
            .ghmd-score-trusted { background: #238636; color: #fff; }

            .ghmd-section-title {
                font-size: 10px;
                font-weight: 600;
                color: #8b949e;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
            }
            .ghmd-flags { display: flex; flex-wrap: wrap; gap: 4px; }
            .ghmd-flag {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 9px;
                font-weight: 600;
                color: #fff;
            }
            .ghmd-no-flags { color: #6e7681; font-size: 11px; }

            .ghmd-zip-list {
                background: #161b22;
                border-radius: 6px;
                padding: 8px;
                max-height: 120px;
                overflow-y: auto;
            }
            .ghmd-zip-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 8px;
                border-bottom: 1px solid #21262d;
                font-size: 10px;
            }
            .ghmd-zip-item:last-child { border-bottom: none; }
            .ghmd-zip-name { color: #f85149; font-weight: 500; flex: 1; }
            .ghmd-zip-meta { display: flex; gap: 8px; align-items: center; }
            .ghmd-zip-source {
                background: #30363d;
                color: #8b949e;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 8px;
                font-weight: 600;
            }
            .ghmd-zip-size { color: #6e7681; }

            .ghmd-info-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #21262d;
                font-size: 11px;
            }
            .ghmd-contributors {
                background: #161b22;
                border-radius: 6px;
                padding: 8px;
                max-height: 140px;
                overflow-y: auto;
            }
            .ghmd-contributor {
                display: flex;
                justify-content: space-between;
                padding: 6px 8px;
                border-bottom: 1px solid #21262d;
                font-size: 11px;
            }
            .ghmd-contributor:last-child { border-bottom: none; }
            .ghmd-contributor a { color: #58a6ff; text-decoration: none; }
            .ghmd-contributor a:hover { text-decoration: underline; }
            .ghmd-vote-small { color: #8957e5; font-size: 9px; margin-right: 6px; }
            .ghmd-blocked-tag { color: #f85149; font-size: 9px; font-weight: 600; }

            .ghmd-actions-row {
                display: flex;
                gap: 6px;
                margin-top: 14px;
                flex-wrap: wrap;
            }
            .ghmd-actions-row .ghmd-btn { flex: 1; min-width: 80px; text-align: center; }

            /* ===== ARTICLE TAGS ===== */
            .ghmd-tags {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 3px;
                margin-left: 8px;
                vertical-align: middle;
            }
            .ghmd-tag {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 600;
                color: #fff;
                cursor: pointer;
            }
            .ghmd-tag:hover { opacity: 0.85; }
            .ghmd-tag.ghmd-trusted { background: #238636 !important; }

            .ghmd-vote-indicator {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 600;
                color: #8957e5;
                background: rgba(137, 87, 229, 0.12);
            }
            .ghmd-trusted-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 600;
                color: #3fb950;
                background: rgba(63, 185, 80, 0.12);
            }

            .ghmd-hidden { display: none !important; }
            .ghmd-dimmed { opacity: 0.2; }
            .ghmd-flagged { position: relative; }
            .ghmd-flagged::before {
                content: '';
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 3px;
                background: #da3633;
                border-radius: 3px 0 0 3px;
            }

            .ghmd-actions {
                display: inline-flex;
                gap: 4px;
                margin-left: 8px;
                vertical-align: middle;
            }
            .ghmd-action-btn {
                font-size: 9px;
                padding: 3px 8px;
                border-radius: 4px;
                cursor: pointer;
                border: none;
                color: #fff;
                font-weight: 500;
            }
            .ghmd-btn-block { background: #da3633; }
            .ghmd-btn-block:hover { background: #f85149; }
            .ghmd-btn-block-all { background: #8957e5; }
            .ghmd-btn-block-all:hover { background: #a371f7; }

            /* ===== MODAL ===== */
            #ghmd-modal {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ghmd-modal-backdrop {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.75);
            }
            .ghmd-modal-content {
                position: relative;
                background: #0d1117;
                border: 1px solid #30363d;
                border-radius: 12px;
                max-width: 560px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
                z-index: 1;
            }
            .ghmd-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #30363d;
                background: #161b22;
                border-radius: 12px 12px 0 0;
            }
            .ghmd-modal-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: #f0f6fc;
            }
            .ghmd-modal-close {
                background: #21262d;
                border: 1px solid #30363d;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                color: #8b949e;
                padding: 0;
                width: 32px;
                height: 32px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ghmd-modal-close:hover { background: #30363d; color: #f0f6fc; }
            .ghmd-modal-body { padding: 20px; color: #c9d1d9; }

            /* ===== NOTIFICATION ===== */
            .ghmd-notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #238636;
                color: #fff;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 500;
                z-index: 999999;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            }
            .ghmd-notification.show { opacity: 1; transform: translateY(0); }
        `);
    }

    // ==================== UI CREATION ====================

    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'ghmd-panel';
        if (state.settings.panelPosition === 'left') panel.classList.add('ghmd-left');
        if (state.settings.panelCollapsed) panel.classList.add('ghmd-minimized');

        panel.innerHTML = `
            <div id="ghmd-header">
                <h3>
                    <span class="ghmd-header-icon">MD</span>
                    <span>Malware Detector</span>
                </h3>
                <div class="ghmd-header-actions">
                    <button class="ghmd-header-btn" id="ghmd-toggle-position" title="Move panel">⇄</button>
                    <button class="ghmd-header-btn" id="ghmd-toggle" title="Minimize">_</button>
                </div>
            </div>

            <div id="ghmd-tabs">
                <div class="ghmd-tab active" data-tab="dashboard">Dashboard</div>
                <div class="ghmd-tab" data-tab="blocklist">Blocklist</div>
                <div class="ghmd-tab" data-tab="settings">Settings</div>
                <div class="ghmd-tab" data-tab="log">Log</div>
            </div>

            <div id="ghmd-tab-content">
                <!-- Dashboard -->
                <div class="ghmd-tab-panel active" data-panel="dashboard">
                    <div class="ghmd-sync-bar">
                        <span id="ghmd-sync-indicator">Ready to sync</span>
                        <button class="ghmd-sync-btn" id="ghmd-sync-now">SYNC</button>
                    </div>

                    <div class="ghmd-api-rate-bar">
                        <span class="ghmd-api-rate-label">API Rate Limit:</span>
                        <span id="ghmd-api-rate">${state.apiRateRemaining}/60</span>
                    </div>

                    <div class="ghmd-stats-grid">
                        <div class="ghmd-stat-card">
                            <div class="ghmd-stat-value" id="ghmd-stat-scanned">0</div>
                            <div class="ghmd-stat-label">Scanned</div>
                        </div>
                        <div class="ghmd-stat-card">
                            <div class="ghmd-stat-value" id="ghmd-stat-cached">${Object.keys(state.cache).length}</div>
                            <div class="ghmd-stat-label">Cached</div>
                        </div>
                        <div class="ghmd-stat-card">
                            <div class="ghmd-stat-value" id="ghmd-stat-blocked">${state.blocklist.users.length}</div>
                            <div class="ghmd-stat-label">Blocked</div>
                        </div>
                        <div class="ghmd-stat-card">
                            <div class="ghmd-stat-value" id="ghmd-stat-community">${Object.keys(state.remoteItems).length}</div>
                            <div class="ghmd-stat-label">Community</div>
                        </div>
                    </div>

                    <div class="ghmd-section">
                        <div class="ghmd-section-header">Display Mode</div>
                        <div class="ghmd-mode-btns">
                            <button id="ghmd-mode-tag" class="${state.settings.mode === 'tag' ? 'ghmd-active' : ''}">TAG</button>
                            <button id="ghmd-mode-hide" class="${state.settings.mode === 'hide' ? 'ghmd-active' : ''}">HIDE</button>
                            <button id="ghmd-mode-dim" class="${state.settings.mode === 'dim' ? 'ghmd-active' : ''}">DIM</button>
                        </div>
                    </div>

                    <div class="ghmd-section">
                        <div class="ghmd-section-header">Detection Filters</div>
                        <div class="ghmd-reason-filters" id="ghmd-reason-filters">
                            ${Object.entries(REASONS).map(([key, r]) =>
                                `<span class="ghmd-reason-chip ${state.settings.enabledReasons.includes(key) ? 'active' : ''}"
                                       data-reason="${key}" style="background:${r.color}" title="${r.desc}">${r.label}</span>`
                            ).join('')}
                        </div>
                    </div>

                    <div class="ghmd-section">
                        <div class="ghmd-btn-group">
                            <button class="ghmd-btn" id="ghmd-scan-now">Scan Page</button>
                            <button class="ghmd-btn" id="ghmd-export">Export</button>
                            <button class="ghmd-btn" id="ghmd-import">Import</button>
                        </div>
                    </div>
                </div>

                <!-- Blocklist -->
                <div class="ghmd-tab-panel" data-panel="blocklist">
                    <input type="text" class="ghmd-search" id="ghmd-blocklist-search" placeholder="Search blocked users...">
                    <div class="ghmd-section-header">
                        <span>Blocked Users (<span id="ghmd-blocklist-count">${state.blocklist.users.length}</span>)</span>
                        <button class="ghmd-btn ghmd-btn-danger" id="ghmd-clear-blocklist" style="padding:4px 10px;font-size:9px;">Clear All</button>
                    </div>
                    <div class="ghmd-blocklist" id="ghmd-blocklist-panel"></div>
                    <div style="margin-top:14px;">
                        <div class="ghmd-section-header">Add User Manually</div>
                        <div style="display:flex;gap:8px;">
                            <input type="text" class="ghmd-input" id="ghmd-add-user" placeholder="username" style="flex:1;text-align:left;">
                            <button class="ghmd-btn ghmd-btn-primary" id="ghmd-add-user-btn">Add</button>
                        </div>
                    </div>
                </div>

                <!-- Settings -->
                <div class="ghmd-tab-panel" data-panel="settings">
                    <div class="ghmd-section-header">Sync Settings</div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Enable Sync</div>
                            <div class="ghmd-setting-desc">Fetch community data and share blocks</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.syncEnabled ? 'active' : ''}" data-setting="syncEnabled"></div>
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Auto Sync</div>
                            <div class="ghmd-setting-desc">Sync automatically on interval</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.autoSync ? 'active' : ''}" data-setting="autoSync"></div>
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Sync Interval (min)</div>
                        </div>
                        <input type="number" class="ghmd-input" id="ghmd-sync-interval" value="${state.settings.syncInterval}" min="1" max="60">
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Upload New Blocks</div>
                            <div class="ghmd-setting-desc">Share your blocks with community</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.uploadNewBlocks ? 'active' : ''}" data-setting="uploadNewBlocks"></div>
                    </div>

                    <div class="ghmd-section-header" style="margin-top:16px;">ZIP Detection Settings</div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Enable API ZIP Check</div>
                            <div class="ghmd-setting-desc">Scan repos for ZIP files via GitHub API</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.apiCheckEnabled ? 'active' : ''}" data-setting="apiCheckEnabled"></div>
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Enable DOM ZIP Check</div>
                            <div class="ghmd-setting-desc">Detect ZIP files in page HTML</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.domZipCheckEnabled ? 'active' : ''}" data-setting="domZipCheckEnabled"></div>
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Recursive API Check</div>
                            <div class="ghmd-setting-desc">Check subdirectories (uses more API calls)</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.apiCheckRecursive ? 'active' : ''}" data-setting="apiCheckRecursive"></div>
                    </div>

                    <div class="ghmd-section-header" style="margin-top:16px;">Detection Settings</div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Score Threshold</div>
                            <div class="ghmd-setting-desc">Minimum score to flag as suspicious</div>
                        </div>
                        <input type="number" class="ghmd-input" id="ghmd-threshold" value="${state.settings.threshold}" min="0" max="100">
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Trusted Star Threshold</div>
                            <div class="ghmd-setting-desc">Repos with more stars are trusted</div>
                        </div>
                        <input type="number" class="ghmd-input" id="ghmd-trusted-stars" value="${state.settings.trustedStarThreshold}" min="0" max="100000">
                    </div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Auto-Block Contributors</div>
                            <div class="ghmd-setting-desc">Block all contributors of flagged repos</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.autoBlockContributors ? 'active' : ''}" data-setting="autoBlockContributors"></div>
                    </div>

                    <div class="ghmd-section-header" style="margin-top:16px;">UI Settings</div>

                    <div class="ghmd-setting">
                        <div class="ghmd-setting-label">
                            <div class="ghmd-setting-title">Show Notifications</div>
                        </div>
                        <div class="ghmd-toggle ${state.settings.showNotifications ? 'active' : ''}" data-setting="showNotifications"></div>
                    </div>

                    <div class="ghmd-section-header" style="margin-top:16px;">Data Management</div>

                    <div class="ghmd-btn-group" style="margin-top:10px;">
                        <button class="ghmd-btn" id="ghmd-clear-cache">Clear Cache</button>
                        <button class="ghmd-btn ghmd-btn-danger" id="ghmd-reset-all">Reset All</button>
                    </div>
                </div>

                <!-- Log -->
                <div class="ghmd-tab-panel" data-panel="log">
                    <div class="ghmd-section-header">
                        <span>Activity Log</span>
                        <button class="ghmd-btn" id="ghmd-clear-log" style="padding:4px 10px;font-size:9px;">Clear</button>
                    </div>
                    <div class="ghmd-log" id="ghmd-log"></div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        bindUIEvents();
        renderBlocklist();
        updateAPIRateDisplay();
    }

    function bindUIEvents() {
        document.querySelectorAll('.ghmd-tab').forEach(tab => {
            tab.onclick = () => {
                const tabName = tab.dataset.tab;
                state.activeTab = tabName;
                document.querySelectorAll('.ghmd-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.ghmd-tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector(`[data-panel="${tabName}"]`).classList.add('active');
            };
        });

        document.getElementById('ghmd-toggle').onclick = () => {
            const panel = document.getElementById('ghmd-panel');
            panel.classList.toggle('ghmd-minimized');
            state.settings.panelCollapsed = panel.classList.contains('ghmd-minimized');
            saveState();
        };

        document.getElementById('ghmd-toggle-position').onclick = () => {
            const panel = document.getElementById('ghmd-panel');
            panel.classList.toggle('ghmd-left');
            state.settings.panelPosition = panel.classList.contains('ghmd-left') ? 'left' : 'right';
            saveState();
        };

        ['tag', 'hide', 'dim'].forEach(mode => {
            document.getElementById(`ghmd-mode-${mode}`).onclick = () => setMode(mode);
        });

        document.getElementById('ghmd-reason-filters').onclick = (e) => {
            const chip = e.target.closest('.ghmd-reason-chip');
            if (!chip) return;
            const reason = chip.dataset.reason;
            const idx = state.settings.enabledReasons.indexOf(reason);
            if (idx >= 0) {
                state.settings.enabledReasons.splice(idx, 1);
                chip.classList.remove('active');
            } else {
                state.settings.enabledReasons.push(reason);
                chip.classList.add('active');
            }
            saveState();
            reapplyAll();
        };

        document.getElementById('ghmd-sync-now').onclick = () => syncBlocklist();
        document.getElementById('ghmd-scan-now').onclick = () => scanPage();

        document.getElementById('ghmd-export').onclick = () => {
            const data = {
                blocklist: state.blocklist,
                cache: state.cache,
                settings: state.settings,
                remoteItems: state.remoteItems,
                exportDate: new Date().toISOString(),
                version: '4.2'
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `ghmd-export-${Date.now()}.json`;
            a.click();
            log('Exported data');
        };

        document.getElementById('ghmd-import').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (data.blocklist) {
                            data.blocklist.users.forEach(u => {
                                if (!state.blocklist.users.includes(u)) {
                                    state.blocklist.users.push(u);
                                }
                            });
                        }
                        if (data.cache) Object.assign(state.cache, data.cache);
                        saveState();
                        renderBlocklist();
                        updateStats();
                        log(`Imported ${data.blocklist?.users?.length || 0} users`);
                        showNotification('Import successful');
                    } catch (err) {
                        log('Import error: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        document.getElementById('ghmd-blocklist-search').oninput = (e) => renderBlocklist(e.target.value);

        document.getElementById('ghmd-add-user-btn').onclick = () => {
            const input = document.getElementById('ghmd-add-user');
            const username = input.value.trim();
            if (username) {
                blockUser(username);
                input.value = '';
            }
        };

        document.getElementById('ghmd-add-user').onkeypress = (e) => {
            if (e.key === 'Enter') document.getElementById('ghmd-add-user-btn').click();
        };

        document.getElementById('ghmd-clear-blocklist').onclick = () => {
            if (confirm('Clear all blocked users?')) {
                state.blocklist = { users: [], repos: [] };
                saveState();
                renderBlocklist();
                updateStats();
                reapplyAll();
                log('Blocklist cleared');
            }
        };

        document.querySelectorAll('.ghmd-toggle').forEach(toggle => {
            toggle.onclick = () => {
                const setting = toggle.dataset.setting;
                state.settings[setting] = !state.settings[setting];
                toggle.classList.toggle('active');
                saveState();
                if (setting === 'autoSync' || setting === 'syncEnabled') setupAutoSync();
                log(`${setting}: ${state.settings[setting]}`);
            };
        });

        document.getElementById('ghmd-threshold').onchange = (e) => {
            const val = parseInt(e.target.value, 10);
            state.settings.threshold = isNaN(val) ? 30 : val;
            saveState();
            reapplyAll();
        };

        document.getElementById('ghmd-sync-interval').onchange = (e) => {
            const val = parseInt(e.target.value, 10);
            state.settings.syncInterval = isNaN(val) ? 5 : Math.max(1, val);
            saveState();
            setupAutoSync();
        };

        document.getElementById('ghmd-trusted-stars').onchange = (e) => {
            const val = parseInt(e.target.value, 10);
            state.settings.trustedStarThreshold = isNaN(val) ? 2000 : Math.max(0, val);
            saveState();
            log(`Trusted star threshold: ${state.settings.trustedStarThreshold}`);
            reapplyAll();
        };

        document.getElementById('ghmd-clear-cache').onclick = () => {
            state.cache = {};
            saveState();
            updateStats();
            log('Cache cleared');
            document.querySelectorAll('article[data-ghmd]').forEach(el => {
                el.removeAttribute('data-ghmd');
                el.querySelectorAll('.ghmd-tags, .ghmd-actions').forEach(t => t.remove());
                el.classList.remove('ghmd-hidden', 'ghmd-dimmed', 'ghmd-flagged');
            });
            scanPage();
        };

        document.getElementById('ghmd-reset-all').onclick = () => {
            if (confirm('Reset ALL data? This cannot be undone.')) {
                state.cache = {};
                state.blocklist = { users: [], repos: [] };
                state.remoteItems = {};
                state.lastSync = 0;
                saveState();
                renderBlocklist();
                updateStats();
                reapplyAll();
                log('All data reset');
            }
        };

        document.getElementById('ghmd-clear-log').onclick = () => {
            document.getElementById('ghmd-log').innerHTML = '';
        };
    }

    function renderBlocklist(filter = '') {
        const container = document.getElementById('ghmd-blocklist-panel');
        const countEl = document.getElementById('ghmd-blocklist-count');
        if (!container) return;

        let users = state.blocklist.users;
        if (filter) {
            users = users.filter(u => u.toLowerCase().includes(filter.toLowerCase()));
        }

        if (countEl) countEl.textContent = state.blocklist.users.length;

        if (users.length === 0) {
            container.innerHTML = '<div style="color:#6e7681;text-align:center;padding:24px;">No blocked users</div>';
            return;
        }

        container.innerHTML = users.slice(0, 50).map(u => {
            const remoteInfo = state.remoteItems[u];
            return `
                <div class="ghmd-blocklist-item">
                    <div class="ghmd-blocklist-user">
                        <a href="/${u}" target="_blank" style="color:#58a6ff;text-decoration:none;font-weight:500;">${u}</a>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${remoteInfo ? `<span class="ghmd-blocklist-votes">${remoteInfo.votes}</span>` : ''}
                        <span class="ghmd-blocklist-remove" data-user="${u}">✕</span>
                    </div>
                </div>
            `;
        }).join('');

        if (users.length > 50) {
            container.innerHTML += `<div style="color:#6e7681;text-align:center;padding:12px;">...and ${users.length - 50} more</div>`;
        }

        container.querySelectorAll('.ghmd-blocklist-remove').forEach(el => {
            el.onclick = () => {
                const user = el.dataset.user;
                state.blocklist.users = state.blocklist.users.filter(u => u !== user);
                saveState();
                renderBlocklist(filter);
                updateStats();
                reapplyAll();
                log('Unblocked: ' + user);
            };
        });
    }

    function setMode(mode) {
        state.settings.mode = mode;
        saveState();
        document.querySelectorAll('.ghmd-mode-btns button').forEach(b => b.classList.remove('ghmd-active'));
        document.getElementById('ghmd-mode-' + mode).classList.add('ghmd-active');
        reapplyAll();
    }

    function log(msg) {
        console.log('[GHMD]', msg);
        const logEl = document.getElementById('ghmd-log');
        if (logEl) {
            const time = new Date().toLocaleTimeString();
            logEl.innerHTML = `<div class="ghmd-log-entry"><span class="ghmd-log-time">[${time}]</span> ${msg}</div>` + logEl.innerHTML;
            while (logEl.children.length > 100) logEl.removeChild(logEl.lastChild);
        }
    }

    function updateStats() {
        const el = id => document.getElementById(id);
        if (el('ghmd-stat-scanned')) el('ghmd-stat-scanned').textContent = state.scannedCount;
        if (el('ghmd-stat-cached')) el('ghmd-stat-cached').textContent = Object.keys(state.cache).length;
        if (el('ghmd-stat-blocked')) el('ghmd-stat-blocked').textContent = state.blocklist.users.length;
        if (el('ghmd-stat-community')) el('ghmd-stat-community').textContent = Object.keys(state.remoteItems).length;
    }

    // ==================== SCANNING ====================

    function setupObserver() {
        let debounceTimer = null;
        let lastScanTime = 0;

        const observer = new MutationObserver(() => {
            const now = Date.now();
            if (now - lastScanTime < 1000) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const newArticles = document.querySelectorAll('article:not([data-ghmd])');
                if (newArticles.length > 0) {
                    lastScanTime = Date.now();
                    scanPage();
                }
            }, 500);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('scroll', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const newArticles = document.querySelectorAll('article:not([data-ghmd])');
                if (newArticles.length > 0) scanPage();
            }, 400);
        });
    }

    function scanPage() {
        if (state.isScanning) return;
        state.isScanning = true;

        const articles = document.querySelectorAll('article:not([data-ghmd])');
        if (articles.length === 0) {
            state.isScanning = false;
            return;
        }

        log(`Scanning ${articles.length} repos...`);

        articles.forEach(article => {
            article.setAttribute('data-ghmd', 'processing');
            const info = extractRepoInfo(article);
            if (info) {
                state.scannedCount++;
                processArticle(article, info);
            } else {
                article.setAttribute('data-ghmd', 'skip');
            }
        });

        updateStats();
        state.isScanning = false;
    }

    function extractRepoInfo(article) {
        let repoLink = article.querySelector('h3 a.text-bold') ||
                       article.querySelector('a[data-hydro-click*="REPOSITORY_NAME"]');

        if (!repoLink) {
            const links = article.querySelectorAll('h3 a');
            for (const link of links) {
                const href = link.getAttribute('href') || '';
                if (href.match(/^\/[^\/]+\/[^\/]+$/) && !href.includes('/topics/')) {
                    repoLink = link;
                    break;
                }
            }
        }

        if (!repoLink) return null;

        const href = repoLink.getAttribute('href');
        const match = href?.match(/^\/([^\/]+)\/([^\/]+)/);
        if (!match) return null;

        const owner = match[1];
        const repo = match[2];

        if (['topics', 'explore', 'trending', 'collections', 'sponsors'].includes(owner)) return null;

        const descEl = article.querySelector('p.color-fg-muted');
        const description = descEl?.textContent?.trim() || '';

        let stars = 0;
        const starBtn = article.querySelector('[aria-label*="star"]');
        const counterEl = article.querySelector('.Counter');
        if (starBtn) {
            const text = starBtn.textContent?.trim() || '';
            const starMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?[kKmM]?)/);
            if (starMatch) stars = parseStarCount(starMatch[1]);
        } else if (counterEl) {
            stars = parseStarCount(counterEl.textContent?.trim() || '0');
        }

        return { owner, repo, fullName: `${owner}/${repo}`, url: `https://github.com${href}`, stars, description };
    }

    function parseStarCount(str) {
        if (!str) return 0;
        str = str.replace(/,/g, '');
        const match = str.match(/^([\d.]+)([kKmM])?$/);
        if (!match) return 0;
        let num = parseFloat(match[1]);
        const suffix = match[2];
        if (suffix) {
            if (suffix.toLowerCase() === 'k') num *= 1000;
            else if (suffix.toLowerCase() === 'm') num *= 1000000;
        }
        return Math.floor(num);
    }

    function processArticle(article, info) {
        if (state.blocklist.users.includes(info.owner) || state.blocklist.repos.includes(info.fullName)) {
            article.setAttribute('data-ghmd', 'blocked');
            applyToArticle(article, info, {
                score: 999,
                reasons: ['BLOCKED'],
                contributors: [info.owner]
            });
            return;
        }

        if (state.cache[info.fullName]) {
            article.setAttribute('data-ghmd', 'cached');
            applyToArticle(article, info, state.cache[info.fullName]);
            return;
        }

        if (state.processing.has(info.fullName)) return;
        state.processing.add(info.fullName);

        GM_xmlhttpRequest({
            method: 'GET',
            url: info.url,
            headers: { 'Accept': 'text/html' },
            timeout: 15000,
            onload: (response) => {
                state.processing.delete(info.fullName);
                if (response.status !== 200) {
                    article.setAttribute('data-ghmd', 'error');
                    return;
                }
                const analysis = analyzeHTML(response.responseText, info);
                state.cache[info.fullName] = analysis;
                saveState();
                article.setAttribute('data-ghmd', 'done');
                applyToArticle(article, info, analysis);
                updateStats();

                if (state.settings.autoBlockContributors &&
                    analysis.score >= state.settings.threshold &&
                    analysis.stars < state.settings.trustedStarThreshold) {
                    blockContributors(analysis.contributors, info.fullName);
                }
            },
            onerror: () => {
                state.processing.delete(info.fullName);
                article.setAttribute('data-ghmd', 'error');
            },
            ontimeout: () => {
                state.processing.delete(info.fullName);
                article.setAttribute('data-ghmd', 'timeout');
            }
        });
    }

    function analyzeHTML(html, info) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const reasons = [];
        let score = 0;

        const readme = doc.querySelector('article.markdown-body');
        const readmeHTML = readme?.innerHTML || '';
        const readmeText = readme?.textContent || '';

        let actualStars = info.stars;
        const starLink = doc.querySelector('a[href*="/stargazers"]');
        if (starLink) {
            const strongEl = starLink.querySelector('strong');
            if (strongEl) actualStars = parseStarCount(strongEl.textContent?.trim() || '0');
        }

        // ==================== DOM_ZIP DETECTION (NEW - 20 POINTS) ====================
        if (state.settings.domZipCheckEnabled) {
            const domZipFiles = parseZipFilesFromDOM(doc, info.url);

            if (domZipFiles.length > 0) {
                score += REASONS.DOM_ZIP.score;
                reasons.push('DOM_ZIP');

                // Store for display
                if (!info.domZipFiles) info.domZipFiles = [];
                info.domZipFiles = domZipFiles;

                // Check for hidden ZIPs in subdirectories
                const hiddenZips = domZipFiles.filter(f => f.inSubdir);
                if (hiddenZips.length > 0 && !reasons.includes('HIDDEN_ZIP')) {
                    score += REASONS.HIDDEN_ZIP.score;
                    reasons.push('HIDDEN_ZIP');
                }

                // Multiple ZIPs bonus
                if (domZipFiles.length > 2 && !reasons.includes('MULTI_ZIP')) {
                    score += REASONS.MULTI_ZIP.score;
                    reasons.push('MULTI_ZIP');
                }

                log(`DOM found ${domZipFiles.length} ZIP file(s) in ${info.fullName}`);
            }
        }

        // ==================== README_ONLY_COMMIT DETECTION ====================
        const latestCommitEl = doc.querySelector('[data-testid="latest-commit-html"] a, .LatestCommit-module__Box_1__B9yPB3g a');
        let latestCommit = '';
        if (latestCommitEl) {
            latestCommit = latestCommitEl.textContent?.trim() || '';
        }

        const fileRows = doc.querySelectorAll('tr.react-directory-row');
        let readmeIsLatest = false;
        let readmeCommitDate = null;
        let otherLatestDate = null;

        fileRows.forEach(row => {
            const fileLink = row.querySelector('a[aria-label*="(File)"], a[aria-label*="(Directory)"]');
            const dateEl = row.querySelector('relative-time');
            const fileName = fileLink?.getAttribute('title') || fileLink?.textContent?.trim() || '';

            if (dateEl) {
                const datetime = dateEl.getAttribute('datetime');
                if (datetime) {
                    const date = new Date(datetime);
                    if (fileName.toLowerCase() === 'readme.md') {
                        readmeCommitDate = date;
                    } else {
                        if (!otherLatestDate || date > otherLatestDate) {
                            otherLatestDate = date;
                        }
                    }
                }
            }
        });

        if (readmeCommitDate && otherLatestDate && readmeCommitDate > otherLatestDate) {
            readmeIsLatest = true;
        }

        const readmeCommitPatterns = [
            /update readme/i,
            /readme\.md/i,
            /edit readme/i,
            /modify readme/i,
            /change readme/i,
            /fix readme/i,
            /updated readme/i
        ];

        const isReadmeOnlyCommit = readmeCommitPatterns.some(p => p.test(latestCommit)) || readmeIsLatest;

        if (isReadmeOnlyCommit) {
            score += REASONS.README_ONLY_COMMIT.score;
            reasons.push('README_ONLY_COMMIT');
        }

        // ==================== REF_NO_RELEASE DETECTION ====================
        const hasReleaseLinkInReadme = /\/releases/i.test(readmeHTML) ||
                                        /releases page/i.test(readmeText) ||
                                        /latest release/i.test(readmeText) ||
                                        /download.*release/i.test(readmeText) ||
                                        /release.*download/i.test(readmeText);

        const noReleasesPublished = /No releases published/i.test(html);

        const releaseSection = doc.querySelector('.BorderGrid-cell');
        let noReleasesInSidebar = false;
        if (releaseSection) {
            const releaseText = releaseSection.textContent || '';
            noReleasesInSidebar = /No releases published/i.test(releaseText);
        }

        if (hasReleaseLinkInReadme && (noReleasesPublished || noReleasesInSidebar)) {
            score += REASONS.REF_NO_RELEASE.score;
            reasons.push('REF_NO_RELEASE');
        }

        // ==================== EXISTING DETECTIONS ====================
        const zipCount = (readmeHTML.match(/\.zip["'\s>]/gi) || []).length;
        if (zipCount > 0) {
            score += REASONS.ZIP.score * Math.min(zipCount, 3);
            reasons.push('ZIP');
        }

        if (/raw\/.*\.zip|\/raw\/refs\/heads\/.*\.zip/i.test(readmeHTML)) {
            score += REASONS.RAW_ZIP.score;
            reasons.push('RAW_ZIP');
        }

        if (/\.exe["'\s>]/i.test(readmeHTML)) {
            score += REASONS.EXE_LINK.score;
            reasons.push('EXE_LINK');
        }

        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu;
        const emojis = readmeText.match(emojiRegex) || [];
        if (emojis.length > 8) {
            score += REASONS.EMOJI.score;
            reasons.push('EMOJI');
        }

        let boilerplateCount = 0;
        for (const p of BOILERPLATE_PATTERNS) {
            if (p.test(readmeText)) boilerplateCount++;
        }
        if (boilerplateCount >= 3) {
            score += REASONS.BOILERPLATE.score + boilerplateCount * 2;
            reasons.push('BOILERPLATE');
        }

        const dlMatches = readmeText.match(/download|install|click here|get started/gi) || [];
        if (dlMatches.length > 8) {
            score += REASONS.DOWNLOAD_SPAM.score;
            reasons.push('DOWNLOAD_SPAM');
        }

        if (noReleasesPublished && !reasons.includes('REF_NO_RELEASE')) {
            score += REASONS.NO_RELEASES.score;
            reasons.push('NO_RELEASES');
        }

        if (actualStars === 0) {
            score += REASONS.ZERO_STARS.score;
            reasons.push('ZERO_STARS');
        }

        if (/<strong[^>]*>\s*1\s*<\/strong>\s*Branch|>\s*1\s+Branch/i.test(html)) {
            score += REASONS.SINGLE_BRANCH.score;
            reasons.push('SINGLE_BRANCH');
        }

        for (const p of SUSPICIOUS_PATTERNS) {
            if (p.test(readmeText) || p.test(readmeHTML)) {
                score += REASONS.SUSPICIOUS.score;
                if (!reasons.includes('SUSPICIOUS')) reasons.push('SUSPICIOUS');
                break;
            }
        }

        // ==================== OBFUSCATION DETECTION ====================
        for (const p of OBFUSCATION_PATTERNS) {
            if (p.test(readmeText) || p.test(readmeHTML)) {
                score += REASONS.OBFUSCATED.score;
                if (!reasons.includes('OBFUSCATED')) reasons.push('OBFUSCATED');
                break;
            }
        }

        const contributors = parseContributors(doc, info.owner);
        const realContributors = contributors.filter(c => !c.includes('[bot]'));
        if (realContributors.length > 0 && realContributors.length <= 2) {
            score += REASONS.FEW_CONTRIBUTORS.score;
            reasons.push('FEW_CONTRIBUTORS');
        }

        return {
            score,
            reasons,
            contributors,
            stars: actualStars,
            ts: Date.now(),
            latestCommit: latestCommit || null,
            domZipFiles: info.domZipFiles || []
        };
    }

    function parseContributors(doc, owner) {
        const contributors = new Set();
        if (owner) contributors.add(owner);

        doc.querySelectorAll('a[data-hovercard-type="user"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            const match = href.match(/(?:github\.com|^)\/([^\/\?#]+)$/);
            if (match && match[1] && !match[1].includes('[bot]') && /^[a-zA-Z0-9-]+$/.test(match[1])) {
                contributors.add(match[1]);
            }
        });

        doc.querySelectorAll('img[alt^="@"]').forEach(img => {
            const alt = img.getAttribute('alt');
            if (alt) {
                const match = alt.match(/@([^\s\[\]]+)/);
                if (match && match[1] && !match[1].includes('[bot]')) {
                    contributors.add(match[1]);
                }
            }
        });

        return [...contributors].filter(u => u && u.length > 0 && !u.includes('[bot]') && /^[a-zA-Z0-9-]+$/.test(u));
    }

    function shouldFlag(analysis) {
        if (!analysis || !analysis.reasons) return false;

        if (analysis.stars >= state.settings.trustedStarThreshold) {
            return false;
        }

        let enabledScore = 0;
        analysis.reasons.forEach(r => {
            if (state.settings.enabledReasons.includes(r) && REASONS[r]) {
                enabledScore += REASONS[r].score;
            }
        });

        return enabledScore >= state.settings.threshold;
    }

    function applyToArticle(article, info, analysis) {
        article.querySelectorAll('.ghmd-tags, .ghmd-actions').forEach(el => el.remove());
        article.classList.remove('ghmd-hidden', 'ghmd-dimmed', 'ghmd-flagged');
        article.style.position = 'relative';

        const h3 = article.querySelector('h3');
        if (!h3) return;

        const isBlocked = state.blocklist.users.includes(info.owner);
        const isTrusted = analysis.stars >= state.settings.trustedStarThreshold;
        const isFlagged = isBlocked || (!isTrusted && shouldFlag(analysis));
        const remoteInfo = state.remoteItems[info.owner];

        const tagsContainer = document.createElement('span');
        tagsContainer.className = 'ghmd-tags';
        tagsContainer.title = 'Click to view details';
        tagsContainer.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showAnalysisModal(info.fullName, analysis, info);
        };

        if (isBlocked) {
            const tag = document.createElement('span');
            tag.className = 'ghmd-tag';
            tag.style.background = '#da3633';
            tag.textContent = 'BLOCKED';
            tagsContainer.appendChild(tag);
        } else if (isTrusted) {
            const trustedTag = document.createElement('span');
            trustedTag.className = 'ghmd-trusted-badge';
            trustedTag.textContent = `${formatStarCount(analysis.stars)} ⭐`;
            trustedTag.title = `Trusted: ${formatStarCount(analysis.stars)} stars`;
            tagsContainer.appendChild(trustedTag);
        } else {
            const scoreTag = document.createElement('span');
            scoreTag.className = 'ghmd-tag';
            scoreTag.style.background = analysis.score >= 50 ? '#da3633' : analysis.score >= state.settings.threshold ? '#9e6a03' : '#238636';
            scoreTag.textContent = analysis.score;
            tagsContainer.appendChild(scoreTag);

            if (analysis.reasons) {
                analysis.reasons.forEach(reasonKey => {
                    const reason = REASONS[reasonKey];
                    if (reason) {
                        const tag = document.createElement('span');
                        tag.className = 'ghmd-tag';
                        tag.style.background = reason.color;
                        tag.textContent = reason.label;
                        tag.title = reason.desc;
                        tagsContainer.appendChild(tag);
                    }
                });
            }
        }

        if (remoteInfo && remoteInfo.votes > 0) {
            const voteIndicator = document.createElement('span');
            voteIndicator.className = 'ghmd-vote-indicator';
            voteIndicator.textContent = remoteInfo.votes;
                        voteIndicator.title = `${remoteInfo.votes} community votes`;
            tagsContainer.appendChild(voteIndicator);
        }

        h3.appendChild(tagsContainer);

        if (isFlagged) {
            if (state.settings.mode === 'hide') {
                article.classList.add('ghmd-hidden');
            } else if (state.settings.mode === 'dim') {
                article.classList.add('ghmd-dimmed');
            } else {
                article.classList.add('ghmd-flagged');
            }

            if (!isBlocked) {
                const actions = document.createElement('span');
                actions.className = 'ghmd-actions';

                const blockBtn = document.createElement('button');
                blockBtn.className = 'ghmd-action-btn ghmd-btn-block';
                blockBtn.textContent = 'Block';
                blockBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    blockUser(info.owner);
                    reapplyAll();
                };
                actions.appendChild(blockBtn);

                if (analysis.contributors && analysis.contributors.length > 1) {
                    const blockAllBtn = document.createElement('button');
                    blockAllBtn.className = 'ghmd-action-btn ghmd-btn-block-all';
                    blockAllBtn.textContent = `All (${analysis.contributors.length})`;
                    blockAllBtn.title = analysis.contributors.join(', ');
                    blockAllBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        blockContributors(analysis.contributors, info.fullName);
                        reapplyAll();
                    };
                    actions.appendChild(blockAllBtn);
                }

                h3.appendChild(actions);
            }
        }
    }

    function showAnalysisModal(fullName, analysis, info) {
        const existing = document.getElementById('ghmd-modal');
        if (existing) existing.remove();

        const isBlocked = state.blocklist.users.includes(info.owner);
        const remoteInfo = state.remoteItems[info.owner];
        const isTrusted = analysis.stars >= state.settings.trustedStarThreshold;
        const score = analysis.score || 0;
        const scoreClass = isTrusted ? 'trusted' : (score >= 50 ? 'danger' : score >= 30 ? 'warning' : 'safe');

        // Combine all ZIP files for display
        let allZipFiles = [];
        if (analysis.apiZipFiles) allZipFiles = allZipFiles.concat(analysis.apiZipFiles);
        if (analysis.domZipFiles) allZipFiles = allZipFiles.concat(analysis.domZipFiles);

        // Deduplicate by path
        const seenPaths = new Set();
        allZipFiles = allZipFiles.filter(f => {
            if (seenPaths.has(f.path)) return false;
            seenPaths.add(f.path);
            return true;
        });

        const modal = document.createElement('div');
        modal.id = 'ghmd-modal';
        modal.innerHTML = `
            <div class="ghmd-modal-backdrop" id="ghmd-modal-backdrop"></div>
            <div class="ghmd-modal-content">
                <div class="ghmd-modal-header">
                    <h3>${fullName}</h3>
                    <button class="ghmd-modal-close" id="ghmd-modal-close">✕</button>
                </div>
                <div class="ghmd-modal-body">
                    ${isTrusted ? `
                        <div class="ghmd-badge ghmd-badge-trusted">
                            <span>✓ TRUSTED REPOSITORY</span>
                            <span class="ghmd-badge-value">${formatStarCount(analysis.stars)} stars</span>
                        </div>
                    ` : ''}

                    ${remoteInfo ? `
                        <div class="ghmd-badge ghmd-badge-community">
                            <span>ℹ️ Community Data</span>
                            <span class="ghmd-badge-value">${remoteInfo.votes} votes</span>
                        </div>
                    ` : ''}

                    ${isBlocked ? `
                        <div class="ghmd-badge ghmd-badge-blocked">
                            <span>🚫 USER BLOCKED</span>
                        </div>
                    ` : `
                        <div class="ghmd-score ghmd-score-${scoreClass}">
                            <span class="ghmd-score-value">${score}</span>
                            <span class="ghmd-score-label">${isTrusted ? 'Trusted' : 'Risk Score'}</span>
                        </div>
                    `}

                    ${allZipFiles.length > 0 ? `
                        <div class="ghmd-section" style="margin-top:16px;">
                            <div class="ghmd-section-title">⚠️ ZIP Files Found (${allZipFiles.length})</div>
                            <div class="ghmd-zip-list">
                                ${allZipFiles.map(file => {
                                    const sourceLabel = file.source === 'api' ? 'API' : 'DOM';
                                    const subdirIcon = file.inSubdir ? '📁' : '📄';
                                    return `
                                        <div class="ghmd-zip-item">
                                            <span class="ghmd-zip-name">${subdirIcon} ${escapeHtml(file.name)}</span>
                                            <span class="ghmd-zip-meta">
                                                <span class="ghmd-zip-source">${sourceLabel}</span>
                                                ${file.size ? `<span class="ghmd-zip-size">${formatSize(file.size)}</span>` : ''}
                                            </span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin:16px 0;">
                        <div class="ghmd-section-title">Repository Info</div>
                        <div style="background:#161b22;padding:12px;border-radius:6px;font-size:11px;border:1px solid #21262d;">
                            <div class="ghmd-info-row"><span>Owner:</span><span>${info.owner}</span></div>
                            <div class="ghmd-info-row"><span>Repo:</span><span>${info.repo}</span></div>
                            ${analysis.stars !== undefined ? `<div class="ghmd-info-row"><span>Stars:</span><span>${formatStarCount(analysis.stars)} ${isTrusted ? '✓' : ''}</span></div>` : ''}
                            ${analysis.latestCommit ? `<div class="ghmd-info-row"><span>Latest Commit:</span><span>${escapeHtml(analysis.latestCommit)}</span></div>` : ''}
                            <div class="ghmd-info-row" style="border:none;"><span>Analyzed:</span><span>${new Date(analysis.ts).toLocaleString()}</span></div>
                        </div>
                    </div>

                    ${analysis.reasons && analysis.reasons.length > 0 ? `
                        <div style="margin-bottom:16px;">
                            <div class="ghmd-section-title">Detection Flags${isTrusted ? ' (ignored due to trust)' : ''}</div>
                            <div class="ghmd-flags" ${isTrusted ? 'style="opacity:0.5;"' : ''}>
                                ${analysis.reasons.map(reasonKey => {
                                    const reason = REASONS[reasonKey];
                                    return reason ? `<span class="ghmd-flag" style="background:${reason.color}" title="${reason.desc}">${reason.label} +${reason.score}</span>` : '';
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${analysis.contributors && analysis.contributors.length > 0 ? `
                        <div style="margin-bottom:16px;">
                            <div class="ghmd-section-title">Contributors (${analysis.contributors.length})</div>
                            <div class="ghmd-contributors">
                                ${analysis.contributors.map(user => {
                                    const isUserBlocked = state.blocklist.users.includes(user);
                                    const userRemote = state.remoteItems[user];
                                    return `<div class="ghmd-contributor">
                                        <a href="/${user}" target="_blank">${user}</a>
                                        <div>
                                            ${userRemote ? `<span class="ghmd-vote-small">${userRemote.votes}</span>` : ''}
                                            ${isUserBlocked ? '<span class="ghmd-blocked-tag">BLOCKED</span>' : ''}
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="ghmd-actions-row">
                        ${!isBlocked ? `<button class="ghmd-btn ghmd-btn-danger" id="ghmd-modal-block-owner">Block ${info.owner}</button>` : `<button class="ghmd-btn ghmd-btn-primary" id="ghmd-modal-unblock-owner">Unblock ${info.owner}</button>`}
                        ${analysis.contributors && analysis.contributors.length > 1 ? `<button class="ghmd-btn ghmd-btn-purple" id="ghmd-modal-block-all">Block All (${analysis.contributors.length})</button>` : ''}
                        <button class="ghmd-btn ghmd-btn-secondary" id="ghmd-modal-clear-cache">Clear Cache</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('ghmd-modal-close').onclick = () => modal.remove();
        document.getElementById('ghmd-modal-backdrop').onclick = () => modal.remove();

        document.getElementById('ghmd-modal-block-owner')?.addEventListener('click', () => {
            blockUser(info.owner);
            reapplyAll();
            modal.remove();
        });

        document.getElementById('ghmd-modal-unblock-owner')?.addEventListener('click', () => {
            state.blocklist.users = state.blocklist.users.filter(u => u !== info.owner);
            saveState();
            renderBlocklist();
            updateStats();
            reapplyAll();
            log('Unblocked: ' + info.owner);
            modal.remove();
        });

        document.getElementById('ghmd-modal-block-all')?.addEventListener('click', () => {
            blockContributors(analysis.contributors, info.fullName);
            reapplyAll();
            modal.remove();
        });

        document.getElementById('ghmd-modal-clear-cache')?.addEventListener('click', () => {
            delete state.cache[info.fullName];
            saveState();
            updateStats();
            log('Cleared cache for: ' + info.fullName);
            modal.remove();
            // Re-scan the article
            const articles = document.querySelectorAll(`article[data-ghmd]`);
            articles.forEach(article => {
                const articleInfo = extractRepoInfo(article);
                if (articleInfo && articleInfo.fullName === info.fullName) {
                    article.removeAttribute('data-ghmd');
                    article.querySelectorAll('.ghmd-tags, .ghmd-actions').forEach(el => el.remove());
                    article.classList.remove('ghmd-hidden', 'ghmd-dimmed', 'ghmd-flagged');
                }
            });
            scanPage();
        });

        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    function reapplyAll() {
        document.querySelectorAll('article[data-ghmd]').forEach(article => {
            const info = extractRepoInfo(article);
            if (!info) return;

            if (state.blocklist.users.includes(info.owner)) {
                applyToArticle(article, info, {
                    score: 999,
                    reasons: ['BLOCKED'],
                    contributors: [info.owner],
                    stars: 0,
                    ts: Date.now()
                });
            } else if (state.cache[info.fullName]) {
                applyToArticle(article, info, state.cache[info.fullName]);
            }
        });
    }

    // ==================== KEYBOARD SHORTCUTS ====================

    document.addEventListener('keydown', (e) => {
        // Alt+M to toggle panel
        if (e.altKey && e.key === 'm') {
            e.preventDefault();
            const panel = document.getElementById('ghmd-panel');
            if (panel) {
                panel.classList.toggle('ghmd-minimized');
                state.settings.panelCollapsed = panel.classList.contains('ghmd-minimized');
                saveState();
            }
        }

        // Alt+S to sync
        if (e.altKey && e.key === 's') {
            e.preventDefault();
            syncBlocklist();
        }

        // Alt+R to rescan
        if (e.altKey && e.key === 'r') {
            e.preventDefault();
            document.querySelectorAll('article[data-ghmd]').forEach(el => {
                el.removeAttribute('data-ghmd');
                el.querySelectorAll('.ghmd-tags, .ghmd-actions').forEach(t => t.remove());
                el.classList.remove('ghmd-hidden', 'ghmd-dimmed', 'ghmd-flagged');
            });
            scanPage();
            log('Manual rescan triggered');
        }
    });

    // ==================== CLEANUP OLD CACHE ====================

    function cleanupOldCache() {
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        let cleaned = 0;

        Object.keys(state.cache).forEach(key => {
            const entry = state.cache[key];
            if (entry.ts && (now - entry.ts) > maxAge) {
                delete state.cache[key];
                cleaned++;
            }
        });

        if (cleaned > 0) {
            saveState();
            log(`Cleaned ${cleaned} old cache entries`);
        }
    }

    // Run cleanup on init
    setTimeout(cleanupOldCache, 5000);

    // ==================== START ====================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();