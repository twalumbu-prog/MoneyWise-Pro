# MoneyWise Pro mobile app: UI design guide

A plain-language description of how the app looks and is laid out, written so the design can be rebuilt in any tool. All sizes are in points (pt), the unit used on phones. Colors are given as hex codes.

---

## 1. The feel of the app

- Light, clean and calm. Soft grey page background, white rounded cards on top of it, one strong blue for anything you can act on.
- Generous rounded corners everywhere (cards, buttons, sheets). Almost nothing has sharp corners.
- Borders are hairline thin and very light. Shadows are rare and soft.
- Mostly text and simple line icons. Colour is used sparingly: blue for actions, green for money in, amber for pending, red for errors and alerts.
- Light mode only. There is no dark theme.
- Phone, portrait only.

---

## 2. Colors

**Page and surfaces**
- Page background: `#F9FAFB` (very light grey). The AI chat page uses white instead.
- Cards, sheets, tab bar, inputs: `#FFFFFF`.
- Selected chip or option background: `#F0F7FF` (very light blue).
- Track behind a segmented switch, and selected filter chip: `#F0F1F5` (light grey).
- Light border (cards, pills): `#F3F4F6`.
- Stronger border (inputs, dividers, list card edges): `#E5E7EB`.

**Text**
- Main text: `#111827`. Big page titles are pure black `#000000`.
- Secondary text and icons: `#6B7280`.
- Captions, placeholders, inactive tab: `#9CA3AF`.
- Dark navy for card headings, sheet titles and the organisation name: `#002E3B`.

**Brand and status**
- Primary blue (buttons, links, active tab, round "+" button): `#006AFF`.
- Brand green: `#03D47C`. Money-in text: `#059669`. Money-in icon background: `#E4FAF1`.
- Pending or warning amber: `#B45309`. Offline banner: text `#9A5B00` on `#FFF7E6`.
- Error and alert red (badges, Sign Out, delete): `#EF4444`.
- Brand pink accent: `#FF2970` (rarely used).

**Dark gradient cards** (wallet cards and the Reporting headline card): left-to-right from `#0F172A` to `#172554` (deep navy). White text on them.

**Sheet backdrop:** navy-tinted dark overlay, roughly 50% opacity.

---

## 3. Typography

- One family throughout: **DM Sans**, in three weights: Regular (body), Medium (labels, buttons, row titles), Bold (titles, amounts, section headings).
- A second, decorative face called **Advercase** is used only for the Home title and the "MoneyWise" brand text on the login screen.

| Use | Size and weight |
|---|---|
| Big page title on main tabs | 30, Bold, black (AI chat page: 26) |
| Top bar title on pushed pages | 17, Bold |
| Sheet title | 19, Bold, navy |
| Card or section title | 14 to 15, Bold |
| Large hero number (Reporting) | 32, Bold, white |
| Row title / main text | 14 to 15, Regular or Medium |
| Input text | 14, Regular |
| Field label (above an input) | 12, Medium, grey |
| Captions, meta lines | 10 to 11, grey |
| Tab bar labels | 11, semibold |
| Date headers above lists | 12, Bold, black |

---

## 4. Shape, spacing and depth

- **Page side margin:** 20 on both sides, always.
- **Gap between stacked cards:** 14 to 16.
- **Card padding:** 18 to 20.
- **Corner radius:** small 8, medium 16 (inputs, buttons, action bars), large 24 (cards), extra large 28, pill = fully round. Wallet cards 18. Bottom sheets 24 on the top corners. Round icon buttons are fully round.
- **Borders:** 1 thin line in the light border colour on cards; inputs use the stronger border.
- **Shadow:** most cards have none. Home cards, the AI input bar and the round "+" button have a soft shadow (subtle for cards, stronger for the round button). The sliding highlight in a segmented switch has a tiny shadow.
- **Bottom space:** scrolling lists keep about 100 to 120 of empty space at the bottom so the last item clears the tab bar.
- **Press feedback:** tapped items fade to about 60 to 70% opacity. No colour change.
- **Touch size:** buttons are at least 40 tall. Small icons get extra invisible tap area.

---

## 5. App structure and navigation

### 5.1 The bottom tab bar
Five tabs, always visible on the main screens: white bar, thin light top border, about 58 tall plus the phone's bottom safe area. Icon above a short label (11). Active tab is blue, inactive is light grey. The bar hides when the keyboard is open. Switching tabs does a soft cross-fade with a tiny sideways shift.

| Tab | Icon | Page |
|---|---|---|
| Inbox (businesses) or Home (personal accounts) | Arrow / House | Requests list, or the personal home page |
| Wallet | Wallet cards | Wallets, balances, transactions |
| Intelligence | Star-burst | AI assistant, insights, automations |
| Reporting | Trending line | Profit/loss and net worth |
| Menu | Menu | Profile, settings, other services |

