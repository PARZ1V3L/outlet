/**
 * The overlay that holds the sheet. A host on <body> carries a shadow root;
 * inside it, a modal <dialog> where the browser has one, so the sheet sits in
 * the top layer above any page dialog, popover or full-screen element, and the
 * browser makes the page behind inert. Without <dialog> it is a fixed layer
 * and the page is marked inert here. Also: the veil, the polite live region,
 * the focus trap, Escape, the page scroll lock, and the visual viewport that
 * keeps the sheet above a phone keyboard. It renders nothing itself; the
 * widget hands it rendered screens.
 */
import { h, tabbables } from "./dom.js";
import { IDS, type Rendered } from "./render-shell.js";
import { type DynamicSheet, adoptStyles, dynamicSheet } from "./styles.js";

const HOST = "data-outlet-overlay";

/** The page behind the sheet does not scroll while a sheet is open. One
 *  page-level rule: a constructable sheet, or a <style> element where the
 *  constructor is missing (the veil's wheel and touchmove blocks cover a
 *  host whose CSP refuses that). Read from the page on every open and
 *  close, so a host removed by someone else heals on the next one. */
const PAGE_LOCK = "html{overflow:hidden!important}";
let pageLock: CSSStyleSheet | null = null;
let pageLockStyle: HTMLStyleElement | null = null;
/** Page elements the fallback made inert, shared by every open sheet and
 *  released when the last one closes. */
const pageInert = new Set<Element>();

function anyOpen(): boolean {
  return document.querySelector(`[${HOST}]`) !== null;
}

function constructable(): boolean {
  return (
    typeof CSSStyleSheet !== "undefined" &&
    "adoptedStyleSheets" in document &&
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === "function"
  );
}

function syncPageLock(): void {
  const open = anyOpen();
  if (constructable()) {
    if (!pageLock) {
      pageLock = new CSSStyleSheet();
      pageLock.replaceSync(PAGE_LOCK);
    }
    const sheets = document.adoptedStyleSheets;
    const has = sheets.includes(pageLock);
    if (open && !has) document.adoptedStyleSheets = [...sheets, pageLock];
    if (!open && has) document.adoptedStyleSheets = sheets.filter((x) => x !== pageLock);
    return;
  }
  if (open && !pageLockStyle?.isConnected) {
    pageLockStyle = document.createElement("style");
    pageLockStyle.textContent = PAGE_LOCK;
    document.head.appendChild(pageLockStyle);
  }
  if (!open && pageLockStyle) {
    pageLockStyle.remove();
    pageLockStyle = null;
  }
}

function canShowModal(): boolean {
  return (
    typeof HTMLDialogElement !== "undefined" &&
    typeof (HTMLDialogElement.prototype as { showModal?: unknown }).showModal === "function"
  );
}

export class Overlay {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private wrap: HTMLElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  private live: HTMLElement | null = null;
  private dyn: DynamicSheet | null = null;
  private inerted: Element[] = [];
  private stop: Array<() => void> = [];
  current: Rendered | null = null;

  constructor(
    private readonly themeClass: string,
    /** Escape, the veil, a close the browser made: the person is leaving. */
    private readonly onDismiss: () => void,
  ) {}

  /** The focused element inside the sheet, or null when focus is elsewhere. */
  get activeElement(): Element | null {
    return this.root?.activeElement ?? null;
  }

  get isOpen(): boolean {
    return this.host !== null;
  }

