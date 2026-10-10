# Arena.ai chat exporter (Tampermonkey userscript)

Source of truth: `src/exporter.template.js`. The shipped userscript is built from it:

    npm install
    node tools/build-version.mjs            # builds Arena.ai - LMSYS Arena Chat Exporter-<version>.user.js
    node tools/build-version.mjs --check    # fails if the shipped file is stale
    node tests/exporter.test.mjs            # jsdom test suite (50 checks)

Install `Arena.ai - LMSYS Arena Chat Exporter-2.4.1.user.js` in Tampermonkey.
`2.4.0` is kept as the rollback copy.

## 2.4.1 (this change)

Found by running 2.4.0 against the agent chats in the 2026-10-10 export and against
8 Firefox "save page" copies of agent chats:

- **Uploads were invisible in the TXT.** 19 files attached by the user across 6 agent
  chats (text, markdown, PDF) were recorded only in `metadata.uploads`. A message holding
  only an upload was written as `(empty)`. The TXT now lists each attachment with its name,
  type and size, marked "file not downloaded". The JSON already had the metadata.
- **Agent messages had no time in the TXT** when Arena sends no `createdAt`, although
  `metadata.timing.completedAt` is there. The TXT now falls back to completion time.

Checked and unchanged: the JSON for the 8 saved agent chats is identical to 2.4.0 except
for `exportedAt`. Message IDs and text parts match the ground-truth chats.

## Known limits (not fixed here)

- Uploaded file contents are not downloaded (only their names and sizes).
- Titles from Arena's history list are cut at about 100 characters by Arena itself.
- Failed and stopped answers are still not marked in the TXT.
- Pagination of an agent transcript (`hasMore`) is not checked or warned about.
- `web_search` results and `ask_user` answers are written as escaped JSON in the TXT.
