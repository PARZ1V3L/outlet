/** The choice, the provider list and every Direct screen. */
import { DIRECT_MARK, SOCKET, VAULT_MARK } from "./assets.js";
import { h, svg } from "./dom.js";
import { type Config, type View, directView, providerListView } from "./routes.js";
import {
  type Actions, type Rendered, IDS, actions, bullets, closeButton, externalLink, fill, finish,
  frame, heading, message, paragraphs, primary, secondary,
} from "./render-shell.js";
import { choose, direct, directErrors, providers } from "./strings.js";
import type { UiProvider } from "./types.js";

export function renderChoose(view: View, cfg: Config, a: Actions): Rendered {
  const sheet = frame(view, cfg, a, {});
  const head = heading(choose.title);
  sheet.appendChild(head);
  const row = (
    id: string, mark: string, name: string, description: string, onClick: () => void,
  ) => {
    const b = h("button", {
      type: "button", class: "choice",
      "aria-labelledby": id + "-name", "aria-describedby": id + "-desc",
    },
      h("span", { class: "tile mode" }, svg(mark)),
      h("span", { class: "choice-copy" },
        h("span", { class: "choice-name", id: id + "-name" }, name),
        h("span", { class: "choice-desc", id: id + "-desc" }, description)),
      h("span", { class: "arrow", "aria-hidden": "true" }, "›"));
    b.addEventListener("click", onClick);
    return b;
  };
  sheet.appendChild(row("outlet-choose-direct", DIRECT_MARK, choose.direct.name, choose.direct.description, () => a.chooseDirect()));
  sheet.appendChild(row("outlet-choose-vault", VAULT_MARK, choose.vault.name, choose.vault.description, () => a.chooseVault()));
  finish(sheet);
  return { sheet, heading: head };
}

export function renderProviderList(view: View, cfg: Config, a: Actions): Rendered {
  const s = direct["direct-provider"];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  sheet.append(head, ...paragraphs([s.lead]));
  for (const p of cfg.direct) {
    const b = h("button", { type: "button", class: "provider" },
      providers[p], h("span", { "aria-hidden": "true" }, "›"));
    b.addEventListener("click", () => a.pickProvider(p));
    sheet.appendChild(b);
  }
  finish(sheet);
  return { sheet, heading: head };
}

export function renderEntry(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const s = direct[`direct-${p}-entry`];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  sheet.append(head, ...paragraphs(s.note ? [s.note] : []));
  sheet.appendChild(actions(
    primary(s.get, () => a.go(directView("guide", p))),
    secondary(s.have, () => a.go(directView("paste", p))),
  ));
  finish(sheet);
  return { sheet, heading: head };
}

export function renderGuide(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const s = direct[`direct-${p}-guide`];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  sheet.appendChild(head);
  if (s.steps) {
    const [open, ...rest] = s.steps;
    sheet.appendChild(h("ol", { class: "overview-steps" },
      h("li", {}, externalLink(open, s.linkUrl)),
      ...rest.map((t) => h("li", {}, t))));
  } else {
    sheet.append(...paragraphs(s.lines ?? []));
    sheet.appendChild(externalLink(s.link ?? "", s.linkUrl, "provider-link"));
  }
  sheet.appendChild(actions(primary(s.paste, () => a.go(directView("paste", p)))));
  sheet.appendChild(externalLink(s.guide, s.guideUrl, "guide"));
  finish(sheet);
  return { sheet, heading: head };
}

/** The paste screen. The two field errors are this screen with the heading
 *  swapped, the bullets gone and the error line shown: see applyFieldError. */
export function renderPaste(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const s = direct[`direct-${p}-paste`];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  const input = h("input", {
    id: IDS.key, type: "password", autocomplete: "off", autocapitalize: "off",
    autocorrect: "off", spellcheck: "false", placeholder: s.placeholder,
    "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true,
  });
  const save = h("button", { type: "button", class: "save" }, s.save);
  save.addEventListener("click", () => a.save(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); a.save(input); }
  });
  sheet.append(
    head,
    bullets(s.lines),
    h("p", { class: "error", id: IDS.error, hidden: true }),
    h("label", { class: "field-label", for: IDS.key }, s.label),
    h("div", { class: "connect-box" }, h("span", { class: "tile" }, svg(SOCKET)), input, save),
  );
  finish(sheet);
  return { sheet, heading: head, input };
}

/** Turn the rendered paste screen into direct-error-empty or
 *  direct-error-format in place: same field, focus stays, the error text
 *  associated with the field. Returns the text to announce once. */
export function applyFieldError(r: Rendered, kind: "empty" | "format", provider: UiProvider): string {
  const id = kind === "empty" ? "direct-error-empty" : "direct-error-format";
  const s = directErrors[id];
  r.sheet.setAttribute("data-state", id);
  r.heading.textContent = fill(s.title, provider);
  r.sheet.querySelector(".explanation")?.setAttribute("hidden", "");
  const slot = r.sheet.querySelector<HTMLElement>("#" + IDS.error);
  const input = r.input as HTMLInputElement;
  input.setAttribute("aria-invalid", "true");
  if (slot && "message" in s) {
    slot.textContent = fill(s.message, provider);
    slot.removeAttribute("hidden");
    input.setAttribute("aria-describedby", IDS.error);
    return slot.textContent;
  }
  // The empty state carries no line: an earlier format message goes away.
  if (slot) {
    slot.textContent = "";
    slot.setAttribute("hidden", "");
  }
  input.removeAttribute("aria-describedby");
  return r.heading.textContent ?? "";
}

export function renderChecking(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const s = direct[`direct-${p}-checking`];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct", status: true });
  const m = message({ busy: true, title: s.title });
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: closeButton(sheet) };
}

export function renderDirectConnected(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const s = direct[`direct-${p}-connected`];
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct", status: true });
  // One wink per connection: on the completion, never on a reopen.
  const m = message({ wink: view.fresh === true, title: s.title, lines: s.lines });
  const done = primary(s.done ?? "", () => a.done());
  m.wrap.appendChild(actions(done));
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: done };
}

/** wrong-provider, admin-refused, unsupported and handoff-error. */
export function renderDirectError(view: View, cfg: Config, a: Actions): Rendered {
  const p = view.provider as UiProvider;
  const other = view.other;
  const id = view.id as keyof typeof directErrors;
  const s = directErrors[id];
  const sheet = frame(view, cfg, a, { header: fill(s.header, p), mode: "direct" });
  const head = heading(fill(s.title, p, other));
  sheet.append(head, ...paragraphs([fill(("message" in s && s.message) || "", p, other)], "error"));
  const items: HTMLElement[] = [];
  if (id === "direct-error-wrong-provider" && "use" in s) {
    items.push(primary(fill(s.use, p, other), () => a.go(directView("paste", other as UiProvider))));
    items.push(secondary(s.another, () => a.go(directView("paste", p))));
  } else if (id === "direct-error-admin-refused" && "get" in s) {
    items.push(primary(s.get, () => a.go(directView("guide", p))));
    if (cfg.vault) items.push(secondary(s.vault, () => a.chooseVault()));
  } else if (id === "direct-error-unsupported" && "choose" in s) {
    items.push(primary(s.choose, () => a.go(providerListView(cfg) ?? directView("entry", p))));
  } else if ("retry" in s) {
    items.push(primary(s.retry, () => a.go(directView("paste", p))));
  }
  sheet.appendChild(actions(...items));
  finish(sheet);
  return { sheet, heading: head };
}
