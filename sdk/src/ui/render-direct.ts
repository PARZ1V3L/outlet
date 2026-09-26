/** The choice, the provider list and every Direct screen. */
import { DIRECT_MARK, VAULT_MARK } from "./assets.js";
import { directWords } from "./direct-words.js";
import { h, svg } from "./dom.js";
import { type Config, type View, directView, providerListView } from "./routes.js";
import {
  type Actions, type Rendered, IDS, actions, closeButton, externalLink, finish,
  frame, heading, keyReassurance, message, paragraphs, primary, secondary,
} from "./render-shell.js";
import { fill, screenProvider } from "./screen-provider.js";
import { choose, directErrors, directKeyStorage, providerList } from "./strings.js";
import type { UiProvider } from "./types.js";

/** The provider a Direct screen is about, and its words. */
function wordsOf(view: View, cfg: Config) {
  const p = screenProvider(cfg, view.provider as UiProvider);
  return { p, words: directWords(p) };
}

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
  const s = providerList;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  sheet.append(head, ...paragraphs([s.lead]));
  for (const id of cfg.direct) {
    const b = h("button", { type: "button", class: "provider" },
      screenProvider(cfg, id).name, h("span", { "aria-hidden": "true" }, "›"));
    b.addEventListener("click", () => a.pickProvider(id));
    sheet.appendChild(b);
  }
  finish(sheet);
  return { sheet, heading: head };
}

export function renderEntry(view: View, cfg: Config, a: Actions): Rendered {
  const { p, words } = wordsOf(view, cfg);
  const s = words.entry;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  sheet.append(head, ...paragraphs([s.note, s.missing].filter((line): line is string => Boolean(line))));
  const have = () => a.go(directView("paste", p.id));
  // With no keys page there is no guide to open: the key the person has is
  // the one way on, and the screen never offers a link that leads nowhere.
  sheet.appendChild(s.get
    ? actions(primary(s.get, () => a.go(directView("guide", p.id))), secondary(s.have, have))
    : actions(primary(s.have, have)));
  finish(sheet);
  return { sheet, heading: head };
}

export function renderGuide(view: View, cfg: Config, a: Actions): Rendered {
  const { p, words } = wordsOf(view, cfg);
  const s = words.guide;
  if (!s) return renderEntry(directView("entry", p.id), cfg, a);
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  sheet.classList.add("guide-screen");
  const head = heading(s.title);
  const [open, ...rest] = s.steps;
  sheet.append(head, h("ol", { class: "overview-steps" },
    h("li", {}, externalLink(open, s.linkUrl, "guide-open"),
      s.linkHost && h("span", { class: "link-host" }, s.linkHost)),
    ...rest.map((t) => h("li", {}, t))));
  if (s.scope) sheet.appendChild(h("p", { class: "guide-note" }, s.scope));
  sheet.appendChild(actions(primary(s.paste, () => a.go(directView("paste", p.id)))));
  if (s.guide && s.guideUrl) sheet.appendChild(externalLink(s.guide, s.guideUrl, "guide"));
  finish(sheet);
  return { sheet, heading: head };
}

/** The paste screen. Field errors keep this field and its reassurance in place. */
export function renderPaste(view: View, cfg: Config, a: Actions): Rendered {
  const s = wordsOf(view, cfg).words.paste;
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct" });
  const head = heading(s.title);
  const input = h("input", {
    id: IDS.key, type: "password", autocomplete: "off", autocapitalize: "off",
    autocorrect: "off", spellcheck: "false", placeholder: s.placeholder,
    "aria-describedby": s.hint ? IDS.hint : null,
    "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true,
  });
  const save = h("button", { type: "button", class: "primary save" }, s.save);
  save.addEventListener("click", () => a.save(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); a.save(input); }
  });
  sheet.append(
    head,
    h("label", { class: "field-label", for: IDS.key }, s.label),
    h("div", { class: "connect-box" }, input),
    ...(s.hint ? [h("p", { class: "field-hint", id: IDS.hint }, s.hint)] : []),
    h("p", { class: "error field-error", id: IDS.error, hidden: true }),
    keyReassurance(s.lines),
    ...(cfg.directKeyStorage ? [h("p", { class: "key-storage" }, directKeyStorage[cfg.directKeyStorage])] : []),
    actions(save),
  );
  finish(sheet);
  return { sheet, heading: head, input };
}

