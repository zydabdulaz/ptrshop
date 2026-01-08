/**
 * Cart Module - Handles cart operations and batch download
 */
const cart = {
   items: [],

   init() {
      this.load();
      this.render();
   },

   load() {
      try {
         const saved = localStorage.getItem("ptr-cart");
         if (saved) this.items = JSON.parse(saved);
      } catch (e) {
         this.items = [];
      }
   },

   save() {
      localStorage.setItem("ptr-cart", JSON.stringify(this.items));
   },

   add(item) {
      const existing = this.items.find(i => 
         i.designId === item.designId && 
         i.size === item.size && 
         i.type === item.type
      );

      if (existing) {
         existing.qty += item.qty;
      } else {
         this.items.push({
            id: Date.now(),
            ...item,
         });
      }

      this.save();
      this.render();
      ui.showToast(`Added ${item.designName} to cart`, "success");
   },

   remove(id) {
      this.items = this.items.filter((item) => item.id !== id);
      this.save();
      this.render();
   },

   clear() {
      if (this.items.length === 0) return;
      this.items = [];
      this.save();
      this.render();
      ui.showToast("Cart cleared", "warning");
   },

   getTotal() {
      return this.items.reduce((sum, item) => sum + item.qty, 0);
   },

   render() {
      const container = document.getElementById("cart-items");
      const countEl = document.getElementById("cart-count");
      const totalEl = document.getElementById("cart-total");
      const downloadBtn = document.querySelector(".btn-download");

      const total = this.getTotal();
      countEl.textContent = total;
      countEl.classList.toggle("visible", total > 0);
      totalEl.textContent = total;
      downloadBtn.disabled = total === 0;

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
               <img src="${item.thumbnail}" alt="${item.designName}" loading="lazy">
            </div>
            <div class="cart-item-details">
               <div class="cart-item-name">${item.designName}</div>
               <div class="cart-item-variant">${item.size} • ${item.type}</div>
               <div class="cart-item-qty">Qty: ${item.qty}</div>
            </div>
            <button class="cart-item-remove" onclick="cart.remove(${item.id})" aria-label="Remove item">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
               </svg>
            </button>
         </div>
      `).join("");
   },

   /**
    * Duplicate pages in a PDF based on quantity
    * @param {ArrayBuffer} pdfBytes - Original PDF bytes
    * @param {number} qty - Number of times to duplicate
    * @returns {Promise<Uint8Array>} - New PDF bytes with duplicated pages
    */
   async duplicatePages(pdfBytes, qty) {
      // Load the source PDF
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { 
         ignoreEncryption: true 
      });
      
      const pageCount = pdfDoc.getPageCount();
      console.log(`Original PDF has ${pageCount} page(s), duplicating ${qty} times`);
      
      if (qty <= 1) {
         // No duplication needed
         return new Uint8Array(pdfBytes);
      }
      
      // Create a new PDF document
      const newPdf = await PDFLib.PDFDocument.create();
      
      // Get all page indices
      const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
      
      // Copy pages qty times
      for (let i = 0; i < qty; i++) {
         const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
         copiedPages.forEach(page => newPdf.addPage(page));
      }
      
      const newPageCount = newPdf.getPageCount();
      console.log(`New PDF has ${newPageCount} page(s)`);
      
      // Save and return
      return await newPdf.save();
   },

   /**
    * Download all cart items as a ZIP file
    */
   async downloadAll() {
      if (this.items.length === 0) return;

      const modal = document.getElementById("download-modal");
      const progressFill = document.getElementById("progress-fill");
      const progressText = document.getElementById("progress-text");

      modal.classList.add("visible");
      progressFill.style.width = "0%";
      progressText.textContent = "Starting download...";

      try {
         const zip = new JSZip();
         const totalItems = this.items.length;
         let successCount = 0;

         for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            progressText.textContent = `Processing ${item.designName} (${i + 1}/${totalItems})...`;

            try {
               // Fetch the PDF file
               const response = await fetch(item.file);
               
               if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
               }

               const pdfBytes = await response.arrayBuffer();
               
               if (pdfBytes.byteLength === 0) {
                  throw new Error("PDF file is empty");
               }

               console.log(`Fetched ${item.file}: ${pdfBytes.byteLength} bytes, qty=${item.qty}`);

               // Duplicate pages based on quantity
               let finalPdfBytes;
               
               if (item.qty > 1) {
                  try {
                     finalPdfBytes = await this.duplicatePages(pdfBytes, item.qty);
                  } catch (pdfError) {
                     console.error("PDF duplication failed:", pdfError);
                     // If duplication fails, just add original file
                     finalPdfBytes = new Uint8Array(pdfBytes);
                  }
               } else {
                  finalPdfBytes = new Uint8Array(pdfBytes);
               }

               // Create filename
               const fileName = `${item.themeName}_${item.designName}_${item.size}_${item.type}.pdf`;
               
               // Add to ZIP
               zip.file(fileName, finalPdfBytes);
               successCount++;
               console.log(`Added to ZIP: ${fileName} (${finalPdfBytes.length} bytes)`);

            } catch (err) {
               console.error(`Error processing ${item.designName}:`, err);
            }

            // Update progress
            progressFill.style.width = `${Math.round(((i + 1) / totalItems) * 100)}%`;
         }

         if (successCount === 0) {
            throw new Error("No files were processed successfully");
         }

         // Generate ZIP
         progressText.textContent = "Creating ZIP file...";
         
         const zipBlob = await zip.generateAsync({ 
            type: "blob",
            compression: "DEFLATE"
         });

         // Download
         const url = URL.createObjectURL(zipBlob);
         const link = document.createElement("a");
         link.href = url;
         link.download = `PTRShop_${new Date().toISOString().split("T")[0]}.zip`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         URL.revokeObjectURL(url);

         modal.classList.remove("visible");
         ui.showToast(`Downloaded ${successCount} file(s)!`, "success");

      } catch (error) {
         console.error("Download failed:", error);
         modal.classList.remove("visible");
         ui.showToast("Download failed: " + error.message, "error");
      }
   }
};
