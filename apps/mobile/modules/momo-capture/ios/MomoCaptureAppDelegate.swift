import ExpoModulesCore
import UIKit
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif

/**
 * Registers the background retry for captured messages that couldn't be sent (no signal). It has to be registered
 * while the app is launching, which also happens when iOS starts MoneyWise in the background to run the Shortcuts
 * action. Scheduling is best-effort: iOS decides when a refresh actually runs.
 */
public class MomoCaptureAppDelegate: ExpoAppDelegateSubscriber {
    private static var registered = false

    public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if canImport(BackgroundTasks)
        if !Self.registered {
            Self.registered = true
            BGTaskScheduler.shared.register(forTaskWithIdentifier: MomoCaptureStore.flushTaskId, using: nil) { task in
                MomoCaptureStore.shared.handleBackgroundFlush(task)
            }
        }
        #endif
        return true
    }

    public func applicationDidEnterBackground(_ application: UIApplication) {
        MomoCaptureStore.shared.scheduleBackgroundFlush()
    }
}
