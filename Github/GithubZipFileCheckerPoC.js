// ==UserScript==
// @name         GitHub Zip File Checker (Recursive)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Recursively check if a GitHub repository contains zip files (DOM + API)
// @author       3sp3r4nt0
// @match        https://github.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      github.com
// @connect      api.github.com
// ==/UserScript==

(function() {
    'use strict';

    // ===================== CONFIGURATION =====================
    const CONFIG = {
        autoCheck: false,
        useAPI: false,
        useDOMRecursive: true,
        domMaxDepth: 5,
        apiRecursive: true,
        apiMaxDepth: 5,
        showButton: true,
        autoHideDelay: 0,
        position: 'bottom-right',
        scanDelay: 400,
        maxConcurrent: 2,
        debug: true
    };

    // ===================== LOGGING =====================
    function log(...args) {
        if (CONFIG.debug) console.log('[ZIP Checker]', ...args);
    }

    function warn(...args) {
        console.warn('[ZIP Checker]', ...args);
    }

    // ===================== STYLES =====================
    GM_addStyle(`
        #zip-checker-container {
            position: fixed;
            ${CONFIG.position.includes('bottom') ? 'bottom: 20px;' : 'top: 80px;'}
            ${CONFIG.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        #zip-checker-btn {
            background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(35, 134, 54, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        #zip-checker-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(35, 134, 54, 0.5);
        }

        #zip-checker-btn.loading {
            opacity: 0.8;
            pointer-events: none;
        }

        #zip-checker-btn .spinner {
            display: inline-block;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        #zip-checker-panel {
            position: absolute;
            ${CONFIG.position.includes('bottom') ? 'bottom: 55px;' : 'top: 55px;'}
            ${CONFIG.position.includes('right') ? 'right: 0;' : 'left: 0;'}
            width: 480px;
            max-height: 600px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            display: none;
            overflow: hidden;
        }

        #zip-checker-panel.show {
            display: block;
            animation: slideIn 0.2s ease;
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .zip-panel-header {
            background: #21262d;
            padding: 12px 15px;
            border-bottom: 1px solid #30363d;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .zip-panel-header h4 {
            margin: 0;
            color: #f0f6fc;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .zip-panel-header .close-btn {
            background: none;
            border: none;
            color: #8b949e;
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            line-height: 1;
        }

        .zip-panel-header .close-btn:hover {
            color: #f0f6fc;
        }

        .zip-panel-content {
            padding: 15px;
            max-height: 500px;
            overflow-y: auto;
        }

        .zip-panel-content::-webkit-scrollbar {
            width: 8px;
        }

        .zip-panel-content::-webkit-scrollbar-track {
            background: #161b22;
        }

        .zip-panel-content::-webkit-scrollbar-thumb {
            background: #30363d;
            border-radius: 4px;
        }

        .zip-progress {
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
        }

        .zip-progress-bar {
            height: 6px;
            background: #30363d;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .zip-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #238636, #3fb950);
            border-radius: 3px;
            transition: width 0.3s ease;
        }

        .zip-progress-text {
            color: #8b949e;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
        }

        .zip-section {
            margin-bottom: 15px;
        }

        .zip-section:last-child {
            margin-bottom: 0;
        }

        .zip-list {
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .zip-item {
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 8px;
            transition: border-color 0.2s;
        }

        .zip-item:hover {
            border-color: #58a6ff;
        }

        .zip-item:last-child {
            margin-bottom: 0;
        }

        .zip-item-name {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .zip-item-name a {
            color: #58a6ff;
            text-decoration: none;
            font-weight: 500;
            word-break: break-all;
        }

        .zip-item-name a:hover {
            text-decoration: underline;
        }

        .zip-item-meta {
            color: #8b949e;
            font-size: 11px;
            margin-top: 6px;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .zip-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }

        .zip-badge.dom { background: #1f6feb; color: white; }
        .zip-badge.api { background: #8957e5; color: white; }
        .zip-badge.both { background: #238636; color: white; }

        .zip-status {
            padding: 12px;
            border-radius: 6px;
            text-align: center;
        }

        .zip-status.success {
            background: rgba(46, 160, 67, 0.15);
            border: 1px solid #238636;
            color: #3fb950;
        }

        .zip-status.empty {
            background: rgba(139, 148, 158, 0.1);
            border: 1px solid #30363d;
            color: #8b949e;
        }

        .zip-status.error {
            background: rgba(248, 81, 73, 0.15);
            border: 1px solid #f85149;
            color: #f85149;
        }

        .zip-status.warning {
            background: rgba(210, 153, 34, 0.15);
            border: 1px solid #d29922;
            color: #d29922;
        }

        .zip-info {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #30363d;
            font-size: 11px;
            color: #8b949e;
        }

        .zip-stats {
            display: flex;
            gap: 15px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }

        .zip-stat {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .zip-folders-scanned {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px dashed #30363d;
        }
    `);

    // ===================== UTILITIES =====================

    function isRepoPage() {
        const path = window.location.pathname.split('/').filter(Boolean);
        if (path.length < 2) return false;

        const excluded = ['marketplace', 'explore', 'notifications', 'settings',
                          'login', 'signup', 'trending', 'collections', 'events',
                          'sponsors', 'topics', 'search', 'pulls', 'issues',
                          'codespaces', 'organizations', 'orgs', 'users', 'features',
                          'security', 'customer-stories', 'readme', 'pricing', 'enterprise',
                          'team', 'about', 'contact'];
        if (excluded.includes(path[0])) return false;

        // Check for specific repo pages that aren't file browsers
        const nonFilePages = ['issues', 'pulls', 'actions', 'projects', 'wiki',
                              'security', 'pulse', 'graphs', 'network', 'settings',
                              'releases', 'packages', 'tags', 'stargazers', 'watchers',
                              'forks', 'compare', 'commit', 'commits', 'branches',
                              'deployments', 'activity'];
        if (path.length > 2 && nonFilePages.includes(path[2])) return false;

        return true;
    }

    function getRepoInfo() {
        const path = window.location.pathname.split('/').filter(Boolean);
        if (path.length < 2) return null;

        let branch = null;
        let treePath = '';

        // Check for tree or blob view
        const treeIndex = path.indexOf('tree');
        const blobIndex = path.indexOf('blob');
        const viewIndex = treeIndex !== -1 ? treeIndex : blobIndex;

        if (viewIndex !== -1 && path.length > viewIndex + 1) {
            branch = path[viewIndex + 1];
            if (path.length > viewIndex + 2) {
                treePath = path.slice(viewIndex + 2).join('/');
            }
        }

        return {
            owner: path[0],
            repo: path[1],
            branch: branch,
            treePath: treePath,
            baseUrl: `https://github.com/${path[0]}/${path[1]}`
        };
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===================== PROGRESS TRACKER =====================

    class ProgressTracker {
        constructor() {
            this.reset();
        }

        reset() {
            this.scannedFolders = 0;
            this.totalFolders = 1;
            this.foundFiles = 0;
            this.currentPath = '';
            this.foldersList = [];
            this.errors = [];
        }

        update(path) {
            this.currentPath = path;
            this.scannedFolders++;
            if (path && path !== 'root') this.foldersList.push(path);
            this.render();
        }

        addFolders(count) {
            this.totalFolders += count;
            this.render();
        }

        addFile() {
            this.foundFiles++;
            this.render();
        }

        addError(err) {
            this.errors.push(err);
        }

        render() {
            const progressEl = document.getElementById('zip-progress');
            if (!progressEl) return;

            const percent = Math.min(100, (this.scannedFolders / this.totalFolders) * 100);
            const displayPath = this.currentPath.length > 45
                ? '...' + this.currentPath.slice(-42)
                : this.currentPath;

            progressEl.innerHTML = `
                <div class="zip-progress-bar">
                    <div class="zip-progress-fill" style="width: ${percent}%"></div>
                </div>
                <div class="zip-progress-text">
                    <span>📁 ${this.scannedFolders}/${this.totalFolders} folders</span>
                    <span>📦 ${this.foundFiles} ZIP files</span>
                </div>
                <div class="zip-progress-text" style="margin-top: 4px;">
                    <span title="${this.currentPath}">📂 ${displayPath || 'root'}</span>
                </div>
            `;
        }
    }

    const progress = new ProgressTracker();

    // ===================== DOM SCANNER (FIXED FOR NEW GITHUB UI) =====================

    function fetchPage(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml'
                },
                onload: function(response) {
                    if (response.status === 200) {
                        resolve({ html: response.responseText, error: null, url: response.finalUrl || url });
                    } else {
                        resolve({ html: null, error: 'http_' + response.status, url: url });
                    }
                },
                onerror: function() {
                    resolve({ html: null, error: 'network_error', url: url });
                },
                ontimeout: function() {
                    resolve({ html: null, error: 'timeout', url: url });
                },
                timeout: 20000
            });
        });
    }

    /**
     * Parse GitHub page HTML to extract ZIP files and directories
     * Updated for GitHub's React-based UI (2024+)
     */
    function parsePageForFiles(html, pageUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const zipFiles = [];
        const directories = [];
        const seenHrefs = new Set();

        // Extract repo info from URL
        const urlMatch = pageUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!urlMatch) {
            warn('Could not extract repo info from URL:', pageUrl);
            return { zipFiles, directories };
        }

        const [, owner, repo] = urlMatch;
        const repoBase = `/${owner}/${repo}`;

        log(`Parsing page: ${pageUrl}`);
        log(`Repo base: ${repoBase}`);

        // ========== STRATEGY 1: React Directory Rows (Primary Method) ==========
        // This matches the exact structure from your HTML examples
        const directoryRows = doc.querySelectorAll('tr.react-directory-row');
        log(`Found ${directoryRows.length} react-directory-row elements`);

        directoryRows.forEach((row, index) => {
            // Skip parent directory row
            if (row.querySelector('[data-testid="up-tree"]')) {
                return;
            }

            // Find the primary link - check multiple possible locations
            const linkSelectors = [
                '.react-directory-truncate a.Link--primary',
                '.react-directory-filename-cell a.Link--primary',
                '.react-directory-filename-column a.Link--primary',
                'a.Link--primary[href*="/blob/"]',
                'a.Link--primary[href*="/tree/"]'
            ];

            let link = null;
            for (const selector of linkSelectors) {
                link = row.querySelector(selector);
                if (link) break;
            }

            if (!link) {
                log(`Row ${index}: No link found`);
                return;
            }

            const href = link.getAttribute('href');
            if (!href || seenHrefs.has(href)) {
                return;
            }

            // Get filename from title attribute (most reliable) or text content
            const fileName = link.getAttribute('title') || link.textContent.trim();

            log(`Row ${index}: Found "${fileName}" -> ${href}`);

            // Check if it's a file (blob) or directory (tree)
            if (href.includes('/blob/')) {
                // It's a file - check if it's a ZIP
                if (fileName.toLowerCase().endsWith('.zip')) {
                    // Exclude GitHub's own archive downloads
                    if (!href.includes('/archive/') && !href.includes('/zipball/')) {
                        seenHrefs.add(href);

                        // Extract path after /blob/branch/
                        const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);
                        const filePath = pathMatch ? decodeURIComponent(pathMatch[1]) : fileName;

                        zipFiles.push({
                            name: fileName,
                            href: href,
                            fullUrl: 'https://github.com' + href,
                            path: filePath,
                            source: 'dom'
                        });

                        log(`  -> ZIP file found: ${fileName}`);
                    }
                }
            } else if (href.includes('/tree/')) {
                // It's a directory - check if it's a subdirectory (not just branch root)
                // Pattern: /owner/repo/tree/branch/path
                const treeMatch = href.match(/\/tree\/([^/]+)\/(.+)/);

                if (treeMatch) {
                    // Has a path after branch = it's a subdirectory
                    seenHrefs.add(href);
                    directories.push({
                        name: fileName,
                        href: href,
                        fullUrl: 'https://github.com' + href
                    });
                    log(`  -> Directory found: ${fileName}`);
                }
            }
        });

        // ========== STRATEGY 2: Table-based rows (fallback) ==========
        if (directoryRows.length === 0) {
            log('No react-directory-row found, trying table rows...');

            const tableRows = doc.querySelectorAll('table tbody tr');
            tableRows.forEach(row => {
                // Skip header rows and parent directory
                if (row.querySelector('th') || row.querySelector('[data-testid="up-tree"]')) {
                    return;
                }

                const link = row.querySelector('a[href*="/blob/"], a[href*="/tree/"]');
                if (!link) return;

                const href = link.getAttribute('href');
                if (!href || seenHrefs.has(href)) return;

                const fileName = link.getAttribute('title') || link.textContent.trim();

                if (href.includes('/blob/') && fileName.toLowerCase().endsWith('.zip')) {
                    if (!href.includes('/archive/')) {
                        seenHrefs.add(href);
                        const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);
                        zipFiles.push({
                            name: fileName,
                            href: href,
                            fullUrl: 'https://github.com' + href,
                            path: pathMatch ? decodeURIComponent(pathMatch[1]) : fileName,
                            source: 'dom'
                        });
                    }
                } else if (href.includes('/tree/')) {
                    const treeMatch = href.match(/\/tree\/([^/]+)\/(.+)/);
                    if (treeMatch) {
                        seenHrefs.add(href);
                        directories.push({
                            name: fileName,
                            href: href,
                            fullUrl: 'https://github.com' + href
                        });
                    }
                }
            });
        }

        // ========== STRATEGY 3: Direct link search (additional fallback) ==========
        // Search for any ZIP links we might have missed
        doc.querySelectorAll('a[href$=".zip"]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || seenHrefs.has(href)) return;
            if (!href.includes('/blob/')) return;
            if (href.includes('/archive/') || href.includes('/releases/')) return;

            seenHrefs.add(href);
            const fileName = link.getAttribute('title') || link.textContent.trim() || href.split('/').pop();
            const pathMatch = href.match(/\/blob\/[^/]+\/(.+)/);

            zipFiles.push({
                name: fileName,
                href: href,
                fullUrl: href.startsWith('http') ? href : 'https://github.com' + href,
                path: pathMatch ? decodeURIComponent(pathMatch[1]) : fileName,
                source: 'dom'
            });
            log(`Direct link: ZIP file found: ${fileName}`);
        });

        // ========== STRATEGY 4: JSON Payload (for SPA-loaded content) ==========
        doc.querySelectorAll('script[type="application/json"]').forEach(script => {
            try {
                const jsonText = script.textContent;
                if (!jsonText.includes('.zip') && !jsonText.includes('contentType')) return;

                const data = JSON.parse(jsonText);
                extractFromPayload(data, zipFiles, directories, seenHrefs, repoBase);
            } catch (e) {
                // Ignore JSON parse errors
            }
        });

        log(`Parse complete: ${zipFiles.length} ZIP files, ${directories.length} directories`);
        return { zipFiles, directories };
    }

    /**
     * Extract files from GitHub's JSON payload data
     */
    function extractFromPayload(data, zipFiles, directories, seenHrefs, repoBase) {
        if (!data || typeof data !== 'object') return;

        const processItem = (item) => {
            if (!item || typeof item !== 'object') return;

            // Check if this looks like a file/directory entry
            if (item.name && item.path && item.contentType) {
                const name = item.name;
                const path = item.path;

                // Determine branch from context or default
                const branch = 'main'; // Could be extracted from payload

                if (item.contentType === 'directory') {
                    const href = `${repoBase}/tree/${branch}/${path}`;
                    if (!seenHrefs.has(href)) {
                        seenHrefs.add(href);
                        directories.push({
                            name: name,
                            href: href,
                            fullUrl: 'https://github.com' + href
                        });
                    }
                } else if (item.contentType === 'file' && name.toLowerCase().endsWith('.zip')) {
                    const href = `${repoBase}/blob/${branch}/${path}`;
                    if (!seenHrefs.has(href)) {
                        seenHrefs.add(href);
                        zipFiles.push({
                            name: name,
                            href: href,
                            fullUrl: 'https://github.com' + href,
                            path: path,
                            source: 'dom'
                        });
                    }
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

    /**
     * Recursively scan directories via DOM
     */
    async function scanDOMRecursive(url, depth = 0, visited = new Set()) {
        // Normalize URL (remove trailing slash, query params)
        const normalizedUrl = url.split('?')[0].replace(/\/$/, '');

        // Avoid infinite loops
        if (visited.has(normalizedUrl)) {
            log(`Skipping already visited: ${normalizedUrl}`);
            return [];
        }
        visited.add(normalizedUrl);

        // Check depth limit
        if (depth > CONFIG.domMaxDepth) {
            log(`Max depth reached at: ${normalizedUrl}`);
            return [];
        }

        // Update progress
        const pathMatch = normalizedUrl.match(/\/tree\/[^/]+\/(.+)$/);
        const currentPath = pathMatch ? decodeURIComponent(pathMatch[1]) : 'root';
        progress.update(currentPath);

        // Fetch the page
        await delay(CONFIG.scanDelay);
        const result = await fetchPage(normalizedUrl);

        if (result.error) {
            warn(`Failed to fetch ${normalizedUrl}: ${result.error}`);
            progress.addError(`${currentPath}: ${result.error}`);
            return [];
        }

        // Parse the page
        const { zipFiles, directories } = parsePageForFiles(result.html, normalizedUrl);

        log(`Depth ${depth} | ${currentPath} | ${zipFiles.length} ZIPs, ${directories.length} dirs`);

        // Track found files
        zipFiles.forEach(() => progress.addFile());

        let allZipFiles = [...zipFiles];

        // Recursively scan subdirectories
        if (CONFIG.useDOMRecursive && directories.length > 0) {
            // Filter already visited
            const unvisitedDirs = directories.filter(d => {
                const normUrl = d.fullUrl.split('?')[0].replace(/\/$/, '');
                return !visited.has(normUrl);
            });

            if (unvisitedDirs.length > 0) {
                progress.addFolders(unvisitedDirs.length);
                log(`Queueing ${unvisitedDirs.length} subdirectories for scan`);

                // Process in chunks
                for (let i = 0; i < unvisitedDirs.length; i += CONFIG.maxConcurrent) {
                    const chunk = unvisitedDirs.slice(i, i + CONFIG.maxConcurrent);
                    const promises = chunk.map(dir =>
                        scanDOMRecursive(dir.fullUrl, depth + 1, visited)
                    );
                    const results = await Promise.all(promises);
                    results.forEach(files => {
                        allZipFiles = allZipFiles.concat(files);
                    });
                }
            }
        }

        return allZipFiles;
    }

    // ===================== API SCANNER =====================

    function fetchAPI(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'GitHub-ZIP-Checker'
                },
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            resolve({ data: JSON.parse(response.responseText), error: null });
                        } catch (e) {
                            resolve({ data: null, error: 'json_parse_error' });
                        }
                    } else if (response.status === 403) {
                        resolve({ data: null, error: 'rate_limit_exceeded' });
                    } else if (response.status === 404) {
                        resolve({ data: null, error: 'not_found' });
                    } else {
                        resolve({ data: null, error: 'api_error_' + response.status });
                    }
                },
                onerror: function() {
                    resolve({ data: null, error: 'network_error' });
                },
                ontimeout: function() {
                    resolve({ data: null, error: 'timeout' });
                },
                timeout: 20000
            });
        });
    }

    async function scanAPI(owner, repo, path = '', depth = 0) {
        if (depth > CONFIG.apiMaxDepth) {
            return { files: [], error: null };
        }

        const encodedPath = path ? encodeURIComponent(path).replace(/%2F/g, '/') : '';
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

        progress.update(path || 'root');
        await delay(CONFIG.scanDelay);

        const result = await fetchAPI(url);

        if (result.error) {
            return { files: [], error: result.error };
        }

        if (!Array.isArray(result.data)) {
            return { files: [], error: null };
        }

        let zipFiles = [];
        let directories = [];

        for (const item of result.data) {
            if (item.type === 'file' && item.name.toLowerCase().endsWith('.zip')) {
                zipFiles.push({
                    name: item.name,
                    path: item.path,
                    size: item.size,
                    href: item.html_url,
                    downloadUrl: item.download_url,
                    fullUrl: item.html_url,
                    source: 'api'
                });
                progress.addFile();
            } else if (item.type === 'dir' && CONFIG.apiRecursive) {
                directories.push(item.path);
            }
        }

        // Recursive scan
        if (CONFIG.apiRecursive && directories.length > 0) {
            progress.addFolders(directories.length);

            for (let i = 0; i < directories.length; i += CONFIG.maxConcurrent) {
                const chunk = directories.slice(i, i + CONFIG.maxConcurrent);
                const promises = chunk.map(dir => scanAPI(owner, repo, dir, depth + 1));
                const results = await Promise.all(promises);

                results.forEach(res => {
                    if (!res.error) {
                        zipFiles = zipFiles.concat(res.files);
                    } else {
                        progress.addError(`API: ${res.error}`);
                    }
                });
            }
        }

        return { files: zipFiles, error: null };
    }

    // ===================== MAIN CHECKER =====================

    async function checkForZipFiles(showPanel = true) {
        const repoInfo = getRepoInfo();
        if (!repoInfo) {
            warn('Not on a repository page');
            return null;
        }

        log('Starting scan for:', repoInfo);

        const button = document.getElementById('zip-checker-btn');
        const panel = document.getElementById('zip-checker-panel');

        // Show panel with progress
        if (panel) {
            panel.classList.add('show');
            panel.querySelector('.zip-panel-content').innerHTML = `
                <div class="zip-progress" id="zip-progress">
                    <div class="zip-progress-bar">
                        <div class="zip-progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="zip-progress-text">
                        <span>🔍 Initializing scan...</span>
                    </div>
                </div>
            `;
        }

        if (button) {
            button.classList.add('loading');
            button.innerHTML = '<span class="spinner">⏳</span> Scanning...';
        }

        // Reset progress
        progress.reset();

        const results = {
            dom: [],
            api: [],
            combined: [],
            errors: [],
            repoInfo: repoInfo,
            foldersScanned: 0
        };

        try {
            // Determine start URL
            let startUrl = repoInfo.baseUrl;
            if (repoInfo.branch && repoInfo.treePath) {
                startUrl = `${repoInfo.baseUrl}/tree/${repoInfo.branch}/${repoInfo.treePath}`;
            } else if (repoInfo.branch) {
                startUrl = `${repoInfo.baseUrl}/tree/${repoInfo.branch}`;
            }

            log('Scan starting from:', startUrl);

            // DOM Scan
            if (CONFIG.useDOMRecursive) {
                log('Starting DOM recursive scan...');
                results.dom = await scanDOMRecursive(startUrl, 0, new Set());
                log('DOM scan complete:', results.dom.length, 'files found');
            }

            // API Scan (if enabled)
            if (CONFIG.useAPI) {
                log('Starting API scan...');
                const apiResult = await scanAPI(
                    repoInfo.owner,
                    repoInfo.repo,
                    repoInfo.treePath
                );
                if (apiResult.error) {
                    results.errors.push('API: ' + apiResult.error);
                    warn('API scan error:', apiResult.error);
                } else {
                    results.api = apiResult.files;
                    log('API scan complete:', results.api.length, 'files found');
                }
            }
        } catch (error) {
            console.error('[ZIP Checker] Scan error:', error);
            results.errors.push('Error: ' + error.message);
        }

        // Combine and deduplicate results
        const seen = new Map();
        [...results.dom, ...results.api].forEach(file => {
            const key = (file.path || file.name).toLowerCase();
            if (!seen.has(key)) {
                seen.set(key, file);
            } else if (file.source === 'api' && seen.get(key).source === 'dom') {
                // Prefer API results (have more info like size)
                const existing = seen.get(key);
                seen.set(key, { ...existing, ...file, source: 'both' });
            }
        });
        results.combined = Array.from(seen.values());

        results.foldersScanned = progress.scannedFolders;
        results.foldersList = progress.foldersList;

        if (progress.errors.length > 0) {
            results.errors.push(...progress.errors.slice(0, 5));
        }

        // Reset button
        if (button) {
            button.classList.remove('loading');
            const count = results.combined.length;
            button.innerHTML = count > 0 ? `📦 Found ${count} ZIP` : '📦 Check for ZIP';
        }

        // Show results
        if (showPanel) {
            showResults(results);
        }

        log('Scan complete. Results:', results);
        return results;
    }

    // ===================== UI =====================

    function showResults(results) {
        const panel = document.getElementById('zip-checker-panel');
        if (!panel) return;

        let contentHTML = '';

        if (results.combined.length > 0) {
            contentHTML += `
                <div class="zip-status success">
                    ✅ Found <strong>${results.combined.length}</strong> ZIP file(s)
                    <br><small>Scanned ${results.foldersScanned} folder(s)</small>
                </div>
                <div class="zip-section" style="margin-top: 15px;">
                    <ul class="zip-list">
            `;

            results.combined.forEach(file => {
                const sizeStr = file.size ? formatSize(file.size) : '';
                const rawUrl = file.downloadUrl || file.fullUrl.replace('/blob/', '/raw/');
                const displayPath = file.path || '';
                const truncatedPath = displayPath.length > 40
                    ? '...' + displayPath.slice(-37)
                    : displayPath;

                contentHTML += `
                    <li class="zip-item">
                        <div class="zip-item-name">
                            <span>📦</span>
                            <a href="${file.fullUrl}" target="_blank" title="${file.name}">${file.name}</a>
                            <span class="zip-badge ${file.source}">${file.source.toUpperCase()}</span>
                        </div>
                        <div class="zip-item-meta">
                            <span title="${displayPath}">📁 ${truncatedPath}</span>
                            ${sizeStr ? `<span>💾 ${sizeStr}</span>` : ''}
                            <a href="${rawUrl}" target="_blank" style="color: #3fb950;">⬇️ Download</a>
                        </div>
                    </li>
                `;
            });

            contentHTML += '</ul></div>';
        } else {
            contentHTML += `
                <div class="zip-status empty">
                    📁 No ZIP files found<br>
                    <small>Scanned ${results.foldersScanned} folder(s)</small>
                </div>
            `;
        }

        // Warnings/Errors
        if (results.errors.length > 0) {
            const uniqueErrors = [...new Set(results.errors)];
            contentHTML += `
                <div class="zip-status warning" style="margin-top: 10px;">
                    ⚠️ ${uniqueErrors.slice(0, 3).join('<br>')}
                    ${uniqueErrors.length > 3 ? `<br><small>...and ${uniqueErrors.length - 3} more</small>` : ''}
                </div>
            `;
        }

        // Stats
        contentHTML += `
            <div class="zip-info">
                <div class="zip-stats">
                    <span class="zip-stat">🔍 DOM: ${results.dom.length}</span>
                    ${CONFIG.useAPI ? `<span class="zip-stat">🌐 API: ${results.api.length}</span>` : ''}
                    <span class="zip-stat">📊 Total: ${results.combined.length}</span>
                    <span class="zip-stat">📁 Folders: ${results.foldersScanned}</span>
                </div>
                <div>📍 ${results.repoInfo.owner}/${results.repoInfo.repo}${results.repoInfo.treePath ? '/' + results.repoInfo.treePath : ''}</div>
                ${results.foldersList.length > 0 ? `
                    <details class="zip-folders-scanned">
                        <summary style="cursor: pointer; color: #58a6ff;">📂 View scanned folders (${results.foldersList.length})</summary>
                        <div style="max-height: 120px; overflow-y: auto; margin-top: 8px; font-size: 10px; font-family: monospace;">
                            ${results.foldersList.map(f => `<div style="padding: 2px 0;">• ${f}</div>`).join('')}
                        </div>
                    </details>
                ` : ''}
            </div>
        `;

        panel.querySelector('.zip-panel-content').innerHTML = contentHTML;

        // Auto-hide
        if (CONFIG.autoHideDelay > 0) {
            setTimeout(() => panel.classList.remove('show'), CONFIG.autoHideDelay);
        }
    }

    function createUI() {
        // Remove existing
        const existing = document.getElementById('zip-checker-container');
        if (existing) existing.remove();

        if (!isRepoPage()) {
            log('Not a repository page, skipping UI creation');
            return;
        }

        log('Creating UI...');

        // Container
        const container = document.createElement('div');
        container.id = 'zip-checker-container';

        // Button
        if (CONFIG.showButton) {
            const button = document.createElement('button');
            button.id = 'zip-checker-btn';
            button.innerHTML = '📦 Check for ZIP';
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                checkForZipFiles(true);
            });
            container.appendChild(button);
        }

        // Panel
        const panel = document.createElement('div');
        panel.id = 'zip-checker-panel';
        panel.innerHTML = `
            <div class="zip-panel-header">
                <h4>📦 ZIP File Checker</h4>
                <button class="close-btn" id="zip-panel-close">✕</button>
            </div>
            <div class="zip-panel-content">
                <div class="zip-status empty">
                    Click the button to scan for ZIP files<br>
                    <small style="opacity: 0.7">Recursively searches all folders</small>
                </div>
            </div>
        `;
        container.appendChild(panel);

        document.body.appendChild(container);

        // Close button handler
        document.getElementById('zip-panel-close').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.remove('show');
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                panel.classList.remove('show');
            }
        });

        // Auto-check on load
        if (CONFIG.autoCheck) {
            setTimeout(() => checkForZipFiles(true), 1500);
        }

        log('UI created successfully');
    }

    // ===================== INITIALIZATION =====================

    function init() {
        log('Initializing script v3.2...');
        setTimeout(createUI, 800);
    }

    // Initial load
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // SPA Navigation handlers
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            log('URL changed, recreating UI...');
            setTimeout(createUI, 800);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Additional navigation event listeners
    window.addEventListener('popstate', () => setTimeout(createUI, 800));
    document.addEventListener('turbo:load', () => setTimeout(createUI, 500));
    document.addEventListener('pjax:end', () => setTimeout(createUI, 500));

    // Expose for debugging
    window.zipChecker = {
        check: checkForZipFiles,
        config: CONFIG,
        parseTest: (html) => parsePageForFiles(html, window.location.href)
    };

    log('Script loaded successfully - v3.2');

})();