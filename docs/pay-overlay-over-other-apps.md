# Pay overlay on top of the app you were in — scoping

Goal: someone taps a MoneyWise pay link in a browser (or WhatsApp, Messages…). Instead of being taken *into* MoneyWise, the
"slide to pay" sheet appears over the app they were in, with that app still visible behind it, like Apple Pay / Google Pay.
Written 2026-10-28. Estimates are working days for one developer and are rough until the spikes are done.

## Where things stand

Opening `https://<host>/pl/<token>` or `/pay/<username>` on a phone with MoneyWise installed opens MoneyWise (universal link on
iPhone, App Link on Android) and shows the overlay as a transparent modal over MoneyWise's own screen. The app they came from is
no longer on screen. On Android, closing the overlay returns to the app the link came from (shipped).

The project generates its native code at build time (`ios/` and `android/` are not committed), so anything native is added through
config plugins, as the `momo-capture` module already is. Expo 54, React Native 0.81, `expo-router`.

## The short answer

| | Can it show over the previous app? | Worth building? |
|---|---|---|
| **Android — transparent window** | Yes. A second, translucent screen opened by the same link. | **Yes.** About 7–10 days, with a 1–2 day spike first. |
| **iPhone — App Clip** | **Not for people who have the app.** | **No** for this goal. It only helps people who *don't* have the app, and they can't pay without an account and funds anyway. |
| **iPhone — anything else** | No supported way for an installed app to draw over Safari or WhatsApp. | Use the cheaper options below. |

## iPhone: why an App Clip doesn't solve it

An App Clip is the card Apple shows over Safari or Messages without leaving them, which is why it looks like the right tool. The
catch is when it appears: Apple's documentation says that once the full app is installed, App Clip links and codes **open the full
app instead**, and the full app is expected to handle the link ([Apple: App Clips](https://developer.apple.com/app-clips)). So for
the person in your example, who has MoneyWise, the link would still switch to MoneyWise exactly as it does today. Developers also
report the card sometimes appearing on top of the installed app and no supported way to suppress it
([Apple Developer Forums](https://developer.apple.com/forums/thread/844487),
[another thread](https://developer.apple.com/forums/thread/704913)).

What an App Clip would actually be for: someone with **no** MoneyWise app. For them to pay they would also need an account and a
funded wallet, which a clip can't give them, so the clip would end at "sign up / install". That is a growth feature, not a payment
feature.

If you still want one later, the shape of the work is:

- A second Xcode target (`cloud.blueopus.moneywise.Clip`) added with the `@bacons/apple-targets` config plugin, plus an
  `appclips:` associated-domain entry and an App Clip experience set up in App Store Connect.
- A size budget. Apple's current limits are 15 MB, or 100 MB if the clip targets iOS 17+ and is only invoked by URL; the plugin's
  own docs quote older numbers, so measure with the App Thinning report
  ([Apple: build file sizes](https://developer.apple.com/help/app-store-connect/reference/maximum-build-file-sizes/),
  [plugin docs](https://www.mintlify.com/EvanBacon/expo-apple-targets/targets/app-clips)). A React Native runtime is a large
  share of that, so a clip is normally written natively in SwiftUI.
- Signing in inside the clip (it has a separate keychain until the full app is installed), then the same resolve / slide / verify /
  pay calls the app uses today.
- Estimate: 10–15 days plus Apple review cycles, for a flow most existing users would never see.

## iPhone: what we can do instead

1. **Return to the page after paying (about 1 day).** When the pay link is opened from a MoneyWise button on the website, the web
   page passes its own address along; after "Paid", the app opens it again so the person lands back in Safari on that page,
   which now says it has been paid. This does not help when the link was tapped in WhatsApp or Messages (iOS gives apps no way to
   go back to the previous app).
2. **Make the in-app flow as short as possible (already done).** One sheet, one slide, one PIN or Face ID.
3. **A "pay with MoneyWise" button on the public pay pages (about 1 day)** that opens the app deliberately, so people who tap the
   page's own button get the return-to-page behaviour above.

## Android: transparent window

### How it works

Android draws a translucent screen over whatever was on screen before it
([Android: ChromeOS rendering notes](https://developer.android.com/topic/arc/differences)). So a second MoneyWise screen with a
translucent theme, opened by the pay-link App Link, shows the browser behind the sheet. It is the same mechanism system dialogs
from other apps use (permission prompts, for example). Manifest settings used for this kind of screen: a translucent theme, an
empty task affinity, excluded from recents
([Android: activity element](https://developer.android.com/guide/topics/manifest/activity-element)).

### Work

| Step | What | Days |
|---|---|---|
| Spike | A throwaway second screen with a translucent theme, opened by the link, hosting React Native. Confirm: browser visible behind, back button returns to the browser, biometric prompt works from it, no flash of the MoneyWise app. | 1–2 |
| Config plugin | Adds the second screen to the manifest (translucent theme, own intent filter for `/pl/*` and `/pay/*` at higher priority than the main screen, no entry in recents) and a small Kotlin class for it. | 2 |
| React side | A separate entry for the overlay with its own providers (query client, sign-in, app-lock), reusing `PayLinkOverlay` unchanged. Signed-out handling inside the overlay. | 2 |
| Polish | Back button, closing returns to the browser, the "Money sent" popup shown inside the overlay instead of the main app, edge cases (app already open, locked, offline). | 2 |
| Test | Real devices (Pixel and a Samsung), Chrome, WhatsApp, Gmail, Android 12–15. | 2 |
| **Total** | | **7–10** |

### Risks and unknowns

- **A second React Native screen in one app** is supported by React Native but I found no Expo-specific documentation for it, so it
  needs the spike before anything else.
- **App Link verification.** Android only hands links straight to the app when the domain is verified, which needs the website to
  serve `/.well-known/assetlinks.json` with the app's signing fingerprint. This is needed today for the existing overlay too and is
  **not done yet**; it takes a few minutes once we have the fingerprint from the Play / EAS credentials.
- **Two screens match the same link.** The overlay screen has to win over the main screen without an app chooser appearing.
- **Some browsers** (in-app browsers inside other apps) open links in their own window and don't use App Links at all; those cases
  fall back to the normal flow.
- **Lock screen.** The overlay sits outside the main screen's lock; the PIN / biometric check before paying covers it, and we
  should decide whether to also require the app lock when the app was locked.

## Recommendation

1. Add the Android `assetlinks.json` (minutes) — nothing on Android works without it.
2. Run the 1–2 day Android spike. If the browser shows behind the sheet as expected, build the rest (about a week).
3. On iPhone, do the return-to-page option (1 day) and the website button (1 day). Skip the App Clip unless the goal changes to
   signing up new people from a pay link.

## Decisions needed

- Is Android first, with iPhone staying in-app plus return-to-page, acceptable?
- Can I get the Android signing fingerprint (Play Console → App integrity, or `eas credentials`) to publish `assetlinks.json`?
- Should the overlay require the app lock when the app was locked, or is the PIN / Face ID check before paying enough?
