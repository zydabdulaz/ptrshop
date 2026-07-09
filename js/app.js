/**
 * App entry — initialization, event delegation, hash routing, options controller.
 */
import { state, findTheme, findDesign, findVariant, loadCatalog } from './catalog.js';
import { cart } from './cart.js';
import { debounce } from './utils.js';
import * as ui from './ui.js';

const app = {
   _viewOrder: ['themes', 'designs', 'options'],

   // ── Init ──────────────────────────────────────────────
   async init() {
      const saved = localStorage.getItem('ptr-theme');
      const theme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', theme);

      cart.init();
      this.bindEvents();
      await this.loadCatalog();
   },

   async loadCatalog() {
      const skeleton = document.getElementById('themes-skeleton');
      const errorEl = document.getElementById('themes-error');
      const grid = document.getElementById('themes-grid');

      if (skeleton) skeleton.hidden = false;
      if (errorEl) errorEl.hidden = true;
      grid.innerHTML = '';

      try {
         await loadCatalog();
         if (skeleton) skeleton.hidden = true;
         this.handleRoute();
      } catch {
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
      document.addEventListener('keydown', (e) => this.handleKeydown(e));
      window.addEventListener('hashchange', () => this.handleRoute());
      window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

      const searchDebounced = debounce((v) => this.handleSearch(v), 200);
      document.addEventListener('input', (e) => {
         if (e.target.id === 'search-input') searchDebounced(e.target.value);
      });
      // Clamp quantity only when the user commits (allows clearing the field mid-edit).
      document.addEventListener('change', (e) => {
         if (e.target.id === 'quantity-input') this.clampQuantity(e.target);
      });
   },

   handleClick(e) {
      const target = e.target.closest('[data-action]');
      if (!target) {
         if (e.target.id === 'lightbox') ui.closeLightbox();
         return;
      }
      if (target.tagName === 'A' || target.closest('a')) e.preventDefault();

      const d = target.dataset;
      const handlers = {
         'go-home':          () => this.navigate('/'),
         'go-back':          () => this.goBack(),
         'select-theme':     () => this.navigate(`/theme/${d.id}`),
         'select-design':    () => this.navigate(`/theme/${state.selectedTheme}/${d.id}`),
         'select-search-result': () => this.navigate(`/theme/${d.themeId}/${d.id}`),
         'toggle-cart':      () => this.toggleCart(),
         'toggle-theme':     () => this.toggleTheme(),
         'select-size':      () => this.selectSize(d.value),
         'select-type':      () => this.selectType(d.value),
         'adjust-qty':       () => this.adjustQty(parseInt(d.delta)),
         'add-to-cart':      () => this.addToCart(),
         'cart-remove':      () => cart.remove(parseInt(d.id)),
         'cart-update-qty':  () => cart.updateQty(parseInt(d.id), parseInt(d.delta)),
         'cart-clear':       () => cart.confirmClear(),
         'cart-download':    () => cart.downloadAll(),
         'confirm-yes':      () => cart.executeClear(),
         'confirm-no':       () => ui.hideConfirm(),
         'retry-load':       () => this.loadCatalog(),
         'close-lightbox':   () => ui.closeLightbox(),
         'scroll-top':       () => window.scrollTo({ top: 0, behavior: 'smooth' }),
         'open-lightbox':    () => {
            const img = document.getElementById('options-preview-img');
            if (img?.src) ui.openLightbox(img.src);
         },
      };
      handlers[d.action]?.();
   },

   handleKeydown(e) {
      if (e.key === 'Escape') {
         if (document.getElementById('lightbox')?.classList.contains('visible')) return ui.closeLightbox();
         if (document.getElementById('confirm-modal')?.classList.contains('visible')) return ui.hideConfirm();
         if (document.getElementById('cart-sidebar')?.classList.contains('open')) return this.toggleCart();
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card[data-action]')) {
         e.preventDefault();
         e.target.closest('.card[data-action]').click();
         return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
         this.handleArrowNav(e);
      }
   },

   handleArrowNav(e) {
      const focused = document.activeElement;
      if (!focused?.classList.contains('card')) return;
      const grid = focused.closest('.grid');
      if (!grid) return;

      const cards = [...grid.querySelectorAll('.card')];
      const idx = cards.indexOf(focused);
      if (idx === -1) return;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;

      const moves = {
         ArrowRight: Math.min(idx + 1, cards.length - 1),
         ArrowLeft:  Math.max(idx - 1, 0),
         ArrowDown:  Math.min(idx + cols, cards.length - 1),
         ArrowUp:    Math.max(idx - cols, 0),
         Home: 0,
         End: cards.length - 1,
      };
      const next = moves[e.key];
      if (next != null && next !== idx) {
         e.preventDefault();
         cards[next].focus();
      }
   },

   handleScroll() {
      state.scrollPositions[state.currentView] = window.scrollY;
      document.getElementById('scroll-top-btn')?.classList.toggle('visible', window.scrollY > 400);
   },

   // ── Routing ───────────────────────────────────────────
   navigate(path) {
      state.scrollPositions[state.currentView] = window.scrollY;
      window.location.hash = path;
   },

   /** Navigate up the view hierarchy — works even on a freshly opened deep link. */
   goBack() {
      if (state.currentView === 'options' && state.selectedTheme) this.navigate(`/theme/${state.selectedTheme}`);
      else this.navigate('/');
   },

   _direction(newView) {
      return this._viewOrder.indexOf(newView) >= this._viewOrder.indexOf(state.currentView) ? 'forward' : 'back';
   },

   handleRoute() {
      if (!state.catalog) return;
      const parts = decodeURIComponent(window.location.hash.slice(1) || '/').split('/').filter(Boolean);

      if (parts[0] === 'theme' && parts.length >= 2) {
         const theme = findTheme(parts[1]);
         if (!theme) return this.showThemes();
         state.selectedTheme = parts[1];

         if (parts.length >= 3) {
            const design = findDesign(theme, parts[2]);
            if (!design) return this.navigate(`/theme/${parts[1]}`);
            const dir = this._direction('options');
            state.selectedDesign = parts[2];
            state.currentView = 'options';
            ui.renderOptions(theme, design);
            ui.showView('options', dir);
         } else {
            const dir = this._direction('designs');
            state.selectedDesign = null;
            state.currentView = 'designs';
            ui.renderDesigns(theme);
            ui.showView('designs', dir);
         }
      } else {
         this.showThemes();
      }

      const saved = state.scrollPositions[state.currentView] || 0;
      requestAnimationFrame(() => window.scrollTo(0, saved));
   },

   showThemes() {
      const dir = this._direction('themes');
      state.selectedTheme = null;
      state.selectedDesign = null;
      state.currentView = 'themes';
      this.applySearch();           // re-apply active query so results survive back-nav
      ui.showView('themes', dir);
   },

   // ── Theme / Cart toggles ──────────────────────────────
   toggleTheme() {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('ptr-theme', next);
   },

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
      state.searchQuery = query.trim().toLowerCase();
      if (state.currentView === 'themes') this.applySearch();
   },

   applySearch() {
      const q = state.searchQuery;
      if (!q) return ui.renderThemes(state.catalog.themes);

      const matches = [];
      for (const theme of state.catalog.themes) {
         const themeHit = theme.name.toLowerCase().includes(q) || theme.id.toLowerCase().includes(q);
         for (const design of theme.designs) {
            const designHit = design.name.toLowerCase().includes(q) ||
               (design.tags || []).some(t => t.toLowerCase().includes(q));
            if (themeHit || designHit) matches.push({ theme, design });
         }
      }
      ui.renderSearchResults(matches);
   },

   // ── Options controller ────────────────────────────────
   selectSize(size) {
      state.selectedSize = size;
      // If this size has no variant for the current type, snap type to a valid one.
      const design = ui.getCurrentDesign();
      if (design && !findVariant(design, size, state.selectedType)) {
         const alt = design.variants.find(v => v.size === size);
         if (alt) state.selectedType = alt.type;
      }
      this.syncOptionButtons();
   },

   selectType(type) {
      state.selectedType = type;
      const design = ui.getCurrentDesign();
      if (design && !findVariant(design, state.selectedSize, type)) {
         const alt = design.variants.find(v => v.type === type);
         if (alt) state.selectedSize = alt.size;
      }
      this.syncOptionButtons();
   },

   syncOptionButtons() {
      document.querySelectorAll('#size-options .option-btn').forEach(btn => {
         const on = btn.dataset.value === state.selectedSize;
         btn.classList.toggle('active', on);
         btn.setAttribute('aria-checked', on);
      });
      document.querySelectorAll('#type-options .option-btn').forEach(btn => {
         const on = btn.dataset.value === state.selectedType;
         btn.classList.toggle('active', on);
         btn.setAttribute('aria-checked', on);
      });
      ui.updatePreviewThumbnail();
      ui.updateVariantAvailability();
   },

   adjustQty(delta) {
      const input = document.getElementById('quantity-input');
      input.value = Math.max(1, Math.min(99, (parseInt(input.value) || 1) + delta));
   },

   clampQuantity(input) {
      let v = parseInt(input.value);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 99) v = 99;
      input.value = v;
   },

   addToCart() {
      const theme = findTheme(state.selectedTheme);
      const design = findDesign(theme, state.selectedDesign);
      const variant = findVariant(design, state.selectedSize, state.selectedType);
      if (!variant) return ui.showToast('Selected variant not available', 'error');

      const qty = Math.max(1, Math.min(99, parseInt(document.getElementById('quantity-input').value) || 1));
      cart.add({
         themeId: theme.id, themeName: theme.name,
         designId: design.id, designName: design.name,
         size: state.selectedSize, type: state.selectedType, qty,
         file: variant.file,
         thumbnail: variant.thumbnail || design.thumbnail
      });
   }
};

document.addEventListener('DOMContentLoaded', () => app.init());
