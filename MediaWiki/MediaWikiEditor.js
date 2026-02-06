// ==UserScript==
// @name         MediaWiki  Editor
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  MediaWiki editor with modern UI, HTML templates, code highlighter, visual table builder, smart autocomplete, and more
// @author       3sp3r4nt0
// @match        *://*/mediawiki/index.php*
// @match        *://*/mediawiki/*
// @match        *://*/wiki/*
// @match        *://*.wikipedia.org/*
// @match        *://*.fandom.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================
    const CONFIG = {
        wikiBaseUrl: window.location.origin + '/mediawiki',
        uploadEndpoint: '/index.php/Spezial:Hochladen',
        apiEndpoint: '/api.php',
        imagePrefix: 'Datei:',
        defaultImageWidth: '800px',
        searchDebounceMs: 150,
        maxSearchResults: 10
    };

    // ========================================
    // SETTINGS
    // ========================================
    const DEFAULT_SETTINGS = {
        toolbarPlacement: 'above',
        toolbarSticky: true,
        floatingPos: { x: 20, y: 120 },
        enableAutoPairs: true,
        enableListContinuation: true,
        enableTabIndent: true,
        enableAutoComplete: true,
        enableAPIAutocomplete: true,
        showWordCount: true,
        theme: 'light'
    };

    function loadSettings() {
        try {
            const raw = GM_getValue('mw__editor_settings', null);
            if (!raw) return structuredClone(DEFAULT_SETTINGS);
            return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) };
        } catch { return structuredClone(DEFAULT_SETTINGS); }
    }

    function saveSettings(s) {
        try { GM_setValue('mw__editor_settings', JSON.stringify(s)); } catch {}
    }

    let SETTINGS = loadSettings();

    // ========================================
    // MODERN STYLES
    // ========================================
    GM_addStyle(`
        /* CSS Variables - Modern Theme */
        :root {
            --ee-primary: #6366f1;
            --ee-primary-hover: #4f46e5;
            --ee-primary-light: rgba(99, 102, 241, 0.1);
            --ee-success: #10b981;
            --ee-warning: #f59e0b;
            --ee-danger: #ef4444;
            --ee-bg: #ffffff;
            --ee-bg-secondary: #f8fafc;
            --ee-bg-tertiary: #f1f5f9;
            --ee-border: #e2e8f0;
            --ee-border-hover: #cbd5e1;
            --ee-text: #1e293b;
            --ee-text-secondary: #64748b;
            --ee-text-muted: #94a3b8;
            --ee-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
            --ee-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
            --ee-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
            --ee-shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
            --ee-radius-sm: 6px;
            --ee-radius: 10px;
            --ee-radius-lg: 14px;
            --ee-radius-xl: 20px;
            --ee-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            --ee-mono: ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Consolas, monospace;
            --ee-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            --ee-glass-bg: rgba(255, 255, 255, 0.85);
            --ee-glass-border: rgba(255, 255, 255, 0.3);
        }

        /* Animations */
        @keyframes ee-fade-in {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ee-scale-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes ee-slide-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ee-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }

        /* ========== TOOLBAR ========== */
        #ee-toolbar {
            font-family: var(--ee-font);
            background: var(--ee-glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-lg);
            padding: 8px 12px;
            margin: 10px 0;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            box-shadow: var(--ee-shadow);
            transition: var(--ee-transition);
            animation: ee-fade-in 0.3s ease-out;
        }
        #ee-toolbar:hover {
            box-shadow: var(--ee-shadow-lg);
        }
        #ee-toolbar.is-sticky {
            position: sticky;
            top: 10px;
            z-index: 9999;
        }
        #ee-toolbar.is-floating {
            position: fixed;
            z-index: 9999;
            margin: 0;
            max-width: calc(100vw - 24px);
        }

        .ee-divider {
            width: 1px;
            height: 24px;
            background: var(--ee-border);
            margin: 0 4px;
        }

        .ee-spacer {
            flex: 1 1 auto;
            min-width: 8px;
        }

        /* ========== BUTTONS ========== */
        .ee-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 500;
            font-family: var(--ee-font);
            color: var(--ee-text);
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
            user-select: none;
            white-space: nowrap;
        }
        .ee-btn:hover {
            background: var(--ee-bg-secondary);
            border-color: var(--ee-border-hover);
            transform: translateY(-1px);
            box-shadow: var(--ee-shadow-sm);
        }
        .ee-btn:active {
            transform: translateY(0);
        }
        .ee-btn.primary {
            background: var(--ee-primary);
            border-color: var(--ee-primary);
            color: white;
        }
        .ee-btn.primary:hover {
            background: var(--ee-primary-hover);
            border-color: var(--ee-primary-hover);
        }
        .ee-btn.success {
            background: var(--ee-success);
            border-color: var(--ee-success);
            color: white;
        }
        .ee-btn.icon-only {
            padding: 8px 10px;
            min-width: 36px;
        }
        .ee-btn.ghost {
            background: transparent;
            border-color: transparent;
        }
        .ee-btn.ghost:hover {
            background: var(--ee-bg-tertiary);
        }
        .ee-btn.sm {
            padding: 6px 10px;
            font-size: 12px;
        }
        .ee-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }
        .ee-btn .icon {
            font-weight: 700;
            font-size: 14px;
        }

        /* ========== DROPDOWN MENUS ========== */
        .ee-dropdown {
            position: relative;
        }
        .ee-dropdown-panel {
            position: absolute;
            top: calc(100% + 8px);
            left: 0;
            min-width: 320px;
            max-width: min(480px, calc(100vw - 32px));
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-lg);
            box-shadow: var(--ee-shadow-xl);
            padding: 8px;
            display: none;
            z-index: 10000;
        }
        .ee-dropdown.open .ee-dropdown-panel {
            display: block;
            animation: ee-fade-in 0.2s ease-out;
        }
        .ee-dropdown-header {
            padding: 8px 12px 12px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--ee-text-muted);
        }
        .ee-dropdown-search {
            padding: 0 8px 8px;
        }
        .ee-dropdown-search input {
            width: 100%;
            padding: 10px 12px;
            font-size: 13px;
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            outline: none;
            transition: var(--ee-transition);
            box-sizing: border-box;
        }
        .ee-dropdown-search input:focus {
            border-color: var(--ee-primary);
            box-shadow: 0 0 0 3px var(--ee-primary-light);
        }
        .ee-dropdown-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 6px;
            max-height: 320px;
            overflow-y: auto;
            padding: 4px;
        }
        .ee-dropdown-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 10px 12px;
            background: var(--ee-bg-secondary);
            border: 1px solid transparent;
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
            text-align: left;
        }
        .ee-dropdown-item:hover {
            background: var(--ee-primary-light);
            border-color: var(--ee-primary);
        }
        .ee-dropdown-item .item-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 24px;
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-sm);
            font-size: 11px;
            font-weight: 700;
            color: var(--ee-text-secondary);
        }
        .ee-dropdown-item:hover .item-icon {
            background: var(--ee-primary);
            border-color: var(--ee-primary);
            color: white;
        }
        .ee-dropdown-item .item-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--ee-text);
        }
        .ee-dropdown-item .item-desc {
            font-size: 11px;
            color: var(--ee-text-muted);
            line-height: 1.3;
        }

        /* ========== SLASH COMMAND MENU ========== */
        #ee-slash-menu {
            position: fixed;
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-lg);
            box-shadow: var(--ee-shadow-xl);
            min-width: 340px;
            max-width: 400px;
            max-height: 420px;
            overflow: hidden;
            display: none;
            z-index: 10001;
            font-family: var(--ee-font);
        }
        #ee-slash-menu.visible {
            display: flex;
            flex-direction: column;
            animation: ee-scale-in 0.15s ease-out;
        }
        .slash-search {
            padding: 12px;
            border-bottom: 1px solid var(--ee-border);
        }
        .slash-search input {
            width: 100%;
            padding: 10px 14px;
            font-size: 14px;
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            outline: none;
            background: var(--ee-bg-secondary);
            box-sizing: border-box;
        }
        .slash-search input:focus {
            border-color: var(--ee-primary);
            background: var(--ee-bg);
        }
        .slash-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        .slash-category {
            padding: 8px 8px 4px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--ee-text-muted);
        }
        .slash-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
        }
        .slash-item:hover, .slash-item.selected {
            background: var(--ee-primary-light);
        }
        .slash-item.selected {
            outline: 2px solid var(--ee-primary);
        }
        .slash-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: var(--ee-bg-tertiary);
            border-radius: var(--ee-radius);
            font-size: 12px;
            font-weight: 700;
            color: var(--ee-text-secondary);
        }
        .slash-item:hover .slash-icon, .slash-item.selected .slash-icon {
            background: var(--ee-primary);
            color: white;
        }
        .slash-content {
            flex: 1;
            min-width: 0;
        }
        .slash-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--ee-text);
        }
        .slash-desc {
            font-size: 11px;
            color: var(--ee-text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .slash-kbd {
            font-size: 10px;
            padding: 3px 6px;
            background: var(--ee-bg-tertiary);
            border-radius: 4px;
            color: var(--ee-text-muted);
        }

        /* ========== AUTOCOMPLETE POPUP ========== */
        #ee-autocomplete {
            position: fixed;
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            box-shadow: var(--ee-shadow-lg);
            min-width: 240px;
            max-width: 360px;
            max-height: 280px;
            overflow-y: auto;
            display: none;
            z-index: 10002;
            font-family: var(--ee-font);
            padding: 6px;
        }
        #ee-autocomplete.visible {
            display: block;
            animation: ee-fade-in 0.15s ease-out;
        }
        .ac-header {
            padding: 8px 10px 4px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--ee-text-muted);
        }
        .ac-loading {
            padding: 16px;
            text-align: center;
            color: var(--ee-text-muted);
            font-size: 13px;
        }
        .ac-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: var(--ee-radius-sm);
            cursor: pointer;
            transition: var(--ee-transition);
        }
        .ac-item:hover, .ac-item.selected {
            background: var(--ee-primary-light);
        }
        .ac-icon {
            font-size: 11px;
            font-weight: 700;
            color: var(--ee-text-muted);
            background: var(--ee-bg-tertiary);
            padding: 4px 8px;
            border-radius: 4px;
        }
        .ac-item:hover .ac-icon, .ac-item.selected .ac-icon {
            background: var(--ee-primary);
            color: white;
        }
        .ac-text {
            flex: 1;
            min-width: 0;
        }
        .ac-name {
            font-size: 13px;
            color: var(--ee-text);
        }
        .ac-desc {
            font-size: 11px;
            color: var(--ee-text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ac-hint {
            font-size: 11px;
            color: var(--ee-text-muted);
        }

        /* ========== CONTEXT MENU ========== */
        #ee-context-menu {
            position: fixed;
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-lg);
            box-shadow: var(--ee-shadow-xl);
            min-width: 200px;
            display: none;
            z-index: 10003;
            font-family: var(--ee-font);
            padding: 6px;
            overflow: hidden;
        }
        #ee-context-menu.visible {
            display: block;
            animation: ee-scale-in 0.12s ease-out;
        }
        .ctx-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
            font-size: 13px;
            color: var(--ee-text);
        }
        .ctx-item:hover {
            background: var(--ee-bg-tertiary);
        }
        .ctx-icon {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ee-bg-secondary);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius-sm);
            font-size: 10px;
            font-weight: 700;
            color: var(--ee-text-secondary);
        }
        .ctx-item:hover .ctx-icon {
            background: var(--ee-primary);
            border-color: var(--ee-primary);
            color: white;
        }
        .ctx-kbd {
            margin-left: auto;
            font-size: 11px;
            color: var(--ee-text-muted);
            background: var(--ee-bg-tertiary);
            padding: 2px 6px;
            border-radius: 4px;
        }
        .ctx-sep {
            height: 1px;
            background: var(--ee-border);
            margin: 4px 8px;
        }

        /* ========== MODALS ========== */
        .ee-modal {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10004;
            font-family: var(--ee-font);
            padding: 20px;
        }
        .ee-modal.visible {
            display: flex;
        }
        .ee-modal-content {
            background: var(--ee-bg);
            border-radius: var(--ee-radius-xl);
            width: 100%;
            max-width: 600px;
            max-height: calc(100vh - 40px);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: var(--ee-shadow-xl);
            animation: ee-slide-up 0.25s ease-out;
        }
        .ee-modal-content.wide {
            max-width: 900px;
        }
        .ee-modal-content.xl {
            max-width: 1100px;
        }
        .ee-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid var(--ee-border);
        }
        .ee-modal-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--ee-text);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .ee-modal-close {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ee-bg-secondary);
            border: none;
            border-radius: var(--ee-radius);
            cursor: pointer;
            font-size: 18px;
            color: var(--ee-text-secondary);
            transition: var(--ee-transition);
        }
        .ee-modal-close:hover {
            background: var(--ee-bg-tertiary);
            color: var(--ee-text);
        }
        .ee-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }
        .ee-modal-footer {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            padding: 16px 24px;
            border-top: 1px solid var(--ee-border);
            background: var(--ee-bg-secondary);
        }

        /* ========== FORM ELEMENTS ========== */
        .ee-form-group {
            margin-bottom: 20px;
        }
        .ee-form-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }
        .ee-form-row.cols-3 {
            grid-template-columns: repeat(3, 1fr);
        }
        .ee-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--ee-text);
            margin-bottom: 8px;
        }
        .ee-label .hint {
            font-weight: 400;
            color: var(--ee-text-muted);
            margin-left: 6px;
        }
        .ee-input, .ee-select, .ee-textarea {
            width: 100%;
            padding: 12px 14px;
            font-size: 14px;
            font-family: var(--ee-font);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            background: var(--ee-bg);
            color: var(--ee-text);
            outline: none;
            transition: var(--ee-transition);
            box-sizing: border-box;
        }
        .ee-input:focus, .ee-select:focus, .ee-textarea:focus {
            border-color: var(--ee-primary);
            box-shadow: 0 0 0 3px var(--ee-primary-light);
        }
        .ee-textarea {
            resize: vertical;
            min-height: 100px;
            font-family: var(--ee-mono);
            font-size: 13px;
            line-height: 1.5;
        }
        .ee-textarea.code {
            font-family: var(--ee-mono);
            font-size: 13px;
            tab-size: 2;
        }
        .ee-checkbox {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            font-size: 14px;
            color: var(--ee-text);
        }
        .ee-checkbox input {
            width: 18px;
            height: 18px;
            accent-color: var(--ee-primary);
        }

        /* ========== TABLE GRID SELECTOR ========== */
        .table-grid-container {
            padding: 16px;
            background: var(--ee-bg-secondary);
            border-radius: var(--ee-radius);
            margin-bottom: 20px;
        }
        .table-grid-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--ee-text);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .table-grid-size {
            font-weight: 500;
            color: var(--ee-primary);
            background: var(--ee-primary-light);
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 12px;
        }
        .table-grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 4px;
            margin-bottom: 12px;
        }
        .table-grid-cell {
            aspect-ratio: 1;
            background: var(--ee-bg);
            border: 2px solid var(--ee-border);
            border-radius: 4px;
            cursor: pointer;
            transition: var(--ee-transition);
        }
        .table-grid-cell:hover {
            border-color: var(--ee-border-hover);
        }
        .table-grid-cell.active {
            background: var(--ee-primary-light);
            border-color: var(--ee-primary);
        }
        .table-grid-cell.selected {
            background: var(--ee-primary);
            border-color: var(--ee-primary);
        }

        /* ========== PREVIEW AREAS ========== */
        .ee-preview {
            background: var(--ee-bg-tertiary);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            padding: 16px;
            font-family: var(--ee-mono);
            font-size: 12px;
            line-height: 1.6;
            max-height: 200px;
            overflow: auto;
            white-space: pre-wrap;
            color: var(--ee-text-secondary);
        }

        /* Editable Preview */
        .ee-editable-preview {
            border: 2px solid var(--ee-border);
            border-radius: var(--ee-radius);
            min-height: 150px;
            max-height: 400px;
            overflow: auto;
            transition: var(--ee-transition);
            background: var(--ee-bg);
            position: relative;
        }
        .ee-editable-preview.is-focused {
            border-color: var(--ee-primary);
            box-shadow: 0 0 0 3px var(--ee-primary-light);
        }
        .ee-editable-preview.is-edited {
            border-color: var(--ee-warning);
        }
        .ee-editable-preview.is-edited::before {
            content: '✏️ Modified - changes will be saved';
            display: block;
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 500;
            color: #92400e;
            background: #fef3c7;
            border-bottom: 1px solid #fcd34d;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .ee-editable-content {
            padding: 16px;
            min-height: 120px;
            outline: none;
        }
        .ee-editable-content:empty::before {
            content: attr(data-placeholder);
            color: var(--ee-text-muted);
            font-style: italic;
        }
        .ee-preview-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
            flex-wrap: wrap;
        }

        /* ========== HTML OUTPUT ========== */
        .ee-html-output {
            width: 100%;
            padding: 12px;
            font-family: var(--ee-mono);
            font-size: 11px;
            background: var(--ee-bg-tertiary);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            color: var(--ee-text-secondary);
            resize: vertical;
            box-sizing: border-box;
        }

        /* ========== TEMPLATE PICKER ========== */
        .template-layout {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 24px;
            min-height: 400px;
        }
        @media (max-width: 768px) {
            .template-layout {
                grid-template-columns: 1fr;
            }
        }
        .template-sidebar {
            border-right: 1px solid var(--ee-border);
            padding-right: 24px;
        }
        .template-categories {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 16px;
        }
        .template-category {
            padding: 10px 14px;
            border: 1px solid var(--ee-border);
            background: var(--ee-bg);
            border-radius: var(--ee-radius);
            cursor: pointer;
            font-size: 13px;
            text-align: left;
            transition: var(--ee-transition);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .template-category:hover {
            background: var(--ee-bg-secondary);
        }
        .template-category.active {
            background: var(--ee-primary);
            color: white;
            border-color: var(--ee-primary);
        }
        .template-category .cat-icon {
            font-size: 16px;
        }
        .template-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 300px;
            overflow-y: auto;
        }
        .template-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border: 2px solid var(--ee-border);
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
            background: var(--ee-bg);
        }
        .template-item:hover {
            border-color: var(--ee-primary);
            background: var(--ee-primary-light);
        }
        .template-item.selected {
            border-color: var(--ee-primary);
            background: #e0e7ff;
        }
        .template-item-icon {
            font-size: 20px;
            width: 28px;
            text-align: center;
        }
        .template-item-info {
            flex: 1;
            min-width: 0;
        }
        .template-item-name {
            font-weight: 600;
            font-size: 13px;
            color: var(--ee-text);
        }
        .template-item-desc {
            font-size: 11px;
            color: var(--ee-text-muted);
        }
        .template-main {
            display: flex;
            flex-direction: column;
        }
        .template-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: var(--ee-text-muted);
            font-style: italic;
            border: 2px dashed var(--ee-border);
            border-radius: var(--ee-radius);
        }

        /* ========== CODE HIGHLIGHTER ========== */
        .code-hl-layout {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        @media (max-width: 800px) {
            .code-hl-layout {
                grid-template-columns: 1fr;
            }
        }
        .code-hl-left, .code-hl-right {
            display: flex;
            flex-direction: column;
        }

        /* ========== STATUS BAR ========== */
        #ee-status-bar {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 8px 16px;
            font-size: 12px;
            color: var(--ee-text-muted);
            background: var(--ee-bg-secondary);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            margin-top: 8px;
            font-family: var(--ee-font);
        }
        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .status-item strong {
            color: var(--ee-text);
        }

        /* ========== TOASTS ========== */
        .ee-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 20px;
            background: var(--ee-text);
            color: white;
            border-radius: var(--ee-radius);
            box-shadow: var(--ee-shadow-xl);
            font-family: var(--ee-font);
            font-size: 14px;
            z-index: 10006;
            animation: ee-slide-up 0.3s ease-out;
        }
        .ee-toast.success {
            background: var(--ee-success);
        }
        .ee-toast.error {
            background: var(--ee-danger);
        }
        .ee-toast.warning {
            background: var(--ee-warning);
        }

        /* ========== KEYBOARD HINTS ========== */
        .kbd {
            display: inline-block;
            padding: 3px 7px;
            font-size: 11px;
            font-family: var(--ee-mono);
            background: var(--ee-bg-tertiary);
            border: 1px solid var(--ee-border);
            border-radius: 4px;
            color: var(--ee-text-secondary);
        }

        /* ========== UPLOAD ZONE ========== */
        .upload-zone {
            border: 2px dashed var(--ee-border);
            border-radius: var(--ee-radius);
            padding: 32px;
            text-align: center;
            background: var(--ee-bg-secondary);
            cursor: pointer;
            transition: var(--ee-transition);
        }
        .upload-zone:hover, .upload-zone.dragover {
            border-color: var(--ee-primary);
            background: var(--ee-primary-light);
        }
        .upload-zone-icon {
            font-size: 36px;
            margin-bottom: 12px;
        }
        .upload-zone-text {
            font-size: 14px;
            color: var(--ee-text);
            font-weight: 500;
        }
        .upload-zone-hint {
            font-size: 12px;
            color: var(--ee-text-muted);
            margin-top: 6px;
        }
        .upload-preview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 12px;
            margin-top: 16px;
        }
        .upload-preview-item {
            position: relative;
            border-radius: var(--ee-radius);
            overflow: hidden;
            border: 1px solid var(--ee-border);
            background: var(--ee-bg);
        }
        .upload-preview-img {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
        }
        .upload-preview-info {
            padding: 8px;
        }
        .upload-preview-name {
            font-size: 11px;
            color: var(--ee-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .upload-preview-remove {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.6);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            transition: var(--ee-transition);
        }
        .upload-preview-remove:hover {
            background: var(--ee-danger);
        }
        .ee-progress {
            height: 8px;
            background: var(--ee-bg-tertiary);
            border-radius: 999px;
            overflow: hidden;
        }
        .ee-progress-bar {
            height: 100%;
            background: var(--ee-primary);
            transition: width 0.3s ease;
        }
        .ee-progress-bar.success {
            background: var(--ee-success);
        }

        /* ========== TABS ========== */
        .ee-tabs {
            display: flex;
            gap: 4px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--ee-border);
            margin-bottom: 16px;
            flex-wrap: wrap;
        }
        .ee-tab {
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            background: var(--ee-bg);
            border: 1px solid var(--ee-border);
            border-radius: var(--ee-radius);
            cursor: pointer;
            transition: var(--ee-transition);
            color: var(--ee-text-secondary);
        }
        .ee-tab:hover {
            background: var(--ee-bg-secondary);
        }
        .ee-tab.active {
            background: var(--ee-primary);
            border-color: var(--ee-primary);
            color: white;
        }
    `);

    // ========================================
    // SYNTAX HIGHLIGHTING ENGINE
    // ========================================
    const HIGHLIGHT_THEMES = {
        light: {
            background: '#f8fafc',
            border: '#e2e8f0',
            text: '#1e293b',
            keyword: '#dc2626',
            string: '#0369a1',
            number: '#0891b2',
            comment: '#64748b',
            function: '#7c3aed',
            variable: '#c2410c',
            tag: '#16a34a',
            attribute: '#7c3aed',
            operator: '#dc2626',
            property: '#0891b2',
            type: '#7c3aed',
            builtin: '#0891b2'
        },
        dark: {
            background: '#1e293b',
            border: '#334155',
            text: '#e2e8f0',
            keyword: '#60a5fa',
            string: '#fbbf24',
            number: '#a78bfa',
            comment: '#64748b',
            function: '#34d399',
            variable: '#f472b6',
            tag: '#60a5fa',
            attribute: '#f472b6',
            operator: '#f472b6',
            property: '#34d399',
            type: '#2dd4bf',
            builtin: '#2dd4bf'
        },
        monokai: {
            background: '#272822',
            border: '#49483e',
            text: '#f8f8f2',
            keyword: '#f92672',
            string: '#e6db74',
            number: '#ae81ff',
            comment: '#75715e',
            function: '#a6e22e',
            variable: '#fd971f',
            tag: '#f92672',
            attribute: '#a6e22e',
            operator: '#f92672',
            property: '#66d9ef',
            type: '#66d9ef',
            builtin: '#66d9ef'
        }
    };

    const LANGUAGE_PATTERNS = {
        javascript: {
            patterns: [
                { regex: /(\/\/[^\n]*)/g, type: 'comment' },
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, type: 'string' },
                { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|static|get|set|yield)\b/g, type: 'keyword' },
                { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, type: 'builtin' },
                { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, type: 'number' },
                { regex: /\b([A-Z][a-zA-Z0-9_]*)\b/g, type: 'type' },
                { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, type: 'function' }
            ]
        },
        php: {
            patterns: [
                { regex: /(\/\/[^\n]*|#[^\n]*)/g, type: 'comment' },
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, type: 'string' },
                { regex: /(<\?php|\?>)/gi, type: 'tag' },
                { regex: /(\$[a-zA-Z_][a-zA-Z0-9_]*)/g, type: 'variable' },
                { regex: /\b(function|return|if|else|elseif|for|foreach|while|do|switch|case|break|continue|new|class|extends|implements|interface|trait|public|private|protected|static|final|abstract|const|use|namespace|require|include|require_once|include_once|echo|print|isset|unset|empty|die|exit|array|list|global|throw|try|catch|finally|as|instanceof)\b/g, type: 'keyword' },
                { regex: /\b(true|false|null|TRUE|FALSE|NULL)\b/g, type: 'builtin' },
                { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, type: 'number' },
                { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, type: 'function' }
            ]
        },
        python: {
            patterns: [
                { regex: /(#[^\n]*)/g, type: 'comment' },
                { regex: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, type: 'string' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, type: 'string' },
                { regex: /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|del|in|is|not|and|or|async|await)\b/g, type: 'keyword' },
                { regex: /\b(True|False|None)\b/g, type: 'builtin' },
                { regex: /\b(print|len|range|str|int|float|list|dict|set|tuple|bool|type|input|open|abs|max|min|sum|sorted|reversed|enumerate|zip|map|filter)\b/g, type: 'function' },
                { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?j?)\b/gi, type: 'number' },
                { regex: /@([a-zA-Z_][a-zA-Z0-9_]*)/g, type: 'function' }
            ]
        },
        sql: {
            patterns: [
                { regex: /(--[^\n]*)/g, type: 'comment' },
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /('(?:''|[^'])*')/g, type: 'string' },
                { regex: /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|VIEW|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|EXISTS|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX)\b/gi, type: 'keyword' },
                { regex: /\b(\d+\.?\d*)\b/g, type: 'number' }
            ]
        },
        html: {
            patterns: [
                { regex: /(<!--[\s\S]*?-->)/g, type: 'comment' },
                { regex: /(<\/?[a-zA-Z][a-zA-Z0-9]*)/g, type: 'tag' },
                { regex: /(\s[a-zA-Z-]+)(?==)/g, type: 'attribute' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, type: 'string' },
                { regex: /(\/?>)/g, type: 'tag' }
            ]
        },
        css: {
            patterns: [
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, type: 'string' },
                { regex: /([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)(?=\s*\{)/g, type: 'function' },
                { regex: /([a-zA-Z-]+)(?=\s*:)/g, type: 'property' },
                { regex: /(@[a-zA-Z-]+)/g, type: 'keyword' },
                { regex: /(#[0-9a-fA-F]{3,8})/g, type: 'number' },
                { regex: /(\d+\.?\d*)(px|em|rem|%|vh|vw|pt)?/g, type: 'number' }
            ]
        },
        json: {
            patterns: [
                { regex: /("(?:\\.|[^"\\])*")(?=\s*:)/g, type: 'property' },
                { regex: /("(?:\\.|[^"\\])*")/g, type: 'string' },
                { regex: /\b(true|false|null)\b/g, type: 'keyword' },
                { regex: /(-?\d+\.?\d*(?:e[+-]?\d+)?)/gi, type: 'number' }
            ]
        },
        bash: {
            patterns: [
                { regex: /(#[^\n]*)/g, type: 'comment' },
                { regex: /("(?:\\.|[^"\\])*"|'[^']*')/g, type: 'string' },
                { regex: /(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\})/g, type: 'variable' },
                { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|select|until|break|continue|exit|export|source|alias)\b/g, type: 'keyword' },
                { regex: /\b(echo|cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|sed|awk|find|chmod|chown|sudo)\b/g, type: 'function' }
            ]
        },
        xml: {
            patterns: [
                { regex: /(<!--[\s\S]*?-->)/g, type: 'comment' },
                { regex: /(<\?[\s\S]*?\?>)/g, type: 'keyword' },
                { regex: /(<\/?[a-zA-Z][a-zA-Z0-9:-]*)/g, type: 'tag' },
                { regex: /(\s[a-zA-Z:-]+)(?==)/g, type: 'attribute' },
                { regex: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, type: 'string' },
                { regex: /(\/?>)/g, type: 'tag' }
            ]
        },
        csharp: {
            patterns: [
                { regex: /(\/\/[^\n]*)/g, type: 'comment' },
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /(@?"(?:[^"\\]|\\.)*")/g, type: 'string' },
                { regex: /\b(using|namespace|class|struct|interface|enum|public|private|protected|internal|static|readonly|const|new|override|virtual|abstract|sealed|partial|async|await|void|var|if|else|switch|case|for|foreach|while|do|break|continue|return|throw|try|catch|finally|this|base|null|true|false|get|set)\b/g, type: 'keyword' },
                { regex: /\b([A-Z][a-zA-Z0-9_]*)\b/g, type: 'type' },
                { regex: /\b(\d+\.?\d*[fdmulFL]*)\b/gi, type: 'number' }
            ]
        },
        java: {
            patterns: [
                { regex: /(\/\/[^\n]*)/g, type: 'comment' },
                { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
                { regex: /("(?:\\.|[^"\\])*")/g, type: 'string' },
                { regex: /\b(package|import|class|interface|enum|extends|implements|public|private|protected|static|final|abstract|synchronized|void|boolean|byte|char|short|int|long|float|double|if|else|switch|case|for|while|do|break|continue|return|throw|throws|try|catch|finally|new|this|super|instanceof|null|true|false)\b/g, type: 'keyword' },
                { regex: /\b([A-Z][a-zA-Z0-9_]*)\b/g, type: 'type' },
                { regex: /\b(\d+\.?\d*[fdlFDL]?)\b/g, type: 'number' },
                { regex: /@([a-zA-Z_][a-zA-Z0-9_]*)/g, type: 'attribute' }
            ]
        }
    };

    function escapeHtmlForHighlight(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function highlightCode(code, language, themeName = 'light') {
        const theme = HIGHLIGHT_THEMES[themeName] || HIGHLIGHT_THEMES.light;
        const langPatterns = LANGUAGE_PATTERNS[language];

        if (!langPatterns) {
            return `<div style="background-color: ${theme.background}; border: 1px solid ${theme.border}; border-radius: 8px; padding: 16px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.6; overflow-x: auto; color: ${theme.text}; white-space: pre-wrap;">${escapeHtmlForHighlight(code)}</div>`;
        }

        const tokens = [];
        let remaining = code;

        while (remaining.length > 0) {
            let earliestMatch = null;
            let earliestIndex = remaining.length;
            let matchedType = 'text';

            for (const pattern of langPatterns.patterns) {
                pattern.regex.lastIndex = 0;
                const match = pattern.regex.exec(remaining);
                if (match && match.index < earliestIndex) {
                    earliestIndex = match.index;
                    earliestMatch = match[1] || match[0];
                    matchedType = pattern.type;
                }
            }

            if (earliestIndex > 0) {
                tokens.push({ type: 'text', value: remaining.substring(0, earliestIndex) });
            }

            if (earliestMatch) {
                tokens.push({ type: matchedType, value: earliestMatch });
                remaining = remaining.substring(earliestIndex + earliestMatch.length);
            } else {
                break;
            }
        }

        let html = tokens.map(token => {
            const escaped = escapeHtmlForHighlight(token.value);
            if (token.type === 'text') {
                return `<span style="color: ${theme.text};">${escaped}</span>`;
            }
            const color = theme[token.type] || theme.text;
            return `<span style="color: ${color};">${escaped}</span>`;
        }).join('');

        html = html.replace(/\n/g, '<br>');
        html = html.replace(/  /g, '&nbsp;&nbsp;');

        return `<div style="background-color: ${theme.background}; border: 1px solid ${theme.border}; border-radius: 8px; padding: 16px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.6; overflow-x: auto; color: ${theme.text};">${html}</div>`;
    }

    // ========================================
    // HTML TEMPLATES LIBRARY
    // ========================================
    const HTML_TEMPLATES = {
        infoBoxes: {
            label: '📢 Info Boxes',
            icon: '📢',
            items: [
                {
                    name: 'Info (Blue)',
                    icon: 'ℹ️',
                    desc: 'Blue information callout',
                    template: `<div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #0369a1; font-size: 15px;">ℹ️ Information</strong><br>
<span style="color: #075985; line-height: 1.6;">Your information text here</span>
</div>`
                },
                {
                    name: 'Success (Green)',
                    icon: '✅',
                    desc: 'Green success callout',
                    template: `<div style="background-color: #dcfce7; border-left: 4px solid #16a34a; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #15803d; font-size: 15px;">✅ Success</strong><br>
<span style="color: #166534; line-height: 1.6;">Your success message here</span>
</div>`
                },
                {
                    name: 'Warning (Yellow)',
                    icon: '⚠️',
                    desc: 'Yellow warning callout',
                    template: `<div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #b45309; font-size: 15px;">⚠️ Warning</strong><br>
<span style="color: #92400e; line-height: 1.6;">Your warning message here</span>
</div>`
                },
                {
                    name: 'Error (Red)',
                    icon: '❌',
                    desc: 'Red error callout',
                    template: `<div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #b91c1c; font-size: 15px;">❌ Error</strong><br>
<span style="color: #991b1b; line-height: 1.6;">Your error message here</span>
</div>`
                },
                {
                    name: 'Note (Purple)',
                    icon: '📝',
                    desc: 'Purple note callout',
                    template: `<div style="background-color: #f3e8ff; border-left: 4px solid #9333ea; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #7e22ce; font-size: 15px;">📝 Note</strong><br>
<span style="color: #6b21a8; line-height: 1.6;">Your note here</span>
</div>`
                },
                {
                    name: 'Tip (Teal)',
                    icon: '💡',
                    desc: 'Teal tip callout',
                    template: `<div style="background-color: #ccfbf1; border-left: 4px solid #0d9488; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0;">
<strong style="color: #0f766e; font-size: 15px;">💡 Tip</strong><br>
<span style="color: #115e59; line-height: 1.6;">Your helpful tip here</span>
</div>`
                }
            ]
        },
        cards: {
            label: '🃏 Cards',
            icon: '🃏',
            items: [
                {
                    name: 'Basic Card',
                    icon: '🃏',
                    desc: 'Simple card with shadow',
                    template: `<div style="background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); padding: 24px; margin: 16px 0;">
<h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 18px;">Card Title</h3>
<p style="margin: 0; color: #64748b; line-height: 1.6;">Card content goes here. You can add any text or HTML content.</p>
</div>`
                },
                {
                    name: 'Gradient Header',
                    icon: '🎴',
                    desc: 'Card with gradient header',
                    template: `<div style="background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; margin: 16px 0;">
<div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 20px 24px;">
<h3 style="margin: 0; color: #ffffff; font-size: 18px;">Header Title</h3>
</div>
<div style="padding: 24px;">
<p style="margin: 0; color: #64748b; line-height: 1.6;">Card content goes here with a beautiful gradient header.</p>
</div>
</div>`
                },
                {
                    name: 'Feature Card',
                    icon: '🚀',
                    desc: 'Feature highlight',
                    template: `<div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 16px; padding: 28px; margin: 16px 0; border: 1px solid #e2e8f0;">
<div style="font-size: 40px; margin-bottom: 16px;">🚀</div>
<h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 20px;">Feature Title</h3>
<p style="margin: 0; color: #64748b; line-height: 1.7;">Feature description goes here. Explain what makes this feature special.</p>
</div>`
                }
            ]
        },
        containers: {
            label: '📦 Containers',
            icon: '📦',
            items: [
                {
                    name: 'Collapsible',
                    icon: '📂',
                    desc: 'Expandable section',
                    template: `<details style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin: 12px 0;">
<summary style="padding: 14px 18px; cursor: pointer; font-weight: 600; background: #f1f5f9; border-radius: 10px 10px 0 0; color: #1e293b;">Click to expand</summary>
<div style="padding: 18px;">
Your hidden content goes here. This section is collapsible.
</div>
</details>`
                },
                {
                    name: 'Quote Block',
                    icon: '💬',
                    desc: 'Styled blockquote',
                    template: `<blockquote style="margin: 16px 0; padding: 20px 24px; background: #f8fafc; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; font-style: italic; color: #475569;">
<p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.7;">"Your quote text here. Make it inspiring or informative."</p>
<footer style="font-size: 14px; color: #64748b; font-style: normal;">— Author Name</footer>
</blockquote>`
                },
                {
                    name: 'Terminal',
                    icon: '💻',
                    desc: 'Terminal-style output',
                    template: `<div style="background: #1e293b; border-radius: 10px; overflow: hidden; margin: 12px 0; font-family: 'Consolas', monospace;">
<div style="background: #334155; padding: 10px 14px; display: flex; gap: 8px; align-items: center;">
<span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></span>
<span style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></span>
<span style="width: 12px; height: 12px; border-radius: 50%; background: #22c55e;"></span>
<span style="margin-left: 8px; color: #94a3b8; font-size: 12px;">terminal</span>
</div>
<pre style="margin: 0; padding: 18px; color: #e2e8f0; overflow-x: auto; font-size: 13px; line-height: 1.6;">$ your command here
output goes here</pre>
</div>`
                },
                {
                    name: 'Highlight Box',
                    icon: '📌',
                    desc: 'Important content',
                    template: `<div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #fcd34d; border-radius: 10px; padding: 18px; margin: 12px 0;">
<strong style="color: #b45309; font-size: 15px;">📌 Important</strong>
<p style="margin: 10px 0 0 0; color: #78350f; line-height: 1.6;">Your important content here that you want to highlight.</p>
</div>`
                },
                {
                    name: 'Steps',
                    icon: '📋',
                    desc: 'Numbered steps',
                    template: `<div style="margin: 16px 0;">
<div style="display: flex; gap: 14px; margin-bottom: 18px;">
<div style="width: 32px; height: 32px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">1</div>
<div><strong style="color: #1e293b;">First Step</strong><br><span style="color: #64748b;">Description of the first step.</span></div>
</div>
<div style="display: flex; gap: 14px; margin-bottom: 18px;">
<div style="width: 32px; height: 32px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">2</div>
<div><strong style="color: #1e293b;">Second Step</strong><br><span style="color: #64748b;">Description of the second step.</span></div>
</div>
<div style="display: flex; gap: 14px;">
<div style="width: 32px; height: 32px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">3</div>
<div><strong style="color: #1e293b;">Third Step</strong><br><span style="color: #64748b;">Description of the third step.</span></div>
</div>
</div>`
                }
            ]
        },
        badges: {
            label: '🏷️ Badges',
            icon: '🏷️',
            items: [
                {
                    name: 'Active Badge',
                    icon: '🟢',
                    desc: 'Green status',
                    template: `<span style="display: inline-block; background: #22c55e; color: white; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">Active</span>`
                },
                {
                    name: 'Inactive Badge',
                    icon: '🔴',
                    desc: 'Red status',
                    template: `<span style="display: inline-block; background: #ef4444; color: white; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">Inactive</span>`
                },
                {
                    name: 'Version Badge',
                    icon: '🏷️',
                    desc: 'Version number',
                    template: `<span style="display: inline-block; background: #64748b; color: white; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-family: monospace;">v1.0.0</span>`
                },
                {
                    name: 'Keyboard Key',
                    icon: '⌨️',
                    desc: 'Keyboard shortcut',
                    template: `<kbd style="display: inline-block; padding: 4px 8px; font-size: 12px; font-family: monospace; background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 2px 0 #94a3b8;">Ctrl</kbd>`
                },
                {
                    name: 'Key Combo',
                    icon: '🎹',
                    desc: 'Key combination',
                    template: `<kbd style="display: inline-block; padding: 4px 8px; font-size: 12px; font-family: monospace; background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 2px 0 #94a3b8;">Ctrl</kbd> + <kbd style="display: inline-block; padding: 4px 8px; font-size: 12px; font-family: monospace; background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 2px 0 #94a3b8;">S</kbd>`
                }
            ]
        },
        tables: {
            label: '📊 Tables',
            icon: '📊',
            items: [
                {
                    name: 'Styled Table',
                    icon: '📊',
                    desc: 'Modern table',
                    template: `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
<thead>
<tr style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);">
<th style="padding: 14px 18px; text-align: left; color: white; font-weight: 600;">Header 1</th>
<th style="padding: 14px 18px; text-align: left; color: white; font-weight: 600;">Header 2</th>
<th style="padding: 14px 18px; text-align: left; color: white; font-weight: 600;">Header 3</th>
</tr>
</thead>
<tbody>
<tr style="background: #f8fafc;">
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 1</td>
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 2</td>
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 3</td>
</tr>
<tr>
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 4</td>
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 5</td>
<td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">Cell 6</td>
</tr>
</tbody>
</table>`
                },
                {
                    name: 'Comparison',
                    icon: '⚖️',
                    desc: 'Feature comparison',
                    template: `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<thead>
<tr style="background: #1e293b; color: white;">
<th style="padding: 14px; text-align: left;">Feature</th>
<th style="padding: 14px; text-align: center;">Basic</th>
<th style="padding: 14px; text-align: center;">Pro</th>
</tr>
</thead>
<tbody>
<tr style="background: #f8fafc;">
<td style="padding: 14px; border-bottom: 1px solid #e2e8f0;">Feature One</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">✅</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">✅</td>
</tr>
<tr>
<td style="padding: 14px; border-bottom: 1px solid #e2e8f0;">Feature Two</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">❌</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">✅</td>
</tr>
<tr style="background: #f8fafc;">
<td style="padding: 14px; border-bottom: 1px solid #e2e8f0;">Feature Three</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">❌</td>
<td style="padding: 14px; text-align: center; border-bottom: 1px solid #e2e8f0;">✅</td>
</tr>
</tbody>
</table>`
                }
            ]
        }
    };

    // ========================================
    // WIKI SYNTAX DEFINITIONS
    // ========================================
    const WIKI_SYNTAX = {
        formatting: [
            { name: 'Bold', icon: 'B', syntax: "'''", wrap: true, desc: 'Bold text', kbd: 'Ctrl+B' },
            { name: 'Italic', icon: 'I', syntax: "''", wrap: true, desc: 'Italic text', kbd: 'Ctrl+I' },
            { name: 'Bold+Italic', icon: 'BI', syntax: "'''''", wrap: true, desc: 'Bold and italic' },
            { name: 'Underline', icon: 'U', syntax: ['<u>', '</u>'], wrap: true, desc: 'Underlined text', kbd: 'Ctrl+U' },
            { name: 'Strikethrough', icon: 'S', syntax: ['<s>', '</s>'], wrap: true, desc: 'Strikethrough text' },
            { name: 'Code', icon: '<>', syntax: ['<code>', '</code>'], wrap: true, desc: 'Inline code' },
            { name: 'Preformatted', icon: 'PRE', syntax: ['<pre>', '</pre>'], wrap: true, desc: 'Preformatted block' },
            { name: 'Nowiki', icon: 'NW', syntax: ['<nowiki>', '</nowiki>'], wrap: true, desc: 'Disable wiki parsing' },
            { name: 'Subscript', icon: 'x₂', syntax: ['<sub>', '</sub>'], wrap: true, desc: 'Subscript text' },
            { name: 'Superscript', icon: 'x²', syntax: ['<sup>', '</sup>'], wrap: true, desc: 'Superscript text' }
        ],
        headings: [
            { name: 'Heading 1', icon: 'H1', syntax: ['= ', ' ='], wrap: true, desc: 'Main heading' },
            { name: 'Heading 2', icon: 'H2', syntax: ['== ', ' =='], wrap: true, desc: 'Section heading' },
            { name: 'Heading 3', icon: 'H3', syntax: ['=== ', ' ==='], wrap: true, desc: 'Subsection' },
            { name: 'Heading 4', icon: 'H4', syntax: ['==== ', ' ===='], wrap: true, desc: 'Sub-subsection' },
            { name: 'Heading 5', icon: 'H5', syntax: ['===== ', ' ====='], wrap: true, desc: 'Minor heading' }
        ],
        lists: [
            { name: 'Bullet List', icon: '•', syntax: '* ', insert: 'line', desc: 'Unordered list' },
            { name: 'Numbered List', icon: '1.', syntax: '# ', insert: 'line', desc: 'Ordered list' },
            { name: 'Sub-bullet', icon: '••', syntax: '** ', insert: 'line', desc: 'Nested bullet' },
            { name: 'Sub-number', icon: '1.1', syntax: '## ', insert: 'line', desc: 'Nested number' },
            { name: 'Definition Term', icon: ';', syntax: '; ', insert: 'line', desc: 'Definition term' },
            { name: 'Definition Desc', icon: ':', syntax: ': ', insert: 'line', desc: 'Definition description' },
            { name: 'Indent', icon: '→', syntax: ': ', insert: 'line', desc: 'Indent text' }
        ],
        links: [
            { name: 'Internal Link', icon: '[[]]', syntax: ['[[', ']]'], wrap: true, desc: 'Link to wiki page', kbd: 'Ctrl+K' },
            { name: 'Link with Label', icon: '[[|]]', syntax: ['[[', '|Label]]'], wrap: true, desc: 'Link with display text' },
            { name: 'External Link', icon: '[url]', syntax: ['[', ' Description]'], wrap: true, desc: 'External URL' },
            { name: 'Category', icon: 'CAT', syntax: '[[Category:', insert: true, suffix: ']]', desc: 'Add to category' },
            { name: 'Redirect', icon: '→#', syntax: '#REDIRECT [[', insert: true, suffix: ']]', desc: 'Page redirect' }
        ],
        media: [
            { name: 'Image', icon: 'IMG', syntax: '[[File:', insert: true, suffix: '|thumb|Caption]]', desc: 'Insert image' },
            { name: 'Image Right', icon: 'IMG→', syntax: '[[File:', insert: true, suffix: '|thumb|right|Caption]]', desc: 'Image aligned right' },
            { name: 'Image Left', icon: '←IMG', syntax: '[[File:', insert: true, suffix: '|thumb|left|Caption]]', desc: 'Image aligned left' },
            { name: 'Image Sized', icon: 'IMG px', syntax: '[[File:', insert: true, suffix: '|300px|Caption]]', desc: 'Image with size' },
            { name: 'Gallery', icon: 'GAL', syntax: '<gallery>\nFile:Example.jpg|Caption\n</gallery>', insert: true, desc: 'Image gallery' }
        ],
        tables: [
            { name: 'Table Builder', icon: 'TBL', action: 'tableDialog', desc: 'Visual table creator' },
            { name: 'Table Row', icon: '|-', syntax: '\n|-\n| ', insert: true, desc: 'Add table row' },
            { name: 'Header Cell', icon: '!', syntax: '! ', insert: true, desc: 'Header cell' }
        ],
        templates: [
            { name: 'Template', icon: '{{}}', syntax: ['{{', '}}'], wrap: true, desc: 'Insert template' },
            { name: 'Infobox', icon: 'INFO', syntax: '{{Infobox\n| title = \n| image = \n| caption = \n}}', insert: true, desc: 'Infobox template' },
            { name: 'Cite Web', icon: 'CITE', syntax: '{{cite web |url= |title= |access-date=}}', insert: true, desc: 'Web citation' },
            { name: 'Quote', icon: '"..."', syntax: '{{quote|', insert: true, suffix: '}}', desc: 'Block quote' },
            { name: 'Note', icon: 'NOTE', syntax: '{{note|', insert: true, suffix: '}}', desc: 'Note box' },
            { name: 'Warning', icon: 'WARN', syntax: '{{warning|', insert: true, suffix: '}}', desc: 'Warning box' }
        ],
        special: [
            { name: 'TOC', icon: 'TOC', syntax: '__TOC__', insert: true, desc: 'Table of contents' },
            { name: 'No TOC', icon: '⊘TOC', syntax: '__NOTOC__', insert: true, desc: 'Hide table of contents' },
            { name: 'Signature', icon: '~~~~', syntax: '~~~~', insert: true, desc: 'Signature with timestamp' },
            { name: 'Horizontal Rule', icon: '—', syntax: '\n----\n', insert: true, desc: 'Horizontal line' },
            { name: 'Comment', icon: '<!--', syntax: ['<!-- ', ' -->'], wrap: true, desc: 'HTML comment' },
            { name: 'Reference', icon: 'REF', syntax: ['<ref>', '</ref>'], wrap: true, desc: 'Add footnote' },
            { name: 'Ref List', icon: 'REFS', syntax: '<references />', insert: true, desc: 'Display references' },
            { name: 'Math', icon: 'TeX', syntax: ['<math>', '</math>'], wrap: true, desc: 'LaTeX math formula' },
            { name: 'Syntax Highlight', icon: 'SYN', syntax: ['<syntaxhighlight lang="javascript">\n', '\n</syntaxhighlight>'], wrap: true, desc: 'Code highlighting' }
        ],
        htmlTools: [
            { name: 'Code Highlighter', icon: '🎨', action: 'codeHighlighter', desc: 'Syntax highlight code' },
            { name: 'HTML Templates', icon: '✨', action: 'htmlTemplates', desc: 'Styled HTML blocks' }
        ]
    };

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.ee-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `ee-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function getTextarea() {
        return document.getElementById('wpTextbox1');
    }

    function getEditToken() {
        const input = document.querySelector('input[name="wpEditToken"]');
        return input ? input.value : null;
    }

    function generateFileName(ext = 'png') {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const rnd = Math.random().toString(36).slice(2, 8);
        return `Upload_${ts}_${rnd}.${ext}`;
    }

    function insertAtCursor(textarea, text, caretBack = 0) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);

        textarea.value = before + text + after;
        textarea.focus();
        const pos = start + text.length - caretBack;
        textarea.setSelectionRange(pos, pos);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function wrapSelection(textarea, before, after) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        const beforeText = textarea.value.substring(0, start);
        const afterText = textarea.value.substring(end);

        textarea.value = beforeText + before + selected + after + afterText;
        textarea.focus();
        textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertPair(textarea, left, right) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start !== end) {
            wrapSelection(textarea, left, right);
        } else {
            insertAtCursor(textarea, left + right, right.length);
        }
    }

    function getLineInfo(textarea) {
        const value = textarea.value;
        const pos = textarea.selectionStart;
        const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
        const lineEnd = value.indexOf('\n', pos);
        const actualEnd = lineEnd === -1 ? value.length : lineEnd;
        const line = value.substring(lineStart, actualEnd);
        return { lineStart, lineEnd: actualEnd, line, pos };
    }

    function updateWordCount() {
        const textarea = getTextarea();
        const statusBar = document.getElementById('ee-status-bar');
        if (!textarea || !statusBar || !SETTINGS.showWordCount) return;

        const text = textarea.value;
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const lines = text.split('\n').length;

        statusBar.innerHTML = `
            <span class="status-item">Words: <strong>${words.toLocaleString()}</strong></span>
            <span class="status-item">Characters: <strong>${chars.toLocaleString()}</strong></span>
            <span class="status-item">Lines: <strong>${lines.toLocaleString()}</strong></span>
            <span class="status-item" style="margin-left: auto;">
                <kbd class="kbd">/</kbd> Commands &nbsp; <kbd class="kbd">Tab</kbd> Indent
            </span>
        `;
    }

    function closeAllMenus(except = null) {
        document.querySelectorAll('.ee-dropdown.open').forEach(m => {
            if (except && except.contains(m)) return;
            m.classList.remove('open');
        });
        hideSlashMenu();
        hideAutocomplete();
        hideContextMenu();
    }

    // ========================================
    // APPLY SYNTAX
    // ========================================
    function applySyntax(item) {
        const textarea = getTextarea();
        if (!textarea) return;

        if (item.action === 'tableDialog') {
            showTableDialog();
            return;
        }
        if (item.action === 'codeHighlighter') {
            showCodeHighlighter();
            return;
        }
        if (item.action === 'htmlTemplates') {
            showTemplatePicker();
            return;
        }

        if (item.wrap) {
            if (Array.isArray(item.syntax)) {
                wrapSelection(textarea, item.syntax[0], item.syntax[1]);
            } else {
                wrapSelection(textarea, item.syntax, item.syntax);
            }
            return;
        }

        if (item.insert === 'line') {
            const { lineStart } = getLineInfo(textarea);
            const before = textarea.value.substring(0, lineStart);
            const after = textarea.value.substring(lineStart);
            textarea.value = before + item.syntax + after;
            textarea.focus();
            const newPos = lineStart + item.syntax.length;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        if (item.insert) {
            let text = item.syntax;
            if (item.suffix) text += item.suffix;
            insertAtCursor(textarea, text, item.suffix ? item.suffix.length : 0);
        }
    }

    // ========================================
    // DROPDOWN MENU
    // ========================================
    function createDropdown(label, items) {
        const wrap = document.createElement('div');
        wrap.className = 'ee-dropdown';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ee-btn';
        btn.innerHTML = `${escapeHtml(label)} <span style="opacity:0.5;font-size:10px;">▼</span>`;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = wrap.classList.contains('open');
            closeAllMenus(wrap);
            wrap.classList.toggle('open', !isOpen);

            setTimeout(() => {
                const search = wrap.querySelector('.ee-dropdown-search input');
                if (search && wrap.classList.contains('open')) search.focus();
            }, 50);
        });

        const panel = document.createElement('div');
        panel.className = 'ee-dropdown-panel';

        const search = document.createElement('div');
        search.className = 'ee-dropdown-search';
        search.innerHTML = '<input type="text" placeholder="Search...">';
        panel.appendChild(search);

        const grid = document.createElement('div');
        grid.className = 'ee-dropdown-grid';

        function renderItems(filter = '') {
            grid.innerHTML = '';
            const f = filter.toLowerCase();
            const filtered = items.filter(it =>
                it.name.toLowerCase().includes(f) ||
                (it.desc || '').toLowerCase().includes(f) ||
                (it.icon || '').toLowerCase().includes(f)
            );

            for (const it of filtered) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'ee-dropdown-item';
                item.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="item-icon">${escapeHtml(it.icon || '')}</span>
                        <span class="item-name">${escapeHtml(it.name)}</span>
                    </div>
                    <span class="item-desc">${escapeHtml(it.desc || '')}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    applySyntax(it);
                    closeAllMenus();
                });
                grid.appendChild(item);
            }
        }

        search.querySelector('input').addEventListener('input', (e) => {
            renderItems(e.target.value);
        });

        renderItems();
        panel.appendChild(grid);
        wrap.appendChild(btn);
        wrap.appendChild(panel);
        return wrap;
    }

    // ========================================
    // SLASH COMMAND MENU
    // ========================================
    let slashMenu = null;
    let slashSelectedIndex = 0;

    function createSlashMenu() {
        const menu = document.createElement('div');
        menu.id = 'ee-slash-menu';

        const searchDiv = document.createElement('div');
        searchDiv.className = 'slash-search';
        searchDiv.innerHTML = '<input type="text" placeholder="Search commands..." id="slash-search-input">';
        menu.appendChild(searchDiv);

        const list = document.createElement('div');
        list.className = 'slash-list';
        menu.appendChild(list);

        function getAllItems() {
            const all = [];
            for (const [cat, items] of Object.entries(WIKI_SYNTAX)) {
                for (const it of items) {
                    all.push({ ...it, category: cat });
                }
            }
            all.push({ name: 'Upload Image', icon: '⬆', desc: 'Upload and insert image', category: 'actions', action: 'upload' });
            return all;
        }

        function renderList(filter = '') {
            list.innerHTML = '';
            const f = filter.toLowerCase();
            const allItems = getAllItems();

            const filtered = allItems.filter(it =>
                it.name.toLowerCase().includes(f) ||
                (it.desc || '').toLowerCase().includes(f) ||
                (it.icon || '').toLowerCase().includes(f)
            );

            const grouped = {};
            for (const it of filtered) {
                if (!grouped[it.category]) grouped[it.category] = [];
                grouped[it.category].push(it);
            }

            let globalIndex = 0;
            for (const [cat, items] of Object.entries(grouped)) {
                const catEl = document.createElement('div');
                catEl.className = 'slash-category';
                catEl.textContent = cat.toUpperCase();
                list.appendChild(catEl);

                for (const it of items) {
                    const item = document.createElement('div');
                    item.className = 'slash-item';
                    item.dataset.index = globalIndex;
                    item.innerHTML = `
                        <div class="slash-icon">${escapeHtml(it.icon || '?')}</div>
                        <div class="slash-content">
                            <div class="slash-name">${escapeHtml(it.name)}</div>
                            <div class="slash-desc">${escapeHtml(it.desc || '')}</div>
                        </div>
                        ${it.kbd ? `<span class="slash-kbd">${escapeHtml(it.kbd)}</span>` : ''}
                    `;
                    item.addEventListener('click', () => selectSlashItem(it));
                    item.addEventListener('mouseenter', () => {
                        document.querySelectorAll('.slash-item.selected').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        slashSelectedIndex = parseInt(item.dataset.index);
                    });
                    list.appendChild(item);
                    globalIndex++;
                }
            }

            const first = list.querySelector('.slash-item');
            if (first) first.classList.add('selected');
            slashSelectedIndex = 0;

            return globalIndex;
        }

        menu.renderList = renderList;
        menu.getAllVisibleItems = () => list.querySelectorAll('.slash-item');

        const searchInput = searchDiv.querySelector('input');
        searchInput.addEventListener('input', (e) => {
            renderList(e.target.value);
        });
        searchInput.addEventListener('keydown', handleSlashNavigation);

        document.body.appendChild(menu);
        return menu;
    }

    function handleSlashNavigation(e) {
        if (!slashMenu || !slashMenu.classList.contains('visible')) return;

        const items = slashMenu.getAllVisibleItems();
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[slashSelectedIndex]?.classList.remove('selected');
            slashSelectedIndex = (slashSelectedIndex + 1) % items.length;
            items[slashSelectedIndex]?.classList.add('selected');
            items[slashSelectedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[slashSelectedIndex]?.classList.remove('selected');
            slashSelectedIndex = (slashSelectedIndex - 1 + items.length) % items.length;
            items[slashSelectedIndex]?.classList.add('selected');
            items[slashSelectedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            items[slashSelectedIndex]?.click();
        } else if (e.key === 'Escape') {
            hideSlashMenu();
        }
    }

    function showSlashMenu(textarea) {
        if (!slashMenu) slashMenu = createSlashMenu();

        const rect = textarea.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const textBefore = textarea.value.substring(0, textarea.selectionStart);
        const lineCount = textBefore.split('\n').length - 1;

        let y = rect.top + (lineCount * lineHeight) - textarea.scrollTop + lineHeight + 10;
        let x = rect.left + 20;

        y = Math.min(y, window.innerHeight - 450);
        x = Math.min(x, window.innerWidth - 420);

        slashMenu.style.top = `${Math.max(10, y)}px`;
        slashMenu.style.left = `${Math.max(10, x)}px`;
        slashMenu.classList.add('visible');
        slashMenu.renderList('');

        setTimeout(() => {
            const input = slashMenu.querySelector('#slash-search-input');
            if (input) input.focus();
        }, 50);
    }

    function hideSlashMenu() {
        if (slashMenu) slashMenu.classList.remove('visible');
    }

    function selectSlashItem(item) {
        const textarea = getTextarea();
        if (!textarea) return;

        const cur = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cur);
        const slashIdx = textBefore.lastIndexOf('/');
        if (slashIdx >= 0) {
            textarea.value = textarea.value.substring(0, slashIdx) + textarea.value.substring(cur);
            textarea.selectionStart = textarea.selectionEnd = slashIdx;
        }

        hideSlashMenu();

        if (item.action === 'upload') {
            showUploadDialog();
        } else {
            applySyntax(item);
        }
    }

    // ========================================
    // AUTOCOMPLETE (API-POWERED)
    // ========================================
    let autocompleteEl = null;
    let acSelectedIndex = 0;
    let acTrigger = null;
    let searchDebounceTimer = null;

    function createAutocomplete() {
        const el = document.createElement('div');
        el.id = 'ee-autocomplete';
        document.body.appendChild(el);
        return el;
    }

    async function searchWikiPages(query) {
        if (!query || query.length < 1) return [];

        return new Promise((resolve) => {
            const url = `${CONFIG.wikiBaseUrl}${CONFIG.apiEndpoint}?action=opensearch&format=json&formatversion=2&search=${encodeURIComponent(query)}&namespace=0&limit=${CONFIG.maxSearchResults}`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const titles = data[1] || [];
                        const descriptions = data[2] || [];
                        const results = titles.map((title, i) => ({
                            name: title,
                            desc: descriptions[i] || '',
                            type: 'page'
                        }));
                        resolve(results);
                    } catch {
                        resolve([]);
                    }
                },
                onerror: () => resolve([])
            });
        });
    }

    async function searchCategories(query) {
        if (!query || query.length < 1) return [];

        return new Promise((resolve) => {
            const url = `${CONFIG.wikiBaseUrl}${CONFIG.apiEndpoint}?action=query&list=allcategories&aclimit=${CONFIG.maxSearchResults}&acprefix=${encodeURIComponent(query)}&format=json`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const categories = data.query?.allcategories || [];
                        const results = categories.map(cat => ({
                            name: cat['*'] || cat.title || cat,
                            desc: 'Category',
                            type: 'category'
                        }));
                        resolve(results);
                    } catch {
                        resolve([]);
                    }
                },
                onerror: () => resolve([])
            });
        });
    }

    function showAutocomplete(textarea, trigger, suggestions, loading = false) {
        if (!autocompleteEl) autocompleteEl = createAutocomplete();

        acTrigger = trigger;
        acSelectedIndex = 0;

        const rect = textarea.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const textBefore = textarea.value.substring(0, textarea.selectionStart);
        const lineCount = textBefore.split('\n').length - 1;

        let y = rect.top + (lineCount * lineHeight) - textarea.scrollTop + lineHeight + 5;
        let x = rect.left + 20;

        y = Math.min(y, window.innerHeight - 300);
        x = Math.min(x, window.innerWidth - 380);

        autocompleteEl.style.top = `${Math.max(10, y)}px`;
        autocompleteEl.style.left = `${Math.max(10, x)}px`;

        autocompleteEl.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'ac-header';
        header.textContent = trigger === '{{' ? 'Templates' : trigger === '[[Category:' ? 'Categories' : 'Pages';
        autocompleteEl.appendChild(header);

        if (loading) {
            const loadingEl = document.createElement('div');
            loadingEl.className = 'ac-loading';
            loadingEl.innerHTML = '<span style="animation: ee-pulse 1s infinite;">Searching...</span>';
            autocompleteEl.appendChild(loadingEl);
        } else if (suggestions.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'ac-loading';
            emptyEl.textContent = 'No results found';
            autocompleteEl.appendChild(emptyEl);
        } else {
            suggestions.forEach((s, i) => {
                const item = document.createElement('div');
                item.className = 'ac-item' + (i === 0 ? ' selected' : '');
                item.dataset.index = i;
                item.dataset.value = s.name;
                item.dataset.type = s.type || 'page';
                item.innerHTML = `
                    <span class="ac-icon">${s.type === 'category' ? 'CAT' : s.type === 'template' ? 'T' : '→'}</span>
                    <div class="ac-text">
                        <div class="ac-name">${escapeHtml(s.name)}</div>
                        ${s.desc ? `<div class="ac-desc">${escapeHtml(s.desc)}</div>` : ''}
                    </div>
                `;
                item.addEventListener('click', () => insertAutocomplete(s.name, s.type));
                item.addEventListener('mouseenter', () => {
                    autocompleteEl.querySelectorAll('.ac-item.selected').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    acSelectedIndex = i;
                });
                autocompleteEl.appendChild(item);
            });
        }

        autocompleteEl.classList.add('visible');
    }

    function hideAutocomplete() {
        if (autocompleteEl) autocompleteEl.classList.remove('visible');
        acTrigger = null;
    }

    function insertAutocomplete(value, type) {
        const textarea = getTextarea();
        if (!textarea) return;

        const cur = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cur);

        let triggerPos = -1;
        let insert = '';
        let caretBack = 0;

        if (acTrigger === '{{') {
            triggerPos = textBefore.lastIndexOf('{{');
            insert = `{{${value}}}`;
            caretBack = 2;
        } else if (acTrigger === '[[Category:') {
            triggerPos = textBefore.lastIndexOf('[[Category:');
            insert = `[[Category:${value}]]`;
            caretBack = 2;
        } else if (acTrigger === '[[') {
            triggerPos = textBefore.lastIndexOf('[[');
            insert = `[[${value}]]`;
            caretBack = 2;
        }

        if (triggerPos >= 0) {
            const before = textarea.value.substring(0, triggerPos);
            const after = textarea.value.substring(cur);

            textarea.value = before + insert + after;
            textarea.focus();
            const newPos = triggerPos + insert.length - caretBack;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        hideAutocomplete();
    }

    function handleAutocompleteNav(e) {
        if (!autocompleteEl || !autocompleteEl.classList.contains('visible')) return false;

        const items = autocompleteEl.querySelectorAll('.ac-item');
        if (!items.length) return false;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[acSelectedIndex]?.classList.remove('selected');
            acSelectedIndex = (acSelectedIndex + 1) % items.length;
            items[acSelectedIndex]?.classList.add('selected');
            return true;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[acSelectedIndex]?.classList.remove('selected');
            acSelectedIndex = (acSelectedIndex - 1 + items.length) % items.length;
            items[acSelectedIndex]?.classList.add('selected');
            return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const selected = items[acSelectedIndex];
            if (selected) insertAutocomplete(selected.dataset.value, selected.dataset.type);
            return true;
        }
        if (e.key === 'Escape') {
            hideAutocomplete();
            return true;
        }
        return false;
    }

    async function checkAutocomplete(textarea) {
        if (!SETTINGS.enableAutoComplete) return;

        const cur = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cur);

        // Template trigger {{
        const tmplMatch = textBefore.match(/\{\{([^{}|]{0,30})$/);
        if (tmplMatch) {
            const query = tmplMatch[1];
            if (SETTINGS.enableAPIAutocomplete && query.length >= 1) {
                showAutocomplete(textarea, '{{', [], true);
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(async () => {
                    const results = await searchWikiPages(query);
                    const suggestions = results.map(r => ({ ...r, type: 'template' }));
                    showAutocomplete(textarea, '{{', suggestions);
                }, CONFIG.searchDebounceMs);
                return;
            }
        }

        // Category trigger [[Category:
        const catMatch = textBefore.match(/\[\[(?:Category|Kategorie):([^\[\]|]{0,30})$/i);
        if (catMatch) {
            const query = catMatch[1];
            if (SETTINGS.enableAPIAutocomplete && query.length >= 1) {
                showAutocomplete(textarea, '[[Category:', [], true);
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(async () => {
                    const results = await searchCategories(query);
                    showAutocomplete(textarea, '[[Category:', results);
                }, CONFIG.searchDebounceMs);
                return;
            }
        }

        // Link trigger [[ (but not Category or File)
        const linkMatch = textBefore.match(/\[\[(?!Category:|Kategorie:|File:|Datei:)([^\[\]|:]{0,30})$/i);
        if (linkMatch) {
            const query = linkMatch[1];
            if (SETTINGS.enableAPIAutocomplete && query.length >= 1) {
                showAutocomplete(textarea, '[[', [], true);
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(async () => {
                    const results = await searchWikiPages(query);
                    showAutocomplete(textarea, '[[', results);
                }, CONFIG.searchDebounceMs);
                return;
            }
        }

        hideAutocomplete();
    }

    // ========================================
    // CONTEXT MENU
    // ========================================
    let contextMenu = null;

    function createContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'ee-context-menu';

        const items = [
            { icon: 'B', label: 'Bold', action: () => applySyntax(WIKI_SYNTAX.formatting[0]), kbd: 'Ctrl+B' },
            { icon: 'I', label: 'Italic', action: () => applySyntax(WIKI_SYNTAX.formatting[1]), kbd: 'Ctrl+I' },
            { sep: true },
            { icon: '[[]]', label: 'Internal Link', action: () => applySyntax(WIKI_SYNTAX.links[0]), kbd: 'Ctrl+K' },
            { icon: '[url]', label: 'External Link', action: () => applySyntax(WIKI_SYNTAX.links[2]) },
            { sep: true },
            { icon: '🎨', label: 'Code Highlighter', action: () => showCodeHighlighter() },
            { icon: '✨', label: 'HTML Templates', action: () => showTemplatePicker() },
            { sep: true },
            { icon: 'IMG', label: 'Insert Image', action: () => applySyntax(WIKI_SYNTAX.media[0]) },
            { icon: '⬆', label: 'Upload Image', action: () => showUploadDialog() },
            { sep: true },
            { icon: 'TBL', label: 'Insert Table', action: () => showTableDialog() },
            { icon: '{{}}', label: 'Template', action: () => applySyntax(WIKI_SYNTAX.templates[0]) }
        ];

        for (const it of items) {
            if (it.sep) {
                const sep = document.createElement('div');
                sep.className = 'ctx-sep';
                menu.appendChild(sep);
                continue;
            }

            const item = document.createElement('div');
            item.className = 'ctx-item';
            item.innerHTML = `
                <span class="ctx-icon">${escapeHtml(it.icon)}</span>
                <span>${escapeHtml(it.label)}</span>
                ${it.kbd ? `<span class="ctx-kbd">${it.kbd}</span>` : ''}
            `;
            item.addEventListener('click', () => {
                hideContextMenu();
                it.action();
            });
            menu.appendChild(item);
        }

        document.body.appendChild(menu);
        return menu;
    }

    function showContextMenu(x, y) {
        if (!contextMenu) contextMenu = createContextMenu();

        const menuWidth = 240;
        const menuHeight = 400;
        x = Math.min(x, window.innerWidth - menuWidth - 10);
        y = Math.min(y, window.innerHeight - menuHeight - 10);

        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.add('visible');
    }

    function hideContextMenu() {
        if (contextMenu) contextMenu.classList.remove('visible');
    }

    // ========================================
    // TABLE DIALOG (VISUAL GRID SELECTOR)
    // ========================================
    let tableDialog = null;

    function createTableDialog() {
        const modal = document.createElement('div');
        modal.className = 'ee-modal';
        modal.id = 'ee-table-modal';

        modal.innerHTML = `
            <div class="ee-modal-content" style="max-width:560px;">
                <div class="ee-modal-header">
                    <h2 class="ee-modal-title">📊 Insert Table</h2>
                    <button class="ee-modal-close" id="table-close">×</button>
                </div>
                <div class="ee-modal-body">
                    <div class="table-grid-container">
                        <div class="table-grid-label">
                            Select size: <span class="table-grid-size" id="grid-size">3 × 3</span>
                        </div>
                        <div class="table-grid" id="table-grid"></div>
                        <div style="display:flex;gap:16px;">
                            <div style="flex:1;">
                                <label class="ee-label">Columns</label>
                                <input type="number" class="ee-input" id="table-cols" min="1" max="15" value="3">
                            </div>
                            <div style="flex:1;">
                                <label class="ee-label">Rows</label>
                                <input type="number" class="ee-input" id="table-rows" min="1" max="30" value="3">
                            </div>
                        </div>
                    </div>

                    <div class="ee-form-group">
                        <label class="ee-label">Header Row <span class="hint">(comma separated)</span></label>
                        <input type="text" class="ee-input" id="table-headers" placeholder="Column 1, Column 2, Column 3">
                    </div>

                    <div class="ee-form-row">
                        <div class="ee-form-group">
                            <label class="ee-label">CSS Class</label>
                            <input type="text" class="ee-input" id="table-class" value="wikitable" placeholder="wikitable">
                        </div>
                        <div class="ee-form-group" style="display:flex;flex-direction:column;justify-content:flex-end;">
                            <label class="ee-checkbox">
                                <input type="checkbox" id="table-sortable">
                                Sortable
                            </label>
                        </div>
                    </div>

                    <div class="ee-form-group">
                        <label class="ee-label">Preview</label>
                        <div class="ee-preview" id="table-preview"></div>
                    </div>
                </div>
                <div class="ee-modal-footer">
                    <button class="ee-btn" id="table-cancel">Cancel</button>
                    <button class="ee-btn primary" id="table-insert">Insert Table</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const grid = modal.querySelector('#table-grid');
        const gridSize = modal.querySelector('#grid-size');
        const colsInput = modal.querySelector('#table-cols');
        const rowsInput = modal.querySelector('#table-rows');
        const headersInput = modal.querySelector('#table-headers');
        const classInput = modal.querySelector('#table-class');
        const sortableCheck = modal.querySelector('#table-sortable');
        const preview = modal.querySelector('#table-preview');

        // Create grid cells (10x8)
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 10; c++) {
                const cell = document.createElement('div');
                cell.className = 'table-grid-cell';
                cell.dataset.row = r + 1;
                cell.dataset.col = c + 1;

                cell.addEventListener('mouseenter', () => {
                    const targetRow = parseInt(cell.dataset.row);
                    const targetCol = parseInt(cell.dataset.col);
                    grid.querySelectorAll('.table-grid-cell').forEach(c => {
                        const cr = parseInt(c.dataset.row);
                        const cc = parseInt(c.dataset.col);
                        c.classList.toggle('active', cr <= targetRow && cc <= targetCol);
                    });
                    gridSize.textContent = `${targetCol} × ${targetRow}`;
                });

                cell.addEventListener('click', () => {
                    const targetRow = parseInt(cell.dataset.row);
                    const targetCol = parseInt(cell.dataset.col);
                    colsInput.value = targetCol;
                    rowsInput.value = targetRow;
                    updateGridSelection();
                    updatePreview();
                });

                grid.appendChild(cell);
            }
        }

        function updateGridSelection() {
            const cols = parseInt(colsInput.value) || 1;
            const rows = parseInt(rowsInput.value) || 1;
            grid.querySelectorAll('.table-grid-cell').forEach(c => {
                const cr = parseInt(c.dataset.row);
                const cc = parseInt(c.dataset.col);
                c.classList.remove('active', 'selected');
                if (cr <= rows && cc <= cols) {
                    c.classList.add('selected');
                }
            });
            gridSize.textContent = `${cols} × ${rows}`;
        }

        function buildWikitext() {
            const cols = Math.max(1, Math.min(15, parseInt(colsInput.value) || 3));
            const rows = Math.max(1, Math.min(30, parseInt(rowsInput.value) || 3));
            const cls = (classInput.value || 'wikitable').trim();
            const sortable = sortableCheck.checked;
            const classAttr = sortable ? `${cls} sortable` : cls;

            let headers = (headersInput.value || '').trim();
            let headerCells = headers ? headers.split(',').map(s => s.trim()) : [];

            while (headerCells.length < cols) headerCells.push(`Column ${headerCells.length + 1}`);
            if (headerCells.length > cols) headerCells = headerCells.slice(0, cols);

            const lines = [];
            lines.push(`{| class="${classAttr}"`);
            lines.push('|-');
            lines.push('! ' + headerCells.join(' !! '));

            for (let r = 0; r < rows; r++) {
                lines.push('|-');
                const cells = [];
                for (let c = 0; c < cols; c++) {
                    cells.push(`Cell ${r + 1}-${c + 1}`);
                }
                lines.push('| ' + cells.join(' || '));
            }

            lines.push('|}');
            return lines.join('\n');
        }

        function updatePreview() {
            preview.textContent = buildWikitext();
        }

        [colsInput, rowsInput].forEach(el => {
            el.addEventListener('input', () => {
                updateGridSelection();
                updatePreview();
            });
        });
        [headersInput, classInput].forEach(el => el.addEventListener('input', updatePreview));
        sortableCheck.addEventListener('change', updatePreview);

        modal.querySelector('#table-close').addEventListener('click', () => modal.classList.remove('visible'));
        modal.querySelector('#table-cancel').addEventListener('click', () => modal.classList.remove('visible'));
        modal.querySelector('#table-insert').addEventListener('click', () => {
            const textarea = getTextarea();
            if (textarea) insertAtCursor(textarea, buildWikitext());
            modal.classList.remove('visible');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('visible');
        });

        updateGridSelection();
        updatePreview();

        return modal;
    }

    function showTableDialog() {
        if (!tableDialog) tableDialog = createTableDialog();
        tableDialog.classList.add('visible');
        const colsInput = tableDialog.querySelector('#table-cols');
        colsInput.dispatchEvent(new Event('input'));
    }

    // ========================================
    // CODE HIGHLIGHTER WITH EDITABLE PREVIEW
    // ========================================
    let codeHighlighterDialog = null;

    function createCodeHighlighter() {
        const modal = document.createElement('div');
        modal.className = 'ee-modal';
        modal.id = 'ee-code-highlighter';

        const languages = [
            { value: 'javascript', label: 'JavaScript' },
            { value: 'php', label: 'PHP' },
            { value: 'python', label: 'Python' },
            { value: 'sql', label: 'SQL' },
            { value: 'html', label: 'HTML' },
            { value: 'css', label: 'CSS' },
            { value: 'json', label: 'JSON' },
            { value: 'xml', label: 'XML' },
            { value: 'bash', label: 'Bash/Shell' },
            { value: 'csharp', label: 'C#' },
            { value: 'java', label: 'Java' }
        ];

        modal.innerHTML = `
            <div class="ee-modal-content xl">
                <div class="ee-modal-header">
                    <h2 class="ee-modal-title">🎨 Code Syntax Highlighter</h2>
                    <button class="ee-modal-close" id="code-hl-close">×</button>
                </div>
                <div class="ee-modal-body">
                    <div class="code-hl-layout">
                        <div class="code-hl-left">
                            <div class="ee-form-row" style="margin-bottom:16px;">
                                <div class="ee-form-group" style="margin-bottom:0;">
                                    <label class="ee-label">Language</label>
                                    <select id="code-hl-lang" class="ee-select">
                                        ${languages.map(l => `<option value="${l.value}">${l.label}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="ee-form-group" style="margin-bottom:0;">
                                    <label class="ee-label">Theme</label>
                                    <select id="code-hl-theme" class="ee-select">
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                        <option value="monokai">Monokai</option>
                                    </select>
                                </div>
                            </div>

                            <div class="ee-form-group">
                                <label class="ee-label">Code Input</label>
                                <textarea id="code-hl-input" class="ee-textarea code" rows="14" placeholder="// Paste or type your code here...
function example() {
    console.log('Hello World');
}"></textarea>
                            </div>

                            <button type="button" class="ee-btn primary" id="code-hl-convert" style="width:100%;">
                                🎨 Convert to Highlighted HTML
                            </button>
                        </div>

                        <div class="code-hl-right">
                            <div class="ee-form-group" style="flex:1;display:flex;flex-direction:column;">
                                <label class="ee-label">
                                    Preview
                                    <span class="hint">(click to edit directly)</span>
                                </label>
                                <div id="code-hl-preview-wrap" class="ee-editable-preview" style="flex:1;">
                                    <div id="code-hl-preview" class="ee-editable-content" contenteditable="true" data-placeholder="Preview will appear after conversion..."></div>
                                </div>
                                <div class="ee-preview-actions">
                                    <button type="button" class="ee-btn sm" id="code-hl-refresh">🔄 Regenerate</button>
                                    <button type="button" class="ee-btn sm" id="code-hl-reset">↩️ Reset Changes</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="ee-form-group" style="margin-top:16px;">
                        <label class="ee-label">
                            Generated HTML
                            <span class="hint">(updates from preview edits)</span>
                        </label>
                        <textarea id="code-hl-output" class="ee-html-output" rows="4" readonly></textarea>
                    </div>
                </div>
                <div class="ee-modal-footer">
                    <button class="ee-btn" id="code-hl-cancel">Cancel</button>
                    <button class="ee-btn" id="code-hl-copy">📋 Copy HTML</button>
                    <button class="ee-btn primary" id="code-hl-insert" disabled>✅ Insert</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const langSelect = modal.querySelector('#code-hl-lang');
        const themeSelect = modal.querySelector('#code-hl-theme');
        const codeInput = modal.querySelector('#code-hl-input');
        const preview = modal.querySelector('#code-hl-preview');
        const previewWrap = modal.querySelector('#code-hl-preview-wrap');
        const output = modal.querySelector('#code-hl-output');
        const convertBtn = modal.querySelector('#code-hl-convert');
        const refreshBtn = modal.querySelector('#code-hl-refresh');
        const resetBtn = modal.querySelector('#code-hl-reset');
        const copyBtn = modal.querySelector('#code-hl-copy');
        const insertBtn = modal.querySelector('#code-hl-insert');

        let lastGeneratedHtml = '';

        function doConvert() {
            const code = codeInput.value;
            const lang = langSelect.value;
            const theme = themeSelect.value;

            if (!code.trim()) {
                preview.innerHTML = '';
                output.value = '';
                insertBtn.disabled = true;
                lastGeneratedHtml = '';
                previewWrap.classList.remove('is-edited');
                return;
            }

            const html = highlightCode(code, lang, theme);
            lastGeneratedHtml = html;
            preview.innerHTML = html;
            output.value = html;
            insertBtn.disabled = false;
            previewWrap.classList.remove('is-edited');
        }

        function updateOutputFromPreview() {
            const currentHtml = preview.innerHTML;
            output.value = currentHtml;

            if (currentHtml !== lastGeneratedHtml && lastGeneratedHtml !== '') {
                previewWrap.classList.add('is-edited');
            } else {
                previewWrap.classList.remove('is-edited');
            }
        }

        convertBtn.addEventListener('click', doConvert);

        langSelect.addEventListener('change', () => {
            if (codeInput.value.trim()) doConvert();
        });
        themeSelect.addEventListener('change', () => {
            if (codeInput.value.trim()) doConvert();
        });

        preview.addEventListener('input', () => {
            updateOutputFromPreview();
            insertBtn.disabled = !preview.innerHTML.trim();
        });

        preview.addEventListener('focus', () => previewWrap.classList.add('is-focused'));
        preview.addEventListener('blur', () => {
            previewWrap.classList.remove('is-focused');
            updateOutputFromPreview();
        });

        refreshBtn.addEventListener('click', doConvert);

        resetBtn.addEventListener('click', () => {
            if (lastGeneratedHtml) {
                preview.innerHTML = lastGeneratedHtml;
                output.value = lastGeneratedHtml;
                previewWrap.classList.remove('is-edited');
            }
        });

        copyBtn.addEventListener('click', () => {
            const html = output.value;
            if (html) {
                navigator.clipboard.writeText(html).then(() => {
                    showToast('HTML copied to clipboard!', 'success');
                });
            }
        });

        insertBtn.addEventListener('click', () => {
            const html = output.value;
            if (html) {
                const textarea = getTextarea();
                if (textarea) insertAtCursor(textarea, html, 0);
                modal.classList.remove('visible');
                showToast('Code block inserted!', 'success');
            }
        });

        modal.querySelector('#code-hl-close').addEventListener('click', () => modal.classList.remove('visible'));
        modal.querySelector('#code-hl-cancel').addEventListener('click', () => modal.classList.remove('visible'));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('visible');
        });

        codeInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                doConvert();
            }
        });

        return modal;
    }

    function showCodeHighlighter() {
        if (!codeHighlighterDialog) codeHighlighterDialog = createCodeHighlighter();

        const codeInput = codeHighlighterDialog.querySelector('#code-hl-input');
        const preview = codeHighlighterDialog.querySelector('#code-hl-preview');
        const output = codeHighlighterDialog.querySelector('#code-hl-output');
        const insertBtn = codeHighlighterDialog.querySelector('#code-hl-insert');
        const previewWrap = codeHighlighterDialog.querySelector('#code-hl-preview-wrap');

        codeInput.value = '';
        preview.innerHTML = '';
        output.value = '';
        insertBtn.disabled = true;
        previewWrap.classList.remove('is-edited', 'is-focused');

        codeHighlighterDialog.classList.add('visible');
        setTimeout(() => codeInput.focus(), 100);
    }

    // ========================================
    // HTML TEMPLATE PICKER WITH EDITABLE PREVIEW
    // ========================================
    let templatePickerDialog = null;

    function createTemplatePicker() {
        const modal = document.createElement('div');
        modal.className = 'ee-modal';
        modal.id = 'ee-template-picker';

        const categories = Object.keys(HTML_TEMPLATES);

        modal.innerHTML = `
            <div class="ee-modal-content wide">
                <div class="ee-modal-header">
                    <h2 class="ee-modal-title">✨ HTML Templates</h2>
                    <button class="ee-modal-close" id="tpl-close">×</button>
                </div>
                <div class="ee-modal-body">
                    <div class="template-layout">
                        <div class="template-sidebar">
                            <div class="template-categories" id="tpl-categories">
                                ${categories.map((cat, i) => `
                                    <button class="template-category ${i === 0 ? 'active' : ''}" data-cat="${cat}">
                                        <span class="cat-icon">${HTML_TEMPLATES[cat].icon}</span>
                                        ${HTML_TEMPLATES[cat].label.replace(/^[^\s]+\s/, '')}
                                    </button>
                                `).join('')}
                            </div>

                            <div class="template-list" id="tpl-list"></div>
                        </div>

                        <div class="template-main">
                            <div id="tpl-empty" class="template-empty">
                                ← Select a template from the list
                            </div>

                            <div id="tpl-preview-area" style="display:none;flex:1;display:none;flex-direction:column;">
                                <div class="ee-form-group" style="flex:1;display:flex;flex-direction:column;">
                                    <label class="ee-label">
                                        Preview
                                        <span class="hint">(click to edit directly)</span>
                                    </label>
                                    <div id="tpl-preview-wrap" class="ee-editable-preview" style="flex:1;">
                                        <div id="tpl-preview" class="ee-editable-content" contenteditable="true" data-placeholder="Template preview..."></div>
                                    </div>
                                    <div class="ee-preview-actions">
                                        <button type="button" class="ee-btn sm" id="tpl-reset">↩️ Reset to Original</button>
                                        <button type="button" class="ee-btn sm" id="tpl-copy-html">📋 Copy HTML</button>
                                    </div>
                                </div>

                                <div class="ee-form-group" style="margin-top:12px;">
                                    <label class="ee-label">
                                        HTML Output
                                        <span class="hint">(updates from preview edits)</span>
                                    </label>
                                    <textarea id="tpl-output" class="ee-html-output" rows="3" readonly></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ee-modal-footer">
                    <button class="ee-btn" id="tpl-cancel">Cancel</button>
                    <button class="ee-btn primary" id="tpl-insert" disabled>✅ Insert</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const categoriesEl = modal.querySelector('#tpl-categories');
        const list = modal.querySelector('#tpl-list');
        const emptyEl = modal.querySelector('#tpl-empty');
        const previewArea = modal.querySelector('#tpl-preview-area');
        const preview = modal.querySelector('#tpl-preview');
        const previewWrap = modal.querySelector('#tpl-preview-wrap');
        const output = modal.querySelector('#tpl-output');
        const insertBtn = modal.querySelector('#tpl-insert');
        const resetBtn = modal.querySelector('#tpl-reset');
        const copyHtmlBtn = modal.querySelector('#tpl-copy-html');

        let currentCategory = categories[0];
        let selectedTemplate = null;
        let originalHtml = '';

        function renderTemplateList(cat) {
            list.innerHTML = '';
            const templates = HTML_TEMPLATES[cat]?.items || [];

            templates.forEach((tpl, idx) => {
                const item = document.createElement('div');
                item.className = 'template-item';
                item.dataset.index = idx;
                item.innerHTML = `
                    <div class="template-item-icon">${tpl.icon || '📄'}</div>
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(tpl.name)}</div>
                        <div class="template-item-desc">${escapeHtml(tpl.desc || '')}</div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    list.querySelectorAll('.template-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');

                    selectedTemplate = tpl;
                    originalHtml = tpl.template;
                    preview.innerHTML = tpl.template;
                    output.value = tpl.template;

                    emptyEl.style.display = 'none';
                    previewArea.style.display = 'flex';
                    previewWrap.classList.remove('is-edited');
                    insertBtn.disabled = false;
                });

                list.appendChild(item);
            });
        }

        function updateOutputFromPreview() {
            const currentHtml = preview.innerHTML;
            output.value = currentHtml;

            if (currentHtml !== originalHtml && originalHtml !== '') {
                previewWrap.classList.add('is-edited');
            } else {
                previewWrap.classList.remove('is-edited');
            }
        }

        // Category click handlers
        categoriesEl.querySelectorAll('.template-category').forEach(catBtn => {
            catBtn.addEventListener('click', () => {
                categoriesEl.querySelectorAll('.template-category').forEach(c => c.classList.remove('active'));
                catBtn.classList.add('active');
                currentCategory = catBtn.dataset.cat;
                renderTemplateList(currentCategory);

                // Reset selection
                selectedTemplate = null;
                originalHtml = '';
                emptyEl.style.display = 'flex';
                previewArea.style.display = 'none';
                insertBtn.disabled = true;
            });
        });

        // Preview editing
        preview.addEventListener('input', () => {
            updateOutputFromPreview();
            insertBtn.disabled = !preview.innerHTML.trim();
        });

        preview.addEventListener('focus', () => previewWrap.classList.add('is-focused'));
        preview.addEventListener('blur', () => {
            previewWrap.classList.remove('is-focused');
            updateOutputFromPreview();
        });

        // Reset button
        resetBtn.addEventListener('click', () => {
            if (originalHtml) {
                preview.innerHTML = originalHtml;
                output.value = originalHtml;
                previewWrap.classList.remove('is-edited');
            }
        });

        // Copy HTML button
        copyHtmlBtn.addEventListener('click', () => {
            const html = output.value;
            if (html) {
                navigator.clipboard.writeText(html).then(() => {
                    showToast('HTML copied to clipboard!', 'success');
                });
            }
        });

        // Insert button
        insertBtn.addEventListener('click', () => {
            const html = output.value;
            if (html) {
                const textarea = getTextarea();
                if (textarea) insertAtCursor(textarea, html, 0);
                modal.classList.remove('visible');
                showToast('Template inserted!', 'success');
            }
        });

        modal.querySelector('#tpl-close').addEventListener('click', () => modal.classList.remove('visible'));
        modal.querySelector('#tpl-cancel').addEventListener('click', () => modal.classList.remove('visible'));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('visible');
        });

        // Initialize first category
        renderTemplateList(categories[0]);

        return modal;
    }

    function showTemplatePicker() {
        if (!templatePickerDialog) templatePickerDialog = createTemplatePicker();

        const emptyEl = templatePickerDialog.querySelector('#tpl-empty');
        const previewArea = templatePickerDialog.querySelector('#tpl-preview-area');
        const preview = templatePickerDialog.querySelector('#tpl-preview');
        const previewWrap = templatePickerDialog.querySelector('#tpl-preview-wrap');
        const output = templatePickerDialog.querySelector('#tpl-output');
        const insertBtn = templatePickerDialog.querySelector('#tpl-insert');
        const list = templatePickerDialog.querySelector('#tpl-list');

        // Reset state
        list.querySelectorAll('.template-item').forEach(i => i.classList.remove('selected'));
        emptyEl.style.display = 'flex';
        previewArea.style.display = 'none';
        preview.innerHTML = '';
        output.value = '';
        previewWrap.classList.remove('is-edited', 'is-focused');
        insertBtn.disabled = true;

        templatePickerDialog.classList.add('visible');
    }

    // ========================================
    // UPLOAD DIALOG
    // ========================================
    let uploadDialog = null;
    let pendingImages = [];

    function createUploadDialog() {
        const modal = document.createElement('div');
        modal.className = 'ee-modal';
        modal.id = 'ee-upload-modal';

        modal.innerHTML = `
            <div class="ee-modal-content" style="max-width:640px;">
                <div class="ee-modal-header">
                    <h2 class="ee-modal-title">⬆ Upload Images</h2>
                    <button class="ee-modal-close" id="upload-close">×</button>
                </div>
                <div class="ee-modal-body">
                    <div class="upload-zone" id="upload-zone">
                        <div class="upload-zone-icon">⬆</div>
                        <div class="upload-zone-text">Drop images here or click to browse</div>
                        <div class="upload-zone-hint">Supports: JPG, PNG, GIF, WebP • Paste with Ctrl+V</div>
                        <input type="file" id="upload-input" accept="image/*" multiple style="display:none;">
                    </div>

                    <div class="upload-preview-grid" id="upload-previews"></div>

                    <div class="ee-form-row" style="margin-top:20px;">
                        <div class="ee-form-group">
                            <label class="ee-label">Filename Prefix</label>
                            <input type="text" class="ee-input" id="upload-prefix" placeholder="Optional prefix">
                        </div>
                        <div class="ee-form-group">
                            <label class="ee-label">Description</label>
                            <input type="text" class="ee-input" id="upload-desc" placeholder="Image description">
                        </div>
                    </div>

                    <div class="ee-form-group">
                        <label class="ee-checkbox">
                            <input type="checkbox" id="upload-confirm">
                            I confirm I have rights to upload these images
                        </label>
                    </div>

                    <div id="upload-progress-wrap" style="display:none;margin-top:16px;">
                        <div class="ee-progress">
                            <div class="ee-progress-bar" id="upload-progress-bar"></div>
                        </div>
                        <div id="upload-status" style="margin-top:8px;font-size:13px;color:var(--ee-text-secondary);"></div>
                    </div>
                </div>
                <div class="ee-modal-footer">
                    <button class="ee-btn" id="upload-cancel">Cancel</button>
                    <button class="ee-btn primary" id="upload-submit" disabled>Upload & Insert</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const zone = modal.querySelector('#upload-zone');
        const input = modal.querySelector('#upload-input');
        const previews = modal.querySelector('#upload-previews');
        const confirmCheck = modal.querySelector('#upload-confirm');
        const submitBtn = modal.querySelector('#upload-submit');

        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            addImages(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
        });

        input.addEventListener('change', () => {
            addImages(Array.from(input.files || []));
            input.value = '';
        });

        confirmCheck.addEventListener('change', updateSubmitState);

        modal.querySelector('#upload-close').addEventListener('click', () => hideUploadDialog());
        modal.querySelector('#upload-cancel').addEventListener('click', () => hideUploadDialog());
        modal.querySelector('#upload-submit').addEventListener('click', () => doUpload());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideUploadDialog();
        });

        // Paste handler
        modal.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
                if (item.type?.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) addImages([blob]);
                }
            }
        });

        function addImages(files) {
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const id = Math.random().toString(36).slice(2);
                    const name = file.name || generateFileName(file.type.split('/')[1] || 'png');
                    pendingImages.push({ file, dataUrl: e.target.result, name, id });
                    renderPreviews();
                };
                reader.readAsDataURL(file);
            }
        }

        function renderPreviews() {
            previews.innerHTML = '';

            for (const img of pendingImages) {
                const item = document.createElement('div');
                item.className = 'upload-preview-item';
                item.innerHTML = `
                    <img class="upload-preview-img" src="${img.dataUrl}">
                    <button class="upload-preview-remove" data-id="${img.id}">×</button>
                    <div class="upload-preview-info">
                        <div class="upload-preview-name">${escapeHtml(img.name)}</div>
                    </div>
                `;
                item.querySelector('.upload-preview-remove').addEventListener('click', () => {
                    pendingImages = pendingImages.filter(p => p.id !== img.id);
                    renderPreviews();
                });
                previews.appendChild(item);
            }

            zone.style.display = pendingImages.length > 0 ? 'none' : '';
            updateSubmitState();
        }

        function updateSubmitState() {
            submitBtn.disabled = !confirmCheck.checked || pendingImages.length === 0;
        }

        async function doUpload() {
            const progressWrap = modal.querySelector('#upload-progress-wrap');
            const progressBar = modal.querySelector('#upload-progress-bar');
            const status = modal.querySelector('#upload-status');
            const prefix = modal.querySelector('#upload-prefix').value.trim();
            const desc = modal.querySelector('#upload-desc').value.trim();

            submitBtn.disabled = true;
            progressWrap.style.display = 'block';

            const uploaded = [];
            const total = pendingImages.length;

            for (let i = 0; i < pendingImages.length; i++) {
                const img = pendingImages[i];
                const fileName = prefix ? `${prefix}_${img.name}` : img.name;
                status.textContent = `Uploading ${i + 1} of ${total}: ${fileName}...`;
                progressBar.style.width = `${(i / total) * 100}%`;

                try {
                    const result = await uploadImage(img.file, fileName, desc);
                    if (result.success) {
                        uploaded.push({ fileName: result.fileName, originalName: img.name });
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                }

                progressBar.style.width = `${((i + 1) / total) * 100}%`;
            }

            if (uploaded.length > 0) {
                progressBar.classList.add('success');
                status.textContent = `Uploaded ${uploaded.length} of ${total} images successfully!`;

                const textarea = getTextarea();
                if (textarea) {
                    const wiki = uploaded.map(f =>
                        `[[File:${f.fileName}|thumb|${desc || f.originalName}]]`
                    ).join('\n');
                    insertAtCursor(textarea, wiki);
                }

                setTimeout(() => {
                    hideUploadDialog();
                    showToast('Images uploaded and inserted!', 'success');
                }, 1000);
            } else {
                status.textContent = 'Upload failed. Please check permissions.';
                submitBtn.disabled = false;
            }
        }

        modal._render = renderPreviews;
        return modal;
    }

    function showUploadDialog(initialImage = null) {
        if (!uploadDialog) uploadDialog = createUploadDialog();

        pendingImages = [];
        uploadDialog.querySelector('#upload-prefix').value = '';
        uploadDialog.querySelector('#upload-desc').value = '';
        uploadDialog.querySelector('#upload-confirm').checked = false;
        uploadDialog.querySelector('#upload-submit').disabled = true;
        uploadDialog.querySelector('#upload-progress-wrap').style.display = 'none';
        uploadDialog.querySelector('#upload-progress-bar').style.width = '0%';
        uploadDialog.querySelector('#upload-progress-bar').classList.remove('success');
        uploadDialog.querySelector('#upload-zone').style.display = '';

        uploadDialog._render();

        if (initialImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                pendingImages.push({
                    file: initialImage,
                    dataUrl: e.target.result,
                    name: initialImage.name || generateFileName(),
                    id: Math.random().toString(36).slice(2)
                });
                uploadDialog._render();
            };
            reader.readAsDataURL(initialImage);
        }

        uploadDialog.classList.add('visible');
    }

    function hideUploadDialog() {
        if (uploadDialog) uploadDialog.classList.remove('visible');
        pendingImages = [];
    }

    async function uploadImage(file, fileName, description = '') {
        return new Promise((resolve) => {
            const tokenUrl = `${CONFIG.wikiBaseUrl}${CONFIG.apiEndpoint}?action=query&meta=tokens&format=json`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: tokenUrl,
                onload: function (tokenResponse) {
                    try {
                        const tokenData = JSON.parse(tokenResponse.responseText);
                        const csrfToken = tokenData.query.tokens.csrftoken;

                        const formData = new FormData();
                        formData.append('action', 'upload');
                        formData.append('filename', fileName);
                        formData.append('format', 'json');
                        formData.append('token', csrfToken);
                        formData.append('file', file);
                        formData.append('comment', description);
                        formData.append('ignorewarnings', '1');

                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: `${CONFIG.wikiBaseUrl}${CONFIG.apiEndpoint}`,
                            data: formData,
                            onload: function (uploadResponse) {
                                try {
                                    const result = JSON.parse(uploadResponse.responseText);
                                    if (result.upload && result.upload.result === 'Success') {
                                        resolve({ success: true, fileName: result.upload.filename });
                                    } else {
                                        resolve({ success: false, error: result.error?.info || 'Unknown error' });
                                    }
                                } catch {
                                    fallbackUpload(file, fileName, description, resolve);
                                }
                            },
                            onerror: () => fallbackUpload(file, fileName, description, resolve)
                        });
                    } catch {
                        fallbackUpload(file, fileName, description, resolve);
                    }
                },
                onerror: () => fallbackUpload(file, fileName, description, resolve)
            });
        });
    }

    function fallbackUpload(file, fileName, description, resolve) {
        const editToken = getEditToken() || '+\\';
        const formData = new FormData();
        formData.append('wpUploadFile', file, fileName);
        formData.append('wpDestFile', fileName);
        formData.append('wpUploadDescription', description);
        formData.append('wpEditToken', editToken);
        formData.append('wpIgnoreWarning', '1');
        formData.append('wpUpload', 'Upload');

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${CONFIG.wikiBaseUrl}${CONFIG.uploadEndpoint}`,
            data: formData,
            onload: (response) => {
                resolve({ success: response.status === 200, fileName });
            },
            onerror: () => resolve({ success: false })
        });
    }

    // ========================================
    // EDITOR BEHAVIORS
    // ========================================
    function handleAutoPairs(textarea, e) {
        if (!SETTINGS.enableAutoPairs) return false;
        if (e.ctrlKey || e.metaKey || e.altKey) return false;

        const pairs = { '"': '"', "'": "'", '(': ')', '[': ']', '{': '}' };

        if (pairs[e.key]) {
            e.preventDefault();
            insertPair(textarea, e.key, pairs[e.key]);
            return true;
        }
        return false;
    }

    function handleListContinuation(textarea, e) {
        if (!SETTINGS.enableListContinuation) return false;
        if (e.key !== 'Enter') return false;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;

        const { lineStart, line } = getLineInfo(textarea);
        const match = line.match(/^([*#:;]+)(\s*)(.*)$/);
        if (!match) return false;

        const marker = match[1];
        const rest = (match[3] || '').trim();

        e.preventDefault();

        if (rest.length === 0) {
            const before = textarea.value.substring(0, lineStart);
            const after = textarea.value.substring(lineStart).replace(/^[*#:;]+\s*/, '');
            textarea.value = before + after;
            textarea.setSelectionRange(lineStart, lineStart);
            insertAtCursor(textarea, '\n');
        } else {
            insertAtCursor(textarea, '\n' + marker + ' ');
        }
        return true;
    }

    function handleTabIndent(textarea, e) {
        if (!SETTINGS.enableTabIndent) return false;
        if (e.key !== 'Tab') return false;

        const { lineStart, lineEnd, line } = getLineInfo(textarea);
        const match = line.match(/^([*#:;]+)(\s*)(.*)$/);

        if (!match) return false;

        e.preventDefault();

        const marker = match[1];
        const space = match[2];
        const content = match[3];

        const lastChar = marker[marker.length - 1];

        let newMarker;
        if (e.shiftKey) {
            newMarker = marker.slice(0, -1);
            if (newMarker.length === 0) return true;
        } else {
            newMarker = marker + lastChar;
        }

        const newLine = newMarker + space + content;
        const before = textarea.value.substring(0, lineStart);
        const after = textarea.value.substring(lineEnd);

        textarea.value = before + newLine + after;
        textarea.focus();

        const cursorPos = lineStart + newMarker.length + space.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        return true;
    }

    function handleSlashTrigger(textarea) {
        const pos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, pos);
        const lastSlashIdx = textBefore.lastIndexOf('/');

        if (lastSlashIdx >= 0) {
            const afterSlash = textBefore.substring(lastSlashIdx + 1);
            const charBefore = lastSlashIdx > 0 ? textBefore[lastSlashIdx - 1] : '\n';
            const okBefore = charBefore === '\n' || charBefore === ' ' || lastSlashIdx === 0;

            if (okBefore && !afterSlash.includes(' ') && !afterSlash.includes('\n')) {
                showSlashMenu(textarea);
                if (slashMenu) slashMenu.renderList(afterSlash);
                return;
            }
        }
        hideSlashMenu();
    }

    // ========================================
    // TOOLBAR CREATION
    // ========================================
    let toolbarEl = null;

    function createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'ee-toolbar';

        // Quick buttons
        const boldBtn = document.createElement('button');
        boldBtn.type = 'button';
        boldBtn.className = 'ee-btn icon-only';
        boldBtn.innerHTML = '<span class="icon">B</span>';
        boldBtn.title = 'Bold (Ctrl+B)';
        boldBtn.addEventListener('click', () => applySyntax(WIKI_SYNTAX.formatting[0]));

        const italicBtn = document.createElement('button');
        italicBtn.type = 'button';
        italicBtn.className = 'ee-btn icon-only';
        italicBtn.innerHTML = '<span class="icon" style="font-style:italic;">I</span>';
        italicBtn.title = 'Italic (Ctrl+I)';
        italicBtn.addEventListener('click', () => applySyntax(WIKI_SYNTAX.formatting[1]));

        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'ee-btn icon-only';
        linkBtn.innerHTML = '<span class="icon">[[]]</span>';
        linkBtn.title = 'Link (Ctrl+K)';
        linkBtn.addEventListener('click', () => applySyntax(WIKI_SYNTAX.links[0]));

        toolbar.appendChild(boldBtn);
        toolbar.appendChild(italicBtn);
        toolbar.appendChild(linkBtn);

        toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'ee-divider' }));

        // Dropdowns
        toolbar.appendChild(createDropdown('Format', WIKI_SYNTAX.formatting));
        toolbar.appendChild(createDropdown('Headings', WIKI_SYNTAX.headings));
        toolbar.appendChild(createDropdown('Lists', WIKI_SYNTAX.lists));
        toolbar.appendChild(createDropdown('Links', WIKI_SYNTAX.links));
        toolbar.appendChild(createDropdown('Media', WIKI_SYNTAX.media));
        toolbar.appendChild(createDropdown('Tables', WIKI_SYNTAX.tables));
        toolbar.appendChild(createDropdown('Templates', WIKI_SYNTAX.templates));
        toolbar.appendChild(createDropdown('Special', WIKI_SYNTAX.special));

        toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'ee-divider' }));

        // HTML Tools
        const codeBtn = document.createElement('button');
        codeBtn.type = 'button';
        codeBtn.className = 'ee-btn';
        codeBtn.innerHTML = '🎨 Code';
        codeBtn.title = 'Code Highlighter';
        codeBtn.addEventListener('click', () => showCodeHighlighter());
        toolbar.appendChild(codeBtn);

        const htmlBtn = document.createElement('button');
        htmlBtn.type = 'button';
        htmlBtn.className = 'ee-btn';
        htmlBtn.innerHTML = '✨ HTML';
        htmlBtn.title = 'HTML Templates';
        htmlBtn.addEventListener('click', () => showTemplatePicker());
        toolbar.appendChild(htmlBtn);

        toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'ee-divider' }));

        // Upload button
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'ee-btn primary';
        uploadBtn.innerHTML = '⬆ Upload';
        uploadBtn.title = 'Upload images';
        uploadBtn.addEventListener('click', () => showUploadDialog());
        toolbar.appendChild(uploadBtn);

        // Spacer
        toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'ee-spacer' }));

        // Help hint
        const hint = document.createElement('span');
        hint.style.cssText = 'font-size:12px;color:var(--ee-text-muted);';
        hint.innerHTML = '<kbd class="kbd">/</kbd> Commands';
        toolbar.appendChild(hint);

        // Settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.type = 'button';
        settingsBtn.className = 'ee-btn ghost icon-only';
        settingsBtn.innerHTML = '⚙';
        settingsBtn.title = 'Settings';
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showSettingsMenu(settingsBtn);
        });
        toolbar.appendChild(settingsBtn);

        toolbarEl = toolbar;

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ee-dropdown')) {
                document.querySelectorAll('.ee-dropdown.open').forEach(m => m.classList.remove('open'));
            }
        });

        return toolbar;
    }

    // ========================================
    // SETTINGS MENU
    // ========================================
    let settingsMenu = null;

    function createSettingsMenu() {
        const menu = document.createElement('div');
        menu.className = 'ee-dropdown-panel';
        menu.id = 'ee-settings-menu';
        menu.style.cssText = 'position:fixed;right:20px;top:60px;min-width:280px;';

        menu.innerHTML = `
            <div class="ee-dropdown-header">Settings</div>
            <div style="padding:12px;">
                <div style="margin-bottom:16px;">
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Toolbar Position</div>
                    <div style="display:flex;gap:8px;">
                        <label class="ee-checkbox" style="flex:1;">
                            <input type="radio" name="ee-placement" value="above"> Above
                        </label>
                        <label class="ee-checkbox" style="flex:1;">
                            <input type="radio" name="ee-placement" value="below"> Below
                        </label>
                        <label class="ee-checkbox" style="flex:1;">
                            <input type="radio" name="ee-placement" value="floating"> Float
                        </label>
                    </div>
                </div>
                <div style="border-top:1px solid var(--ee-border);padding-top:12px;">
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-sticky"> Sticky toolbar
                    </label>
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-autopairs"> Auto-pair brackets & quotes
                    </label>
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-listcont"> Continue lists on Enter
                    </label>
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-tabindent"> Tab to indent lists
                    </label>
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-autocomplete"> Smart autocomplete
                    </label>
                    <label class="ee-checkbox" style="margin-bottom:10px;">
                        <input type="checkbox" id="ee-opt-api"> API-powered search
                    </label>
                    <label class="ee-checkbox">
                        <input type="checkbox" id="ee-opt-wordcount"> Show word count
                    </label>
                </div>
            </div>
        `;

        document.body.appendChild(menu);

        // Initialize values
        const radios = menu.querySelectorAll('input[name="ee-placement"]');
        radios.forEach(r => {
            r.checked = r.value === SETTINGS.toolbarPlacement;
            r.addEventListener('change', () => {
                SETTINGS.toolbarPlacement = r.value;
                if (r.value === 'floating') SETTINGS.toolbarSticky = false;
                saveSettings(SETTINGS);
                applyToolbarPlacement();
            });
        });

        const checkboxes = [
            { id: 'ee-opt-sticky', key: 'toolbarSticky' },
            { id: 'ee-opt-autopairs', key: 'enableAutoPairs' },
            { id: 'ee-opt-listcont', key: 'enableListContinuation' },
            { id: 'ee-opt-tabindent', key: 'enableTabIndent' },
            { id: 'ee-opt-autocomplete', key: 'enableAutoComplete' },
            { id: 'ee-opt-api', key: 'enableAPIAutocomplete' },
            { id: 'ee-opt-wordcount', key: 'showWordCount' }
        ];

        checkboxes.forEach(({ id, key }) => {
            const cb = menu.querySelector(`#${id}`);
            if (cb) {
                cb.checked = !!SETTINGS[key];
                cb.addEventListener('change', () => {
                    SETTINGS[key] = cb.checked;
                    saveSettings(SETTINGS);
                    if (key === 'toolbarSticky') applyToolbarPlacement();
                    if (key === 'showWordCount') {
                        const statusBar = document.getElementById('ee-status-bar');
                        if (statusBar) statusBar.style.display = SETTINGS.showWordCount ? '' : 'none';
                        updateWordCount();
                    }
                });
            }
        });

        return menu;
    }

    function showSettingsMenu(anchor) {
        if (!settingsMenu) settingsMenu = createSettingsMenu();

        const isVisible = settingsMenu.style.display === 'block';
        settingsMenu.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            const rect = anchor.getBoundingClientRect();
            settingsMenu.style.top = `${rect.bottom + 8}px`;
            settingsMenu.style.right = `${window.innerWidth - rect.right}px`;
            settingsMenu.style.left = 'auto';
        }

        if (!isVisible) {
            setTimeout(() => {
                const handler = (e) => {
                    if (!settingsMenu.contains(e.target) && !anchor.contains(e.target)) {
                        settingsMenu.style.display = 'none';
                        document.removeEventListener('click', handler);
                    }
                };
                document.addEventListener('click', handler);
            }, 0);
        }
    }

    // ========================================
    // TOOLBAR PLACEMENT
    // ========================================
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    function applyToolbarPlacement() {
        const textarea = getTextarea();
        if (!textarea || !toolbarEl) return;

        toolbarEl.classList.remove('is-sticky', 'is-floating');
        toolbarEl.style.left = '';
        toolbarEl.style.top = '';

        if (toolbarEl.parentNode) toolbarEl.parentNode.removeChild(toolbarEl);

        if (SETTINGS.toolbarPlacement === 'below') {
            textarea.parentNode.insertBefore(toolbarEl, textarea.nextSibling);
        } else if (SETTINGS.toolbarPlacement === 'floating') {
            document.body.appendChild(toolbarEl);
            toolbarEl.classList.add('is-floating');
            const pos = SETTINGS.floatingPos || { x: 20, y: 120 };
            toolbarEl.style.left = `${pos.x}px`;
            toolbarEl.style.top = `${pos.y}px`;
            setupFloatingDrag();
        } else {
            textarea.parentNode.insertBefore(toolbarEl, textarea);
        }

        if (SETTINGS.toolbarSticky && SETTINGS.toolbarPlacement !== 'floating') {
            toolbarEl.classList.add('is-sticky');
        }
    }

    function setupFloatingDrag() {
        if (!toolbarEl) return;

        toolbarEl.addEventListener('mousedown', (e) => {
            if (SETTINGS.toolbarPlacement !== 'floating') return;
            if (e.target.closest('button, .ee-dropdown, input')) return;

            isDragging = true;
            const rect = toolbarEl.getBoundingClientRect();
            dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            toolbarEl.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !toolbarEl) return;

            const x = Math.max(8, Math.min(e.clientX - dragOffset.x, window.innerWidth - toolbarEl.offsetWidth - 8));
            const y = Math.max(8, Math.min(e.clientY - dragOffset.y, window.innerHeight - toolbarEl.offsetHeight - 8));

            toolbarEl.style.left = `${x}px`;
            toolbarEl.style.top = `${y}px`;
            SETTINGS.floatingPos = { x, y };
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (toolbarEl) toolbarEl.style.cursor = '';
                saveSettings(SETTINGS);
            }
        });
    }

    // ========================================
    // STATUS BAR
    // ========================================
    function createStatusBar(textarea) {
        const statusBar = document.createElement('div');
        statusBar.id = 'ee-status-bar';
        textarea.parentNode.insertBefore(statusBar, textarea.nextSibling);

        if (!SETTINGS.showWordCount) statusBar.style.display = 'none';

        return statusBar;
    }

    // ========================================
    // EVENT HANDLERS SETUP
    // ========================================
    function setupEventHandlers(textarea) {
        textarea.addEventListener('input', () => {
            handleSlashTrigger(textarea);
            checkAutocomplete(textarea);
            updateWordCount();
        });

        textarea.addEventListener('keydown', (e) => {
            if (slashMenu && slashMenu.classList.contains('visible')) {
                if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                    handleSlashNavigation(e);
                    return;
                }
            }

            if (handleAutocompleteNav(e)) return;
            if (handleTabIndent(textarea, e)) return;
            if (handleListContinuation(textarea, e)) return;
            if (handleAutoPairs(textarea, e)) return;

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        applySyntax(WIKI_SYNTAX.formatting[0]);
                        break;
                    case 'i':
                        e.preventDefault();
                        applySyntax(WIKI_SYNTAX.formatting[1]);
                        break;
                    case 'k':
                        e.preventDefault();
                        applySyntax(WIKI_SYNTAX.links[0]);
                        break;
                    case 'u':
                        e.preventDefault();
                        applySyntax(WIKI_SYNTAX.formatting[3]);
                        break;
                }
            }
        });

        textarea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            closeAllMenus();
            showContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#ee-slash-menu')) hideSlashMenu();
            if (!e.target.closest('#ee-context-menu')) hideContextMenu();
            if (!e.target.closest('#ee-autocomplete')) hideAutocomplete();
        });

        textarea.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
                if (item.type?.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) showUploadDialog(blob);
                    return;
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllMenus();
                hideContextMenu();
                document.querySelectorAll('.ee-modal.visible').forEach(m => m.classList.remove('visible'));
            }
        });
    }

    // ========================================
    // INITIALIZATION
    // ========================================
    function init() {
        const textarea = getTextarea();
        if (!textarea) {
            setTimeout(init, 500);
            return;
        }

        toolbarEl = createToolbar();
        applyToolbarPlacement();

        createStatusBar(textarea);
        updateWordCount();

        setupEventHandlers(textarea);

        showToast(' Editor loaded! Type "/" for commands.', 'success');

        console.log('MediaWiki  Editor Pro v4.0 initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();