/** Turn the rendered paste screen into direct-error-empty or
 *  direct-error-format in place: same field, focus stays, the error text
 *  associated with the field beside its format hint. Returns the text to
 *  announce once. */
export function applyFieldError(r: Rendered, kind: "empty" | "format", providerName: string): string {
  const id = kind === "empty" ? "direct-error-empty" : "direct-error-format";
  const s = directErrors[id];
  r.sheet.setAttribute("data-state", id);
  r.heading.textContent = fill(s.title, providerName);
  const slot = r.sheet.querySelector<HTMLElement>("#" + IDS.error);
  const hint = r.sheet.querySelector<HTMLElement>("#" + IDS.hint);
  const input = r.input as HTMLInputElement;
  const describe = (...ids: Array<string | false>) => {
    const list = ids.filter(Boolean).join(" ");
    if (list) input.setAttribute("aria-describedby", list);
    else input.removeAttribute("aria-describedby");
  };
  input.setAttribute("aria-invalid", "true");
  if (slot && "message" in s) {
    slot.textContent = fill(s.message, providerName);
    slot.removeAttribute("hidden");
    describe(IDS.error, hint !== null && IDS.hint);
    return slot.textContent;
  }
  // The empty state carries no line: an earlier format message goes away.
  if (slot) {
    slot.textContent = "";
    slot.setAttribute("hidden", "");
  }
  describe(hint !== null && IDS.hint);
  return r.heading.textContent ?? "";
}

export function renderChecking(view: View, cfg: Config, a: Actions): Rendered {
  const { words } = wordsOf(view, cfg);
  const s = words.checking ?? { header: words.paste.header, title: "" };
  const sheet = frame(view, cfg, a, { header: s.header, mode: "direct", status: true });
  const m = message({ busy: true, title: s.title });
  sheet.appendChild(m.wrap);
  finish(sheet);
  return { sheet, heading: m.heading, focus: closeButton(sheet) };
}

export function renderDirectConnected(view: View, cfg: Config, a: Actions): Rendered {
  const s = wordsOf(view, cfg).words.connected;
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
  const p = screenProvider(cfg, view.provider as UiProvider);
  const other = view.other ? screenProvider(cfg, view.other) : null;
  const say = (line: string) => fill(line, p.name, other?.name);
  const id = view.id as keyof typeof directErrors;
  const s = directErrors[id];
  const sheet = frame(view, cfg, a, { header: say(s.header), mode: "direct" });
  const head = heading(say(s.title));
  sheet.append(head, ...paragraphs([say(("message" in s && s.message) || "")], "error"));
  const items: HTMLElement[] = [];
  if (id === "direct-error-wrong-provider" && "use" in s) {
    items.push(primary(say(s.use), () => a.go(directView("paste", view.other as UiProvider))));
    items.push(secondary(s.another, () => a.go(directView("paste", p.id))));
  } else if (id === "direct-error-admin-refused" && "get" in s) {
    // A described provider with no keys page has no guide: its entry says so.
    items.push(primary(s.get, () => a.go(directView(p.keysUrl ? "guide" : "entry", p.id))));
    if (cfg.vault) items.push(secondary(s.vault, () => a.chooseVault()));
  } else if (id === "direct-error-unsupported" && "choose" in s) {
    items.push(primary(s.choose, () => a.go(providerListView(cfg) ?? directView("entry", p.id))));
  } else if ("retry" in s) {
    items.push(primary(s.retry, () => a.go(directView("paste", p.id))));
  }
  sheet.appendChild(actions(...items));
  finish(sheet);
  return { sheet, heading: head };
}
