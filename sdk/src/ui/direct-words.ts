/** A provider's Direct screens, put together: the named screen from the
 *  template and the registry entry, or the generic screen from what the
 *  app supplied. */
import { type ScreenProvider, fill } from "./screen-provider.js";
import { directGeneric, directTemplate as t, providerWords } from "./strings.js";
import type { DirectWords } from "./strings-shape.js";

export function directWords(p: ScreenProvider): DirectWords {
  const say = (line: string) => fill(line, p.name);
  const header = say(t.header);
  const paste = {
    header,
    title: t.paste.title,
    label: say(t.paste.label),
    placeholder: t.paste.placeholder,
    save: t.paste.save,
  };
  const connected = { header, title: say(t.connected.title), lines: t.connected.lines, done: t.connected.done };

  if (p.entry) {
    const own = providerWords[p.id] ?? {};
    return {
      entry: { header, title: t.entry.title, note: own.note ?? say(t.entry.note), get: t.entry.get, have: t.entry.have },
      guide: {
        header,
        title: t.guide.title,
        steps: [own.open ?? say(t.guide.open), p.entry.createAction, own.copy ?? t.guide.copy],
        linkUrl: p.entry.keysUrl,
        scope: own.scope,
        paste: t.guide.paste,
        guide: own.guideUrl ? t.guide.guide : undefined,
        guideUrl: own.guideUrl,
      },
      paste: { ...paste, lines: t.paste.lines, hint: p.entry.formatHint },
      checking: { header, title: t.checking.title },
      connected,
    };
  }

  const g = directGeneric;
  return {
    entry: p.keysUrl
      ? { header, title: t.entry.title, note: say(g.note), get: t.entry.get, have: t.entry.have }
      : { header, title: t.entry.title, note: say(g.note), missing: say(g.noKeysPage), have: t.entry.have },
    guide: p.keysUrl
      ? {
          header,
          title: t.guide.title,
          steps: [say(g.open), say(g.create), g.copy],
          linkUrl: p.keysUrl,
          linkHost: new URL(p.keysUrl).hostname,
          paste: t.guide.paste,
        }
      : null,
    paste: { ...paste, lines: [g.reassurance] },
    checking: null,
    connected,
  };
}
