/** The Vault screens: explain, leaving, the return, connected, and the two
 *  connection ends (capped, ended). */
import { h, svg } from "./dom.js";
import { type Config, type View, vaultProviderOf } from "./routes.js";
import {
  type Actions, type Rendered, actions, bullets, closeButton, externalLink, finish, frame,
  heading, message, primary,
} from "./render-shell.js";
import { fill, screenProvider } from "./screen-provider.js";
import { vaultExplain, vaultStatus } from "./strings.js";
import type { VaultStatusStrings } from "./strings-shape.js";

const LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg>';
const PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const NEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

/** The provider a Vault screen names, its header, and a status screen's
 *  words with the provider's name filled in. */
function vaultWords(view: View, cfg: Config, step?: Exclude<keyof typeof vaultStatus, "header">) {
  const p = screenProvider(cfg, vaultProviderOf(view.id));
  const header = fill(vaultStatus.header, p.name);
  const status: VaultStatusStrings | null = step ? { header, ...vaultStatus[step] } : null;
  if (status) status.title = fill(status.title, p.name);
  return { p, header, status };
}

export function renderVaultExplain(view: View, cfg: Config, a: Actions): Rendered {
  const { p, header } = vaultWords(view, cfg);
  const s = vaultExplain[p.id] ?? vaultExplain.openai!;
  const sheet = frame(view, cfg, a, { header, mode: "vault" });
  const head = heading(s.title);
  sheet.append(head, ...s.intro.map(line => h("p", {}, line)));
  if (s.steps) {
    sheet.appendChild(h("ol", { class: "vault-steps", role: "list" }, ...s.steps.map((step, i) =>
      h("li", {}, h("span", { class: "step-number", "aria-hidden": "true" }, String(i + 1)),
        h("div", {}, h("h2", {}, step.title), h("p", {}, step.body),
          step.note && h("p", { class: "step-trust" }, svg(LOCK), step.note))))));
  }
  const fine = !s.fineInView && h("p", { class: s.steps ? undefined : "fine" }, s.fine);
  const detailBody = s.steps
    ? h("div", { class: "vault-detail-body" }, ...s.lines.map(line => h("p", {}, line)), fine)
    : h("div", {}, bullets(s.lines), fine);
  sheet.appendChild(h("details", { class: "vault-details" },
    h("summary", { tabindex: "0" }, s.details, s.steps && svg(PLUS)), detailBody));
  if (s.fineInView) sheet.appendChild(h("p", { class: "fine fine-in-view" }, s.fine));
  const next = primary(s.continue, (b) => a.continueToOutlet(b));
  if (s.steps) next.appendChild(svg(NEXT));
  sheet.appendChild(actions(next));
  if (s.steps) {
    sheet.classList.add("vault-step-sheet");
  }
  finish(sheet);
  return { sheet, heading: head };
}

export function renderVaultLeaving(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, "leaving").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ busy: true, title: s.title, lines: s.lines });
  m.wrap.appendChild(actions(primary(s.continue ?? "", (b) => a.continueToOutlet(b))));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading };
}

export function renderVaultChecking(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, "return-checking").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ busy: true, title: s.title, lines: s.lines });
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: closeButton(sheet) };
}

export function renderVaultConnected(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, "connected").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  // The hosted page winked before the return; the one wink stays single.
  const m = message({ title: s.title, lines: s.lines });
  const done = primary(s.done ?? "", () => a.done());
  m.wrap.appendChild(actions(
    externalLink(s.manage ?? "", s.manageUrl ?? "", "provider-link"),
    done,
  ));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: done };
}

export function renderVaultError(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, view.id.endsWith("-start-error") ? "start-error" : "return-error").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault" });
  const head = heading(s.title);
  sheet.appendChild(head);
  for (const line of s.lines ?? []) sheet.appendChild(h("p", { class: "error" }, line));
  sheet.appendChild(actions(primary(s.retry ?? "", (b) => a.continueToOutlet(b))));
  finish(sheet);
  return { sheet, heading: head };
}

/** Paused at its cap: the line, and one link that opens the account page
 *  in a new tab. The socket keeps its voltage eyes: the connection is
 *  still there. When the person is back, the widget refreshes. */
export function renderVaultCapped(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, "capped").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ title: s.title });
  const raise = h("a", { class: "primary", href: s.raiseUrl ?? "", target: "_blank", rel: "noopener noreferrer" }, s.raise ?? "");
  raise.addEventListener("click", () => a.raiseCap());
  m.wrap.appendChild(actions(raise));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: raise };
}

/** Revoked, disconnected or expired: the line, grey eyes, and one button
 *  that runs the grant again. */
export function renderVaultEnded(view: View, cfg: Config, a: Actions): Rendered {
  const s = vaultWords(view, cfg, "ended").status!;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ title: s.title, off: true });
  const again = primary(s.again ?? "", (b) => a.continueToOutlet(b));
  m.wrap.appendChild(actions(again));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: again };
}
