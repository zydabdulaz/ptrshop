/**
 * Shared utilities.
 */

/** Escape HTML for safe interpolation into markup, including quoted attributes. */
export function esc(str) {
   return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/** Trailing-edge debounce. */
export function debounce(fn, wait = 200) {
   let t;
   return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
   };
}

/** Load an external script once; resolves when ready, rejects on error. */
const _loaded = new Map();
export function loadScriptOnce(src) {
   if (_loaded.has(src)) return _loaded.get(src);
   const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
   });
   _loaded.set(src, p);
   return p;
}
