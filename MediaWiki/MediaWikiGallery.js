// ==UserScript==
// @name         MediaWiki Image Gallery Popup
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  image gallery with zoom, metadata, and keyboard shortcuts for MediaWiki
// @author       3sp3r4nt0
// @match        *://*/mediawiki/*
// @match        *://*/wiki/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ============ CONFIGURATION ============
    const CONFIG = {
        animationSpeed: 200,
        zIndex: 99999,
        preloadImages: true,
        zoomStep: 0.25,
        zoomMin: 0.1,
        zoomMax: 10,
        panSpeed: 50,
        // Minimum image size to include (to filter out icons/buttons)
        minImageWidth: 50,
        minImageHeight: 50
    };

    // ============ STYLES ============
    const styles = `
        /* Overlay */
        .mw-gallery-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: ${CONFIG.zIndex};
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity ${CONFIG.animationSpeed}ms ease, visibility ${CONFIG.animationSpeed}ms ease;
        }

        .mw-gallery-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* Main container */
        .mw-gallery-container {
            position: relative;
            max-width: 95vw;
            max-height: 95vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        /* Image wrapper */
        .mw-gallery-image-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            max-width: 90vw;
            max-height: 75vh;
            overflow: hidden;
        }

        .mw-gallery-image-container {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            cursor: grab;
            max-width: 100%;
            max-height: 100%;
        }

        .mw-gallery-image-container.dragging {
            cursor: grabbing;
        }

        .mw-gallery-image-container.zoomed {
            cursor: grab;
        }

        .mw-gallery-image {
            max-width: 90vw;
            max-height: 75vh;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
            transition: opacity ${CONFIG.animationSpeed}ms ease;
            transform-origin: center center;
            user-select: none;
            -webkit-user-drag: none;
        }

        .mw-gallery-image.loading {
            opacity: 0.3;
        }

        /* Loading spinner */
        .mw-gallery-loader {
            position: absolute;
            width: 50px;
            height: 50px;
            border: 3px solid #333;
            border-top-color: #888;
            border-radius: 50%;
            animation: mw-gallery-spin 1s linear infinite;
        }

        @keyframes mw-gallery-spin {
            to { transform: rotate(360deg); }
        }

        /* Navigation buttons */
        .mw-gallery-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(40, 40, 40, 0.8);
            color: #ccc;
            border: 1px solid #444;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 150ms ease;
            user-select: none;
            z-index: 10;
        }

        .mw-gallery-nav:hover {
            background: rgba(60, 60, 60, 0.9);
            color: #fff;
            border-color: #666;
        }

        .mw-gallery-nav:active {
            transform: translateY(-50%) scale(0.95);
        }

        .mw-gallery-nav.disabled {
            opacity: 0.3;
            cursor: not-allowed;
            pointer-events: none;
        }

        .mw-gallery-prev {
            left: -70px;
        }

        .mw-gallery-next {
            right: -70px;
        }

        /* Top toolbar */
        .mw-gallery-toolbar {
            position: fixed;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 10px 20px;
            background: rgba(25, 25, 25, 0.95);
            border-radius: 8px;
            border: 1px solid #333;
            z-index: ${CONFIG.zIndex + 1};
        }

        /* Close button */
        .mw-gallery-close {
            position: fixed;
            top: 15px;
            right: 20px;
            background: rgba(40, 40, 40, 0.8);
            color: #ccc;
            border: 1px solid #444;
            width: 45px;
            height: 45px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 150ms ease;
            z-index: ${CONFIG.zIndex + 2};
        }

        .mw-gallery-close:hover {
            background: rgba(80, 40, 40, 0.9);
            color: #fff;
            border-color: #666;
        }

        /* Counter */
        .mw-gallery-counter {
            color: #888;
            font-size: 14px;
            font-family: monospace;
        }

        /* Zoom controls */
        .mw-gallery-zoom-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .mw-gallery-zoom-btn {
            background: rgba(50, 50, 50, 0.8);
            color: #ccc;
            border: 1px solid #444;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 150ms ease;
        }

        .mw-gallery-zoom-btn:hover {
            background: rgba(70, 70, 70, 0.9);
            color: #fff;
        }

        .mw-gallery-zoom-level {
            color: #888;
            font-size: 12px;
            font-family: monospace;
            min-width: 50px;
            text-align: center;
        }

        .mw-gallery-zoom-reset {
            font-size: 12px;
            padding: 0 8px;
            width: auto;
        }

        /* Metadata toggle */
        .mw-gallery-meta-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            color: #888;
            font-size: 13px;
            user-select: none;
        }

        .mw-gallery-meta-toggle:hover {
            color: #bbb;
        }

        .mw-gallery-checkbox {
            position: relative;
            width: 40px;
            height: 22px;
            background: #333;
            border-radius: 11px;
            border: 1px solid #444;
            transition: all 150ms ease;
            cursor: pointer;
        }

        .mw-gallery-checkbox::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 16px;
            height: 16px;
            background: #666;
            border-radius: 50%;
            transition: all 150ms ease;
        }

        .mw-gallery-checkbox.active {
            background: #2a5a3a;
            border-color: #3a7a4a;
        }

        .mw-gallery-checkbox.active::after {
            left: 20px;
            background: #5a9a6a;
        }

        /* Divider */
        .mw-gallery-divider {
            width: 1px;
            height: 24px;
            background: #444;
        }

        /* Caption */
        .mw-gallery-caption {
            color: #bbb;
            font-size: 14px;
            text-align: center;
            margin-top: 15px;
            padding: 10px 20px;
            background: rgba(30, 30, 30, 0.8);
            border-radius: 4px;
            max-width: 80vw;
            word-wrap: break-word;
        }

        .mw-gallery-caption-title {
            color: #ddd;
            font-weight: 500;
        }

        /* Metadata panel */
        .mw-gallery-metadata {
            position: fixed;
            top: 70px;
            right: 20px;
            width: 320px;
            max-height: calc(100vh - 180px);
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid #333;
            border-radius: 8px;
            overflow: hidden;
            opacity: 0;
            visibility: hidden;
            transform: translateX(20px);
            transition: all ${CONFIG.animationSpeed}ms ease;
            z-index: ${CONFIG.zIndex + 1};
        }

        .mw-gallery-metadata.active {
            opacity: 1;
            visibility: visible;
            transform: translateX(0);
        }

        .mw-gallery-metadata-header {
            padding: 12px 15px;
            background: rgba(40, 40, 40, 0.8);
            border-bottom: 1px solid #333;
            font-size: 14px;
            font-weight: 500;
            color: #ddd;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .mw-gallery-metadata-header svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }

        .mw-gallery-metadata-content {
            padding: 10px 0;
            max-height: calc(100vh - 240px);
            overflow-y: auto;
        }

        .mw-gallery-metadata-row {
            display: flex;
            padding: 8px 15px;
            border-bottom: 1px solid #2a2a2a;
        }

        .mw-gallery-metadata-row:last-child {
            border-bottom: none;
        }

        .mw-gallery-metadata-label {
            width: 100px;
            flex-shrink: 0;
            color: #777;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .mw-gallery-metadata-value {
            color: #bbb;
            font-size: 13px;
            word-break: break-all;
        }

        .mw-gallery-metadata-value a {
            color: #6a9fca;
            text-decoration: none;
        }

        .mw-gallery-metadata-value a:hover {
            text-decoration: underline;
        }

        .mw-gallery-metadata-loading {
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 13px;
        }

        /* Scrollbar for metadata */
        .mw-gallery-metadata-content::-webkit-scrollbar {
            width: 6px;
        }

        .mw-gallery-metadata-content::-webkit-scrollbar-track {
            background: #1a1a1a;
        }

        .mw-gallery-metadata-content::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 3px;
        }

        /* Thumbnail strip */
        .mw-gallery-thumbs {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 8px;
            padding: 10px 15px;
            background: rgba(25, 25, 25, 0.9);
            border-radius: 8px;
            border: 1px solid #333;
            max-width: 90vw;
            overflow-x: auto;
        }

        .mw-gallery-thumb {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.5;
            border: 2px solid transparent;
            transition: all 150ms ease;
            flex-shrink: 0;
        }

        .mw-gallery-thumb:hover {
            opacity: 0.8;
        }

        .mw-gallery-thumb.active {
            opacity: 1;
            border-color: #666;
        }

        /* Scrollbar for thumbs */
        .mw-gallery-thumbs::-webkit-scrollbar {
            height: 6px;
        }

        .mw-gallery-thumbs::-webkit-scrollbar-track {
            background: #222;
            border-radius: 3px;
        }

        .mw-gallery-thumbs::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 3px;
        }

        /* Hotkey help */
        .mw-gallery-help-btn {
            background: rgba(50, 50, 50, 0.8);
            color: #888;
            border: 1px solid #444;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 150ms ease;
        }

        .mw-gallery-help-btn:hover {
            background: rgba(70, 70, 70, 0.9);
            color: #ccc;
        }

        .mw-gallery-help-panel {
            position: fixed;
            bottom: 100px;
            left: 20px;
            width: 280px;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid #333;
            border-radius: 8px;
            padding: 15px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px);
            transition: all ${CONFIG.animationSpeed}ms ease;
            z-index: ${CONFIG.zIndex + 1};
        }

        .mw-gallery-help-panel.active {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .mw-gallery-help-title {
            color: #ddd;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #333;
        }

        .mw-gallery-help-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
        }

        .mw-gallery-help-key {
            color: #888;
            font-family: monospace;
            background: #2a2a2a;
            padding: 2px 8px;
            border-radius: 3px;
            border: 1px solid #3a3a3a;
        }

        .mw-gallery-help-desc {
            color: #aaa;
        }

        /* Zoom indicator toast */
        .mw-gallery-toast {
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30, 30, 30, 0.9);
            color: #ccc;
            padding: 10px 20px;
            border-radius: 6px;
            border: 1px solid #444;
            font-size: 14px;
            font-family: monospace;
            opacity: 0;
            visibility: hidden;
            transition: opacity 150ms ease, visibility 150ms ease;
            z-index: ${CONFIG.zIndex + 3};
            pointer-events: none;
        }

        .mw-gallery-toast.active {
            opacity: 1;
            visibility: visible;
        }

        /* Image type indicator */
        .mw-gallery-type-badge {
            position: absolute;
            top: 5px;
            left: 5px;
            background: rgba(0, 0, 0, 0.7);
            color: #aaa;
            font-size: 9px;
            padding: 2px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            pointer-events: none;
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
            .mw-gallery-nav {
                width: 40px;
                height: 40px;
                font-size: 20px;
            }

            .mw-gallery-prev {
                left: 10px;
            }

            .mw-gallery-next {
                right: 10px;
            }

            .mw-gallery-thumb {
                width: 50px;
                height: 50px;
            }

            .mw-gallery-toolbar {
                flex-wrap: wrap;
                max-width: 90vw;
            }

            .mw-gallery-metadata {
                width: calc(100vw - 40px);
                right: 20px;
                left: 20px;
                transform: translateX(0);
            }

            .mw-gallery-metadata.active {
                transform: translateX(0);
            }

            .mw-gallery-help-panel {
                left: 20px;
                right: 20px;
                width: auto;
            }
        }
    `;

    // ============ GALLERY CLASS ============
    class ImageGallery {
        constructor() {
            this.images = [];
            this.currentIndex = 0;
            this.overlay = null;
            this.isOpen = false;

            // Zoom state
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.isDragging = false;
            this.dragStart = { x: 0, y: 0 };
            this.panStart = { x: 0, y: 0 };

            // UI state
            this.showMetadata = false;
            this.showHelp = false;

            // Toast timeout
            this.toastTimeout = null;

            // Track processed images to avoid duplicates
            this.processedSrcs = new Set();

            this.init();
        }

        init() {
            this.injectStyles();
            this.collectImages();
            this.createOverlay();
            this.bindEvents();
            this.interceptImageClicks();

            if (CONFIG.preloadImages) {
                this.preloadImages();
            }
        }

        injectStyles() {
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
        }

        // Check if image should be included
        isValidImage(img) {
            // Skip tiny images (icons, buttons, etc.)
            const width = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
            const height = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;

            if (width < CONFIG.minImageWidth || height < CONFIG.minImageHeight) {
                return false;
            }

            // Skip images without src
            if (!img.src) return false;

            // Skip data URIs that are too small
            if (img.src.startsWith('data:') && img.src.length < 1000) return false;

            // Skip common UI images
            const skipPatterns = [
                '/skins/',
                '/resources/',
                'icon',
                'logo',
                'button',
                'arrow',
                'sprite',
                'placeholder'
            ];

            const srcLower = img.src.toLowerCase();
            for (const pattern of skipPatterns) {
                if (srcLower.includes(pattern)) return false;
            }

            return true;
        }

        // Get the content area to search for images
        getContentArea() {
            // Try common MediaWiki content containers
            const selectors = [
                '#mw-content-text',
                '#bodyContent',
                '#content',
                '.mw-parser-output',
                '#mw_content',
                'article',
                'main',
                '.content'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }

            return document.body;
        }

        collectImages() {
            const contentArea = this.getContentArea();
            console.log('[Gallery] Searching for images in:', contentArea);

            // 1. Collect thumbnail images (.thumb .thumbinner)
            this.collectThumbnailImages(contentArea);

            // 2. Collect gallery images (.gallery .gallerybox)
            this.collectGalleryImages(contentArea);

            // 3. Collect inline images (a.image > img) - like your example
            this.collectInlineImages(contentArea);

            // 4. Collect any remaining linked images
            this.collectLinkedImages(contentArea);

            // 5. Collect standalone content images (not linked)
            this.collectStandaloneImages(contentArea);

            // Sort images by their position in the document
            this.images.sort((a, b) => {
                const posA = a.element.getBoundingClientRect();
                const posB = b.element.getBoundingClientRect();
                if (posA.top !== posB.top) return posA.top - posB.top;
                return posA.left - posB.left;
            });

            // Re-index after sorting
            this.images.forEach((img, index) => {
                img.index = index;
            });

            console.log(`[Gallery] Found ${this.images.length} images total`);
        }

        collectThumbnailImages(contentArea) {
            const thumbContainers = contentArea.querySelectorAll('.thumb .thumbinner');

            thumbContainers.forEach((container) => {
                const img = container.querySelector('img.thumbimage') || container.querySelector('img');
                const link = container.querySelector('a.image');
                const caption = container.querySelector('.thumbcaption');

                if (img && this.isValidImage(img) && !this.processedSrcs.has(img.src)) {
                    this.processedSrcs.add(img.src);

                    const thumbSrc = img.src;
                    const fullSrc = this.getFullImageUrl(thumbSrc, link?.href);

                    let captionText = '';
                    if (caption) {
                        const captionClone = caption.cloneNode(true);
                        const magnify = captionClone.querySelector('.magnify');
                        if (magnify) magnify.remove();
                        captionText = captionClone.textContent.trim();
                    }

                    this.images.push({
                        index: this.images.length,
                        thumbSrc: thumbSrc,
                        fullSrc: fullSrc,
                        pageUrl: link?.href || '',
                        caption: captionText || img.alt || '',
                        element: container,
                        link: link,
                        type: 'thumbnail',
                        metadata: null
                    });
                }
            });

            console.log(`[Gallery] Found ${this.images.length} thumbnail images`);
        }

        collectGalleryImages(contentArea) {
            const galleryBoxes = contentArea.querySelectorAll('.gallery .gallerybox, .wikitable img, .mw-gallery-traditional .gallerybox');
            const beforeCount = this.images.length;

            galleryBoxes.forEach((box) => {
                const img = box.querySelector('img');
                const link = img?.closest('a') || box.querySelector('a.image');

                if (img && this.isValidImage(img) && !this.processedSrcs.has(img.src)) {
                    this.processedSrcs.add(img.src);

                    const caption = box.querySelector('.gallerytext');

                    this.images.push({
                        index: this.images.length,
                        thumbSrc: img.src,
                        fullSrc: this.getFullImageUrl(img.src, link?.href),
                        pageUrl: link?.href || '',
                        caption: caption?.textContent?.trim() || img.alt || '',
                        element: box,
                        link: link,
                        type: 'gallery',
                        metadata: null
                    });
                }
            });

            console.log(`[Gallery] Found ${this.images.length - beforeCount} gallery images`);
        }

        collectInlineImages(contentArea) {
            // This handles images like: <a href="..." class="image"><img ...></a>
            const imageLinks = contentArea.querySelectorAll('a.image');
            const beforeCount = this.images.length;

            imageLinks.forEach((link) => {
                // Skip if this link is inside a thumb or gallery (already processed)
                if (link.closest('.thumb') || link.closest('.thumbinner') ||
                    link.closest('.gallerybox') || link.closest('.gallery')) {
                    return;
                }

                const img = link.querySelector('img');

                if (img && this.isValidImage(img) && !this.processedSrcs.has(img.src)) {
                    this.processedSrcs.add(img.src);

                    this.images.push({
                        index: this.images.length,
                        thumbSrc: img.src,
                        fullSrc: this.getFullImageUrl(img.src, link.href),
                        pageUrl: link.href,
                        caption: img.alt || this.extractFilenameFromUrl(link.href) || '',
                        element: link.parentElement || link,
                        link: link,
                        type: 'inline',
                        metadata: null
                    });
                }
            });

            console.log(`[Gallery] Found ${this.images.length - beforeCount} inline images`);
        }

        collectLinkedImages(contentArea) {
            // Collect any linked images that might not have class="image"
            const linkedImages = contentArea.querySelectorAll('a[href*="/File:"] img, a[href*="/Datei:"] img, a[href*="/Image:"] img, a[href*="index.php/Datei:"] img');
            const beforeCount = this.images.length;

            linkedImages.forEach((img) => {
                if (!this.isValidImage(img) || this.processedSrcs.has(img.src)) return;

                // Skip if already in a processed container
                if (img.closest('.thumb') || img.closest('.thumbinner') ||
                    img.closest('.gallerybox') || img.closest('.gallery')) {
                    return;
                }

                const link = img.closest('a');
                if (!link) return;

                this.processedSrcs.add(img.src);

                this.images.push({
                    index: this.images.length,
                    thumbSrc: img.src,
                    fullSrc: this.getFullImageUrl(img.src, link.href),
                    pageUrl: link.href,
                    caption: img.alt || '',
                    element: link.parentElement || link,
                    link: link,
                    type: 'linked',
                    metadata: null
                });
            });

            console.log(`[Gallery] Found ${this.images.length - beforeCount} linked images`);
        }

        collectStandaloneImages(contentArea) {
            // Collect images that aren't linked but are content images
            const allImages = contentArea.querySelectorAll('img');
            const beforeCount = this.images.length;

            allImages.forEach((img) => {
                if (!this.isValidImage(img) || this.processedSrcs.has(img.src)) return;

                // Skip if inside navigation, sidebars, etc.
                if (img.closest('nav') || img.closest('.sidebar') ||
                    img.closest('.navbox') || img.closest('.mw-indicators') ||
                    img.closest('#mw-navigation') || img.closest('#mw-panel') ||
                    img.closest('.noprint')) {
                    return;
                }

                // Skip if it's a small inline image (likely an icon)
                const width = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
                const height = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
                if (width < 100 && height < 100) return;

                this.processedSrcs.add(img.src);

                const link = img.closest('a');

                this.images.push({
                    index: this.images.length,
                    thumbSrc: img.src,
                    fullSrc: this.getFullImageUrl(img.src, link?.href || img.src),
                    pageUrl: link?.href || img.src,
                    caption: img.alt || img.title || '',
                    element: img.parentElement || img,
                    link: link,
                    type: 'standalone',
                    metadata: null
                });
            });

            console.log(`[Gallery] Found ${this.images.length - beforeCount} standalone images`);
        }

        extractFilenameFromUrl(url) {
            if (!url) return '';
            const match = url.match(/(?:File|Datei|Image):([^\/&]+)/i);
            if (match) {
                return decodeURIComponent(match[1].replace(/_/g, ' '));
            }
            return '';
        }

        getFullImageUrl(thumbSrc, linkHref) {
            let fullUrl = thumbSrc;

            // Handle MediaWiki thumbnail URLs
            if (thumbSrc.includes('/thumb/')) {
                fullUrl = thumbSrc.replace('/thumb/', '/').replace(/\/\d+px-[^\/]+$/, '');
            }

            // If we have a direct link to the full image, use that
            if (linkHref && linkHref.includes('/images/') && !linkHref.includes('/thumb/')) {
                // This might be a direct image link
                const imgMatch = linkHref.match(/\/images\/[^"'\s]+\.(jpg|jpeg|png|gif|svg|webp)/i);
                if (imgMatch) {
                    fullUrl = linkHref;
                }
            }

            return fullUrl;
        }

        createOverlay() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'mw-gallery-overlay';
            this.overlay.innerHTML = `
                <button class="mw-gallery-close" title="schließen (Esc)">&times;</button>

                <!-- Top Toolbar -->
                <div class="mw-gallery-toolbar">
                    <div class="mw-gallery-counter">
                        <span class="mw-gallery-current">1</span> / <span class="mw-gallery-total">${this.images.length}</span>
                    </div>

                    <div class="mw-gallery-divider"></div>

                    <!-- Zoom Controls -->
                    <div class="mw-gallery-zoom-controls">
                        <button class="mw-gallery-zoom-btn mw-gallery-zoom-out" title="Zoom raus (-)">−</button>
                        <span class="mw-gallery-zoom-level">100%</span>
                        <button class="mw-gallery-zoom-btn mw-gallery-zoom-in" title="Zoom in (+)">+</button>
                        <button class="mw-gallery-zoom-btn mw-gallery-zoom-reset" title="Reset Zoom (0)">Reset</button>
                    </div>

                    <div class="mw-gallery-divider"></div>

                    <!-- Metadata Toggle -->
                    <label class="mw-gallery-meta-toggle">
                        <div class="mw-gallery-checkbox" title="Toggle Metadata (I)"></div>
                        <span>Metadata</span>
                    </label>

                    <div class="mw-gallery-divider"></div>

                    <!-- Help Button -->
                    <button class="mw-gallery-help-btn" title="Shortcuts (?)">?</button>
                </div>

                <!-- Toast notification -->
                <div class="mw-gallery-toast"></div>

                <!-- Main Container -->
                <div class="mw-gallery-container">
                    <div class="mw-gallery-image-wrapper">
                        <div class="mw-gallery-image-container">
                            <div class="mw-gallery-loader"></div>
                            <img class="mw-gallery-image" src="" alt="" draggable="false">
                        </div>
                        <button class="mw-gallery-nav mw-gallery-prev" title="vorherige (←)">&#10094;</button>
                        <button class="mw-gallery-nav mw-gallery-next" title="nächstes (→)">&#10095;</button>
                    </div>
                    <div class="mw-gallery-caption">
                        <div class="mw-gallery-caption-title"></div>
                    </div>
                </div>

                <!-- Metadata Panel -->
                <div class="mw-gallery-metadata">
                    <div class="mw-gallery-metadata-header">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        Bild Metadaten
                    </div>
                    <div class="mw-gallery-metadata-content">
                        <div class="mw-gallery-metadata-loading">Lade Metadaten...</div>
                    </div>
                </div>

                <!-- Help Panel -->
                <div class="mw-gallery-help-panel">
                    <div class="mw-gallery-help-title">Tastenkombination</div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">←</span>
                        <span class="mw-gallery-help-desc">vorheriges Bild</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">→</span>
                        <span class="mw-gallery-help-desc">nächstes Bild</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">Home</span>
                        <span class="mw-gallery-help-desc">Erstes Bild</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">End</span>
                        <span class="mw-gallery-help-desc">Letzes Bild </span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">+</span>
                        <span class="mw-gallery-help-desc">Zoom in</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">-</span>
                        <span class="mw-gallery-help-desc">Zoom out</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">0</span>
                        <span class="mw-gallery-help-desc">Reset zoom</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">Ctrl+Scroll</span>
                        <span class="mw-gallery-help-desc">Zoom in/out</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">Scroll</span>
                        <span class="mw-gallery-help-desc">vorheriges/nächstes Bild</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">W A S D</span>
                        <span class="mw-gallery-help-desc">Pan image</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">I</span>
                        <span class="mw-gallery-help-desc">Toggle Metadaten</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">F</span>
                        <span class="mw-gallery-help-desc">An Screen anpassen</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">?</span>
                        <span class="mw-gallery-help-desc">Toggle der Hilfe</span>
                    </div>
                    <div class="mw-gallery-help-row">
                        <span class="mw-gallery-help-key">Esc</span>
                        <span class="mw-gallery-help-desc">Gallery schließen</span>
                    </div>
                </div>

                <!-- Thumbnails -->
                <div class="mw-gallery-thumbs"></div>
            `;

            document.body.appendChild(this.overlay);

            // Cache elements
            this.elements = {
                image: this.overlay.querySelector('.mw-gallery-image'),
                imageContainer: this.overlay.querySelector('.mw-gallery-image-container'),
                loader: this.overlay.querySelector('.mw-gallery-loader'),
                caption: this.overlay.querySelector('.mw-gallery-caption-title'),
                counter: this.overlay.querySelector('.mw-gallery-current'),
                total: this.overlay.querySelector('.mw-gallery-total'),
                prevBtn: this.overlay.querySelector('.mw-gallery-prev'),
                nextBtn: this.overlay.querySelector('.mw-gallery-next'),
                closeBtn: this.overlay.querySelector('.mw-gallery-close'),
                thumbsContainer: this.overlay.querySelector('.mw-gallery-thumbs'),
                zoomIn: this.overlay.querySelector('.mw-gallery-zoom-in'),
                zoomOut: this.overlay.querySelector('.mw-gallery-zoom-out'),
                zoomLevel: this.overlay.querySelector('.mw-gallery-zoom-level'),
                zoomReset: this.overlay.querySelector('.mw-gallery-zoom-reset'),
                metaToggle: this.overlay.querySelector('.mw-gallery-checkbox'),
                metaPanel: this.overlay.querySelector('.mw-gallery-metadata'),
                metaContent: this.overlay.querySelector('.mw-gallery-metadata-content'),
                helpBtn: this.overlay.querySelector('.mw-gallery-help-btn'),
                helpPanel: this.overlay.querySelector('.mw-gallery-help-panel'),
                toast: this.overlay.querySelector('.mw-gallery-toast')
            };

            this.createThumbnails();
        }

        createThumbnails() {
            this.elements.thumbsContainer.innerHTML = '';
            this.images.forEach((img, index) => {
                const thumb = document.createElement('img');
                thumb.className = 'mw-gallery-thumb';
                thumb.src = img.thumbSrc;
                thumb.alt = img.caption;
                thumb.title = `${img.caption || 'Image ' + (index + 1)} (${img.type})`;
                thumb.dataset.index = index;
                this.elements.thumbsContainer.appendChild(thumb);
            });
        }

        bindEvents() {
            // Close button
            this.elements.closeBtn.addEventListener('click', () => this.close());

            // Overlay click
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close();
                }
            });

            // Navigation buttons
            this.elements.prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.prev();
            });

            this.elements.nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.next();
            });

            // Thumbnail clicks
            this.elements.thumbsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('mw-gallery-thumb')) {
                    const index = parseInt(e.target.dataset.index, 10);
                    this.goTo(index);
                }
            });

            // Zoom controls
            this.elements.zoomIn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.zoomIn();
            });

            this.elements.zoomOut.addEventListener('click', (e) => {
                e.stopPropagation();
                this.zoomOut();
            });

            this.elements.zoomReset.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetZoom();
            });

            // Metadata toggle
            this.elements.metaToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMetadata();
            });

            // Help button
            this.elements.helpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleHelp();
            });

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;

                // Don't capture if typing in input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                switch(e.key) {
                    case 'Escape':
                        this.close();
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.prev();
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.next();
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        this.pan(0, CONFIG.panSpeed);
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        this.pan(0, -CONFIG.panSpeed);
                        break;
                    case 'Home':
                        e.preventDefault();
                        this.goTo(0);
                        break;
                    case 'End':
                        e.preventDefault();
                        this.goTo(this.images.length - 1);
                        break;
                    case '+':
                    case '=':
                        e.preventDefault();
                        this.zoomIn();
                        break;
                    case '-':
                    case '_':
                        e.preventDefault();
                        this.zoomOut();
                        break;
                    case '0':
                        e.preventDefault();
                        this.resetZoom();
                        break;
                    case 'i':
                    case 'I':
                        e.preventDefault();
                        this.toggleMetadata();
                        break;
                    case 'f':
                    case 'F':
                        e.preventDefault();
                        this.fitToScreen();
                        break;
                    case '?':
                        e.preventDefault();
                        this.toggleHelp();
                        break;
                    case 'w':
                    case 'W':
                        e.preventDefault();
                        this.pan(0, CONFIG.panSpeed);
                        break;
                    case 's':
                    case 'S':
                        e.preventDefault();
                        this.pan(0, -CONFIG.panSpeed);
                        break;
                    case 'a':
                    case 'A':
                        e.preventDefault();
                        this.pan(CONFIG.panSpeed, 0);
                        break;
                    case 'd':
                    case 'D':
                        e.preventDefault();
                        this.pan(-CONFIG.panSpeed, 0);
                        break;
                }
            });

            // Mouse wheel
            this.overlay.addEventListener('wheel', (e) => {
                if (!this.isOpen) return;
                e.preventDefault();

                if (e.ctrlKey || e.metaKey) {
                    // Ctrl + Scroll = Zoom
                    if (e.deltaY < 0) {
                        this.zoomIn(e);
                    } else {
                        this.zoomOut(e);
                    }
                } else {
                    // Normal scroll = Navigate
                    if (e.deltaY > 0) {
                        this.next();
                    } else {
                        this.prev();
                    }
                }
            }, { passive: false });

            // Image drag/pan
            this.elements.imageContainer.addEventListener('mousedown', (e) => {
                if (this.zoom > 1) {
                    this.isDragging = true;
                    this.dragStart = { x: e.clientX, y: e.clientY };
                    this.panStart = { x: this.panX, y: this.panY };
                    this.elements.imageContainer.classList.add('dragging');
                    e.preventDefault();
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (this.isDragging && this.isOpen) {
                    const dx = e.clientX - this.dragStart.x;
                    const dy = e.clientY - this.dragStart.y;
                    this.panX = this.panStart.x + dx;
                    this.panY = this.panStart.y + dy;
                    this.applyTransform();
                }
            });

            document.addEventListener('mouseup', () => {
                this.isDragging = false;
                this.elements.imageContainer.classList.remove('dragging');
            });

            // Double-click to zoom
            this.elements.image.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (this.zoom === 1) {
                    this.setZoom(2, e);
                } else {
                    this.resetZoom();
                }
            });
        }

        interceptImageClicks() {
            this.images.forEach((imgData, index) => {
                // Handle linked images
                if (imgData.link) {
                    imgData.link.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.open(index);
                    });
                }

                // Handle magnify links
                const magnify = imgData.element.querySelector('.magnify a');
                if (magnify) {
                    magnify.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.open(index);
                    });
                }

                // Handle standalone images (no link)
                if (!imgData.link && imgData.type === 'standalone') {
                    const img = imgData.element.querySelector('img') || imgData.element;
                    if (img.tagName === 'IMG') {
                        img.style.cursor = 'pointer';
                        img.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.open(index);
                        });
                    }
                }
            });
        }

        // ============ ZOOM METHODS ============

        zoomIn(event = null) {
            this.setZoom(this.zoom + CONFIG.zoomStep, event);
        }

        zoomOut(event = null) {
            this.setZoom(this.zoom - CONFIG.zoomStep, event);
        }

        setZoom(newZoom, event = null) {
            const oldZoom = this.zoom;
            this.zoom = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, newZoom));

            // If zooming with mouse, zoom towards cursor position
            if (event && event.clientX !== undefined) {
                const rect = this.elements.image.getBoundingClientRect();
                const imgCenterX = rect.left + rect.width / 2;
                const imgCenterY = rect.top + rect.height / 2;

                const mouseX = event.clientX - imgCenterX;
                const mouseY = event.clientY - imgCenterY;

                const zoomRatio = this.zoom / oldZoom;
                this.panX = this.panX * zoomRatio - mouseX * (zoomRatio - 1);
                this.panY = this.panY * zoomRatio - mouseY * (zoomRatio - 1);
            }

            // Reset pan if zooming to 1 or below
            if (this.zoom <= 1) {
                this.panX = 0;
                this.panY = 0;
            }

            this.applyTransform();
            this.updateZoomUI();
            this.showToast(`${Math.round(this.zoom * 100)}%`);
        }

        resetZoom() {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.applyTransform();
            this.updateZoomUI();
            this.showToast('Reset: 100%');
        }

        fitToScreen() {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.applyTransform();
            this.updateZoomUI();
            this.showToast('Fit to screen');
        }

        pan(dx, dy) {
            if (this.zoom > 1) {
                this.panX += dx;
                this.panY += dy;
                this.applyTransform();
            }
        }

        applyTransform() {
            this.elements.image.style.transform = `scale(${this.zoom}) translate(${this.panX / this.zoom}px, ${this.panY / this.zoom}px)`;
            this.elements.imageContainer.classList.toggle('zoomed', this.zoom > 1);
        }

        updateZoomUI() {
            this.elements.zoomLevel.textContent = `${Math.round(this.zoom * 100)}%`;
        }

        // ============ TOAST NOTIFICATION ============

        showToast(message) {
            this.elements.toast.textContent = message;
            this.elements.toast.classList.add('active');

            if (this.toastTimeout) {
                clearTimeout(this.toastTimeout);
            }

            this.toastTimeout = setTimeout(() => {
                this.elements.toast.classList.remove('active');
            }, 1000);
        }

        // ============ METADATA ============

        toggleMetadata() {
            this.showMetadata = !this.showMetadata;
            this.elements.metaToggle.classList.toggle('active', this.showMetadata);
            this.elements.metaPanel.classList.toggle('active', this.showMetadata);

            if (this.showMetadata) {
                this.loadMetadata();
            }
        }

        async loadMetadata() {
            const imgData = this.images[this.currentIndex];

            this.elements.metaContent.innerHTML = '<div class="mw-gallery-metadata-loading">Loading metadata...</div>';

            // Basic metadata we can extract
            const metadata = {
                'Filename': this.extractFilename(imgData.fullSrc),
                'Type': imgData.type.charAt(0).toUpperCase() + imgData.type.slice(1),
                'Caption': imgData.caption || '(none)',
                'Thumb URL': imgData.thumbSrc,
                'Full URL': imgData.fullSrc,
                'Page URL': imgData.pageUrl || '(none)'
            };

            // Try to get image dimensions
            try {
                const dimensions = await this.getImageDimensions(imgData.fullSrc);
                metadata['Dimensions'] = `${dimensions.width} × ${dimensions.height} px`;
                metadata['Aspect Ratio'] = this.calculateAspectRatio(dimensions.width, dimensions.height);
            } catch (e) {
                metadata['Dimensions'] = 'Unable to load';
            }

            // Try to fetch file size
            try {
                const response = await fetch(imgData.fullSrc, { method: 'HEAD' });
                const size = response.headers.get('content-length');
                if (size) {
                    metadata['File Size'] = this.formatBytes(parseInt(size, 10));
                }
                const contentType = response.headers.get('content-type');
                if (contentType) {
                    metadata['MIME Type'] = contentType;
                }
                const lastModified = response.headers.get('last-modified');
                if (lastModified) {
                    metadata['Last Modified'] = new Date(lastModified).toLocaleString();
                }
            } catch (e) {
                // Ignore fetch errors
            }

            this.renderMetadata(metadata, imgData);
        }

        getImageDimensions(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = reject;
                img.src = src;
            });
        }

        extractFilename(url) {
            const parts = url.split('/');
            return decodeURIComponent(parts[parts.length - 1]);
        }

        formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        calculateAspectRatio(width, height) {
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            const divisor = gcd(width, height);
            return `${width / divisor}:${height / divisor}`;
        }

        renderMetadata(metadata, imgData) {
            let html = '';

            for (const [label, value] of Object.entries(metadata)) {
                if (!value || value === '(none)') continue;

                const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'));
                const displayValue = isUrl
                    ? `<a href="${value}" target="_blank" title="${value}">${this.truncateUrl(value)}</a>`
                    : value;

                html += `
                    <div class="mw-gallery-metadata-row">
                        <div class="mw-gallery-metadata-label">${label}</div>
                        <div class="mw-gallery-metadata-value">${displayValue}</div>
                    </div>
                `;
            }

            this.elements.metaContent.innerHTML = html;
        }

        truncateUrl(url, maxLength = 35) {
            if (url.length <= maxLength) return url;
            const filename = url.split('/').pop();
            if (filename.length <= maxLength) return filename;
            return filename.substring(0, maxLength - 3) + '...';
        }

        // ============ HELP ============

        toggleHelp() {
            this.showHelp = !this.showHelp;
            this.elements.helpPanel.classList.toggle('active', this.showHelp);
        }

        // ============ NAVIGATION ============

        open(index = 0) {
            if (this.images.length === 0) return;

            this.isOpen = true;
            this.currentIndex = index;

            // Reset zoom
            this.resetZoom();

            // Reset panels
            this.showHelp = false;
            this.elements.helpPanel.classList.remove('active');

            document.body.style.overflow = 'hidden';
            this.overlay.classList.add('active');
            this.updateDisplay();

            if (this.showMetadata) {
                this.loadMetadata();
            }
        }

        close() {
            this.isOpen = false;
            document.body.style.overflow = '';
            this.overlay.classList.remove('active');
        }

        prev() {
            if (this.currentIndex > 0) {
                this.goTo(this.currentIndex - 1);
            }
        }

        next() {
            if (this.currentIndex < this.images.length - 1) {
                this.goTo(this.currentIndex + 1);
            }
        }

        goTo(index) {
            if (index < 0 || index >= this.images.length) return;
            this.currentIndex = index;

            // Reset zoom when changing images
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.applyTransform();
            this.updateZoomUI();

            this.updateDisplay();

            if (this.showMetadata) {
                this.loadMetadata();
            }
        }

        updateDisplay() {
            const imgData = this.images[this.currentIndex];

            // Show loader
            this.elements.loader.style.display = 'block';
            this.elements.image.classList.add('loading');

            // Load image
            const tempImg = new Image();
            tempImg.onload = () => {
                this.elements.image.src = imgData.fullSrc;
                this.elements.image.classList.remove('loading');
                this.elements.loader.style.display = 'none';
            };
            tempImg.onerror = () => {
                this.elements.image.src = imgData.thumbSrc;
                this.elements.image.classList.remove('loading');
                this.elements.loader.style.display = 'none';
            };
            tempImg.src = imgData.fullSrc;

            // Update caption with type indicator
            const typeLabel = imgData.type !== 'thumbnail' ? ` [${imgData.type}]` : '';
            this.elements.caption.textContent = (imgData.caption || `Image ${this.currentIndex + 1}`) + typeLabel;

            // Update counter
            this.elements.counter.textContent = this.currentIndex + 1;
            this.elements.total.textContent = this.images.length;

            // Update nav buttons
            this.elements.prevBtn.classList.toggle('disabled', this.currentIndex === 0);
            this.elements.nextBtn.classList.toggle('disabled', this.currentIndex === this.images.length - 1);

            // Update thumbnails
            this.elements.thumbsContainer.querySelectorAll('.mw-gallery-thumb').forEach((thumb, i) => {
                thumb.classList.toggle('active', i === this.currentIndex);
            });

            // Scroll active thumbnail into view
            const activeThumb = this.elements.thumbsContainer.querySelector('.mw-gallery-thumb.active');
            if (activeThumb) {
                activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }

        preloadImages() {
            this.images.forEach(imgData => {
                const img = new Image();
                img.src = imgData.fullSrc;
            });
        }
    }

    // ============ INITIALIZE ============
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new ImageGallery());
    } else {
        new ImageGallery();
    }

})();