# Future Skills Radar — deployment notes

Spec §16. **Documentation only: nothing has been deployed and nothing paid.** Any host, plan or paid service is put
to the owner with its price first and waits for a yes.

## 1. What runs

- **One long-running Node.js 24 process** (Render or Railway class, D8). The app needs Node ≥ 22.12; it was built and
  tested on Node 24.
- Start command: `npm start` (runs `node --env-file-if-exists=.env server/index.js`). Port from `PORT` (default 3200).
- **Run a single instance.** The Radar is written for one process:
  - the admin refresh limit (once per 5 minutes per source), the sign-in limit (10 per 15 minutes per address), the
    demo limit (30 changes per minute per session) and the view cache live in that process's memory;
  - signing out ends a session only in the process that received the sign-out;
  - publishing is safe across instances (conditional writes on `prod/active.json`; the loser gets `publish_conflict`),
    and orphan cleanup keeps anything stamped within **10 minutes** of the active manifest's time, to allow for clock
    differences and a publish still running elsewhere. With two instances, a cleanup can still meet the other
    instance's work in progress and report errors; with one instance this does not happen.
- No build step. `npm ci --omit=dev` installs only `express` and `pdfjs-dist`.

## 2. Behind the host's proxy

- Set **`TRUST_PROXY=1`** (one proxy hop), so the per-visitor limits see each visitor's address and not the proxy's.
- **The proxy must pass the real host name.** Admin and judge changes check that the browser's `Origin` matches the
  host the request was sent to (CSRF protection, spec §8.1). Express reads that host from `X-Forwarded-Host` (with
  `TRUST_PROXY` set) or `Host`. If the proxy rewrites `Host` to an internal name and drops `X-Forwarded-Host`, every
  admin and judge change fails with `csrf_failed`. Hosts of the Render or Railway class normally pass the public host;
  check it once after the first deploy by signing in to `#admin` and making one decision (step 6 in §8).
- Serve over **HTTPS only**. The `fr_radar` cookie is `Secure; HttpOnly; SameSite=Strict`; over plain HTTP on a public
  name the browser will not send it back.

## 3. Secrets (host's secret settings; never in the repo, the browser, URLs or logs)

