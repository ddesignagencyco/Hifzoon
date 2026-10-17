# External providers — Google OAuth and outbound mail

How to create the credentials the API expects, and what each one is wired to.

Everything here is verified against the running API. The commands at the bottom are the
ones used to check the wiring; paste them, don't take them on trust.

---

## 1. Google sign-in (`FR-AUTH-01`)

### What you need

| Env var                   | Where it comes from                          |
| ------------------------- | -------------------------------------------- |
| `GOOGLE_CLIENT_ID`        | OAuth 2.0 Client ID (the `...apps.googleusercontent.com` string) |
| `GOOGLE_CLIENT_SECRET`    | OAuth 2.0 Client secret                      |
| `CORS_ORIGINS`            | Must contain the frontend origin **and** the redirect URI's origin |

### Creating the client

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Pick (or create) a project. **Enable the "Google People API"** — sign-in needs it.
3. **Create Credentials → OAuth client ID → Web application.**
   - **Name:** anything, e.g. `Hifzoon web client`.
   - **Authorised JavaScript origins:** where your SPA is served. This is *not* the
     redirect URI. `http://localhost:3000` is right for a frontend on port 3000.
   - **Authorised redirect URIs:** the exact URL the provider will send the user back to.
     For a backend-held secret flow this is your **frontend's** callback page, not the API:
     `http://localhost:3001/auth/google/callback`.
4. **Copy the client secret the moment it is shown.** Google will not display it again —
   only a masked `****xxxx` suffix afterwards. If it is lost, delete and recreate.
5. Put both values in `apps/api/.env`.

### Two things that bite everyone

**Your consent screen is in "Testing" mode.** That is what the message in your browser
means:

> OAuth access is restricted to the test users listed on your OAuth consent screen

While an app is in testing, **only accounts explicitly listed as test users can sign
in** — including the account *you* are signed in with. Two ways forward:

- **Add yourself as a test user** (fastest, correct while you develop):
  Google Cloud Console → **OAuth consent screen → Test users → + ADD USERS**, then enter
  your Google address and save. Up to 100, no verification step.
- **Publish the app** (needed before any real user can sign in):
  OAuth consent screen → **Publish app**. If the app requests sensitive scopes it stays
  in testing and needs Google's verification; `openid email profile` are all *non-sensitive*,
  so publishing is normally enough with no review.

> Changes to the consent screen can take a few minutes to apply. If you have just added a
> test user and still get the error, sign out of Google and back in and try again.

**Google will not accept `http://` for anything but `localhost`.** A redirect URI of
`http://localhost:3001/auth/google/callback` is fine; the same path on a real domain must
be `https://`.

### The redirect URI is the one that decides your `CORS_ORIGINS`

The API refuses to start a sign-in whose `redirectUri` is not an origin in
`CORS_ORIGINS` — an open redirect there would hand an attacker a login flow that finishes
on a host they choose, with the authorization code attached. So if you change the frontend
port, add it:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

A wrong value fails loudly, with the allow-list in the error:

```json
{"code":"OAUTH_STATE_INVALID","details":{"origin":"https://evil.example","allowed":["http://localhost:3000","http://localhost:3001"]}}
```

### How the flow works

Two explicit steps. The browser navigates to the provider itself — the API never issues
the redirect, so the authorization code never passes through the API's access log.

```
1. GET  /api/v1/auth/oauth/google/start?redirectUri=...
      → { authorizationUrl, state, expiresIn }

2. browser → authorizationUrl → user consents → Google redirects to
   http://localhost:3001/auth/google/callback?code=...&state=...

3. POST /api/v1/auth/oauth/google/callback   { code, state, redirectUri }
      → the same tokens as POST /auth/login
```

`state` is minted server-side, stored in Redis with a 10-minute TTL, and consumed with
`GETDEL` — one use only. Replaying a captured callback returns `OAUTH_STATE_INVALID`.
The flow also uses PKCE (S256) and a `nonce`, and the PKCE verifier never leaves the
server.

### Verifying it from a terminal

