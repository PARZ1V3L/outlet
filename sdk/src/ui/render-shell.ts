/** The sheet frame every screen shares: the top bar (brand or mode header,
 *  Back, Close), the body, the footer, and the shared pieces inside. */
import { ARROW, DIRECT_MARK, SOCKET, VAULT_MARK, WORDMARK } from "./assets.js";
import { append, h, svg } from "./dom.js";
import { type Config, type View, parentView } from "./routes.js";
import { common } from "./strings.js";
import type { UiProvider } from "./types.js";

export const IDS = { title: "outlet-title", error: "outlet-error", key: "outlet-key", hint: "outlet-hint" };

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
  /** The capped screen's link opened the account page: refresh when the person is back. */
  raiseCap(): void;
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
  const top = sheet.querySelector<HTMLElement>(":scope > .top");
  const actionRow = sheet.querySelector<HTMLElement>(".actions");
  const guide = sheet.querySelector<HTMLElement>(":scope > .guide");
  top?.remove();
  actionRow?.remove();
  guide?.remove();
  const body = h("div", { class: "sheet-body" }, ...Array.from(sheet.childNodes));
  const card = h("div", { class: "sheet-card" }, top, body);
  if (actionRow) {
    actionRow.classList.add("sheet-actions");
    if (guide) actionRow.appendChild(guide);
    card.appendChild(actionRow);
  }
  sheet.replaceChildren(card, h("p", { class: "foot" }, common.poweredBy));
}

/** The Close button of a rendered sheet. */
export function closeButton(sheet: HTMLElement): HTMLElement | undefined {
  return sheet.querySelector<HTMLElement>('button[aria-label="' + common.close + '"]') ?? undefined;
}

function iconButton(name: string, glyph: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "icon-button", "aria-label": name },
    svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph === "‹" ? "m14 6-6 6 6 6" : "m6 6 12 12M6 18 18 6"}"/></svg>`));
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

/** The same reassurance, kept beside key entry without bullet-list spacing.
 *  Three lines carry the device, the hand-off and the lock. One line alone
 *  (the generic screen) carries the lock. */
export function keyReassurance(lines: string[]): HTMLUListElement {
  const paths = ["M5 4h14v12H5zM3 20h18", "M5 12h14m-6-6 6 6-6 6", "M8 10V7a4 4 0 0 1 8 0v3M6 10h12v11H6z"];
  const pathFor = (i: number) => (lines.length === 1 ? paths[2] : paths[i] ?? paths[2]);
  return h("ul", { class: "explanation key-reassurance" }, ...lines.map((line, i) => h("li", {},
    svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${pathFor(i)}"/></svg>`),
    h("span", {}, line))));
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

/** The centred status body: a busy ring or the socket, the heading, lines.
 *  The socket carries the state: voltage eyes live, grey eyes (`off`) done
 *  or gone, the wink on success. */
export function message(o: { busy?: boolean; wink?: boolean; off?: boolean; title: string; lines?: string[] }): {
  wrap: HTMLElement; heading: HTMLElement;
} {
  const head = heading(o.title);
  const mark = o.busy
    ? h("span", { class: "busy", "aria-hidden": "true" })
    : h("span", { class: "tile" + (o.wink ? " wink" : "") + (o.off ? " off" : "") }, svg(SOCKET));
  const wrap = h("div", { class: "message" }, mark, head);
  append(wrap, paragraphs(o.lines ?? []));
  return { wrap, heading: head };
}
