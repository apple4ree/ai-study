# AI study reader — continuation notes

## Goal
Publish the existing Korean AI Engineer textbook as a mobile reader at
https://apple4ree.github.io/ai-study/ using GitHub Pages, main branch, /docs.
Preserve the full textbook; do not replace chapters with interview summaries.

## Source and verification
- Source: content/catalog.json and content/chapters/*.md; UI: src/; assets: public/.
- Build: npm run build. Tests: npm test. Preview: npm run preview.
- Verified on 2026-11-16 (KST): 44 chapters, 515 sections, 37 figures,
  132 solutions, 2,747 math expressions. All 9 tests passed.
- Deployment output is docs/ and must be committed together with source.
- Learning records are browser-local; export/import is available.

## Recovery after interrupted conversations
- Read this file before repeating discovery. Inspect remote main before publishing.
- Original remote main before first app upload:
  c178efdcd950813e3c033a13edef3468fb74efdf (initial README only).
- Repository: apple4ree/ai-study. GitHub connector read/write access verified.
- This local directory initially has no .git metadata; this does not mean the
  GitHub connector is disconnected.
- Deployment progress is recorded in ignored work/deploy-state.json locally.
  Preserve uploaded blob SHAs and reuse them rather than starting over.
- Keep tool results compact. Do not print full chapter bodies, generated
  data.json, base64 assets, or duplicate API response wrappers into chat.
- After upload, verify GitHub Pages settings and the live URL before claiming
  deployment is complete. Update this file with the final commit and live check.

## Current stage
Build and automated checks pass. The complete docs/ deployment and all 44
chapter sources have been uploaded through Chrome's native file chooser.
GitHub Pages is enabled for main /docs. The live URL and hash-table reader
were verified in Chrome on 2026-11-16 (KST). All 9 automated tests passed
after stripping private source links. Final source sync uses the complete
196-path manifest, reusing identical blobs; record its commit in work/deploy-state.json.

## Verified upload recovery (2026-11-16 KST)
- Do not retry the 6,629,811-byte docs/data.json through create_blob. Browser
  upload succeeded and its remote SHA matches the local original:
  4a81a717e0dc9f6d267bba8f8957faa55b14d2dc (superseded by the sanitized build).
- Browser upload URL accepts the target directory directly:
  https://github.com/apple4ree/ai-study/upload/main/<directory>.
- Select actual files in that directory, not a directory path as a file.
- Reuse existing remote blob SHAs for duplicated figures, fonts, and licenses.
  Verify every expected path and SHA with the recursive Git tree before ending.

- Public catalog, export audit, and generated data omit private Notion URLs and
  page identifiers. Keep original source metadata only in ignored work/.

## Reader emphasis (2026-11-16 KST)
- src/emphasis.js decorates reader prose: complexity badges, first-use subject
  terms, and caution phrases. Code blocks, links, and KaTeX trees are excluded.
- Source and rendered text stay identical; keep the full textbook untouched.
- npm run build copies the module to docs/src and refreshes the offline list.
- Offline installation uses network-refresh requests; registration disables
  HTTP-cache reuse for worker updates to avoid stale styling.
- Verified: 9 tests, 390px mobile without horizontal overflow, light and dark
  emphasis contrast above 4.5:1, matching visible prose before/after decoration.
