# AGENTS.md — NDX100_Funds_CN

## Quick start

```bash
npm start              # production, http://localhost:4173
npm run dev            # auto-restart on file change (needs Node >=18.17)
npm run check          # syntax check only (no typecheck, no linter)
npm test               # runs `node --test tests/`
```

## Architecture

- **No third-party dependencies** — pure Node.js standard library (ESM, native `fetch`, `node:http`).
- Single-page app: `server.mjs` (HTTP server + East Money API proxy) → `index.html` + `app.js` + `styles.css`.
- Server has two JSON endpoints: `GET /api/funds` and `GET /api/health`.
- Client is vanilla JS (no framework). No build step, no bundler, no TypeScript.

## Serverside quirks

- `server.mjs` uses `node:http` (not Express). No middleware.
- Data sources: `fundmobapi.eastmoney.com` + `fundsuggest.eastmoney.com`. Falls back to 41 hardcoded seed codes when APIs fail.
- In-flight request dedup + 5-min server cache (`CACHE_MS` env var).
- Concurrent batch size = 6, with 180ms delay between batches to avoid rate limiting.
- Path traversal protection: rejects paths outside `__dirname`.

## Important

- `run.bat` is the Windows launcher (not `start.bat` as README says).
- No linter, formatter, typechecker, or CI config exists.
- No tests directory yet; `npm test` will error if `tests/` is empty/missing.
- All text is in Chinese (zh-CN).
