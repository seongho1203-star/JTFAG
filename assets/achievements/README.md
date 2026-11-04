# JTFAG illustrated badges and trophies

The six `v1/*.webp` atlases contain the user's approved illustrated designs:
61 badge illustrations (51 badge definitions, with three levels for each of
the five cumulative badges) and 10 season trophies. They retain the original
transparent alpha channels. WebP encoding reduces mobile download size.

`achievement-art.js` maps the existing badge/award IDs to source rectangles.
The inner viewport clips each original illustration without its sheet heading
or caption; the outer square centers it at any display size. The app supplies
accessible names and captions using the existing Korean labels.

The same artwork is used in the collection, detail sheet, cumulative-level
ladder, unlock animation, trophy case, and ceremony. Locked items use grayscale;
earned items show the original colors. No achievement rules or saved records
are changed. The service worker caches these versioned image URLs on first use.

When replacing artwork, use a new version directory and update the atlas
coordinates and matching service-worker image URLs/cache version together.