Staff with the "requestor" role do not see Wallet or Intelligence.

### 5.2 Pages that open on top of the tabs
Tapping into something pushes a new full-screen page. Two kinds of motion:
- **Slides in from the right:** normal drill-down (a request, a savings goal, a settings page, a payroll run, a transaction).
- **Slides up from the bottom:** things you create or do (new request, deposit, transfer, new wallet, pay link, import, manual entry, run payroll, add staff).
- A few use a plain fade (joining a savings group) or appear as an overlay with no animation (public payment pages).

### 5.3 Opening the app
A white screen with the black stroke logo fades in, then a quiet "A product by Blue Opus Software" line. It stays until the person is signed in and their saved data has loaded, then fades away. After that the app decides: pending approval, pick an organisation, finish onboarding, or go to the tabs.

---

## 6. Page templates

### Template A: main tab page
- No top bar. A big bold title sits at the top-left (30), a little below the status bar. Round icon buttons sit at the top-right on the same line.
- Content scrolls under it with 20 side margins. Pulling down refreshes (blue spinner).
- Background light grey.

### Template B: pushed detail or settings page
- **Top bar:** a back arrow on the left, the title centred (17 Bold, one line), an optional action on the right. No visible bar background; it sits on the grey page.
- Below it, a scrolling stack of white cards (20 margin, 14 gap, extra 48 at the bottom).

### Template C: form page
Same as B. Each group of fields lives in one white card. A small bold heading at the top of the card, then fields: a grey 12 label above each input, 14 between fields. Inputs have a thin grey border, 16 corners, 14 text. A blue save button appears once something has been changed. Long pick lists use the "search select" described below.

### Template D: bottom sheet
A panel rising from the bottom over a dimmed page. White, rounded 24 at the top, a small grey handle bar centred at the top, a header row (title on the left, small grey round close button on the right) with a faint line under it, then the content with 20 padding. It never covers more than about 85% of the screen.

### Template E: full-screen flow
Create flows (new request, deposit, transfer) are full pages that slide up, with a close or back control at the top and one clear primary action at the bottom.

---

## 7. Components

**Round icon button.** 40 across, white, thin light border, a 18 grey line icon. An optional red count badge sits on its top-right corner (18 across, white number, small ring in the page colour). Used in page headers (inbox, calendar, account).

**Header pill button.** 40 tall, fully round, white with a thin border, an icon and a bold 14 label (for example "Savings", "Budgets").

**Segmented switch.** A light-grey rounded track with two or three options. The active option is a white pill that slides smoothly under the selected label, with a tiny shadow. Labels 13 Bold; active black, inactive grey. The content below slides sideways in the direction of the change.

**Filter chips.** A horizontally scrolling row of small rounded pills (12 Bold). White with a thin border; the selected one is light grey with darker text.

**Search field.** A fully round white pill with a thin border, a small magnifier icon at the left and a clear (X) at the right once text is typed.

**Primary button.** Solid blue, 16 corners, white bold text (13 to 15), 10 to 16 tall padding, often an icon beside the label. A lighter "ghost" button (outline or text) is the secondary choice.

**Round "+" button (floating).** 56 across, solid blue, white plus, large soft shadow, fixed at the bottom-right 20 from the edges. Used on the Inbox (opens the "New" menu) and Payroll.

**Card.** White, 24 corners, thin light border, 18 to 20 padding. Optional header row: bold 14 title on the left, "See all ›" on the right.

**Stacked day card (lists).** Items that belong to one date sit in a single white card that looks joined: only the first item has rounded top corners and only the last has rounded bottom corners, with side borders running through. A small bold date label sits above each card.

**Dark card.** Navy gradient, 18 corners, white text. The wallet card is 148 tall and shows the wallet name, balance and the organisation name, with small dots for the carousel position.

**Action bar.** A white rounded strip (16 corners, thin border) with two or three actions side by side. Each action is an icon plus a 14 label, separated by thin vertical divider lines. Examples: Deposit | Transfer | Pay Link.

**List row.**
- Money row: a 34 round icon on the left (soft green circle for money in, light grey for money out), the description (14), a small grey meta line below it (11), the amount on the right (14 Bold, green when money in), and a small amber "pending" tag where relevant.
- Request row: a tiny grey requester line (with a blue "NEW" pill when unread), the description (14) with the amount on the right, and a status line (small icon plus text). Status icons are a blue clock or tick-circle, a green tick, a red alert, or a grey undo arrow.
- Settings row: icon, bold 14 label, small grey description underneath, a chevron on the right, thin separator lines.

