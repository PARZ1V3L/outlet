/** The shapes of the widget's word entries. The words live in strings.ts
 *  and in the provider registry. direct-words.ts fills these per provider. */

export interface EntryStrings {
  header: string;
  title: string;
  note?: string;
  /** The generic screen with no keys page: the line that says so. `get`
   *  is absent then, and `have` is the one action. */
  missing?: string;
  get?: string;
  have: string;
}

export interface GuideStrings {
  header: string;
  title: string;
  /** Three numbered steps, the first one a link to the provider's keys page. */
  steps: [string, string, string];
  linkUrl: string;
  /** The generic screen: the link's hostname, shown beside it, because the
   *  app chose the destination. */
  linkHost?: string;
  /** A line under the steps (fal: which scope is for which key). */
  scope?: string;
  paste: string;
  /** The full guide link, only where a guide page exists. */
  guide?: string;
  guideUrl?: string;
}

export interface PasteStrings {
  header: string;
  title: string;
  /** Three reassurance lines on a named screen, one on the generic screen. */
  lines: string[];
  label: string;
  placeholder: string;
  /** The registry's format hint. The generic screen has none. */
  hint?: string;
  save: string;
}

export interface StatusStrings {
  header: string;
  title: string;
  lines?: string[];
  done?: string;
}

/** Every Direct screen of one provider. */
export interface DirectWords {
  entry: EntryStrings;
  /** Null on the generic screen when the app supplied no keys page. */
  guide: GuideStrings | null;
  paste: PasteStrings;
  /** Null on the generic screen: no format check of the provider's own
   *  runs there, so no checking state shows. */
  checking: StatusStrings | null;
  connected: StatusStrings;
}

export interface VaultExplainStrings {
  title: string;
  intro: string[];
  steps?: Array<{ title: string; body: string; note?: string }>;
  details: string;
  lines: string[];
  fine: string;
  /** Show `fine` under the detail, in view without opening it. */
  fineInView?: boolean;
  continue: string;
}

export interface VaultStatusStrings extends StatusStrings {
  continue?: string;
  retry?: string;
  manage?: string;
  manageUrl?: string;
  /** The capped screen: the one action opens the account page on useoutlet.dev. */
  raise?: string;
  raiseUrl?: string;
  /** The ended screen: the one action runs the grant again. */
  again?: string;
}