  /** Put a rendered screen in the sheet, opening the overlay if needed.
   *  One card lives for the whole open overlay: a new screen moves its
   *  children in, so a screen reader hears a step change, not a new
   *  dialog. Focus goes to the screen's focus target, else its heading,
   *  before the old children leave, so it never passes through the page. */
  show(r: Rendered): void {
    this.ensure();
    const target = r.focus ?? r.heading;
    if (!this.current) {
      // In a modal <dialog>, the dialog is the one dialog, named by the
      // heading; the card inside it is a plain box.
      if (this.dialog) for (const a of ["role", "aria-modal", "aria-labelledby"]) r.sheet.removeAttribute(a);
      this.wrap?.appendChild(r.sheet);
      this.current = r;
      target.focus({ preventScroll: true });
      return;
    }
    const sheet = this.current.sheet;
    const old = Array.from(sheet.childNodes);
    sheet.className = r.sheet.className;
    sheet.setAttribute("data-state", r.sheet.getAttribute("data-state") ?? "");
    sheet.append(...Array.from(r.sheet.childNodes));
    r.sheet = sheet;
    this.current = r;
    target.focus({ preventScroll: true });
    for (const n of old) n.remove();
    // A new screen starts at its top; a focus target further down stays in view.
    sheet.scrollTop = 0;
    if (target !== r.heading && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "nearest" });
    }
  }

  /** One polite announcement. A fresh text node each time, so the same
   *  words announce again when they are submitted again. */
  announce(text: string): void {
    if (!this.live) return;
    this.live.textContent = "";
    this.live.appendChild(document.createTextNode(text));
  }

  close(): void {
    const host = this.host;
    if (!host) return;
    for (const f of this.stop) f();
    this.stop = [];
    for (const el of this.inerted) el.removeAttribute("inert");
    this.inerted = [];
    // Cleared first, so the dialog's own close event does not dismiss twice.
    this.host = null;
    if (this.dialog?.hasAttribute("open")) this.dialog.close();
    this.dialog = null;
    host.remove();
    syncPageLock();
    if (!anyOpen()) {
      for (const el of pageInert) el.removeAttribute("inert");
      pageInert.clear();
    }
    this.root = this.wrap = this.live = null;
    this.dyn = null;
    this.current = null;
  }

  private ensure(): void {
    if (this.host?.isConnected) return;
    if (this.host) this.close(); // the page removed the host: clean up, build afresh
    const host = h("div", { [HOST]: true });
    const root = host.attachShadow({ mode: "open" });
    adoptStyles(root);
    this.dyn = dynamicSheet(root);
    const veil = h("div", { class: "veil" });
    const live = h("div", { class: "sr", role: "status", "aria-live": "polite" });
    const cls = "root overlay " + this.themeClass;
    const modal = canShowModal();
    const wrap = modal ? h("dialog", { class: cls, "aria-labelledby": IDS.title }) : h("div", { class: cls });
    wrap.append(veil, live);
    root.appendChild(wrap);
    document.body.appendChild(host);
    syncPageLock();
    this.host = host;
    this.root = root;
    this.wrap = wrap;
    this.live = live;
    if (modal) this.showModal(wrap as HTMLDialogElement, host);

    veil.addEventListener("click", () => this.onDismiss());
    const block = (e: Event) => e.preventDefault();
    veil.addEventListener("touchmove", block, { passive: false });
    veil.addEventListener("wheel", block, { passive: false });
    root.addEventListener("keydown", (e) => this.tab(e as KeyboardEvent));
    this.listen(document, "keydown", (e) => this.escape(e as KeyboardEvent), true);
    // Focus that lands outside every sheet comes back to this one. The inert
    // page makes this rare; browsers without inert still get it.
    this.listen(document, "focusin", (e) => {
      if (!e.composedPath().some((n) => n instanceof Element && n.hasAttribute(HOST))) this.refocus();
    });
    this.trackViewport();
    if (!this.dialog) this.inertPage(host);
  }

  /** The top layer. The browser makes the rest of the page inert. Its
   *  cancel (Escape, a phone's back gesture) and any close it makes on its
   *  own end in the widget's close. */
  private showModal(dialog: HTMLDialogElement, host: HTMLElement): void {
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.onDismiss();
    });
    dialog.addEventListener("close", () => {
      if (this.host === host) this.onDismiss();
    });
    try {
      dialog.showModal();
      this.dialog = dialog;
    } catch {
      this.dialog = null; // shown as a fixed layer instead, with the page marked inert
    }
  }

  /** Without a modal dialog, mark the page inert, leaving alone what already
   *  is. An older sheet goes inert too and comes back when this one closes. */
  private inertPage(host: HTMLElement): void {
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      if (el.hasAttribute(HOST)) this.inerted.push(el);
      else pageInert.add(el);
    }
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, capture = false): void {
    target.addEventListener(type, fn, capture);
    this.stop.push(() => target.removeEventListener(type, fn, capture));
  }

  /** Escape closes the top sheet wherever focus is, and goes no further. */
  private escape(e: KeyboardEvent): void {
    if (e.key !== "Escape" || e.isComposing || !this.host) return;
    const hosts = document.querySelectorAll(`[${HOST}]`);
    if (hosts[hosts.length - 1] !== this.host) return;
    e.preventDefault();
    e.stopPropagation();
    this.onDismiss();
  }

  private tab(e: KeyboardEvent): void {
    if (e.key !== "Tab" || !this.current || !this.root) return;
    const items = tabbables(this.current.sheet);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = this.root.activeElement as HTMLElement | null;
    const at = active ? items.indexOf(active) : -1;
    if (at === -1) {
      // The heading, or nothing: step to the neighbour in document order,
      // wrapping, so Tab never leaves a screen whose only controls sit
      // above its heading (checking, leaving while the redirect starts).
      e.preventDefault();
      const from = active ?? this.current.heading;
      const after = items.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      const before = items.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      (e.shiftKey ? before[before.length - 1] ?? last : after ?? first).focus();
      return;
    }
    if (e.shiftKey && at === 0) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === items.length - 1) {
      e.preventDefault();
      first.focus();
    }
  }

  private refocus(): void {
    const target = this.current?.heading ?? (this.current ? tabbables(this.current.sheet)[0] : undefined);
    target?.focus({ preventScroll: true });
  }

  /** Follow the visual viewport: with a phone keyboard open, the overlay
   *  shrinks to the visible area and the sheet scrolls inside it. */
  private trackViewport(): void {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      this.dyn?.set(
        `.overlay{--vv-top:${Math.round(vv.offsetTop)}px;--vv-height:${Math.round(vv.height)}px}`,
      );
    };
    this.listen(vv, "resize", update);
    this.listen(vv, "scroll", update);
    update();
  }
}
