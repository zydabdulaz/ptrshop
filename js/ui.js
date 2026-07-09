/**
 * UI Module — DOM rendering + overlays (toast, confirm, lightbox).
 * All dynamic values pass through esc() before hitting markup.
 */
import { esc } from './utils.js';
import { state, findTheme, findDesign } from './catalog.js';

const TYPE_NAMES = { KN: 'Kotak Nama', PLS: 'Polos' };
export const formatType = (type) => TYPE_NAMES[type] || type;

let currentDesign = null;
export const getCurrentDesign = () => currentDesign;

// ── Theme Rendering ────────────────────────────────────
export function renderThemes(themes) {
   const grid = document.getElementById('themes-grid');

   if (!themes.length) {
      grid.innerHTML = emptyState('No themes found', 'Try a different search term');
      return;
   }

   grid.innerHTML = themes.map(theme => `
      <article class="card theme-card" data-action="select-theme" data-id="${esc(theme.id)}"
               tabindex="0" role="button" aria-label="Browse ${esc(theme.name)} designs">
         ${cardImage(theme.thumbnail, theme.name, `${theme.designs.length} design${theme.designs.length !== 1 ? 's' : ''}`)}
         <div class="card-body">
            <h3 class="card-title">${esc(theme.name)}</h3>
            <p class="card-subtitle">Click to explore</p>
         </div>
      </article>
   `).join('');

   staggerCards(grid);
}

// ── Design Rendering ───────────────────────────────────
export function renderDesigns(theme) {
   const grid = document.getElementById('designs-grid');
   document.getElementById('designs-title').textContent = theme.name;

   grid.innerHTML = theme.designs.map(design => `
      <article class="card design-card" data-action="select-design" data-id="${esc(design.id)}"
               tabindex="0" role="button" aria-label="Configure ${esc(design.name)}">
         ${cardImage(design.thumbnail, design.name, `${design.variants.length} variant${design.variants.length !== 1 ? 's' : ''}`)}
         <div class="card-body">
            <h3 class="card-title">${esc(design.name)}</h3>
            <p class="card-subtitle">${esc(variantSummary(design.variants))}</p>
         </div>
      </article>
   `).join('');

   staggerCards(grid);
}

// ── Global Search Results ──────────────────────────────
/** matches: array of { theme, design }. Cards navigate straight to options. */
export function renderSearchResults(matches) {
   const grid = document.getElementById('themes-grid');

   if (!matches.length) {
      grid.innerHTML = emptyState('No matches found', 'Try a different search term');
      return;
   }

   grid.innerHTML = matches.map(({ theme, design }) => `
      <article class="card design-card" data-action="select-search-result"
               data-theme-id="${esc(theme.id)}" data-id="${esc(design.id)}"
               tabindex="0" role="button" aria-label="Configure ${esc(design.name)} from ${esc(theme.name)}">
         ${cardImage(design.thumbnail, design.name, esc(theme.name))}
         <div class="card-body">
            <h3 class="card-title">${esc(design.name)}</h3>
            <p class="card-subtitle">${esc(theme.name)} · ${esc(variantSummary(design.variants))}</p>
         </div>
      </article>
   `).join('');

   staggerCards(grid);
}

function cardImage(src, name, badge) {
   return `
      <div class="card-image">
         <img src="${esc(src)}" alt="${esc(name)} preview" loading="lazy" onerror="this.style.display='none'">
         <span class="card-badge">${esc(badge)}</span>
      </div>`;
}

function variantSummary(variants) {
   const sizes = [...new Set(variants.map(v => v.size))];
   const types = [...new Set(variants.map(v => v.type))];
   return `${sizes.join(', ')} · ${types.map(formatType).join(', ')}`;
}

// ── Options Rendering ──────────────────────────────────
export function renderOptions(theme, design) {
   const preview = document.getElementById('options-preview-img');
   const sizeContainer = document.getElementById('size-options');
   const typeContainer = document.getElementById('type-options');

   currentDesign = design;
   document.getElementById('options-title').textContent = design.name;
   preview.src = design.thumbnail;
   preview.alt = design.name;

   const sizes = [...new Set(design.variants.map(v => v.size))];
   const types = [...new Set(design.variants.map(v => v.type))];

   // Default to a real, existing variant combo (not sizes[0]+types[0], which may not exist).
   const first = design.variants[0];
   state.selectedSize = first.size;
   state.selectedType = first.type;

   sizeContainer.innerHTML = sizes.map(size => optionBtn('select-size', size, size, size === first.size)).join('');
   typeContainer.innerHTML = types.map(type => optionBtn('select-type', type, formatType(type), type === first.type)).join('');

   document.getElementById('quantity-input').value = 1;
   updatePreviewThumbnail();
   updateVariantAvailability();
}

function optionBtn(action, value, label, active) {
   return `
      <button class="option-btn ${active ? 'active' : ''}" data-action="${action}" data-value="${esc(value)}"
              role="radio" aria-checked="${active}" tabindex="0">${esc(label)}</button>`;
}