| Setting | Needed for | Rule |
|---|---|---|
| `RADAR_ADMIN_KEY` | Admin sign-in (`#admin`) | Long random value. **Must differ from `RADAR_DEMO_KEY`**: if both are the same, both roles answer `not_configured` |
| `RADAR_DEMO_KEY` | Judge sign-in (`#judge`) | Long random value, given only to judges |
| `RADAR_SESSION_SECRET` | Signs admin and judge session cookies (HMAC-SHA256) | **At least 32 bytes**; shorter → admin and judge answer `not_configured`. Changing it ends every session |
| `OPENALEX_API_KEY` | Admin "Refresh OpenAlex" when deployed | Free key from OpenAlex. With `NODE_ENV=production` and no key, refresh answers `openalex_key_missing`; the bundled/stored data keeps being served |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Durable Radar state (and the CV module's temporary CV copy) | Without them the Radar is read-only (see §4) |
| `NODE_ENV=production` | Deployed mode | Refuses `RADAR_STORE=memory` and requires the OpenAlex key for refresh |
| `TRUST_PROXY=1` | Behind the host's proxy | See §2 |

- A missing secret makes only that role fail closed (`not_configured`); the public Radar keeps working.
- Rotating a key: change `RADAR_ADMIN_KEY` or `RADAR_DEMO_KEY` and restart. The key version changes, so old sessions
  of that role end.
- **Never set `RADAR_STORE=memory` on a deployed server.** It is for local development only (writes are lost on
  restart, and screens say "Development store — not durable"); with `NODE_ENV=production` it is refused.

## 4. Storage modes

| Settings | What the Radar does |
|---|---|
| No R2 | Serves the bundled data in `data/radar/bundle/` read-only (`servedFrom: bundled_read_only`). Refresh, mapping approval, break review and judge sessions answer "not available on this server" |
| R2 set | First request: copies every bundled object to `prod/` in the bucket, reads each back to check it, then activates the bundled manifest with a conditional write. After that it serves `prod/` (`servedFrom: active_manifest`). Admin and judge features work |
| R2 set but unreachable | Serves the last good version this process read (`cached_fallback`), else the bundled data; the status says refresh `failed` / `store_unavailable` |

**Judge sessions need a durable store (R2).** Their expiry (2 hours) is checked on every request against the stored
`expiresAt`, so it works after a restart or a sleeping host. Without R2 the judge screen answers `not_configured`.

## 5. R2 layout

One bucket, shared with the CV module.

```
cv-temp/<extractionId>                     CV module: temporary CV copy (1-day lifecycle rule)
prod/active.json                           the only mutable object: {manifestId, activatedAt}, written conditionally
prod/manifests/<manifestId>.json           immutable manifests (snapshot ids, signals id, versions, previousManifestId)
prod/snapshots/openalex/<snapshotId>.json  immutable source snapshots
prod/snapshots/dosm/<snapshotId>.json
prod/originals/<source>/<sha256>           original downloads (e.g. the DOSM workbook), named by their hash
prod/signals/<signalsId>.json              radar-signal/v1 signals for a manifest
prod/reviews/<reviewId>.json               admin decisions (field ↔ topic, break reviews), immutable, newest wins
prod/ingest-log/<id>.json                  ingestion log: time, source, operation, outcome, code, ids
demo/<sessionId>/session.json, state.json  judge sessions (synthetic data only), deleted on expiry
```

- **The 1-day lifecycle rule must cover only `cv-temp/`.** A rule on the whole bucket would delete the Radar's state.
- Keys are built only by server code. A judge session can only touch its own `demo/<sessionId>/` folder.
- Originals are never deleted by the cleanup (their names carry no time stamp). They are small; remove old ones by
  hand only if needed and only if no kept manifest refers to them.

## 6. Backups

1. **Owner decisions (most important):** in `#admin`, "Export approved decisions" downloads the approved mappings and
   reviews as JSON. Commit that file to the repo after each review session, so the decisions survive even if the
   bucket is lost.
2. **Data versions:** copy `prod/manifests/`, `prod/snapshots/`, `prod/originals/`, `prod/signals/`, `prod/reviews/`
   and `prod/active.json` to another location (for example a second bucket or a local folder with `rclone`/`aws s3
   sync` against the R2 endpoint). Everything except `active.json` is immutable, so an incremental copy is enough.
3. `demo/` and `prod/ingest-log/` do not need backups.

## 7. Recovery

- **A bad refresh was published:** every manifest keeps `previousManifestId`. Write `prod/active.json` back to
  `{"manifestId": "<previous id>", "activatedAt": "<now, ISO time>"}` (from the R2 console or a copy tool). The app
  reads `active.json` on each request and caches views by manifest id, so the older version is served at once.
- **The bucket is lost or damaged:** empty `prod/` (or point at a new bucket) and restart. On the first request the app
  seeds `prod/` again from the bundled data in `data/radar/bundle/`. Then re-apply the owner's decisions from the last
  committed export (or copy `prod/reviews/` back from the backup).
- **R2 is down:** nothing to do; the app serves the last good version (or the bundled data) read-only until R2
  answers again.

## 8. First deployment checklist (each step needs the owner's approval)

1. Owner picks a host and plan after seeing the price. Nothing is created before that.
2. Create the R2 bucket (free allowance) and token; add the `cv-temp/` lifecycle rule.
3. Set the secrets in §3 (two different keys, a session secret of 32+ bytes, the OpenAlex key, R2, `TRUST_PROXY=1`,
   `NODE_ENV=production`).
4. Deploy one instance with `npm start`.
5. Open the Radar once: the log shows `seeded prod from the bundle: <manifest id>`.
6. Sign in to `#admin`, press "Reload" and make one decision, to check the proxy passes the host (no `csrf_failed`).
7. Real-R2 check of conditional writes (spec §7, owner action 3): one admin decision publishes a new manifest; the
   status shows Conflicts 0 and the new active manifest id.
