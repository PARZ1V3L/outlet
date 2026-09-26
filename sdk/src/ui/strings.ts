/**
 * Every visible word in the Connect your AI widget that is not a provider's
 * own value. `{provider}` is the provider the person chose, `{other}` the
 * one a pasted key looks like, both filled with display names. A registry
 * provider's creation step and format hint live in its registry entry
 * (../providers.ts). direct-words.ts puts a provider's screens together.
 */
import type { VaultExplainStrings } from "./strings-shape.js";

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
  direct: { name: "Direct", description: "Use your Direct API key to connect." },
  vault: {
    name: "Vault",
    description:
      "Connect your account with a Vault admin key. Track spending and revoke this app’s access any time.",
  },
};

export const providerList = {
  header: "Direct",
  title: "Choose your provider",
  lead: "Use your own Direct API key.",
};

/** The named Direct screen: one template for every registry provider. */
export const directTemplate = {
  header: "Direct · {provider}",
  entry: {
    title: "Your Direct API key",
    note: "Use your {provider} Direct API key in this app.",
    get: "Get my Direct API key",
    have: "I have my Direct API key",
  },
  guide: {
    title: "Get your Direct API key",
    open: "Open the {provider} website",
    copy: "Copy it and return here.",
    paste: "Paste my Direct API key",
    guide: "Full Direct guide",
  },
  paste: {
    title: "Paste your Direct API key",
    lines: ["Checked on this device.", "Passed to this app.", "Never sent to Outlet."],
    label: "Direct API key · {provider}",
    placeholder: "Paste your Direct API key",
    save: "Save",
  },
  checking: { title: "Checking the format" },
  connected: {
    title: "Connected to {provider}",
    lines: ["Your Direct API key is ready for this app."],
    done: "Done",
  },
};

/** What one provider's named screen says in place of the template's line. */
export interface ProviderWords {
  /** The entry note. */
  note?: string;
  /** The label of the guide's linked first step. */
  open?: string;
  /** A line under the guide's steps. */
  scope?: string;
  /** The full guide, only where the page exists. */
  guideUrl?: string;
}

export const providerWords: Record<string, ProviderWords> = {
  openai: {
    note: "OpenAI API credits are billed separately from ChatGPT.",
    guideUrl: "https://useoutlet.dev/docs/users/openai-api-key.html",
  },
  anthropic: {
    note: "Anthropic API credits are billed separately from Claude subscriptions.",
    guideUrl: "https://useoutlet.dev/docs/users/anthropic-api-key.html",
  },
  google: {
    open: "Open Google AI Studio",
    guideUrl: "https://ai.google.dev/gemini-api/docs/api-key",
  },
  higgsfield: { note: "Use your Higgsfield key ID and secret together as your Direct API key." },
  huggingface: { note: "Hugging Face calls your Direct API key an access token." },
  fal: {
    note: "Use an API-scope fal key as your Direct API key.",
    open: "Open fal’s keys page",
    scope: "ADMIN scope is for your Vault admin key.",
  },
  replicate: {
    note: "Replicate calls your Direct API key an API token.",
    open: "Open Replicate’s API tokens page",
  },
};

/** Where the app keeps the person's Direct API key: one line on the Direct
 *  paste screen when the app sets directKeyStorage, by its value. Wording:
 *  Parz's pass, 2026-09-22. */
export const directKeyStorage = {
  browser: "This app keeps your Direct API key in your browser.",
  server: "This app keeps your Direct API key on its server.",
};

/** The generic Direct screen, for a provider the app describes. The app
 *  supplies the name and the keys page. No format check of that provider's
 *  own runs, so the screen claims none. */
export const directGeneric = {
  note: "Use your {provider} Direct API key in this app.",
  open: "Open {provider} to get your Direct API key",
  create: "Follow {provider}’s steps to create your Direct API key.",
  copy: "Copy your Direct API key and return here.",
  reassurance: "Your Direct API key is passed to this app. It is never sent to Outlet.",
  noKeysPage: "This app has not provided a page for getting your {provider} Direct API key.",
};

/** The Direct message state after the provider refused the pasted key: the
 *  line, and one action back to the paste screen. Wording: Parz's pass
 *  (NEVER-DEAD-END-2026-09-26). */
export const directRefused = {
  title: "{provider} refused your Direct API key",
  paste: "Paste a new Direct API key",
};

/** The Direct error screens, for whichever pair of providers applies. */
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
const vaultIntro = ["Add your Vault admin key on useoutlet.dev.", "Outlet uses it to manage app access in your account.", "Your Vault admin key is never given to apps."];
const vaultAccess = [
  "This app gets its own capped Vault App key in your account.",
  "Revoke Vault access any time.",
];

