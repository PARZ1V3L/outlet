/** The shapes of the widget's word entries. The words live in strings.ts. */

export interface EntryStrings {
  header: string;
  title: string;
  note?: string;
  get: string;
  have: string;
}

export interface GuideStrings {
  header: string;
  title: string;
  /** OpenAI and Anthropic: three numbered steps, the first one a link. */
  steps?: [string, string, string];
  /** Google: two lines and a link pill instead of numbered steps. */
  lines?: string[];
  link?: string;
  linkUrl: string;
  paste: string;
  guide: string;
  guideUrl: string;
}

export interface PasteStrings {
  header: string;
  title: string;
  lines: string[];
  label: string;
  placeholder: string;
  save: string;
}

export interface StatusStrings {
  header: string;
  title: string;
  lines?: string[];
  done?: string;
}

export interface VaultExplainStrings {
  header: string;
  title: string;
  lines: string[];
  fine: string;
  continue: string;
}

export interface VaultStatusStrings extends StatusStrings {
  continue?: string;
  retry?: string;
  manage?: string;
  manageUrl?: string;
}
