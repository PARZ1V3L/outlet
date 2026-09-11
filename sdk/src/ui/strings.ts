/**
 * Every visible word in the Connect your AI widget, keyed by the design's
 * state ids. All of it is DRAFT until Parz's word pass; his changes land here
 * and nowhere else. `{provider}` is the provider the person chose, `{other}`
 * the one a pasted key looks like, both filled from `providers` below.
 */
import type { UiProvider } from "./types.js";
import type {
  EntryStrings, GuideStrings, PasteStrings, StatusStrings, VaultExplainStrings, VaultStatusStrings,
} from "./strings-shape.js";

export const providers: Record<UiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

/** The shared chrome. */
export const common = {
  close: "Close",
  back: "Back",
  poweredBy: "Powered by Outlet",
  outlet: "Outlet",
};

export const button = {
  idle: "Connect your AI",
  connected: "Connected · {provider}",
  /** Accessible names for the connected button, by the completed mode. */
  name: {
    direct: "Connected to {provider} in Direct",
    vault: "Connected to {provider} in Vault",
  },
};

export const choose = {
  title: "Connect your AI",
  direct: { name: "Direct", description: "Use your API key to connect." },
  vault: {
    name: "Vault",
    description:
      "Connect your account with an admin key. Track spending and revoke this app’s access any time.",
  },
};

const providerList = {
  header: "Direct",
  title: "Choose your provider",
  lead: "Use your own API key in Direct.",
};


const pasteLines = ["Checked on this device.", "Passed to this app.", "Never sent to Outlet."];
const connectedLines = ["Your Direct API key is ready for this app.", "Only the format was checked."];

export const direct = {
  "direct-provider": providerList,
  "direct-only": providerList,

  "direct-openai-entry": {
    header: "Direct · OpenAI",
    title: "Your Direct API key",
    note: "OpenAI API credits are billed separately from ChatGPT.",
    get: "Get my Direct API key",
    have: "I have my Direct API key",
  } satisfies EntryStrings as EntryStrings,
  "direct-openai-guide": {
    header: "Direct · OpenAI",
    title: "Get your Direct API key",
    steps: ["Open the OpenAI website", "Create a Direct API key.", "Copy it and return here."],
    linkUrl: "https://platform.openai.com/api-keys",
    paste: "Paste my Direct API key",
    guide: "Full Direct guide",
    guideUrl: "https://useoutlet.dev/docs/users/openai-api-key.html",
  } satisfies GuideStrings as GuideStrings,
  "direct-openai-paste": {
    header: "Direct · OpenAI",
    title: "Paste your Direct API key",
    lines: pasteLines,
    label: "Direct API key · OpenAI",
    placeholder: "Paste your Direct API key",
    save: "Save",
  } satisfies PasteStrings as PasteStrings,
  "direct-openai-checking": { header: "Direct · OpenAI", title: "Checking the format" } satisfies StatusStrings as StatusStrings,
  "direct-openai-connected": {
    header: "Direct · OpenAI",
    title: "Connected to OpenAI",
    lines: connectedLines,
    done: "Done",
  } satisfies StatusStrings as StatusStrings,

  "direct-anthropic-entry": {
    header: "Direct · Anthropic",
    title: "Your Direct API key",
    note: "Anthropic API credits are billed separately from Claude subscriptions.",
    get: "Get my Direct API key",
    have: "I have my Direct API key",
  } satisfies EntryStrings as EntryStrings,
  "direct-anthropic-guide": {
    header: "Direct · Anthropic",
    title: "Get your Direct API key",
    steps: ["Open the Anthropic website", "Create a Direct API key.", "Copy it and return here."],
    linkUrl: "https://platform.claude.com/settings/keys",
    paste: "Paste my Direct API key",
    guide: "Full Direct guide",
    guideUrl: "https://useoutlet.dev/docs/users/anthropic-api-key.html",
  } satisfies GuideStrings as GuideStrings,
  "direct-anthropic-paste": {
    header: "Direct · Anthropic",
    title: "Paste your Direct API key",
    lines: pasteLines,
    label: "Direct API key · Anthropic",
    placeholder: "Paste your Direct API key",
    save: "Save",
  } satisfies PasteStrings as PasteStrings,
  "direct-anthropic-checking": { header: "Direct · Anthropic", title: "Checking the format" } satisfies StatusStrings as StatusStrings,
  "direct-anthropic-connected": {
    header: "Direct · Anthropic",
    title: "Connected to Anthropic",
    lines: connectedLines,
    done: "Done",
  } satisfies StatusStrings as StatusStrings,

  "direct-google-entry": {
    header: "Direct · Google",
    title: "Your Direct API key",
    get: "Get my Direct API key",
    have: "I have my Direct API key",
  } satisfies EntryStrings as EntryStrings,
  "direct-google-guide": {
    header: "Direct · Google",
    title: "Get your Direct API key",
    lines: ["Open Google AI Studio for your Direct API key.", "Return here when you have copied it."],
    link: "Open the Google website",
    linkUrl: "https://aistudio.google.com/api-keys",
    paste: "Paste my Direct API key",
    guide: "Full Direct guide",
    guideUrl: "https://ai.google.dev/gemini-api/docs/api-key",
  } satisfies GuideStrings as GuideStrings,
  "direct-google-paste": {
    header: "Direct · Google",
    title: "Paste your Direct API key",
    lines: pasteLines,
    label: "Direct API key · Google",
    placeholder: "Paste your Direct API key",
    save: "Save",
  } satisfies PasteStrings as PasteStrings,
  "direct-google-checking": { header: "Direct · Google", title: "Checking the format" } satisfies StatusStrings as StatusStrings,
  "direct-google-connected": {
    header: "Direct · Google",
    title: "Connected to Google",
    lines: connectedLines,
    done: "Done",
  } satisfies StatusStrings as StatusStrings,
};

