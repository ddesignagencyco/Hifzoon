# Deploying Hifzoon on Render

The backend is deployed from the repository root with a Render Blueprint
([`render.yaml`](../render.yaml)). It creates four resources, all in **Singapore** on
**starter** compute, tracking the **`dev`** branch:

| Resource         | Type               | Purpose                                 |
| ---------------- | ------------------ | --------------------------------------- |
| `hifzoon-db`     | Render Postgres 16 | Primary database                        |
| `hifzoon-redis`  | Render Key Value   | Cache, BullMQ queues, Socket.IO fan-out |
| `hifzoon-api`    | Web service (Node) | NestJS HTTP API + Socket.IO             |
| `hifzoon-worker` | Background worker  | BullMQ processors and scheduled jobs    |

The Next.js app in `apps/web` is **not** part of this blueprint — deploy it separately
(or add it later). See [Frontend and cookies](#frontend-and-cookies) before pointing a
web app at this API.

---

## 1. Before the first deploy

You need:

- The repository pushed to GitHub with `render.yaml` on the `dev` branch.
- A Render workspace on a paid plan. The free tier sleeps, cannot run a background
  worker or a pre-deploy command, and drops Socket.IO connections.
- A **LiveKit Cloud** project: server URL (`wss://…livekit.cloud`), API key, API secret.
- An **SMTP relay**: host, port, username, password, and a verified `From` address.
- The URL of the web app (for CORS and links in email). It can be set later, but the
  API will reject browser calls until it is correct.
- A **Cloudinary** account for file storage: cloud name, API key, API secret.
  See [Object storage](#object-storage).
- Optional: an S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2, …) only if
  class recording is needed. LiveKit Egress cannot write to Cloudinary.

## 2. Create the Blueprint

1. Render Dashboard → **New** → **Blueprint**.
2. Connect the GitHub repository and choose the **`dev`** branch.
3. Review the resources and click **Apply**.

Render prompts for every variable marked `sync: false`:

| Variable                                                               | What to enter                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `CORS_ORIGINS`                                                         | Web app origin(s), comma-separated, e.g. `https://app.example.com`          |
| `APP_WEB_URL`                                                          | Web app URL used in email links, e.g. `https://app.example.com`             |
| `SEED_PASSWORD`                                                        | Password for the seeded demo accounts (see [Demo accounts](#demo-accounts)) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`                 | SMTP relay credentials and sender, e.g. `Hifzoon <no-reply@example.com>`    |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`                 | LiveKit Cloud project credentials                                           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary storage credentials                                              |

These are generated once per environment and shared by the API and the worker, so do
not set them separately per service:

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, `TOKEN_PEPPER`.

`DATABASE_URL` and `REDIS_URL` are wired from the Render resources automatically.

### SMTP port

The blueprint uses port **587** with `SMTP_SECURE=false` (STARTTLS). If your relay uses
implicit TLS on **465**, change both values in the `hifzoon-shared` environment group:
`SMTP_PORT=465`, `SMTP_SECURE=true`.

## 3. What happens on deploy

For each service Render runs:

```bash
# build (backend workspaces only)
npm ci --workspace @hifzoon/shared --workspace @hifzoon/api --include-workspace-root \
  && npm run db:generate \
  && npm run build

# API and worker, before they start
npm run db:deploy        # prisma migrate deploy
```

On the **first** successful API deploy, `initialDeployHook` runs `npm run db:seed`
once. The seed is idempotent and loads roles, permissions, courses, plans, settings,
CMS content, and the demo accounts.

The API's health check is `GET /api/v1/health/ready`, which checks Postgres and Redis.
Liveness is `GET /api/v1/health/live`. Once green, the API is reachable at:

```
https://hifzoon-api.onrender.com/api/v1
```

(Use the actual service URL from the Render dashboard; it may include a suffix.)

## 4. Demo accounts

`npm run db:seed` creates these accounts. All of them use `SEED_PASSWORD`, or the
development default `Hifzoon!Dev2026` if you left `SEED_PASSWORD` empty.

| Role               | Email                             | Notes                      |
| ------------------ | --------------------------------- | -------------------------- |
| Guardian           | `parent@hifzoon.test`             | Parent portal demo         |
| Teacher            | `teacher@hifzoon.test`            | Cleared, matchable teacher |
| Teacher (trainee)  | `teacher.trainee@hifzoon.test`    | Mid-hiring-pipeline        |
| Super admin        | `superadmin@hifzoon.test`         | Full platform access       |
| Academy admin      | `admin@hifzoon.test`              |                            |
| Quality supervisor | `supervisor@hifzoon.test`         |                            |
| Safeguarding lead  | `safeguarding@hifzoon.test`       |                            |
| External examiner  | `examiner@hifzoon.test`           |                            |
| Supervisor/teacher | `supervisor.teacher@hifzoon.test` | Two roles on one account   |

> **Security.** `superadmin@hifzoon.test` has full access to children's data. Set
> `SEED_PASSWORD` to a strong, unique value on the dashboard, and treat a deployment
> with demo accounts as a staging/demo environment — not the real production launch.
> Remove or rotate the demo accounts before going live.

The seed runs only on the first deploy. Re-running it (for example after changing
`SEED_PASSWORD`) is safe from the Render Shell:

```bash
npm run db:seed
```

Staff accounts are otherwise asked to enrol TOTP. The blueprint sets
`TWO_FACTOR_ENROLMENT_ENFORCED=false` so demo logins work immediately; set it back to
`true` in the `hifzoon-shared` group before a real launch.

To create an additional administrator without the demo password:

```bash
SUPERADMIN_PASSWORD='…' npm run bootstrap:superadmin --workspace @hifzoon/api -- \
  --email you@example.com --name 'Your Name'
```

## 5. LiveKit

1. In LiveKit Cloud, open the project settings and copy the WebSocket URL, API key, and
   secret into the three `LIVEKIT_*` variables.
2. Register the webhook URL so room events reach the API:
   `https://<api-host>/api/v1/webhooks/video`.
3. `LIVEKIT_PUBLIC_URL` is optional — it defaults to `LIVEKIT_URL`, which is correct for
   LiveKit Cloud. Set it separately only if the browser must connect through a different
   address (for example a TURN front end).

Class recording uses LiveKit Egress, which can only write to S3/GCS — not Cloudinary.
Recording therefore needs an additional S3-compatible bucket; see
[Class recording](#class-recording).

## 6. Object storage

Uploads and data-export files are stored in **Cloudinary** through
`apps/api/src/storage/storage.service.ts`. The API creates `authenticated` assets and hands
the browser a signed upload form, so files are never public and the browser never sends
bytes through the API.

You need a Cloudinary account and its **cloud name**, **API key**, and **API secret**
(Dashboard → Settings → API Keys). The blueprint prompts for all three, and the API
refuses to boot in production without them.

How it works:

- `POST /api/v1/uploads/presign` returns Cloudinary's upload URL plus signed form fields.
  The signature pins the `public_id`, `type=authenticated`, and format.
- The browser sends the file and fields as multipart form data, then records the returned
  key on the application or profile.
- Downloads are short-lived signed URLs (`STORAGE_SIGNED_URL_TTL_SECONDS`, default 15
  minutes).

No bucket CORS setup is needed: Cloudinary's upload endpoint accepts browser requests.
Give the API key only upload/read permissions for this cloud; do not reuse an account-wide
admin key from another product.

### Class recording

LiveKit Egress cannot upload to Cloudinary. If class recording is required, create an
S3-compatible bucket and add these to the `hifzoon-shared` group (or uncomment the block in
`render.yaml`):

```dotenv
RECORDING_STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
RECORDING_STORAGE_REGION=auto
RECORDING_STORAGE_BUCKET=hifzoon-recordings
RECORDING_STORAGE_ACCESS_KEY=…
RECORDING_STORAGE_SECRET_KEY=…
RECORDING_STORAGE_FORCE_PATH_STYLE=false
```

Without them the API and every other upload work normally; only starting a recording
returns a clear configuration error. The recording bucket is separate from Cloudinary and
needs no browser CORS, because Egress writes server-side.

## 7. Frontend and cookies

The refresh token is an `httpOnly`, `SameSite=Strict` cookie scoped to
`/api/v1/auth`. Browsers only send a `SameSite=Strict` cookie on **same-site** requests,
so the web app and API must share a registrable domain:

- Preferred: `https://app.example.com` (web) + `https://api.example.com` (this Render
  service, via a custom domain).
- Alternative: proxy `/api/v1` and `/socket.io` through the web app's own origin, as the
  web app already supports with `API_PROXY_TARGET`.
- `https://hifzoon-web.onrender.com` + `https://hifzoon-api.onrender.com` are
  **different sites**; login works but session refresh silently fails.

Set `CORS_ORIGINS` to the web origin(s) and `APP_WEB_URL` to the web app URL. Both are
validated at boot: a `*` origin is rejected when `NODE_ENV=production`.

If a custom domain is added later:

1. Add it to the `hifzoon-api` service in Render.
2. Update `CORS_ORIGINS` and `APP_WEB_URL` if the web origin changes.
3. Add the webhook URL to LiveKit again if the API host changed.

## 8. Operations

- **Deploys:** pushing to `dev` redeploys both services. The API runs migrations before
  the new instance receives traffic.
- **Logs:** each service has its own log stream in the dashboard. `TRUST_PROXY=1` is set
  so rate limiting and audit logs see real client IPs.
- **Health:** the dashboard marks the API unhealthy if `/api/v1/health/ready` reports
  Postgres or Redis down. Open that URL to see which check failed.
- **Scaling:** the API is stateless and can run multiple instances; Socket.IO uses the
  Redis adapter. Run **one** worker instance unless you have checked the job
  concurrency settings, and never scale a service with an attached disk.
- **Backups:** enable Render Postgres backups/snapshots for the plan you choose, and
  test a restore before launch.
- **Shutdown:** both services get 60 seconds to close BullMQ and Socket.IO connections
  gracefully.

## 9. Troubleshooting

**The service exits during boot.**
The env schema refuses invalid production configuration. The log names the field. The
usual causes: `CORS_ORIGINS` still `*`, `MAIL_PROVIDER` still `log`/`file`, a `change-me`
secret, or `VIDEO_PROVIDER=livekit` with missing `LIVEKIT_*` values.

**`/health/ready` returns `degraded`.**
Open the response: `database` or `redis` is `down`. Confirm the resource is available and
that the API was redeployed after it was created. `REDIS_TLS` must stay `false` for
Render's internal Key Value connection string.

**Everyone gets HTTP 429 at once.**
`TRUST_PROXY` is missing or `0` behind the proxy. It is set to `1` in the blueprint; keep
it that way on Render.

**Login succeeds but the session expires immediately.**
The web app is on a different site from the API. See
[Frontend and cookies](#frontend-and-cookies).

**Demo login fails.**
Check the first API deploy's `initialDeployHook` output. If the seed did not run, open
the Render Shell and run `npm run db:seed`, then retry with `SEED_PASSWORD`.

**Build runs out of memory.**
The Nest build is the heavy step. Move `hifzoon-api` and `hifzoon-worker` to `standard`
or `1c-2g` in the dashboard (or `render.yaml`) and redeploy.

**Worker starts but jobs stay queued.**
Check the worker log for Redis connection errors, and confirm it shares the same
`REDIS_URL` and `hifzoon-shared` group as the API. The API enqueues; only the worker
consumes.
