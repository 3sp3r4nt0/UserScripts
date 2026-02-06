// ==UserScript==
// @name         Shopware 6 - Tag Filter with Query Syntax
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Multi-Tag Filter with Dork Query Syntax Support - Extended Export & Table
// @author       3sp3r4nt0
// @match        https://www.exmaple.de/admin*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shopware.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // STYLES
    // ============================================
    GM_addStyle(`

    .filter-section { margin-bottom: 15px; padding: 12px; background: rgba(30,41,59,0.5); border-radius: 8px; }
.filter-section-title { font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; }
.filter-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.filter-group { display: flex; flex-direction: column; gap: 4px; }
.filter-group label { font-size: 11px; color: #64748b; }
.filter-input { padding: 6px 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 13px; min-width: 100px; }
.filter-input:focus { outline: none; border-color: #3b82f6; }
.filter-select { padding: 6px 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 13px; min-width: 150px; cursor: pointer; }
.filter-checkbox { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 6px 10px; background: #1e293b; border-radius: 6px; border: 1px solid #334155; }
.filter-checkbox.active { background: #1d4ed8; border-color: #3b82f6; }
.filter-checkbox input { display: none; }
.filter-date { padding: 6px 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 13px; }
.filters-toggle-btn { background: linear-gradient(115deg, var(--bg-card), #303b4d); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;margin:4px; }
.filters-panel { display: none; padding: 15px; background: #0f172a; border-radius: 8px; margin-top: 10px; }
.filters-panel.show { display: block;
overflow-y:auto; height: calc(80vh - 120px);
}
.cache-indicator { font-size: 10px; color: #64748b; margin-left: 5px; }
.loading-spinner-small { display: inline-block; width: 12px; height: 12px; border: 2px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
    /* ========== FLOATING BUTTON ========== */
    #tag-filter-btn {
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 999998;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 22px;
        background: linear-gradient(145deg, #5c6bc0, #3949ab);
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(92, 107, 192, 0.4), 0 2px 8px rgba(0,0,0,0.2);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #tag-filter-btn:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 10px 30px rgba(92, 107, 192, 0.5), 0 4px 12px rgba(0,0,0,0.25);
    }

    #tag-filter-btn.active {
        background: linear-gradient(145deg, #43a047, #2e7d32);
    }

    #tag-filter-btn .icon {
        font-size: 18px;
    }

    #tag-filter-btn .count-badge {
        background: rgba(255,255,255,0.25);
        padding: 2px 8px;
        border-radius: 20px;
        font-size: 12px;
        min-width: 20px;
        text-align: center;
    }

    #tag-filter-btn .count-badge:not(:empty):not([data-count="0"]) {
        background: #ff5722;
    }

    /* ========== MODAL OVERLAY ========== */
    #tag-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(8px);
        z-index: 999999;
        display: none;
        justify-content: center;
        align-items: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    #tag-modal-overlay.show {
        display: flex;
        opacity: 1;
    }

    /* ========== MAIN MODAL ========== */
    #tag-modal {
        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
        border-radius: 20px;
        width: 98%;
        max-width: 1800px;
        height: 95vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.1);
        overflow: hidden;
        transform: scale(0.95);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #tag-modal-overlay.show #tag-modal {
        transform: scale(1);
    }

    /* ========== CSS VARIABLES ========== */
    #tag-modal {
        --primary: #6366f1;
        --primary-hover: #818cf8;
        --success: #10b981;
        --warning: #f59e0b;
        --danger: #ef4444;
        --bg-dark: #0f172a;
        --bg-card: #1e293b;
        --bg-input: #334155;
        --bg-hover: #475569;
        --border-color: #475569;
        --text-primary: #f1f5f9;
        --text-secondary: #94a3b8;
        --text-muted: #64748b;
    }

    /* ========== HEADER ========== */
    #tag-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 28px;
        background: linear-gradient(135deg, #1e293b, #334155);
        border-bottom: 1px solid var(--border-color);
    }

    #tag-modal-header h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 14px;
    }

    #tag-modal-header .title-badge {
        background: linear-gradient(135deg, var(--primary), #8b5cf6);
        padding: 5px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    }

    #tag-modal-header .version-badge {
        background: var(--bg-input);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        color: var(--text-muted);
    }

    #tag-close-btn {
        width: 40px;
        height: 40px;
        border: none;
        background: var(--bg-input);
        color: var(--text-secondary);
        border-radius: 12px;
        font-size: 20px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    #tag-close-btn:hover {
        background: var(--danger);
        color: white;
    }

    /* ========== QUERY BAR ========== */
    #query-bar {
        padding: 20px 28px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border-color);
    }

    .query-bar-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
    }

    .query-bar-title h3 {
        margin: 0;
        font-size: 15px;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .query-bar-title .query-help-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .query-bar-title .query-help-btn:hover {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
    }

    #query-input-container {
        position: relative;
        display: flex;
        gap: 10px;
        align-items: stretch;
    }

    #query-input {
        flex: 1;
        padding: 14px 18px;
        background: var(--bg-dark);
        border: 2px solid var(--border-color);
        border-radius: 12px;
        color: var(--text-primary);
        font-size: 14px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        transition: all 0.2s;
    }

    #query-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
    }

    #query-input.error {
        border-color: var(--danger);
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
    }

    #query-input.valid {
        border-color: var(--success);
    }

    #query-input::placeholder {
        color: var(--text-muted);
        font-family: inherit;
    }

    .query-input-actions {
        display: flex;
        gap: 8px;
    }

    .query-action-btn {
        padding: 12px 20px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
        opacity: 0.3;
    }

    .query-action-btn.primary {
        background: linear-gradient(135deg, var(--primary), #8b5cf6);
        color: white;
        opacity: 0.3;
    }

    .query-action-btn.primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        opacity: 0.6;
    }

    .query-action-btn.secondary {
        background: var(--bg-input);
        color: var(--text-secondary);
        opacity: 0.3;
    }

    .query-action-btn.secondary:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        opacity: 0.6;
    }

    .query-action-btn.save {
        background: linear-gradient(135deg, var(--success), #059669);
        color: white;
        opacity: 0.3;
    }

    .query-action-btn.save:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        opacity: 0.6;
    }

    /* ========== AUTOCOMPLETE ========== */
    #autocomplete-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 200px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        margin-top: 6px;
        max-height: 280px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }

    #autocomplete-dropdown.show {
        display: block;
    }

    .autocomplete-section-header {
        padding: 10px 16px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: var(--bg-dark);
        border-bottom: 1px solid var(--border-color);
    }

    .autocomplete-item {
        padding: 12px 16px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s;
    }

    .autocomplete-item:last-child {
        border-bottom: none;
    }

    .autocomplete-item:hover,
    .autocomplete-item.selected {
        background: var(--primary);
    }

    .autocomplete-item mark {
        background: rgba(251, 191, 36, 0.3);
        color: #fbbf24;
        padding: 1px 3px;
        border-radius: 3px;
    }

    .autocomplete-tag-name {
        font-size: 13px;
        color: var(--text-primary);
    }

    .autocomplete-tag-count {
        font-size: 11px;
        color: var(--text-muted);
        background: var(--bg-input);
        padding: 3px 8px;
        border-radius: 10px;
    }

    /* ========== QUERY FEEDBACK ========== */
    #query-feedback {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 12px;
        min-height: 28px;
    }

    .query-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        padding: 6px 12px;
        border-radius: 8px;
    }

    .query-status.empty {
        color: var(--text-muted);
        background: var(--bg-input);
    }

    .query-status.valid {
        color: var(--success);
        background: rgba(16, 185, 129, 0.15);
    }

    .query-status.error {
        color: var(--danger);
        background: rgba(239, 68, 68, 0.15);
    }

    .query-parsed-preview {
        font-size: 12px;
        color: var(--text-muted);
        font-family: 'JetBrains Mono', monospace;
        background: var(--bg-input);
        padding: 6px 12px;
        border-radius: 8px;
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ========== QUICK TAGS ========== */
    #quick-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
    }

    .quick-tag {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 20px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .quick-tag:hover {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
    }

    /* ========== SAVED FILTERS ========== */
    #saved-filters-container {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--border-color);
    }

    .saved-filters-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .saved-filters-header h4 {
        margin: 0;
        font-size: 13px;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .saved-filters-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .saved-filter-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: linear-gradient(135deg, #1e3a5f, #1e293b);
        border: 1px solid #2563eb;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .saved-filter-item:hover {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        transform: translateY(-1px);
    }

    .saved-filter-name {
        font-size: 12px;
        color: var(--text-primary);
        font-weight: 500;
    }

    .saved-filter-delete {
        width: 18px;
        height: 18px;
        border: none;
        background: rgba(239, 68, 68, 0.3);
        color: #fca5a5;
        border-radius: 50%;
        font-size: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .saved-filter-delete:hover {
        background: var(--danger);
        color: white;
    }

    .no-saved-filters {
        font-size: 12px;
        color: var(--text-muted);
        font-style: italic;
    }

    /* ========== MAIN CONTENT ========== */
    #tag-main-content {
        display: flex;
        flex: 1;
        overflow: hidden;
    }

    /* ========== SIDEBAR ========== */
    #tag-sidebar {
        width: 280px;
        background: var(--bg-dark);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
    }

    .sidebar-header {
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .sidebar-header h3 {
        margin: 0;
        font-size: 15px;
        color: var(--text-primary);
    }

    .sidebar-header .count {
        background: var(--primary);
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        color: white;
    }

    #tag-search-sidebar {
        padding: 14px;
        border-bottom: 1px solid var(--border-color);
    }

    #sidebar-tag-search {
        width: 100%;
        padding: 10px 14px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 13px;
    }

    #sidebar-tag-search:focus {
        outline: none;
        border-color: var(--primary);
    }

    #tag-list-container {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
    }

    .tag-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.15s;
        margin-bottom: 4px;
    }

    .tag-item:hover {
        background: var(--bg-input);
    }

    .tag-item-name {
        flex: 1;
        font-size: 13px;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .tag-item-count {
        font-size: 11px;
        color: var(--text-muted);
        margin-right: 10px;
    }

    .tag-item-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.15s;
    }

    .tag-item:hover .tag-item-actions {
        opacity: 1;
    }

    .tag-item-btn {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .tag-item-btn.include {
        background: rgba(16, 185, 129, 0.2);
        color: var(--success);
    }

    .tag-item-btn.include:hover {
        background: var(--success);
        color: white;
    }

    .tag-item-btn.exclude {
        background: rgba(239, 68, 68, 0.2);
        color: var(--danger);
    }

    .tag-item-btn.exclude:hover {
        background: var(--danger);
        color: white;
    }

    /* ========== CONTENT AREA ========== */
    #tag-content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* ========== TOOLBAR ========== */
    #tag-toolbar {
        display: flex;
        gap: 12px;
        padding: 16px 24px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border-color);
        flex-wrap: wrap;
        align-items: center;
    }

    #product-search-input {
        flex: 1;
        min-width: 250px;
        padding: 10px 16px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 13px;
    }

    #product-search-input:focus {
        outline: none;
        border-color: var(--primary);
    }

    .toolbar-select {
        padding: 10px 14px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
    }

    .toolbar-select:focus {
        outline: none;
        border-color: var(--primary);
    }

    .toggle-btn {
        padding: 10px 16px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-secondary);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .toggle-btn:hover {
        background: var(--bg-hover);
    }

    .toggle-btn.active {
        background: var(--success);
        border-color: var(--success);
        color: white;
    }

    .toolbar-btn {
        padding: 10px 18px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .toolbar-btn.primary {
        background: var(--primary);
        color: white;
          opacity: 0.3;
    }

    .toolbar-btn.primary:hover {
        background: var(--primary-hover);
          opacity: 0.6;
    }

    /* ========== STATS BAR ========== */
    #tag-stats-bar {
        display: flex;
        align-items: center;
        gap: 24px;
        padding: 12px 24px;
        background: var(--bg-dark);
        border-bottom: 1px solid var(--border-color);
        flex-wrap: wrap;
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--text-secondary);
    }

    .stat-item .value {
        color: var(--text-primary);
        font-weight: 600;
    }

    .active-query-display {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
        flex-shrink: 0;
    }

    .active-query-label {
        font-size: 12px;
        color: var(--text-muted);
    }

    .active-query-code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        background: var(--bg-input);
        padding: 6px 12px;
        border-radius: 8px;
        color: var(--primary-hover);
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ========== TABLE CONTAINER ========== */
    #tag-table-container {
        flex: 1;
        overflow: auto;
        position: relative;
    }

    #tag-loading {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.9);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    #tag-loading.show {
        display: flex;
    }

    .spinner-container {
        width: 60px;
        height: 60px;
        position: relative;
    }

    .spinner-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border: 3px solid transparent;
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .spinner-ring:nth-child(2) {
        width: 80%;
        height: 80%;
        top: 10%;
        left: 10%;
        border-top-color: var(--success);
        animation-duration: 0.8s;
        animation-direction: reverse;
    }

    .spinner-ring:nth-child(3) {
        width: 60%;
        height: 60%;
        top: 20%;
        left: 20%;
        border-top-color: var(--warning);
        animation-duration: 0.6s;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .loading-text {
        margin-top: 20px;
        font-size: 14px;
        color: var(--text-secondary);
    }

    /* ========== TABLE ========== */
    #tag-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    #tag-table thead {
        position: sticky;
        top: 0;
        z-index: 10;
    }

    #tag-table th {
        background: linear-gradient(180deg, #334155, #1e293b);
        color: var(--text-primary);
        font-weight: 600;
        text-align: left;
        padding: 14px 16px;
        border-bottom: 2px solid var(--primary);
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;
    }

    #tag-table th:hover {
        background: linear-gradient(180deg, #475569, #334155);
    }

    #tag-table th.sorted {
        background: linear-gradient(180deg, var(--primary), #4f46e5);
    }

    #tag-table th .sort-icon {
        margin-left: 6px;
        opacity: 0.5;
        font-size: 11px;
    }

    #tag-table th.sorted .sort-icon {
        opacity: 1;
    }

    #tag-table tbody tr {
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s;
    }

    #tag-table tbody tr:hover {
        background: rgba(99, 102, 241, 0.1);
    }

    #tag-table td {
        padding: 12px 16px;
        color: var(--text-primary);
        vertical-align: middle;
    }

    .product-img {
        width: 50px;
        height: 50px;
        object-fit: cover;
        border-radius: 8px;
        background: var(--bg-input);
    }

    .product-img-placeholder {
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-input);
        border-radius: 8px;
        font-size: 20px;
        color: var(--text-muted);
    }

    .product-number {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: var(--text-secondary);
        background: var(--bg-input);
        padding: 4px 8px;
        border-radius: 6px;
    }

    .product-name {
        font-weight: 500;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: block;
    }

    .stock-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
    }

    .stock-badge.in-stock {
        background: rgba(16, 185, 129, 0.2);
        color: var(--success);
    }

    .stock-badge.low-stock {
        background: rgba(245, 158, 11, 0.2);
        color: var(--warning);
    }

    .stock-badge.out-of-stock {
        background: rgba(239, 68, 68, 0.2);
        color: var(--danger);
    }

    .price-display {
        font-weight: 600;
        color: var(--success);
    }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }

    .status-dot.active {
        background: var(--success);
        box-shadow: 0 0 8px var(--success);
    }

    .status-dot.inactive {
        background: var(--text-muted);
    }

    .tags-cell {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-width: 200px;
    }

    .tag-badge {
        background: var(--bg-input);
        color: var(--text-secondary);
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
    }

    .tag-badge.more {
        background: var(--primary);
        color: white;
        cursor: help;
    }

    .actions-cell {
        display: flex;
        gap: 6px;
    }

    .action-btn {
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .action-btn.edit {
        background: rgba(99, 102, 241, 0.2);
        color: var(--primary);
    }

    .action-btn.edit:hover {
        background: var(--primary);
        color: white;
    }

    .action-btn.frontend {
        background: rgba(16, 185, 129, 0.2);
        color: var(--success);
    }

    .action-btn.frontend:hover {
        background: var(--success);
        color: white;
    }

    /* ========== EMPTY STATE ========== */
    .empty-state {
        text-align: center;
        padding: 60px 40px;
    }

    .empty-state .icon {
        font-size: 64px;
        margin-bottom: 20px;
    }

    .empty-state .title {
        font-size: 20px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 10px;
    }

    .empty-state .description {
        font-size: 14px;
        color: var(--text-muted);
    }

    /* ========== PAGINATION ========== */
    #tag-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        background: var(--bg-card);
        border-top: 1px solid var(--border-color);
        flex-wrap: wrap;
        gap: 12px;
    }

    .page-info {
        font-size: 13px;
        color: var(--text-secondary);
    }

    .page-info strong {
        color: var(--text-primary);
    }

    .export-actions {
        display: flex;
        gap: 8px;
    }

    .export-btn {
        padding: 8px 16px;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .export-btn:hover {
        background: var(--success);
        border-color: var(--success);
        color: white;
    }

    .page-buttons {
        display: flex;
        gap: 6px;
    }

    .page-btn {
        min-width: 36px;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--border-color);
        background: var(--bg-input);
        color: var(--text-secondary);
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .page-btn:hover:not(:disabled) {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
    }

    .page-btn.active {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
        font-weight: 600;
    }

    .page-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    /* ========== HELP MODAL ========== */
    .help-overlay-bg {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000001;
        display: none;
    }

    .help-overlay-bg.show {
        display: block;
    }

    #query-help-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: var(--bg-card);
        border-radius: 16px;
        padding: 28px;
        z-index: 1000002;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        display: none;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--border-color);
        opacity: 0;
        transition: all 0.3s ease;
    }

    #query-help-modal.show {
        display: block;
        background: black;
        overflow-y: hidden;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }

    #query-help-modal h3 {
        margin: 0 0 20px;
        font-size: 20px;
        color: var(--text-primary);
    }

    .help-close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 32px;
        height: 32px;
        border: none;
        background: var(--bg-input);
        color: var(--text-secondary);
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .help-close-btn:hover {
        background: var(--danger);
        color: white;
    }

    .help-section {
        margin-bottom: 24px;
    }

    .help-section h4 {
        font-size: 14px;
        color: var(--primary-hover);
        margin: 0 0 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color);
    }

    .help-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .help-table th,
    .help-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
    }

    .help-table th {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
    }

    .help-table td {
        color: var(--text-primary);
    }

    .help-table code {
        background: var(--bg-input);
        padding: 3px 8px;
        border-radius: 5px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: var(--success);
    }

    .help-example {
        background: var(--bg-dark);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
    }

    .help-example code {
        display: block;
        background: var(--bg-input);
        padding: 10px 14px;
        border-radius: 8px;
        margin-bottom: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: var(--primary-hover);
    }

    .help-example span {
        font-size: 12px;
        color: var(--text-muted);
    }

    .kbd {
        display: inline-block;
        background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: 5px;
        padding: 3px 8px;
        font-size: 11px;
        font-family: 'JetBrains Mono', monospace;
        color: var(--text-primary);
        box-shadow: 0 2px 0 var(--bg-dark);
    }

    /* ========== SCROLLBAR ========== */
    #tag-modal ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    #tag-modal ::-webkit-scrollbar-track {
        background: var(--bg-dark);
        border-radius: 5px;
    }

    #tag-modal ::-webkit-scrollbar-thumb {
        background: var(--bg-hover);
        border-radius: 5px;
    }

    #tag-modal ::-webkit-scrollbar-thumb:hover {
        background: var(--text-muted);
    }

    /* ========== SAVE FILTER MODAL ========== */
    #save-filter-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: var(--bg-card);
        border-radius: 16px;
        padding: 24px;
        z-index: 1000003;
        width: 400px;
        display: none;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--border-color);
        opacity: 0;
        transition: all 0.3s ease;
    }

    #save-filter-modal.show {
        display: block;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }

    #save-filter-modal h3 {
        margin: 0 0 16px;
        font-size: 18px;
        color: var(--text-primary);
    }

    #save-filter-modal input {
        width: 100%;
        padding: 12px 16px;
        background: var(--bg-input);
        border: 2px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 14px;
        margin-bottom: 16px;
    }

    #save-filter-modal input:focus {
        outline: none;
        border-color: var(--primary);
    }

    .save-filter-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    /* Export Modal Styles */
    .export-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: linear-gradient(145deg, #1e293b, #0f172a);
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 0;
        z-index: 100002;
        min-width: 600px;
        max-width: 800px;
        max-height: 85vh;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
    }

    .export-modal.show {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -50%) scale(1);
    }

    .export-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid #334155;
        background: rgba(30, 41, 59, 0.5);
        border-radius: 16px 16px 0 0;
    }

    .export-modal-header h3 {
        margin: 0;
        font-size: 18px;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .export-modal-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 24px;
        cursor: pointer;
        padding: 5px;
        line-height: 1;
        transition: color 0.2s;
    }

    .export-modal-close:hover {
        color: #f1f5f9;
    }

    .export-modal-body {
        padding: 24px;
        overflow-y: auto;
        max-height: 60vh;
    }

    .export-section {
        margin-bottom: 24px;
    }

    .export-section:last-child {
        margin-bottom: 0;
    }

    .export-section-title {
        font-size: 14px;
        font-weight: 600;
        color: #e2e8f0;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .export-scope-options {
        display: flex;
        gap: 16px;
    }

    .export-scope-option {
        flex: 1;
        padding: 16px;
        background: #1e293b;
        border: 2px solid #334155;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .export-scope-option:hover {
        border-color: #4f46e5;
        background: #252f3f;
    }

    .export-scope-option.selected {
        border-color: #6366f1;
        background: rgba(99, 102, 241, 0.1);
    }

    .export-scope-option input[type="radio"] {
        display: none;
    }

    .export-scope-option .option-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }

    .export-scope-option .option-icon {
        font-size: 24px;
    }

    .export-scope-option .option-title {
        font-weight: 600;
        color: #f1f5f9;
        font-size: 15px;
    }

    .export-scope-option .option-desc {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.4;
    }

    .export-scope-option .option-count {
        font-size: 11px;
        color: #6366f1;
        margin-top: 8px;
        font-weight: 500;
    }

    .export-fields-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .export-fields-actions {
        display: flex;
        gap: 8px;
    }

    .export-fields-actions button {
        padding: 6px 12px;
        font-size: 11px;
        background: #334155;
        border: none;
        border-radius: 6px;
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.2s;
    }

    .export-fields-actions button:hover {
        background: #475569;
        color: #f1f5f9;
    }

    .export-fields-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }

    .export-field-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .export-field-item:hover {
        background: #252f3f;
        border-color: #475569;
    }

    .export-field-item.selected {
        background: rgba(99, 102, 241, 0.15);
        border-color: #6366f1;
    }

    .export-field-item input[type="checkbox"] {
        display: none;
    }

    .export-field-checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid #475569;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: transparent;
        transition: all 0.2s;
        flex-shrink: 0;
    }

    .export-field-item.selected .export-field-checkbox {
        background: #6366f1;
        border-color: #6366f1;
        color: white;
    }

    .export-field-label {
        font-size: 13px;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .export-modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #334155;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(15, 23, 42, 0.5);
        border-radius: 0 0 16px 16px;
    }

    .export-summary {
        font-size: 13px;
        color: #94a3b8;
    }

    .export-summary strong {
        color: #6366f1;
    }

    .export-modal-actions {
        display: flex;
        gap: 12px;
    }

    .export-btn-cancel {
        padding: 10px 20px;
        background: #334155;
        border: none;
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .export-btn-cancel:hover {
        background: #475569;
    }

    .export-btn-confirm {
        padding: 10px 24px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
    }

    .export-btn-confirm:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }

    .export-btn-confirm:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    /* Extended Table Styles */
    #tag-table th, #tag-table td {
        font-size: 12px;
        padding: 8px 10px;
    }

    .cell-ean {
        font-family: 'Monaco', 'Consolas', monospace;
        font-size: 11px;
        color: #94a3b8;
    }

    .cell-date {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
    }

    .cell-categories {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
    }

    .category-badge {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        border-radius: 4px;
        font-size: 10px;
        white-space: nowrap;
    }

    .category-badge.more {
        background: rgba(99, 102, 241, 0.2);
        color: #818cf8;
        cursor: help;
    }

    .cell-description {
        font-size: 11px;
        color: #94a3b8;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .cell-sales-channel {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
    }

    .sales-channel-badge {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
        border-radius: 4px;
        font-size: 10px;
        white-space: nowrap;
    }

    .sales-channel-badge.more {
        background: rgba(99, 102, 241, 0.2);
        color: #818cf8;
        cursor: help;
    }

    /* Quick View Button */
    .action-btn.quick-view {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
    }

    .action-btn.quick-view:hover {
        background: rgba(16, 185, 129, 0.4);
    }

    /* Quick View Modal */
    .quick-view-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: linear-gradient(145deg, #1e293b, #0f172a);
        border: 1px solid #334155;
        border-radius: 16px;
        z-index: 100003;
        width: 900px;
        max-width: 95vw;
        max-height: 90vh;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
        overflow: hidden;
    }

    .quick-view-modal.show {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -50%) scale(1);
    }

    .quick-view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid #334155;
        background: rgba(30, 41, 59, 0.5);
    }

    .quick-view-header h3 {
        margin: 0;
        font-size: 16px;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .quick-view-header .product-number-badge {
        background: #334155;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-family: monospace;
    }

    .quick-view-body {
        padding: 24px;
        overflow-y: auto;
        max-height: calc(90vh - 140px);
    }

    .quick-view-grid {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: 24px;
    }

    .quick-view-image {
        width: 200px;
        height: 200px;
        background: #0f172a;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #334155;
    }

    .quick-view-image img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }

    .quick-view-image .no-image {
        font-size: 48px;
        opacity: 0.3;
    }

    .quick-view-details {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
    }

    .detail-group {
        background: #1e293b;
        border-radius: 8px;
        padding: 12px 16px;
        border: 1px solid #334155;
    }

    .detail-group.full-width {
        grid-column: 1 / -1;
    }

    .detail-label {
        font-size: 11px;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 4px;
        letter-spacing: 0.5px;
    }

    .detail-value {
        font-size: 14px;
        color: #f1f5f9;
        word-break: break-word;
    }

    .detail-value.mono {
        font-family: 'Monaco', 'Consolas', monospace;
    }

    .quick-view-footer {
        padding: 16px 24px;
        border-top: 1px solid #334155;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        background: rgba(15, 23, 42, 0.5);
    }
    `);

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        languageId: '2fbb5fe2e29a4d70aa5854ce7ce3e20b',
        apiBaseUrl: 'https://www.flamme.de/api',
        itemsPerPage: 25,
        maxTagsDisplay: 1000,
        storageKey: 'sw6_tag_filter_saved_queries',
        debounceDelay: 300,
        cacheExpiry: 5 * 60 * 1000
    };

    // ============================================
    // EXPORT FIELDS CONFIGURATION
    // ============================================
    const EXPORT_FIELDS = [
        { id: 'productNumber', label: 'Product Number', default: true },
        { id: 'name', label: 'Name', default: true },
        { id: 'ean', label: 'EAN', default: true },
        { id: 'manufacturer', label: 'Manufacturer', default: true },
        { id: 'stock', label: 'Stock', default: true },
        { id: 'availableStock', label: 'Available Stock', default: false },
        { id: 'price', label: 'Price (Gross)', default: true },
        { id: 'priceNet', label: 'Price (Net)', default: false },
        { id: 'active', label: 'Active Status', default: true },
        { id: 'tags', label: 'Tags', default: true },
        { id: 'categories', label: 'Categories', default: false },
        { id: 'salesChannels', label: 'Sales Channels', default: false },
        { id: 'description', label: 'Description', default: false },
        { id: 'metaTitle', label: 'Meta Title', default: false },
        { id: 'metaDescription', label: 'Meta Description', default: false },
        { id: 'keywords', label: 'Keywords', default: false },
        { id: 'weight', label: 'Weight', default: false },
        { id: 'width', label: 'Width', default: false },
        { id: 'height', label: 'Height', default: false },
        { id: 'length', label: 'Length', default: false },
        { id: 'createdAt', label: 'Created At', default: false },
        { id: 'updatedAt', label: 'Updated At', default: false },
        { id: 'releaseDate', label: 'Release Date', default: false },
        { id: 'purchaseUnit', label: 'Purchase Unit', default: false },
        { id: 'referenceUnit', label: 'Reference Unit', default: false },
        { id: 'minPurchase', label: 'Min Purchase', default: false },
        { id: 'maxPurchase', label: 'Max Purchase', default: false },
        { id: 'deliveryTime', label: 'Delivery Time', default: false },
        { id: 'restockTime', label: 'Restock Time', default: false },
        { id: 'shippingFree', label: 'Shipping Free', default: false },
        { id: 'markAsTopseller', label: 'Topseller', default: false },
        { id: 'productId', label: 'Product ID', default: false }
    ];

    // ============================================
    // CACHE SYSTEM
    // ============================================
    const CACHE = {
        data: {},
        timestamps: {},

        set(key, value) {
            this.data[key] = value;
            this.timestamps[key] = Date.now();
            console.log(`📦 Cache SET: ${key}`);
        },

        get(key) {
            const timestamp = this.timestamps[key];
            if (!timestamp) return null;

            if (Date.now() - timestamp > CONFIG.cacheExpiry) {
                console.log(`📦 Cache EXPIRED: ${key}`);
                delete this.data[key];
                delete this.timestamps[key];
                return null;
            }

            console.log(`📦 Cache HIT: ${key}`);
            return this.data[key];
        },

        clear() {
            this.data = {};
            this.timestamps = {};
            console.log('📦 Cache CLEARED');
        }
    };

    // ============================================
    // DEBOUNCE UTILITY
    // ============================================
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    const STATE = {
        currentPage: 1,
        totalProducts: 0,
        isLoading: false,
        allTags: [],
        tagMap: {},
        tagNameMap: {},
        queryString: '',
        parsedQuery: null,
        searchTerm: '',
        sortField: 'productNumber',
        sortOrder: 'DESC',
        lastQueryError: null,
        savedFilters: [],
        initialLoadDone: false,
        currentProducts: [], // Store current products for export

        filters: {
            active: null,
            stockFrom: null,
            stockTo: null,
            hasImage: null,
            manufacturerId: null,
            salesChannelId: null,
            categoryId: null,
            priceFrom: null,
            priceTo: null,
            releaseDateFrom: null,
            releaseDateTo: null
        },

        manufacturers: [],
        salesChannels: [],
        categories: [],

        // Export settings
        exportScope: 'filtered', // 'filtered' or 'all'
        exportFields: EXPORT_FIELDS.filter(f => f.default).map(f => f.id)
    };

    // ============================================
    // SAVED FILTERS STORAGE
    // ============================================
    function loadSavedFilters() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKey);
            if (saved) {
                STATE.savedFilters = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading saved filters:', e);
            STATE.savedFilters = [];
        }
    }

    function saveSavedFilters() {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(STATE.savedFilters));
        } catch (e) {
            console.error('Error saving filters:', e);
        }
    }

    function addSavedFilter(name, query) {
        STATE.savedFilters = STATE.savedFilters.filter(f => f.name !== name);
        STATE.savedFilters.unshift({ name, query, createdAt: Date.now() });
        STATE.savedFilters = STATE.savedFilters.slice(0, 20);
        saveSavedFilters();
        renderSavedFilters();
    }

    function deleteSavedFilter(name) {
        STATE.savedFilters = STATE.savedFilters.filter(f => f.name !== name);
        saveSavedFilters();
        renderSavedFilters();
    }

    // ============================================
    // QUERY PARSER
    // ============================================
    class QueryParser {
        constructor(tagMap) {
            this.tagMap = tagMap;
        }

        parse(query) {
            if (!query || !query.trim()) {
                return { valid: true, filters: [], isEmpty: true };
            }

            try {
                const tokens = this.tokenize(query);
                if (tokens.length === 0) {
                    return { valid: true, filters: [], isEmpty: true };
                }

                const ast = this.buildAST(tokens);
                const filters = this.astToFilters(ast);

                return {
                    valid: true,
                    filters: filters,
                    ast: ast,
                    isEmpty: false,
                    preview: this.astToString(ast)
                };
            } catch (error) {
                return {
                    valid: false,
                    error: error.message,
                    isEmpty: false
                };
            }
        }

        tokenize(query) {
            const tokens = [];
            let i = 0;
            const len = query.length;

            while (i < len) {
                if (/\s/.test(query[i])) {
                    i++;
                    continue;
                }

                if (query.substr(i, 2) === '||') {
                    tokens.push({ type: 'OR' });
                    i += 2;
                    continue;
                }

                if (query.substr(i, 2) === '&&') {
                    tokens.push({ type: 'AND' });
                    i += 2;
                    continue;
                }

                if (query[i] === '!') {
                    tokens.push({ type: 'NOT' });
                    i++;
                    continue;
                }

                if (query[i] === '(') {
                    tokens.push({ type: 'LPAREN' });
                    i++;
                    continue;
                }

                if (query[i] === ')') {
                    tokens.push({ type: 'RPAREN' });
                    i++;
                    continue;
                }

                if (query[i] === '"' || query[i] === "'") {
                    const quote = query[i];
                    i++;
                    let tagName = '';
                    while (i < len && query[i] !== quote) {
                        tagName += query[i];
                        i++;
                    }
                    if (i < len) i++;
                    if (tagName.trim()) {
                        tokens.push({ type: 'TAG', value: tagName.trim() });
                    }
                    continue;
                }

                let tagName = '';
                while (i < len && !/[\s()!]/.test(query[i]) &&
                       query.substr(i, 2) !== '||' &&
                       query.substr(i, 2) !== '&&') {
                    tagName += query[i];
                    i++;
                }

                if (tagName.trim()) {
                    tokens.push({ type: 'TAG', value: tagName.trim() });
                }
            }

            return tokens;
        }

        buildAST(tokens) {
            let pos = 0;

            const parseExpression = () => {
                let left = parseTerm();

                while (pos < tokens.length) {
                    if (tokens[pos].type === 'OR') {
                        pos++;
                        const right = parseTerm();
                        left = { type: 'OR', left, right };
                    } else if (tokens[pos].type === 'AND') {
                        pos++;
                        const right = parseTerm();
                        left = { type: 'AND', left, right };
                    } else {
                        break;
                    }
                }

                return left;
            };

            const parseTerm = () => {
                if (pos >= tokens.length) {
                    throw new Error('Unexpected end of expression');
                }

                if (tokens[pos].type === 'NOT') {
                    pos++;
                    const operand = parseTerm();
                    return { type: 'NOT', operand };
                }

                if (tokens[pos].type === 'LPAREN') {
                    pos++;
                    const expr = parseExpression();
                    if (pos >= tokens.length || tokens[pos].type !== 'RPAREN') {
                        throw new Error('Missing closing parenthesis');
                    }
                    pos++;
                    return expr;
                }

                if (tokens[pos].type === 'TAG') {
                    const tagName = tokens[pos].value;
                    pos++;

                    const tagInfo = this.findTagInfo(tagName);
                    if (!tagInfo) {
                        throw new Error(`Unknown tag: "${tagName}"`);
                    }

                    return { type: 'TAG', name: tagInfo.originalName, id: tagInfo.id };
                }

                throw new Error(`Unexpected token: ${tokens[pos].type}`);
            };

            const ast = parseExpression();

            if (pos < tokens.length && tokens[pos].type !== 'RPAREN') {
                throw new Error(`Unexpected token at end: ${tokens[pos].type}`);
            }

            return ast;
        }

        findTagInfo(name) {
            const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');

            if (this.tagMap[normalized]) {
                return this.tagMap[normalized];
            }

            for (const [key, value] of Object.entries(this.tagMap)) {
                if (key.includes(normalized) || normalized.includes(key)) {
                    return value;
                }
            }

            return null;
        }

        astToFilters(ast) {
            if (!ast) return [];

            const processNode = (node) => {
                if (node.type === 'TAG') {
                    return {
                        type: 'equals',
                        field: 'tags.id',
                        value: node.id
                    };
                }

                if (node.type === 'NOT') {
                    const inner = processNode(node.operand);
                    return {
                        type: 'not',
                        queries: [inner]
                    };
                }

                if (node.type === 'AND') {
                    return {
                        type: 'multi',
                        operator: 'and',
                        queries: [processNode(node.left), processNode(node.right)]
                    };
                }

                if (node.type === 'OR') {
                    return {
                        type: 'multi',
                        operator: 'or',
                        queries: [processNode(node.left), processNode(node.right)]
                    };
                }

                return null;
            };

            const filter = processNode(ast);
            return filter ? [filter] : [];
        }

        astToString(ast) {
            if (!ast) return '';

            const processNode = (node) => {
                if (node.type === 'TAG') return `[${node.name}]`;
                if (node.type === 'NOT') return `NOT(${processNode(node.operand)})`;
                if (node.type === 'AND') return `(${processNode(node.left)} AND ${processNode(node.right)})`;
                if (node.type === 'OR') return `(${processNode(node.left)} OR ${processNode(node.right)})`;
                return '';
            };

            return processNode(ast);
        }
    }

    // ============================================
    // AUTH TOKEN
    // ============================================
    function getAuthToken() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith('bearerAuth=')) {
                try {
                    const decoded = decodeURIComponent(cookie.substring('bearerAuth='.length));
                    const authData = JSON.parse(decoded);
                    if (authData.access) return authData.access;
                } catch (e) {
                    console.error('Cookie Parse Error:', e);
                }
            }
        }
        return null;
    }

    // ============================================
    // API FUNCTIONS
    // ============================================
    async function fetchAllTags() {
        const cacheKey = 'tags';
        const cached = CACHE.get(cacheKey);
        if (cached) return cached;

        const token = getAuthToken();
        if (!token) return [];

        try {
            let allTags = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(`${CONFIG.apiBaseUrl}/search/tag`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'sw-language-id': CONFIG.languageId
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        limit: 500,
                        page: page,
                        sort: [{ field: 'name', order: 'ASC' }],
                        "total-count-mode": 1
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                const tags = data.data || [];
                allTags = allTags.concat(tags);

                const total = data.total || 0;
                hasMore = allTags.length < total;
                page++;

                if (page > 50) break;
            }

            console.log(`📥 Loaded ${allTags.length} tags`);
            CACHE.set(cacheKey, allTags);
            return allTags;
        } catch (error) {
            console.error('Error fetching tags:', error);
            return [];
        }
    }

    async function fetchManufacturers() {
        const cacheKey = 'manufacturers';
        const cached = CACHE.get(cacheKey);
        if (cached) return cached;

        const token = getAuthToken();
        if (!token) return [];

        try {
            let allItems = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(`${CONFIG.apiBaseUrl}/search/product-manufacturer`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'sw-language-id': CONFIG.languageId
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        limit: 500,
                        page: page,
                        sort: [{ field: 'name', order: 'ASC' }],
                        "total-count-mode": 1
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                const items = data.data || [];
                allItems = allItems.concat(items);

                hasMore = allItems.length < (data.total || 0);
                page++;
                if (page > 20) break;
            }

            console.log(`📥 Loaded ${allItems.length} manufacturers`);
            CACHE.set(cacheKey, allItems);
            return allItems;
        } catch (error) {
            console.error('Error fetching manufacturers:', error);
            return [];
        }
    }

    async function fetchSalesChannels() {
        const cacheKey = 'salesChannels';
        const cached = CACHE.get(cacheKey);
        if (cached) return cached;

        const token = getAuthToken();
        if (!token) return [];

        try {
            const response = await fetch(`${CONFIG.apiBaseUrl}/search/sales-channel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'sw-language-id': CONFIG.languageId
                },
                credentials: 'include',
                body: JSON.stringify({
                    limit: 100,
                    sort: [{ field: 'name', order: 'ASC' }],
                    "total-count-mode": 1
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            const items = data.data || [];
            console.log(`📥 Loaded ${items.length} sales channels`);
            CACHE.set(cacheKey, items);
            return items;
        } catch (error) {
            console.error('Error fetching sales channels:', error);
            return [];
        }
    }

    async function fetchCategories() {
        const cacheKey = 'categories';
        const cached = CACHE.get(cacheKey);
        if (cached) return cached;

        const token = getAuthToken();
        if (!token) return [];

        try {
            let allItems = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(`${CONFIG.apiBaseUrl}/search/category`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'sw-language-id': CONFIG.languageId
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        limit: 500,
                        page: page,
                        sort: [{ field: 'name', order: 'ASC' }],
                        "total-count-mode": 1
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                const items = data.data || [];
                allItems = allItems.concat(items);

                hasMore = allItems.length < (data.total || 0);
                page++;
                if (page > 30) break;
            }

            console.log(`📥 Loaded ${allItems.length} categories`);
            CACHE.set(cacheKey, allItems);
            return allItems;
        } catch (error) {
            console.error('Error fetching categories:', error);
            return [];
        }
    }

    async function fetchProducts() {
        const token = getAuthToken();
        if (!token) {
            alert('Session expired. Please log in again.');
            return null;
        }

        const filters = [];

        if (STATE.queryString.trim()) {
            const parser = new QueryParser(STATE.tagMap);
            const result = parser.parse(STATE.queryString);

            if (!result.valid) {
                STATE.lastQueryError = result.error;
                return null;
            }

            STATE.lastQueryError = null;
            STATE.parsedQuery = result;

            if (result.filters && result.filters.length > 0) {
                filters.push(...result.filters);
            }
        } else {
            STATE.lastQueryError = null;
            STATE.parsedQuery = null;
        }

        filters.push({
            type: 'equals',
            field: 'parentId',
            value: null
        });

        // Extended Filters
        if (STATE.filters.active === true) {
            filters.push({ type: 'equals', field: 'active', value: true });
        } else if (STATE.filters.active === false) {
            filters.push({ type: 'equals', field: 'active', value: false });
        }

        if (STATE.filters.stockFrom !== null || STATE.filters.stockTo !== null) {
            const params = {};
            if (STATE.filters.stockFrom !== null) params.gte = STATE.filters.stockFrom;
            if (STATE.filters.stockTo !== null) params.lte = STATE.filters.stockTo;
            filters.push({ type: 'range', field: 'stock', parameters: params });
        }

        if (STATE.filters.hasImage === true) {
            filters.push({ type: 'not', queries: [{ type: 'equals', field: 'coverId', value: null }] });
        } else if (STATE.filters.hasImage === false) {
            filters.push({ type: 'equals', field: 'coverId', value: null });
        }

        if (STATE.filters.manufacturerId) {
            filters.push({ type: 'equals', field: 'manufacturerId', value: STATE.filters.manufacturerId });
        }

        if (STATE.filters.salesChannelId) {
            filters.push({
                type: 'equals',
                field: 'visibilities.salesChannelId',
                value: STATE.filters.salesChannelId
            });
        }

        if (STATE.filters.categoryId) {
            filters.push({ type: 'equals', field: 'categories.id', value: STATE.filters.categoryId });
        }

        if (STATE.filters.priceFrom !== null || STATE.filters.priceTo !== null) {
            const params = {};
            if (STATE.filters.priceFrom !== null) params.gte = STATE.filters.priceFrom;
            if (STATE.filters.priceTo !== null) params.lte = STATE.filters.priceTo;
            filters.push({ type: 'range', field: 'price.gross', parameters: params });
        }

        if (STATE.filters.releaseDateFrom || STATE.filters.releaseDateTo) {
            const params = {};
            if (STATE.filters.releaseDateFrom) params.gte = STATE.filters.releaseDateFrom;
            if (STATE.filters.releaseDateTo) params.lte = STATE.filters.releaseDateTo;
            filters.push({ type: 'range', field: 'releaseDate', parameters: params });
        }

        if (STATE.searchTerm.trim()) {
            filters.push({
                type: 'multi',
                operator: 'or',
                queries: [
                    { type: 'contains', field: 'name', value: STATE.searchTerm },
                    { type: 'contains', field: 'productNumber', value: STATE.searchTerm },
                    { type: 'contains', field: 'ean', value: STATE.searchTerm }
                ]
            });
        }

        const requestBody = {
            page: STATE.currentPage,
            limit: CONFIG.itemsPerPage,
            filter: filters,
            sort: [{
                field: STATE.sortField,
                order: STATE.sortOrder,
                naturalSorting: STATE.sortField === 'productNumber'
            }],
            associations: {
                cover: { associations: { media: {} } },
                manufacturer: {},
                tags: {},
                categories: {},
                visibilities: { associations: { salesChannel: {} } },
                deliveryTime: {}
            },
            includes: {
                product: [
                    'id', 'productNumber', 'name', 'translated', 'active', 'stock', 'availableStock',
                    'price', 'cover', 'manufacturer', 'tags', 'ean', 'createdAt', 'updatedAt',
                    'releaseDate', 'categories', 'visibilities', 'coverId', 'description',
                    'metaTitle', 'metaDescription', 'keywords', 'weight', 'width', 'height', 'length',
                    'purchaseUnit', 'referenceUnit', 'minPurchase', 'maxPurchase', 'deliveryTime',
                    'restockTime', 'shippingFree', 'markAsTopseller'
                ],
                product_manufacturer: ['id', 'name', 'translated'],
                tag: ['id', 'name', 'translated'],
                product_media: ['id', 'media'],
                media: ['id', 'url', 'thumbnails'],
                category: ['id', 'name', 'translated'],
                product_visibility: ['id', 'salesChannelId', 'salesChannel'],
                sales_channel: ['id', 'name', 'translated'],
                delivery_time: ['id', 'name', 'translated']
            },
            "total-count-mode": 1
        };

        console.log('📤 API Request:', JSON.stringify(requestBody, null, 2));

        try {
            const response = await fetch(`${CONFIG.apiBaseUrl}/search/product`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'sw-language-id': CONFIG.languageId
                },
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });

            if (response.status === 401) {
                alert('Session expired. Please log in again.');
                return null;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('📥 Products API Response:', {
                total: data.total,
                currentPage: STATE.currentPage,
                itemsReturned: data.data?.length,
                meta: data.meta
            });

            return data;
        } catch (error) {
            console.error('Error fetching products:', error);
            return null;
        }
    }

    // ============================================
    // UI CREATION
    // ============================================
    function createUI() {
        // Floating Button
        const btn = document.createElement('button');
        btn.id = 'tag-filter-btn';
        btn.innerHTML = `
            <span class="icon">🏷️</span>
            <span>Tag Filter</span>
            <span class="count-badge" id="active-filter-count" data-count="0">0</span>
        `;
        document.body.appendChild(btn);

        // Help Overlay Background
        const helpBg = document.createElement('div');
        helpBg.className = 'help-overlay-bg';
        helpBg.id = 'help-overlay-bg';
        document.body.appendChild(helpBg);

        // Help Modal
        const helpModal = document.createElement('div');
        helpModal.id = 'query-help-modal';
        helpModal.innerHTML = `
            <button class="help-close-btn" id="help-close-btn">✕</button>
            <h3>📖 Query Syntax Guide</h3>
            <div class="help-section">
                <h4>Operators</h4>
                <table class="help-table">
                    <thead><tr><th>Operator</th><th>Meaning</th><th>Example</th></tr></thead>
                    <tbody>
                        <tr><td><code>||</code></td><td>OR - Match any tag</td><td><code>sale || new</code></td></tr>
                        <tr><td><code>&&</code></td><td>AND - Match all tags</td><td><code>sale && featured</code></td></tr>
                        <tr><td><code>!</code></td><td>NOT - Exclude tag</td><td><code>!archived</code></td></tr>
                        <tr><td><code>( )</code></td><td>Grouping</td><td><code>(sale || new) && !archived</code></td></tr>
                    </tbody>
                </table>
            </div>
            <div class="help-section">
                <h4>Tag Names</h4>
                <p style="color: #94a3b8; font-size: 13px; margin-bottom: 10px;">
                    Tag names are case-insensitive. Use quotes for names with spaces.
                </p>
                <div class="help-example">
                    <code>"my tag name" && simple-tag</code>
                </div>
            </div>
        `;
        document.body.appendChild(helpModal);

        // Save Filter Modal
        const saveModal = document.createElement('div');
        saveModal.id = 'save-filter-modal';
        saveModal.innerHTML = `
            <h3>💾 Save Filter</h3>
            <input type="text" id="save-filter-name" placeholder="Enter filter name...">
            <div class="save-filter-actions">
                <button class="query-action-btn secondary" id="save-filter-cancel">Cancel</button>
                <button class="query-action-btn primary" id="save-filter-confirm">Save</button>
            </div>
        `;
        document.body.appendChild(saveModal);

        // Export Modal
        const exportModal = document.createElement('div');
        exportModal.className = 'export-modal';
        exportModal.id = 'export-modal';
        exportModal.innerHTML = `
            <div class="export-modal-header">
                <h3>📥 Export to CSV</h3>
                <button class="export-modal-close" id="export-modal-close">✕</button>
            </div>
            <div class="export-modal-body">
                <div class="export-section">
                    <div class="export-section-title">📊 Export Scope</div>
                    <div class="export-scope-options">
                        <label class="export-scope-option selected" id="scope-filtered">
                            <input type="radio" name="export-scope" value="filtered" checked>
                            <div class="option-header">
                                <span class="option-icon">🔍</span>
                                <span class="option-title">Filtered Results</span>
                            </div>
                            <div class="option-desc">Export only products matching your current filters and query</div>
                            <div class="option-count" id="filtered-count-display">0 products</div>
                        </label>
                        <label class="export-scope-option" id="scope-all">
                            <input type="radio" name="export-scope" value="all">
                            <div class="option-header">
                                <span class="option-icon">📦</span>
                                <span class="option-title">All Products</span>
                            </div>
                            <div class="option-desc">Export all parent products in the system (ignoring filters)</div>
                            <div class="option-count">All available products</div>
                        </label>
                    </div>
                </div>

                <div class="export-section">
                    <div class="export-fields-header">
                        <div class="export-section-title">📋 Fields to Export</div>
                        <div class="export-fields-actions">
                            <button id="export-select-all">Select All</button>
                            <button id="export-deselect-all">Deselect All</button>
                            <button id="export-reset-default">Reset to Default</button>
                        </div>
                    </div>
                    <div class="export-fields-grid" id="export-fields-grid">
                        ${EXPORT_FIELDS.map(field => `
                            <label class="export-field-item ${field.default ? 'selected' : ''}" data-field="${field.id}">
                                <input type="checkbox" name="export-field" value="${field.id}" ${field.default ? 'checked' : ''}>
                                <span class="export-field-checkbox">✓</span>
                                <span class="export-field-label">${field.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="export-modal-footer">
                <div class="export-summary">
                    <span id="export-fields-count">0</span> fields selected
                </div>
                <div class="export-modal-actions">
                    <button class="export-btn-cancel" id="export-cancel">Cancel</button>
                    <button class="export-btn-confirm" id="export-confirm">
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(exportModal);

        // Quick View Modal
        const quickViewModal = document.createElement('div');
        quickViewModal.className = 'quick-view-modal';
        quickViewModal.id = 'quick-view-modal';
        quickViewModal.innerHTML = `
            <div class="quick-view-header">
                <h3>
                    <span>👁️ Quick View</span>
                    <span class="product-number-badge" id="qv-product-number">-</span>
                </h3>
                <button class="export-modal-close" id="quick-view-close">✕</button>
            </div>
            <div class="quick-view-body" id="quick-view-body">
                <!-- Dynamic content -->
            </div>
            <div class="quick-view-footer">
                <button class="export-btn-cancel" onclick="document.getElementById('quick-view-modal').classList.remove('show'); document.getElementById('help-overlay-bg').classList.remove('show');">Close</button>
                <button class="export-btn-confirm" id="qv-edit-btn">
                    <span>✏️</span>
                    <span>Edit in Admin</span>
                </button>
            </div>
        `;
        document.body.appendChild(quickViewModal);

        // Main Modal
        const modal = document.createElement('div');
        modal.id = 'tag-modal-overlay';
        modal.innerHTML = `
            <div id="tag-modal">
                <div id="tag-modal-header">
                    <h2>
                        <span> Tag Filter</span>
                        <span class="title-badge">Query Syntax</span>
                    </h2>
                    <button id="tag-close-btn">✕</button>
                </div>

                <!-- QUERY BAR -->
                <div id="query-bar">
                    <div class="query-bar-title">
                        <h3><span>🔍</span><span>Tag Query</span></h3>
                        <button class="query-help-btn" id="query-help-btn">📖 Syntax Help</button>
                    </div>

                    <div id="query-input-container">
                        <input type="text" id="query-input"
                               placeholder='Enter query: (tag1 || tag2) && !excluded_tag'
                               autocomplete="off" spellcheck="false">
                        <div class="query-input-actions">
                            <button class="query-action-btn save" id="query-save-btn" title="Save this filter">💾 Save</button>
                            <button class="query-action-btn secondary" id="query-clear-btn">Clear</button>
                            <button class="query-action-btn primary" id="query-execute-btn">▶ Execute</button>
                        </div>
                        <div id="autocomplete-dropdown"></div>
                    </div>

                    <div id="query-feedback">
                        <span class="query-status empty" id="query-status">
                            <span>ℹ️</span><span>Enter a query to filter products</span>
                        </span>
                        <span class="query-parsed-preview" id="query-preview"></span>
                    </div>

                    <button class="filters-toggle-btn" id="filters-toggle-btn">
                        🎛️ Extended Filters <span id="active-filters-indicator"></span>
                    </button>

                    <div class="filters-panel" id="filters-panel">
                        <div class="filter-section">
                            <div class="filter-section-title">📦 Product Status</div>
                            <div class="filter-row">
                                <div class="filter-group">
                                    <label>Status</label>
                                    <select class="filter-select" id="filter-active">
                                        <option value="">All</option>
                                        <option value="true">Active Only</option>
                                        <option value="false">Inactive Only</option>
                                    </select>
                                </div>
                                <div class="filter-group">
                                    <label>Has Image</label>
                                    <select class="filter-select" id="filter-has-image">
                                        <option value="">All</option>
                                        <option value="true">With Image</option>
                                        <option value="false">Without Image</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">📊 Stock</div>
                            <div class="filter-row">
                                <div class="filter-group">
                                    <label>From</label>
                                    <input type="number" class="filter-input" id="filter-stock-from" placeholder="Min" min="0">
                                </div>
                                <div class="filter-group">
                                    <label>To</label>
                                    <input type="number" class="filter-input" id="filter-stock-to" placeholder="Max" min="0">
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">💰 Price (Gross)</div>
                            <div class="filter-row">
                                <div class="filter-group">
                                    <label>From €</label>
                                    <input type="number" class="filter-input" id="filter-price-from" placeholder="Min" min="0" step="0.01">
                                </div>
                                <div class="filter-group">
                                    <label>To €</label>
                                    <input type="number" class="filter-input" id="filter-price-to" placeholder="Max" min="0" step="0.01">
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">🏭 Manufacturer</div>
                            <div class="filter-row">
                                <div class="filter-group" style="flex: 1;">
                                    <select class="filter-select" id="filter-manufacturer" style="width: 100%;">
                                        <option value="">All Manufacturers</option>
                                    </select>
                                    <span class="cache-indicator" id="manufacturer-loading"></span>
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">🛒 Sales Channel</div>
                            <div class="filter-row">
                                <div class="filter-group" style="flex: 1;">
                                    <select class="filter-select" id="filter-sales-channel" style="width: 100%;">
                                        <option value="">All Sales Channels</option>
                                    </select>
                                    <span class="cache-indicator" id="sales-channel-loading"></span>
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">📁 Category</div>
                            <div class="filter-row">
                                <div class="filter-group" style="flex: 1;">
                                    <select class="filter-select" id="filter-category" style="width: 100%;">
                                        <option value="">All Categories</option>
                                    </select>
                                    <span class="cache-indicator" id="category-loading"></span>
                                </div>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-section-title">📅 Release Date</div>
                            <div class="filter-row">
                                <div class="filter-group">
                                    <label>From</label>
                                    <input type="date" class="filter-date" id="filter-release-from">
                                </div>
                                <div class="filter-group">
                                    <label>To</label>
                                    <input type="date" class="filter-date" id="filter-release-to">
                                </div>
                            </div>
                        </div>

                        <div class="filter-row" style="margin-top: 15px;">
                            <button class="query-action-btn secondary" id="filters-reset-btn">🔄 Reset All Filters</button>
                            <button class="query-action-btn primary" id="filters-apply-btn">✓ Apply Filters</button>
                        </div>
                    </div>

                    <div id="quick-tags"></div>

                    <div id="saved-filters-container">
                        <div class="saved-filters-header"><h4>💾 Saved Filters</h4></div>
                        <div class="saved-filters-list" id="saved-filters-list">
                            <span class="no-saved-filters">No saved filters yet</span>
                        </div>
                    </div>
                </div>

                <div id="tag-main-content">
                    <div id="tag-sidebar">
                        <div class="sidebar-header">
                            <h3>📂 All Tags</h3>
                            <span class="count" id="tags-total">0</span>
                        </div>
                        <div id="tag-search-sidebar">
                            <input type="text" id="sidebar-tag-search" placeholder="🔍 Search tags...">
                        </div>
                        <div id="tag-list-container">
                            <div class="loading-text">Loading tags...</div>
                        </div>
                    </div>

                    <div id="tag-content-area">
                        <div id="tag-toolbar">
                            <input type="text" id="product-search-input" placeholder="🔍 Search products (name, number, EAN)...">
                            <select class="toolbar-select" id="sort-select">
                                <option value="productNumber|DESC">Number ↓</option>
                                <option value="productNumber|ASC">Number ↑</option>
                                <option value="name|ASC">Name A-Z</option>
                                <option value="name|DESC">Name Z-A</option>
                                <option value="stock|DESC">Stock ↓</option>
                                <option value="stock|ASC">Stock ↑</option>
                                <option value="createdAt|DESC">Newest</option>
                                <option value="createdAt|ASC">Oldest</option>
                                <option value="releaseDate|DESC">Release ↓</option>
                                <option value="releaseDate|ASC">Release ↑</option>
                            </select>
                            <button class="toolbar-btn primary" id="refresh-btn">🔄 Refresh</button>
                        </div>

                        <div id="tag-stats-bar">
                            <div class="stat-item">
                                <span>📦</span><span>Products:</span>
                                <span class="value" id="total-products">-</span>
                            </div>
                            <div class="stat-item">
                                <span>📄</span><span>Page:</span>
                                <span class="value" id="current-page-info">-</span>
                            </div>
                            <div class="active-query-display" id="active-query-display">
                                <span class="active-query-label">Active Query:</span>
                                <span class="active-query-code" id="active-query-code">No filter applied</span>
                            </div>
                        </div>

                        <div id="tag-table-container">
                            <div id="tag-loading">
                                <div class="spinner-container">
                                    <div class="spinner-ring"></div>
                                    <div class="spinner-ring"></div>
                                    <div class="spinner-ring"></div>
                                </div>
                                <div class="loading-text">Loading products...</div>
                            </div>

                            <table id="tag-table">
                                <thead>
                                    <tr>
                                        <th style="width: 50px;">Image</th>
                                        <th data-field="productNumber" data-sortable="true" style="width: 120px;">Product # <span class="sort-icon">↕</span></th>
                                        <th data-field="name" data-sortable="true">Name <span class="sort-icon">↕</span></th>
                                        <th data-field="ean" data-sortable="true" style="width: 110px;">EAN <span class="sort-icon">↕</span></th>
                                        <th data-field="manufacturer.name" data-sortable="true" style="width: 120px;">Manufacturer <span class="sort-icon">↕</span></th>
                                        <th style="width: 140px;">Categories</th>
                                        <th data-field="stock" data-sortable="true" style="width: 70px;">Stock <span class="sort-icon">↕</span></th>
                                        <th data-field="price" data-sortable="true" style="width: 90px;">Price <span class="sort-icon">↕</span></th>
                                        <th data-field="active" data-sortable="true" style="width: 60px;">Status <span class="sort-icon">↕</span></th>
                                        <th data-field="createdAt" data-sortable="true" style="width: 90px;">Created <span class="sort-icon">↕</span></th>
                                        <th>Tags</th>
                                        <th style="width: 100px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="tag-table-body"></tbody>
                            </table>
                        </div>

                        <div id="tag-pagination">
                            <div class="page-info">
                                Showing <strong id="showing-range">0-0</strong> of <strong id="total-items">0</strong> products
                            </div>
                            <div class="export-actions">
                                <button class="export-btn" id="export-csv-btn">📥 Export CSV</button>
                            </div>
                            <div class="page-buttons" id="page-buttons"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        initEventListeners();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function initEventListeners() {
        const btn = document.getElementById('tag-filter-btn');
        const modal = document.getElementById('tag-modal-overlay');
        const closeBtn = document.getElementById('tag-close-btn');
        const queryInput = document.getElementById('query-input');
        const autocomplete = document.getElementById('autocomplete-dropdown');
        const exportModal = document.getElementById('export-modal');
        const quickViewModal = document.getElementById('quick-view-modal');

        let autocompleteIndex = -1;

        loadSavedFilters();

        const debouncedProductSearch = debounce((value) => {
            STATE.searchTerm = value;
            STATE.currentPage = 1;
            loadProducts();
        }, CONFIG.debounceDelay);

        // Open Modal
        btn.addEventListener('click', async () => {
            modal.classList.add('show');
            btn.classList.add('active');

            if (STATE.allTags.length === 0) {
                await loadTags();
            }

            loadFilterDropdowns();

            if (!STATE.initialLoadDone) {
                STATE.initialLoadDone = true;
                await loadProducts();
            }

            renderSavedFilters();
            queryInput.focus();
        });

        // Close Modal
        const closeModal = () => {
            modal.classList.remove('show');
            btn.classList.remove('active');
            hideAutocomplete();
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Help Modal
        const helpBtn = document.getElementById('query-help-btn');
        const helpModal = document.getElementById('query-help-modal');
        const helpBg = document.getElementById('help-overlay-bg');
        const helpCloseBtn = document.getElementById('help-close-btn');

        helpBtn.addEventListener('click', () => {
            helpModal.classList.add('show');
            helpBg.classList.add('show');
        });

        const closeHelp = () => {
            helpModal.classList.remove('show');
            helpBg.classList.remove('show');
        };

        helpCloseBtn.addEventListener('click', closeHelp);
        helpBg.addEventListener('click', closeHelp);

        // Save Filter Modal
        const saveFilterModal = document.getElementById('save-filter-modal');
        const saveFilterBtn = document.getElementById('query-save-btn');
        const saveFilterName = document.getElementById('save-filter-name');
        const saveFilterCancel = document.getElementById('save-filter-cancel');
        const saveFilterConfirm = document.getElementById('save-filter-confirm');

        saveFilterBtn.addEventListener('click', () => {
            if (!STATE.queryString.trim()) {
                alert('Please enter a query first');
                return;
            }
            saveFilterName.value = '';
            saveFilterModal.classList.add('show');
            helpBg.classList.add('show');
            saveFilterName.focus();
        });

        saveFilterCancel.addEventListener('click', () => {
            saveFilterModal.classList.remove('show');
            helpBg.classList.remove('show');
        });

        saveFilterConfirm.addEventListener('click', () => {
            const name = saveFilterName.value.trim();
            if (!name) {
                alert('Please enter a filter name');
                return;
            }
            addSavedFilter(name, STATE.queryString);
            saveFilterModal.classList.remove('show');
            helpBg.classList.remove('show');
        });

        // Export Modal
        document.getElementById('export-csv-btn').addEventListener('click', () => {
            document.getElementById('filtered-count-display').textContent = `${STATE.totalProducts} products`;
            updateExportFieldsCount();
            exportModal.classList.add('show');
            helpBg.classList.add('show');
        });

        document.getElementById('export-modal-close').addEventListener('click', () => {
            exportModal.classList.remove('show');
            helpBg.classList.remove('show');
        });

        document.getElementById('export-cancel').addEventListener('click', () => {
            exportModal.classList.remove('show');
            helpBg.classList.remove('show');
        });

        // Export scope selection
        document.querySelectorAll('.export-scope-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.export-scope-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input').checked = true;
                STATE.exportScope = option.querySelector('input').value;
            });
        });

        // Export field selection
        document.querySelectorAll('.export-field-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('selected');
                item.querySelector('input').checked = item.classList.contains('selected');
                updateExportFieldsCount();
            });
        });

        document.getElementById('export-select-all').addEventListener('click', () => {
            document.querySelectorAll('.export-field-item').forEach(item => {
                item.classList.add('selected');
                item.querySelector('input').checked = true;
            });
            updateExportFieldsCount();
        });

        document.getElementById('export-deselect-all').addEventListener('click', () => {
            document.querySelectorAll('.export-field-item').forEach(item => {
                item.classList.remove('selected');
                item.querySelector('input').checked = false;
            });
            updateExportFieldsCount();
        });

        document.getElementById('export-reset-default').addEventListener('click', () => {
            document.querySelectorAll('.export-field-item').forEach(item => {
                const fieldId = item.dataset.field;
                const fieldConfig = EXPORT_FIELDS.find(f => f.id === fieldId);
                if (fieldConfig?.default) {
                    item.classList.add('selected');
                    item.querySelector('input').checked = true;
                } else {
                    item.classList.remove('selected');
                    item.querySelector('input').checked = false;
                }
            });
            updateExportFieldsCount();
        });

        document.getElementById('export-confirm').addEventListener('click', () => {
            const selectedFields = Array.from(document.querySelectorAll('.export-field-item.selected'))
                .map(item => item.dataset.field);

            if (selectedFields.length === 0) {
                alert('Please select at least one field to export');
                return;
            }

            STATE.exportFields = selectedFields;
            exportModal.classList.remove('show');
            helpBg.classList.remove('show');

            exportToCSV();
        });

        // Quick View Modal Close
        document.getElementById('quick-view-close').addEventListener('click', () => {
            quickViewModal.classList.remove('show');
            helpBg.classList.remove('show');
        });

        // Extended Filters Toggle
        const filtersToggle = document.getElementById('filters-toggle-btn');
        const filtersPanel = document.getElementById('filters-panel');

        filtersToggle.addEventListener('click', () => {
            filtersPanel.classList.toggle('show');
        });

        document.getElementById('filters-apply-btn').addEventListener('click', () => {
            applyExtendedFilters();
        });

        document.getElementById('filters-reset-btn').addEventListener('click', () => {
            resetExtendedFilters();
        });

        // Query Input
        queryInput.addEventListener('input', (e) => {
            STATE.queryString = e.target.value;
            validateQuery();
            handleAutocomplete(e.target);
        });

        queryInput.addEventListener('keydown', (e) => {
            const items = autocomplete.querySelectorAll('.autocomplete-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
                updateAutocompleteSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
                updateAutocompleteSelection(items);
            } else if (e.key === 'Tab' || e.key === 'Enter') {
                if (autocomplete.classList.contains('show') && autocompleteIndex >= 0) {
                    e.preventDefault();
                    selectAutocompleteItem(items[autocompleteIndex]);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    executeQuery();
                }
            } else if (e.key === 'Escape') {
                hideAutocomplete();
            }
        });

        queryInput.addEventListener('blur', () => {
            setTimeout(hideAutocomplete, 200);
        });

        document.getElementById('query-execute-btn').addEventListener('click', executeQuery);

        document.getElementById('query-clear-btn').addEventListener('click', () => {
            queryInput.value = '';
            STATE.queryString = '';
            STATE.parsedQuery = null;
            STATE.currentPage = 1;
            validateQuery();
            document.getElementById('query-status').className = 'query-status empty';
            document.getElementById('query-status').innerHTML = '<span>ℹ️</span><span>Enter a query to filter products</span>';
            document.getElementById('query-preview').textContent = '';
            updateActiveQueryDisplay();
            updateFilterBadge();
            loadProducts();
        });

        document.getElementById('sidebar-tag-search').addEventListener('input', debounce((e) => {
            filterTagList(e.target.value);
        }, 200));

        document.getElementById('product-search-input').addEventListener('input', (e) => {
            debouncedProductSearch(e.target.value);
        });

        document.getElementById('sort-select').addEventListener('change', (e) => {
            const [field, order] = e.target.value.split('|');
            STATE.sortField = field;
            STATE.sortOrder = order;
            STATE.currentPage = 1;
            loadProducts();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            CACHE.clear();
            loadProducts();
        });

        document.querySelectorAll('#tag-table th[data-sortable="true"]').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                if (!field) return;

                if (STATE.sortField === field) {
                    STATE.sortOrder = STATE.sortOrder === 'ASC' ? 'DESC' : 'ASC';
                } else {
                    STATE.sortField = field;
                    STATE.sortOrder = 'DESC';
                }
                STATE.currentPage = 1;

                const selectValue = `${STATE.sortField}|${STATE.sortOrder}`;
                const sortSelect = document.getElementById('sort-select');
                if ([...sortSelect.options].some(o => o.value === selectValue)) {
                    sortSelect.value = selectValue;
                }

                loadProducts();
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (exportModal.classList.contains('show')) {
                    exportModal.classList.remove('show');
                    helpBg.classList.remove('show');
                } else if (quickViewModal.classList.contains('show')) {
                    quickViewModal.classList.remove('show');
                    helpBg.classList.remove('show');
                } else if (saveFilterModal.classList.contains('show')) {
                    saveFilterCancel.click();
                } else if (helpModal.classList.contains('show')) {
                    closeHelp();
                } else if (modal.classList.contains('show')) {
                    closeModal();
                }
            }
        });

        // Autocomplete helpers
        function handleAutocomplete(input) {
            const value = input.value;
            const cursorPos = input.selectionStart;

            let wordStart = cursorPos;
            while (wordStart > 0 && !/[\s()!&|"]/.test(value[wordStart - 1])) {
                wordStart--;
            }

            const currentWord = value.substring(wordStart, cursorPos).trim();

            if (currentWord.length >= 1) {
                showAutocomplete(currentWord, wordStart, cursorPos);
            } else {
                hideAutocomplete();
            }
        }

        function showAutocomplete(searchTerm, wordStart, cursorPos) {
            const searchLower = searchTerm.toLowerCase();
            const matches = STATE.allTags.filter(tag => {
                const name = (tag.attributes?.name || tag.name || '').toLowerCase();
                return name.includes(searchLower);
            }).slice(0, 10);

            if (matches.length === 0) {
                hideAutocomplete();
                return;
            }

            autocomplete.innerHTML = `
                <div class="autocomplete-section-header">Matching Tags</div>
                ${matches.map((tag) => {
                    const name = tag.attributes?.name || tag.name || 'Unknown';
                    const highlighted = name.replace(
                        new RegExp(`(${escapeRegex(searchTerm)})`, 'gi'),
                        '<mark>$1</mark>'
                    );
                    return `
                        <div class="autocomplete-item" data-name="${escapeHtml(name)}" data-start="${wordStart}" data-end="${cursorPos}">
                            <span class="autocomplete-tag-name">${highlighted}</span>
                        </div>
                    `;
                }).join('')}
            `;

            autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => selectAutocompleteItem(item));
            });

            autocomplete.classList.add('show');
            autocompleteIndex = -1;
        }

        function hideAutocomplete() {
            autocomplete.classList.remove('show');
            autocompleteIndex = -1;
        }

        function updateAutocompleteSelection(items) {
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === autocompleteIndex);
            });
            if (autocompleteIndex >= 0 && items[autocompleteIndex]) {
                items[autocompleteIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        function selectAutocompleteItem(item) {
            const tagName = item.dataset.name;
            const start = parseInt(item.dataset.start);
            const end = parseInt(item.dataset.end);
            const input = queryInput;
            const value = input.value;

            const needsQuotes = /[\s&|!()]/.test(tagName);
            const insertValue = needsQuotes ? `"${tagName}"` : tagName;

            const newValue = value.substring(0, start) + insertValue + value.substring(end);
            input.value = newValue;
            STATE.queryString = newValue;

            const newCursorPos = start + insertValue.length;
            input.setSelectionRange(newCursorPos, newCursorPos);

            hideAutocomplete();
            validateQuery();
            input.focus();
        }
    }

    function updateExportFieldsCount() {
        const count = document.querySelectorAll('.export-field-item.selected').length;
        document.getElementById('export-fields-count').textContent = count;
    }

    // ============================================
    // EXTENDED FILTERS FUNCTIONS
    // ============================================
    async function loadFilterDropdowns() {
        const mfgLoading = document.getElementById('manufacturer-loading');
        const mfgSelect = document.getElementById('filter-manufacturer');

        if (STATE.manufacturers.length === 0) {
            mfgLoading.innerHTML = '<span class="loading-spinner-small"></span>';
            STATE.manufacturers = await fetchManufacturers();
            mfgLoading.innerHTML = `(${STATE.manufacturers.length})`;

            mfgSelect.innerHTML = '<option value="">All Manufacturers</option>' +
                STATE.manufacturers.map(m => {
                    const name = m.attributes?.translated?.name || m.attributes?.name || m.name || 'Unknown';
                    return `<option value="${m.id}">${escapeHtml(name)}</option>`;
                }).join('');
        }

        const scLoading = document.getElementById('sales-channel-loading');
        const scSelect = document.getElementById('filter-sales-channel');

        if (STATE.salesChannels.length === 0) {
            scLoading.innerHTML = '<span class="loading-spinner-small"></span>';
            STATE.salesChannels = await fetchSalesChannels();
            scLoading.innerHTML = `(${STATE.salesChannels.length})`;

            scSelect.innerHTML = '<option value="">All Sales Channels</option>' +
                STATE.salesChannels.map(sc => {
                    const name = sc.attributes?.translated?.name || sc.attributes?.name || sc.name || 'Unknown';
                    return `<option value="${sc.id}">${escapeHtml(name)}</option>`;
                }).join('');
        }

        const catLoading = document.getElementById('category-loading');
        const catSelect = document.getElementById('filter-category');

        if (STATE.categories.length === 0) {
            catLoading.innerHTML = '<span class="loading-spinner-small"></span>';
            STATE.categories = await fetchCategories();
            catLoading.innerHTML = `(${STATE.categories.length})`;

            catSelect.innerHTML = '<option value="">All Categories</option>' +
                STATE.categories.map(c => {
                    const name = c.attributes?.translated?.name || c.attributes?.name || c.name || 'Unknown';
                    const level = c.attributes?.level || 1;
                    const indent = '—'.repeat(Math.max(0, level - 1));
                    return `<option value="${c.id}">${indent} ${escapeHtml(name)}</option>`;
                }).join('');
        }
    }

    function applyExtendedFilters() {
        const activeVal = document.getElementById('filter-active').value;
        STATE.filters.active = activeVal === '' ? null : activeVal === 'true';

        const hasImageVal = document.getElementById('filter-has-image').value;
        STATE.filters.hasImage = hasImageVal === '' ? null : hasImageVal === 'true';

        const stockFrom = document.getElementById('filter-stock-from').value;
        const stockTo = document.getElementById('filter-stock-to').value;
        STATE.filters.stockFrom = stockFrom !== '' ? parseInt(stockFrom) : null;
        STATE.filters.stockTo = stockTo !== '' ? parseInt(stockTo) : null;

        const priceFrom = document.getElementById('filter-price-from').value;
        const priceTo = document.getElementById('filter-price-to').value;
        STATE.filters.priceFrom = priceFrom !== '' ? parseFloat(priceFrom) : null;
        STATE.filters.priceTo = priceTo !== '' ? parseFloat(priceTo) : null;

        STATE.filters.manufacturerId = document.getElementById('filter-manufacturer').value || null;
        STATE.filters.salesChannelId = document.getElementById('filter-sales-channel').value || null;
        STATE.filters.categoryId = document.getElementById('filter-category').value || null;

        STATE.filters.releaseDateFrom = document.getElementById('filter-release-from').value || null;
        STATE.filters.releaseDateTo = document.getElementById('filter-release-to').value || null;

        STATE.currentPage = 1;
        updateFilterBadge();
        loadProducts();
    }

    function resetExtendedFilters() {
        STATE.filters = {
            active: null,
            stockFrom: null,
            stockTo: null,
            hasImage: null,
            manufacturerId: null,
            salesChannelId: null,
            categoryId: null,
            priceFrom: null,
            priceTo: null,
            releaseDateFrom: null,
            releaseDateTo: null
        };

        document.getElementById('filter-active').value = '';
        document.getElementById('filter-has-image').value = '';
        document.getElementById('filter-stock-from').value = '';
        document.getElementById('filter-stock-to').value = '';
        document.getElementById('filter-price-from').value = '';
        document.getElementById('filter-price-to').value = '';
        document.getElementById('filter-manufacturer').value = '';
        document.getElementById('filter-sales-channel').value = '';
        document.getElementById('filter-category').value = '';
        document.getElementById('filter-release-from').value = '';
        document.getElementById('filter-release-to').value = '';

        STATE.currentPage = 1;
        updateFilterBadge();
        loadProducts();
    }

    function validateQuery() {
        const queryInput = document.getElementById('query-input');
        const statusEl = document.getElementById('query-status');
        const previewEl = document.getElementById('query-preview');

        if (!STATE.queryString.trim()) {
            queryInput.classList.remove('error', 'valid');
            statusEl.className = 'query-status empty';
            statusEl.innerHTML = '<span>ℹ️</span><span>Enter a query to filter products</span>';
            previewEl.textContent = '';
            return;
        }

        const parser = new QueryParser(STATE.tagMap);
        const result = parser.parse(STATE.queryString);

        if (result.valid) {
            queryInput.classList.remove('error');
            queryInput.classList.add('valid');
            statusEl.className = 'query-status valid';
            statusEl.innerHTML = '<span>✅</span><span>Valid query</span>';
            previewEl.textContent = result.preview || '';
        } else {
            queryInput.classList.remove('valid');
            queryInput.classList.add('error');
            statusEl.className = 'query-status error';
            statusEl.innerHTML = `<span>❌</span><span>${escapeHtml(result.error)}</span>`;
            previewEl.textContent = '';
        }
    }

    function executeQuery() {
        const parser = new QueryParser(STATE.tagMap);
        const result = parser.parse(STATE.queryString);

        if (!result.valid && STATE.queryString.trim()) {
            alert(`Query Error: ${result.error}`);
            return;
        }

        STATE.currentPage = 1;
        updateActiveQueryDisplay();
        updateFilterBadge();
        loadProducts();
    }

    function updateActiveQueryDisplay() {
        const codeEl = document.getElementById('active-query-code');
        codeEl.textContent = STATE.queryString.trim() || 'No filter applied';
    }

    function updateFilterBadge() {
        const badge = document.getElementById('active-filter-count');

        let count = 0;
        if (STATE.queryString.trim()) count++;
        if (STATE.filters.active !== null) count++;
        if (STATE.filters.hasImage !== null) count++;
        if (STATE.filters.stockFrom !== null || STATE.filters.stockTo !== null) count++;
        if (STATE.filters.priceFrom !== null || STATE.filters.priceTo !== null) count++;
        if (STATE.filters.manufacturerId) count++;
        if (STATE.filters.salesChannelId) count++;
        if (STATE.filters.categoryId) count++;
        if (STATE.filters.releaseDateFrom || STATE.filters.releaseDateTo) count++;

        badge.textContent = count;
        badge.dataset.count = count;

        const indicator = document.getElementById('active-filters-indicator');
        indicator.textContent = count > 0 ? `(${count} active)` : '';
    }

    function renderSavedFilters() {
        const container = document.getElementById('saved-filters-list');

        if (STATE.savedFilters.length === 0) {
            container.innerHTML = '<span class="no-saved-filters">No saved filters yet</span>';
            return;
        }

        container.innerHTML = STATE.savedFilters.map(filter => `
            <div class="saved-filter-item" data-query="${escapeHtml(filter.query)}">
                <span class="saved-filter-name">${escapeHtml(filter.name)}</span>
                <button class="saved-filter-delete" data-name="${escapeHtml(filter.name)}" title="Delete filter">✕</button>
            </div>
        `).join('');

        container.querySelectorAll('.saved-filter-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('saved-filter-delete')) return;
                const query = item.dataset.query;
                document.getElementById('query-input').value = query;
                STATE.queryString = query;
                validateQuery();
                executeQuery();
            });
        });

        container.querySelectorAll('.saved-filter-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                if (confirm(`Delete filter "${name}"?`)) {
                    deleteSavedFilter(name);
                }
            });
        });
    }

    // ============================================
    // LOAD TAGS
    // ============================================
    async function loadTags() {
        const container = document.getElementById('tag-list-container');
        container.innerHTML = '<div class="loading-text">Loading tags...</div>';

        STATE.allTags = await fetchAllTags();

        STATE.tagMap = {};
        STATE.tagNameMap = {};

        STATE.allTags.forEach(tag => {
            const originalName = tag.attributes?.name || tag.name || '';
            const id = tag.id;
            const normalized = originalName.toLowerCase().trim().replace(/\s+/g, ' ');

            STATE.tagMap[normalized] = { id, originalName };
            STATE.tagNameMap[id] = originalName;
        });

        document.getElementById('tags-total').textContent = STATE.allTags.length;

        renderTagList(STATE.allTags);
        renderQuickTags();
    }

    function renderTagList(tags) {
        const container = document.getElementById('tag-list-container');

        if (tags.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <div class="icon" style="font-size: 48px;">🏷️</div>
                    <div class="title" style="font-size: 16px;">No tags found</div>
                </div>
            `;
            return;
        }

        container.innerHTML = tags.map(tag => {
            const tagId = tag.id;
            const tagName = tag.attributes?.name || tag.name || 'Unknown';

            return `
                <div class="tag-item" data-tag-id="${tagId}" data-tag-name="${escapeHtml(tagName)}">
                    <span class="tag-item-name">${escapeHtml(tagName)}</span>
                    <div class="tag-item-actions">
                        <button class="tag-item-btn include" title="Add (include)" data-action="include">+</button>
                        <button class="tag-item-btn exclude" title="Add (exclude)" data-action="exclude">−</button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.tag-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagItem = btn.closest('.tag-item');
                const tagName = tagItem.dataset.tagName;
                const action = btn.dataset.action;
                addTagToQuery(tagName, action === 'exclude');
            });
        });

        container.querySelectorAll('.tag-item').forEach(item => {
            item.addEventListener('click', () => {
                const tagName = item.dataset.tagName;
                addTagToQuery(tagName, false);
            });
        });
    }

    function addTagToQuery(tagName, exclude = false) {
        const queryInput = document.getElementById('query-input');
        const needsQuotes = /[\s&|!()]/.test(tagName);
        const tagStr = needsQuotes ? `"${tagName}"` : tagName;
        const insertStr = exclude ? `!${tagStr}` : tagStr;

        let currentQuery = queryInput.value.trim();

        if (currentQuery) {
            currentQuery += ` && ${insertStr}`;
        } else {
            currentQuery = insertStr;
        }

        queryInput.value = currentQuery;
        STATE.queryString = currentQuery;
        validateQuery();
        queryInput.focus();
    }

    function renderQuickTags() {
        const container = document.getElementById('quick-tags');
        const quickTags = STATE.allTags.slice(0, 8);

        container.innerHTML = quickTags.map(tag => {
            const name = tag.attributes?.name || tag.name || '';
            return `
                <button class="quick-tag" data-name="${escapeHtml(name)}">
                    <span>🏷️</span>
                    <span>${escapeHtml(name)}</span>
                </button>
            `;
        }).join('');

        container.querySelectorAll('.quick-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                addTagToQuery(btn.dataset.name, false);
            });
        });
    }

    function filterTagList(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const filteredTags = STATE.allTags.filter(tag => {
            const name = (tag.attributes?.name || tag.name || '').toLowerCase();
            return name.includes(term);
        });
        renderTagList(filteredTags);
    }

    // ============================================
    // LOAD PRODUCTS
    // ============================================
    async function loadProducts() {
        if (STATE.isLoading) return;
        STATE.isLoading = true;

        const loading = document.getElementById('tag-loading');
        const tableBody = document.getElementById('tag-table-body');

        loading.classList.add('show');

        const data = await fetchProducts();

        loading.classList.remove('show');
        STATE.isLoading = false;

        if (!data) {
            if (STATE.lastQueryError) {
                tableBody.innerHTML = `
                    <tr><td colspan="12">
                        <div class="empty-state">
                            <div class="icon">⚠️</div>
                            <div class="title">Query Error</div>
                            <div class="description">${escapeHtml(STATE.lastQueryError)}</div>
                        </div>
                    </td></tr>
                `;
            } else {
                tableBody.innerHTML = `
                    <tr><td colspan="12">
                        <div class="empty-state">
                            <div class="icon">❌</div>
                            <div class="title">Error loading products</div>
                            <div class="description">Please check your connection and try again.</div>
                        </div>
                    </td></tr>
                `;
            }
            return;
        }

        const products = data.data || [];
        STATE.currentProducts = products; // Store for potential quick view
        STATE.totalProducts = data.total || data.meta?.total || 0;

        console.log('📊 Pagination Debug:', {
            total: STATE.totalProducts,
            currentPage: STATE.currentPage,
            itemsPerPage: CONFIG.itemsPerPage,
            productsReturned: products.length,
            calculatedPages: Math.ceil(STATE.totalProducts / CONFIG.itemsPerPage)
        });

        document.getElementById('total-products').textContent = STATE.totalProducts.toLocaleString('de-DE');
        const totalPages = Math.ceil(STATE.totalProducts / CONFIG.itemsPerPage) || 1;
        document.getElementById('current-page-info').textContent = `${STATE.currentPage} / ${totalPages}`;
        document.getElementById('total-items').textContent = STATE.totalProducts.toLocaleString('de-DE');

        const start = STATE.totalProducts > 0 ? (STATE.currentPage - 1) * CONFIG.itemsPerPage + 1 : 0;
        const end = Math.min(STATE.currentPage * CONFIG.itemsPerPage, STATE.totalProducts);
        document.getElementById('showing-range').textContent = STATE.totalProducts > 0 ? `${start}-${end}` : '0-0';

        // Render products
        if (products.length === 0) {
            tableBody.innerHTML = `
                <tr><td colspan="9">
                    <div class="empty-state">
                        <div class="icon">📭</div>
                        <div class="title">No products found</div>
                        <div class="description">Try adjusting your query or search criteria.</div>
                    </div>
                </td></tr>
            `;
        } else {
            tableBody.innerHTML = products.map(renderProductRow).join('');
        }

        renderPagination();
        updateSortIndicators();
    }

    function renderProductRow(product) {
        const attr = product.attributes || product;
        const id = product.id;

        let coverUrl = '';
        if (attr.cover?.media?.url) {
            coverUrl = attr.cover.media.url;
        } else if (attr.cover?.attributes?.media?.url) {
            coverUrl = attr.cover.attributes.media.url;
        }

        const manufacturer = attr.manufacturer?.translated?.name ||
                            attr.manufacturer?.name ||
                            attr.manufacturer?.attributes?.name || '-';

        let price = '-';
        if (attr.price?.[0]?.gross) {
            price = attr.price[0].gross.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR'
            });
        }

        const stock = attr.stock ?? 0;
        let stockClass = 'out-of-stock';
        let stockIcon = '🔴';
        if (stock > 10) {
            stockClass = 'in-stock';
            stockIcon = '🟢';
        } else if (stock > 0) {
            stockClass = 'low-stock';
            stockIcon = '🟡';
        }

        const isActive = attr.active;
        const name = attr.translated?.name || attr.name || '-';
        const productNumber = attr.productNumber || '-';

        const tags = (attr.tags || []);
        const maxVisibleTags = 3;
        let tagsHtml = '';

        tags.slice(0, maxVisibleTags).forEach(t => {
            const tagName = t.translated?.name || t.name || t.attributes?.name || '?';
            tagsHtml += `<span class="tag-badge">${escapeHtml(tagName)}</span>`;
        });

        if (tags.length > maxVisibleTags) {
            const remaining = tags.slice(maxVisibleTags).map(t =>
                t.translated?.name || t.name || t.attributes?.name
            ).join(', ');
            tagsHtml += `<span class="tag-badge more" title="${escapeHtml(remaining)}">+${tags.length - maxVisibleTags}</span>`;
        }

        if (tags.length === 0) {
            tagsHtml = '<span class="tag-badge" style="opacity: 0.5;">No tags</span>';
        }

        return `
            <tr>
                <td>
                    ${coverUrl
                        ? `<img src="${coverUrl}" class="product-img" loading="lazy" alt="">`
                        : `<div class="product-img-placeholder">📷</div>`
                    }
                </td>
                <td><span class="product-number">${escapeHtml(productNumber)}</span></td>
                <td><span class="product-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span></td>
                <td>${escapeHtml(manufacturer)}</td>
                <td><span class="stock-badge ${stockClass}">${stockIcon} ${stock}</span></td>
                <td><span class="price-display">${price}</span></td>
                <td>
                    <div class="status-indicator">
                        <span class="status-dot ${isActive ? 'active' : 'inactive'}"></span>
                        <span style="font-size: 11px;">${isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                </td>
                <td><div class="tags-cell">${tagsHtml}</div></td>
                <td>
                    <div class="actions-cell">
                        <button class="action-btn edit" title="Edit" onclick="window.open('/admin#/sw/product/detail/${id}', '_blank')">✏️</button>
                        <button class="action-btn frontend" title="View" onclick="window.open('/detail/${id}', '_blank')">🌐</button>
                    </div>
                </td>
            </tr>
        `;
    }

    function updateSortIndicators() {
        document.querySelectorAll('#tag-table th[data-field]').forEach(th => {
            const field = th.dataset.field;
            const icon = th.querySelector('.sort-icon');

            if (field === STATE.sortField) {
                th.classList.add('sorted');
                if (icon) icon.textContent = STATE.sortOrder === 'ASC' ? '↑' : '↓';
            } else {
                th.classList.remove('sorted');
                if (icon) icon.textContent = '↕';
            }
        });
    }

    function renderPagination() {
        const container = document.getElementById('page-buttons');
        const totalPages = Math.ceil(STATE.totalProducts / CONFIG.itemsPerPage);

        console.log('📄 Rendering pagination:', {
            totalProducts: STATE.totalProducts,
            itemsPerPage: CONFIG.itemsPerPage,
            totalPages: totalPages,
            currentPage: STATE.currentPage
        });

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';

        // First & Previous
        html += `<button class="page-btn" ${STATE.currentPage === 1 ? 'disabled' : ''} data-page="1" title="First">⏮</button>`;
        html += `<button class="page-btn" ${STATE.currentPage === 1 ? 'disabled' : ''} data-page="${STATE.currentPage - 1}" title="Previous">◀</button>`;

        // Page numbers
        const maxVisible = 7;
        let startPage = Math.max(1, STATE.currentPage - 3);
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                html += `<span class="page-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === STATE.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span class="page-ellipsis">...</span>`;
            }
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next & Last
        html += `<button class="page-btn" ${STATE.currentPage === totalPages ? 'disabled' : ''} data-page="${STATE.currentPage + 1}" title="Next">▶</button>`;
        html += `<button class="page-btn" ${STATE.currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}" title="Last">⏭</button>`;

        container.innerHTML = html;

        // Add click handlers - FIXED: Properly bind events
        container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const page = parseInt(this.dataset.page);
                console.log('🔄 Page click:', page);
                if (page && page !== STATE.currentPage) {
                    STATE.currentPage = page;
                    loadProducts();
                }
            });
        });
    }

    // ============================================
    // EXPORT
    // ============================================
    async function exportToCSV() {
        const token = getAuthToken();
        if (!token) return;

        const btn = document.getElementById('export-csv-btn');
        btn.disabled = true;
        btn.innerHTML = '⏳ Exporting...';

        try {
            const filters = [];

            if (STATE.queryString.trim()) {
                const parser = new QueryParser(STATE.tagMap);
                const result = parser.parse(STATE.queryString);
                if (result.valid && result.filters.length > 0) {
                    filters.push(...result.filters);
                }
            }

            filters.push({ type: 'equals', field: 'parentId', value: null });

            // Fetch ALL matching products for export (paginated)
            let allProducts = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(`${CONFIG.apiBaseUrl}/search/product`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'sw-language-id': CONFIG.languageId
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        page: page,
                        limit: 500,
                        filter: filters,
                        associations: { manufacturer: {}, tags: {} },
                        "total-count-mode": 1
                    })
                });

                const data = await response.json();
                const products = data.data || [];
                allProducts = allProducts.concat(products);

                hasMore = allProducts.length < (data.total || 0);
                page++;

                // Safety limit
                if (page > 50 || allProducts.length >= 10000) break;

                // Update button
                btn.innerHTML = `⏳ Exported ${allProducts.length}...`;
            }

            // Generate CSV
            const headers = ['Product Number', 'Name', 'Manufacturer', 'Stock', 'Price', 'Active', 'Tags'];
            const rows = allProducts.map(p => {
                const attr = p.attributes || p;
                return [
                    attr.productNumber || '',
                    (attr.translated?.name || attr.name || '').replace(/"/g, '""'),
                    attr.manufacturer?.name || attr.manufacturer?.attributes?.name || '',
                    attr.stock || 0,
                    attr.price?.[0]?.gross || '',
                    attr.active ? 'Yes' : 'No',
                    (attr.tags || []).map(t => t.name || t.translated?.name || t.attributes?.name).join('; ')
                ];
            });

            const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `products-export-${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);

            console.log(`✅ Exported ${allProducts.length} products`);

        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed. Please try again.');
        }

        btn.disabled = false;
        btn.innerHTML = '📥 Export CSV';
    }

    // ============================================
    // UTILITY
    // ============================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ============================================
    // INIT
    // ============================================
    async function init() {
        console.log('🚀 Shopware 6 Filter Script v6.0 starting...');

        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        createUI();

        console.log('✅ Script ready');
    }

    init();

})();