/** The Connect your AI button: the fixed asset when idle, the socket and
 *  system text once a connection completed. */
import { CONNECT_BUTTON, SOCKET } from "./assets.js";
import { h, svg } from "./dom.js";
import { fill } from "./render-shell.js";
import { button } from "./strings.js";
import type { UiProvider } from "./types.js";

export function renderTrigger(): HTMLButtonElement {
  return h("button", { type: "button", class: "fixed-button", "aria-label": button.idle },
    svg(CONNECT_BUTTON));
}

export function setConnected(b: HTMLButtonElement, mode: "direct" | "vault", provider: UiProvider): void {
  b.className = "connected-button";
  b.setAttribute("aria-label", fill(button.name[mode], provider));
  b.replaceChildren(svg(SOCKET), h("span", {}, fill(button.connected, provider)));
}
