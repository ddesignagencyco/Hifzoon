/**
 * The public landing page served at the API root (`/`).
 *
 * It exists so `https://hifzoon-api.onrender.com/` answers with something deliberate
 * instead of a Nest 404: a branded, self-contained status page proving the API is live.
 * The stylesheet, script and favicon are inline, so the only external requests are the
 * three Google Font files the web app already uses (Fraunces, Plus Jakarta Sans, Amiri).
 */

export const LANDING_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export interface LandingPageOptions {
  /** Public origin of the Next.js app, when it is not a local development URL. */
  webUrl?: string;
  /** Where Swagger UI is mounted. */
  apiDocsUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPublicUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value);
}

export function renderLandingPage(options: LandingPageOptions): string {
  const docs = escapeHtml(options.apiDocsUrl);
  const webUrl = isPublicUrl(options.webUrl) ? escapeHtml(options.webUrl) : null;
  const primaryHref = webUrl ?? docs;
  const primaryLabel = webUrl ? 'Open Hifzoon' : 'Explore the API';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0a1f19" />
    <title>Hifzoon — Live and running</title>
    <meta
      name="description"
      content="The Hifzoon platform is online: live Quran classes, a synchronized Mushaf and progress reports families can trust."
    />
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f2c24'/%3E%3Cg fill='none' stroke='%23c49a55' stroke-width='2.5'%3E%3Ccircle cx='32' cy='32' r='15'/%3E%3Crect x='21' y='21' width='22' height='22'/%3E%3Crect x='21' y='21' width='22' height='22' transform='rotate(45 32 32)'/%3E%3C/g%3E%3C/svg%3E"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Amiri:wght@400&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --green-950: #0a1f19;
        --green-900: #0f2c24;
        --green-700: #1c4c3e;
        --green-600: #2a6553;
        --gold: #c49a55;
        --gold-600: #a97f3c;
        --gold-100: #f6ecd9;
        --cream: #faf7f1;
        --sand: #f3eee4;
        --ink: #10201b;
        --muted: #9aa9a2;
        --line: rgba(196, 154, 85, 0.22);
        --up: #7fc7a1;
        --warn: #e0b05e;
        --unknown: #8e9c96;
        --font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
        --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
        --font-arabic: 'Amiri', 'Times New Roman', serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background-color: var(--green-950);
        background-image:
          radial-gradient(1100px 620px at 50% -12%, rgba(196, 154, 85, 0.18), transparent 62%),
          radial-gradient(900px 520px at 88% 112%, rgba(42, 101, 83, 0.42), transparent 60%),
          radial-gradient(760px 460px at 4% 92%, rgba(28, 76, 62, 0.35), transparent 62%),
          linear-gradient(162deg, #0b241d 0%, #0a1f19 42%, #06130f 100%);
        color: var(--cream);
        font-family: var(--font-sans);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
        position: relative;
      }

      /* 8-point Islamic star, tiled faintly behind everything. */
      .pattern {
        position: fixed;
        inset: -10%;
        z-index: 0;
        pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80' fill='none' stroke='%23c49a55' stroke-width='0.8'%3E%3Cg transform='translate(40,40)'%3E%3Ccircle r='18'/%3E%3Crect x='-14' y='-14' width='28' height='28'/%3E%3Crect x='-14' y='-14' width='28' height='28' transform='rotate(45)'/%3E%3C/g%3E%3C/svg%3E");
        background-size: 80px 80px;
        opacity: 0.16;
        -webkit-mask-image: radial-gradient(65% 55% at 50% 42%, #000 0%, transparent 78%);
        mask-image: radial-gradient(65% 55% at 50% 42%, #000 0%, transparent 78%);
        animation: drift 90s linear infinite;
      }

      .glow {
        position: fixed;
        z-index: 0;
        border-radius: 50%;
        filter: blur(70px);
        pointer-events: none;
      }

      .glow-one {
        width: 420px;
        height: 420px;
        top: -160px;
        left: 50%;
        margin-left: -210px;
        background: radial-gradient(circle, rgba(196, 154, 85, 0.26), transparent 68%);
        animation: breathe 11s ease-in-out infinite;
      }

      .glow-two {
        width: 360px;
        height: 360px;
        bottom: -170px;
        right: -80px;
        background: radial-gradient(circle, rgba(42, 101, 83, 0.5), transparent 68%);
        animation: breathe 14s ease-in-out 1.5s infinite;
      }

      .shell {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 1140px;
        margin-inline: auto;
        padding-inline: clamp(1.15rem, 4vw, 2.5rem);
        display: flex;
        flex: 1;
        flex-direction: column;
      }

      /* ── Top bar ─────────────────────────────────────────────────────── */
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding-block: clamp(1.1rem, 2.4vw, 1.6rem);
        border-bottom: 1px solid rgba(250, 247, 241, 0.09);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        text-decoration: none;
        color: inherit;
      }

      .brand-mark {
        width: 38px;
        height: 38px;
        flex: none;
        display: grid;
        place-items: center;
        border-radius: 11px;
        border: 1px solid var(--line);
        background: linear-gradient(155deg, rgba(196, 154, 85, 0.16), rgba(10, 31, 25, 0.4));
        box-shadow: inset 0 1px 0 rgba(250, 247, 241, 0.08);
      }

      .brand-mark svg {
        width: 22px;
        height: 22px;
      }

      .brand-name {
        font-family: var(--font-serif);
        font-size: 1.24rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.45rem 0.95rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(250, 247, 241, 0.045);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        font-size: 0.76rem;
        font-weight: 600;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--gold-100);
        white-space: nowrap;
      }

      .status-pill[data-state='warn'] {
        color: var(--warn);
      }

      .status-pill[data-state='down'] {
        color: #e7907a;
      }

      .pulse {
        position: relative;
        width: 8px;
        height: 8px;
        flex: none;
        border-radius: 50%;
        background: var(--up);
        box-shadow: 0 0 0 0 rgba(127, 199, 161, 0.55);
        animation: pulse 2.4s ease-out infinite;
      }

      .status-pill[data-state='warn'] .pulse {
        background: var(--warn);
      }

      .status-pill[data-state='down'] .pulse {
        background: #e7907a;
      }

      /* ── Hero ────────────────────────────────────────────────────────── */
      .hero {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding-block: clamp(3rem, 9vh, 6rem) clamp(2.5rem, 6vh, 4rem);
      }

      .emblem {
        width: clamp(92px, 12vw, 118px);
        height: clamp(92px, 12vw, 118px);
        margin-bottom: clamp(1.4rem, 3vw, 2rem);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .emblem svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        animation: spin 48s linear infinite;
        filter: drop-shadow(0 0 18px rgba(196, 154, 85, 0.28));
      }

      .verse {
        margin: 0 0 0.4rem;
        font-family: var(--font-arabic);
        font-size: clamp(1.55rem, 3.4vw, 2.15rem);
        color: var(--gold);
        direction: rtl;
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
      }

      .verse-translation {
        margin: 0 0 clamp(1.6rem, 3.5vw, 2.3rem);
        font-size: 0.78rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
      }

      h1 {
        margin: 0;
        max-width: 15ch;
        font-family: var(--font-serif);
        font-weight: 500;
        font-size: clamp(2.9rem, 8.4vw, 5.6rem);
        line-height: 1.02;
        letter-spacing: -0.028em;
        color: var(--cream);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
      }

      h1 em {
        font-style: italic;
        color: var(--gold);
      }

      .lead {
        margin: clamp(1.3rem, 3vw, 1.8rem) 0 0;
        max-width: 58ch;
        font-size: clamp(1rem, 1.9vw, 1.16rem);
        color: rgba(250, 247, 241, 0.72);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.22s both;
      }

      .cta-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.8rem;
        margin-top: clamp(1.8rem, 4vw, 2.5rem);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.88rem 1.5rem;
        border-radius: 999px;
        border: 1px solid transparent;
        font-family: var(--font-sans);
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          background-color 180ms ease,
          border-color 180ms ease;
        will-change: transform;
      }

      .btn svg {
        width: 16px;
        height: 16px;
      }

      .btn-primary {
        color: #17251f;
        background: linear-gradient(180deg, #d7b070, var(--gold));
        box-shadow: 0 14px 34px -14px rgba(196, 154, 85, 0.85);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 42px -14px rgba(196, 154, 85, 0.95);
      }

      .btn-ghost {
        color: var(--gold-100);
        border-color: var(--line);
        background: rgba(250, 247, 241, 0.035);
      }

      .btn-ghost:hover {
        transform: translateY(-2px);
        border-color: rgba(196, 154, 85, 0.5);
        background: rgba(250, 247, 241, 0.07);
      }

      /* ── Metrics ─────────────────────────────────────────────────────── */
      .metrics {
        width: min(760px, 100%);
        margin-top: clamp(2.4rem, 5vw, 3.4rem);
        border: 1px solid var(--line);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(250, 247, 241, 0.055), rgba(250, 247, 241, 0.018));
        box-shadow:
          inset 0 1px 0 rgba(250, 247, 241, 0.08),
          0 30px 70px -40px rgba(0, 0, 0, 0.9);
        -webkit-backdrop-filter: blur(14px);
        backdrop-filter: blur(14px);
        overflow: hidden;
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.38s both;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
      }

      .metric {
        padding: 1.15rem 1rem 1.2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.42rem;
        border-right: 1px solid rgba(250, 247, 241, 0.07);
      }

      .metric:last-child {
        border-right: 0;
      }

      .metric-label {
        font-size: 0.67rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .metric-value {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--cream);
      }

      .metric-value::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--unknown);
        box-shadow: 0 0 10px rgba(142, 156, 150, 0.6);
      }

      .metric[data-state='up'] .metric-value::before {
        background: var(--up);
        box-shadow: 0 0 10px rgba(127, 199, 161, 0.8);
      }

      .metric[data-state='warn'] .metric-value::before {
        background: var(--warn);
        box-shadow: 0 0 10px rgba(224, 176, 94, 0.8);
      }

      .metric[data-state='down'] .metric-value::before {
        background: #e7907a;
        box-shadow: 0 0 10px rgba(231, 144, 122, 0.8);
      }

      .metrics-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.5rem 1rem;
        padding: 0.7rem 1rem;
        border-top: 1px solid rgba(250, 247, 241, 0.07);
        background: rgba(10, 31, 25, 0.45);
        font-size: 0.76rem;
        color: var(--muted);
      }

      .metrics-foot strong {
        color: var(--gold-100);
        font-weight: 600;
      }

      .metrics-foot .divider {
        width: 1px;
        height: 12px;
        background: rgba(250, 247, 241, 0.14);
      }

      /* ── Footer ─────────────────────────────────────────────────────── */
      .footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem 1.5rem;
        padding-block: 1.4rem;
        border-top: 1px solid rgba(250, 247, 241, 0.09);
        font-size: 0.78rem;
        color: var(--muted);
      }

      .footer-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: rgba(250, 247, 241, 0.78);
      }

      .footer-brand .dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--gold);
      }

      .footer-links {
        display: inline-flex;
        align-items: center;
        gap: 1.15rem;
      }

      .footer a {
        color: var(--muted);
        text-decoration: none;
        transition: color 160ms ease;
      }

      .footer a:hover {
        color: var(--gold-100);
      }

      /* ── Motion ─────────────────────────────────────────────────────── */
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(127, 199, 161, 0.5);
        }
        70% {
          box-shadow: 0 0 0 9px rgba(127, 199, 161, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(127, 199, 161, 0);
        }
      }

      @keyframes breathe {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.95);
        }
        50% {
          opacity: 1;
          transform: scale(1.08);
        }
      }

      @keyframes drift {
        to {
          background-position: 320px 320px;
        }
      }

      @media (max-width: 560px) {
        .metrics-grid {
          grid-template-columns: 1fr;
        }

        .metric {
          flex-direction: row;
          justify-content: space-between;
          border-right: 0;
          border-bottom: 1px solid rgba(250, 247, 241, 0.07);
          padding: 0.85rem 1.1rem;
        }

        .metric:last-child {
          border-bottom: 0;
        }

        .footer {
          justify-content: center;
          text-align: center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="pattern" aria-hidden="true"></div>
    <div class="glow glow-one" aria-hidden="true"></div>
    <div class="glow glow-two" aria-hidden="true"></div>

    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Hifzoon home">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="#c49a55" stroke-width="2">
              <circle cx="32" cy="32" r="20" />
              <rect x="17" y="17" width="30" height="30" />
              <rect x="17" y="17" width="30" height="30" transform="rotate(45 32 32)" />
            </svg>
          </span>
          <span class="brand-name">Hifzoon</span>
        </a>

        <span class="status-pill" id="status-pill" data-state="up" role="status" aria-live="polite">
          <span class="pulse" aria-hidden="true"></span>
          <span id="status-text">Live &amp; running</span>
        </span>
      </header>

      <main class="hero">
        <div class="emblem" aria-hidden="true">
          <svg viewBox="0 0 120 120" fill="none" stroke="#c49a55" stroke-width="1.1">
            <circle cx="60" cy="60" r="46" stroke-opacity="0.45" />
            <circle cx="60" cy="60" r="34" stroke-opacity="0.7" />
            <rect x="26" y="26" width="68" height="68" stroke-opacity="0.55" />
            <rect
              x="26"
              y="26"
              width="68"
              height="68"
              transform="rotate(45 60 60)"
              stroke-opacity="0.55"
            />
            <circle cx="60" cy="60" r="5" fill="#c49a55" stroke="none" />
          </svg>
        </div>

        <p class="verse" lang="ar" dir="rtl">وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا</p>
        <p class="verse-translation">And recite the Qur'an with measured recitation</p>

        <h1>Hifzoon is <em>live</em>.</h1>

        <p class="lead">
          The purpose-built Quran academy platform is online and serving requests — live
          classes, a synchronized Mushaf, and progress reports families can trust.
        </p>

        <div class="cta-row">
          <a class="btn btn-primary" href="${primaryHref}">
            ${primaryLabel}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
          <a class="btn btn-ghost" href="${docs}">
            API documentation
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
        </div>

        <div class="metrics">
          <div class="metrics-grid">
            <div class="metric" id="metric-api" data-state="up">
              <span class="metric-label">API</span>
              <span class="metric-value" id="metric-api-value">Live</span>
            </div>
            <div class="metric" id="metric-db" data-state="unknown">
              <span class="metric-label">Database</span>
              <span class="metric-value" id="metric-db-value">Monitored</span>
            </div>
            <div class="metric" id="metric-redis" data-state="unknown">
              <span class="metric-label">Realtime</span>
              <span class="metric-value" id="metric-redis-value">Monitored</span>
            </div>
          </div>
          <div class="metrics-foot">
            <span>Uptime <strong id="uptime">running now</strong></span>
            <span class="divider" aria-hidden="true"></span>
            <span>Health <strong id="checked">served from this instance</strong></span>
          </div>
        </div>
      </main>

      <footer class="footer">
        <span class="footer-brand">
          <span class="dot" aria-hidden="true"></span>
          © ${new Date().getUTCFullYear()} Hifzoon
        </span>
        <span>Purpose-built for huffaz, families and scholars.</span>
        <span class="footer-links">
          <a href="${docs}">Docs</a>
          <a href="/api/v1/health/ready">Health</a>
        </span>
      </footer>
    </div>

    <script>
      (function () {
        var pill = document.getElementById('status-pill');
        var statusText = document.getElementById('status-text');
        var nodes = {
          api: document.getElementById('metric-api'),
          apiValue: document.getElementById('metric-api-value'),
          db: document.getElementById('metric-db'),
          dbValue: document.getElementById('metric-db-value'),
          redis: document.getElementById('metric-redis'),
          redisValue: document.getElementById('metric-redis-value'),
          uptime: document.getElementById('uptime'),
          checked: document.getElementById('checked'),
        };

        function setMetric(node, valueNode, state, text) {
          if (!node || !valueNode) return;
          node.setAttribute('data-state', state);
          valueNode.textContent = text;
        }

        function formatUptime(seconds) {
          var total = Math.max(0, Math.floor(Number(seconds) || 0));
          var days = Math.floor(total / 86400);
          var hours = Math.floor((total % 86400) / 3600);
          var minutes = Math.floor((total % 3600) / 60);
          if (days > 0) return days + 'd ' + hours + 'h';
          if (hours > 0) return hours + 'h ' + minutes + 'm';
          return minutes > 0 ? minutes + 'm' : 'just now';
        }

        fetch('/api/v1/health/ready', {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then(function (body) {
            var report = body && body.data ? body.data : body || {};
            var checks = report.checks || {};
            var ok = report.status === 'ok';

            setMetric(nodes.api, nodes.apiValue, 'up', 'Operational');
            setMetric(
              nodes.db,
              nodes.dbValue,
              checks.database && checks.database.status === 'up' ? 'up' : 'down',
              checks.database && checks.database.status === 'up' ? 'Connected' : 'Unavailable',
            );
            setMetric(
              nodes.redis,
              nodes.redisValue,
              checks.redis && checks.redis.status === 'up' ? 'up' : 'down',
              checks.redis && checks.redis.status === 'up' ? 'Connected' : 'Unavailable',
            );

            nodes.uptime.textContent = formatUptime(report.uptimeSeconds);
            nodes.checked.textContent = 'checked just now';

            pill.setAttribute('data-state', ok ? 'up' : 'warn');
            statusText.textContent = ok ? 'Live & running' : 'Live · degraded';
          })
          .catch(function () {
            setMetric(nodes.api, nodes.apiValue, 'up', 'Serving this page');
            setMetric(nodes.db, nodes.dbValue, 'unknown', 'Not reported');
            setMetric(nodes.redis, nodes.redisValue, 'unknown', 'Not reported');
            nodes.checked.textContent = 'checks unavailable';
          });
      })();
    </script>
  </body>
</html>
`;
}
