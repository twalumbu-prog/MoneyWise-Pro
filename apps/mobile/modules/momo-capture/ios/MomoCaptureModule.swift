import ExpoModulesCore
import UIKit

/** React Native bridge for iOS capture: connect/disconnect this iPhone, status, offline flush, clipboard checks. */
public class MomoCaptureModule: Module {
    public func definition() -> ModuleDefinition {
        Name("MomoCapture")

        Function("configure") { (options: [String: Any]) in
            MomoCaptureStore.shared.configure(apiUrl: options["apiUrl"] as? String, token: options["token"] as? String)
        }

        Function("clear") { MomoCaptureStore.shared.clear() }

        Function("getStatus") { () -> [String: Any?] in
            var s = MomoCaptureStore.shared.status()
            s["intentAvailable"] = true
            return s
        }

        AsyncFunction("flush") { () async -> Int in
            await MomoCaptureStore.shared.flush()
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
