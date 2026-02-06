// ==UserScript==
// @name         Chacy Mass Delete
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Delete multiple or all items from Chacy lists
// @match        http://chacy.com/*
// @match        https://chacy.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Create control panel
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:10px;right:10px;background:#333;color:#fff;padding:15px;border-radius:8px;z-index:9999;font-family:sans-serif;max-width:250px;';
    panel.innerHTML = `
        <div style="margin-bottom:10px;font-weight:bold;">🗑️ Mass Delete Tool</div>
        <button id="mdSelectAll" style="margin:3px;padding:5px 10px;cursor:pointer;">☑️ Select All</button>
        <button id="mdDeselectAll" style="margin:3px;padding:5px 10px;cursor:pointer;">☐ Deselect</button><br>
        <button id="mdDeleteSelected" style="margin:3px;padding:5px 10px;background:#d9534f;color:#fff;border:none;cursor:pointer;">Delete Selected</button>
        <button id="mdDeleteAll" style="margin:3px;padding:5px 10px;background:#c9302c;color:#fff;border:none;cursor:pointer;">⚠️ DELETE ALL</button>
        <div style="margin-top:10px;">
            <label>Delay (ms): <input type="number" id="mdDelay" value="300" style="width:60px;"></label>
        </div>
        <div id="mdStatus" style="margin-top:10px;font-size:12px;color:#0f0;"></div>
    `;
    document.body.appendChild(panel);

    // Add checkboxes to items
    function addCheckboxes() {
        document.querySelectorAll('li').forEach(li => {
            if (li.querySelector('.md-checkbox')) return;

            const deleteLink = li.querySelector('.dely');
            if (!deleteLink) return;

            const match = deleteLink.getAttribute('onclick')?.match(/deleteItem\((\d+)\)/);
            if (!match) return;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'md-checkbox';
            checkbox.dataset.itemId = match[1];
            checkbox.style.cssText = 'margin-right:10px;transform:scale(1.5);cursor:pointer;vertical-align:middle;';

            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.insertBefore(checkbox, li.firstChild);
        });
    }

    addCheckboxes();
    new MutationObserver(addCheckboxes).observe(document.body, { childList: true, subtree: true });

    // Get list ID from URL
    function getListId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('list_id') || params.get('id');
    }

    // Delete single item via fetch
    async function deleteOne(itemId) {
        const listId = getListId();
        return fetch(`/add-item.php?list_id=${listId}&action=delete&item_id=${itemId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
    }

    // Delete multiple items
    async function deleteItems(ids) {
        const delay = parseInt(document.getElementById('mdDelay').value) || 300;
        const status = document.getElementById('mdStatus');

        for (let i = 0; i < ids.length; i++) {
            status.textContent = `Deleting ${i + 1}/${ids.length}... (ID: ${ids[i]})`;
            try {
                await deleteOne(ids[i]);
            } catch (e) {
                console.error('Delete error:', e);
            }
            await new Promise(r => setTimeout(r, delay));
        }

        status.textContent = `✅ Deleted ${ids.length} items!`;
        setTimeout(() => location.reload(), 1500);
    }

    // Get all deletable item IDs
    function getAllIds() {
        return [...document.querySelectorAll('.dely')]
            .map(el => el.getAttribute('onclick')?.match(/deleteItem\((\d+)\)/)?.[1])
            .filter(Boolean);
    }

    // Get selected IDs
    function getSelectedIds() {
        return [...document.querySelectorAll('.md-checkbox:checked')]
            .map(cb => cb.dataset.itemId);
    }

    // Event handlers
    document.getElementById('mdSelectAll').onclick = () => {
        document.querySelectorAll('.md-checkbox').forEach(cb => cb.checked = true);
    };

    document.getElementById('mdDeselectAll').onclick = () => {
        document.querySelectorAll('.md-checkbox').forEach(cb => cb.checked = false);
    };

    document.getElementById('mdDeleteSelected').onclick = () => {
        const ids = getSelectedIds();
        if (!ids.length) return alert('No items selected!');
        if (confirm(`Delete ${ids.length} selected items?`)) deleteItems(ids);
    };

    document.getElementById('mdDeleteAll').onclick = () => {
        const ids = getAllIds();
        if (!ids.length) return alert('No deletable items found!');
        if (confirm(`⚠️ DELETE ALL ${ids.length} ITEMS?\n\nThis cannot be undone!`)) {
            deleteItems(ids);
        }
    };

})();