**Choice chips (in forms).** Rounded pills; selected is light blue fill, blue border and blue text; unselected is white with a grey border.

**Search select.** Looks like an input. Tap it and it turns into a search box, and the matching options drop down right beneath it as you type. Picking one fills the field and closes the keyboard.

**Option tiles (menu grid).** Three per row, white, 24 corners, thin border. A rounded blue square with a white icon on top and a 12 label underneath.

**Avatars and logos.** Round photos (56, or 84 with a blue ring for personal accounts). Bank logos appear in a small round tile; if no logo exists, a coloured circle with the bank's initials.

**Loading.** A small blue spinner centred in the area. The wallet shows a white card-sized placeholder with a spinner. Pages show their last saved data instantly and refresh quietly behind it.

**Empty state.** A centred grey line ("No requests yet." / "Nothing matches that filter.") with a smaller grey hint under it.

**Error state.** A card with a bold title ("Couldn't load requests"), the reason, and "Pull down to try again."

**Offline banner.** A rounded amber strip with a small crossed-out wifi icon: "Can't reach MoneyWise right now, showing your last saved data. Pull down to try again."

**"Coming soon".** A simple alert box saying the feature lands in a later update and is available on the web app now.

**Slide to pay.** A long rounded track with a 56 round thumb and a label. Drag the thumb to the far end and let go to confirm. Light taps are felt at 20, 40, 60 and 80%; a firm tap when it locks in. Let go early and it springs back. A spinner shows while the payment runs.

**PIN pad.** A row of dots at the top, a 3 by 4 number pad below (with a delete key and an optional Face ID key). The dots shake and clear on a wrong PIN.

**Guided tour.** Dimmed overlay with a highlighted spot and a small tip card; a "Getting started" checklist behind a blue trophy button; tip cards sit at the top of lists.

---

## 8. The main screens

### Home (personal accounts)
Top: "Home" title in the decorative face, three round buttons on the right (inbox with count badge, calendar, account). Below, scrolling cards 16 apart:
1. A tip card (while the person is new).
2. **Accounts card:** up to three wallets with their balances and the MoneyWise logo; "See all" jumps to Wallet.
3. **Quick actions strip:** "Receive Money" and "Send Money" side by side in one white rounded strip.
4. **Insights card:** swipeable slides: overview of this month's spending, investments, savings, upcoming payments, updates.
5. **Other services card:** tiles for Invest, Loans, Marketplace.
Pinned at the very bottom: the **Assistant bar**, a tall white pill (56) with "Ask me to do anything", a microphone button (turns red with a moving wave while listening) and a round blue send arrow.

### Inbox (businesses)
Title and three round buttons (blue trophy for the checklist, calendar, account). A two-option switch: **Outflows** (up-right arrow) and **Inflows** (down-left arrow); the selected label turns blue. Search pill, then a row of status filter chips. Below, requests grouped by date in stacked day cards. Round blue "+" at the bottom-right opens a sheet listing what can be created (new request, manual entry, log received money, salary advance, staff loan, invest, payroll), with role-dependent options. Each choice is a row with a 48 white icon tile, a bold title and a small grey subtitle.

### Wallet
Title with a "Savings" pill on the right. Switch: **Main Wallets | External Accounts**. A sideways-swiping carousel of dark wallet cards (snap to each card) ending in a dashed "Add Wallet" card. Under it the action bar (Deposit, Transfer, Pay Link for main wallets; Transfer, Import statement for external accounts). Then a "Transactions" heading (20 Bold) with search and sort icons, then transactions grouped by date. Pulling down refreshes the bank connection, not just the screen.

### Intelligence (AI)
White page. Title with a new-chat button. A three-option pill row: **Assistant | Data Insights | Automations**. The assistant is a chat: message bubbles, confirmation cards for actions that need approval, and the text bar with mic and attach fixed at the bottom, rising with the keyboard.

### Reporting
Title with a "Budgets" pill and round buttons. Switch: **Net Worth | Profit/Loss**. A dark navy card with a small grey label ("TOTAL PROFIT" or "NET WORTH"), a big white figure and a small chevron that opens the full chart. Below it a "Financial highlights" card (swipeable summaries). A toolbar with the date range (tap to pick dates, X to clear) and two round icon buttons (hide zero accounts, sort). Then collapsible groups (Income, Expenses, Assets, Liabilities, Equity); tap an account to expand its items; a thin blue progress bar shows spending against budget. The chart view has timeframe chips.

