# PTR Shop - Static File Management & Batch Download Tool

A modern, static web application for managing and downloading PDF print files (Book Covers).

## Features

-  📚 **Theme Grid** - Browse themes with visual thumbnails
-  🎨 **Design Grid** - Explore designs within each theme
-  ⚙️ **Options Panel** - Select size, type, and quantity
-  🛒 **Cart System** - Add multiple items to cart
-  📦 **Batch Download** - Download all selected files as ZIP
-  🌓 **Dark/Light Mode** - Toggle between themes
-  📱 **Responsive Design** - Works on all devices

## Project Structure

```
PTRShop/
├── index.html              # Main entry point
├── admin.html              # Catalog tag editor (operator tool, /admin.html)
├── css/
│   ├── style.css           # Styling with CSS variables
│   └── admin.css           # Tag-editor styles
├── js/                     # ES modules (app.js is the entry)
│   ├── app.js              # Init, routing, events, options controller
│   ├── catalog.js          # State, catalog load & lookups
│   ├── ui.js               # Rendering + overlays (toast/modal/lightbox)
│   ├── cart.js             # Cart, persistence & batch download
│   ├── utils.js            # esc / debounce / script loader
│   └── admin.js            # Tag-editor logic
├── data/
│   └── catalog.json        # Product catalog data
├── files/                  # PDF files (organized by theme/design)
│   └── [theme]/
│       └── [design]/
│           └── *.pdf
└── tools/
    └── indexer.py          # Auto-generate catalog.json
```

## Quick Start

1. **Run locally**:

   ```bash
   cd PTRShop
   python -m http.server 8080
   ```

   Open http://localhost:8080

2. **Deploy to GitHub Pages**:
   -  Push to GitHub repository
   -  Enable GitHub Pages in Settings → Pages
   -  Select branch and root folder

## Adding New PDFs

1. Create folder structure:

   ```
   files/
     [theme-name]/
       thumb.jpg                          # Theme thumbnail
       [theme]_[design]_[type].pdf        # PDF files
   ```

2. Run the indexer to update catalog:
   ```bash
   python tools/indexer.py
   ```

## Editing Search Tags

Open `admin.html` (e.g. http://localhost:8080/admin.html), add/remove tags per
design, then click **Export catalog.json** and replace `data/catalog.json` with
the downloaded file. Edits are auto-saved to a local draft until you export.
Tags survive re-running the indexer.

### Filename Pattern

`{theme-folder}_{design}_{size}_{type}.pdf`

Examples:

-  `dream-pastel_design01_A4_PLS.pdf`
-  `dream-pastel_design01_A4_KN.pdf`
-  `midnight-bloom_design02_A5_PLS.pdf`

## Tech Stack

-  HTML5, CSS3 (Vanilla)
-  JavaScript (ES6+, Vanilla)
-  [JSZip](https://stuk.github.io/jszip/) for batch downloads
-  Python 3.x for indexing

## License

MIT License
