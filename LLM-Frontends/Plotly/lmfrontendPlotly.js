// ==UserScript==
// @name         Plotly Live Renderer Pro + System Prompts (Multi-Platform)
// @namespace    plotly-renderer
// @version      6.1.0
// @description  Renders Plotly JSON blocks and manages System Prompts on ChatGPT, DeepSeek & Arena.ai
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chat.deepseek.com/*
// @match        https://arena.ai/*
// @grant        none
// @author       3sp3r4nt0
// @require      https://cdn.plot.ly/plotly-2.35.0.min.js
// ==/UserScript==

(function () {
    'use strict';

    const ATTR_PROCESSED = 'data-plotly-init';
    const DEBOUNCE_MS = 300;
    const STABILITY_MS = 500;

    const pendingBlocks = new Map();
    const config = { scrollZoom: false, ctrlZoom: true };

    // Platform detection
    const isDeepSeek = () => window.location.hostname.includes('deepseek');
    const isChatGPT = () => window.location.hostname.includes('chatgpt') || window.location.hostname.includes('openai');
    const isArena = () => window.location.hostname.includes('arena.ai');

    const getPlatform = () => {
        if (isArena()) return 'arena';
        if (isDeepSeek()) return 'deepseek';
        return 'chatgpt';
    };

    const css = `
        /* Common Styles */
        .pl-btn{display:flex;align-items:center;gap:4px;padding:4px 6px;background:none;border:none;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
        .pl-btn:hover{opacity:.7}
        .pl-btn--active{color:#3b82f6}
        .pl-chart{width:100%;min-height:420px;margin-top:12px;border-radius:8px;overflow:visible!important;position:relative}
        .pl-editor{width:100%;min-height:200px;margin-top:12px;padding:12px;font-family:monospace;font-size:13px;line-height:1.4;background:var(--token-sidebar-surface-primary,#1e1e1e);color:var(--token-text-primary,#d4d4d4);border:1px solid var(--token-border-medium,#444);border-radius:8px;resize:vertical}
        .pl-editor:focus{outline:1px solid #3b82f6}
        .pl-actions{display:flex;gap:8px;margin-top:8px}
        .pl-actions button{padding:6px 12px;font-size:12px;border:none;border-radius:6px;cursor:pointer}
        .pl-apply{background:#3b82f6;color:#fff}
        .pl-apply:hover{background:#2563eb}
        .pl-cancel{background:var(--token-bg-secondary,#333);color:inherit}
        .pl-cancel:hover{opacity:.8}
        .pl-fullscreen{position:fixed;inset:0;z-index:99999;padding:20px;display:flex;flex-direction:column}
        .pl-fullscreen--chatgpt{background:var(--token-main-surface-primary,#0d0d0d)}
        .pl-fullscreen--deepseek{background:#1a1a2e}
        .pl-fullscreen--arena{background:hsl(240 5% 8%)}
        .pl-fullscreen .pl-chart,.pl-fullscreen .arena-pl-chart{flex:1;min-height:0;margin:0;width:100%;height:100%}
        .pl-fullscreen-bar{display:flex;justify-content:flex-end;gap:8px;padding-bottom:12px}
        .pl-fullscreen-bar button{padding:8px 16px;background:var(--token-bg-secondary,#333);color:inherit;border:none;border-radius:6px;cursor:pointer}
        .pl-fullscreen-bar button:hover{opacity:.8}
        .pl-sep{width:1px;height:16px;background:var(--token-border-light,#555);margin:0 2px}
        .pl-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:8px 12px;background:var(--token-sidebar-surface-primary,#2f2f2f);border-radius:10px 10px 0 0;font-size:12px;color:var(--token-text-secondary,#aaa);border-bottom:1px solid var(--token-border-light,#444)}
        .pl-toolbar-label{margin-right:auto;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#3b82f6}
        .pl-user-wrapper{margin-top:12px;border-radius:10px;overflow:visible!important;background:var(--token-sidebar-surface-primary,#2f2f2f);border:1px solid var(--token-border-light,#444)}
        .pl-user-wrapper pre{margin:0;padding:12px;background:#1a1a2e;border-radius:0 0 10px 10px;overflow-x:auto}
        .pl-user-wrapper code{font-family:'Consolas','Monaco','Courier New',monospace;font-size:13px;line-height:1.5;color:#e2e8f0}
        .pl-pending{opacity:.5;pointer-events:none}
        .pl-pending::after{content:'Streaming...';display:block;text-align:center;padding:8px;font-size:11px;color:var(--token-text-tertiary,#888)}
        .pl-code-collapsed .overflow-y-auto{max-height:5.5em;overflow:hidden!important;position:relative}
        .pl-code-collapsed .overflow-y-auto::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2em;background:linear-gradient(transparent,var(--token-sidebar-surface-primary,#1e1e1e));pointer-events:none}
        .pl-chart{max-height:none!important;overflow:visible!important}

        /* Fix modebar cutoff - ensure chart containers and parents don't clip */
        .pl-chart .plot-container,
        .pl-chart .svg-container,
        .arena-pl-chart .plot-container,
        .arena-pl-chart .svg-container,
        .pl-chart .modebar-container,
        .arena-pl-chart .modebar-container{overflow:visible!important}

        /* Ensure modebar is always visible */
        .pl-chart .modebar,
        .arena-pl-chart .modebar{z-index:1000!important}

        /* Fix parent overflow for charts */
        .pl-has-chart{overflow:visible!important}
        [data-code-block="true"].pl-has-chart{overflow:visible!important}
        .contain-inline-size:has(.pl-chart){overflow:visible!important}

        /* DeepSeek specific code collapse */
        .pl-code-collapsed pre{max-height:5.5em;overflow:hidden!important;position:relative}
        .pl-code-collapsed pre::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2em;background:linear-gradient(transparent,#1a1a2e);pointer-events:none}

        /* DeepSeek toolbar integration */
        .ds-pl-toolbar{display:flex;align-items:center;gap:4px;margin-left:auto}
        .ds-pl-btn{display:flex;align-items:center;gap:4px;padding:4px 8px;background:transparent;border:none;color:var(--ds-text-secondary,#aaa);font-size:12px;cursor:pointer;border-radius:4px;transition:all 0.2s}
        .ds-pl-btn:hover{background:rgba(255,255,255,0.1);color:var(--ds-text-primary,#fff)}
        .ds-pl-btn--active{color:#4e6bf5!important;background:rgba(78,107,245,0.1)}
        .ds-pl-sep{width:1px;height:14px;background:var(--ds-border-light,#444);margin:0 4px}

        /* Arena.ai Styles */
        .arena-pl-toolbar{display:flex;align-items:center;gap:4px;margin-left:8px}
        .arena-pl-toolbar-label{margin-right:auto;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:hsl(var(--interactive-cta,217 91% 60%))}
        .arena-pl-btn{display:flex;align-items:center;gap:3px;padding:3px 6px;background:transparent;border:none;color:hsl(var(--text-secondary,240 5% 65%));font-size:11px;cursor:pointer;border-radius:4px;transition:all 0.15s}
        .arena-pl-btn:hover{background:hsl(var(--surface-raised,240 5% 20%));color:hsl(var(--text-primary,0 0% 90%))}
        .arena-pl-btn--active{color:hsl(var(--interactive-cta,217 91% 60%))!important;background:hsla(var(--interactive-cta,217 91% 60%)/.1)}
        .arena-pl-sep{width:1px;height:12px;background:hsl(var(--border-faint,240 5% 25%));margin:0 2px}
        .arena-pl-wrapper{margin-top:8px;border-radius:8px;overflow:visible!important;border:1px solid hsl(var(--border-faint,240 5% 25%))}
        .arena-pl-wrapper [data-code-block]{border:none!important;border-radius:0!important;margin:0!important}
        .arena-pl-wrapper .code-block_container__lbMX4 pre{border-radius:0 0 8px 8px!important}
        .arena-pl-chart{width:100%;min-height:350px;margin-top:8px;border-radius:8px;background:hsl(var(--surface-primary,240 5% 12%));overflow:visible!important;position:relative}

        /* Arena code collapse */
        .pl-code-collapsed .code-block_container__lbMX4{max-height:5.5em;overflow:hidden!important;position:relative}
        .pl-code-collapsed .code-block_container__lbMX4::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2em;background:linear-gradient(transparent,#24292e);pointer-events:none}

        /* Arena fullscreen bar styling */
        .pl-fullscreen--arena .pl-fullscreen-bar button{background:hsl(240 5% 20%);color:hsl(0 0% 90%)}

        /* System Prompt Styles */
        .sp-container{position:relative;display:inline-flex;align-items:center}
        .sp-trigger{display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--token-main-surface-secondary,#2f2f2f);border:1px solid var(--token-border-default,#444);border-radius:20px;color:var(--token-text-primary,#e5e5e5);font-size:13px;font-weight:500;cursor:pointer;transition:all .2s}
        .sp-trigger:hover{background:var(--token-main-surface-tertiary,#3f3f3f);border-color:#3b82f6}
        .sp-trigger svg{width:16px;height:16px}
        .sp-dropdown{position:fixed;min-width:280px;max-width:400px;background:var(--token-main-surface-primary,#212121);border:1px solid var(--token-border-medium,#444);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.6);z-index:999999!important;overflow:hidden}
        .sp-dropdown-header{padding:12px 16px;background:var(--token-main-surface-secondary,#2a2a2a);border-bottom:1px solid var(--token-border-light,#333);font-size:12px;font-weight:600;color:var(--token-text-secondary,#aaa);text-transform:uppercase;letter-spacing:.5px}
        .sp-list{max-height:300px;overflow-y:auto}
        .sp-item{padding:10px 16px;cursor:pointer;transition:background .15s;border-bottom:1px solid var(--token-border-light,#2a2a2a)}
        .sp-item:last-child{border-bottom:none}
        .sp-item:hover{background:var(--token-main-surface-secondary,#2a2a2a)}
        .sp-item-title{font-size:13px;font-weight:500;color:var(--token-text-primary,#e5e5e5);margin-bottom:4px}
        .sp-item-preview{font-size:11px;color:var(--token-text-tertiary,#888);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sp-more-btn{padding:12px 16px;background:var(--token-main-surface-secondary,#2a2a2a);border-top:1px solid var(--token-border-light,#333);text-align:center;cursor:pointer;font-size:13px;font-weight:500;color:#3b82f6;transition:background .15s}
        .sp-more-btn:hover{background:var(--token-main-surface-tertiary,#333)}
        .sp-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
        .sp-modal-content{background:var(--token-main-surface-primary,#212121);border-radius:16px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.5)}
        .sp-modal-header{padding:20px 24px;border-bottom:1px solid var(--token-border-medium,#333);display:flex;align-items:center;justify-content:space-between}
        .sp-modal-title{font-size:18px;font-weight:600;color:var(--token-text-primary,#e5e5e5)}
        .sp-modal-close{background:none;border:none;color:var(--token-text-secondary,#aaa);cursor:pointer;font-size:24px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:all .15s}
        .sp-modal-close:hover{background:var(--token-main-surface-secondary,#2a2a2a);color:var(--token-text-primary,#fff)}
        .sp-modal-body{padding:24px;overflow-y:auto;flex:1}
        .sp-modal-list{display:grid;gap:12px}
        .sp-modal-item{background:var(--token-main-surface-secondary,#2a2a2a);border:1px solid var(--token-border-light,#333);border-radius:10px;padding:16px;transition:all .2s}
        .sp-modal-item:hover{border-color:#3b82f6}
        .sp-modal-item-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .sp-modal-item-title{font-size:14px;font-weight:600;color:var(--token-text-primary,#e5e5e5)}
        .sp-modal-item-actions{display:flex;gap:8px}
        .sp-modal-item-btn{padding:4px 12px;background:var(--token-main-surface-tertiary,#333);border:none;border-radius:6px;color:var(--token-text-secondary,#aaa);font-size:12px;cursor:pointer;transition:all .15s}
        .sp-modal-item-btn:hover{background:#3b82f6;color:#fff}
        .sp-modal-item-btn.delete{color:#ef4444}
        .sp-modal-item-btn.delete:hover{background:#ef4444;color:#fff}
        .sp-modal-item-content{font-size:12px;color:var(--token-text-secondary,#aaa);line-height:1.5;max-height:60px;overflow:hidden}
        .sp-modal-footer{padding:16px 24px;border-top:1px solid var(--token-border-medium,#333);display:flex;gap:12px}
        .sp-modal-btn{flex:1;padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}
        .sp-modal-btn-primary{background:#3b82f6;color:#fff}
        .sp-modal-btn-primary:hover{background:#2563eb}
        .sp-editor-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
        .sp-editor-content{background:var(--token-main-surface-primary,#212121);border-radius:16px;width:100%;max-width:600px;display:flex;flex-direction:column}
        .sp-editor-header{padding:20px 24px;border-bottom:1px solid var(--token-border-medium,#333)}
        .sp-editor-title{font-size:16px;font-weight:600;color:var(--token-text-primary,#e5e5e5);margin-bottom:16px}
        .sp-editor-input{width:100%;padding:8px 12px;background:var(--token-main-surface-secondary,#2a2a2a);border:1px solid var(--token-border-light,#333);border-radius:8px;color:var(--token-text-primary,#e5e5e5);font-size:14px}
        .sp-editor-input:focus{outline:none;border-color:#3b82f6}
        .sp-editor-body{padding:24px}
        .sp-editor-textarea{width:100%;min-height:200px;padding:12px;background:var(--token-main-surface-secondary,#2a2a2a);border:1px solid var(--token-border-light,#333);border-radius:8px;color:var(--token-text-primary,#e5e5e5);font-family:monospace;font-size:13px;line-height:1.5;resize:vertical}
        .sp-editor-textarea:focus{outline:none;border-color:#3b82f6}
        .sp-editor-footer{padding:16px 24px;border-top:1px solid var(--token-border-medium,#333);display:flex;gap:12px;justify-content:flex-end}
        .sp-active-indicator{display:none !important}

        /* DeepSeek System Prompt Styles */
        .ds-sp-trigger{display:flex;align-items:center;gap:6px;padding:6px 10px;background:transparent;border:1px solid var(--ds-border-default,#444);border-radius:16px;color:var(--ds-text-primary,#e5e5e5);font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;margin-right:8px}
        .ds-sp-trigger:hover{background:rgba(78,107,245,0.1);border-color:#4e6bf5}
        .ds-sp-trigger svg{width:14px;height:14px}
        .ds-sp-trigger.active{background:rgba(78,107,245,0.15);border-color:#4e6bf5;color:#4e6bf5}

        /* Arena.ai System Prompt Styles */
        .arena-sp-trigger{display:flex;align-items:center;gap:6px;padding:6px 10px;background:transparent;border:1px solid hsl(var(--border-faint,240 5% 30%));border-radius:6px;color:hsl(var(--text-secondary,240 5% 65%));font-size:12px;font-weight:500;cursor:pointer;transition:all .2s}
        .arena-sp-trigger:hover{background:hsl(var(--surface-tertiary,240 5% 17%));border-color:hsl(var(--interactive-cta,217 91% 60%));color:hsl(var(--text-primary,0 0% 90%))}
        .arena-sp-trigger svg{width:14px;height:14px}
        .arena-sp-trigger.active{background:hsla(var(--interactive-cta,217 91% 60%)/.15);border-color:hsl(var(--interactive-cta,217 91% 60%));color:hsl(var(--interactive-cta,217 91% 60%))}
    `;

    function extractJSON(str) {
        if (!str) return '';
        return str.trim().replace(/^```plotly\s*/i, '').replace(/^plotly\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    function isValidJSON(str) {
        try {
            const obj = JSON.parse(str);
            return obj && typeof obj === 'object' && Array.isArray(obj.data);
        } catch { return false; }
    }

    function parseJSON(str) {
        const clean = extractJSON(str);
        return isValidJSON(clean) ? JSON.parse(clean) : null;
    }

    function isDark() {
        if (isArena()) {
            return true;
        }
        if (isDeepSeek()) {
            return document.documentElement.classList.contains('ds-dark') ||
                   document.body.classList.contains('ds-dark') ||
                   !document.body.classList.contains('ds-light');
        }
        return document.documentElement.classList.contains('dark');
    }

    function getLayout(userLayout) {
        const dark = isDark();
        const base = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: dark ? '#d1d5db' : '#1f2937' },
            margin: { t: 50, r: 30, b: 50, l: 60 }
        };
        const merged = { ...userLayout, ...base };
        if (userLayout?.font) merged.font = { ...base.font, ...userLayout.font };
        return merged;
    }

    function getPlotlyConfig() {
        return { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'], scrollZoom: config.scrollZoom };
    }

    function createBtn(text, className, platform) {
        const btn = document.createElement('button');
        if (platform === 'arena') {
            btn.className = 'arena-pl-btn' + (className ? ' ' + className : '');
        } else if (platform === 'deepseek') {
            btn.className = 'ds-pl-btn' + (className ? ' ' + className : '');
        } else {
            btn.className = 'pl-btn' + (className ? ' ' + className : '');
        }
        btn.type = 'button';
        btn.textContent = text;
        return btn;
    }

    function createSep(platform) {
        const sep = document.createElement('span');
        if (platform === 'arena') {
            sep.className = 'arena-pl-sep';
        } else if (platform === 'deepseek') {
            sep.className = 'ds-pl-sep';
        } else {
            sep.className = 'pl-sep';
        }
        return sep;
    }

    function getBlockId(pre) {
        if (!pre._plId) pre._plId = 'pl-' + Math.random().toString(36).slice(2, 11);
        return pre._plId;
    }

    function checkBlockStability(pre, codeEl) {
        const blockId = getBlockId(pre);
        const currentText = codeEl.textContent || '';
        const cleanJSON = extractJSON(currentText);

        if (!isValidJSON(cleanJSON)) {
            pendingBlocks.set(blockId, { text: currentText, timestamp: Date.now(), pre, code: codeEl });
            return false;
        }

        const existing = pendingBlocks.get(blockId);
        if (existing && existing.text === currentText && Date.now() - existing.timestamp >= STABILITY_MS) {
            pendingBlocks.delete(blockId);
            pre.classList.remove('pl-pending');
            return true;
        }

        pendingBlocks.set(blockId, { text: currentText, timestamp: Date.now(), pre, code: codeEl });
        setTimeout(() => processBlocks(), STABILITY_MS + 50);
        return false;
    }

    class PlotlyBlock {
        constructor(pre, codeEl, isUserInput, platform) {
            this.pre = pre;
            this.code = codeEl;
            this.isUserInput = isUserInput;
            this.platform = platform;
            this.wrapper = null;
            this.isCollapsed = false;
            this.originalJSON = extractJSON(codeEl.textContent || '');
            this.currentJSON = this.originalJSON;
            this.chart = null;
            this.editor = null;
            this.editorWrap = null;
            this.isFullscreen = false;
            this.fullscreenEl = null;
            this.fullscreenChart = null;
            this.escHandler = null;
            this.init();
        }

        init() {
            if (this.platform === 'arena') {
                this.initArena();
            } else if (this.platform === 'deepseek') {
                this.initDeepSeek();
            } else {
                this.isUserInput ? this.initUserInput() : this.initAssistant();
            }
            this.updateButtonStates();
        }

        initArena() {
            // Find the code block container in Arena.ai
            const codeBlock = this.pre.closest('[data-code-block="true"]');
            if (!codeBlock) {
                this.wrapper = this.pre;
                this.createArenaFallbackToolbar();
                return;
            }

            this.wrapper = codeBlock;

            // Find the header with language label
            const header = codeBlock.querySelector('.border-border.flex.items-center.justify-between');

            if (header) {
                // Check if toolbar already exists
                if (header.querySelector('.arena-pl-toolbar')) {
                    return;
                }

                this.createArenaButtons();

                // Create toolbar container
                const toolbar = document.createElement('div');
                toolbar.className = 'arena-pl-toolbar';
                toolbar.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:8px;';
                toolbar.append(
                    this.btnCollapse, createSep('arena'),
                    this.btnZoom, createSep('arena'),
                    this.btnFullscreen, createSep('arena'),
                    this.btnEdit, createSep('arena'),
                    this.btnRender
                );

                // Find the copy button container and insert before it
                const copyBtn = header.querySelector('button');
                if (copyBtn) {
                    copyBtn.parentNode.insertBefore(toolbar, copyBtn);
                } else {
                    header.appendChild(toolbar);
                }
            } else {
                this.createArenaFallbackToolbar();
            }
        }

        createArenaFallbackToolbar() {
            // Check if already has wrapper
            if (this.pre.closest('.arena-pl-wrapper')) {
                this.wrapper = this.pre.closest('.arena-pl-wrapper');
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'arena-pl-wrapper';

            const toolbar = document.createElement('div');
            toolbar.className = 'arena-pl-toolbar';
            toolbar.style.cssText = 'padding:6px 10px;background:hsl(240 5% 17%);border-radius:8px 8px 0 0;border-bottom:1px solid hsl(240 5% 25%);';

            const label = document.createElement('span');
            label.className = 'arena-pl-toolbar-label';
            label.textContent = 'plotly';
            toolbar.appendChild(label);

            this.createArenaButtons();
            toolbar.append(
                this.btnCollapse, createSep('arena'),
                this.btnZoom, createSep('arena'),
                this.btnFullscreen, createSep('arena'),
                this.btnEdit, createSep('arena'),
                this.btnRender
            );

            const codeBlock = this.pre.closest('[data-code-block="true"]') || this.pre;
            codeBlock.parentNode.insertBefore(wrapper, codeBlock);
            wrapper.appendChild(toolbar);
            wrapper.appendChild(codeBlock);
            this.wrapper = wrapper;
        }

        createArenaButtons() {
            this.btnRender = createBtn('Render', '', 'arena');
            this.btnEdit = createBtn('Edit', '', 'arena');
            this.btnFullscreen = createBtn('Fullscreen', '', 'arena');
            this.btnZoom = createBtn(this.getZoomLabel(), '', 'arena');
            this.btnCollapse = createBtn('Collapse', '', 'arena');

            this.btnRender.onclick = e => this.handleRender(e);
            this.btnEdit.onclick = e => this.handleEdit(e);
            this.btnFullscreen.onclick = e => this.handleFullscreen(e);
            this.btnZoom.onclick = e => this.handleZoomToggle(e);
            this.btnCollapse.onclick = e => this.handleCollapse(e);
        }

        initDeepSeek() {
            const codeBlock = this.pre.closest('.md-code-block');
            if (!codeBlock) {
                this.wrapper = this.pre;
                this.createDeepSeekFallbackToolbar();
                return;
            }

            this.wrapper = codeBlock;
            const banner = codeBlock.querySelector('.md-code-block-banner');
            if (banner) {
                // Check if toolbar already exists
                if (banner.querySelector('.ds-pl-toolbar')) {
                    return;
                }

                let actionsContainer = banner.querySelector('.d2a24f03._246a029');
                if (!actionsContainer) {
                    actionsContainer = banner.querySelector('.d2a24f03:last-child');
                }

                if (actionsContainer) {
                    this.createDeepSeekButtons();
                    const toolbar = document.createElement('div');
                    toolbar.className = 'ds-pl-toolbar';
                    toolbar.append(
                        this.btnCollapse, createSep('deepseek'),
                        this.btnZoom, createSep('deepseek'),
                        this.btnFullscreen, createSep('deepseek'),
                        this.btnEdit, createSep('deepseek'),
                        this.btnRender
                    );
                    actionsContainer.parentNode.insertBefore(toolbar, actionsContainer);
                } else {
                    this.createDeepSeekFallbackToolbar();
                }
            } else {
                this.createDeepSeekFallbackToolbar();
            }
        }

        createDeepSeekFallbackToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'pl-toolbar';
            toolbar.style.background = '#1a1a2e';
            toolbar.style.borderBottom = '1px solid #333';

            const label = document.createElement('span');
            label.className = 'pl-toolbar-label';
            label.textContent = 'plotly';
            toolbar.appendChild(label);

            this.createDeepSeekButtons();
            toolbar.append(
                this.btnCollapse, createSep('deepseek'),
                this.btnZoom, createSep('deepseek'),
                this.btnFullscreen, createSep('deepseek'),
                this.btnEdit, createSep('deepseek'),
                this.btnRender
            );

            this.pre.parentNode.insertBefore(toolbar, this.pre);
        }

        createDeepSeekButtons() {
            this.btnRender = createBtn('Render', '', 'deepseek');
            this.btnEdit = createBtn('Edit', '', 'deepseek');
            this.btnFullscreen = createBtn('Fullscreen', '', 'deepseek');
            this.btnZoom = createBtn(this.getZoomLabel(), '', 'deepseek');
            this.btnCollapse = createBtn('Collapse', '', 'deepseek');

            this.btnRender.onclick = e => this.handleRender(e);
            this.btnEdit.onclick = e => this.handleEdit(e);
            this.btnFullscreen.onclick = e => this.handleFullscreen(e);
            this.btnZoom.onclick = e => this.handleZoomToggle(e);
            this.btnCollapse.onclick = e => this.handleCollapse(e);
        }

        initAssistant() {
            this.wrapper = this.pre.querySelector('.contain-inline-size') || this.pre;
            const container = this.pre.querySelector('.bg-token-bg-elevated-secondary');
            if (!container) { this.createFallbackToolbar(); return; }

            // Check if toolbar already exists
            if (container.querySelector('.pl-btn')) {
                return;
            }

            this.createButtons();
            container.prepend(this.btnCollapse, createSep('chatgpt'), this.btnZoom, createSep('chatgpt'), this.btnFullscreen, createSep('chatgpt'), this.btnEdit, createSep('chatgpt'), this.btnRender);
        }

        createFallbackToolbar() {
            // Check if already has wrapper
            if (this.pre.closest('.pl-user-wrapper')) {
                this.wrapper = this.pre.closest('.pl-user-wrapper');
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'pl-user-wrapper';
            const toolbar = document.createElement('div');
            toolbar.className = 'pl-toolbar';
            const label = document.createElement('span');
            label.className = 'pl-toolbar-label';
            label.textContent = 'plotly';
            toolbar.appendChild(label);
            this.pre.parentNode.insertBefore(wrapper, this.pre);
            wrapper.appendChild(toolbar);
            wrapper.appendChild(this.pre);
            this.wrapper = wrapper;
            this.createButtons();
            toolbar.append(this.btnCollapse, createSep('chatgpt'), this.btnZoom, createSep('chatgpt'), this.btnFullscreen, createSep('chatgpt'), this.btnEdit, createSep('chatgpt'), this.btnRender);
        }

        initUserInput() {
            // Check if already has wrapper
            if (this.pre.closest('.pl-user-wrapper')) {
                this.wrapper = this.pre.closest('.pl-user-wrapper');
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'pl-user-wrapper';
            const toolbar = document.createElement('div');
            toolbar.className = 'pl-toolbar';
            const label = document.createElement('span');
            label.className = 'pl-toolbar-label';
            label.textContent = 'plotly';
            toolbar.appendChild(label);
            this.pre.parentNode.insertBefore(wrapper, this.pre);
            wrapper.appendChild(toolbar);
            wrapper.appendChild(this.pre);
            this.wrapper = wrapper;
            this.createButtons();
            toolbar.append(this.btnCollapse, createSep('chatgpt'), this.btnZoom, createSep('chatgpt'), this.btnFullscreen, createSep('chatgpt'), this.btnEdit, createSep('chatgpt'), this.btnRender);
        }

        createButtons() {
            this.btnRender = createBtn('Render', '', 'chatgpt');
            this.btnEdit = createBtn('Edit', '', 'chatgpt');
            this.btnFullscreen = createBtn('Fullscreen', '', 'chatgpt');
            this.btnZoom = createBtn(this.getZoomLabel(), '', 'chatgpt');
            this.btnCollapse = createBtn('Collapse', '', 'chatgpt');
            this.btnRender.onclick = e => this.handleRender(e);
            this.btnEdit.onclick = e => this.handleEdit(e);
            this.btnFullscreen.onclick = e => this.handleFullscreen(e);
            this.btnZoom.onclick = e => this.handleZoomToggle(e);
            this.btnCollapse.onclick = e => this.handleCollapse(e);
        }

        getZoomLabel() {
            return config.scrollZoom ? 'Zoom: On' : config.ctrlZoom ? 'Zoom: Ctrl' : 'Zoom: Off';
        }

        getActiveClass() {
            if (this.platform === 'arena') return 'arena-pl-btn--active';
            if (this.platform === 'deepseek') return 'ds-pl-btn--active';
            return 'pl-btn--active';
        }

        updateButtonStates() {
            if (!this.btnRender) return;
            const hasChart = !!this.chart;
            const activeClass = this.getActiveClass();

            this.btnRender.textContent = hasChart ? 'Hide' : 'Render';
            if (hasChart) {
                this.btnRender.classList.add(activeClass);
            } else {
                this.btnRender.classList.remove(activeClass);
            }
            this.btnFullscreen.style.opacity = hasChart ? '1' : '0.4';
            this.btnFullscreen.style.pointerEvents = hasChart ? 'auto' : 'none';
        }

        handleCollapse(e) {
            e.preventDefault();
            e.stopPropagation();
            this.isCollapsed = !this.isCollapsed;
            const activeClass = this.getActiveClass();
            this.wrapper.classList.toggle('pl-code-collapsed', this.isCollapsed);
            this.btnCollapse.textContent = this.isCollapsed ? 'Expand' : 'Collapse';
            this.btnCollapse.classList.toggle(activeClass, this.isCollapsed);
        }

        handleRender(e) {
            e.preventDefault();
            e.stopPropagation();
            this.chart ? this.destroyChart() : this.render();
            this.updateButtonStates();
        }

        handleEdit(e) {
            e.preventDefault();
            e.stopPropagation();
            this.editorWrap ? this.closeEditor() : this.openEditor();
        }

        handleFullscreen(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!this.chart) return;
            this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen();
        }

        handleZoomToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!config.scrollZoom && !config.ctrlZoom) { config.ctrlZoom = true; }
            else if (config.ctrlZoom && !config.scrollZoom) { config.scrollZoom = true; config.ctrlZoom = false; }
            else { config.scrollZoom = false; config.ctrlZoom = false; }
            this.btnZoom.textContent = this.getZoomLabel();
            if (this.chart) Plotly.react(this.chart, this.chart.data, this.chart.layout, getPlotlyConfig());
        }

        render(target) {
            const json = parseJSON(this.currentJSON);
            if (!json) return false;
            const container = target || document.createElement('div');
            if (!target) {
                container.className = this.platform === 'arena' ? 'arena-pl-chart' : 'pl-chart';
                const insertAfter = this.platform === 'arena'
                    ? (this.pre.closest('[data-code-block="true"]') || this.wrapper)
                    : this.platform === 'deepseek'
                    ? (this.pre.closest('.md-code-block') || this.wrapper)
                    : this.wrapper;

                if (this.platform === 'arena' || this.platform === 'deepseek') {
                    insertAfter.parentNode.insertBefore(container, insertAfter.nextSibling);
                } else {
                    this.wrapper.appendChild(container);
                }

                // Mark parent as having chart for overflow fix
                insertAfter.classList.add('pl-has-chart');
            }
            Plotly.newPlot(container, json.data, getLayout(json.layout), getPlotlyConfig());
            if (!target) this.chart = container;
            this.setupCtrlZoom(container);
            return true;
        }

        setupCtrlZoom(container) {
            container._ctrlHandler && container.removeEventListener('wheel', container._ctrlHandler);
            container._ctrlHandler = e => {
                if (config.scrollZoom) return;
                if (config.ctrlZoom && !e.ctrlKey && !e.metaKey) e.stopPropagation();
                if (!config.ctrlZoom && !config.scrollZoom) e.stopPropagation();
            };
            container.addEventListener('wheel', container._ctrlHandler, { passive: true });
        }

        destroyChart() {
            if (this.chart) {
                // Remove pl-has-chart class from parent
                const parent = this.chart.previousElementSibling;
                if (parent) parent.classList.remove('pl-has-chart');

                Plotly.purge(this.chart);
                this.chart.remove();
                this.chart = null;
            }
        }

        openEditor() {
            const activeClass = this.getActiveClass();
            this.editorWrap = document.createElement('div');
            this.editor = document.createElement('textarea');
            this.editor.className = 'pl-editor';
            this.editor.value = this.currentJSON;
            this.editor.spellcheck = false;
            const actions = document.createElement('div');
            actions.className = 'pl-actions';
            const applyBtn = document.createElement('button');
            applyBtn.className = 'pl-apply';
            applyBtn.textContent = 'Apply';
            applyBtn.onclick = () => this.applyEdit();
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'pl-cancel';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => this.closeEditor();
            const resetBtn = document.createElement('button');
            resetBtn.className = 'pl-cancel';
            resetBtn.textContent = 'Reset';
            resetBtn.onclick = () => this.resetEdit();
            actions.append(applyBtn, cancelBtn, resetBtn);
            this.editorWrap.append(this.editor, actions);

            const insertAfter = this.platform === 'arena'
                ? (this.pre.closest('[data-code-block="true"]') || this.wrapper)
                : this.platform === 'deepseek'
                ? (this.pre.closest('.md-code-block') || this.wrapper)
                : this.wrapper;

            if (this.platform === 'arena' || this.platform === 'deepseek') {
                insertAfter.parentNode.insertBefore(this.editorWrap, insertAfter.nextSibling);
            } else {
                this.wrapper.appendChild(this.editorWrap);
            }

            this.btnEdit.classList.add(activeClass);
            this.btnEdit.textContent = 'Close';
        }

        closeEditor() {
            const activeClass = this.getActiveClass();
            if (this.editorWrap) { this.editorWrap.remove(); this.editorWrap = null; this.editor = null; }
            this.btnEdit.classList.remove(activeClass);
            this.btnEdit.textContent = 'Edit';
        }

        applyEdit() {
            if (!this.editor) return;
            const clean = extractJSON(this.editor.value);
            if (!isValidJSON(clean)) { alert('Invalid JSON'); return; }
            this.currentJSON = clean;
            this.closeEditor();
            if (this.chart) { const json = JSON.parse(clean); Plotly.react(this.chart, json.data, getLayout(json.layout), getPlotlyConfig()); }
        }

        resetEdit() { if (this.editor) this.editor.value = this.originalJSON; }

        enterFullscreen() {
            if (!this.chart) return;
            this.isFullscreen = true;
            this.fullscreenEl = document.createElement('div');

            // Platform-specific fullscreen class
            const platformClass = this.platform === 'arena' ? 'pl-fullscreen--arena'
                : this.platform === 'deepseek' ? 'pl-fullscreen--deepseek'
                : 'pl-fullscreen--chatgpt';
            this.fullscreenEl.className = 'pl-fullscreen ' + platformClass;

            const bar = document.createElement('div');
            bar.className = 'pl-fullscreen-bar';
            const zoomBtn = document.createElement('button');
            zoomBtn.textContent = this.getZoomLabel();
            zoomBtn.onclick = () => { this.handleZoomToggle({ preventDefault(){}, stopPropagation(){} }); zoomBtn.textContent = this.getZoomLabel(); };
            const exitBtn = document.createElement('button');
            exitBtn.textContent = 'Exit Fullscreen';
            exitBtn.onclick = () => this.exitFullscreen();
            bar.append(zoomBtn, exitBtn);

            const fsChart = document.createElement('div');
            fsChart.className = this.platform === 'arena' ? 'arena-pl-chart' : 'pl-chart';
            fsChart.style.cssText = 'flex:1;width:100%;height:100%;min-height:0;';

            this.fullscreenEl.append(bar, fsChart);
            document.body.appendChild(this.fullscreenEl);

            const json = parseJSON(this.currentJSON);
            // For fullscreen, we want the chart to fill the container
            const fsLayout = getLayout(json.layout);
            fsLayout.autosize = true;
            delete fsLayout.width;
            delete fsLayout.height;

            Plotly.newPlot(fsChart, json.data, fsLayout, { ...getPlotlyConfig(), responsive: true });
            this.setupCtrlZoom(fsChart);
            this.fullscreenChart = fsChart;

            // Force resize after render
            setTimeout(() => {
                Plotly.Plots.resize(fsChart);
            }, 100);

            this.escHandler = e => { if (e.key === 'Escape') this.exitFullscreen(); };
            document.addEventListener('keydown', this.escHandler);
        }

        exitFullscreen() {
            if (this.fullscreenEl) { Plotly.purge(this.fullscreenChart); this.fullscreenEl.remove(); this.fullscreenEl = null; this.fullscreenChart = null; }
            this.isFullscreen = false;
            if (this.escHandler) { document.removeEventListener('keydown', this.escHandler); this.escHandler = null; }
        }
    }

    function isPlotlyBlock(pre, codeEl, platform) {
        const text = (codeEl.textContent || '').trim().toLowerCase();

        if (platform === 'arena') {
            // Check Arena.ai language indicator
            const codeBlock = pre.closest('[data-code-block="true"]');
            if (codeBlock) {
                const langSpan = codeBlock.querySelector('.text-text-secondary.text-sm.font-medium');
                if (langSpan?.textContent?.trim().toLowerCase() === 'plotly') return true;
            }
        } else if (platform === 'deepseek') {
            const codeBlock = pre.closest('.md-code-block');
            if (codeBlock) {
                const langSpan = codeBlock.querySelector('.d813de27');
                if (langSpan?.textContent?.trim().toLowerCase() === 'plotly') return true;
            }
        } else {
            if (codeEl.classList.contains('language-plotly')) return true;
            const header = pre.querySelector('[class*="select-none"]');
            if (header?.textContent?.trim().toLowerCase() === 'plotly') return true;
        }

        if (text.startsWith('plotly') || text.startsWith('{')) return isValidJSON(extractJSON(codeEl.textContent));
        return false;
    }

    function processBlocks() {
        const platform = getPlatform();

        if (platform === 'arena') {
            // Process Arena.ai code blocks (assistant messages)
            document.querySelectorAll('[data-code-block="true"]:not([' + ATTR_PROCESSED + '])').forEach(codeBlock => {
                const pre = codeBlock.querySelector('pre');
                const codeEl = codeBlock.querySelector('code') || pre;
                if (!pre || !codeEl) return;
                if (!isPlotlyBlock(pre, codeEl, platform)) return;
                if (!isValidJSON(extractJSON(codeEl.textContent)) || !checkBlockStability(pre, codeEl)) return;
                codeBlock.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, codeEl, false, platform);
            });

            // Process user messages in Arena.ai (inside .bg-surface-raised)
            document.querySelectorAll('.bg-surface-raised [data-code-block="true"]:not([' + ATTR_PROCESSED + '])').forEach(codeBlock => {
                const pre = codeBlock.querySelector('pre');
                const codeEl = codeBlock.querySelector('code') || pre;
                if (!pre || !codeEl) return;
                const text = (codeEl.textContent || '').trim().toLowerCase();
                if (!text.startsWith('plotly') && !text.startsWith('{')) return;
                if (!isValidJSON(extractJSON(codeEl.textContent))) return;
                codeBlock.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, codeEl, true, platform);
            });
        } else if (platform === 'deepseek') {
            document.querySelectorAll('.md-code-block pre:not([' + ATTR_PROCESSED + '])').forEach(pre => {
                const codeEl = pre;
                if (!isPlotlyBlock(pre, codeEl, platform)) return;
                if (!isValidJSON(extractJSON(codeEl.textContent)) || !checkBlockStability(pre, codeEl)) return;
                pre.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, codeEl, false, platform);
            });

            document.querySelectorAll('.fbb737a4 pre:not([' + ATTR_PROCESSED + '])').forEach(pre => {
                const text = (pre.textContent || '').trim().toLowerCase();
                if (!text.startsWith('plotly') && !text.startsWith('{')) return;
                if (!isValidJSON(extractJSON(pre.textContent))) return;
                pre.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, pre, true, platform);
            });
        } else {
            document.querySelectorAll('[data-message-author-role="assistant"] pre:not([' + ATTR_PROCESSED + '])').forEach(pre => {
                const code = pre.querySelector('code');
                if (!code || !isPlotlyBlock(pre, code, platform)) return;
                if (!isValidJSON(extractJSON(code.textContent)) || !checkBlockStability(pre, code)) return;
                pre.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, code, false, platform);
            });

            document.querySelectorAll('.user-message-bubble-color pre:not([' + ATTR_PROCESSED + '])').forEach(pre => {
                const code = pre.querySelector('code');
                if (!code) return;
                const text = (code.textContent || '').trim().toLowerCase();
                if (!text.startsWith('plotly') && !text.startsWith('{')) return;
                if (!isValidJSON(extractJSON(code.textContent))) return;
                pre.setAttribute(ATTR_PROCESSED, '1');
                new PlotlyBlock(pre, code, true, platform);
            });
        }
    }

    class SystemPromptManager {
        constructor() {
            this.storageKey = 'chatgpt-system-prompts';
            this.activePromptKey = 'chatgpt-active-prompt';
            this.prompts = this.loadPrompts();
            this.activePrompt = this.loadActivePrompt();
            this.dropdown = null;
            this.isOpen = false;
            this.activeIndicator = null;
            this.platform = getPlatform();
            this.init();
        }

        init() {
            if (!this.prompts.length) this.initDefaultPrompts();
            this.injectUI();
            this.observe();
            if (this.activePrompt) this.showActiveIndicator();
        }

        initDefaultPrompts() {
            this.prompts = [
                { id: this.genId(), title: 'Code Expert', content: 'You are an expert programmer. Provide clean, efficient, well-documented code.', priority: 1 },
                { id: this.genId(), title: 'Creative Writer', content: 'You are a creative writing assistant. Focus on originality and emotional impact.', priority: 2 },
                { id: this.genId(), title: 'Data Analyst', content: 'You are a data analysis expert. Focus on statistical accuracy and actionable insights.', priority: 3 },
                { id: this.genId(), title: 'Plotly Charts', content: 'Please return charts always in **pure Plotly JSON** wrapped in a **`plotly` code block**.', priority: 0 },
                { id: this.genId(), title: 'Concise Assistant', content: 'Provide brief, direct answers. No fluff.', priority: 0 }
            ];
            this.savePrompts();
        }

        genId() { return 'sp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9); }
        loadPrompts() { try { return JSON.parse(localStorage.getItem(this.storageKey)) || []; } catch { return []; } }
        savePrompts() { localStorage.setItem(this.storageKey, JSON.stringify(this.prompts)); }
        loadActivePrompt() { try { return JSON.parse(localStorage.getItem(this.activePromptKey)); } catch { return null; } }
        saveActivePrompt(p) { p ? localStorage.setItem(this.activePromptKey, JSON.stringify(p)) : localStorage.removeItem(this.activePromptKey); }
        getPriorityPrompts() { return this.prompts.filter(p => p.priority > 0).sort((a, b) => a.priority - b.priority).slice(0, 3); }

        injectUI() {
            const interval = setInterval(() => {
                if (document.querySelector('.sp-container')) {
                    clearInterval(interval);
                    return;
                }

                if (this.platform === 'arena') {
                    // Arena.ai UI injection - find the input area
                    const inputForm = document.querySelector('form textarea[name="message"]');
                    if (inputForm) {
                        const formContainer = inputForm.closest('form');
                        const buttonContainer = formContainer?.querySelector('.flex.justify-between');
                        if (buttonContainer) {
                            clearInterval(interval);
                            this.createArenaUI(buttonContainer);
                        }
                    }
                } else if (this.platform === 'deepseek') {
                    const inputContainer = document.querySelector('.ec4f5d61');
                    if (inputContainer) {
                        clearInterval(interval);
                        this.createDeepSeekUI(inputContainer);
                    }
                } else {
                    const footer = document.querySelector('[data-testid="composer-footer-actions"]');
                    if (footer) {
                        clearInterval(interval);
                        this.createChatGPTUI(footer);
                    }
                }
            }, 500);
            setTimeout(() => clearInterval(interval), 15000);
        }

        createArenaUI(container) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sp-container';
            wrapper.style.cssText = 'margin-right:8px;';

            const trigger = document.createElement('button');
            trigger.className = 'arena-sp-trigger';
            trigger.type = 'button';
            trigger.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z"/>
                </svg>
                <span>Prompts</span>
            `;

            if (this.activePrompt) {
                trigger.classList.add('active');
            }

            trigger.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown(trigger);
            };

            wrapper.appendChild(trigger);
            container.insertBefore(wrapper, container.firstChild);

            document.addEventListener('click', e => {
                if (this.isOpen && !this.dropdown?.contains(e.target) && !trigger.contains(e.target)) {
                    this.closeDropdown();
                }
            });
        }

        createDeepSeekUI(container) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sp-container';

            const trigger = document.createElement('button');
            trigger.className = 'ds-sp-trigger';
            trigger.type = 'button';
            trigger.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z"/>
                </svg>
                <span>Prompts</span>
            `;

            if (this.activePrompt) {
                trigger.classList.add('active');
            }

            trigger.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown(trigger);
            };

            wrapper.appendChild(trigger);
            container.insertBefore(wrapper, container.firstChild);

            document.addEventListener('click', e => {
                if (this.isOpen && !this.dropdown?.contains(e.target) && !trigger.contains(e.target)) {
                    this.closeDropdown();
                }
            });
        }

        createChatGPTUI(footer) {
            const actions = footer.querySelector('.flex.min-w-fit');
            if (!actions) return;

            const container = document.createElement('div');
            container.className = 'sp-container';

            const trigger = document.createElement('button');
            trigger.className = 'sp-trigger';
            trigger.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z"/>
                </svg>
                <span>System Prompt</span>
            `;
            trigger.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown(trigger);
            };

            container.appendChild(trigger);
            actions.insertBefore(container, actions.firstChild);

            document.addEventListener('click', e => {
                if (this.isOpen && !this.dropdown?.contains(e.target) && !trigger.contains(e.target)) {
                    this.closeDropdown();
                }
            });
        }

        toggleDropdown(trigger) { this.isOpen ? this.closeDropdown() : this.openDropdown(trigger); }

        openDropdown(trigger) {
            this.closeDropdown();
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'sp-dropdown';
            const header = document.createElement('div');
            header.className = 'sp-dropdown-header';
            header.textContent = 'System Prompts';
            const list = document.createElement('div');
            list.className = 'sp-list';
            this.getPriorityPrompts().forEach(p => list.appendChild(this.createDropdownItem(p)));
            const more = document.createElement('div');
            more.className = 'sp-more-btn';
            more.textContent = 'More Prompts...';
            more.onclick = e => { e.stopPropagation(); this.closeDropdown(); this.openModal(); };
            this.dropdown.append(header, list, more);
            document.body.appendChild(this.dropdown);
            this.positionDropdown(trigger);
            this.isOpen = true;
            const reposition = () => this.positionDropdown(trigger);
            window.addEventListener('scroll', reposition, true);
            window.addEventListener('resize', reposition);
            this.dropdown._cleanup = () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
        }

        positionDropdown(trigger) {
            if (!this.dropdown || !trigger) return;
            const r = trigger.getBoundingClientRect();
            const d = this.dropdown.getBoundingClientRect();
            let top = r.top - d.height - 8;
            if (top < 10) top = r.bottom + 8;
            let left = Math.max(10, Math.min(r.left, window.innerWidth - d.width - 10));
            this.dropdown.style.top = top + 'px';
            this.dropdown.style.left = left + 'px';
        }

        closeDropdown() {
            if (this.dropdown) { this.dropdown._cleanup?.(); this.dropdown.remove(); this.dropdown = null; }
            this.isOpen = false;
        }

        createDropdownItem(p) {
            const item = document.createElement('div');
            item.className = 'sp-item';
            item.innerHTML = '<div class="sp-item-title">' + p.title + '</div><div class="sp-item-preview">' + p.content.substring(0, 60) + '...</div>';
            item.onclick = e => { e.stopPropagation(); this.applyPrompt(p); this.closeDropdown(); };
            return item;
        }

        applyPrompt(p) {
            this.activePrompt = p;
            this.saveActivePrompt(p);

            if (this.platform === 'arena') {
                // Arena.ai textarea
                const textarea = document.querySelector('textarea[name="message"]');
                if (textarea) {
                    textarea.value = p.content;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => textarea.focus(), 100);
                }
                const trigger = document.querySelector('.arena-sp-trigger');
                if (trigger) trigger.classList.add('active');
            } else if (this.platform === 'deepseek') {
                const textarea = document.querySelector('textarea._27c9245, textarea[placeholder*="DeepSeek"], textarea[placeholder*="Message"]');
                if (textarea) {
                    textarea.value = p.content;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => textarea.focus(), 100);
                }
                const trigger = document.querySelector('.ds-sp-trigger');
                if (trigger) trigger.classList.add('active');
            } else {
                const textarea = document.querySelector('#prompt-textarea');
                const para = textarea?.querySelector('p');
                if (para) {
                    para.textContent = p.content;
                    para.classList.remove('placeholder');
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => textarea.focus(), 100);
                }
            }

            this.showActiveIndicator();
        }

        showActiveIndicator() {
            const triggerSelector = this.platform === 'arena' ? '.arena-sp-trigger'
                : this.platform === 'deepseek' ? '.ds-sp-trigger'
                : '.sp-trigger';
            const trigger = document.querySelector(triggerSelector);
            if (trigger && this.activePrompt) {
                trigger.classList.add('active');
            }
        }

        openModal() {
            const modal = document.createElement('div');
            modal.className = 'sp-modal';
            modal.innerHTML = `
                <div class="sp-modal-content">
                    <div class="sp-modal-header">
                        <div class="sp-modal-title">Manage System Prompts</div>
                        <button class="sp-modal-close">×</button>
                    </div>
                    <div class="sp-modal-body">
                        <div class="sp-modal-list"></div>
                    </div>
                    <div class="sp-modal-footer">
                        <button class="sp-modal-btn sp-modal-btn-primary">Create New Prompt</button>
                    </div>
                </div>
            `;
            modal.querySelector('.sp-modal-close').onclick = () => modal.remove();
            modal.onclick = e => { if (e.target === modal) modal.remove(); };
            const list = modal.querySelector('.sp-modal-list');
            this.prompts.forEach(p => list.appendChild(this.createModalItem(p, list, modal)));
            modal.querySelector('.sp-modal-footer button').onclick = () => this.openEditor(null, modal);
            document.body.appendChild(modal);
        }

        createModalItem(p, list, modal) {
            const item = document.createElement('div');
            item.className = 'sp-modal-item';
            item.innerHTML = `
                <div class="sp-modal-item-header">
                    <div class="sp-modal-item-title">${p.title}${p.priority ? ' (P' + p.priority + ')' : ''}</div>
                    <div class="sp-modal-item-actions">
                        <button class="sp-modal-item-btn">Use</button>
                        <button class="sp-modal-item-btn">Edit</button>
                        <button class="sp-modal-item-btn delete">Delete</button>
                    </div>
                </div>
                <div class="sp-modal-item-content">${p.content}</div>
            `;
            const btns = item.querySelectorAll('.sp-modal-item-btn');
            btns[0].onclick = () => { this.applyPrompt(p); modal.remove(); };
            btns[1].onclick = () => this.openEditor(p, modal);
            btns[2].onclick = () => {
                if (confirm('Delete "' + p.title + '"?')) {
                    this.prompts = this.prompts.filter(x => x.id !== p.id);
                    this.savePrompts();
                    item.remove();
                }
            };
            return item;
        }

        openEditor(p, parentModal) {
            const isNew = !p;
            const edit = p || { id: this.genId(), title: '', content: '', priority: 0 };
            const modal = document.createElement('div');
            modal.className = 'sp-editor-modal';
            modal.innerHTML = `
                <div class="sp-editor-content">
                    <div class="sp-editor-header">
                        <div class="sp-editor-title">${isNew ? 'Create' : 'Edit'} System Prompt</div>
                        <input class="sp-editor-input" placeholder="Title" value="${edit.title}">
                    </div>
                    <div class="sp-editor-body">
                        <textarea class="sp-editor-textarea" placeholder="Content...">${edit.content}</textarea>
                        <label style="display:block;margin-top:12px;font-size:13px;color:#aaa">
                            Priority (0-3):
                            <input type="number" min="0" max="3" value="${edit.priority}"
                                   style="margin-left:8px;padding:4px 8px;background:#2a2a2a;border:1px solid #333;border-radius:6px;color:#e5e5e5;width:60px">
                        </label>
                    </div>
                    <div class="sp-editor-footer">
                        <button class="sp-modal-btn sp-cancel">Cancel</button>
                        <button class="sp-modal-btn sp-modal-btn-primary">Save</button>
                    </div>
                </div>
            `;
            modal.onclick = e => { if (e.target === modal) modal.remove(); };
            modal.querySelector('.sp-cancel').onclick = () => modal.remove();
            modal.querySelector('.sp-modal-btn-primary').onclick = () => {
                const t = modal.querySelector('.sp-editor-input').value.trim();
                const c = modal.querySelector('.sp-editor-textarea').value.trim();
                const pr = parseInt(modal.querySelector('input[type="number"]').value) || 0;
                if (!t || !c) { alert('Fill both fields'); return; }
                edit.title = t;
                edit.content = c;
                edit.priority = Math.max(0, Math.min(3, pr));
                if (isNew) this.prompts.push(edit);
                else {
                    const i = this.prompts.findIndex(x => x.id === edit.id);
                    if (i !== -1) this.prompts[i] = edit;
                }
                this.savePrompts();
                modal.remove();
                if (parentModal) {
                    parentModal.remove();
                    this.openModal();
                }
            };
            document.body.appendChild(modal);
            modal.querySelector('.sp-editor-input').focus();
        }

        observe() {
            new MutationObserver(() => {
                if (!document.querySelector('.sp-container')) this.injectUI();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    function injectStyles() {
        if (document.getElementById('pl-css')) return;
        const el = document.createElement('style');
        el.id = 'pl-css';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function debounce(fn, ms) {
        let id;
        return () => { clearTimeout(id); id = setTimeout(fn, ms); };
    }

    function init() {
        injectStyles();
        processBlocks();
        new MutationObserver(debounce(processBlocks, DEBOUNCE_MS)).observe(document.body, { childList: true, subtree: true });
        new SystemPromptManager();
        console.log(`[Plotly Renderer] v6.1.0 Initialized for ${getPlatform()}`);
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();