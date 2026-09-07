// connect.ts: the Outlet grant flow for a React Native app built with Expo.
// Matches @useoutlet/sdk 0.4.0 (createGrant + exchangeCode with the crypto
// option; 0.3.0 throws on phones). Written 2026-09-04; it type-checks with
// tsc against the SDK source and was not run on a device.
// Needs "scheme": "com.yourapp" in app.json so the sheet can come back
// (a development build; Expo Go ignores the scheme field).
import { createGrant, exchangeCode, type PkceCrypto } from "@useoutlet/sdk";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

const REFRESH_TOKEN_KEY = "outlet.refreshToken";

// Hermes has no Web Crypto, so the SDK takes its two primitives from expo-crypto.
const crypto: PkceCrypto = {
  getRandomValues: (buf) => Crypto.getRandomValues(buf),
  // Copied onto a plain ArrayBuffer: digest() takes a BufferSource only.
  sha256: (data) =>
    Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data)),
};

// React Native's URL has not always parsed search params; three lines do.
const param = (url: string, key: string) =>
  decodeURIComponent(url.match(new RegExp(`[?&]${key}=([^&#]*)`))?.[1] ?? "");

export async function connect(
  appId: string,
  providers: string[],
  redirectUri: string,
) {
  const grant = await createGrant({ appId, providers, redirectUri, crypto });

  // The system browser sheet, never a web view: the person signs in to
  // Outlet, and the app never sees that page. Cancel and dismiss are not
  // hidden: the error names the sheet's own result type.
  const result = await WebBrowser.openAuthSessionAsync(grant.grantUrl, redirectUri);
  if (result.type !== "success") {
    throw new Error(`Outlet grant sheet closed: ${result.type}`);
  }

  // A code under a state this call did not issue belongs to another flow.
  const code = param(result.url, "code");
  if (!code || param(result.url, "state") !== grant.state) {
    throw new Error("Outlet: state mismatch");
  }

  const session = await exchangeCode({
    grantRequestId: grant.grantRequestId,
    code,
    codeVerifier: grant.verifier,
  });

  // Only the refresh token is persisted; session.keys stay in memory.
  // It rotates on every refresh, so save the new one each time.
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return session;
}
