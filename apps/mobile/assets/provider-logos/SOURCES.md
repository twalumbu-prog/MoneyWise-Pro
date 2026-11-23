# Mobile money provider logos

Fetched 2026-11-21 to identify the providers in the account picker. All are trademarks of their owners and are used only
to show which provider an account belongs to.

| File | Source | Notes |
| --- | --- | --- |
| `mtn.svg` | Wikimedia Commons, "File:MTN 2022 logo.svg" (marked public domain, trademarked) | Black oval mark. The app draws it on MTN yellow (#FFCB05), as MTN uses it. |
| `airtel.svg` | Wikimedia Commons, "File:Airtel Africa logo.svg" (marked public domain, trademarked) | Airtel Money in Zambia is operated by Airtel Africa. |
| `zamtel.png` | https://www.zamtel.zm/images/footer-logo.png (Zamtel's own website) | 150×150 round logo. |

`MtnLogo` and `AirtelLogo` in `src/components/onboarding/personal/ProviderLogos.tsx` inline the SVG paths so they stay sharp at any size.
