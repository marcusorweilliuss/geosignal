// Optional authentication via Clerk. Self-disabling when env vars
// are missing — the app keeps working for anonymous users via
// localStorage. When CLERK_SECRET_KEY is set, requests with a valid
// Clerk session token get a `req.userId` for the route handler to
// scope user data on.

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

let clerkClient = null;
let verifyToken = null;
let createClerkClient = null;

if (CLERK_SECRET_KEY) {
  try {
    const clerkBackend = require('@clerk/backend');
    createClerkClient = clerkBackend.createClerkClient;
    verifyToken = clerkBackend.verifyToken;
    clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });
    console.log('Clerk: enabled');
  } catch (err) {
    console.warn('Clerk: SDK load failed —', err.message);
  }
} else {
  console.log('Clerk: disabled (set CLERK_SECRET_KEY to enable sign-in)');
}

// Express middleware. Always succeeds — sets req.userId to a string
// when the request carries a valid Clerk session token, or null
// otherwise. Routes decide whether to require an authenticated user
// or to fall back to anonymous behavior.
async function attachUserId(req, _res, next) {
  req.userId = null;
  if (!CLERK_SECRET_KEY || !verifyToken) return next();
  try {
    // Clerk sends the session as either:
    //   - Authorization: Bearer <jwt>  (mobile / SDK calls)
    //   - __session cookie             (browser sessions)
    let token = null;
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    if (!token && req.headers.cookie) {
      const m = req.headers.cookie.match(/__session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) return next();

    const result = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (result && result.sub) req.userId = String(result.sub);
  } catch {
    // Invalid / expired token — treat as anonymous, don't error.
  }
  next();
}

function isClerkEnabled() {
  return !!(CLERK_SECRET_KEY && CLERK_PUBLISHABLE_KEY);
}

function getPublishableKey() {
  return CLERK_PUBLISHABLE_KEY || '';
}

module.exports = { attachUserId, isClerkEnabled, getPublishableKey, clerkClient };
