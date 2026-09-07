// Ambient stand-ins for the Expo members connect.ts uses, so it type-checks
// without installing Expo. Signatures follow the Expo SDK docs on 2026-09-04.
declare module "expo-crypto" {
  export type IntBasedTypedArray = Int8Array | Int16Array | Int32Array;
  export type UintBasedTypedArray =
    | Uint8Array
    | Uint8ClampedArray
    | Uint16Array
    | Uint32Array;
  export enum CryptoDigestAlgorithm {
    SHA1 = "SHA-1",
    SHA256 = "SHA-256",
    SHA384 = "SHA-384",
    SHA512 = "SHA-512",
    MD2 = "MD2",
    MD4 = "MD4",
    MD5 = "MD5",
  }
  export function getRandomValues<
    T extends IntBasedTypedArray | UintBasedTypedArray,
  >(typedArray: T): T;
  export function digest(
    algorithm: CryptoDigestAlgorithm,
    data: BufferSource,
  ): Promise<ArrayBuffer>;
}

declare module "expo-web-browser" {
  export enum WebBrowserResultType {
    CANCEL = "cancel",
    DISMISS = "dismiss",
    OPENED = "opened",
    LOCKED = "locked",
  }
  export type WebBrowserResult = { type: WebBrowserResultType };
  export type WebBrowserRedirectResult = { type: "success"; url: string };
  export type WebBrowserAuthSessionResult =
    | WebBrowserRedirectResult
    | WebBrowserResult;
  export type AuthSessionOpenOptions = {
    preferEphemeralSession?: boolean;
    preferUniversalLinks?: boolean;
  };
  export function openAuthSessionAsync(
    url: string,
    redirectUrl?: string | null,
    options?: AuthSessionOpenOptions,
  ): Promise<WebBrowserAuthSessionResult>;
}

declare module "expo-secure-store" {
  export type KeychainAccessibilityConstant = number;
  export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: KeychainAccessibilityConstant;
  export type SecureStoreOptions = {
    keychainService?: string;
    requireAuthentication?: boolean;
    authenticationPrompt?: string;
    keychainAccessible?: KeychainAccessibilityConstant;
    accessGroup?: string;
  };
  export function setItemAsync(
    key: string,
    value: string,
    options?: SecureStoreOptions,
  ): Promise<void>;
}
