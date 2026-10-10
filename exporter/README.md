# Arena.ai chat exporter (Tampermonkey)

**Install:** `Arena.ai - LMSYS Arena Chat Exporter-2.4.2.user.js`. This repository also keeps the exact upstream **2.4.0** userscript as a rollback copy (SHA-256 `239a572c24052eae84fd10726e2e65897b51944ebca208390a1a2103f47e5e4b`). The source of the new release is `src/exporter.template.js`; do not edit the generated userscript directly.

## Why 2.4.2?

2.4.1, imported from another branch of this repository, already fixed two TXT omissions found against the October 10 exports: user-upload metadata (19 files across six agent chats) and agent message completion times when `createdAt` is absent. 2.4.0 was not overwritten.

2.4.2 adds:

- **Status in evaluation TXT:** `failed`, `stopped`, and `flagged` messages now have a `Status` line, including `failureReason` where available. JSON already contained this data; the JSON export now also warns if an assistant generation is not successful.
- **Agent transcript completeness warnings:** if Arena supplies `pagination.hasMore: true`, JSON/TXT and the batch manifest warn that more pages *may* be available. This is not proof of a missing turn, and the exporter does **not** fetch further pages. Messages with `metadata.pending: true` are marked too.
- **Conversation identity guard:** do not export an evaluation response or agent Flight payload under a different requested chat's ID. This prevents a sidebar/prefetch transcript from silently being filed as the requested agent chat. If Arena changes its Flight format to omit identity, the export now fails visibly rather than guessing.
- **Batch atomicity for formatting:** compute JSON and TXT for a chat before writing either into its ZIP, so a formatter error in the second format cannot strand an unreported first-format entry.
- **Safe ZIP Unicode handling:** if `TextEncoder` is unavailable, refuse a ZIP rather than use the embedded compression library's lossy legacy Unicode fallback. Current Firefox exposes `TextEncoder`; individual JSON/TXT downloads still work without it.

## What was actually tested

- `bash tools/ci.sh`: 59/59 checks on 2.4.2; 47/47 on unmodified 2.4.0; every script parses and the 2.4.2 build matches its source. The test harness supplies `TextEncoder`, as a real browser does; otherwise jsdom would falsely corrupt emoji during ZIP creation.
- Eight Firefox saved **agent** pages in `Downloads.z01`–`.z03` + `Downloads.zip` replayed through the actual script: **8/8** match the independent archived JSON exports for full message/part content and pagination; no `session.publicAccessToken` was exported. The pages comprise 68 messages and 2,927 parts. This is an offline check, not a live Arena request.
- Offline batch replay of **193 regular chats**: 193 successful JSON+TXT pairs, **0 changes in exported evaluation records**, no missing chats or regressions against an evaluation-only list. Status labels and warnings are intended additions outside those records.

To repeat the agent-page check without copying sensitive saved pages into Git:

```bash
# From the repository root, after installing dependencies (`cd exporter && npm ci`).
zip -s 0 Downloads.zip --out /tmp/arena-unsplit.zip >/dev/null
python3 - <<'PY'
import zipfile, os
with zipfile.ZipFile('/tmp/arena-unsplit.zip') as z:
    for name in z.namelist():
        if name.endswith('.htm') and '_files/' not in name:
            path = '/tmp/arena-pages/' + name
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f: f.write(z.read(name))
PY
mkdir -p /tmp/arena-older-chats
git fetch origin 'refs/heads/arena/6b35b122-all-chats-for-real-now:refs/remotes/origin/arena/6b35b122-all-chats-for-real-now'
git archive origin/arena/6b35b122-all-chats-for-real-now chats | tar -x -C /tmp/arena-older-chats
node exporter/tests/dom-replay.mjs /tmp/arena-pages /tmp/arena-older-chats/chats
```

`cd exporter && npm ci && bash tools/ci.sh` runs the synthetic regression tests. `tests/e2e-replay.mjs` and `tools/audit_export.py` support a larger offline batch comparison.

## Limits / safety

This does not retrieve file binaries, omitted `fetch_page` chunks, unread `read_file` lines, or additional agent transcript pages. Keep the **JSON** as your primary archive and the **TXT** for reading. Only a fresh export from your live account can verify that the site's current response shape still works.

**Privacy:** Firefox saved pages may embed Arena `publicAccessToken` values and unrelated sidebar/account data. The offline checker reads them locally and prints only IDs/counts; do not publish parsed raw Flight payloads or tokens. The agent JSON exporter removes `session.publicAccessToken`, but that does not sanitize the original saved `.htm` archives already in this repository.
