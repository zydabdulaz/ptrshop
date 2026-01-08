/**
 * App Module - Main application controller
 */
const app = {
    state: {
        catalog: null,
        currentView: 'themes',
        selectedTheme: null,
        selectedDesign: null,
        selectedSize: null,
        selectedType: null
    },

    async init() {
        // Load theme preference
        const savedTheme = localStorage.getItem('ptr-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Initialize cart
        cart.init();
        
        // Load catalog data
        try {
            const response = await fetch('data/catalog.json');
            this.state.catalog = await response.json();
            ui.renderThemes(this.state.catalog.themes);
        } catch (err) {
            console.error('Failed to load catalog:', err);
            ui.showToast('Failed to load catalog data', 'error');
        }
    },

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
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
    },

    goHome() {
        this.state.currentView = 'themes';
        this.state.selectedTheme = null;
        this.state.selectedDesign = null;
        ui.showView('themes');
    },

    goBack() {
        if (this.state.currentView === 'options') {
            this.selectTheme(this.state.selectedTheme);
        } else if (this.state.currentView === 'designs') {
            this.goHome();
        }
    },

    selectTheme(themeId) {
        const theme = this.state.catalog.themes.find(t => t.id === themeId);
        if (!theme) return;
        
        this.state.selectedTheme = themeId;
        this.state.selectedDesign = null;
        this.state.currentView = 'designs';
        
        ui.renderDesigns(theme);
        ui.showView('designs');
    },

    selectDesign(designId) {
        const theme = this.state.catalog.themes.find(t => t.id === this.state.selectedTheme);
        const design = theme?.designs.find(d => d.id === designId);
        if (!design) return;
        
        this.state.selectedDesign = designId;
        this.state.currentView = 'options';
        
        ui.renderOptions(theme, design);
        ui.showView('options');
    },

    selectSize(size) {
        this.state.selectedSize = size;
        document.querySelectorAll('#size-options .option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });
        ui.updatePreviewThumbnail();
    },

    selectType(type) {
        this.state.selectedType = type;
        document.querySelectorAll('#type-options .option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        ui.updatePreviewThumbnail();
    },

    adjustQty(delta) {
        const input = document.getElementById('quantity-input');
        const newVal = Math.max(1, Math.min(99, parseInt(input.value) + delta));
        input.value = newVal;
    },

    addToCart() {
        const { selectedTheme, selectedDesign, selectedSize, selectedType, catalog } = this.state;
        const qty = parseInt(document.getElementById('quantity-input').value) || 1;
        
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
            qty: qty,
            file: variant.file,
            thumbnail: variant.thumbnail || design.thumbnail
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