### Menu
Title. A profile card (photo, name, role in small spaced capitals, email). A two-option switch **General | Rewards**. General shows an "Other Services" card (three-column tile grid: Audit, Products, Apps, Invest, Loans, Marketplace; personal accounts only see Invest, Loans, Marketplace), then settings rows (Profile, Preferences, Mobile money capture, Customer rewards, Security, KYC profile, General, Chart of accounts, Team, Integrations, Investor payouts), and finally a white **Sign Out** button with red text.

### Request detail
Top bar with back arrow. A progress stepper showing where the request is. Tabs for conversation, attachments and audit. The conversation is a thread of cards (system updates and actions). Action buttons open bottom sheets (disburse, change, loan recovery, accounting post, receipt capture).

### Settings pages
Template B/C: stacked white cards, grouped fields, choice chips, search selects, a save button that appears when something changes.

### Apps
A hub with one card per app: blue rounded square icon, bold name, short description, a small green "Active" mark and a full-width blue "Open App" button. Payroll uses a list of runs and staff with a round "+" button (run payroll, or add staff). Invest shows providers with logos, switch tabs, detail pages and a payment flow.

### Savings
A balance card, a progress bar toward the goal, small overlapping member avatars, and bottom sheets for creating a goal, adding money, transferring out and joining a group.

### Login
Pale grey background. The logo mark and "MoneyWise" in the decorative face, centred at the top. Email and password fields, a blue sign-in button and Apple and Google sign-in buttons.

### Onboarding
A step-by-step wizard with a progress bar at the top and Back / Continue buttons at the bottom of each step: welcome, contact, address, logo, industries, categories, products, chart of accounts, wallet activation. Ends with confetti and a completion screen.

---

## 9. Behaviour and motion

- **Pull down** on any list to refresh (blue spinner).
- **Switching a segmented switch:** the white pill glides to the new option and the content slides and fades in the matching direction.
- **Carousels** snap card by card.
- **Haptics** (small vibrations) on slide-to-pay and key confirmations.
- **Keyboard:** the page lifts above it; the tab bar hides; number pads on iPhone get a "Done" bar.
- **Security:** an optional app lock with a PIN and Face ID / fingerprint; sensitive payments ask for the PIN.
- **Notifications:** tapping one opens the screen it is about; the app icon badge shows how many things need attention.
- **Offline:** the last saved data is always shown first, with the amber banner if a refresh fails.

---

## 10. Variations by person

- **Personal account vs business:** the first tab becomes Home (with the assistant bar) instead of the Inbox; the Inbox moves behind a bell; the Menu shows the person's own photo and name; some tiles (Audit, Products, Apps) are hidden.
- **Requestor role:** no Wallet or Intelligence tabs, and fewer choices in the "New" sheet.
- **Cash handlers and admins:** extra actions (disburse, deposit change, loan recovery) appear in request details; admins are sent through onboarding first.

---

## 11. How to rebuild this design: checklist

1. Set the page colour to `#F9FAFB`, cards white, and use only the colours in section 2.
2. Use DM Sans only; follow the size table in section 3. Use the decorative face just for the Home title and the login brand.
3. Keep a 20 side margin and a 14 to 16 gap between cards. Cards are white, 24 corners, thin light border.
4. Give every main tab a big 30 bold title at the top-left with round 40 icon buttons at the top-right, and no top bar.
5. Give every pushed page a back arrow, a centred 17 bold title, and a stack of white cards.
6. Use the segmented switch (light track, sliding white pill) for every two- or three-way view change on a page; use filter chips for filtering.
7. Use bottom sheets for quick choices and small forms; use slide-up full pages for longer creation flows.
8. Use one solid blue button for the main action on a page; the round "+" button for "create something" on list pages.
9. Show loading as a small blue spinner, empty as a centred grey line, errors as a card with "Pull down to try again", and offline as the amber banner.
10. Money in is green with a soft green icon; pending is amber; errors and alerts are red; everything else is black or grey.
11. Make all dark summary cards the navy gradient with white text (wallet cards, the Reporting headline).
12. Keep tapped items at 60 to 70% opacity, tap targets at least 40, and bottom padding of 100 to 120 on scrolling main pages.

---

## 12. Known inconsistencies (worth fixing when you rebuild)

- Two page-title styles exist: the decorative face on Home and the plain bold face everywhere else. The AI page title is 26 instead of 30.
- Many small colours (blacks, greys, blues) are slightly different from page to page; unify them to the palette in section 2.
- Bottom sheets and buttons are drawn slightly differently from screen to screen; make one shared version of each.
- The app's colours match an older version of the website. The website's newer look (softer `#F8FAFD` backgrounds, deeper `#0059D8` blue buttons) has not been applied to the app.
- Loans, Marketplace and recording a sale are placeholders that show a "coming later" message.
