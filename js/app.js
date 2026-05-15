/**
 * App Module — Main application controller.
 * 
 * Architecture:
 * - Centralized event delegation (no inline onclick handlers)
 * - Hash-based routing for browser back/forward support
 * - HTML escaping utility to prevent XSS
 * - Keyboard shortcuts (Escape to close overlays)
 * - Lazy-loading of CDN scripts (pdf-lib, jszip)
 * - Direction-aware view transitions
 * - Scroll-to-top floating button
 * - Image lightbox for design previews
 * - Arrow-key grid navigation
 */
const app = {
   state: {
      catalog: null,
      currentView: 'themes',
      selectedTheme: null,
      selectedDesign: null,
      selectedSize: null,
      selectedType: null,
      searchQuery: '',
      scrollPositions: {},
      /** Track navigation direction for slide animations: 'forward' | 'back' */
      navDirection: 'forward'
   },

   /** View hierarchy for determining slide direction */
   _viewOrder: ['themes', 'designs', 'options'],

   // ── Utilities ─────────────────────────────────────────

   /** Escape HTML entities to prevent XSS from catalog data */
   esc(str) {
      const el = document.createElement('span');
      el.textContent = String(str ?? '');
      return el.innerHTML;
   },

   // ── Initialization ────────────────────────────────────

   async init() {
      const savedTheme = localStorage.getItem('ptr-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);

      cart.init();
      this.bindEvents();
      await this.loadCatalog();
   },

   async loadCatalog() {
      const skeleton = document.getElementById('themes-skeleton');
      const errorEl = document.getElementById('themes-error');
      const grid = document.getElementById('themes-grid');

      // Show skeleton, hide error and grid
      if (skeleton) skeleton.hidden = false;
      if (errorEl) errorEl.hidden = true;
      grid.innerHTML = '';

      try {
         const response = await fetch('data/catalog.json');
         if (!response.ok) throw new Error(`HTTP ${response.status}`);
         this.state.catalog = await response.json();

         // Hide skeleton, render content
         if (skeleton) skeleton.hidden = true;
         this.handleRoute();
      } catch (err) {
         if (skeleton) skeleton.hidden = true;
         if (errorEl) {
            errorEl.hidden = false;
            document.getElementById('error-message').textContent =
               'Failed to load catalog. Check your connection and try again.';
         }
         ui.showToast('Failed to load catalog data', 'error');
      }
   },

   // ── Event Delegation ──────────────────────────────────

   bindEvents() {
      document.addEventListener('click', (e) => this.handleClick(e));

      document.addEventListener('input', (e) => {
         if (e.target.id === 'search-input') this.handleSearch(e.target.value);
         if (e.target.id === 'quantity-input') this.validateQuantity(e.target);
      });

      document.addEventListener('keydown', (e) => this.handleKeydown(e));

      window.addEventListener('hashchange', () => this.handleRoute());

      // Scroll-to-top visibility
      window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
   },

   handleClick(e) {
      const target = e.target.closest('[data-action]');
      if (!target) {
         // Click on lightbox backdrop (not on the image or close button) closes it
         if (e.target.id === 'lightbox') {
            ui.closeLightbox();
         }
         return;
      }

      const action = target.dataset.action;
      // Prevent default for anchor tags
      if (target.tagName === 'A' || target.closest('a')) e.preventDefault();

      const handlers = {
         'go-home':        () => this.navigate('/'),
         'go-back':        () => window.history.back(),
         'select-theme':   () => this.navigate(`/theme/${target.dataset.id}`),
         'select-design':  () => this.navigate(`/theme/${this.state.selectedTheme}/${target.dataset.id}`),
         'toggle-cart':    () => this.toggleCart(),
         'toggle-theme':   () => this.toggleTheme(),
         'select-size':    () => this.selectSize(target.dataset.value),
         'select-type':    () => this.selectType(target.dataset.value),
         'adjust-qty':     () => this.adjustQty(parseInt(target.dataset.delta)),
         'add-to-cart':    () => this.addToCart(),
         'cart-remove':    () => cart.remove(parseInt(target.dataset.id)),
         'cart-update-qty':() => cart.updateQty(parseInt(target.dataset.id), parseInt(target.dataset.delta)),
         'cart-clear':     () => cart.confirmClear(),
         'cart-download':  () => cart.downloadAll(),
         'confirm-yes':    () => cart.executeClear(),
         'confirm-no':     () => ui.hideConfirm(),
         'retry-load':     () => this.loadCatalog(),
         'close-lightbox': () => ui.closeLightbox(),
         'scroll-top':     () => window.scrollTo({ top: 0, behavior: 'smooth' }),
         'open-lightbox':  () => {
            const img = document.getElementById('options-preview-img');
            if (img?.src) ui.openLightbox(img.src);
         },
      };

      if (handlers[action]) handlers[action]();
   },

   handleKeydown(e) {
      // Escape closes overlays in priority order
      if (e.key === 'Escape') {
         // 1. Lightbox
         const lightbox = document.getElementById('lightbox');
         if (lightbox?.classList.contains('visible')) { ui.closeLightbox(); return; }

         // 2. Confirm modal
         const confirm = document.getElementById('confirm-modal');
         if (confirm?.classList.contains('visible')) { ui.hideConfirm(); return; }

         // 3. Cart sidebar
         const sidebar = document.getElementById('cart-sidebar');
         if (sidebar?.classList.contains('open')) { this.toggleCart(); return; }
      }

      // Enter/Space on focused cards
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card[data-action]')) {
         e.preventDefault();
         e.target.closest('.card[data-action]').click();
         return;
      }

      // Arrow key grid navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
         this.handleArrowNav(e);
      }
   },

   // ── Arrow Key Grid Navigation ─────────────────────────

   handleArrowNav(e) {
      const focused = document.activeElement;
      if (!focused?.classList.contains('card')) return;

      const grid = focused.closest('.grid');
      if (!grid) return;

      const cards = [...grid.querySelectorAll('.card')];
      const idx = cards.indexOf(focused);
      if (idx === -1) return;

      // Determine grid columns from computed style
      const gridStyle = getComputedStyle(grid);
      const cols = gridStyle.gridTemplateColumns.split(' ').length;

      let nextIdx = -1;

      switch (e.key) {
         case 'ArrowRight': nextIdx = Math.min(idx + 1, cards.length - 1); break;
         case 'ArrowLeft':  nextIdx = Math.max(idx - 1, 0); break;
         case 'ArrowDown':  nextIdx = Math.min(idx + cols, cards.length - 1); break;
         case 'ArrowUp':    nextIdx = Math.max(idx - cols, 0); break;
         case 'Home':       nextIdx = 0; break;
         case 'End':        nextIdx = cards.length - 1; break;
      }

      if (nextIdx >= 0 && nextIdx !== idx) {
         e.preventDefault();
         cards[nextIdx].focus();
      }
   },

   // ── Scroll-to-Top ─────────────────────────────────────

   handleScroll() {
      const btn = document.getElementById('scroll-top-btn');
      if (btn) {
         btn.classList.toggle('visible', window.scrollY > 400);
      }
   },

   // ── Hash Routing ──────────────────────────────────────

   navigate(path) {
      this.state.scrollPositions[this.state.currentView] = window.scrollY;
      window.location.hash = path;
   },

   /**
    * Determine navigation direction by comparing view hierarchy positions.
    * Used to select between slideInRight (forward) and slideInLeft (back) animations.
    */
   _getDirection(newView) {
      const oldIdx = this._viewOrder.indexOf(this.state.currentView);
      const newIdx = this._viewOrder.indexOf(newView);
      return newIdx >= oldIdx ? 'forward' : 'back';
   },

   handleRoute() {
      if (!this.state.catalog) return;

      const hash = decodeURIComponent(window.location.hash.slice(1) || '/');
      const parts = hash.split('/').filter(Boolean);

      if (parts[0] === 'theme' && parts.length >= 2) {
         const theme = this.state.catalog.themes.find(t => t.id === parts[1]);
         if (!theme) { this.showThemes(); return; }

         this.state.selectedTheme = parts[1];

         if (parts.length >= 3) {
            const design = theme.designs.find(d => d.id === parts[2]);
            if (!design) { this.navigate(`/theme/${parts[1]}`); return; }

            const direction = this._getDirection('options');
            this.state.selectedDesign = parts[2];
            this.state.currentView = 'options';
            ui.renderOptions(theme, design);
            ui.showView('options', direction);
         } else {
            const direction = this._getDirection('designs');
            this.state.selectedDesign = null;
            this.state.currentView = 'designs';
            ui.renderDesigns(theme);
            ui.showView('designs', direction);
         }
      } else {
         this.showThemes();
      }

      // Restore scroll position
      const saved = this.state.scrollPositions[this.state.currentView] || 0;
      requestAnimationFrame(() => window.scrollTo(0, saved));
   },

   showThemes() {
      const direction = this._getDirection('themes');
      this.state.selectedTheme = null;
      this.state.selectedDesign = null;
      this.state.currentView = 'themes';
      ui.renderThemes(this.state.catalog.themes);
      ui.showView('themes', direction);
   },

   // ── Theme Toggle ──────────────────────────────────────

   toggleTheme() {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('ptr-theme', next);
   },

   // ── Cart Sidebar ──────────────────────────────────────

   toggleCart() {
      const sidebar = document.getElementById('cart-sidebar');
      const overlay = document.getElementById('cart-overlay');
      const isOpen = sidebar.classList.contains('open');

      sidebar.classList.toggle('open');
      overlay.classList.toggle('visible');
      document.body.style.overflow = isOpen ? '' : 'hidden';

      if (!isOpen) sidebar.querySelector('.btn-icon')?.focus();
   },

   // ── Search ────────────────────────────────────────────

   handleSearch(query) {
      this.state.searchQuery = query.trim().toLowerCase();
      if (this.state.currentView !== 'themes') return;

      const all = this.state.catalog.themes;
      if (!this.state.searchQuery) {
         ui.renderThemes(all);
         return;
      }

      const filtered = all.filter(t =>
         t.name.toLowerCase().includes(this.state.searchQuery) ||
         t.id.toLowerCase().includes(this.state.searchQuery) ||
         t.designs.some(d => d.name.toLowerCase().includes(this.state.searchQuery))
      );
      ui.renderThemes(filtered);
   },

   // ── Options ───────────────────────────────────────────

   selectSize(size) {
      this.state.selectedSize = size;
      document.querySelectorAll('#size-options .option-btn').forEach(btn => {
         btn.classList.toggle('active', btn.dataset.value === size);
         btn.setAttribute('aria-checked', btn.dataset.value === size);
      });
      ui.updatePreviewThumbnail();
      ui.updateVariantAvailability();
   },

   selectType(type) {
      this.state.selectedType = type;
      document.querySelectorAll('#type-options .option-btn').forEach(btn => {
         btn.classList.toggle('active', btn.dataset.value === type);
         btn.setAttribute('aria-checked', btn.dataset.value === type);
      });
      ui.updatePreviewThumbnail();
      ui.updateVariantAvailability();
   },

   adjustQty(delta) {
      const input = document.getElementById('quantity-input');
      const newVal = Math.max(1, Math.min(99, (parseInt(input.value) || 1) + delta));
      input.value = newVal;
   },

   validateQuantity(input) {
      let val = parseInt(input.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 99) val = 99;
      input.value = val;
   },

   addToCart() {
      const { selectedTheme, selectedDesign, selectedSize, selectedType, catalog } = this.state;
      const qty = Math.max(1, Math.min(99, parseInt(document.getElementById('quantity-input').value) || 1));

      const theme = catalog.themes.find(t => t.id === selectedTheme);
      const design = theme?.designs.find(d => d.id === selectedDesign);
      const variant = design?.variants.find(v => v.size === selectedSize && v.type === selectedType);

      if (!variant) {
         ui.showToast('Selected variant not available', 'error');
         return;
      }

      cart.add({
         themeId: theme.id,
         themeName: theme.name,
         designId: design.id,
         designName: design.name,
         size: selectedSize,
         type: selectedType,
         qty,
         file: variant.file,
         thumbnail: variant.thumbnail || design.thumbnail
      });
   }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
