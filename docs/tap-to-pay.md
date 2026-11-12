# Tap to pay between MoneyWise users: architecture

Draft, 12 November 2026. Nothing here is built yet.

## What it is

A MoneyWise user can ask another MoneyWise user for money by tapping phones, scanning a code or sharing a link. The phone that **receives** the money makes a small "pay me" request. The phone that **sends** the money opens it, sees who is asking and how much, confirms, and the money moves through the MoneyWise-to-MoneyWise transfer that already exists.

NFC, a QR code, a link and the share sheet (AirDrop, Nearby Share, WhatsApp) are only four ways of carrying the **same request**. No money and no card data ever travel over NFC.

## The receiver's setting (Settings → Tap to receive)

| Setting | Meaning |
|---|---|
| **Off** (default) | The person cannot be paid through a request. Their tap, QR and request links do nothing. |
| **My contacts** | Only people the person has **sent money to before** can open their request. |
| **Everyone** | Any signed-in MoneyWise user who gets the request can pay it. |

The setting only covers requests. Normal MoneyWise payments, business pay links and quick-pay pages are not affected.

## The request

A request is a short-lived record on the server:

- `code`: random, single use, the only thing carried by NFC, QR or link
- who is asking (receiver user and workspace)
- amount (fixed) or none (the sender types it)
- optional note
- expiry: **2 minutes** for tap and QR, **24 hours** for a shared link
- status: OPEN, PAID, EXPIRED, CANCELLED

The code travels as a link: `https://<web origin>/r/<code>`. Opened on a phone with the app it opens the app; without the app it opens a web page that says to install it.

## The flow

1. **Receiver** opens Receive → Tap or scan. The app creates a request and shows a QR code, offers the NFC tap, and has a Share button.
2. **Sender** taps phones, scans the QR or opens the link.
3. The app asks the server to **resolve** the code. The server checks that the receiver's setting allows this sender, that the request is open and not expired, and answers with the receiver's name, the amount and the note.
4. The sender sees "Pay Mary Banda K50?", confirms with fingerprint or face.
5. The app makes the payment through the existing send path, carrying the request code. The server checks the code again, makes the transfer, and only on success marks the request PAID (it can be used once).
6. Both phones show the result. The receiver's phone is told by the server, never by the sender's phone.

## NFC on phones (what is possible)

- **Android to Android:** the receiver's phone pretends to be a tag (Host Card Emulation) holding the link. The sender's phone reads it. The old Android Beam is gone, so this is the way.
- **iPhone as sender:** an iPhone can read tags, so tapping an Android receiver works. With a universal link set up, an iPhone XS or newer can even open the app from the tap, without the app open.
- **iPhone as receiver:** an iPhone cannot act as a tag. iPhone receivers use the QR code, the link or the share sheet (AirDrop).
- Anything that does not work falls back to QR or the link, so nobody is blocked.

None of this runs in Expo Go. It needs a development build (`eas build --profile development`, already in `eas.json`) installed on real phones. Two Android phones are needed to test the full tap.

## What the server stores

- `users.tap_receive`: `OFF`, `CONTACTS` or `EVERYONE`, default `OFF`
- `pay_requests`: the request records above, plus who paid, when, and the payment it became

"My contacts" is worked out from past payments: the receiver has a MoneyWise payment to this sender. No separate contact list is kept.

## What the API offers

- `GET/PUT /tap/settings`: read or change the setting
- `POST /tap/requests`: create a request (receiver)
- `GET /tap/requests/:code`: resolve it (sender), rate limited
- `POST /tap/requests/:code/cancel`: receiver cancels
- The existing send path takes the code and checks it before it moves money.

## Safety rules

- The code is single use, expires, and is tied to one receiver.
- The sender always sees the receiver's name and the amount before confirming, and confirms with biometrics.
- The server decides the amount: a fixed request cannot be paid for a different amount.
- Resolving is rate limited and answers the same way for "not allowed" and "not found", so people cannot probe who has MoneyWise or who accepts requests.
- A fresh code per request, so an old tap or screenshot cannot be reused.
- The usual limits and checks (blocked accounts, daily limits, balance) still apply.

## Cards later

Nothing changes for the request. Today the sender pays from a MoneyWise wallet; once virtual cards exist, the sender's confirm step can offer "pay with my card" as the funding source.

## Build order

1. **Settings and requests on the server**, then the Expo screens: Tap to receive setting, Receive (QR, link, share), and Pay a request (resolve, confirm, pay). Works on any phone and the web.
2. **NFC read** on the sender (development build).
3. **NFC send** for Android receivers (development build).
4. **iPhone open-from-tap** with a universal link.

## To decide

1. Does "my contacts" mean people the receiver has **sent to** (as you described) or also people who have **sent to the receiver**?
2. Are two minutes right for tap and QR codes?
3. Should businesses (not only people) be able to receive by tap?

## Status (12 November 2026)

Built, not yet tried on phones:

- **Server and database:** the setting, requests, who may open them, the one-time claim, linking the payment. Tested against the live database (`apps/api/src/scripts/test_tap_pay.ts`).
- **Expo app:** Tap to pay hub (Menu and the Wallet Tap button), Settings → Tap to receive, Receive money (QR, link, share, live status), Pay someone (scan or paste), Pay a request. Scanning needs `expo-camera` installed.
- **Links opening the app:** the iPhone association file already covers `/r/*`. A request opened while signed out is remembered and opened after sign-in, in the app and on the web.
- **Tap (NFC), Android sending:** `apps/mobile/modules/tap-nfc` makes the phone look like a tag holding the request link while a request is showing. The phone that touches it reads the link with its normal tag reader. The byte layout is checked in `apps/api/src/scripts/test_nfc_ndef.ts` (a re-write of the logic; the Kotlin itself has not been compiled or run). App version is 0.4.0 because of the new native module, so it needs a new development build.
- **Web:** Settings → Tap to pay (setting, make a request with a QR code, paste a code), and the `/r/<code>` page that pays a request.

Still to do:

- **Android app links:** needs `/.well-known/assetlinks.json` on the web domain with the app's signing fingerprint (`eas credentials`). Without it, Android opens the link in the browser first. The `moneywise://r/<code>` button on the web page is the fallback.
- **Older iPhones (before the XS):** cannot read a tag without the app open; an in-app NFC reader is not built.
- **Try it on two phones** from a development build: Android receiver with NFC on, then an Android and an iPhone sender.
