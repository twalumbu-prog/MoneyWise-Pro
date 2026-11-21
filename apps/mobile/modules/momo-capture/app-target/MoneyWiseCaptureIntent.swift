import AppIntents
import MomoCapture

/**
 * "Capture mobile money message" — appears in the Shortcuts app as soon as MoneyWise is installed (no iCloud link,
 * no key to paste). The person adds it to a "When I get a message containing ZMW → Run Immediately" automation; the
 * key it sends with was stored when they connected this iPhone in MoneyWise.
 *
 * Lives in the app target (copied in by modules/momo-capture/plugin) because Shortcuts only discovers App Intents
 * compiled into the app itself.
 */
struct CaptureMobileMoneyMessage: AppIntent {
    static var title: LocalizedStringResource = "Capture mobile money message"
    static var description = IntentDescription("Sends a mobile money SMS to MoneyWise so the transaction can be booked.")
    static var openAppWhenRun: Bool = false

    // Shortcuts doesn't fill this from the automation's input by itself (checked on iOS 26.5), so setup tells the
    // person to set it to Shortcut Input.
    @Parameter(title: "Message", requestValueDialog: "Which message should MoneyWise capture?")
    var message: String

    static var parameterSummary: some ParameterSummary {
        Summary("Send \(\.$message) to MoneyWise")
    }

    func perform() async throws -> some IntentResult {
        await MomoCaptureStore.shared.send(text: message, source: "IOS_SHORTCUT")
        return .result()
    }
}

struct MoneyWiseAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureMobileMoneyMessage(),
            phrases: ["Capture mobile money with \(.applicationName)"]
        )
    }
}