```bash
# 1. Is Google configured at all?
curl -s http://localhost:4000/api/v1/auth/oauth/providers
# → {"data":[{"name":"google","configured":true},{"name":"apple","configured":false}]}

# 2. Does /start hand back a well-formed Google URL?
curl -s "http://localhost:4000/api/v1/auth/oauth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fgoogle%2Fcallback"
# → https://accounts.google.com/o/oauth2/v2/auth?client_id=...&code_challenge=...

# 3. Does the code exchange actually reach Google with your credentials?
#    (a fake code is enough — Google replies invalid_grant, which proves the
#     client_id/secret were accepted rather than rejected as invalid_client)
curl -s -X POST http://localhost:4000/api/v1/auth/oauth/google/callback \
  -H 'content-type: application/json' \
  -d '{"code":"bogus","state":"<state from step 2>","redirectUri":"http://localhost:3001/auth/google/callback"}'
# → 502 PROVIDER_ERROR  details.detail = "invalid_grant"
```

That third check is the one that matters: `invalid_grant` means Google authenticated your
client and only rejected the made-up code. An `invalid_client` would mean the secret is
wrong.

Only step 2→3 needs a browser to complete — for that, copy `authorizationUrl` into the
address bar of a **test user** account.

### Rotating a leaked secret

If a client secret is ever pasted into a chat, a commit, a log or a screenshot, treat it
as compromised. Google Cloud Console → Credentials → your client → **Delete client secret**
(or create a second one), then update `apps/api/.env` and restart. Deleting one secret does
not invalidate the other, so it can be done without downtime.

---

## 2. Apple sign-in

Apple is configured per-app rather than per-project, and needs four values.

| Env var            | Where it comes from                                                     |
| ------------------ | ----------------------------------------------------------------------- |
| `APPLE_CLIENT_ID`  | **Services ID** — the `com.example.hifzoon.web` identifier              |
| `APPLE_TEAM_ID`    | Apple Developer → Membership, 10-character team id                      |
| `APPLE_KEY_ID`     | Keys → the `.p8` file you downloaded, e.g. `ABC123DEFG`                 |
| `APPLE_PRIVATE_KEY`| The *contents* of that `.p8` file, with `\n` for newlines               |

Steps:

1. [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) →
   **Identifiers +** → **Services IDs** → add one, enable **Sign in with Apple**.
2. On that Services ID, add a **Redirect URI** matching exactly, e.g.
   `https://app.example.com/auth/apple/callback`.
3. **Keys** → **+** → *Sign in with Apple* → download the `.p8`. **It downloads once.**
   If lost, revoke and create a new key.
4. Copy the contents into one env line. In `.env` a multi-line value must stay on one
   line with escaped newlines:
   ```env
   APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----"
   ```

Apple's client secret is **not** a stored value — the API mints a short-lived ES256 JWT
from the team key on each token request, which is why `APPLE_PRIVATE_KEY` matters more than
any secret you would otherwise paste in.

Two Apple-specific behaviours worth knowing:

- **The email arrives once**, on the first authorization for a given Services ID. Every
  later sign-in returns a subject id only. The API resolves returning users by subject, so
  this is normal — but a *new* user with no email cannot be created, and the API says so.
- **Apple posts the callback as a form**, not a redirect with query parameters
  (`response_mode=form_post`), which is why the user name can be captured at all.

---

## 3. Outbound mail

### Current state — read this before planning

`MAIL_PROVIDER` accepts `log`, `resend` and `ses`, but **only the `log` adapter is
implemented**. Selecting `resend` or `ses` today logs a warning and keeps using `log`:

```
Provider "resend" selected for mail; using fake adapter until the adapter lands
```

So nothing is silently broken, but no real email is sent either. Password resets,
guardian verification codes and payment-failure notices are written to the log and nothing
more. Writing the real adapter is a small, self-contained ticket — one class implementing
`Mailer` plus a case in `select()` in `apps/api/src/integrations/integrations.module.ts:72`.

