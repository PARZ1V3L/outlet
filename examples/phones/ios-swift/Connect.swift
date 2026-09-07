// Connect.swift: the Outlet Connect flow for an iPhone app, in Swift. Matches @useoutlet/sdk 0.4.0 (public-client
// PKCE flow, spec section 7.1). Written 2026-09-04 and read-checked against Apple's current API documentation on
// 2026-09-04, not compiled. The sheet is iOS 12+; SHA-256 via CryptoKit (iOS 13+) and async URLSession make it iOS 15+.
import AuthenticationServices
import CryptoKit
import UIKit
let vault = "https://api.useoutlet.dev/v0", appID = "app_yourapp"
let redirectURI = "com.yourapp:/outlet"  // byte-identical to the address registered with Outlet
enum ConnectError: Error { case noEntropy, sheetDidNotOpen, noCallback, stateMismatch, vault, keychain }
@MainActor final class OutletConnect: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let window: UIWindow
    init(window: UIWindow) { self.window = window }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }

    func connect() async throws -> (grantID: String, keys: [String: String]) {
        let verifier = try randomBase64url(32), state = try randomBase64url(16)
        let challenge = base64url(Array(SHA256.hash(data: Data(verifier.utf8))))
        let grant = try await post("/grants", ["app_id": appID, "providers": ["anthropic"], "redirect_uri": redirectURI,
                                               "code_challenge": challenge, "code_challenge_method": "S256", "state": state])
        guard let requestID = grant["grant_request_id"] as? String,
              let grantURL = URL(string: grant["grant_url"] as? String ?? "") else { throw ConnectError.vault }
        let callback = try await openSheet(grantURL)
        let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard query.first(where: { $0.name == "state" })?.value == state,
              let code = query.first(where: { $0.name == "code" })?.value else { throw ConnectError.stateMismatch }
        let token = try await post("/grants/token", ["grant_request_id": requestID, "code": code, "code_verifier": verifier])
        guard let keys = token["keys"] as? [String: String], let grantID = token["grantId"] as? String,
              let refreshToken = token["refresh_token"] as? String else { throw ConnectError.vault }
        try saveRefreshToken(refreshToken)
        return (grantID, keys)  // keys stay in memory; the id is not secret and addresses later refreshes
    }

    private func openSheet(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            // The scheme alone; the sheet catches the redirect itself, so no Info.plist URL type is needed.
            // Apple lists this initializer as deprecated (no warning yet). iOS 17.4+ has
            // init(url:callback:completionHandler:) with .customScheme, or .https(host:path:) for a website address.
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.yourapp") { url, error in
                if let url, error == nil { continuation.resume(returning: url) }
                else { continuation.resume(throwing: error ?? ConnectError.noCallback) }
            }
            session.presentationContextProvider = self
            // iOS shows its own "wants to use useoutlet.dev to sign in" alert on each connect;
            // session.prefersEphemeralWebBrowserSession = true would hide it but drop the person's existing sign-in.
            guard session.canStart else { continuation.resume(throwing: ConnectError.sheetDidNotOpen); return }
            _ = session.start()
        }
    }
    /// No auth header: PKCE binds the flow, and a public client has no secret to send.
    private func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: vault + path)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode ?? 999 < 300,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ConnectError.vault }
        return json
    }
    /// The vault rotates this token on every refresh; save the new one each time.
    private func saveRefreshToken(_ token: String) throws {
        let item: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: "outlet", kSecAttrAccount as String: "refresh_token"]
        _ = SecItemDelete(item as CFDictionary)  // SecItemAdd refuses a duplicate, so the old token goes first
        let add = item.merging([kSecValueData as String: Data(token.utf8),
                                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]) { $1 }
        guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { throw ConnectError.keychain }
    }
}

func randomBase64url(_ count: Int) throws -> String {
    var bytes = [UInt8](repeating: 0, count: count)
    guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw ConnectError.noEntropy }
    return base64url(bytes)
}
func base64url(_ bytes: [UInt8]) -> String {
    Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}
