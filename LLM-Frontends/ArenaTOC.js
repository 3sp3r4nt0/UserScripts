// ==UserScript==
// @name         Arena Chat TOC Navigator v4.3
// @namespace    arena-toc-navigator
// @version      4.3.0
// @description  Enhanced TOC with per-conversation favorites, copy, and robust UX
// @author       3sp3r4nt0
// @match        https://arena.ai/*
// @match        https://chat.lmsys.org/*
// @match        https://arena.lmsys.org/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = Object.freeze({
        STORAGE_PREFIX: 'arena-toc-v4',
        DEBOUNCE_DELAY: 300,
        INIT_RETRY_DELAY: 500,
        INIT_MAX_RETRIES: 20,
        SCROLL_THROTTLE: 100,
        OBSERVER_DEBOUNCE: 400,
        PANEL_WIDTH: 280,
        PANEL_WIDTH_MOBILE: 260,
        TOAST_DURATION: 2500,
    });

    const DEFAULT_PREFS = Object.freeze({
        collapsed: true,
        showFavOnly: false,
        panelWidth: CONFIG.PANEL_WIDTH
    });

    const SELECTORS = Object.freeze({
        CHAT_CONTAINER: 'ol[class*="flex-col-reverse"]',
        USER_MESSAGE: '.group.self-end',
        AI_MESSAGE: '.bg-surface-primary',
        PROSE: '.prose',
        MODEL_NAME: 'button .truncate',
        CODE_BLOCK: '[data-code-block], pre',
        CODE_ELEMENT: 'code',
        LANG_INDICATOR: '[class*="text-text-secondary"]',
        CONV_ID_ATTR: '[data-conversation-id]'
    });

    // ============================================================
    // UTILITIES
    // ============================================================
    const Utils = {
        debounce(fn, wait) {
            let timeout = null;
            return function(...args) {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(() => {
                    timeout = null;
                    fn.apply(this, args);
                }, wait);
            };
        },

        throttle(fn, wait) {
            let inThrottle = false;
            let lastArgs = null;

            return function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => {
                        inThrottle = false;
                        if (lastArgs) {
                            fn.apply(this, lastArgs);
                            lastArgs = null;
                        }
                    }, wait);
                } else {
                    lastArgs = args;
                }
            };
        },

        hashCode(str) {
            if (!str || typeof str !== 'string') return '0';
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        },

        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        safeJsonParse(str, fallback = null) {
            if (str === null || str === undefined || str === '') {
                return fallback;
            }
            try {
                const parsed = JSON.parse(str);
                return parsed !== null ? parsed : fallback;
            } catch (e) {
                console.warn('[TOC] JSON parse error:', e);
                return fallback;
            }
        },

        withDefaults(obj, defaults) {
            if (!obj || typeof obj !== 'object') return { ...defaults };
            return { ...defaults, ...obj };
        },

        async copyToClipboard(text) {
            if (!text) return false;

            try {
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(text, 'text');
                    return true;
                }

                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(text);
                    return true;
                }

                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                return success;
            } catch (e) {
                console.error('[TOC] Copy failed:', e);
                return false;
            }
        },

        $(selector, parent = document) {
            try {
                return parent.querySelector(selector);
            } catch {
                return null;
            }
        },

        $$(selector, parent = document) {
            try {
                return Array.from(parent.querySelectorAll(selector));
            } catch {
                return [];
            }
        }
    };

    // ============================================================
    // CONVERSATION MANAGER
    // ============================================================
    const ConversationManager = {
        _currentId: null,
        _listeners: new Set(),

        getCurrentId() {
            try {
                const pathMatch = window.location.pathname.match(/\/(?:chat|c|conversation)\/([a-zA-Z0-9_-]+)/);
                if (pathMatch && pathMatch[1]) return pathMatch[1];

                const urlParams = new URLSearchParams(window.location.search);
                const idFromParams = urlParams.get('id') || urlParams.get('chat') || urlParams.get('c');
                if (idFromParams) return idFromParams;

                const chatContainer = Utils.$(SELECTORS.CONV_ID_ATTR);
                if (chatContainer?.dataset?.conversationId) {
                    return chatContainer.dataset.conversationId;
                }

                const ol = Utils.$(SELECTORS.CHAT_CONTAINER);
                if (ol) {
                    const firstMsg = Utils.$(SELECTORS.PROSE, ol);
                    if (firstMsg?.textContent) {
                        return 'conv-' + Utils.hashCode(firstMsg.textContent.slice(0, 100));
                    }
                }

                return 'session-' + Utils.hashCode(window.location.pathname + '-' + Date.now().toString(36));
            } catch (e) {
                console.error('[TOC] Error getting conversation ID:', e);
                return 'fallback-' + Date.now().toString(36);
            }
        },

        getId() {
            if (!this._currentId) {
                this._currentId = this.getCurrentId();
            }
            return this._currentId;
        },

        refresh() {
            const oldId = this._currentId;
            this._currentId = this.getCurrentId();

            if (oldId && oldId !== this._currentId) {
                this._notifyListeners();
                return true;
            }
            return false;
        },

        onChange(callback) {
            if (typeof callback === 'function') {
                this._listeners.add(callback);
            }
            return () => this._listeners.delete(callback);
        },

        _notifyListeners() {
            this._listeners.forEach(cb => {
                try {
                    cb(this._currentId);
                } catch (e) {
                    console.error('[TOC] Listener error:', e);
                }
            });
        },

        reset() {
            this._currentId = null;
        }
    };

    // ============================================================
    // STORAGE MANAGER
    // ============================================================
    const Storage = {
        _cache: new Map(),

        _getConvKey(type) {
            const convId = ConversationManager.getId();
            return `${CONFIG.STORAGE_PREFIX}-${type}-${convId}`;
        },

        _getGlobalKey(type) {
            return `${CONFIG.STORAGE_PREFIX}-global-${type}`;
        },

        loadFavorites() {
            const key = this._getConvKey('favorites');

            if (this._cache.has(key)) {
                const cached = this._cache.get(key);
                return new Map(cached);
            }

            try {
                const data = localStorage.getItem(key);
                const parsed = Utils.safeJsonParse(data, {});

                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return new Map();
                }

                const entries = Object.entries(parsed);
                const map = new Map(entries);

                this._cache.set(key, entries);
                return map;
            } catch (e) {
                console.error('[TOC] Failed to load favorites:', e);
                return new Map();
            }
        },

        saveFavorites(favoritesMap) {
            if (!(favoritesMap instanceof Map)) {
                console.warn('[TOC] Invalid favorites map');
                return;
            }

            const key = this._getConvKey('favorites');

            try {
                const entries = Array.from(favoritesMap.entries());
                const obj = Object.fromEntries(entries);
                localStorage.setItem(key, JSON.stringify(obj));
                this._cache.set(key, entries);
            } catch (e) {
                console.error('[TOC] Failed to save favorites:', e);
            }
        },

        loadPrefs() {
            const key = this._getGlobalKey('prefs');

            try {
                const data = localStorage.getItem(key);
                const parsed = Utils.safeJsonParse(data, null);
                return Utils.withDefaults(parsed, DEFAULT_PREFS);
            } catch (e) {
                console.error('[TOC] Failed to load prefs:', e);
                return { ...DEFAULT_PREFS };
            }
        },

        savePrefs(prefs) {
            if (!prefs || typeof prefs !== 'object') {
                console.warn('[TOC] Invalid prefs object');
                return;
            }

            const key = this._getGlobalKey('prefs');

            try {
                const toSave = Utils.withDefaults(prefs, DEFAULT_PREFS);
                localStorage.setItem(key, JSON.stringify(toSave));
            } catch (e) {
                console.error('[TOC] Failed to save prefs:', e);
            }
        },

        clearCache() {
            this._cache.clear();
        },

        clearAll() {
            const prefix = CONFIG.STORAGE_PREFIX;
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            this._cache.clear();
        }
    };

    // ============================================================
    // MESSAGE PARSER (FIXED: Code block deduplication)
    // ============================================================
    const MessageParser = {
        parseAll() {
            const messages = [];

            try {
                const container = Utils.$(SELECTORS.CHAT_CONTAINER);
                if (!container) {
                    return messages;
                }

                const children = Array.from(container.children || []);

                for (let i = children.length - 1; i >= 0; i--) {
                    const el = children[i];

                    if (this._shouldSkip(el)) continue;

                    const msg = this._parseElement(el);
                    if (msg) {
                        msg.index = messages.length + 1;
                        msg.id = this._generateMsgId(msg);
                        messages.push(msg);
                    }
                }
            } catch (e) {
                console.error('[TOC] Parse error:', e);
            }

            return messages;
        },

        _shouldSkip(el) {
            if (!el || !el.classList) return true;
            if (el.classList.contains('h-0')) return true;
            if (el.tagName === 'H2') return true;
            if (!el.children || el.children.length === 0) return true;
            return false;
        },

        _parseElement(el) {
            try {
                if (el.classList.contains('group') && el.classList.contains('self-end')) {
                    return this._parseUserMessage(el);
                }

                if (el.classList.contains('bg-surface-primary')) {
                    const prose = Utils.$(SELECTORS.PROSE, el);
                    if (prose) {
                        return this._parseAssistantMessage(el);
                    }
                }
            } catch (e) {
                console.warn('[TOC] Error parsing element:', e);
            }

            return null;
        },

        _parseUserMessage(el) {
            const prose = Utils.$(SELECTORS.PROSE, el);
            if (!prose) return null;

            const { text, codeBlocks, hasCode } = this._extractContent(prose);
            if (!text || !text.trim()) return null;

            return {
                role: 'user',
                modelName: 'You',
                preview: text.slice(0, 120).trim(),
                fullText: text,
                hasCode,
                codeBlocks,
                element: el
            };
        },

        _parseAssistantMessage(el) {
            const prose = Utils.$(SELECTORS.PROSE, el);
            if (!prose) return null;

            let modelName = 'AI';
            const modelBtn = Utils.$(SELECTORS.MODEL_NAME, el);
            if (modelBtn?.textContent) {
                modelName = modelBtn.textContent.trim() || 'AI';
            }

            const { text, codeBlocks, hasCode } = this._extractContent(prose);
            if (!text || !text.trim()) return null;

            return {
                role: 'assistant',
                modelName,
                preview: text.slice(0, 120).trim(),
                fullText: text,
                hasCode,
                codeBlocks,
                element: el
            };
        },

        /**
         * FIXED: Filter to only process outermost code blocks
         * This prevents duplicates when structure is nested like:
         * <div data-code-block><pre><code>...</code></pre></div>
         */
        _extractContent(proseEl) {
            const codeBlocks = [];
            let hasCode = false;

            try {
                // Get all potential code blocks
                const allBlocks = Utils.$$(SELECTORS.CODE_BLOCK, proseEl);

                // Filter to only outermost blocks (not nested inside another code block)
                const outermostBlocks = allBlocks.filter(block => {
                    let parent = block.parentElement;
                    while (parent && parent !== proseEl) {
                        // Check if parent is also a code block
                        if (allBlocks.includes(parent)) {
                            return false; // This block is nested, skip it
                        }
                        parent = parent.parentElement;
                    }
                    return true;
                });

                // Extract code from outermost blocks only
                outermostBlocks.forEach((block, idx) => {
                    hasCode = true;
                    const codeEl = Utils.$(SELECTORS.CODE_ELEMENT, block) || block;
                    const langEl = Utils.$(SELECTORS.LANG_INDICATOR, block);

                    codeBlocks.push({
                        id: idx,
                        language: langEl?.textContent?.trim() || 'code',
                        content: codeEl?.textContent?.trim() || ''
                    });
                });

                // Get text content with code blocks replaced by placeholders
                const clone = proseEl.cloneNode(true);
                const cloneAllBlocks = Utils.$$(SELECTORS.CODE_BLOCK, clone);

                // Filter clone blocks the same way
                const cloneOutermost = cloneAllBlocks.filter(block => {
                    let parent = block.parentElement;
                    while (parent && parent !== clone) {
                        if (cloneAllBlocks.includes(parent)) {
                            return false;
                        }
                        parent = parent.parentElement;
                    }
                    return true;
                });

                cloneOutermost.forEach((block, idx) => {
                    const placeholder = document.createElement('span');
                    placeholder.textContent = ` [code${idx + 1}] `;
                    block.replaceWith(placeholder);
                });

                const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();

                return { text, codeBlocks, hasCode };
            } catch (e) {
                console.warn('[TOC] Extract content error:', e);
                return { text: proseEl?.textContent || '', codeBlocks: [], hasCode: false };
            }
        },

        _generateMsgId(msg) {
            const content = `${msg.role}-${msg.index}-${(msg.preview || '').slice(0, 30)}`;
            return Utils.hashCode(content);
        }
    };

    // ============================================================
    // STYLES
    // ============================================================
    const STYLES = `
        :root {
            --toc-bg: #ffffff;
            --toc-bg-alt: #f8fafc;
            --toc-bg-hover: #f1f5f9;
            --toc-border: #e2e8f0;
            --toc-text: #0f172a;
            --toc-text-secondary: #475569;
            --toc-text-muted: #94a3b8;
            --toc-accent: #3b82f6;
            --toc-accent-bg: rgba(59, 130, 246, 0.1);
            --toc-success: #10b981;
            --toc-success-bg: rgba(16, 185, 129, 0.1);
            --toc-warning: #f59e0b;
            --toc-warning-bg: rgba(245, 158, 11, 0.12);
            --toc-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
            --toc-radius: 12px;
            --toc-radius-sm: 8px;
            --toc-transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .dark, [data-theme="dark"], html[class*="dark"] {
            --toc-bg: #18181b;
            --toc-bg-alt: #1f1f23;
            --toc-bg-hover: #27272a;
            --toc-border: #3f3f46;
            --toc-text: #fafafa;
            --toc-text-secondary: #a1a1aa;
            --toc-text-muted: #71717a;
            --toc-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5);
        }

        #arena-toc-panel {
            position: fixed;
            right: 16px;
            top: 72px;
            width: 280px;
            max-height: calc(100vh - 100px);
            background: var(--toc-bg);
            border: 1px solid var(--toc-border);
            border-radius: var(--toc-radius);
            box-shadow: var(--toc-shadow);
            z-index: 99999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: width var(--toc-transition),
                        height var(--toc-transition),
                        max-height var(--toc-transition);
        }

        #arena-toc-panel.is-collapsed {
            width: 48px;
            height: 48px;
            max-height: 48px;
            border-radius: 12px;
            background: var(--toc-accent);
            border-color: var(--toc-accent);
            cursor: pointer;
        }

        #arena-toc-panel.is-collapsed:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
        }

        #arena-toc-panel.is-collapsed .toc-body,
        #arena-toc-panel.is-collapsed .toc-header-content {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }

        #arena-toc-panel.is-collapsed .toc-header {
            justify-content: center;
            padding: 12px;
            border-bottom: none;
            background: transparent;
        }

        #arena-toc-panel.is-collapsed .toc-header-icon {
            color: white !important;
            width: 24px;
            height: 24px;
        }

        #arena-toc-panel.is-collapsed:hover .toc-header-icon {
            color: white !important;
            transform: scale(1.1);
        }

        .toc-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            background: var(--toc-bg);
            border-bottom: 1px solid var(--toc-border);
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
            transition: all var(--toc-transition);
        }

        .toc-header:hover {
            background: var(--toc-bg-hover);
        }

        .toc-header-icon {
            width: 20px;
            height: 20px;
            color: var(--toc-text-secondary);
            flex-shrink: 0;
            transition: all var(--toc-transition);
        }

        .toc-header:hover .toc-header-icon {
            color: var(--toc-accent);
        }

        .toc-header-content {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 0;
            transition: opacity var(--toc-transition), visibility var(--toc-transition);
        }

        .toc-title {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
            color: var(--toc-text);
            white-space: nowrap;
        }

        .toc-badge {
            font-size: 10px;
            font-weight: 600;
            padding: 2px 7px;
            border-radius: 10px;
            background: var(--toc-bg-alt);
            color: var(--toc-text-secondary);
        }

        .toc-badge.is-fav {
            background: var(--toc-warning-bg);
            color: var(--toc-warning);
        }

        .toc-actions {
            display: flex;
            gap: 2px;
            margin-left: auto;
        }

        .toc-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: var(--toc-text-muted);
            border-radius: 6px;
            cursor: pointer;
            transition: all var(--toc-transition);
        }

        .toc-btn:hover {
            background: var(--toc-bg-hover);
            color: var(--toc-text);
        }

        .toc-btn.is-active {
            color: var(--toc-warning);
            background: var(--toc-warning-bg);
        }

        .toc-btn svg {
            width: 15px;
            height: 15px;
            pointer-events: none;
        }

        .toc-body {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            opacity: 1;
            visibility: visible;
            transition: opacity var(--toc-transition), visibility var(--toc-transition);
        }

        .toc-search-wrap {
            padding: 8px 10px;
            border-bottom: 1px solid var(--toc-border);
            background: var(--toc-bg);
        }

        .toc-search-inner {
            position: relative;
            display: flex;
            align-items: center;
        }

        .toc-search-icon {
            position: absolute;
            left: 10px;
            width: 14px;
            height: 14px;
            color: var(--toc-text-muted);
            pointer-events: none;
        }

        .toc-search {
            width: 100%;
            padding: 8px 10px 8px 32px;
            font-size: 12px;
            font-family: inherit;
            border: 1px solid var(--toc-border);
            border-radius: var(--toc-radius-sm);
            background: var(--toc-bg-alt);
            color: var(--toc-text);
            outline: none;
            transition: all var(--toc-transition);
        }

        .toc-search:focus {
            border-color: var(--toc-accent);
            background: var(--toc-bg);
            box-shadow: 0 0 0 3px var(--toc-accent-bg);
        }

        .toc-search::placeholder {
            color: var(--toc-text-muted);
        }

        .toc-list {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 6px;
            scroll-behavior: smooth;
        }

        .toc-list::-webkit-scrollbar {
            width: 6px;
        }

        .toc-list::-webkit-scrollbar-track {
            background: transparent;
        }

        .toc-list::-webkit-scrollbar-thumb {
            background: var(--toc-border);
            border-radius: 3px;
        }

        .toc-list::-webkit-scrollbar-thumb:hover {
            background: var(--toc-text-muted);
        }

        .toc-item {
            position: relative;
            display: flex;
            gap: 10px;
            padding: 10px;
            margin-bottom: 4px;
            border-radius: var(--toc-radius-sm);
            border: 1px solid transparent;
            cursor: pointer;
            transition: all var(--toc-transition);
        }

        .toc-item:last-child {
            margin-bottom: 0;
        }

        .toc-item:hover {
            background: var(--toc-bg-hover);
        }

        .toc-item.is-active {
            border-color: var(--toc-accent);
            background: var(--toc-accent-bg);
        }

        .toc-item.is-fav {
            background: var(--toc-warning-bg);
        }

        .toc-item.is-fav:hover {
            border-color: var(--toc-warning);
        }

        .toc-item-index {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            font-size: 10px;
            font-weight: 700;
            border-radius: 6px;
            flex-shrink: 0;
        }

        .toc-item[data-role="user"] .toc-item-index {
            background: var(--toc-accent-bg);
            color: var(--toc-accent);
        }

        .toc-item[data-role="assistant"] .toc-item-index {
            background: var(--toc-success-bg);
            color: var(--toc-success);
        }

        .toc-item-content {
            flex: 1;
            min-width: 0;
            padding-right: 50px;
        }

        .toc-item-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 3px;
        }

        .toc-item-role {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .toc-item[data-role="user"] .toc-item-role {
            color: var(--toc-accent);
        }

        .toc-item[data-role="assistant"] .toc-item-role {
            color: var(--toc-success);
        }

        .toc-item-tag {
            font-size: 9px;
            font-weight: 500;
            padding: 1px 5px;
            border-radius: 4px;
            background: #8b5cf6;
            color: white;
        }

        .toc-item-preview {
            font-size: 11px;
            line-height: 1.5;
            color: var(--toc-text-secondary);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
        }

        .toc-item-actions {
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            gap: 2px;
            opacity: 0;
            visibility: hidden;
            transition: all var(--toc-transition);
        }

        .toc-item:hover .toc-item-actions {
            opacity: 1;
            visibility: visible;
        }

        .toc-item-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: none;
            background: var(--toc-bg);
            color: var(--toc-text-muted);
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            transition: all var(--toc-transition);
        }

        .toc-item-btn:hover {
            background: var(--toc-bg-hover);
            color: var(--toc-text);
            transform: scale(1.05);
        }

        .toc-item-btn.is-fav {
            color: var(--toc-warning);
        }

        .toc-item-btn svg {
            width: 13px;
            height: 13px;
            pointer-events: none;
        }

        .toc-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px 20px;
            text-align: center;
            color: var(--toc-text-muted);
        }

        .toc-empty svg {
            width: 36px;
            height: 36px;
            margin-bottom: 10px;
            opacity: 0.4;
        }

        .toc-empty p {
            margin: 0;
            font-size: 12px;
        }

        .toc-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            border-top: 1px solid var(--toc-border);
            background: var(--toc-bg-alt);
            font-size: 10px;
            color: var(--toc-text-muted);
        }

        .toc-kbd {
            display: inline-block;
            padding: 1px 5px;
            font-family: ui-monospace, monospace;
            font-size: 10px;
            background: var(--toc-bg);
            border: 1px solid var(--toc-border);
            border-radius: 3px;
        }

        .toc-conv-id {
            font-family: ui-monospace, monospace;
            font-size: 9px;
            opacity: 0.6;
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #arena-toc-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            padding: 10px 18px;
            background: var(--toc-text);
            color: var(--toc-bg);
            border-radius: var(--toc-radius-sm);
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 6px 24px rgba(0,0,0,0.25);
            z-index: 1000000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        }

        #arena-toc-toast.is-visible {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(0);
        }

        @keyframes toc-pulse {
            0%, 100% { box-shadow: 0 0 0 0 transparent; }
            50% { box-shadow: 0 0 0 4px var(--toc-accent-bg); }
        }

        .toc-highlight {
            animation: toc-pulse 0.6s ease-out;
        }

        @keyframes toc-pulse-collapsed {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        #arena-toc-panel.is-collapsed {
            animation: toc-pulse-collapsed 2s ease-in-out infinite;
        }

        #arena-toc-panel.is-collapsed:hover {
            animation: none;
        }

        @media (max-width: 1024px) {
            #arena-toc-panel:not(.is-collapsed) {
                width: 260px;
            }
        }

        @media (max-width: 768px) {
            #arena-toc-panel {
                right: 10px;
                top: auto;
                bottom: 80px;
            }

            #arena-toc-panel:not(.is-collapsed) {
                max-height: 50vh;
            }
        }
    `;

    // ============================================================
    // UI MANAGER (FIXED: Prevent double-toggle on collapse)
    // ============================================================
    const UI = {
        panel: null,
        listEl: null,
        searchEl: null,
        badgeEl: null,
        convIdEl: null,
        favFilterBtn: null,
        toastEl: null,
        activeItem: null,
        _toastTimeout: null,
        _listDelegated: false,
        _currentMessages: [],
        _isToggling: false, // ADDED: Prevent double-toggle

        init() {
            this._injectStyles();
            this._createPanel();
            this._createToast();
            this._bindEvents();
        },

        destroy() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
            if (this.toastEl) {
                this.toastEl.remove();
                this.toastEl = null;
            }
            this.listEl = null;
            this.searchEl = null;
            this.badgeEl = null;
            this.convIdEl = null;
            this.favFilterBtn = null;
            this.activeItem = null;
            this._listDelegated = false;
            this._currentMessages = [];
            this._isToggling = false;
        },

        _injectStyles() {
            if (document.getElementById('arena-toc-styles')) return;
            const style = document.createElement('style');
            style.id = 'arena-toc-styles';
            style.textContent = STYLES;
            document.head.appendChild(style);
        },

        _createPanel() {
            if (this.panel) return;

            const prefs = Storage.loadPrefs();

            this.panel = document.createElement('aside');
            this.panel.id = 'arena-toc-panel';
            this.panel.setAttribute('role', 'navigation');
            this.panel.setAttribute('aria-label', 'Chat navigation');

            if (prefs.collapsed) {
                this.panel.classList.add('is-collapsed');
            }

            this.panel.innerHTML = `
                <header class="toc-header" role="button" tabindex="0" aria-expanded="${!prefs.collapsed}">
                    <svg class="toc-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"/>
                        <line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/>
                        <circle cx="4" cy="6" r="1" fill="currentColor"/>
                        <circle cx="4" cy="12" r="1" fill="currentColor"/>
                        <circle cx="4" cy="18" r="1" fill="currentColor"/>
                    </svg>
                    <div class="toc-header-content">
                        <h2 class="toc-title">Contents</h2>
                        <span class="toc-badge" id="toc-badge">0</span>
                        <div class="toc-actions">
                            <button class="toc-btn" id="toc-fav-filter" title="Show favorites only" aria-pressed="${prefs.showFavOnly}">
                                <svg viewBox="0 0 24 24" fill="${prefs.showFavOnly ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                            </button>
                            <button class="toc-btn" id="toc-refresh" title="Refresh">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                    <path d="M3 3v5h5"/>
                                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                                    <path d="M16 16h5v5"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </header>
                <div class="toc-body">
                    <div class="toc-search-wrap">
                        <div class="toc-search-inner">
                            <svg class="toc-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input
                                type="text"
                                class="toc-search"
                                id="toc-search"
                                placeholder="Search or jump to #..."
                                autocomplete="off"
                                spellcheck="false"
                            />
                        </div>
                    </div>
                    <div class="toc-list" id="toc-list" role="list"></div>
                    <footer class="toc-footer">
                        <span><span class="toc-kbd">Ctrl</span>+<span class="toc-kbd">⇧</span>+<span class="toc-kbd">T</span></span>
                        <span class="toc-conv-id" id="toc-conv-id" title="Conversation ID"></span>
                    </footer>
                </div>
            `;

            document.body.appendChild(this.panel);

            this.listEl = Utils.$('#toc-list', this.panel);
            this.searchEl = Utils.$('#toc-search', this.panel);
            this.badgeEl = Utils.$('#toc-badge', this.panel);
            this.convIdEl = Utils.$('#toc-conv-id', this.panel);
            this.favFilterBtn = Utils.$('#toc-fav-filter', this.panel);
        },

        _createToast() {
            if (this.toastEl) return;
            this.toastEl = document.createElement('div');
            this.toastEl.id = 'arena-toc-toast';
            this.toastEl.setAttribute('role', 'status');
            this.toastEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(this.toastEl);
        },

        _bindEvents() {
            if (!this.panel) return;

            const header = Utils.$('.toc-header', this.panel);
            const refreshBtn = Utils.$('#toc-refresh', this.panel);

            // FIXED: Header click - always stop propagation to prevent double-toggle
            if (header) {
                header.addEventListener('click', (e) => {
                    e.stopPropagation(); // CRITICAL: Prevent bubbling to panel

                    if (e.target.closest('.toc-btn')) {
                        return; // Buttons have their own handlers
                    }
                    this.togglePanel();
                });

                header.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.target.closest('.toc-btn')) {
                            this.togglePanel();
                        }
                    }
                });
            }

            // Panel click - only for areas outside header when collapsed
            // (Header stopPropagation prevents this from firing on header clicks)
            this.panel.addEventListener('click', (e) => {
                if (this.panel.classList.contains('is-collapsed')) {
                    this.togglePanel();
                }
            });

            // Favorite filter
            if (this.favFilterBtn) {
                this.favFilterBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    App.toggleFavFilter();
                });
            }

            // Refresh
            if (refreshBtn) {
                refreshBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    App.refresh();
                    this.showToast('Refreshed');
                });
            }

            // Search
            if (this.searchEl) {
                const debouncedFilter = Utils.debounce((value) => {
                    App.filterList(value);
                }, 150);

                this.searchEl.addEventListener('input', (e) => {
                    debouncedFilter(e.target.value);
                });

                this.searchEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        App.handleJump(this.searchEl.value);
                    } else if (e.key === 'Escape') {
                        this.searchEl.value = '';
                        App.filterList('');
                        this.searchEl.blur();
                    }
                });
            }

            // Keyboard shortcut
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
                    e.preventDefault();
                    this.togglePanel();
                }
            });

            this._setupListDelegation();
        },

        _setupListDelegation() {
            if (this._listDelegated || !this.listEl) return;

            this.listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.toc-item');
                if (!item) return;

                const msgId = item.dataset.id;
                const msg = this._currentMessages.find(m => m.id === msgId);
                if (!msg) return;

                const action = e.target.closest('[data-action]')?.dataset.action;

                if (action === 'copy') {
                    e.stopPropagation();
                    App.copyMessage(msg);
                } else if (action === 'fav') {
                    e.stopPropagation();
                    App.toggleFavorite(msg, item);
                } else {
                    App.scrollToMessage(msg);
                    this.setActiveItem(item);
                }
            });

            this.listEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;

                const item = e.target.closest('.toc-item');
                if (!item) return;

                const msgId = item.dataset.id;
                const msg = this._currentMessages.find(m => m.id === msgId);
                if (!msg) return;

                App.scrollToMessage(msg);
                this.setActiveItem(item);
            });

            this._listDelegated = true;
        },

        /**
         * FIXED: Added guard against rapid double-toggle
         */
        togglePanel() {
            if (!this.panel || this._isToggling) return;

            this._isToggling = true;

            const isCollapsed = this.panel.classList.toggle('is-collapsed');

            const header = Utils.$('.toc-header', this.panel);
            if (header) {
                header.setAttribute('aria-expanded', String(!isCollapsed));
            }

            const prefs = Storage.loadPrefs();
            prefs.collapsed = isCollapsed;
            Storage.savePrefs(prefs);

            if (!isCollapsed) {
                App.refresh();
                setTimeout(() => {
                    if (this.searchEl) {
                        this.searchEl.focus();
                    }
                }, 250);
            }

            // Reset toggle guard after transition
            setTimeout(() => {
                this._isToggling = false;
            }, 50);
        },

        updateBadge(count, isFavMode) {
            if (!this.badgeEl) return;
            this.badgeEl.textContent = isFavMode ? `★${count}` : String(count);
            this.badgeEl.classList.toggle('is-fav', isFavMode);
        },

        updateConvId(id) {
            if (!this.convIdEl || !id) return;
            const shortId = String(id).slice(0, 12);
            this.convIdEl.textContent = shortId;
            this.convIdEl.title = `Conversation: ${id}`;
        },

        updateFavFilterBtn(isActive) {
            if (!this.favFilterBtn) return;
            this.favFilterBtn.classList.toggle('is-active', isActive);
            this.favFilterBtn.setAttribute('aria-pressed', String(isActive));
            const svg = Utils.$('svg', this.favFilterBtn);
            if (svg) {
                svg.setAttribute('fill', isActive ? 'currentColor' : 'none');
            }
        },

        renderList(messages, favorites, showFavOnly) {
            if (!this.listEl) return;

            let displayMessages = messages || [];

            if (showFavOnly && favorites) {
                displayMessages = displayMessages.filter(m => m && favorites.has(m.id));
            }

            this._currentMessages = displayMessages;

            this.updateBadge(displayMessages.length, showFavOnly);

            if (displayMessages.length === 0) {
                this.listEl.innerHTML = `
                    <div class="toc-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
                            <line x1="9" y1="9" x2="9.01" y2="9"/>
                            <line x1="15" y1="9" x2="15.01" y2="9"/>
                        </svg>
                        <p>${showFavOnly ? 'No favorites in this chat' : 'No messages yet'}</p>
                    </div>
                `;
                return;
            }

            this.listEl.innerHTML = displayMessages.map(msg => {
                const isFav = favorites && favorites.has(msg.id);
                return `
                    <article
                        class="toc-item${isFav ? ' is-fav' : ''}"
                        data-index="${msg.index}"
                        data-id="${msg.id}"
                        data-role="${msg.role}"
                        role="listitem"
                        tabindex="0"
                    >
                        <span class="toc-item-index">${msg.index}</span>
                        <div class="toc-item-content">
                            <div class="toc-item-meta">
                                <span class="toc-item-role">${Utils.escapeHtml(msg.modelName)}</span>
                                ${msg.hasCode ? '<span class="toc-item-tag">CODE</span>' : ''}
                            </div>
                            <p class="toc-item-preview">${Utils.escapeHtml(msg.preview)}</p>
                        </div>
                        <div class="toc-item-actions">
                            <button class="toc-item-btn" data-action="copy" title="Copy message">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                            <button class="toc-item-btn${isFav ? ' is-fav' : ''}" data-action="fav" title="${isFav ? 'Unfavorite' : 'Favorite'}">
                                <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                            </button>
                        </div>
                    </article>
                `;
            }).join('');
        },

        setActiveItem(item) {
            if (!item) return;

            if (this.activeItem) {
                this.activeItem.classList.remove('is-active');
            }
            item.classList.add('is-active');
            this.activeItem = item;

            try {
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } catch (e) {
                item.scrollIntoView(false);
            }
        },

        filterItems(query) {
            const items = Utils.$$('.toc-item', this.listEl);
            const q = (query || '').toLowerCase().trim();

            items.forEach(item => {
                if (!q) {
                    item.style.display = '';
                    return;
                }
                const text = (item.textContent || '').toLowerCase();
                const idx = item.dataset.index || '';
                item.style.display = (text.includes(q) || idx === q) ? '' : 'none';
            });
        },

        showToast(message) {
            if (!this.toastEl) return;

            this.toastEl.textContent = message;
            this.toastEl.classList.add('is-visible');

            if (this._toastTimeout) {
                clearTimeout(this._toastTimeout);
            }

            this._toastTimeout = setTimeout(() => {
                this.toastEl.classList.remove('is-visible');
            }, CONFIG.TOAST_DURATION);
        },

        highlightMessage(element) {
            if (!element) return;
            element.classList.remove('toc-highlight');
            void element.offsetWidth;
            element.classList.add('toc-highlight');
        }
    };

    // ============================================================
    // MAIN APPLICATION
    // ============================================================
    const App = {
        messages: [],
        favorites: new Map(),
        showFavOnly: false,
        isReady: false,
        _observers: [],
        _lastUrl: '',

        async init() {
            console.log('[TOC] Initializing v4.3...');

            try {
                const ready = await this._waitForReady();
                if (!ready) {
                    console.warn('[TOC] Chat container not found after retries');
                    return;
                }

                this.favorites = Storage.loadFavorites();
                const prefs = Storage.loadPrefs();
                this.showFavOnly = prefs.showFavOnly || false;

                UI.init();
                UI.updateConvId(ConversationManager.getId());
                UI.updateFavFilterBtn(this.showFavOnly);

                this._setupObservers();
                this.refresh();

                this.isReady = true;
                console.log('[TOC] Ready! Conversation:', ConversationManager.getId());
            } catch (e) {
                console.error('[TOC] Init error:', e);
            }
        },

        async _waitForReady() {
            let retries = 0;

            while (retries < CONFIG.INIT_MAX_RETRIES) {
                const container = Utils.$(SELECTORS.CHAT_CONTAINER);
                if (container) return true;

                await new Promise(r => setTimeout(r, CONFIG.INIT_RETRY_DELAY));
                retries++;
            }

            return false;
        },

        _setupObservers() {
            this._lastUrl = location.href;

            const debouncedRefresh = Utils.debounce(() => {
                if (!UI.panel || UI.panel.classList.contains('is-collapsed')) return;
                this.refresh();
            }, CONFIG.OBSERVER_DEBOUNCE);

            const mutationObserver = new MutationObserver(() => {
                if (location.href !== this._lastUrl) {
                    this._lastUrl = location.href;
                    this._handleConversationChange();
                    return;
                }
                debouncedRefresh();
            });

            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            this._observers.push({ disconnect: () => mutationObserver.disconnect() });

            const throttledScroll = Utils.throttle(() => {
                if (!UI.panel || UI.panel.classList.contains('is-collapsed')) return;
                this._updateActiveFromScroll();
            }, CONFIG.SCROLL_THROTTLE);

            window.addEventListener('scroll', throttledScroll, { passive: true });
            this._observers.push({
                disconnect: () => window.removeEventListener('scroll', throttledScroll)
            });

            const handlePopstate = () => this._handleConversationChange();
            window.addEventListener('popstate', handlePopstate);
            this._observers.push({
                disconnect: () => window.removeEventListener('popstate', handlePopstate)
            });
        },

        _handleConversationChange() {
            console.log('[TOC] Conversation change detected');

            Storage.clearCache();
            ConversationManager.reset();

            const newId = ConversationManager.getId();
            this.favorites = Storage.loadFavorites();

            UI.updateConvId(newId);
            this.refresh();
        },

        refresh() {
            this.messages = MessageParser.parseAll();
            UI.renderList(this.messages, this.favorites, this.showFavOnly);
            this._updateActiveFromScroll();
        },

        filterList(query) {
            UI.filterItems(query);
        },

        handleJump(value) {
            const trimmed = (value || '').trim();
            if (!trimmed) return;

            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1 && num <= this.messages.length) {
                const msg = this.messages[num - 1];
                if (msg) {
                    this.scrollToMessage(msg);
                    UI.showToast(`Jumped to #${num}`);
                }
                return;
            }

            const query = trimmed.toLowerCase();
            const found = this.messages.find(m =>
                (m.preview || '').toLowerCase().includes(query) ||
                (m.fullText || '').toLowerCase().includes(query)
            );

            if (found) {
                this.scrollToMessage(found);
                UI.showToast('Found match');
            } else {
                UI.showToast('No match found');
            }
        },

        scrollToMessage(msg) {
            if (!msg?.element) return;

            try {
                msg.element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            } catch (e) {
                msg.element.scrollIntoView(true);
            }

            UI.highlightMessage(msg.element);

            const items = Utils.$$('.toc-item', UI.listEl);
            items.forEach(item => {
                if (item.dataset.id === msg.id) {
                    UI.setActiveItem(item);
                }
            });
        },

        async copyMessage(msg) {
            if (!msg) return;

            let content = msg.fullText || '';

            // Only append code blocks if they exist and aren't empty
            if (msg.codeBlocks && msg.codeBlocks.length > 0) {
                const validBlocks = msg.codeBlocks.filter(cb => cb.content && cb.content.trim());
                if (validBlocks.length > 0) {
                    content += '\n\n';
                    validBlocks.forEach(cb => {
                        content += `\`\`\`${cb.language || 'code'}\n${cb.content}\n\`\`\`\n\n`;
                    });
                }
            }

            const success = await Utils.copyToClipboard(content.trim());
            UI.showToast(success ? 'Copied!' : 'Copy failed');
        },

        toggleFavorite(msg, itemEl) {
            if (!msg || !itemEl) return;

            const favBtn = Utils.$('[data-action="fav"]', itemEl);
            const svg = favBtn ? Utils.$('svg', favBtn) : null;

            if (this.favorites.has(msg.id)) {
                this.favorites.delete(msg.id);
                itemEl.classList.remove('is-fav');
                if (favBtn) favBtn.classList.remove('is-fav');
                if (svg) svg.setAttribute('fill', 'none');
                if (favBtn) favBtn.title = 'Favorite';
                UI.showToast('Removed from favorites');
            } else {
                this.favorites.set(msg.id, { timestamp: Date.now() });
                itemEl.classList.add('is-fav');
                if (favBtn) favBtn.classList.add('is-fav');
                if (svg) svg.setAttribute('fill', 'currentColor');
                if (favBtn) favBtn.title = 'Unfavorite';
                UI.showToast('Added to favorites ★');
            }

            Storage.saveFavorites(this.favorites);

            if (this.showFavOnly && !this.favorites.has(msg.id)) {
                setTimeout(() => this.refresh(), 200);
            }
        },

        toggleFavFilter() {
            this.showFavOnly = !this.showFavOnly;

            const prefs = Storage.loadPrefs();
            prefs.showFavOnly = this.showFavOnly;
            Storage.savePrefs(prefs);

            UI.updateFavFilterBtn(this.showFavOnly);
            this.refresh();
        },

        _updateActiveFromScroll() {
            if (!this.messages || !this.messages.length) return;

            const viewportCenter = window.innerHeight / 2;
            let closestMsg = null;
            let closestDist = Infinity;

            for (const msg of this.messages) {
                if (!msg?.element) continue;

                try {
                    const rect = msg.element.getBoundingClientRect();
                    const center = rect.top + rect.height / 2;
                    const dist = Math.abs(center - viewportCenter);

                    if (dist < closestDist) {
                        closestDist = dist;
                        closestMsg = msg;
                    }
                } catch (e) {}
            }

            if (closestMsg && UI.listEl) {
                const items = Utils.$$('.toc-item', UI.listEl);
                items.forEach(item => {
                    if (item.dataset.id === closestMsg.id) {
                        if (!item.classList.contains('is-active')) {
                            UI.setActiveItem(item);
                        }
                    }
                });
            }
        },

        destroy() {
            this._observers.forEach(obs => {
                try { obs.disconnect(); } catch (e) {}
            });
            this._observers = [];
            UI.destroy();
            this.isReady = false;
            this.messages = [];
            this.favorites.clear();
        }
    };

    // ============================================================
    // BOOTSTRAP
    // ============================================================
    (function bootstrap() {
        if (window.__arenaTocLoaded) {
            console.log('[TOC] Already loaded, skipping');
            return;
        }
        window.__arenaTocLoaded = true;

        const startInit = () => {
            setTimeout(() => App.init(), 150);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startInit);
        } else {
            startInit();
        }

        window.addEventListener('beforeunload', () => App.destroy());
    })();

})();