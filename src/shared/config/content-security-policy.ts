// Content-Security-Policy for the STATIC export. next.config.ts `headers()`
// is dead on GH Pages / mediprisma.tw (the CDN / static mirror serve files
// without our headers), so the policy must ship as a <meta> tag.
// Scope and limits:
// - script-src: 'self' + inline (a static Next export emits inline bootstrap /
//   RSC-payload scripts, so 'unsafe-inline' is unavoidable) + Google hosts for
//   reCAPTCHA v3 (Firebase App Check) and the auth popup helper. The real win
//   is blocking script loads from every OTHER origin — DOMPurify remains the
//   defense for inline injection; CSP removes the remote-script blast radius.
//   googletagmanager is the gtag.js loader the Firebase Analytics SDK injects
//   at runtime (src/infrastructure/telemetry/usage-analytics.ts) — without it
//   usage reporting is blocked completely silently.
// - connect-src stays broad (https:) because SMART on FHIR must reach an
//   arbitrary `iss` FHIR server chosen at launch time. HTTP is limited to
//   loopback hosts so a production static build can still test a model running
//   on the same workstation without opening arbitrary clear-text egress.
// - frame-src includes the project's Firebase Hosting auth helper. Google
//   sign-in completes through this hidden iframe after the account chooser
//   redirects back to the app.
// - frame-ancestors CANNOT be set via <meta> (per spec) — embedding control
//   stays in next.config.ts headers() / the mediprisma.tw web server.
// - Production only: `next dev` needs eval/websockets for HMR.
export const CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://apis.google.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: blob: http://localhost:* http://127.0.0.1:* http://[::1]:*",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src https://*.firebaseapp.com https://mediprisma.web.app https://accounts.google.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')
