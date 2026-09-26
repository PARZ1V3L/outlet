/**
 * The widget: one button, one sheet, the route contract, and the wiring to
 * the core. Direct calls direct(); Vault calls connectRedirect(); the
 * return page hands in handleRedirect()'s promise as the session option.
 * A connection end announced on the page (ended.ts) for the grant this
 * button holds opens the screen for its reason; the capped screen's return
 * refreshes the session and hands the new one to onSession.
 */
import { direct } from "../direct.js";
import { ENDED_EVENT, isConnectionEnded } from "../ended.js";
import { refresh } from "../grants.js";
import { connectRedirect } from "../pkce.js";
import { type ConnectionEndedError, OutletError, type OutletSession } from "../types.js";
import { renderTrigger, setConnected, setIdle } from "./button.js";
import { h } from "./dom.js";
import { clean, sniffProvider } from "./keys.js";
import {
  renderChecking, renderChoose, renderDirectConnected, renderDirectError, renderDirectRefused,
  renderEntry, renderGuide, renderPaste, renderProviderList, applyFieldError,
} from "./render-direct.js";
import { type Actions, type Rendered, closeButton } from "./render-shell.js";
import {
  renderVaultCapped, renderVaultChecking, renderVaultConnected, renderVaultEnded,
  renderVaultExplain, renderVaultLeaving, renderVaultError,
} from "./render-vault.js";
import {
  type Config, type View, connectedView, directStart, directView, isDirectError, openingView,
  parentView, vaultView,
} from "./routes.js";
import { screenProvider } from "./screen-provider.js";
import { Overlay } from "./sheet.js";
import { adoptStyles } from "./styles.js";
import type { ConnectButtonHandle, ConnectButtonOptions, UiProvider } from "./types.js";
import { type Bound, attach, boundFrom, configure, fail } from "./config.js";

