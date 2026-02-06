// ==UserScript==
// @name         FOFA WS Spider
// @namespace    fws
// @version      1.8
// @match        *://fofa.info/result*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_cookie
// @connect      fofa.info
// ==/UserScript==

(function() {
    'use strict';

    const WS_URL = 'ws://127.0.0.1:8765';
    const DELAY = 2500;
    const PAGES = 6;
    const MAX_RETRY = 3;
    const RETRY_DELAY = 5000;
    const LOG_MAX = 100;

    let ws = null;
    let connected = false;
    let running = false;
    let autoStart = false;
    let visited = GM_getValue('visited', {});
    let jobQueue = GM_getValue('jobQueue', []);
    let logs = [];
    let stats = { total: 0, today: 0, new: 0, dup: 0, errors: 0 };

    function b64encode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function getQuery(doc) {
        const ta = doc.querySelector('textarea.custom-textarea');
        return ta ? ta.value.trim() : '';
    }

    function getStats(doc) {
        const s = {};
        const nav = doc.querySelector('.hsxa-meta-data-list-nav-left');
        if (nav) {
            const hl = nav.querySelectorAll('.hsxa-highlight-color');
            if (hl[0]) s.total_results = hl[0].textContent.trim();
            if (hl[1]) s.unique_ips = hl[1].textContent.trim();
            if (hl[2]) s.query_time = hl[2].textContent.trim();
            if (hl[3]) s.search_type = hl[3].textContent.trim();
            const fraud = nav.querySelector('.fraud-text .highlight-text');
            if (fraud) s.honeypot_excluded = fraud.textContent.trim();
        }
        return s;
    }

    function getSpiderLinks(doc) {
        const links = [];
        const seen = {};
        doc.querySelectorAll('.hsxa-list-main').forEach(section => {
            const titleEl = section.querySelector('.hsxa-list-title');
            const category = titleEl ? titleEl.textContent.trim() : '';
            section.querySelectorAll('a.hsxa-meta-data-stat-list-hover').forEach(a => {
                const href = a.getAttribute('href');
                if (href && href.includes('qbase64=') && !seen[href]) {
                    seen[href] = 1;
                    const countEl = a.closest('.hsxa-list-main-content')?.querySelector('span') ||
                                   a.closest('.hsxa-country-title')?.querySelector('.titleRight');
                    links.push({
                        href: href,
                        name: a.textContent.trim(),
                        count: countEl ? countEl.textContent.trim() : '',
                        category: category
                    });
                }
            });
        });
        return links;
    }

    function extractStatus(headerText) {
        if (!headerText) return null;
        const match = headerText.match(/^HTTP\/[\d.]+\s+(\d{3})/);
        return match ? match[1] : null;
    }

    function parse(doc, baseQuery) {
        const results = [];
        const query = getQuery(doc) || baseQuery;
        const pageStats = getStats(doc);

        const items = doc.querySelectorAll('.hsxa-meta-data-item');

        items.forEach(item => {
            const d = { search_query: query, ...pageStats };

            const clip = item.querySelector('[data-clipboard-text]');
            if (clip) d.addr = clip.dataset.clipboardText;

            const port = item.querySelector('.hsxa-port');
            if (port) d.port = port.textContent.trim();

            const protocol = item.querySelector('.hsxa-protocol');
            if (protocol) d.protocol = protocol.textContent.trim();

            const title = item.querySelector('.hsxa-one-line.item');
            if (title) d.title = title.textContent.trim();

            const ip = item.querySelector('.hsxa-jump-a');
            if (ip) d.ip = ip.textContent.trim();

            const fid = item.querySelector('.hsxa-fid-box');
            if (fid) d.fid = fid.textContent.trim();

            const locs = item.querySelectorAll('.split-oblique-line');
            if (locs.length) {
                const p = locs[0].parentElement;
                const locLinks = p.querySelectorAll('.hsxa-jump-a');
                if (locLinks[0]) d.country = locLinks[0].textContent.trim();
                if (locLinks[1]) d.region = locLinks[1].textContent.trim();
                if (locLinks[2]) d.city = locLinks[2].textContent.trim();
            }

            const asn = item.querySelector('a[href*="asn="]');
            if (asn) d.asn = asn.textContent.trim();

            const org = item.querySelector('a[href*="org="]');
            if (org) d.org = org.textContent.trim();

            const ps = item.querySelectorAll('.hsxa-meta-data-list-main-left p');
            ps.forEach(p => {
                const t = p.textContent.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(t)) d.date = t;
            });

            const prod = item.querySelector('.hsxa-list-span');
            if (prod) d.product = prod.textContent.trim();

            const hdr = item.querySelector('.el-scrollbar__view span');
            if (hdr) {
                d.header = hdr.textContent.trim();
                d.http_status = extractStatus(d.header);
            }

            const hh = item.querySelector('a[href*="header_hash="]');
            if (hh) d.header_hash = hh.textContent.trim();

            const bh = item.querySelector('a[href*="banner_hash="]');
            if (bh) d.banner_hash = bh.textContent.trim();

            if (d.addr) results.push(d);
        });
        return results;
    }

    function send(data) {
        if (ws && connected && data.length > 0) {
            data.forEach(d => ws.send(JSON.stringify(d)));
        }
    }

    function sendCmd(cmd, data = {}) {
        if (ws && connected) {
            ws.send(JSON.stringify({ cmd, ...data }));
        }
    }

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        logs.unshift({ time, msg, type });
        if (logs.length > LOG_MAX) logs.pop();
        renderLogs();
    }

    function isValidPage(doc) {
        // Check for data items OR pagination OR the main content area
        const hasItems = doc.querySelector('.hsxa-meta-data-item') !== null;
        const hasPager = doc.querySelector('.el-pager') !== null;
        const hasGroup = doc.querySelector('.el-checkbox-group') !== null;
        return hasItems || hasPager || hasGroup;
    }

    async function fetchWithRetry(url, baseQuery, retries = MAX_RETRY) {
        for (let i = 0; i < retries; i++) {
            try {
                const result = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Cookie': document.cookie
                        },
                        timeout: 30000,
                        onload: x => {
                            if (x.status === 200) {
                                const doc = new DOMParser().parseFromString(x.responseText, 'text/html');
                                const items = doc.querySelectorAll('.hsxa-meta-data-item');
                                log(`Fetched: ${items.length} items from ${url.split('?')[0]}`, 'info');

                                if (items.length > 0 || isValidPage(doc)) {
                                    resolve(doc);
                                } else {
                                    // Check if it's a login page or error
                                    const bodyText = doc.body?.textContent || '';
                                    if (bodyText.includes('登录') || bodyText.includes('login')) {
                                        reject(new Error('Login required'));
                                    } else {
                                        reject(new Error(`No items found (page size: ${x.responseText.length})`));
                                    }
                                }
                            } else {
                                reject(new Error(`HTTP ${x.status}`));
                            }
                        },
                        onerror: () => reject(new Error('Network error')),
                        ontimeout: () => reject(new Error('Timeout'))
                    });
                });
                return result;
            } catch (e) {
                stats.errors++;
                if (i < retries - 1) {
                    log(`Retry ${i+1}: ${e.message}`, 'warn');
                    sendCmd('error', { msg: `Retry ${i+1}/${retries-1}: ${e.message}`, url });
                    await sleep(RETRY_DELAY);
                } else {
                    log(`Failed: ${e.message}`, 'error');
                    sendCmd('error', { msg: `Failed: ${e.message}`, url });
                    return null;
                }
            }
        }
        return null;
    }

    async function fetchUrl(url, baseQuery) {
        const fullUrl = url.startsWith('http') ? url : 'https://fofa.info' + url;
        const doc = await fetchWithRetry(fullUrl, baseQuery);
        if (!doc) return { results: [], links: [] };
        return { results: parse(doc, baseQuery), links: getSpiderLinks(doc) };
    }

    async function fetchPage(baseUrl, page, baseQuery) {
        const fullUrl = baseUrl.startsWith('http') ? baseUrl : 'https://fofa.info' + baseUrl;
        const u = new URL(fullUrl);
        u.searchParams.set('page', page);
        u.searchParams.set('page_size', '10');
        const doc = await fetchWithRetry(u.href, baseQuery);
        return doc ? parse(doc, baseQuery) : [];
    }

    function handleWSMessage(data) {
        if (data.cmd === 'add_jobs') {
            const queries = data.queries || [];
            let added = 0;
            queries.forEach(q => {
                if (q && !jobQueue.includes(q)) {
                    jobQueue.push(q);
                    added++;
                }
            });
            GM_setValue('jobQueue', jobQueue);
            updateUI();
            log(`Added ${added} jobs (total: ${jobQueue.length})`, 'info');
            sendCmd('jobs_added', { added, total: jobQueue.length });

            if (autoStart && !running && jobQueue.length > 0) {
                log('Auto-starting spider...', 'info');
                setTimeout(() => spiderMulti(), 1000);
            }
        } else if (data.cmd === 'clear_jobs') {
            jobQueue = [];
            GM_setValue('jobQueue', []);
            updateUI();
            log('Job queue cleared', 'info');
        } else if (data.cmd === 'get_queue') {
            sendCmd('queue_status', { jobs: jobQueue, count: jobQueue.length, running });
        } else if (data.cmd === 'start_spider') {
            if (!running && jobQueue.length > 0) {
                log('Remote start command received', 'info');
                setTimeout(() => spiderMulti(), 500);
            } else if (running) {
                log('Spider already running', 'warn');
            } else {
                log('No jobs in queue', 'warn');
            }
        } else if (data.cmd === 'stop_spider') {
            if (running) {
                running = false;
                log('Stop command received', 'warn');
            }
        }
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }

        try {
            ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                connected = true;
                updateUI();
                log('Connected to server', 'ok');
                sendCmd('client_ready', { type: 'browser', jobs: jobQueue.length, autoStart });
            };

            ws.onclose = () => {
                connected = false;
                updateUI();
                log('Disconnected - reconnecting...', 'warn');
                setTimeout(connect, 5000);
            };

            ws.onerror = () => {
                connected = false;
                log('Connection error', 'error');
            };

            ws.onmessage = m => {
                try {
                    const data = JSON.parse(m.data);
                    if (data.cmd) {
                        handleWSMessage(data);
                    } else if (data.status) {
                        if (data.new !== undefined) {
                            if (data.new) stats.new++;
                            else stats.dup++;
                            stats.total = data.total || stats.total;
                            stats.today = data.today || stats.today;
                        }
                        updateStats();
                    }
                } catch {
                    const isNew = m.data.startsWith('NEW');
                    const isDup = m.data.startsWith('DUP');
                    if (isNew) stats.new++;
                    if (isDup) stats.dup++;

                    const match = m.data.match(/T:(\d+)\s+D:(\d+)/);
                    if (match) {
                        stats.total = parseInt(match[1]);
                        stats.today = parseInt(match[2]);
                    }
                    updateStats();
                    log(m.data, isNew ? 'ok' : 'info');
                }
            };
        } catch (e) {
            log('Connection failed: ' + e.message, 'error');
        }
    }

    // Test parsing on current page
    function testParse() {
        log('Testing parse on current page...', 'info');
        const results = parse(document, getQuery(document));
        const links = getSpiderLinks(document);
        log(`Found ${results.length} items, ${links.length} spider links`, results.length > 0 ? 'ok' : 'error');

        if (results.length > 0) {
            log(`First: ${results[0].addr}`, 'info');
        }
        if (links.length > 0) {
            log(`Links: ${links.map(l => l.name).slice(0,3).join(', ')}...`, 'info');
        }

        // Send test results if connected
        if (connected && results.length > 0) {
            send(results.slice(0, 3)); // Send first 3 as test
            log('Sent 3 test results to server', 'ok');
        }
    }

    async function collect() {
        if (!connected) { connect(); return; }
        if (running) { running = false; return; }
        running = true;
        updateUI();

        const baseQuery = getQuery(document);
        const baseUrl = location.pathname + location.search;

        log(`Collecting: ${baseQuery.substring(0, 50)}...`, 'info');

        // First parse current page directly (already loaded)
        const currentResults = parse(document, baseQuery);
        log(`Current page: ${currentResults.length} items`, currentResults.length > 0 ? 'ok' : 'warn');
        send(currentResults);

        // Then fetch remaining pages
        for (let i = 2; i <= PAGES && running; i++) {
            setStatus(`Page ${i}/${PAGES}`);
            await sleep(DELAY);
            const res = await fetchPage(baseUrl, i, baseQuery);
            log(`Page ${i}: ${res.length} results`, res.length > 0 ? 'ok' : 'warn');
            send(res);
        }

        log('Collection complete', 'ok');
        running = false;
        updateUI();
    }

    async function spiderSingleQuery(query, jobIdx, totalJobs) {
        const b64query = b64encode(query);
        const baseUrl = `/result?qbase64=${b64query}`;

        log(`[Job ${jobIdx}/${totalJobs}] ${query.substring(0, 40)}...`, 'info');
        sendCmd('job_start', { query, idx: jobIdx, total: totalJobs });
        setStatus(`Job ${jobIdx}/${totalJobs}`);

        // Fetch first page
        const { results: firstResults, links } = await fetchUrl(baseUrl, query);
        log(`First page: ${firstResults.length} items, ${links.length} links`, 'info');
        send(firstResults);

        // Fetch pages 2-6 of main query
        for (let p = 2; p <= PAGES && running; p++) {
            setStatus(`J${jobIdx}:P${p}`);
            await sleep(DELAY);
            const res = await fetchPage(baseUrl, p, query);
            log(`Main P${p}: ${res.length} results`, res.length > 0 ? 'ok' : 'warn');
            send(res);
        }

        // Process spider links
        const queue = [];
        const processed = {};

        links.forEach(l => {
            if (!visited[l.href] && !processed[l.href]) {
                queue.push(l);
                processed[l.href] = 1;
            }
        });

        log(`Spider queue: ${queue.length} links`, 'info');
        sendCmd('spider_start', { query, links: queue.length });

        let linkIdx = 0;
        while (queue.length > 0 && running) {
            const link = queue.shift();
            linkIdx++;

            if (visited[link.href]) continue;
            visited[link.href] = Date.now();
            GM_setValue('visited', visited);

            log(`[L${linkIdx}] ${link.category}: ${link.name}`, 'info');
            sendCmd('spider_link', { name: link.name, category: link.category, idx: linkIdx, query });

            for (let p = 1; p <= PAGES && running; p++) {
                setStatus(`J${jobIdx}:L${linkIdx}:P${p}`);
                await sleep(DELAY);
                const res = await fetchPage(link.href, p, query);
                log(`L${linkIdx}P${p}: ${res.length}`, res.length > 0 ? 'ok' : 'warn');
                send(res);
            }

            // Get more links from this page
            const { links: newLinks } = await fetchUrl(link.href, query);
            let newCount = 0;
            newLinks.forEach(l => {
                if (!visited[l.href] && !processed[l.href]) {
                    queue.push(l);
                    processed[l.href] = 1;
                    newCount++;
                }
            });
            if (newCount > 0) log(`+${newCount} new links (queue: ${queue.length})`, 'info');
        }

        log(`Job ${jobIdx} done: ${linkIdx} links`, 'ok');
        sendCmd('spider_done', { query, processed: linkIdx });
    }

    async function spider() {
        if (!connected) { connect(); return; }
        if (running) { running = false; return; }
        running = true;
        updateUI();

        const currentQuery = getQuery(document);
        if (!currentQuery) {
            log('No query found on page', 'error');
            running = false;
            updateUI();
            return;
        }

        log(`Spider: ${currentQuery}`, 'info');
        await spiderSingleQuery(currentQuery, 1, 1);

        running = false;
        updateUI();
    }

    async function spiderMulti() {
        if (jobQueue.length === 0) {
            log('No jobs in queue', 'warn');
            return;
        }
        if (!connected) {
            log('Not connected, connecting...', 'warn');
            connect();
            await sleep(2000);
            if (!connected) {
                log('Failed to connect', 'error');
                return;
            }
        }
        if (running) { running = false; return; }
        running = true;
        updateUI();

        const totalJobs = jobQueue.length;
        log(`Starting ${totalJobs} jobs`, 'info');
        sendCmd('batch_start', { total: totalJobs });

        let jobIdx = 0;
        while (jobQueue.length > 0 && running) {
            jobIdx++;
            const query = jobQueue.shift();
            GM_setValue('jobQueue', jobQueue);
            updateUI();

            await spiderSingleQuery(query, jobIdx, totalJobs);

            if (jobQueue.length > 0 && running) {
                log(`Waiting before next job...`, 'info');
                await sleep(DELAY * 2);
            }
        }

        log(`Batch complete: ${jobIdx} jobs`, 'ok');
        sendCmd('batch_done', { processed: jobIdx });
        running = false;
        updateUI();
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function setStatus(text) {
        const el = document.getElementById('fc-status');
        if (el) el.textContent = text;
    }

    function updateStats() {
        const el = document.getElementById('fc-stats');
        if (el) {
            el.innerHTML = `T:${stats.total} D:${stats.today} | +${stats.new} =${stats.dup} E:${stats.errors}`;
        }
    }

    function renderLogs() {
        const el = document.getElementById('fc-log');
        if (!el) return;

        el.innerHTML = logs.slice(0, 50).map(l => {
            const color = { ok: '#0f0', warn: '#ff0', error: '#f00', info: '#aaa' }[l.type] || '#aaa';
            return `<div style="color:${color}">[${l.time}] ${l.msg}</div>`;
        }).join('');
    }

    function updateUI() {
        const connEl = document.getElementById('fc-conn');
        const runEl = document.getElementById('fc-run');
        const jobsEl = document.getElementById('fc-jobs-count');
        const visitedEl = document.getElementById('fc-visited');

        if (connEl) {
            connEl.textContent = connected ? 'ON' : 'OFF';
            connEl.style.color = connected ? '#0f0' : '#f00';
        }
        if (runEl) {
            runEl.textContent = running ? 'RUNNING' : 'IDLE';
            runEl.style.color = running ? '#0f0' : '#888';
        }
        if (jobsEl) {
            jobsEl.textContent = jobQueue.length;
        }
        if (visitedEl) {
            visitedEl.textContent = Object.keys(visited).length;
        }
    }

    function createUI() {
        const panelOpen = GM_getValue('panelOpen', true);

        const container = document.createElement('div');
        container.id = 'fc-container';
        container.innerHTML = `
            <style>
                #fc-container { position:fixed; top:10px; right:10px; z-index:99999; font-family:monospace; font-size:11px; }
                #fc-header { background:#111; padding:5px 10px; cursor:pointer; display:flex; gap:10px; align-items:center; border:1px solid #333; color:#fff; }
                #fc-panel { background:#111; border:1px solid #333; border-top:none; width:420px; display:${panelOpen ? 'block' : 'none'}; }
                #fc-toolbar { padding:5px; border-bottom:1px solid #333; display:flex; gap:5px; flex-wrap:wrap; }
                #fc-toolbar button { background:#222; color:#fff; border:1px solid #444; padding:3px 8px; cursor:pointer; font-size:10px; }
                #fc-toolbar button:hover { background:#333; }
                #fc-toolbar button.active { background:#050; border-color:#0a0; }
                #fc-info { padding:5px; border-bottom:1px solid #333; color:#888; }
                #fc-log { height:200px; overflow-y:auto; padding:5px; font-size:10px; background:#0a0a0a; }
                #fc-input { display:flex; border-top:1px solid #333; }
                #fc-input input { flex:1; background:#000; color:#0f0; border:none; padding:5px; font-family:monospace; font-size:11px; }
                #fc-input button { background:#222; color:#fff; border:none; padding:5px 10px; cursor:pointer; }
            </style>
            <div id="fc-header">
                <span style="color:#0ff">FOFA</span>
                <span>Conn:<span id="fc-conn">OFF</span></span>
                <span id="fc-run">IDLE</span>
                <span>Jobs:<span id="fc-jobs-count">0</span></span>
                <span id="fc-status" style="color:#ff0">-</span>
            </div>
            <div id="fc-panel">
                <div id="fc-toolbar">
                    <button id="btn-connect">Connect</button>
                    <button id="btn-test">Test</button>
                    <button id="btn-collect">Collect</button>
                    <button id="btn-spider">Spider</button>
                    <button id="btn-run-queue">Run Queue</button>
                    <button id="btn-stop">Stop</button>
                    <button id="btn-clear-log">ClearLog</button>
                    <button id="btn-clear-visited">ClearVisit</button>
                    <button id="btn-autostart">Auto:OFF</button>
                </div>
                <div id="fc-info">
                    <span id="fc-stats">T:0 D:0 | +0 =0 E:0</span>
                    <span style="float:right">Visited: <span id="fc-visited">${Object.keys(visited).length}</span></span>
                </div>
                <div id="fc-log"></div>
                <div id="fc-input">
                    <input type="text" id="fc-query" placeholder="Add query to queue...">
                    <button id="btn-add-query">Add</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // Toggle panel
        document.getElementById('fc-header').onclick = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const panel = document.getElementById('fc-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            GM_setValue('panelOpen', panel.style.display !== 'none');
        };

        // Event handlers
        document.getElementById('btn-connect').onclick = (e) => { e.stopPropagation(); connect(); };
        document.getElementById('btn-test').onclick = (e) => { e.stopPropagation(); testParse(); };
        document.getElementById('btn-collect').onclick = (e) => { e.stopPropagation(); collect(); };
        document.getElementById('btn-spider').onclick = (e) => { e.stopPropagation(); spider(); };
        document.getElementById('btn-run-queue').onclick = (e) => { e.stopPropagation(); spiderMulti(); };
        document.getElementById('btn-stop').onclick = (e) => {
            e.stopPropagation();
            running = false;
            log('Stopped by user', 'warn');
            updateUI();
        };
        document.getElementById('btn-clear-log').onclick = (e) => {
            e.stopPropagation();
            logs = [];
            stats = { total: 0, today: 0, new: 0, dup: 0, errors: 0 };
            renderLogs();
            updateStats();
        };
        document.getElementById('btn-clear-visited').onclick = (e) => {
            e.stopPropagation();
            if (confirm('Clear all visited links?')) {
                visited = {};
                GM_setValue('visited', {});
                log('Visited links cleared', 'info');
                updateUI();
            }
        };
        document.getElementById('btn-autostart').onclick = function(e) {
            e.stopPropagation();
            autoStart = !autoStart;
            this.textContent = `Auto:${autoStart ? 'ON' : 'OFF'}`;
            this.classList.toggle('active', autoStart);
            log(`Autostart: ${autoStart ? 'ON' : 'OFF'}`, 'info');
        };
        document.getElementById('btn-add-query').onclick = (e) => {
            e.stopPropagation();
            const input = document.getElementById('fc-query');
            const query = input.value.trim();
            if (query && !jobQueue.includes(query)) {
                jobQueue.push(query);
                GM_setValue('jobQueue', jobQueue);
                updateUI();
                log(`Added: ${query}`, 'ok');
                input.value = '';
            }
        };
        document.getElementById('fc-query').onkeypress = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-add-query').click();
            }
        };

        updateUI();
        log('UI ready', 'info');

        // Auto-connect after short delay
        setTimeout(connect, 1500);
    }

    // Wait for page to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();