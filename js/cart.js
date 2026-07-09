/**
 * Cart Module — cart state, persistence, rendering, and batch ZIP download.
 */
import { esc, loadScriptOnce } from './utils.js';
import { showToast, showConfirm, hideConfirm } from './ui.js';

const STORAGE_KEY = 'ptr-cart';
const MAX_QTY = 99;
const CDN = {
   pdfLib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
   jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
};

export const cart = {
   items: [],
   _nextId: 1,

   // ── Lifecycle ────────────────────────────────────────
   init() {
      this.load();
      this.render();
   },

   load() {
      try {
         const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
         // Keep only well-formed rows; a corrupt/legacy entry shouldn't crash the app.
         this.items = Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
         this._nextId = this.items.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
      } catch {
         this.items = [];
      }
   },

   save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
   },

   // ── CRUD ─────────────────────────────────────────────
   add(item) {
      // Merge only when the SAME variant of the SAME design in the SAME theme is re-added.
      // Design ids repeat across themes, so themeId must be part of the key.
      const existing = this.items.find(i =>
         i.themeId === item.themeId && i.designId === item.designId &&
         i.size === item.size && i.type === item.type);

      if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + item.qty);
      else this.items.push({ id: this._nextId++, ...item });

      this.save();
      this.render();
      showToast(`Added ${item.designName} to cart`, 'success');
   },

   remove(id) {
      this.items = this.items.filter(i => i.id !== id);
      this.save();
      this.render();
   },

   updateQty(id, delta) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      if (item.qty + delta < 1) return this.remove(id);
      item.qty = Math.min(MAX_QTY, item.qty + delta);
      this.save();
      this.render();
   },

   confirmClear() {
      if (this.items.length) showConfirm('Clear Cart?', 'All items will be removed. This cannot be undone.');
   },

   executeClear() {
      hideConfirm();
      this.items = [];
      this.save();
      this.render();
      showToast('Cart cleared', 'warning');
   },

   getTotal() {
      return this.items.reduce((sum, i) => sum + i.qty, 0);
   },

   // ── Rendering ────────────────────────────────────────
   render() {
      const container = document.getElementById('cart-items');
      const countEl = document.getElementById('cart-count');
      const total = this.getTotal();

      countEl.textContent = total;
      countEl.classList.toggle('visible', total > 0);
      document.getElementById('cart-total').textContent = total;
      const downloadBtn = document.getElementById('btn-download');
      if (downloadBtn) downloadBtn.disabled = total === 0;

      if (!this.items.length) {
         container.innerHTML = `
            <div class="cart-empty">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
               </svg>
               <p>Your cart is empty</p>
               <small>Add some designs to get started</small>
            </div>`;
         return;
      }

      container.innerHTML = this.items.map(item => `
         <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-preview">
               <img src="${esc(item.thumbnail)}" alt="${esc(item.designName)}" loading="lazy" onerror="this.style.display='none'">
            </div>
            <div class="cart-item-details">
               <div class="cart-item-name">${esc(item.designName)}</div>
               <div class="cart-item-variant">${esc(item.themeName)} · ${esc(item.size)} · ${esc(item.type)}</div>
               <div class="cart-item-qty-controls">
                  <button class="btn-qty-sm" data-action="cart-update-qty" data-id="${item.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
                  <span class="qty-value">${item.qty}</span>
                  <button class="btn-qty-sm" data-action="cart-update-qty" data-id="${item.id}" data-delta="1" aria-label="Increase quantity">+</button>
               </div>
            </div>
            <button class="cart-item-remove" data-action="cart-remove" data-id="${item.id}" aria-label="Remove ${esc(item.designName)}">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
         </div>`).join('');
   },

   // ── PDF Duplication ──────────────────────────────────
   async duplicatePages(pdfBytes, qty) {
      if (qty <= 1) return new Uint8Array(pdfBytes);
      const src = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const out = await PDFLib.PDFDocument.create();
      const indices = src.getPageIndices();
      for (let i = 0; i < qty; i++) {
         const pages = await out.copyPages(src, indices);
         pages.forEach(p => out.addPage(p));
      }
      return out.save();
   },

   // ── Batch Download ───────────────────────────────────
   async downloadAll() {
      if (!this.items.length) return;

      const modal = document.getElementById('download-modal');
      const progressFill = document.getElementById('progress-fill');
      const progressBar = progressFill.parentElement;
      const progressText = document.getElementById('progress-text');

      const setProgress = (pct) => {
         progressFill.style.width = `${pct}%`;
         progressBar.setAttribute('aria-valuenow', pct);
      };

      modal.classList.add('visible');
      setProgress(0);
      progressText.textContent = 'Loading download tools...';

      try {
         await Promise.all([loadScriptOnce(CDN.pdfLib), loadScriptOnce(CDN.jszip)]);

         const zip = new JSZip();
         const total = this.items.length;
         const usedNames = new Set();
         const failed = [];

         for (let i = 0; i < total; i++) {
            const item = this.items[i];
            progressText.textContent = `Processing ${item.designName} (${i + 1}/${total})...`;

            try {
               const response = await fetch(item.file);
               if (!response.ok) throw new Error(`HTTP ${response.status}`);
               const pdfBytes = await response.arrayBuffer();
               if (pdfBytes.byteLength === 0) throw new Error('empty PDF');

               let bytes;
               try {
                  bytes = await this.duplicatePages(pdfBytes, item.qty);
               } catch {
                  bytes = new Uint8Array(pdfBytes); // duplication failed → ship single copy
               }
               zip.file(uniqueName(usedNames, item), bytes);
            } catch {
               failed.push(item.designName);
            }
            setProgress(Math.round(((i + 1) / total) * 100));
         }

         if (failed.length === total) throw new Error('No files could be downloaded');

         progressText.textContent = 'Creating ZIP file...';
         const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
         triggerDownload(blob, `PTRShop_${new Date().toISOString().split('T')[0]}.zip`);

         modal.classList.remove('visible');
         const ok = total - failed.length;
         if (failed.length) showToast(`Downloaded ${ok} file(s), ${failed.length} failed`, 'warning');
         else showToast(`Downloaded ${ok} file(s)!`, 'success');
      } catch (err) {
         modal.classList.remove('visible');
         showToast('Download failed: ' + err.message, 'error');
      }
   }
};

// ── Helpers ─────────────────────────────────────────────
function isValidItem(i) {
   return i && typeof i === 'object' &&
      typeof i.file === 'string' && i.designName != null &&
      i.size != null && i.type != null && Number.isFinite(i.qty) && i.qty > 0;
}

function uniqueName(used, item) {
   const base = `${item.themeName}_${item.designName}_${item.size}_${item.type}`;
   let name = `${base}.pdf`;
   let n = 2;
   while (used.has(name)) name = `${base}_${n++}.pdf`;
   used.add(name);
   return name;
}

function triggerDownload(blob, filename) {
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = filename;
   document.body.appendChild(link);
   link.click();
   link.remove();
   URL.revokeObjectURL(url);
}
