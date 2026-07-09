/**
 * Catalog state + data loading + lookups.
 * Single source of truth for app state, imported by the other modules
 * (keeps dependencies one-directional: app → cart → ui → catalog → utils).
 */

export const state = {
   catalog: null,
   currentView: 'themes',
   selectedTheme: null,
   selectedDesign: null,
   selectedSize: null,
   selectedType: null,
   searchQuery: '',
   scrollPositions: {},
   navDirection: 'forward'
};

// ── Lookups ─────────────────────────────────────────────
export const findTheme = (id) => state.catalog?.themes.find(t => t.id === id) || null;
export const findDesign = (theme, id) => theme?.designs.find(d => d.id === id) || null;
export const findVariant = (design, size, type) =>
   design?.variants.find(v => v.size === size && v.type === type) || null;

/** Fetch and parse catalog.json. Throws on network/parse failure. */
export async function loadCatalog() {
   const response = await fetch('data/catalog.json');
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   state.catalog = await response.json();
   return state.catalog;
}
