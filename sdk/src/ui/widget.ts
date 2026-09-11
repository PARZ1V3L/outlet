/**
 * The widget: one button, one sheet, the route contract, and the wiring to
 * the core. Direct calls direct(); Vault calls connectRedirect(); the
 * return page hands in handleRedirect()'s promise as the session option.
 */
import { direct } from "../direct.js";
import { connectRedirect } from "../pkce.js";
import { OutletError, type OutletSession } from "../types.js";
import { renderTrigger, setConnected } from "./button.js";
import { h } from "./dom.js";
import { clean, sniffProvider } from "./keys.js";
import {
  renderChecking, renderChoose, renderDirectConnected, renderDirectError, renderEntry,
  renderGuide, renderPaste, renderProviderList, applyFieldError,
} from "./render-direct.js";
import type { Actions, Rendered } from "./render-shell.js";
import {
  renderVaultChecking, renderVaultConnected, renderVaultExplain, renderVaultLeaving,
  renderVaultReturnError,
} from "./render-vault.js";
import {
  type Config, type View, connectedView, directStart, directView, openingView, parentView,
  vaultView,
} from "./routes.js";
import { Overlay } from "./sheet.js";
import { adoptStyles } from "./styles.js";
import type { ConnectButtonHandle, ConnectButtonOptions } from "./types.js";
import { type Bound, attach, boundFrom, configure, fail } from "./config.js";

export class Widget {
  readonly handle: ConnectButtonHandle;
  private readonly cfg: Config;
  private readonly root: ShadowRoot;
  private readonly trigger: HTMLButtonElement;
  private readonly overlay: Overlay;
  private view: View | null = null;
  private rendered: Rendered | null = null;
  private bound: Bound | null = null;
  private destroyed = false;

  constructor(private readonly target: HTMLElement, private readonly opts: ConnectButtonOptions) {
    if (!target || typeof target !== "object" || !("attachShadow" in target)) {
      fail("mountConnectButton needs an element to mount on.", "ui_target_required");
    }
    this.cfg = configure(opts);
    const theme = "t-" + (opts.theme === "light" || opts.theme === "dark" ? opts.theme : "auto");
    this.root = attach(target);
    this.root.replaceChildren();
    adoptStyles(this.root);
    this.trigger = renderTrigger();
    this.trigger.addEventListener("click", () => this.open());
    this.root.appendChild(h("div", { class: "root trigger " + theme }, this.trigger));
    this.overlay = new Overlay(theme, () => this.close());
    this.handle = {
      open: () => this.open(),
      close: () => this.close(),
      destroy: () => this.destroy(),
    };
    if (opts.session) this.takeSession(opts.session);
  }

  open(): void {
    if (this.destroyed) return;
    const view = this.bound
      ? connectedView(this.cfg, this.bound.mode, this.bound.provider)
      : openingView(this.cfg);
    this.show(view);
  }

