import Foundation
import Security
import UserNotifications
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif

/**
 * iOS side of mobile money capture.
 *
 * The Shortcuts automation fires on (almost) every message, so the first job is a filter on the phone: only text that
 * looks like a mobile money / bank message is kept, and everything else is dropped right here. It never leaves the
 * iPhone. The rules can be updated from the server (`setRules`), so new banks don't need an app release.
 *
 * Kept messages are **saved first, sent second**. The App Intent writes the message to a local queue and returns within
 * a few seconds, so iOS never cuts the automation off mid-request (which is what lost messages before: the old code
 * waited on the network and only saved after a clean failure). The queue is sent in order with short timeouts, and an
 * item is removed only once the server has answered. Anything left goes out with the next message, when the app opens,
 * or in a background refresh.
 *
 * After each capture a local notification says what happened, e.g. "New: K2.00 received", "Already in MoneyWise",
 * or "Saved on your phone, will send when you're online", and names the workspace it went to.
 */
public final class MomoCaptureStore {
    public static let shared = MomoCaptureStore()
    public static let flushTaskId = "cloud.blueopus.moneywise.momo-capture.flush"

    public enum Outcome: String { case filtered, saved, sent, noKey }

    private enum PostResult { case sent([String: Any]), offline, serverError, rejected, bad }

    private let service = "cloud.blueopus.moneywise.momo-capture"
    private let tokenAccount = "capture-token"
    private let defaults = UserDefaults.standard
    private let apiKey = "momoCapture.apiUrl"
    private let legacyQueueKey = "momoCapture.queue"
    private let queueKey = "momoCapture.queue.v2"
    private let lastSentKey = "momoCapture.lastSentAt"
    private let lastErrorKey = "momoCapture.lastError"
    private let rulesKey = "momoCapture.rules"
    private let notifyKey = "momoCapture.notify"
    private let filteredKey = "momoCapture.filteredCount"
    private let lock = NSLock()
    private let flushLock = NSLock()
    private var flushing = false
    private let maxQueue = 500

    // MARK: Configuration

    public func configure(apiUrl: String?, token: String?) {
        if let apiUrl = apiUrl, !apiUrl.isEmpty {
            defaults.set(apiUrl.hasSuffix("/") ? String(apiUrl.dropLast()) : apiUrl, forKey: apiKey)
        }
        if let token = token, !token.isEmpty { setToken(token) }
        defaults.removeObject(forKey: lastErrorKey)
    }

    /** Sign-out / "Turn off capture": forget the key and anything still waiting. */
    public func clear() {
        setToken(nil)
        lock.lock(); defaults.removeObject(forKey: queueKey); defaults.removeObject(forKey: legacyQueueKey); lock.unlock()
        defaults.removeObject(forKey: lastSentKey)
        defaults.removeObject(forKey: lastErrorKey)
    }

    public func setNotify(_ on: Bool) { defaults.set(on, forKey: notifyKey) }
    private var notifyOn: Bool { defaults.object(forKey: notifyKey) as? Bool ?? true }

    /** Server-provided filter rules: {"amount": regex, "money": regex, "allow": regex?}. Invalid ones are ignored. */
    public func setRules(_ rules: [String: Any]) {
        guard let amount = rules["amount"] as? String, let money = rules["money"] as? String,
              (try? NSRegularExpression(pattern: amount)) != nil, (try? NSRegularExpression(pattern: money)) != nil else { return }
        var stored: [String: String] = ["amount": amount, "money": money]
        if let allow = rules["allow"] as? String, (try? NSRegularExpression(pattern: allow)) != nil { stored["allow"] = allow }
        defaults.set(stored, forKey: rulesKey)
    }

    public func status() -> [String: Any?] {
        let last = defaults.double(forKey: lastSentKey)
        return [
            "hasToken": token() != nil,
            "queued": queue().count,
            "lastSentAt": last > 0 ? last : nil,
            "lastError": defaults.string(forKey: lastErrorKey),
            "filteredCount": defaults.integer(forKey: filteredKey),
        ]
    }

    // MARK: Filter (on the phone)

