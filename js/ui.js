/**
 * UI Module - Handles rendering of views and components
 */
const ui = {
    renderThemes(themes) {
        const grid = document.getElementById('themes-grid');
        grid.innerHTML = themes.map(theme => `
            <article class="card theme-card" data-theme-id="${theme.id}" onclick="app.selectTheme('${theme.id}')">
                <div class="card-image">
                    <img src="${theme.thumbnail}" alt="${theme.name}" loading="lazy">
                    <span class="card-badge">${theme.designs.length} designs</span>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${theme.name}</h3>
                    <p class="card-subtitle">Click to explore</p>
                </div>
            </article>
        `).join('');
    },

    renderDesigns(theme) {
        const grid = document.getElementById('designs-grid');
        const title = document.getElementById('designs-title');
        
        title.textContent = theme.name;
        
        grid.innerHTML = theme.designs.map(design => `
            <article class="card design-card" data-design-id="${design.id}" onclick="app.selectDesign('${design.id}')">
                <div class="card-image">
                    <img src="${design.thumbnail}" alt="${design.name}" loading="lazy">
                    <span class="card-badge">${design.variants.length} variants</span>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${design.name}</h3>
                    <p class="card-subtitle">${this.getVariantSummary(design.variants)}</p>
                </div>
            </article>
        `).join('');
    },

    getVariantSummary(variants) {
        const sizes = [...new Set(variants.map(v => v.size))];
        return sizes.join(', ');
    },

    // Store current design for thumbnail updates
    currentDesign: null,

    renderOptions(theme, design) {
        const title = document.getElementById('options-title');
        const preview = document.getElementById('options-preview-img');
        const sizeContainer = document.getElementById('size-options');
        const typeContainer = document.getElementById('type-options');
        
        // Store design for thumbnail updates
        this.currentDesign = design;
        
        title.textContent = design.name;
        preview.src = design.thumbnail;
        preview.alt = design.name;
        
        // Get unique sizes and types
        const sizes = [...new Set(design.variants.map(v => v.size))];
        const types = [...new Set(design.variants.map(v => v.type))];
        
        // Show size options
        sizeContainer.parentElement.style.display = '';
        sizeContainer.innerHTML = sizes.map((size, i) => `
            <button class="option-btn ${i === 0 ? 'active' : ''}" data-size="${size}" onclick="app.selectSize('${size}')">${size}</button>
        `).join('');
        
        // Render type buttons
        typeContainer.innerHTML = types.map((type, i) => `
            <button class="option-btn ${i === 0 ? 'active' : ''}" data-type="${type}" onclick="app.selectType('${type}')">${this.formatType(type)}</button>
        `).join('');
        
        // Reset quantity
        document.getElementById('quantity-input').value = 1;
        
        // Set initial selection and update thumbnail
        app.state.selectedSize = sizes[0];
        app.state.selectedType = types[0];
        this.updatePreviewThumbnail();
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

    formatType(type) {
        return type.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    },

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        const { currentView, selectedTheme, selectedDesign, catalog } = app.state;
        
        let html = '<span class="breadcrumb-item"><a href="#" class="breadcrumb-link" onclick="app.goHome()">Home</a></span>';
        
        if (currentView !== 'themes' && selectedTheme) {
            const theme = catalog.themes.find(t => t.id === selectedTheme);
            if (theme) {
                html += `<span class="breadcrumb-item"><a href="#" class="breadcrumb-link" onclick="app.selectTheme('${theme.id}')">${theme.name}</a></span>`;
            }
        }
        
        if (currentView === 'options' && selectedDesign) {
            const theme = catalog.themes.find(t => t.id === selectedTheme);
            const design = theme?.designs.find(d => d.id === selectedDesign);
            if (design) {
                html += `<span class="breadcrumb-item">${design.name}</span>`;
            }
        }
        
        breadcrumb.innerHTML = html;
    },

    showView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewName}`).classList.add('active');
        this.updateBreadcrumb();
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>' :
                  type === 'error' ? '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>' :
                  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'}
            </svg>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
