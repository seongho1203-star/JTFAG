# JTFAG rank illustrations

The four transparent WebP assets in `v1/` use the approved individual previews:

| Rank index | Name | Asset |
| --- | --- | --- |
| 0 | 독수리 | `eagle.webp` |
| 1 | 매 | `falcon.webp` |
| 2 | 학 | `crane.webp` |
| 3 | 참새 | `sparrow.webp` |

The original dimensions and alpha channels are retained; only image encoding
changes for efficient delivery. `RANK_CONFIG` in `api.js` is the shared source
for summaries, reports, round cards, badge avatars, greeting posters and round
results. `EAGLE_HERO_URL` uses the same eagle in the illustrated coronation.

The early greeting in `index.html` migrates cached rank URLs before displaying
the first frame. The service worker preloads these four versioned images and
removes its older rank-image cache; other caches and league data are unchanged.