/** The Direct error screens. The design shows them for OpenAI; the widget
 *  fills {provider} and {other} for whichever pair applies. */
export const directErrors = {
  "direct-error-empty": {
    header: "Direct · {provider}",
    title: "Paste your Direct API key",
    label: "Direct API key · {provider}",
    placeholder: "Paste your Direct API key",
    save: "Save",
  },
  "direct-error-format": {
    header: "Direct · {provider}",
    title: "Check your Direct API key",
    message: "Copy the whole {provider} Direct API key and try again.",
    label: "Direct API key · {provider}",
    placeholder: "Paste your Direct API key",
    save: "Save",
  },
  "direct-error-wrong-provider": {
    header: "Direct · {provider}",
    title: "This looks like {other}",
    message: "You chose {provider} for Direct.",
    use: "Use {other} in Direct",
    another: "Try another Direct API key",
  },
  "direct-error-admin-refused": {
    header: "Direct · {provider}",
    title: "Vault admin keys don’t work in Direct",
    message: "Use your own Direct API key here.",
    get: "Get my Direct API key",
    vault: "Choose Vault",
  },
  "direct-error-unsupported": {
    header: "Direct · {provider}",
    title: "This app does not offer {other} in Direct",
    message: "Choose a provider this app supports.",
    choose: "Choose provider",
  },
  "direct-error-handoff-error": {
    header: "Direct · {provider}",
    title: "Couldn’t finish Direct",
    message: "Paste your Direct API key again.",
    retry: "Try again",
  },
};

const vaultFine = "Vault caps use provider spend reports. Reporting delays can allow spending above the cap.";
const vaultOpenaiLines = [
  "Use your Vault admin key on useoutlet.dev.",
  "This app gets its own capped Vault App key in your account.",
  "Your Vault admin key is never given to apps.",
  "Revoke Vault access any time.",
];
const vaultAnthropicLines = [
  "Use your Vault admin key on useoutlet.dev.",
  "This app gets its own capped Vault App key in your account.",
  "Make the Anthropic Vault App key by hand.",
  "Your Vault admin key is never given to apps.",
  "Revoke Vault access any time.",
];
const leavingLines = ["Review Vault access on useoutlet.dev.", "You’ll return here after approval."];
const returnErrorLines = ["Approval did not finish.", "Return to Outlet to try again."];
const vaultConnectedLines = [
  "This app has its own capped Vault App key.",
  "Revoke Vault access any time on useoutlet.dev.",
];
const manageUrl = "https://useoutlet.dev/account/";


/** Single-mode variants keep the same words, so vault-only and
 *  vault-anthropic-only share the explain entries. Split them to differ. */
const explainOpenai: VaultExplainStrings = {
  header: "Vault · OpenAI",
  title: "Connect your account",
  lines: vaultOpenaiLines,
  fine: vaultFine,
  continue: "Continue to Outlet",
};
const explainAnthropic: VaultExplainStrings = {
  header: "Vault · Anthropic",
  title: "Connect your account",
  lines: vaultAnthropicLines,
  fine: vaultFine,
  continue: "Continue to Outlet",
};

export const vault = {
  "vault-explain": explainOpenai,
  "vault-only": explainOpenai,
  "vault-leaving": {
    header: "Vault · OpenAI",
    title: "Opening Outlet",
    lines: leavingLines,
    continue: "Continue to Outlet",
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-return-checking": {
    header: "Vault · OpenAI",
    title: "Checking your Vault connection",
    lines: ["Waiting for Outlet to confirm access."],
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-connected": {
    header: "Vault · OpenAI",
    title: "Connected to OpenAI",
    lines: vaultConnectedLines,
    manage: "Manage Vault access",
    manageUrl,
    done: "Done",
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-return-error": {
    header: "Vault · OpenAI",
    title: "Vault is not connected",
    lines: returnErrorLines,
    retry: "Return to Outlet",
  } satisfies VaultStatusStrings as VaultStatusStrings,

  "vault-anthropic-explain": explainAnthropic,
  "vault-anthropic-only": explainAnthropic,
  "vault-anthropic-leaving": {
    header: "Vault · Anthropic",
    title: "Opening Outlet",
    lines: leavingLines,
    continue: "Continue to Outlet",
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-anthropic-return-checking": {
    header: "Vault · Anthropic",
    title: "Checking your Vault connection",
    lines: ["Waiting for Outlet to confirm access."],
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-anthropic-connected": {
    header: "Vault · Anthropic",
    title: "Connected to Anthropic",
    lines: vaultConnectedLines,
    manage: "Manage Vault access",
    manageUrl,
    done: "Done",
  } satisfies VaultStatusStrings as VaultStatusStrings,
  "vault-anthropic-return-error": {
    header: "Vault · Anthropic",
    title: "Vault is not connected",
    lines: returnErrorLines,
    retry: "Return to Outlet",
  } satisfies VaultStatusStrings as VaultStatusStrings,
};
