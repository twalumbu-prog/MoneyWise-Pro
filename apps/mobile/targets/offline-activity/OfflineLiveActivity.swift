import ActivityKit
import SwiftUI
import WidgetKit

/// The "MoneyWise is offline" Live Activity: the Dynamic Island on iPhones that have one, a banner on the lock screen on the rest.
/// The app starts it when the phone loses its connection and ends it when the connection is back (see OfflineActivityModule).

private let amber = Color(red: 0.96, green: 0.65, blue: 0.14)
private let green = Color(red: 0.20, green: 0.78, blue: 0.35)

private func tint(_ s: OfflineActivityAttributes.ContentState) -> Color { s.online ? green : amber }
private func symbol(_ s: OfflineActivityAttributes.ContentState) -> String { s.online ? "checkmark.circle.fill" : "wifi.slash" }
private func title(_ s: OfflineActivityAttributes.ContentState) -> String { s.online ? "Back online" : "Offline" }
private func detail(_ s: OfflineActivityAttributes.ContentState, stale: Bool) -> String {
    if stale && !s.online { return "Open MoneyWise to check the connection" }
    if s.online { return s.synced > 0 ? "\(s.synced) synced" : "All caught up" }
    if s.waiting == 0 { return "Working from your phone" }
    return s.waiting == 1 ? "1 saved on your phone" : "\(s.waiting) saved on your phone"
}

struct OfflineLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OfflineActivityAttributes.self) { context in
            // Lock screen / notification banner.
            HStack(spacing: 12) {
                Image(systemName: symbol(context.state))
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(tint(context.state))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(context.state)).font(.headline).foregroundColor(.white)
                    Text(detail(context.state, stale: context.isStale)).font(.subheadline).foregroundColor(.white.opacity(0.75))
                }
                Spacer()
                if !context.state.online && context.state.waiting > 0 {
                    Text("\(context.state.waiting)")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundColor(.black)
                        .frame(minWidth: 30, minHeight: 30)
                        .background(Circle().fill(amber))
                }
            }
            .padding(16)
            .activityBackgroundTint(Color.black.opacity(0.88))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: symbol(context.state))
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(tint(context.state))
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.state.online && context.state.waiting > 0 {
                        Text("\(context.state.waiting)")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(amber)
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(title(context.state)).font(.headline).foregroundColor(tint(context.state))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(detail(context.state, stale: context.isStale))
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.8))
                }
            } compactLeading: {
                Image(systemName: symbol(context.state)).foregroundColor(tint(context.state))
            } compactTrailing: {
                if !context.state.online && context.state.waiting > 0 {
                    Text("\(context.state.waiting)").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(amber)
                } else {
                    Text(context.state.online ? "OK" : "Off").font(.system(size: 12, weight: .semibold)).foregroundColor(tint(context.state))
                }
            } minimal: {
                Image(systemName: symbol(context.state)).foregroundColor(tint(context.state))
            }
            .keylineTint(tint(context.state))
        }
    }
}
