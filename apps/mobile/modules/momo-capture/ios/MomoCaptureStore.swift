import Foundation
import Security

/**
 * iOS side of mobile money capture. Holds the capture key (Keychain, readable after first unlock so a message that
 * arrives while the phone is locked still goes through), sends a message to `/momo-capture/ingest`, and keeps anything
 * that couldn't be sent (no signal) in a small queue that goes out with the next message or when the app opens.
 *
 * Used by two callers: the React Native module (setup, status, flush) and the "Capture mobile money message" App
 * Intent in the app target, which Shortcuts runs from the person's Message automation.
 */
public final class MomoCaptureStore {
    public static let shared = MomoCaptureStore()

    public enum SendResult: String { case sent, queued, noKey, rejected, ignored }

    private let service = "cloud.blueopus.moneywise.momo-capture"
    private let tokenAccount = "capture-token"
    private let defaults = UserDefaults.standard
    private let apiKey = "momoCapture.apiUrl"
    private let queueKey = "momoCapture.queue"
    private let lastSentKey = "momoCapture.lastSentAt"
    private let lastErrorKey = "momoCapture.lastError"
    private let lock = NSLock()
    private let maxQueue = 100

    // MARK: Configuration

    public func configure(apiUrl: String?, token: String?) {
        if let apiUrl = apiUrl, !apiUrl.isEmpty {
            defaults.set(apiUrl.hasSuffix("/") ? String(apiUrl.dropLast()) : apiUrl, forKey: apiKey)
        }
        if let token = token, !token.isEmpty { setToken(token) }
        defaults.removeObject(forKey: lastErrorKey)
    }

    /** Sign-out / "Turn off capture": forget the key and anything queued. */
    public func clear() {
        setToken(nil)
        lock.lock(); defaults.removeObject(forKey: queueKey); lock.unlock()
        defaults.removeObject(forKey: lastSentKey)
        defaults.removeObject(forKey: lastErrorKey)
    }

    public func status() -> [String: Any?] {
        let last = defaults.double(forKey: lastSentKey)
        return [
            "hasToken": token() != nil,
            "queued": queue().count,
            "lastSentAt": last > 0 ? last : nil,
            "lastError": defaults.string(forKey: lastErrorKey),
        ]
    }

    // MARK: Sending

    /** Sends one message. Network trouble queues it; a rejected key is dropped so the app can ask to reconnect. */
    @discardableResult
    public func send(text: String, source: String = "IOS_SHORTCUT", occurredAt: Date = Date()) async -> SendResult {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return .ignored }
        guard token() != nil, apiUrl() != nil else { return .noKey }
        let item: [String: String] = ["text": String(body.prefix(1200)), "source": source, "occurredAt": iso(occurredAt)]
        let result = await post(item)
        if result == .queued { enqueue(item) }
        if result == .sent { _ = await flush() }
        return result
    }

    /** Retries the queue in order; stops at the first message that still can't get through. Returns how many went. */
    public func flush() async -> Int {
        var sent = 0
        while let next = queue().first {
            let r = await post(next)
            if r == .queued { break }
            dropFirst()
            if r == .sent { sent += 1 }
            if r == .rejected { break }
        }
        return sent
    }

    private func post(_ item: [String: String]) async -> SendResult {
        guard let token = token(), let api = apiUrl(), let url = URL(string: "\(api)/momo-capture/ingest") else { return .noKey }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "X-Capture-Token")
        req.httpBody = try? JSONSerialization.data(withJSONObject: item)
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            switch code {
            case 200..<300:
                defaults.set(Date().timeIntervalSince1970 * 1000, forKey: lastSentKey)
                defaults.removeObject(forKey: lastErrorKey)
                return .sent
            case 401:
                // The key was turned off (or replaced on another phone). Stop sending until the app reconnects.
                setToken(nil)
                defaults.set("Capture key was turned off. Set up capture again in MoneyWise.", forKey: lastErrorKey)
                return .rejected
            case 400..<500:
                return .ignored
            default:
                defaults.set("Server error \(code). Will retry.", forKey: lastErrorKey)
                return .queued
            }
        } catch {
            defaults.set("No connection. Will retry.", forKey: lastErrorKey)
            return .queued
        }
    }

    // MARK: Queue

    private func queue() -> [[String: String]] {
        lock.lock(); defer { lock.unlock() }
        return defaults.array(forKey: queueKey) as? [[String: String]] ?? []
    }

    private func enqueue(_ item: [String: String]) {
        lock.lock(); defer { lock.unlock() }
        var q = defaults.array(forKey: queueKey) as? [[String: String]] ?? []
        q.append(item)
        if q.count > maxQueue { q.removeFirst(q.count - maxQueue) }
        defaults.set(q, forKey: queueKey)
    }

    private func dropFirst() {
        lock.lock(); defer { lock.unlock() }
        var q = defaults.array(forKey: queueKey) as? [[String: String]] ?? []
        if !q.isEmpty { q.removeFirst() }
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
