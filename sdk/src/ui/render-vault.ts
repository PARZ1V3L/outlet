/** The Vault screens: explain, leaving, the return, connected. */
import { h } from "./dom.js";
import type { Config, View } from "./routes.js";
import {
  type Actions, type Rendered, actions, bullets, closeButton, externalLink, finish, frame,
  heading, message, primary,
} from "./render-shell.js";
import { vault } from "./strings.js";

type ExplainId = "vault-explain" | "vault-only" | "vault-anthropic-explain" | "vault-anthropic-only";

export function renderVaultExplain(view: View, cfg: Config, a: Actions): Rendered {
  const s = vault[view.id as ExplainId];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault" });
  const head = heading(s.title);
  sheet.append(head, bullets(s.lines), h("p", { class: "fine" }, s.fine));
  sheet.appendChild(actions(primary(s.continue, (b) => a.continueToOutlet(b))));
  finish(sheet);
  return { sheet, heading: head };
}

export function renderVaultLeaving(view: View, cfg: Config, a: Actions): Rendered {
  const s = vault[view.id as "vault-leaving" | "vault-anthropic-leaving"];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ busy: true, title: s.title, lines: s.lines });
  m.wrap.appendChild(actions(primary(s.continue ?? "", (b) => a.continueToOutlet(b))));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading };
}

export function renderVaultChecking(view: View, cfg: Config, a: Actions): Rendered {
  const s = vault[view.id as "vault-return-checking" | "vault-anthropic-return-checking"];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault", status: true });
  const m = message({ busy: true, title: s.title, lines: s.lines });
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: closeButton(sheet) };
}

export function renderVaultConnected(view: View, cfg: Config, a: Actions): Rendered {
  const s = vault[view.id as "vault-connected" | "vault-anthropic-connected"];
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

export function renderVaultReturnError(view: View, cfg: Config, a: Actions): Rendered {
  const s = vault[view.id as "vault-return-error" | "vault-anthropic-return-error"];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "vault" });
  const head = heading(s.title);
  sheet.appendChild(head);
  for (const line of s.lines ?? []) sheet.appendChild(h("p", { class: "error" }, line));
  sheet.appendChild(actions(primary(s.retry ?? "", (b) => a.continueToOutlet(b))));
  finish(sheet);
  return { sheet, heading: head };
}
