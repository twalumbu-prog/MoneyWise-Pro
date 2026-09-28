#!/usr/bin/env node
/**
 * A free/personal Apple Developer team cannot provision the Push
 * Notifications capability at all — Xcode refuses to build with the
 * entitlement present. expo-notifications gets auto-configured by Expo's
 * prebuild (@expo/prebuild-config's withVersionedExpoSDKPlugins) purely
 * because the package is installed, regardless of app.config.ts's `plugins`
 * array, so there's no config-level way to opt out. Run this after every
 * `expo prebuild`/`expo run:ios` for a personal-team on-device test build to
 * strip the entitlement Expo just added back out.
 *
 * Usage: node scripts/strip-personal-team-entitlements.js
 */
const fs = require('fs');
const path = require('path');

const entitlementsPath = path.join(__dirname, '..', 'ios', 'MoneyWisePro', 'MoneyWisePro.entitlements');

if (!fs.existsSync(entitlementsPath)) {
    console.error(`[strip-personal-team-entitlements] Not found: ${entitlementsPath} — run expo prebuild first.`);
    process.exit(1);
}

let contents = fs.readFileSync(entitlementsPath, 'utf8');
const before = contents;

// Remove the <key>aps-environment</key><string>...</string> pair (order/whitespace-tolerant).
contents = contents.replace(/\s*<key>aps-environment<\/key>\s*<string>[^<]*<\/string>/, '');

if (contents === before) {
    console.log('[strip-personal-team-entitlements] No aps-environment entry found — nothing to strip.');
} else {
    fs.writeFileSync(entitlementsPath, contents);
    console.log('[strip-personal-team-entitlements] Removed aps-environment from MoneyWisePro.entitlements.');
}