    // A money message has an amount AND something only an operator or bank writes: the ZMW code, a provider or bank
    // name, a transaction id marker, or a balance. "I sent you K50" from a friend has the amount but none of the rest.
    static let defaultAmount = #"(?i)(?:\b(?:ZMW|ZK)\s?\d|(?<![A-Za-z0-9])K\s?\d|\b(?:amount|amt)\s*[:.]?\s*(?:ZMW|ZK|K)?\s?\d)"#
    static let defaultMoney = #"(?i)(?:\b(?:ZMW|ZK)\b|\b(?:airtel|mtn|momo|zamtel|kwacha|zanaco|fnb|absa|stanbic|indo\s?zambia|izb|atlas\s?mara|ecobank|uba|lenco|natsave|investrust|first\s?capital|access\s?bank|bank)\b|\b(?:tid|txn|transaction\s?id|trans\.?\s?id|financial\s?transaction|ref(?:erence)?\s?(?:no)?\s?[:#.])|\b(?:bal|balance|avail(?:able)?\s?bal))"#
    static let defaultAllow = #"(?i)^\s*MoneyWise test"#

    private func regex(_ key: String, _ fallback: String) -> NSRegularExpression? {
        let stored = defaults.dictionary(forKey: rulesKey) as? [String: String]
        return (try? NSRegularExpression(pattern: stored?[key] ?? fallback)) ?? (try? NSRegularExpression(pattern: fallback))
    }

