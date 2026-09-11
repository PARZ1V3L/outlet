/** The sheet frame every screen shares: the top bar (brand or mode header,
 *  Back, Close), the body, the footer, and the shared pieces inside. */
import { ARROW, DIRECT_MARK, SOCKET, VAULT_MARK, WORDMARK } from "./assets.js";
import { append, h, svg } from "./dom.js";
import { type Config, type View, parentView } from "./routes.js";
import { common, providers } from "./strings.js";
import type { UiProvider } from "./types.js";

export const IDS = { title: "outlet-title", error: "outlet-error", key: "outlet-key" };

/** What a screen can ask the widget to do. */
export interface Actions {
  go(view: View): void;
  back(): void;
  close(): void;
  chooseDirect(): void;
  chooseVault(): void;
  pickProvider(provider: UiProvider): void;
  save(input: HTMLInputElement): void;
  continueToOutlet(button: HTMLButtonElement): void;
  done(): void;
}

export interface Rendered {
  sheet: HTMLElement;
  heading: HTMLElement;
  input?: HTMLInputElement;
  /** Where focus lands instead of the heading: status screens put it on
   *  their action so the polite announcement is the one thing read. */
  focus?: HTMLElement;
}

interface FrameOptions {
  /** The mode header, e.g. "Direct · OpenAI". Omitted on choose, which
   *  carries the Outlet lockup instead. */
  header?: string;
  mode?: "direct" | "vault";
  status?: boolean;
}

/** The dialog section with its top bar. Body content is appended by the
 *  caller, then `finish()` adds the footer. */
export function frame(view: View, cfg: Config, a: Actions, o: FrameOptions): HTMLElement {
  const sheet = h("section", {
    class: "sheet" + (o.status ? " status-card" : ""),
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": IDS.title,
    "data-state": view.id,
  });
  const brand = o.header
    ? h("div", { class: "brand" },
        h("span", { class: "tile mode" }, svg(o.mode === "vault" ? VAULT_MARK : DIRECT_MARK)),
        h("span", {}, o.header))
    : h("div", { class: "brand lockup", role: "img", "aria-label": common.outlet },
        h("span", {}, svg(SOCKET, "signature")),
        h("span", {}, svg(WORDMARK, "wordmark")));
  const chrome = h("div", { class: "chrome" });
  if (parentView(cfg, view)) {
    chrome.appendChild(iconButton(common.back, "‹", () => a.back()));
  }
  chrome.appendChild(iconButton(common.close, "×", () => a.close()));
  sheet.appendChild(h("div", { class: "top" }, brand, chrome));
  return sheet;
}

export function finish(sheet: HTMLElement): void {
  sheet.appendChild(h("p", { class: "foot" }, common.poweredBy));
}

/** The Close button of a rendered sheet. */
export function closeButton(sheet: HTMLElement): HTMLElement | undefined {
  return sheet.querySelector<HTMLElement>('button[aria-label="' + common.close + '"]') ?? undefined;
}

function iconButton(name: string, glyph: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "icon-button", "aria-label": name },
    h("span", { "aria-hidden": "true" }, glyph));
  b.addEventListener("click", onClick);
  return b;
}

export function heading(text: string): HTMLHeadingElement {
  return h("h1", { id: IDS.title, tabindex: "-1" }, text);
}

export function paragraphs(lines: string[], className?: string): HTMLElement[] {
  return lines.map((t) => h("p", { class: className }, t));
}

export function bullets(lines: string[]): HTMLUListElement {
  return h("ul", { class: "explanation" }, ...lines.map((t) => h("li", {}, t)));
}

/** A link that leaves the sheet: label, decorative arrow, new tab. */
export function externalLink(label: string, href: string, className = ""): HTMLAnchorElement {
  return h("a", {
    class: ("external-link " + className).trim(),
    href,
    target: "_blank",
    rel: "noopener noreferrer",
  }, h("span", { class: "link-label" }, label), svg(ARROW, "external-arrow"));
}

export function primary(label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "primary" }, label);
  b.addEventListener("click", () => onClick(b));
  return b;
}

export function secondary(label: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "secondary" }, label);
  b.addEventListener("click", onClick);
  return b;
}

export function actions(...items: HTMLElement[]): HTMLElement {
  return h("div", { class: "actions" }, ...items);
}

/** The centred status body: a busy ring or the socket, the heading, lines. */
export function message(o: { busy?: boolean; wink?: boolean; title: string; lines?: string[] }): {
  wrap: HTMLElement; heading: HTMLElement;
} {
  const head = heading(o.title);
  const mark = o.busy
    ? h("span", { class: "busy", "aria-hidden": "true" })
    : h("span", { class: "tile" + (o.wink ? " wink" : "") }, svg(SOCKET));
  const wrap = h("div", { class: "message" }, mark, head);
  append(wrap, paragraphs(o.lines ?? []));
  return { wrap, heading: head };
}

/** Fill {provider} and {other} in a strings.ts line with display names. */
export function fill(text: string, provider?: UiProvider, other?: UiProvider): string {
  return text
    .replace(/\{provider\}/g, provider ? providers[provider] : "")
    .replace(/\{other\}/g, other ? providers[other] : "");
}
