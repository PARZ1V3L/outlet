/** Shared helpers for the widget tests (jsdom). */
import { vi } from "vitest";
import { mountConnectButton } from "../../src/ui/index.js";
import type { ConnectButtonHandle, ConnectButtonOptions } from "../../src/ui/index.js";

export const OPENAI_KEY = "sk-proj-abc123def456ghi789";
export const ANTHROPIC_KEY = "sk-ant-api03-abc123def456";
export const GOOGLE_KEY = "AIzaSyExample1234567890";

export interface Mounted {
  target: HTMLElement;
  handle: ConnectButtonHandle;
  onSession: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}

export function mount(opts: Partial<ConnectButtonOptions> = {}): Mounted {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const onSession = vi.fn();
  const onError = vi.fn();
  const handle = mountConnectButton(target, {
    mode: "both",
    providers: ["openai", "anthropic", "google"],
    appId: "app_test",
    redirectUri: "https://app.example/outlet/return",
    onSession,
    onError,
    ...opts,
  });
  return { target, handle, onSession, onError };
}

export function trigger(target: HTMLElement): HTMLButtonElement {
  return target.shadowRoot!.querySelector("button") as HTMLButtonElement;
}

export function overlayHost(): HTMLElement | null {
  return document.body.querySelector("[data-outlet-overlay]");
}

export function overlayRoot(): ShadowRoot {
  const host = overlayHost();
  if (!host) throw new Error("no overlay");
  return host.shadowRoot as ShadowRoot;
}

export function sheet(): HTMLElement {
  return overlayRoot().querySelector("section.sheet") as HTMLElement;
}

export function state(): string | null {
  const s = overlayHost()?.shadowRoot?.querySelector("section.sheet");
  return s ? s.getAttribute("data-state") : null;
}

export function heading(): string {
  return sheet().querySelector("h1")?.textContent ?? "";
}

/** The accessible name the way a screen reader gets it: aria-labelledby,
 *  then aria-label, then the text with aria-hidden parts left out. */
export function nameOf(el: HTMLElement, scope: ParentNode = sheet()): string {
  const byId = el.getAttribute("aria-labelledby");
  if (byId) return scope.querySelector("#" + byId)?.textContent?.trim() ?? "";
  const label = el.getAttribute("aria-label");
  if (label) return label;
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (copy.textContent ?? "").trim();
}

/** Click the button or link whose accessible name matches. */
export function click(label: string): void {
  const s = sheet();
  const all = Array.from(s.querySelectorAll<HTMLElement>("button, a"));
  const el = all.find((b) => nameOf(b, s) === label);
  if (!el) throw new Error(`no control "${label}" on ${state()}`);
  el.click();
}

export function input(): HTMLInputElement {
  return sheet().querySelector("input") as HTMLInputElement;
}

export function paste(value: string): void {
  input().value = value;
  click("Save");
}

export function live(): string {
  return overlayRoot().querySelector('[role="status"]')?.textContent ?? "";
}

export function activeInSheet(): Element | null {
  return overlayRoot().activeElement;
}

export function key(el: EventTarget, k: string, shift = false): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, composed: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

export async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export function cleanup(): void {
  document.body.replaceChildren();
}
