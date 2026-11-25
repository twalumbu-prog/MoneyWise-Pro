import ExpoModulesCore
import ActivityKit

/**
 Starts, updates and ends the "MoneyWise is offline" Live Activity (Dynamic Island on iPhones that have one; lock screen banner on the rest).

 iOS only lets an app START a Live Activity while it is in the foreground, which suits this: the app notices it went offline while the
 person is using it, starts the activity, and from then on the island / lock screen keeps showing it after they leave the app. Only the
 app can update or end it, so the activity carries a stale date: if the phone is offline for hours and the app is not opened, iOS marks
 it stale and the widget says to open MoneyWise rather than pretending it is still checking.
 */
public class OfflineActivityModule: Module {
    private static let staleAfter: TimeInterval = 6 * 3600

    public func definition() -> ModuleDefinition {
        Name("OfflineActivity")

        /// Is a Live Activity possible here (iOS 16.2+, and not switched off in Settings)?
        Function("isSupported") { () -> Bool in
            if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
            return false
        }

        /// Shows the activity (or refreshes it if one is already up).
        AsyncFunction("show") { (waiting: Int, online: Bool, synced: Int) async -> Bool in
            guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
            let state = OfflineActivityAttributes.ContentState(waiting: waiting, online: online, synced: synced)
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(Self.staleAfter))
            if let current = Activity<OfflineActivityAttributes>.activities.first {
                await current.update(content)
                return true
            }
            do {
                _ = try Activity.request(attributes: OfflineActivityAttributes(startedAt: Date()), content: content, pushType: nil)
                return true
            } catch {
                return false
            }
        }

        /// Ends the activity. `dismissAfter` seconds lets "Back online" stay visible briefly before it goes.
        AsyncFunction("end") { (waiting: Int, synced: Int, dismissAfter: Double) async in
            guard #available(iOS 16.2, *) else { return }
            let state = OfflineActivityAttributes.ContentState(waiting: waiting, online: true, synced: synced)
            let content = ActivityContent(state: state, staleDate: nil)
            for activity in Activity<OfflineActivityAttributes>.activities {
                await activity.end(content, dismissalPolicy: dismissAfter > 0 ? .after(Date().addingTimeInterval(dismissAfter)) : .immediate)
            }
        }
    }
}