/** The connection end the button shows, and the provider its screen names. */
interface Ended { e: ConnectionEndedError; provider: UiProvider }

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
  private draft: { provider: View["provider"]; value: string } | null = null;
  private pasteParent: View | null = null;
  /** The session behind the bound button: the one the app handed in, or
   *  the one this button delivered last. Its refresh token, when it has
   *  one, is what the capped screen's return refreshes with. */
  private session: OutletSession | null = null;
  private ended: Ended | null = null;
  private returnArmed = false;
  private readonly onEndedEvent = (e: Event) => this.hear((e as CustomEvent).detail);
  private readonly onReturn = () => this.returned();

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
    document.addEventListener(ENDED_EVENT, this.onEndedEvent);
    if (opts.session) this.takeSession(opts.session);
  }

  open(): void {
    if (this.destroyed) return;
    const view = this.ended
      ? this.endedView(this.ended)
      : this.bound
        ? connectedView(this.cfg, this.bound.mode, this.bound.provider)
        : openingView(this.cfg);
    this.show(view);
  }

  /** Close, clear any pasted key, return focus to the button. */
  close(): void {
    if (!this.overlay.isOpen) return;
    this.clearField();
    this.clearDraft();
    this.overlay.close();
    this.view = null;
    this.rendered = null;
    this.trigger.focus({ preventScroll: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearField();
    this.clearDraft();
    this.overlay.close();
    this.destroyed = true;
    document.removeEventListener(ENDED_EVENT, this.onEndedEvent);
    this.disarmReturn();
    this.root.replaceChildren();
    if ("adoptedStyleSheets" in this.root) this.root.adoptedStyleSheets = [];
    this.target.replaceChildren();
  }

  private readonly actions: Actions = {
    go: (view) => this.show(view),
    back: () => {
      const parent = this.rendered?.input && this.pasteParent
        ? this.pasteParent : this.view && parentView(this.cfg, this.view);
      if (parent) this.show(parent);
    },
    close: () => this.close(),
    chooseDirect: () => this.show(directStart(this.cfg)),
    chooseVault: () => this.show(vaultView(this.cfg, "explain")),
    pickProvider: (p) => this.show(directView("entry", p)),
    save: (input) => void this.save(input),
    continueToOutlet: () => void this.continueToOutlet(),
    done: () => this.close(),
    raiseCap: () => this.armReturn(),
  };

  /** Detached fields never keep a key. A guide round trip may hold one draft. */
  private clearField(): void {
    if (this.rendered?.input) this.rendered.input.value = "";
  }

  private clearDraft(): void {
    this.draft = null;
    this.pasteParent = null;
  }

  private isDirectWork(view: View | null): boolean {
    if (!view?.provider) return false;
    return ["entry", "guide", "paste"].some((step) => view.id === `direct-${view.provider}-${step}`)
      || view.id === "direct-error-empty" || view.id === "direct-error-format";
  }

  private show(view: View): void {
    if (this.destroyed) return;
    const previous = this.view;
    const sameFlow = previous?.provider === view.provider
      && this.isDirectWork(previous) && this.isDirectWork(view);
    if (!sameFlow) this.clearDraft();
    else if (this.rendered?.input) this.draft = { provider: view.provider, value: this.rendered.input.value };
    if (view.provider && view.id === `direct-${view.provider}-paste`) {
      this.pasteParent = previous?.id === `direct-${view.provider}-guide`
        ? previous : directView("entry", view.provider);
    }
    this.clearField();
    this.view = view;
    this.rendered = this.render(view);
    if (this.rendered.input) {
      const draft = this.draft;
      if (draft && draft.provider === view.provider) this.rendered.input.value = draft.value;
      this.draft = null;
      this.rendered.focus = this.rendered.input;
    }
    this.overlay.show(this.rendered);
  }

  private render(view: View): Rendered {
    const { cfg, actions: a } = this;
    const id = view.id;
    if (id === "choose") return renderChoose(view, cfg, a);
    if (id === "direct-provider" || id === "direct-only") return renderProviderList(view, cfg, a);
    if (isDirectError(id)) return renderDirectError(view, cfg, a);
    if (id.startsWith("direct-")) {
      if (id.endsWith("-entry")) return renderEntry(view, cfg, a);
      if (id.endsWith("-guide")) return renderGuide(view, cfg, a);
      if (id.endsWith("-paste")) return renderPaste(view, cfg, a);
      if (id.endsWith("-checking")) return renderChecking(view, cfg, a);
      if (id.endsWith("-refused")) return renderDirectRefused(view, cfg, a);
      return renderDirectConnected(view, cfg, a);
    }
    if (id.endsWith("-explain") || id.endsWith("-only")) return renderVaultExplain(view, cfg, a);
    if (id.endsWith("-leaving")) return renderVaultLeaving(view, cfg, a);
    if (id.endsWith("-return-checking")) return renderVaultChecking(view, cfg, a);
    if (id.endsWith("-return-error") || id.endsWith("-start-error")) return renderVaultError(view, cfg, a);
    if (id.endsWith("-capped")) return renderVaultCapped(view, cfg, a);
    if (id.endsWith("-ended")) return renderVaultEnded(view, cfg, a);
    return renderVaultConnected(view, cfg, a);
  }

  /** A completed connection: the button turns Connected and any earlier end is over. */
  private bind(b: Bound, session: OutletSession): void {
    this.bound = b;
    this.session = session;
    this.ended = null;
    setConnected(this.trigger, b.mode, screenProvider(this.cfg, b.provider).name);
  }

  /** A connection end announced on the page. Only the grant this button
   *  holds is its business; anything else on the page is left alone, and
   *  so is a button whose element left the page without destroy(). */
  private hear(e: unknown): void {
    if (this.destroyed || !this.target.isConnected || !isConnectionEnded(e)) return;
    const grantId = this.bound?.grantId ?? this.ended?.e.grantId;
    if (!grantId || grantId !== e.grantId) return;
    this.takeEnded(e, this.bound?.provider ?? this.ended?.provider ?? (this.cfg.vault ?? this.cfg.direct[0] as UiProvider));
  }

  /** Show the screen for the reason. Capped keeps the connection (paused);
   *  revoked, expired and refused end it, and the button goes idle. The
   *  same end twice does not redraw a screen already in view. */
  private takeEnded(e: ConnectionEndedError, provider: UiProvider): void {
    const same = this.ended !== null && this.ended.e.reason === e.reason && this.ended.e.grantId === e.grantId;
    this.ended = { e, provider };
    if (e.reason !== "capped") {
      this.bound = null;
      this.session = null;
      setIdle(this.trigger);
    }
    const view = this.endedView(this.ended);
    if (same && this.overlay.isOpen && this.view?.id === view.id) return;
    this.show(view);
    this.announce();
  }

  private endedView(ended: Ended): View {
    if (ended.e.reason === "refused") return directView("refused", ended.provider);
    return vaultView(this.cfg, ended.e.reason === "capped" ? "capped" : "ended", ended.provider);
  }

  /** The capped screen's link opened the account page in a new tab. The
   *  next time this page is in front, the connection is checked again. */
  private armReturn(): void {
    if (this.returnArmed) return;
    this.returnArmed = true;
    document.addEventListener("visibilitychange", this.onReturn);
    window.addEventListener("focus", this.onReturn);
  }

  private disarmReturn(): void {
    if (!this.returnArmed) return;
    this.returnArmed = false;
    document.removeEventListener("visibilitychange", this.onReturn);
    window.removeEventListener("focus", this.onReturn);
  }

  private returned(): void {
    if (document.visibilityState === "hidden") return;
    this.disarmReturn();
    void this.recheck();
  }

  /** Back from the account page: refresh with the session's refresh token.
   *  A raised cap gives a new session, handed to onSession like any other;
   *  a cap still in place shows the capped screen again; a connection that
   *  ended meanwhile shows its screen. Without a refresh token (the app
   *  holds the credentials) the screen stays as it is. */
  private async recheck(): Promise<void> {
    const ended = this.ended;
    const session = this.session;
    const token = (session as { refreshToken?: string } | null)?.refreshToken;
    if (!ended || !session || !token || ended.e.reason !== "capped") return;
    const provider = ended.provider;
    this.show(vaultView(this.cfg, "return-checking", provider));
    this.announce();
    const rendered = this.rendered;
    let fresh: OutletSession;
    try {
      fresh = await refresh(session.grantId, { refreshToken: token, baseUrl: this.opts.baseUrl });
    } catch (e) {
      if (this.destroyed) return;
      // A connection end was announced on the page as it was thrown, and
      // hear() has already shown its screen. Anything else is reported.
      if (isConnectionEnded(e)) return;
      this.report(e);
      if (this.rendered === rendered && this.overlay.isOpen) this.show(this.endedView(ended));
      return;
    }
    if (this.destroyed) return;
    const b = boundFrom(fresh, this.cfg);
    try {
      if (!b) throw new OutletError("The session holds no key this button knows.", "ui_session_unbound");
      await this.opts.onSession(fresh);
    } catch (e) {
      this.report(e);
      if (!this.destroyed && this.overlay.isOpen) this.show(vaultView(this.cfg, "return-error", provider));
      return;
    }
    if (this.destroyed) return;
    this.bind(b, fresh);
    if (this.overlay.isOpen) {
      this.show(connectedView(this.cfg, b.mode, b.provider));
      this.announce();
    }
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
      const words = applyFieldError(r, kind, screenProvider(this.cfg, provider).name);
      // Announced once: from the field, the live region speaks; from Save,
      // the focus move into the described field speaks instead.
      if (wasInField) this.overlay.announce(words);
      this.view = { id: kind === "empty" ? "direct-error-empty" : "direct-error-format", provider };
      input.focus({ preventScroll: true });
      return;
    }
    if (this.destroyed || this.rendered !== r) return;
    input.value = "";
    if (screenProvider(this.cfg, provider).entry) {
      this.show(directView("checking", provider));
      this.announce();
    } else {
      // The generic screen claims no format check, so it shows no checking
      // state: the paste screen waits, its field and Save held, for the app.
      input.disabled = true;
      r.sheet.querySelector<HTMLButtonElement>("button.save")?.setAttribute("disabled", "");
      r.sheet.setAttribute("aria-busy", "true");
      closeButton(r.sheet)?.focus({ preventScroll: true });
    }
    try {
      await this.opts.onSession(session);
    } catch (e) {
      this.report(e);
      if (!this.destroyed && this.overlay.isOpen) this.show({ id: "direct-error-handoff-error", provider });
      return;
    }
    if (this.destroyed) return;
    this.bind({ mode: "direct", provider, grantId: session.grantId }, session);
    if (this.overlay.isOpen) {
      this.show({ ...directView("connected", provider), fresh: true });
      this.announce();
    }
  }

  /** Continue to Outlet: the leaving screen, then the full same-tab
   *  redirect. A failed start gets an error screen and an explicit retry. */
  private async continueToOutlet(): Promise<void> {
    const vaultProvider = this.cfg.vault;
    if (!vaultProvider) return;
    const leaving = vaultView(this.cfg, "leaving");
    if (this.view?.id !== leaving.id) this.show(leaving);
    const rendered = this.rendered;
    const button = rendered?.sheet.querySelector<HTMLButtonElement>("button.primary") ?? null;
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
      if (!this.destroyed && this.overlay.isOpen && this.rendered === rendered) {
        this.show(vaultView(this.cfg, "start-error"));
      }
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
      const b = boundFrom(s as OutletSession, this.cfg);
      if (b) this.bind(b, s as OutletSession);
      return;
    }
    const vaultPath = this.cfg.vault !== null;
    if (vaultPath) {
      this.show(vaultView(this.cfg, "return-checking"));
      this.announce();
    }
    void (async () => {
      let bound: Bound;
      let session: OutletSession;
      try {
        session = await (s as Promise<OutletSession>);
        const b = boundFrom(session, this.cfg);
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
      this.bind(bound, session);
      if (this.overlay.isOpen) {
        this.show(connectedView(this.cfg, bound.mode, bound.provider));
        this.announce();
      }
    })();
  }
}
