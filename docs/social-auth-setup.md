# Google & Apple sign-in — one-time setup

The code is in place (web + iOS + Android app + API). It stays inert until the providers below are
configured in Supabase, because the Google/Apple credentials come from your own accounts.
Supabase project: **Project Moneywise** (`ahatvfmvhecakpxtpnay`).
Supabase callback URL (used by both providers): `https://ahatvfmvhecakpxtpnay.supabase.co/auth/v1/callback`

## 1. Redirect URLs (Supabase → Authentication → URL Configuration)
Add to **Redirect URLs**:
- `moneywise://auth/callback` (the app)
- `https://moneywise.blueopus.cloud/**` (the website)
- `http://localhost:5173/**` (local web dev, optional)

## 2. Google
1. Google Cloud Console → APIs & Services → **OAuth consent screen**: set up (External), app name MoneyWise, support email, add your domain; publish to Production when ready.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: the Supabase callback URL above. Create it and copy the Client ID and Client secret.
3. Supabase → Authentication → Providers → **Google**: enable, paste the Client ID and secret, save.
   (The app and website both use this one Web client; no separate iOS/Android client is needed.)

## 3. Apple
**iPhone app (native sheet)**
1. developer.apple.com → Identifiers → the App ID `cloud.blueopus.moneywise` → enable **Sign in with Apple**
   (EAS also turns this on during the next iOS build).
2. Supabase → Authentication → Providers → **Apple**: enable, and in **Client IDs** put `cloud.blueopus.moneywise`.

**Website (optional — the Apple button on the site errors until this is done)**
1. Identifiers → create a **Services ID** (e.g. `cloud.blueopus.moneywise.web`), enable Sign in with Apple,
   Domains: `ahatvfmvhecakpxtpnay.supabase.co`, Return URL: the Supabase callback URL.
2. Keys → create a key with Sign in with Apple, download the `.p8`.
3. Generate the Apple client-secret JWT (Supabase's docs have a generator) — it **expires every 6 months**.
4. In Supabase's Apple provider: Client IDs = `cloud.blueopus.moneywise,cloud.blueopus.moneywise.web`, Secret = the JWT.

## 4. Merging with existing accounts
Supabase links a Google/Apple login to an existing email/password account **automatically when the email
matches and is verified on both sides** — one person, one account, no duplicate. MoneyWise email sign-ups are
created with the email already confirmed, so they link. Exceptions: an Apple "Hide My Email" address is a private
relay and never matches (they get a separate account), and an invited-but-never-confirmed email isn't linked.

## 5. Ship
Social sign-in in the app needs a new iOS and Android build (native modules `expo-apple-authentication`,
`expo-web-browser`). The website and API are live as soon as they deploy.
