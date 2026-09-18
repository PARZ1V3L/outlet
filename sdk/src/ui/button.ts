/** The Connect your AI button: the fixed asset when idle, the socket and
 *  system text once a connection completed. */
import { CONNECT_BUTTON, SOCKET } from "./assets.js";
import { h, svg } from "./dom.js";
import { fill } from "./screen-provider.js";
import { button } from "./strings.js";

export function renderTrigger(): HTMLButtonElement {
  return h("button", { type: "button", class: "fixed-button", "aria-label": button.idle },
    svg(CONNECT_BUTTON));
}

/** `providerName` is the display name: the registry's, or the app's own. */
export function setConnected(b: HTMLButtonElement, mode: "direct" | "vault", providerName: string): void {
  b.className = "connected-button";
  b.setAttribute("aria-label", fill(button.name[mode], providerName));
  b.replaceChildren(svg(SOCKET), h("span", {}, fill(button.connected, providerName)));
}
