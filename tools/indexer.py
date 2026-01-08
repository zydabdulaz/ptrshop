#!/usr/bin/env python3
"""
PTR Shop - PDF Catalog Indexer
Scans the files/ directory and generates catalog.json

Usage: python tools/indexer.py

Expected folder structure:
files/
  [theme]/
    thumb.jpg                              <- Theme thumbnail
    [design]/                              <- Design subfolder (e.g., 01, 02)
      [theme]_[design]_[size]_[type].pdf   <- PDF file
      [theme]_[design]_[size]_[type].jpg   <- Matching thumbnail

Example:
files/
  DP/
    thumb.jpg                   <- Theme thumbnail (fallback)
    01/
      DP_01_A5_PLS.pdf          <- PDF variant
      DP_01_A5_PLS.jpg          <- Variant thumbnail
      DP_01_A5_KN.pdf
      DP_01_A5_KN.jpg
    02/
      DP_02_A4_PLS.pdf
      DP_02_A4_PLS.jpg
"""

import os
import json
import re
from pathlib import Path

# Configuration
FILES_DIR = Path(__file__).parent.parent / "files"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "catalog.json"

def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text

def parse_pdf_filename(filename: str, theme_name: str) -> dict | None:
    """
    Parse PDF filename to extract design, size and type.
    Expected format: {theme}_{design}_{size}_{type}.pdf
    Example: DP_01_A4_PLS.pdf
    """
    # Pattern: theme_design_size_type.pdf
    pattern = rf'^{re.escape(theme_name)}_([A-Za-z0-9-]+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)\.pdf$'
    match = re.match(pattern, filename, re.IGNORECASE)
    if match:
        return {
            "design": match.group(1),
            "size": match.group(2).upper(),
            "type": match.group(3).upper()
        }
    return None

def format_design_name(design_id: str) -> str:
    """Convert design ID to display name."""
    # Handle numeric IDs like "01" -> "Design 01"
    if design_id.isdigit():
        return f"Design {design_id}"
    return f"Design {design_id.upper()}"

def scan_files_directory() -> dict:
    """Scan the files directory and build catalog structure."""
    catalog = {"themes": []}
    
    if not FILES_DIR.exists():
        print(f"Warning: Files directory not found: {FILES_DIR}")
        print("Creating empty catalog...")
        return catalog
    
    # Scan themes (top-level folders)
    for theme_dir in sorted(FILES_DIR.iterdir()):
        if not theme_dir.is_dir():
            continue
        
        theme_id = slugify(theme_dir.name)
        theme = {
            "id": theme_id,
            "name": theme_dir.name.upper(),  # Keep original name
            "thumbnail": f"files/{theme_dir.name}/thumb.jpg",
            "designs": []
        }
        
        # Check for theme thumbnail
        thumb_path = theme_dir / "thumb.jpg"
        if not thumb_path.exists():
            for ext in [".png", ".webp", ".jpeg", ".JPG", ".PNG"]:
                alt_thumb = theme_dir / f"thumb{ext}"
                if alt_thumb.exists():
                    theme["thumbnail"] = f"files/{theme_dir.name}/thumb{ext}"
                    break
        
        # Scan design subfolders
        for design_dir in sorted(theme_dir.iterdir()):
            if not design_dir.is_dir():
                continue
            
            design_id = design_dir.name
            design = {
                "id": slugify(design_id),
                "name": format_design_name(design_id),
                "thumbnail": theme["thumbnail"],  # Use theme thumbnail
                "variants": []
            }
            
            # Check for design-specific thumbnail
            for ext in [".jpg", ".png", ".webp", ".jpeg", ".JPG", ".PNG"]:
                design_thumb = design_dir / f"thumb{ext}"
                if design_thumb.exists():
                    design["thumbnail"] = f"files/{theme_dir.name}/{design_dir.name}/thumb{ext}"
                    break
            
            # Scan PDFs in design folder
            for pdf_file in sorted(design_dir.glob("*.pdf")):
                parsed = parse_pdf_filename(pdf_file.name, theme_dir.name)
                if parsed:
                    # Look for matching thumbnail (same name as PDF but .jpg/.png)
                    pdf_basename = pdf_file.stem  # e.g., DP_01_A5_KN
                    variant_thumb = None
                    
                    for ext in [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"]:
                        thumb_file = design_dir / f"{pdf_basename}{ext}"
                        if thumb_file.exists():
                            variant_thumb = f"files/{theme_dir.name}/{design_dir.name}/{pdf_basename}{ext}"
                            break
                    
                    # Fallback to design thumbnail, then theme thumbnail
                    if not variant_thumb:
                        variant_thumb = design.get("thumbnail", theme["thumbnail"])
                    
                    design["variants"].append({
                        "size": parsed["size"],
                        "type": parsed["type"],
                        "file": f"files/{theme_dir.name}/{design_dir.name}/{pdf_file.name}",
                        "thumbnail": variant_thumb
                    })
                else:
                    print(f"Warning: Could not parse filename: {pdf_file.name}")
            
            # Only add design if it has variants
            if design["variants"]:
                theme["designs"].append(design)
        
        # Only add theme if it has designs
        if theme["designs"]:
            catalog["themes"].append(theme)
    
    return catalog

def main():
    print("PTR Shop - PDF Catalog Indexer")
    print("=" * 40)
    
    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    # Scan and build catalog
    catalog = scan_files_directory()
    
    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=4, ensure_ascii=False)
    
    # Summary
    total_themes = len(catalog["themes"])
    total_designs = sum(len(t["designs"]) for t in catalog["themes"])
    total_variants = sum(
        len(d["variants"]) 
        for t in catalog["themes"] 
        for d in t["designs"]
    )
    
    print(f"\nCatalog generated: {OUTPUT_FILE}")
    print(f"  Themes: {total_themes}")
    print(f"  Designs: {total_designs}")
    print(f"  Variants: {total_variants}")
    print("\nDone!")

if __name__ == "__main__":
    main()