/** The Vault explanation, one per provider the registry marks modes.vault.
 *  Both-mode and Vault-only mounts share a provider's words. */
export const vaultExplain: Record<string, VaultExplainStrings> = {
  openai: {
    title: "Connect your account",
    intro: vaultIntro,
    details: "Vault access and caps",
    lines: vaultAccess,
    fine: vaultFine,
    continue: "Continue to Outlet",
  },
  anthropic: {
    title: "Connect Anthropic",
    intro: [],
    steps: [
      { title: "Connect your account", body: "Add your Vault admin key on useoutlet.dev.", note: "Never given to apps." },
      { title: "Approve this app", body: "Review its Vault access and cap." },
      { title: "Create its Vault App key", body: "Create an API key in the workspace named on Outlet. Paste it into Outlet." },
    ],
    details: "Vault access and caps",
    lines: vaultAccess,
    fine: vaultFine,
    continue: "Continue to Outlet",
  },
  // fal enforces no limit of its own on a key, so its cap line stays in
  // view: the person reads it before approving, without opening the detail.
  fal: {
    title: "Connect your account",
    intro: [
      "Add your fal Vault admin key on useoutlet.dev.",
      "On fal, create your Vault admin key with ADMIN scope and name it Outlet.",
      "Outlet uses your Vault admin key to create and delete this app’s Vault App key.",
      "Your Vault admin key is never given to apps.",
    ],
    details: "Vault access and caps",
    lines: [
      "This app gets its own Vault App key in your fal account.",
      "Outlet tracks spending for this Vault App key from fal’s usage reports.",
      "Revoke Vault access any time.",
    ],
    fine: "fal does not enforce a spending limit on each Vault App key. Outlet uses delayed fal spending reports to enforce your Vault cap. Spending can exceed the Vault cap.",
    fineInView: true,
    continue: "Continue to Outlet",
  },
  // OpenRouter holds the monthly cap on the key itself, and at the cap the
  // key is paused and kept, so its cap line stays in view too: the person
  // reads how to continue before approving. Wording: Parz's word pass,
  // 2026-09-22. The header is the shared "Vault · {provider}".
  openrouter: {
    title: "Connect your account",
    intro: [
      "Add your OpenRouter Vault management key on useoutlet.dev.",
      "On OpenRouter, create a management key named Outlet for Vault.",
      "Outlet uses your Vault management key to create and manage this app’s Vault App key.",
      "Your Vault management key is never given to apps.",
    ],
    details: "Vault access and caps",
    lines: [
      "This app gets its own Vault App key in your OpenRouter account.",
      "Outlet reads this Vault App key’s monthly spending from OpenRouter.",
      "Revoking Vault access disables this app’s Vault App key, then deletes it.",
    ],
    fine: "OpenRouter holds your monthly Vault cap on this app’s Vault App key. At the Vault cap, the Vault App key is paused and kept. Raise the Vault cap to continue.",
    fineInView: true,
    continue: "Continue to Outlet",
  },
};

/** The Vault screens after the explanation, the same for every provider. */
export const vaultStatus = {
  header: "Vault · {provider}",
  leaving: {
    title: "Opening Outlet",
    lines: ["Review Vault access on useoutlet.dev.", "You’ll return here after approval."],
    continue: "Continue to Outlet",
  },
  "return-checking": {
    title: "Checking your Vault connection",
    lines: ["Waiting for Outlet to confirm access."],
  },
  connected: {
    title: "Connected to {provider}",
    lines: ["This app has its own capped Vault App key.", "Revoke Vault access any time on useoutlet.dev."],
    manage: "Manage Vault access",
    manageUrl: "https://useoutlet.dev/account/",
    done: "Done",
  },
  "start-error": {
    title: "Couldn’t open Outlet",
    lines: ["Your Vault connection hasn’t started."],
    retry: "Try again",
  },
  "return-error": {
    title: "Vault is not connected",
    lines: ["Approval did not finish.", "Return to Outlet to try again."],
    retry: "Return to Outlet",
  },
  // The connection-end screens: the line and one action each. Wording:
  // Parz's pass (NEVER-DEAD-END-2026-09-26). The capped action opens the
  // account page in a new tab; the button refreshes when the person is back.
  capped: {
    title: "This Vault connection is paused at its cap",
    raise: "Raise the Vault cap",
    raiseUrl: "https://useoutlet.dev/account/",
  },
  ended: {
    title: "This Vault connection has ended",
    again: "Connect again",
  },
};
