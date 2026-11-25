/**
 * The widget extension that draws the "MoneyWise is offline" Live Activity (Dynamic Island / lock screen).
 * Read by @bacons/apple-targets at `expo prebuild`: it adds an extension target to the Xcode project from the Swift files in this folder.
 * Live Activities need iOS 16.1+; the app itself is 16.4+, so the extension follows it.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
    type: 'widget',
    name: 'OfflineActivity',
    displayName: 'MoneyWise offline',
    deploymentTarget: '16.4',
    frameworks: ['SwiftUI', 'ActivityKit', 'WidgetKit'],
});
