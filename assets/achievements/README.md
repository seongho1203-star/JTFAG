# JTFAG illustrated badges and trophies

The original six `v1/*.webp` atlases contain the illustrated designs:
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
coordinates and matching service-worker image URLs. Bump the cache version when
replacing an existing URL; a new URL can reuse the existing image cache.

## Butterfly correction

The user uses a butterfly as the JTFAG birdie symbol. The static transparent
`v2/birdie-butterflies.webp` atlas replaces eight bird motifs: first birdie,
multi birdie, triple birdie, back-to-back, the 3/10/30 collector levels, and the
birdie season title.
The collection, detail view, level ladder and unlock popup share this mapping.
The ninth correction, the humour badge "버디값", uses the matching transparent
`v2/birdie-tax-butterfly.webp` image while retaining its playful style and -1/+2 invoice.
Other badges and trophies retain their original artwork.

Each replacement was edited with the built-in ImageGen tool using the original
medal as reference: preserve the metal, enamel, laurel, jewels, tier and numbers;
replace the bird with a recognizable emerald/gold butterfly with four wings
and two antennae; render a single full badge on a transparent background with
no caption. The eight standard images are packed into one WebP for shared download and
decoding. The new URL is added to the existing image cache so unchanged `v1`
assets remain reusable. There are still 61 badge illustrations and 10 trophies;
achievement rules and saved records are unchanged.