    public func looksLikeMoneyMessage(_ text: String) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        if let allow = regex("allow", Self.defaultAllow), allow.firstMatch(in: text, range: range) != nil { return true }
        guard let amount = regex("amount", Self.defaultAmount), let money = regex("money", Self.defaultMoney) else { return false }
        return amount.firstMatch(in: text, range: range) != nil && money.firstMatch(in: text, range: range) != nil
    }

    // MARK: Capture (called by the App Intent)

    /**
     * Filter → save → try to send within `budget` seconds. Returns quickly whatever the network does; the message is
     * already safe in the queue before any request starts.
     */
    @discardableResult
    public func capture(text: String, source: String = "IOS_SHORTCUT", occurredAt: Date = Date(), budget: TimeInterval = 8) async -> Outcome {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, looksLikeMoneyMessage(body) else {
            defaults.set(defaults.integer(forKey: filteredKey) + 1, forKey: filteredKey)
            return .filtered
        }
        guard token() != nil, apiUrl() != nil else { return .noKey }
        let id = UUID().uuidString
        enqueue(["id": id, "text": String(body.prefix(1200)), "source": source, "occurredAt": iso(occurredAt)])
        let sentFresh = await flush(budget: budget, fresh: id)
        return sentFresh ? .sent : .saved
    }

    // MARK: Sending

    /** JS / app-foreground entry point. */
    public func flush() async -> Int { await flushReport(budget: 20, fresh: nil).sent }

    /** Sends the queue in order. Returns whether `fresh` (the message just captured) got through. */
    @discardableResult
    private func flush(budget: TimeInterval, fresh: String?) async -> Bool {
        await flushReport(budget: budget, fresh: fresh).freshSent
    }

    private struct Report { var sent = 0; var freshSent = false; var backlog: [[String: Any]] = [] }

    private func flushReport(budget: TimeInterval, fresh: String?) async -> Report {
        var report = Report()
        // One sender at a time: an automation and the app opening at the same moment must not send an item twice.
        // The other sender picks the new message up and announces it with its batch.
        guard beginFlush() else { return report }
        defer { endFlush() }

        let deadline = Date().addingTimeInterval(budget)
        var stoppedOffline = false
        var keyRejected = false
        while let next = queue().first, let id = next["id"] as? String {
            let left = deadline.timeIntervalSinceNow
            if left < 2 { break }
            switch await post(next, timeout: min(8, left)) {
            case .sent(let json):
                remove(id)
                report.sent += 1
                if id == fresh { report.freshSent = true; announce(json, text: next["text"] as? String ?? "") }
                else { report.backlog.append(json) }
            case .bad:
                remove(id)
            case .offline, .serverError:
                stoppedOffline = true
            case .rejected:
                keyRejected = true
                stoppedOffline = true
            }
            if stoppedOffline { break }
        }
        if keyRejected {
            post(notification: "Capture is switched off", "Open MoneyWise and set up capture again. Your messages are saved on this phone until then.", id: "rejected")
        } else if let fresh = fresh, !report.freshSent, queue().contains(where: { ($0["id"] as? String) == fresh }) {
            notifySaved(fresh)
        }
        if !report.backlog.isEmpty { announceBacklog(report.backlog) }
        if !queue().isEmpty { scheduleBackgroundFlush() }
        return report
    }

    private func beginFlush() -> Bool {
        flushLock.lock(); defer { flushLock.unlock() }
        if flushing { return false }
        flushing = true
        return true
    }

    private func endFlush() {
        flushLock.lock(); defer { flushLock.unlock() }
        flushing = false
    }

    private func post(_ item: [String: Any], timeout: TimeInterval) async -> PostResult {
        guard let token = token(), let api = apiUrl(), let url = URL(string: "\(api)/momo-capture/ingest") else { return .rejected }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "X-Capture-Token")
        var body = item
        body.removeValue(forKey: "id")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }
        do {
            let (data, response) = try await session.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            switch code {
            case 200..<300:
                defaults.set(Date().timeIntervalSince1970 * 1000, forKey: lastSentKey)
                defaults.removeObject(forKey: lastErrorKey)
                return .sent((try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:])
            case 401:
                // The key was turned off or replaced. Keep the messages: they go out once the app reconnects.
                setToken(nil)
                defaults.set("Capture key was turned off. Set up capture again in MoneyWise.", forKey: lastErrorKey)
                return .rejected
            case 400..<500:
                return .bad
            default:
                defaults.set("Server error \(code). Will retry.", forKey: lastErrorKey)
                return .serverError
            }
        } catch {
            defaults.set("No connection. Will retry.", forKey: lastErrorKey)
            return .offline
        }
    }

    // MARK: Notifications

    private func canNotify(_ then: @escaping () -> Void) {
        guard notifyOn, Bundle.main.bundleIdentifier != nil else { return }
        UNUserNotificationCenter.current().getNotificationSettings { s in
            if s.authorizationStatus == .authorized || s.authorizationStatus == .provisional { then() }
        }
    }

    private func post(notification title: String, _ body: String, id: String = UUID().uuidString) {
        canNotify {
            let c = UNMutableNotificationContent()
            c.title = title
            c.body = body
            c.threadIdentifier = "momo-capture"
            c.userInfo = ["url": "moneywise://momo-captures"]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "momo-capture-\(id)", content: c, trigger: nil))
        }
    }

    private func notifySaved(_ id: String) {
        let n = queue().count
        post(notification: "Saved on your phone", n > 1
             ? "No connection. \(n) messages are waiting and will send when you're back online."
             : "No connection. It will send to MoneyWise when you're back online.", id: "saved")
    }

    private static func kwacha(_ v: Any?) -> String {
        let n = (v as? NSNumber)?.doubleValue ?? Double("\(v ?? "")") ?? 0
        return String(format: "K%.2f", n)
    }

    /** Turns the server's answer into "what happened" for the person. */
    static func describe(_ json: [String: Any], text: String) -> (String, String) {
        let ws = (json["workspace"] as? String).map { " in \($0)" } ?? ""
        if text.range(of: "MoneyWise test", options: .caseInsensitive) != nil {
            return ("Test received", "Capture is working. Messages go to MoneyWise\(ws).")
        }
        if json["duplicate"] as? Bool == true { return ("Already captured", "MoneyWise already has this message\(ws).") }
        if let b = json["balanceCheck"] as? [String: Any] {
            if b["duplicate"] as? Bool == true { return ("Balance already noted", "MoneyWise already has this balance\(ws).") }
            let diff = (b["difference"] as? NSNumber)?.doubleValue ?? 0
            return ("Balance \(kwacha(b["balance"]))", abs(diff) < 0.005 ? "Matches MoneyWise\(ws)." : "Differs from MoneyWise by \(kwacha(abs(diff))). Review it\(ws).")
        }
        if let c = json["capture"] as? [String: Any] {
            let amount = kwacha(c["amount"])
            let isIn = (c["direction"] as? String) == "IN"
            let who = (c["counterparty"] as? String).map { isIn ? " from \($0)" : " to \($0)" } ?? ""
            switch c["status"] as? String {
            case "MATCHED": return ("Already in MoneyWise", "\(amount)\(who) matches a wallet transaction\(ws). Not booked twice.")
            case "POSTED": return ("Booked: \(amount) \(isIn ? "received" : "sent")", "\(who.trimmingCharacters(in: .whitespaces).capitalizedFirst)Booked\(ws).")
            default: return ("New: \(amount) \(isIn ? "received" : "sent")", "\(who.trimmingCharacters(in: .whitespaces).capitalizedFirst)Waiting for review\(ws).")
            }
        }
        switch json["reason"] as? String {
        case "PERSONAL_NUMBER": return ("Ignored: possible scam", "This came from a personal number, not a provider or bank.")
        case "BALANCE_ONLY": return ("Balance noted", "No money moved in this message.")
        default: return ("Not a transaction", "MoneyWise read the message but found no money movement.")
        }
    }

    private func announce(_ json: [String: Any], text: String) {
        let (title, body) = Self.describe(json, text: text)
        post(notification: title, body)
    }

    private func announceBacklog(_ results: [[String: Any]]) {
        let fresh = results.filter { (($0["capture"] as? [String: Any])?["status"] as? String) == "PENDING" }.count
        let ws = (results.first?["workspace"] as? String).map { " in \($0)" } ?? ""
        post(notification: "Sent \(results.count) saved message\(results.count == 1 ? "" : "s")",
             fresh > 0 ? "\(fresh) new, waiting for review\(ws)." : "Nothing new: they were already in MoneyWise\(ws).", id: "backlog")
    }

    // MARK: Background retry

    public func scheduleBackgroundFlush() {
        #if canImport(BackgroundTasks) && os(iOS)
        guard Bundle.main.bundleIdentifier != nil, !queue().isEmpty else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.flushTaskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(req)
        #endif
    }

    #if canImport(BackgroundTasks) && os(iOS)
    public func handleBackgroundFlush(_ task: BGTask) {
        let work = Task { _ = await self.flushReport(budget: 25, fresh: nil) }
        task.expirationHandler = { work.cancel() }
        Task {
            _ = await work.value
            task.setTaskCompleted(success: self.queue().isEmpty)
            self.scheduleBackgroundFlush()
        }
    }
    #endif

    // MARK: Queue

    private func queue() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        var q = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        // One-time move of messages saved by the 0.6.0 queue (no ids).
        if let old = defaults.array(forKey: legacyQueueKey) as? [[String: String]], !old.isEmpty {
            q = old.map { var d: [String: Any] = $0; d["id"] = UUID().uuidString; return d } + q
            defaults.set(q, forKey: queueKey)
            defaults.removeObject(forKey: legacyQueueKey)
        }
        return q
    }

    private func enqueue(_ item: [String: Any]) {
        _ = queue()
        lock.lock(); defer { lock.unlock() }
        var q = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        q.append(item)
        if q.count > maxQueue { q.removeFirst(q.count - maxQueue) }
        defaults.set(q, forKey: queueKey)
    }

    private func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        var q = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        q.removeAll { ($0["id"] as? String) == id }
        defaults.set(q, forKey: queueKey)
    }

    // MARK: Keychain

    private func apiUrl() -> String? { defaults.string(forKey: apiKey) }

    private func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: tokenAccount]
    }

    public func token() -> String? {
        var q = baseQuery()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func setToken(_ token: String?) {
        SecItemDelete(baseQuery() as CFDictionary)
        guard let token = token, let data = token.data(using: .utf8) else { return }
        var q = baseQuery()
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    private func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }
}

private extension String {
    /** "from John" → "From John. " ; "" → "" */
    var capitalizedFirst: String {
        guard let f = first else { return "" }
        return f.uppercased() + dropFirst() + ". "
    }
}
