import ActivityKit
import Foundation

/**
 What the "MoneyWise is offline" Live Activity shows.

 KEEP IDENTICAL to modules/offline-activity/ios/OfflineActivityAttributes.swift. The app starts and updates the activity; this widget
 extension draws it. ActivityKit pairs the two by the type's name and its Codable shape, so the two copies must not drift apart.
 */
public struct OfflineActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Things saved on the phone that have not reached MoneyWise yet.
        public var waiting: Int
        /// false while offline; true briefly after the connection is back (shows "Back online").
        public var online: Bool
        /// How many were sent when the connection came back (used with online == true).
        public var synced: Int

        public init(waiting: Int, online: Bool, synced: Int) {
            self.waiting = waiting
            self.online = online
            self.synced = synced
        }
    }

    public var startedAt: Date

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }
}