The interface it must satisfy is `Mailer` in
`apps/api/src/integrations/providers.ts:171`:

```ts
interface Mailer {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}
```

`MailMessage` carries `to`, `subject`, `html`, optional `text`/`replyTo`/`attachments`, and
an `idempotencyKey` set for transactional mail so bounces can be traced back to the
notification row.

### Choosing a provider

| Option          | Cost                | Best for                                          |
| --------------- | ------------------- | ------------------------------------------------- |
| **Resend**      | 3 000/mo free       | Transactional mail, simplest API, built-in domain verification |
| **Amazon SES**  | Very cheap per send | High volume once you are past free tier           |
| **Gmail SMTP**  | —                   | Development only. See the warning below           |

Hifzoon sends password resets, 6-digit guardian codes and payment notices — the
transactional kind, so either Resend or SES is a fit. Volume is far below SES's free tier
at this stage.

### Resend

1. [resend.com](https://resend.com) → sign up → **Domains** → **Add Domain**, e.g.
   `mail.example.com`.
2. Add the DNS records it gives you (SPF, DKIM, and a DMARC record). These are what stop
   your mail landing in spam.
3. Once verified, create an **API Key** (Resend → API Keys → Create).
4. Configure:
   ```env
   MAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
   `RESEND_API_KEY` is **already required by config validation** when
   `MAIL_PROVIDER=resend`, so a missing key fails at boot rather than at the first
   password reset — which is the whole point of validating config once at startup.

### Gmail SMTP (development only)

Google's normal password will not work for SMTP, and that is deliberate. You need an
**App Password**:

1. Turn on **2-Step Verification** on the Google account.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Name it (`Hifzoon dev`) and generate. You get a 16-character password.
4. SMTP settings: host `smtp.gmail.com`, port `587`, security `STARTTLS`, username = the
   full Gmail address.

> **Do not use a personal Gmail account for production mail.** Google caps it at ~500
> messages a day, will terminate the account for automated sending, and one shared
> credential couples every Hifzoon user to one person's inbox. Resend exists for exactly
> this reason.

There is no `smtp` value in `MAIL_PROVIDER` today — `env.schema.ts` validates the enum, so
adding one means changing the schema too, not just the adapter.

---

## 4. Verifying mail after an adapter lands

The notification row is written **before** the send is attempted, so a delivery failure is
visible rather than silent. To check a template end to end, request a password reset
against a real address and watch both the log and the `notification` table:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/forgot-password \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}'
```

It always returns `202`, whether or not the address exists — that is deliberate, so the
endpoint cannot be used to enumerate registered emails.

---

## 5. Environment variable reference

| Variable                | Required when                  | Notes                                              |
| ----------------------- | ------------------------------ | -------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | Google sign-in enabled         | Sets `configured: true` for `google`                |
| `GOOGLE_CLIENT_SECRET`  | `GOOGLE_CLIENT_ID` is set      | Enforced by config validation at boot               |
| `APPLE_CLIENT_ID`       | Apple sign-in enabled          | A Services ID, not an App ID                        |
| `APPLE_TEAM_ID`         | Apple sign-in enabled          | 10-character team id                                |
| `APPLE_KEY_ID`          | Apple sign-in enabled          | From the `.p8` filename                             |
| `APPLE_PRIVATE_KEY`     | Apple sign-in enabled          | `.p8` contents, escaped newlines on one line       |
| `MAIL_PROVIDER`         | always                         | `log` \| `resend` \| `ses` — only `log` implemented |
| `RESEND_API_KEY`        | `MAIL_PROVIDER=resend`         | Enforced by config validation at boot               |
| `CORS_ORIGINS`          | always                         | CSV; must include the OAuth redirect URI's origin   |

A missing provider key never fails silently: the API returns `501` and names exactly what
is absent.

```json
{"code":"NOT_IMPLEMENTED","details":{"provider":"apple","missingEnv":["APPLE_CLIENT_ID","APPLE_TEAM_ID","APPLE_KEY_ID","APPLE_PRIVATE_KEY"]}}
```