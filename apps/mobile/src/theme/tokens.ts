/**
 * Design tokens mirrored from apps/web/tailwind.config.js and src/index.css.
 *
 * Hand-mirrored for now; PLAN.md §4.1 replaces this with a codegen step so a
 * palette change on web cannot silently skip the app.
 */
export const colors = {
    // Brand — identical values to the web Tailwind config.
    green: '#03D47C',
    blue: '#006AFF',
    navy: '#002E3B',
    pink: '#FF2970',

    // Surfaces — every main route (Inbox, Schedules, Wallet, Reporting, Menu)
    // paints Tailwind's bg-gray-50 (#F9FAFB) behind it on web.
    canvas: '#F9FAFB',
    canvasAlt: '#F9FAFB',
    surface: '#FFFFFF',
    tabActiveBg: '#F0F7FF',
    chipActiveBg: '#F0F1F5',

    border: '#F3F4F6',
    borderStrong: '#E5E7EB',

    text: '#111827',
    textMuted: '#6B7280',
    textFaint: '#9CA3AF',

    danger: '#EF4444',
    positive: '#03D47C',
    positiveInk: '#059669',
    warn: '#B45309',
} as const;

export const radius = { sm: 8, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Advercase is the display face on web but ships only as .woff2, which React
 * Native cannot load — the .ttf/.otf originals and an embedding licence are
 * still outstanding (PLAN.md §4.1). Until then the app falls back to the DM Sans
 * stack, which is already the web body face.
 */
export const fonts = {
    display: 'DMSans_700Bold',
    body: 'DMSans_400Regular',
    bodyMedium: 'DMSans_500Medium',
    bodyBold: 'DMSans_700Bold',
} as const;

/** Bottom tab bar height, matching the web mobile nav (88px). */
export const TAB_BAR_HEIGHT = 88;
