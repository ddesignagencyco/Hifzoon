# Real-time Classroom — What's Needed & HTTPS Setup with Dev Tunnels

**Updated:** 2026-10-19 · **Audience:** product owner, backend and web teams
**Short answer:** the classroom's *data* is already real-time (Mushaf page, word highlight, layout, Tajweed, who is in the room). The *audio and video* are not: the API only has a **fake** video provider, so the browser shows your own camera preview and nobody else's. Making it real needs **(1) a LiveKit video adapter in the API, (2) the API handing the browser a media token, (3) the web connecting to LiveKit**, and **(4) HTTPS**, because browsers only allow camera and microphone on `https://` (or `localhost`).

---

## 1. What works today and what doesn't

| Part | Today | Why |
| :--- | :--- | :--- |
| Mushaf page, word highlight, layout, Tajweed colours | ✅ Real-time | Socket.IO namespace `/classroom` (`apps/api/src/modules/classroom/classroom.gateway.ts:65-67`); the web falls back to polling every 2.5 s (`apps/web/src/hooks/useClassroomSocket.ts`). |
| Who is in the room, attendance, join/leave | ✅ Real-time | Same socket + `GET /classroom/classes/:id/state`. |
| Quran text | ✅ (interim) | Quran.com public text while the licensed provider is missing (`backendrequirement.md` M44). |
| **Teacher ↔ student audio and video** | ❌ | `VIDEO_PROVIDER=fake` (`apps/api/src/config/env.schema.ts:87`). The enum accepts `livekit`, but **no LiveKit adapter exists** — only `integrations/fakes.ts` implements `VideoProvider` (`integrations/providers.ts:65-68`). Backend item **M36** (deferred). |
| **Browser gets media credentials** | ❌ | `POST /classroom/classes/:id/token` returns the *classroom socket* token and a `fake://room/…` URL — no media server URL or media token (**M16**). |
| Other people's mic/camera state on tiles | ❌ | Not in the room state (**M55**); a real video SDK supplies it. |
| Recording | ❌ (UI and consent rules exist) | Needs the provider's recorder (LiveKit Egress) + storage. |
| A child joining as the student | ❌ | Children have no login (**M48**). For demos, a student login was linked by hand (`yusuf@hifzoon.test`). |
| Camera/mic on another device (phone, second laptop) | ❌ | Browsers block `getUserMedia` on plain `http://` except `localhost` → needs HTTPS (§4). |

---

## 2. Choose the media server

LiveKit is what the API was designed for (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are already in the env schema, `env.schema.ts:113-115`, and become required when `VIDEO_PROVIDER=livekit`, `:153`).

| Option | Use it for | Notes |
| :--- | :--- | :--- |
| **LiveKit Cloud** (recommended) | Demos, staging, production | Create a project at cloud.livekit.io → you get `wss://<project>.livekit.cloud`, an API key and a secret. Media uses LiveKit's TURN/UDP infrastructure, so it works from any network — **including through a dev tunnel**, because only our web app goes through the tunnel; the media goes straight from the browser to LiveKit. Free "Build" tier is enough for testing. |
| Self-hosted `livekit/livekit-server` (Docker) | One machine / office LAN only | `docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev` (dev key `devkey` / secret `secret`). Media needs UDP 7882 or TCP 7881 — **a dev tunnel cannot carry these**, so phones outside your network won't get audio/video. |

### 2.1 Without LiveKit: other free, open-source options

LiveKit itself is open source (Apache-2.0) and free to self-host; "LiveKit Cloud" is only the paid hosting. If you prefer not to use LiveKit at all:

| Option | How it works | Good for Hifzoon? | Cost / effort |
| :--- | :--- | :--- | :--- |
| **A. Plain WebRTC, peer-to-peer (mesh)** | Each browser connects directly to the others. **Signalling reuses our existing classroom Socket.IO** (offer/answer/ICE messages); STUN finds the route; a **TURN server (coturn, open source)** relays media when a direct route fails (~10–20% of networks, e.g. mobile data, strict office Wi-Fi). | **Yes for 1:1 classes** (teacher + student + 1–2 watching parents). Each person uploads one stream per other person, so above ~4 people quality drops. | No media server. Only a small coturn VPS (public IP, UDP 3478 + relay ports). Backend 3–4 days, web 4–6 days. |
| **B. Self-hosted SFU — mediasoup / Janus** | One server receives each stream once and forwards it (like LiveKit). | Yes, scales to group circles; recording possible on the server. | More code than LiveKit (lower-level APIs); a VPS with UDP ports. |
| **C. Jitsi Meet (self-hosted)** | A complete meeting app; embedded with its iframe API. | Works quickly, but it's Jitsi's UI inside ours — hard to match the Mushaf layout, roles and attendance. | Heavy server (several services); least custom code. |

