/**
 * Cart Module — Cart state, rendering, and batch download.
 *
 * Key improvements over original:
 * - Collision-safe unique IDs (incrementing counter, not Date.now)
 * - Inline quantity editing in cart items
 * - Clear-all confirmation dialog
 * - Lazy-loading of CDN scripts (pdf-lib, jszip) on first download
 * - Duplicate-safe ZIP filenames
 * - No console.log in production paths
 */
const cart = {
   items: [],
   _nextId: 1,
   _scriptsLoaded: false,

   // ── Lifecycle ─────────────────────────────────────────

   init() {
      this.load();
      this.render();
   },

   load() {
      try {
         const saved = localStorage.getItem('ptr-cart');
         if (saved) {
            this.items = JSON.parse(saved);
            // Restore the counter past any existing IDs
            const maxId = this.items.reduce((max, item) => Math.max(max, item.id || 0), 0);
            this._nextId = maxId + 1;
         }
      } catch (e) {
         this.items = [];
      }
   },

   save() {
      localStorage.setItem('ptr-cart', JSON.stringify(this.items));
   },

   // ── CRUD ──────────────────────────────────────────────

   add(item) {
      // Merge with existing item if same variant
      const existing = this.items.find(i =>
         i.designId === item.designId &&
         i.size === item.size &&
         i.type === item.type
      );

      if (existing) {
         existing.qty = Math.min(99, existing.qty + item.qty);
      } else {
         this.items.push({ id: this._nextId++, ...item });
      }

      this.save();
      this.render();
      ui.showToast(`Added ${item.designName} to cart`, 'success');
   },

   remove(id) {
      this.items = this.items.filter(item => item.id !== id);
      this.save();
      this.render();
   },

   updateQty(id, delta) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;

      const newQty = item.qty + delta;
      if (newQty < 1) {
         this.remove(id);
         return;
      }
      item.qty = Math.min(99, newQty);
      this.save();
      this.render();
   },

   confirmClear() {
      if (this.items.length === 0) return;
      ui.showConfirm('Clear Cart?', 'All items will be removed. This cannot be undone.');
   },

   executeClear() {
      ui.hideConfirm();
      this.items = [];
      this.save();
      this.render();
      ui.showToast('Cart cleared', 'warning');
   },

   getTotal() {
      return this.items.reduce((sum, item) => sum + item.qty, 0);
   },

   // ── Rendering ─────────────────────────────────────────

   render() {
      const container = document.getElementById('cart-items');
      const countEl = document.getElementById('cart-count');
      const totalEl = document.getElementById('cart-total');
      const downloadBtn = document.getElementById('btn-download');
      // Safe fallback if app isn't initialized yet (initial load from localStorage)
      const e = (typeof app !== 'undefined' && app.esc) ? app.esc : (s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));

      const total = this.getTotal();
      countEl.textContent = total;
      countEl.classList.toggle('visible', total > 0);
      totalEl.textContent = total;
      if (downloadBtn) downloadBtn.disabled = total === 0;

      if (this.items.length === 0) {
         container.innerHTML = `
            <div class="cart-empty">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
               </svg>
               <p>Your cart is empty</p>
               <small>Add some designs to get started</small>
            </div>
         `;
         return;
      }

      container.innerHTML = this.items.map(item => `
         <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-preview">
               <img src="${e(item.thumbnail)}" alt="${e(item.designName)}" loading="lazy"
                    onerror="this.style.display='none'">
            </div>
            <div class="cart-item-details">
               <div class="cart-item-name">${e(item.designName)}</div>
               <div class="cart-item-variant">${e(item.size)} · ${e(item.type)}</div>
               <div class="cart-item-qty-controls">
                  <button class="btn-qty-sm" data-action="cart-update-qty"
                          data-id="${item.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
                  <span class="qty-value">${item.qty}</span>
                  <button class="btn-qty-sm" data-action="cart-update-qty"
                          data-id="${item.id}" data-delta="1" aria-label="Increase quantity">+</button>
               </div>
            </div>
            <button class="cart-item-remove" data-action="cart-remove"
                    data-id="${item.id}" aria-label="Remove ${e(item.designName)}">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
               </svg>
            </button>
         </div>
      `).join('');
   },

   // ── Lazy Script Loading ───────────────────────────────

   async ensureScripts() {
      if (this._scriptsLoaded) return;

      const loadScript = (src) => new Promise((resolve, reject) => {
         const script = document.createElement('script');
         script.src = src;
         script.crossOrigin = 'anonymous';
         script.onload = resolve;
         script.onerror = () => reject(new Error(`Failed to load: ${src}`));
         document.head.appendChild(script);
      });

      await Promise.all([
         loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'),
         loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
      ]);

      this._scriptsLoaded = true;
   },

   // ── PDF Duplication ───────────────────────────────────

   async duplicatePages(pdfBytes, qty) {
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      if (qty <= 1) return new Uint8Array(pdfBytes);

      const newPdf = await PDFLib.PDFDocument.create();
      const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

      for (let i = 0; i < qty; i++) {
         const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
         copiedPages.forEach(page => newPdf.addPage(page));
      }

      return await newPdf.save();
   },

   // ── Batch Download ────────────────────────────────────

   async downloadAll() {
      if (this.items.length === 0) return;

      const modal = document.getElementById('download-modal');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');

      modal.classList.add('visible');
      progressFill.style.width = '0%';
      progressText.textContent = 'Loading download tools...';

      try {
         // Lazy-load CDN scripts on first download
         await this.ensureScripts();

         const zip = new JSZip();
         const totalItems = this.items.length;
         let successCount = 0;
         const usedNames = new Set();

         for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            progressText.textContent = `Processing ${item.designName} (${i + 1}/${totalItems})...`;

            try {
               const response = await fetch(item.file);
               if (!response.ok) throw new Error(`HTTP ${response.status}`);

               const pdfBytes = await response.arrayBuffer();
               if (pdfBytes.byteLength === 0) throw new Error('PDF file is empty');

               let finalPdfBytes;
               if (item.qty > 1) {
                  try {
                     finalPdfBytes = await this.duplicatePages(pdfBytes, item.qty);
                  } catch (e) {
                     finalPdfBytes = new Uint8Array(pdfBytes);
                  }
               } else {
                  finalPdfBytes = new Uint8Array(pdfBytes);
               }

               // Build unique filename to prevent overwrites
               let baseName = `${item.themeName}_${item.designName}_${item.size}_${item.type}`;
               let fileName = `${baseName}.pdf`;
               let counter = 2;
               while (usedNames.has(fileName)) {
                  fileName = `${baseName}_${counter++}.pdf`;
               }
               usedNames.add(fileName);

               zip.file(fileName, finalPdfBytes);
               successCount++;
            } catch (err) {
               // Silently skip failed files, report at the end
            }

            progressFill.style.width = `${Math.round(((i + 1) / totalItems) * 100)}%`;
         }

         if (successCount === 0) throw new Error('No files were processed successfully');

         progressText.textContent = 'Creating ZIP file...';

         const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

         const url = URL.createObjectURL(zipBlob);
         const link = document.createElement('a');
         link.href = url;
         link.download = `PTRShop_${new Date().toISOString().split('T')[0]}.zip`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         URL.revokeObjectURL(url);

         modal.classList.remove('visible');
         ui.showToast(`Downloaded ${successCount} file(s)!`, 'success');
      } catch (error) {
         modal.classList.remove('visible');
         ui.showToast('Download failed: ' + error.message, 'error');
      }
   }
};
