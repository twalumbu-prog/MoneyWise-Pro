import ExpoModulesCore
import UIKit
import UserNotifications

/** React Native bridge for iOS capture: connect/disconnect this iPhone, filter rules, notifications, status, flush. */
public class MomoCaptureModule: Module {
    public func definition() -> ModuleDefinition {
        Name("MomoCapture")

        Function("configure") { (options: [String: Any]) in
            let store = MomoCaptureStore.shared
            store.configure(apiUrl: options["apiUrl"] as? String, token: options["token"] as? String)
            if let rules = options["rules"] as? [String: Any] { store.setRules(rules) }
            if let notify = options["notify"] as? Bool { store.setNotify(notify) }
        }

        Function("setRules") { (rules: [String: Any]) in MomoCaptureStore.shared.setRules(rules) }

        Function("setNotify") { (on: Bool) in MomoCaptureStore.shared.setNotify(on) }

        Function("clear") { MomoCaptureStore.shared.clear() }

        Function("getStatus") { () -> [String: Any?] in
            var s = MomoCaptureStore.shared.status()
            s["intentAvailable"] = true
            return s
        }

        /** Would the phone keep this message? Lets the app's tester show the on-device verdict too. */
        Function("looksLikeMoneyMessage") { (text: String) -> Bool in MomoCaptureStore.shared.looksLikeMoneyMessage(text) }

        AsyncFunction("flush") { () async -> Int in
            await MomoCaptureStore.shared.flush()
        }

        /** Asks once for permission to show "captured" notifications. Resolves true when they're allowed. */
        AsyncFunction("requestNotificationPermission") { (promise: Promise) in
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { s in
                switch s.authorizationStatus {
                case .authorized, .provisional, .ephemeral: promise.resolve(true)
                case .denied: promise.resolve(false)
                default:
                    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in promise.resolve(granted) }
                }
            }
        }

        // Clipboard: reading the change count and probing patterns never shows the "pasted from" banner; only the
        // actual read (after the person taps Capture) does.
        Function("pasteboardChangeCount") { () -> Int in UIPasteboard.general.changeCount }

        AsyncFunction("pasteboardMightBeMessage") { (promise: Promise) in
            let pb = UIPasteboard.general
            guard pb.hasStrings else { promise.resolve(false); return }
            pb.detectPatterns(for: [.number, .probableWebURL]) { result in
                switch result {
                case .success(let found): promise.resolve(found.contains(.number) && !found.contains(.probableWebURL))
                case .failure: promise.resolve(false)
                }
            }
        }
    }
}
