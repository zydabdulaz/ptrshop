/**
 * UI Module — Handles all DOM rendering.
 *
 * All dynamic content is escaped via app.esc() to prevent XSS injection.
 * Uses data-action attributes instead of inline onclick handlers.
 */
const ui = {
   currentDesign: null,

   // ── Theme Rendering ───────────────────────────────────

   renderThemes(themes) {
      const grid = document.getElementById('themes-grid');
      const skeleton = document.getElementById('themes-skeleton');
      if (skeleton) skeleton.hidden = true;

      const e = app.esc;

      if (!themes.length) {
         grid.innerHTML = `
            <div class="empty-state">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
               </svg>
               <p>No themes found</p>
               <small>Try a different search term</small>
            </div>
         `;
         return;
      }

      grid.innerHTML = themes.map(theme => `
         <article class="card theme-card" data-action="select-theme" data-id="${e(theme.id)}"
                  tabindex="0" role="button" aria-label="Browse ${e(theme.name)} designs">
            <div class="card-image">
               <img src="${e(theme.thumbnail)}" alt="${e(theme.name)} theme" loading="lazy"
                    onerror="this.style.display='none'">
               <span class="card-badge">${theme.designs.length} design${theme.designs.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="card-body">
               <h3 class="card-title">${e(theme.name)}</h3>
               <p class="card-subtitle">Click to explore</p>
            </div>
         </article>
      `).join('');

      this.staggerCards(grid);
   },

   // ── Design Rendering ──────────────────────────────────

   renderDesigns(theme) {
      const grid = document.getElementById('designs-grid');
      const title = document.getElementById('designs-title');
      const e = app.esc;

      title.textContent = theme.name;

      grid.innerHTML = theme.designs.map(design => `
         <article class="card design-card" data-action="select-design" data-id="${e(design.id)}"
                  tabindex="0" role="button" aria-label="Configure ${e(design.name)}">
            <div class="card-image">
               <img src="${e(design.thumbnail)}" alt="${e(design.name)} preview" loading="lazy"
                    onerror="this.style.display='none'">
               <span class="card-badge">${design.variants.length} variant${design.variants.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="card-body">
               <h3 class="card-title">${e(design.name)}</h3>
               <p class="card-subtitle">${this.getVariantSummary(design.variants)}</p>
            </div>
         </article>
      `).join('');

      this.staggerCards(grid);
   },

   getVariantSummary(variants) {
      const sizes = [...new Set(variants.map(v => v.size))];
      const types = [...new Set(variants.map(v => v.type))];
      return `${sizes.join(', ')} · ${types.map(t => this.formatType(t)).join(', ')}`;
   },

   // ── Options Rendering ─────────────────────────────────

   renderOptions(theme, design) {
      const title = document.getElementById('options-title');
      const preview = document.getElementById('options-preview-img');
      const sizeContainer = document.getElementById('size-options');
      const typeContainer = document.getElementById('type-options');
      const e = app.esc;

      this.currentDesign = design;

      title.textContent = design.name;
      preview.src = design.thumbnail;
      preview.alt = design.name;

      const sizes = [...new Set(design.variants.map(v => v.size))];
      const types = [...new Set(design.variants.map(v => v.type))];

      sizeContainer.parentElement.style.display = '';
      sizeContainer.innerHTML = sizes.map((size, i) => `
         <button class="option-btn ${i === 0 ? 'active' : ''}"
                 data-action="select-size" data-value="${e(size)}"
                 role="radio" aria-checked="${i === 0}" tabindex="0">
            ${e(size)}
         </button>
      `).join('');

      typeContainer.innerHTML = types.map((type, i) => `
         <button class="option-btn ${i === 0 ? 'active' : ''}"
                 data-action="select-type" data-value="${e(type)}"
                 role="radio" aria-checked="${i === 0}" tabindex="0">
            ${this.formatType(type)}
         </button>
      `).join('');

      document.getElementById('quantity-input').value = 1;

      app.state.selectedSize = sizes[0];
      app.state.selectedType = types[0];
      this.updatePreviewThumbnail();
      this.updateVariantAvailability();
   },

   updatePreviewThumbnail() {
      if (!this.currentDesign) return;

      const { selectedSize, selectedType } = app.state;
      const variant = this.currentDesign.variants.find(
         v => v.size === selectedSize && v.type === selectedType
      );

      if (variant) {
         const preview = document.getElementById('options-preview-img');
         preview.src = variant.thumbnail || this.currentDesign.thumbnail;
      }
   },

   /**
    * Cross-filter variant availability:
    * When a size is selected, mark types with no matching variant as unavailable, and vice versa.
    * Also disables the Add to Cart button when the exact combo doesn't exist.
    */
   updateVariantAvailability() {
      if (!this.currentDesign) return;

      const { selectedSize, selectedType } = app.state;
      const variants = this.currentDesign.variants;

      // Types available for the currently selected size
      const availableTypes = new Set(
         variants.filter(v => v.size === selectedSize).map(v => v.type)
      );

      // Sizes available for the currently selected type
      const availableSizes = new Set(
         variants.filter(v => v.type === selectedType).map(v => v.size)
      );

      document.querySelectorAll('#type-options .option-btn').forEach(btn => {
         btn.classList.toggle('unavailable', !availableTypes.has(btn.dataset.value));
      });

      document.querySelectorAll('#size-options .option-btn').forEach(btn => {
         btn.classList.toggle('unavailable', !availableSizes.has(btn.dataset.value));
      });

      // Disable Add to Cart if the exact combo doesn't exist
      const exactMatch = variants.some(
         v => v.size === selectedSize && v.type === selectedType
      );
      const addBtn = document.querySelector('[data-action="add-to-cart"]');
      if (addBtn) addBtn.disabled = !exactMatch;
   },

   formatType(type) {
      const typeNames = { KN: 'Kotak Nama', PLS: 'Polos' };
      return typeNames[type] || type;
   },

   // ── Breadcrumb ────────────────────────────────────────

   updateBreadcrumb() {
      const breadcrumb = document.getElementById('breadcrumb');
      const { currentView, selectedTheme, selectedDesign, catalog } = app.state;
      const e = app.esc;

      let html = `<span class="breadcrumb-item">
         <a href="#/" class="breadcrumb-link" data-action="go-home">Home</a>
      </span>`;

      if (currentView !== 'themes' && selectedTheme) {
         const theme = catalog.themes.find(t => t.id === selectedTheme);
         if (theme) {
            html += `<span class="breadcrumb-item">
               <a href="#/theme/${e(theme.id)}" class="breadcrumb-link"
                  data-action="select-theme" data-id="${e(theme.id)}">${e(theme.name)}</a>
            </span>`;
         }
      }

      if (currentView === 'options' && selectedDesign) {
         const theme = catalog.themes.find(t => t.id === selectedTheme);
         const design = theme?.designs.find(d => d.id === selectedDesign);
         if (design) {
            html += `<span class="breadcrumb-item">${e(design.name)}</span>`;
         }
      }

      breadcrumb.innerHTML = html;
   },

   // ── View Management ───────────────────────────────────

   showView(viewName, direction = 'forward') {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'slide-left'));

      const target = document.getElementById(`view-${viewName}`);
      if (direction === 'back') {
         target.classList.add('slide-left');
      }
      target.classList.add('active');

      this.updateBreadcrumb();
      this.autoFocusView(viewName);
   },

   /**
    * Auto-focus the first interactive element in the new view for keyboard users.
    */
   autoFocusView(viewName) {
      requestAnimationFrame(() => {
         const view = document.getElementById(`view-${viewName}`);
         if (!view) return;

         // Focus search input on themes view, first card on designs view
         if (viewName === 'themes') {
            const searchInput = view.querySelector('.search-input');
            if (searchInput) searchInput.focus({ preventScroll: true });
         } else {
            const firstCard = view.querySelector('.card');
            if (firstCard) firstCard.focus({ preventScroll: true });
         }
      });
   },

   // ── Staggered Card Entrance ───────────────────────────

   staggerCards(grid) {
      const cards = grid.querySelectorAll('.card');
      cards.forEach((card, i) => {
         card.style.animationDelay = `${i * 60}ms`;
         card.classList.add('stagger-in');
      });

      // Clean up animation classes after they finish (avoids blocking hover transforms)
      const cleanup = () => {
         cards.forEach(card => {
            card.classList.remove('stagger-in');
            card.style.animationDelay = '';
         });
      };
      setTimeout(cleanup, cards.length * 60 + 500);
   },

   // ── Image Lightbox ────────────────────────────────────

   openLightbox(src) {
      if (!src) return;
      const lightbox = document.getElementById('lightbox');
      const img = document.getElementById('lightbox-img');
      img.src = src;
      lightbox.classList.add('visible');
      document.body.style.overflow = 'hidden';
   },

   closeLightbox() {
      const lightbox = document.getElementById('lightbox');
      lightbox.classList.remove('visible');
      // Only restore scroll if cart sidebar isn't also open
      const cartOpen = document.getElementById('cart-sidebar')?.classList.contains('open');
      if (!cartOpen) {
         document.body.style.overflow = '';
      }
   },

   // ── Confirm Modal ─────────────────────────────────────

   showConfirm(title, message) {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      document.getElementById('confirm-modal').classList.add('visible');
   },

   hideConfirm() {
      document.getElementById('confirm-modal').classList.remove('visible');
   },

   // ── Toast Notifications ───────────────────────────────

   showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const icons = {
         success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
         error:   '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
         warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
      };

      toast.innerHTML = `
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[type] || icons.success}
         </svg>
         <span>${app.esc(message)}</span>
      `;

      container.appendChild(toast);
      setTimeout(() => {
         toast.classList.add('hide');
         setTimeout(() => toast.remove(), 300);
      }, 3000);
   }
};
