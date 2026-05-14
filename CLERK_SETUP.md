# Clerk Setup (sign-up / sign-in)

The code is wired up — you just need to create a Clerk account and
add two env vars. **The app keeps working for anonymous users either
way; sign-in is opt-in.**

## 1. Create a Clerk account

1. Go to <https://clerk.com> and sign up (free tier covers 10k MAU).
2. **Create an application.** Give it a name like "GeoSignal".
3. Under **Authentication methods**, pick whichever you want — Email
   (magic link or code) is simplest. Add Google / GitHub / etc. as
   social providers if you want.

## 2. Grab the two keys

After creating the application, go to **API Keys** in the Clerk
dashboard. You'll see:

- `Publishable key` — starts with `pk_test_…` or `pk_live_…`
- `Secret key` — starts with `sk_test_…` or `sk_live_…`

Keep the secret key private. The publishable key is fine to ship.

## 3. Add the keys to Render

Open the GeoSignal service on Render → **Environment** → add:

| Key | Value |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
| `CLERK_SECRET_KEY` | `sk_test_…` |

Save and Render redeploys.

## 4. Configure the allowed origin in Clerk

In the Clerk dashboard → **Domains** (or "URLs & Redirects"):

- Add `https://geosignal-6ics.onrender.com` (and any custom domain
  you eventually use) as an **Allowed origin**.

Without this, the browser SDK blocks requests with a CORS error.

## 5. Verify

- Hard-refresh your site after the Render deploy.
- A "Sign in" button appears in the header.
- Click → Clerk's hosted modal opens → sign up with email.
- After signing in, the button is replaced by your avatar (Clerk's
  `<UserButton>` mount). Click it for "Manage account" / "Sign out".

## What the integration does

- **Anonymous users:** unchanged — profile lives in localStorage.
- **Signed-in users:** profile is also persisted server-side at
  `/api/profile` (Clerk session JWT → server user_id → SQLite row).
  When they sign in on a new device, their profile pulls down
  automatically.

## What it doesn't do yet

- No email-list / contact-collection beyond what Clerk stores
  itself. (Clerk shows you the user list in their dashboard.)
- No saved-articles or reading-history sync across devices. Those
  still live in localStorage. Easy to add later — same pattern as
  `/api/profile` but with article URLs.
- No billing / paywalls. Hook this up via Clerk's Stripe integration
  when you have a pricing model.

## Cost

- Free tier: 10,000 monthly active users.
- Pro: from $25/month for 10k MAU + extras.
- For a beta, free is plenty.
