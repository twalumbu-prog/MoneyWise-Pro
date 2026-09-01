import type { ExpoConfig } from 'expo/config';

/**
 * Bundle identifier is reverse-DNS of the production web app,
 * moneywise.blueopus.cloud. It is PERMANENT once the app ships — changing it
 * later means a brand-new store listing that loses installs and reviews.
 */
const BUNDLE_ID = 'cloud.blueopus.moneywise';

/** Public web origin. Backs universal/app links and anything we hand off to a browser. */
const WEB_ORIGIN = 'https://moneywise.blueopus.cloud';

const config: ExpoConfig = {
    name: 'MoneyWise Pro',
    slug: 'moneywise-pro',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'moneywise',
    userInterfaceStyle: 'light',
    // No newArchEnabled flag: SDK 57 is New Architecture only.

    // Pinned to the native ABI so an over-the-air update can never ship JS that
    // calls a native module the installed binary doesn't have. Bump only when
    // native dependencies change.
    runtimeVersion: { policy: 'appVersion' },
    updates: { fallbackToCacheTimeout: 0 },

    ios: {
        bundleIdentifier: BUNDLE_ID,
        supportsTablet: false,
        associatedDomains: [`applinks:${WEB_ORIGIN.replace('https://', '')}`],
        infoPlist: {
            // Receipts are the core input to a requisition; statements arrive as files.
            NSCameraUsageDescription:
                'MoneyWise uses the camera so you can photograph receipts and attach them to a request.',
            NSPhotoLibraryUsageDescription:
                'MoneyWise needs access to your photos so you can attach receipts and documents to a request.',
            NSFaceIDUsageDescription:
                'MoneyWise uses Face ID to unlock the app without re-entering your password.',
            ITSAppUsesNonExemptEncryption: false,
        },
    },

    android: {
        package: BUNDLE_ID,
        adaptiveIcon: { backgroundColor: '#EEF5FF' },
        intentFilters: [
            {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host: WEB_ORIGIN.replace('https://', '') }],
                category: ['BROWSABLE', 'DEFAULT'],
            },
        ],
    },

    plugins: [
        'expo-router',
        'expo-secure-store',
        'expo-font',
        ['expo-splash-screen', { backgroundColor: '#EEF5FF', resizeMode: 'contain' }],
        // The config plugin is what actually writes these strings into the native
        // projects; the infoPlist block above only covers the iOS side and Android
        // needs its own permission entries.
        [
            'expo-image-picker',
            {
                photosPermission:
                    'MoneyWise needs access to your photos so you can attach receipts to a request.',
                cameraPermission:
                    'MoneyWise uses the camera so you can photograph receipts and attach them to a request.',
            },
        ],
        // Sets the iOS deployment target to 16.4 -- expo-speech-recognition's
        // native module requires it (Apple's on-device Speech APIs used there
        // were introduced across 16.x). Every other native dependency here
        // supports the default 15.1, so this floor exists solely for
        // dictation. Reasonable for a 2026 app: iOS 16 shipped September
        // 2022, so this excludes only very old, unsupported hardware.
        ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
        [
            'expo-speech-recognition',
            {
                microphonePermission:
                    'MoneyWise uses the microphone so you can dictate a question to the Assistant.',
                speechRecognitionPermission:
                    'MoneyWise uses speech recognition to turn your dictation into text for the Assistant.',
            },
        ],
    ],

    experiments: {
        typedRoutes: true,
        // Metro honours tsconfig `paths` by default. This app maps `react` ->
        // ./node_modules/@types/react so tsc types RN 0.81 against React 19
        // instead of the hoisted root's React 18 — but that mapping is a
        // TYPE-only redirect, and at bundle time it made Metro try to load a
        // types-only package as runtime code. Type resolution and module
        // resolution must not share this config.
        tsconfigPaths: false,
    },

    extra: {
        // Mirrors apps/web's VITE_* vars. Values come from EAS env / .env at build
        // time; the web origin is a constant because it is where the app hands off
        // customer-facing payment pages.
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        webOrigin: WEB_ORIGIN,
    },
};

export default config;