  /** Close, clear any pasted key, return focus to the button. */
  close(): void {
    if (!this.overlay.isOpen) return;
    this.clearField();
    this.overlay.close();
    this.view = null;
    this.rendered = null;
    this.trigger.focus({ preventScroll: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearField();
    this.overlay.close();
    this.destroyed = true;
    this.root.replaceChildren();
    if ("adoptedStyleSheets" in this.root) this.root.adoptedStyleSheets = [];
    this.target.replaceChildren();
  }

  private readonly actions: Actions = {
    go: (view) => this.show(view),
    back: () => {
      const parent = this.view && parentView(this.cfg, this.view);
      if (parent) this.show(parent);
    },
    close: () => this.close(),
    chooseDirect: () => this.show(directStart(this.cfg)),
    chooseVault: () => this.show(vaultView(this.cfg, "explain")),
    pickProvider: (p) => this.show(directView("entry", p)),
    save: (input) => void this.save(input),
    continueToOutlet: () => void this.continueToOutlet(),
    done: () => this.close(),
  };

  /** Leaving a screen with the paste field drops whatever was in it. */
  private clearField(): void {
    if (this.rendered?.input) this.rendered.input.value = "";
  }

  private show(view: View): void {
    if (this.destroyed) return;
    this.clearField();
    this.view = view;
    this.rendered = this.render(view);
    this.overlay.show(this.rendered);
  }

  private render(view: View): Rendered {
    const { cfg, actions: a } = this;
    const id = view.id;
    if (id === "choose") return renderChoose(view, cfg, a);
    if (id === "direct-provider" || id === "direct-only") return renderProviderList(view, cfg, a);
    if (id.startsWith("direct-error-")) return renderDirectError(view, cfg, a);
    if (id.startsWith("direct-")) {
      if (id.endsWith("-entry")) return renderEntry(view, cfg, a);
      if (id.endsWith("-guide")) return renderGuide(view, cfg, a);
      if (id.endsWith("-paste")) return renderPaste(view, cfg, a);
      if (id.endsWith("-checking")) return renderChecking(view, cfg, a);
      return renderDirectConnected(view, cfg, a);
    }
    if (id.endsWith("-explain") || id.endsWith("-only")) return renderVaultExplain(view, cfg, a);
    if (id.endsWith("-leaving")) return renderVaultLeaving(view, cfg, a);
    if (id.endsWith("-return-checking")) return renderVaultChecking(view, cfg, a);
    if (id.endsWith("-return-error")) return renderVaultReturnError(view, cfg, a);
    return renderVaultConnected(view, cfg, a);
  }

  private bind(b: Bound): void {
    this.bound = b;
    setConnected(this.trigger, b.mode, b.provider);
  }

  /** Tell the app, and carry on if its handler throws or is not a function. */
  private report(e: unknown): void {
    try {
      this.opts.onError?.(e);
    } catch {
      /* the app's handler failed; the sheet still moves on */
    }
  }

  private announce(): void {
    this.overlay.announce(this.rendered?.heading.textContent ?? "");
  }

  /** Save on the paste screen: the local check, then the hand-off. */
  private async save(input: HTMLInputElement): Promise<void> {
    const provider = this.view?.provider;
    const r = this.rendered;
    if (!provider || !r || r.input !== input) return;
    const wasInField = this.overlay.activeElement === input;
    const raw = input.value;
    let session: OutletSession;
    try {
      session = await direct({ keys: { [provider]: raw } });
    } catch (e) {
      if (this.destroyed || this.rendered !== r) return;
      const code = e instanceof OutletError ? e.code : "";
      if (code === "admin_key_rejected") {
        this.show({ id: "direct-error-admin-refused", provider });
        return;
      }
      const other = code === "wrong_provider_key" ? sniffProvider(raw) : null;
      if (other && other !== provider) {
        const supported = this.cfg.direct.includes(other);
        this.show({ id: supported ? "direct-error-wrong-provider" : "direct-error-unsupported", provider, other });
        return;
      }
      const kind = clean(raw) === "" ? "empty" : "format";
      const words = applyFieldError(r, kind, provider);
      // Announced once: from the field, the live region speaks; from Save,
      // the focus move into the described field speaks instead.
      if (wasInField) this.overlay.announce(words);
      this.view = { id: kind === "empty" ? "direct-error-empty" : "direct-error-format", provider };
      input.focus({ preventScroll: true });
      return;
    }
    if (this.destroyed || this.rendered !== r) return;
    input.value = "";
    this.show(directView("checking", provider));
    this.announce();
    try {
      await this.opts.onSession(session);
    } catch (e) {
      this.report(e);
      if (!this.destroyed && this.overlay.isOpen) this.show({ id: "direct-error-handoff-error", provider });
      return;
    }
    if (this.destroyed) return;
    this.bind({ mode: "direct", provider });
    if (this.overlay.isOpen) {
      this.show({ ...directView("connected", provider), fresh: true });
      this.announce();
    }
  }

  /** Continue to Outlet: the leaving screen, then the full same-tab
   *  redirect. If the page is still here, the button is the retry. */
  private async continueToOutlet(): Promise<void> {
    const vaultProvider = this.cfg.vault;
    if (!vaultProvider) return;
    const leaving = vaultView(this.cfg, "leaving");
    if (this.view?.id !== leaving.id) this.show(leaving);
    const button = this.rendered?.sheet.querySelector<HTMLButtonElement>("button.primary") ?? null;
    if (button) button.disabled = true;
    try {
      await connectRedirect({
        appId: this.opts.appId as string,
        providers: [vaultProvider],
        redirectUri: this.opts.redirectUri as string,
        requestedCapUsd: this.opts.requestedCapUsd,
        baseUrl: this.opts.baseUrl,
      });
    } catch (e) {
      this.report(e);
    } finally {
      if (button) {
        button.disabled = false;
        // A disabled button drops focus; if nothing in the sheet holds it, the retry does.
        if (this.overlay.isOpen && !this.overlay.activeElement && button.isConnected) {
          button.focus({ preventScroll: true });
        }
      }
    }
  }

  /** A held session binds the button. A pending one (the return page's
   *  handleRedirect()) shows the Vault checking screen until it settles. */
  private takeSession(s: OutletSession | Promise<OutletSession>): void {
    if (!(s instanceof Promise) && typeof (s as { then?: unknown }).then !== "function") {
      const b = boundFrom(s as OutletSession);
      if (b) this.bind(b);
      return;
    }
    const vaultPath = this.cfg.vault !== null;
    if (vaultPath) {
      this.show(vaultView(this.cfg, "return-checking"));
      this.announce();
    }
    void (async () => {
      let bound: Bound;
      try {
        const session = await (s as Promise<OutletSession>);
        const b = boundFrom(session);
        // Connected needs a key this button has a screen for; anything else is a failed return.
        if (!b) throw new OutletError("The session holds no key this button knows.", "ui_session_unbound");
        await this.opts.onSession(session);
        bound = b;
      } catch (e) {
        this.report(e);
        if (!this.destroyed && vaultPath && this.overlay.isOpen) this.show(vaultView(this.cfg, "return-error"));
        return;
      }
      if (this.destroyed) return;
      this.bind(bound);
      if (this.overlay.isOpen) {
        this.show(connectedView(this.cfg, bound.mode, bound.provider));
        this.announce();
      }
    })();
  }
}