export function updatePreviewThumbnail() {
   if (!currentDesign) return;
   const v = currentDesign.variants.find(v => v.size === state.selectedSize && v.type === state.selectedType);
   if (v) document.getElementById('options-preview-img').src = v.thumbnail || currentDesign.thumbnail;
}

/**
 * Cross-filter availability: mark size/type buttons with no matching variant as
 * unavailable, and disable Add to Cart when the exact combo doesn't exist.
 */
export function updateVariantAvailability() {
   if (!currentDesign) return;
   const { selectedSize, selectedType } = state;
   const variants = currentDesign.variants;

   const availTypes = new Set(variants.filter(v => v.size === selectedSize).map(v => v.type));
   const availSizes = new Set(variants.filter(v => v.type === selectedType).map(v => v.size));

   document.querySelectorAll('#type-options .option-btn').forEach(btn =>
      btn.classList.toggle('unavailable', !availTypes.has(btn.dataset.value)));
   document.querySelectorAll('#size-options .option-btn').forEach(btn =>
      btn.classList.toggle('unavailable', !availSizes.has(btn.dataset.value)));

   const exact = variants.some(v => v.size === selectedSize && v.type === selectedType);
   const addBtn = document.querySelector('[data-action="add-to-cart"]');
   if (addBtn) addBtn.disabled = !exact;
}

// ── Breadcrumb ─────────────────────────────────────────
export function updateBreadcrumb() {
   const { currentView, selectedTheme, selectedDesign } = state;
   let html = `<span class="breadcrumb-item"><a href="#/" class="breadcrumb-link" data-action="go-home">Home</a></span>`;

   if (currentView !== 'themes' && selectedTheme) {
      const theme = findTheme(selectedTheme);
      if (theme) html += `<span class="breadcrumb-item">
         <a href="#/theme/${esc(theme.id)}" class="breadcrumb-link" data-action="select-theme" data-id="${esc(theme.id)}">${esc(theme.name)}</a>
      </span>`;
   }
   if (currentView === 'options' && selectedDesign) {
      const design = findDesign(findTheme(selectedTheme), selectedDesign);
      if (design) html += `<span class="breadcrumb-item">${esc(design.name)}</span>`;
   }
   document.getElementById('breadcrumb').innerHTML = html;
}

// ── View Management ────────────────────────────────────
export function showView(viewName, direction = 'forward') {
   document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'slide-left'));
   const target = document.getElementById(`view-${viewName}`);
   if (direction === 'back') target.classList.add('slide-left');
   target.classList.add('active');

   updateBreadcrumb();
   requestAnimationFrame(() => {
      if (viewName === 'themes') target.querySelector('.search-input')?.focus({ preventScroll: true });
      else target.querySelector('.card')?.focus({ preventScroll: true });
   });
}

// ── Staggered Card Entrance ────────────────────────────
let _staggerGen = 0;
function staggerCards(grid) {
   const gen = ++_staggerGen; // invalidate cleanup from any prior render
   const cards = grid.querySelectorAll('.card');
   cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 60}ms`;
      card.classList.add('stagger-in');
   });
   setTimeout(() => {
      if (gen !== _staggerGen) return; // a newer render superseded us
      cards.forEach(card => {
         card.classList.remove('stagger-in');
         card.style.animationDelay = '';
      });
   }, cards.length * 60 + 500);
}

// ── Overlays: focus-return helper ──────────────────────
let _lastFocus = null;
const rememberFocus = () => { _lastFocus = document.activeElement; };
const restoreFocus = () => { _lastFocus?.focus?.(); _lastFocus = null; };

// ── Lightbox ───────────────────────────────────────────
export function openLightbox(src) {
   if (!src) return;
   rememberFocus();
   document.getElementById('lightbox-img').src = src;
   document.getElementById('lightbox').classList.add('visible');
   document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
   document.getElementById('lightbox').classList.remove('visible');
   if (!document.getElementById('cart-sidebar')?.classList.contains('open')) {
      document.body.style.overflow = '';
   }
   restoreFocus();
}

// ── Confirm Modal ──────────────────────────────────────
export function showConfirm(title, message) {
   rememberFocus();
   document.getElementById('confirm-title').textContent = title;
   document.getElementById('confirm-message').textContent = message;
   document.getElementById('confirm-modal').classList.add('visible');
   document.querySelector('#confirm-modal .btn-danger')?.focus();
}

export function hideConfirm() {
   document.getElementById('confirm-modal').classList.remove('visible');
   restoreFocus();
}

// ── Toast Notifications ────────────────────────────────
const TOAST_ICONS = {
   success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
   error:   '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
   warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
};

export function showToast(message, type = 'success') {
   const container = document.getElementById('toast-container');

   // Cap the visible stack; drop the oldest.
   while (container.children.length >= 3) container.firstElementChild.remove();

   const toast = document.createElement('div');
   toast.className = `toast toast-${type}`;
   toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         ${TOAST_ICONS[type] || TOAST_ICONS.success}
      </svg>
      <span>${esc(message)}</span>`;
   container.appendChild(toast);

   setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
   }, 3000);
}

function emptyState(title, sub) {
   return `
      <div class="empty-state">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
         </svg>
         <p>${esc(title)}</p>
         <small>${esc(sub)}</small>
      </div>`;
}