**Recommendation without LiveKit: Option A (P2P WebRTC + coturn)** — classes are mostly one teacher and one student, the socket for signalling already exists, and the only infrastructure is a TURN server.

What Option A needs:
- **Backend:** relay `webrtc:offer`, `webrtc:answer`, `webrtc:ice` events between participants of the same class in `classroom.gateway.ts` (only to people in that room, only from authorised roles; guardians receive-only); a `GET /classroom/turn-credentials` route issuing short-lived coturn credentials (coturn's REST-API HMAC secret, `use-auth-secret`); attendance from socket join/leave (already tracked).
- **Web:** an `RTCPeerConnection` per remote participant, camera/mic tracks, remote `<video>` tiles in `ParticipantTile`, mute/camera via `track.enabled`, `getDisplayMedia` for screen share, reconnection (ICE restart), and receive-only connections for guardians.
- **Recording:** no server sees the media, so record in the teacher's browser (`MediaRecorder`) and upload via the existing presigned upload (`POST /uploads/presign`), keeping the consent gate.
- **Infra:** coturn on a VPS with a public IP — e.g. `docker run -d --network host coturn/coturn -n --use-auth-secret --static-auth-secret=<secret> --realm=hifzoon --listening-port=3478 --min-port=49160 --max-port=49200`. A dev tunnel can't carry TURN/UDP; on the same Wi-Fi, STUN alone (e.g. `stun:stun.l.google.com:19302`) is enough for testing.
- **HTTPS (§4) is still required** for camera/mic on other devices.

---

## 3. What has to be built (LiveKit path)

### 3.1 Backend (owner: backend team) — blocking

| # | Work | Detail |
| :--- | :--- | :--- |
| 1 | **LiveKit `VideoProvider` adapter** (M36) | Implement `createRoom`, `issueToken`, end room and recording in `apps/api/src/integrations/` with `livekit-server-sdk`, and select it in `provider-selection.ts` when `VIDEO_PROVIDER=livekit`. |
| 2 | **Media token in the join response** (M16) | `POST /classroom/classes/:id/token` adds `media: { url: "wss://…", token: "<LiveKit JWT>", expiresAt }` next to the existing classroom-socket `token`. Room name: `hifzoon-<classId>` (already used, `classroom.service.ts:256`). Identity: the user id; name: display name; metadata: `{ role, studentId }`. |
| 3 | **Grants per role** | TEACHER: publish audio/video/screen + data, room admin (mute others). STUDENT: publish audio/video + data. GUARDIAN_VIEWER: subscribe only (never publishes — matches the web's "Watch-only" promise). SUPERVISOR: subscribe only, hidden. |
| 4 | **Webhooks** | `POST /webhooks/video` exists — verify LiveKit's signature (`WebhookReceiver`) and handle `participant_joined/left` (attendance minutes, M17), `room_started/finished` (class LIVE/COMPLETED, B36/B37), `egress_ended` (recording ready). |
| 5 | **Recording (optional for v1)** | LiveKit Egress → S3-compatible storage. LiveKit Cloud can't reach a local MinIO; use LiveKit Cloud storage or a real S3 bucket for testing. Keep the existing consent gate. |
| 6 | Related asks | M48 (child joins as student), M55 (class title + recording status in the room state), B36/B37 (status transitions). |

### 3.2 Web (owner: web team) — after 3.1 lands

1. Add `livekit-client` (and optionally `@livekit/components-react`).
2. On **Join**: connect to `media.url` with `media.token`; publish camera + mic (replaces today's local-only preview in `components/classroom/VideoPanel.tsx`).
3. **Tiles** (`components/classroom/MeetingChrome.tsx` `ParticipantTile`): render each remote participant's video track; mic/camera icons and the speaking ring from LiveKit track/speaker events (this also covers M55's media state).
4. **Controls**: Mute/Camera → `localParticipant.setMicrophoneEnabled / setCameraEnabled`; Leave → `room.disconnect()`; teacher "Mute student"; optional **Share screen** (`setScreenShareEnabled`) — the Mushaf itself is already shared as data, so screen share is only for other material.
5. **Low-bandwidth mode**: `adaptiveStream` + `dynacast`, drop to audio-only when toggled.
6. Reconnecting / permission-denied / no-device states, and a device picker.
7. Guardians: subscribe only; their tile stays "Watch-only".

Rough effort once the backend is ready: web 3–5 days, backend 4–6 days (adapter, grants, webhooks; recording extra).

---

## 4. HTTPS with Dev Tunnels (GitHub sign-in)

Camera and microphone need a secure origin. A **Dev Tunnel** gives the local app a public `https://…devtunnels.ms` address, so phones and other laptops can join a class.

### 4.1 One origin for everything (already built into the web)

The API's refresh cookie is `SameSite=Strict` (`apps/api/src/modules/auth/auth-cookie.ts:36`). With two tunnels (one for the web, one for the API) the browser treats them as different sites, the cookie isn't sent, and sign-in breaks. So the web server can now **proxy the API and the classroom socket** — the browser only ever talks to one HTTPS origin:

- `apps/web/next.config.ts`: when `API_PROXY_TARGET` is set, `/api/v1/*` and `/socket.io/*` are forwarded to the API. Unset = no change.
- `allowedDevOrigins` accepts `*.devtunnels.ms` (override with `DEV_ALLOWED_ORIGINS`).
- `classroomSocketUrl()` understands a relative API base (`/api/v1`).
- Socket.IO starts with HTTP polling, which always works through the proxy; it upgrades to WebSocket when it can.

Result: **you only tunnel port 3000.**

### 4.2 Install and sign in (once)

```powershell
winget install Microsoft.devtunnel
devtunnel user login -g          # -g = sign in with GitHub
```

(Alternative without the CLI: VS Code → **Ports** panel → *Forward a Port* → `3000` → right-click → *Port Visibility* → **Public**.)

### 4.3 Create a persistent tunnel (same URL every time)

```powershell
devtunnel create hifzoon --allow-anonymous
devtunnel port create hifzoon -p 3000 --protocol http
devtunnel show hifzoon            # note the URL: https://hifzoon-3000.<region>.devtunnels.ms
```

`--allow-anonymous` lets testers open the link without a Microsoft/GitHub account. Each visitor sees a one-time "You are about to connect to a developer tunnel" page — click **Continue**.

### 4.4 Configure the apps (replace `<TUNNEL>` with your URL, e.g. `https://hifzoon-3000.euw.devtunnels.ms`)

**`apps/web/.env.local`**
```env
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_TARGET=http://localhost:4000
NEXT_PUBLIC_BILLING_ENABLED=false
```

**`apps/api/.env`** (docker reads it through `env_file`)
```env
APP_WEB_URL=<TUNNEL>
CORS_ORIGINS=<TUNNEL>,http://localhost:3000
# Media server (after §3.1 is built)
VIDEO_PROVIDER=livekit
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```
- `APP_WEB_URL` makes reminder and email links point at the tunnel.
- `CORS_ORIGINS` must include the tunnel because the **OAuth redirect allow-list** reads it (`oauth.service.ts`).
- Google sign-in: add `<TUNNEL>/auth/oauth/google` as an authorised redirect URI in Google Cloud Console.

Restart after changing env files:
```powershell
docker compose up -d --force-recreate --no-deps api worker
npm run dev --workspace @hifzoon/web     # restart the web so next.config/.env.local reload
```

### 4.5 Start the tunnel

```powershell
devtunnel host hifzoon
```
Open `<TUNNEL>` on any device. Keep the window open while testing.

### 4.6 Things that still point at localhost

| Thing | Effect through the tunnel | Fix |
| :--- | :--- | :--- |
| File uploads (teacher application audio/documents) | Presigned links are `http://localhost:9000/…` (`docker-compose.yml` api `STORAGE_ENDPOINT`), so uploads work only on the host PC. | Tunnel port 9000 too (`devtunnel port create hifzoon -p 9000`), set the api `STORAGE_ENDPOINT` to that `https://hifzoon-9000…` URL, add a MinIO CORS rule for `<TUNNEL>` — or wait for **B30** (`STORAGE_PUBLIC_ENDPOINT`). |
| Rate limits | Behind the proxy every visitor reaches the API from the web server, so per-IP limits are shared. | Fine for demos; for wider testing the API should trust `X-Forwarded-For` from the proxy. |
| MailHog | Still `http://localhost:8025` on the host. | Open it on the host PC. |

---

## 5. Test checklist

1. `<TUNNEL>` opens the home page on a phone (after the interstitial).
2. Sign in as a parent on the phone → refresh the page → still signed in (proves the cookie works through the tunnel).
3. Teacher (laptop) joins a class → student (`yusuf@hifzoon.test`, phone) joins → the Mushaf page and word highlights follow the teacher live.
4. Camera/mic permission prompt appears on the phone (proves HTTPS is working).
5. **After §3 is built:** both see and hear each other; the guardian sees both but isn't on camera; mute/camera icons update on the other side; Leave removes the tile.
6. Attendance shows the student's minutes (after webhooks, §3.1 #4).

---

## 6. Summary for the decision

| Need | Owner | Status |
| :--- | :--- | :--- |
| HTTPS for camera/mic on other devices | Web + ops | ✅ Ready — Dev Tunnel + single-origin proxy (§4) |
| Real-time Mushaf/highlight/participants | Done | ✅ |
| LiveKit project (URL, key, secret) | Product/ops | ⏳ Create on LiveKit Cloud |
| LiveKit adapter, media token, grants, webhooks | Backend | ❌ M36, M16, M17 |
| Live video/audio tiles, controls, screen share | Web | ⏳ After the backend work |
| Child joins as the student | Backend | ❌ M48 |
