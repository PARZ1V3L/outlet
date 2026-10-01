/**
 * Every word a developer or a user reads from @useoutlet/sdk/plan, in one
 * place so a word pass reads one file. The four ConnectionEndedError lines
 * live with the fetch wrapper's half, in ../plan-ends.ts. No line here ever
 * carries a token: the only values put into one are a port, an HTTP status,
 * a short error code and the name of a check.
 */
import { OutletError } from "../types.js";

export const NODE_ONLY =
  "@useoutlet/sdk/plan runs on the user's own machine, in Node. It cannot run in a browser page.";

/** The page the browser lands on after the user approves at OpenAI. */
export const PAGE_SIGNED_IN = "You're signed in. You can close this tab.";
/** The page the browser lands on when the sign-in did not finish. */
export const PAGE_NOT_FINISHED = "Sign-in did not finish. Go back to the app and try again.";

export const WORDS = {
  provider: 'ChatGPT plan sign-in works with OpenAI only. Pass provider: "openai".',
  appName: "A ChatGPT plan call needs appName, the name the user sees at OpenAI.",
  session: "This call needs a ChatGPT plan session from connectPlan() or restorePlan().",
  portBusy: (port: number) => `Port ${port} on 127.0.0.1 is in use. Pass another port, or leave port out.`,
  open: "Could not open the browser. Pass open: (url) => { ... } to show the sign-in address yourself.",
  timeout: "The ChatGPT sign-in did not finish in time. Call connectPlan() again.",
  aborted: "The ChatGPT sign-in was cancelled.",
  stateMismatch: "State mismatch. Possible CSRF; aborting.",
  declined: "The user did not approve the sign-in at OpenAI.",
  notFinished: (code: string) => `OpenAI did not finish the sign-in (${code}). Call connectPlan() again.`,
  idToken: (check: string) => `OpenAI's ID token did not pass its ${check} check. The sign-in was not saved.`,
  notGranted: "The user signed in but did not allow ChatGPT plan use. Offer a Direct API key or Vault.",
  otherAccount: "This sign-in is a different ChatGPT account than the saved one. Call forgetPlan() first.",
  store: (code: string) => `The ChatGPT plan sign-in could not be saved or read (${code}).`,
  unreachable: "Couldn't reach OpenAI. Try again in a moment.",
  refreshFailed: (status: number) =>
    `OpenAI could not refresh this ChatGPT plan connection right now (${status}). Try again in a moment.`,
  models: (status: number) => `OpenAI did not return the model list (${status}).`,
};

export function fail(message: string, code: string, status?: number): never {
  throw new OutletError(message, code, status);
}

/** An error code safe to print: OpenAI's short code, or "unknown". Whatever
 *  else the answer held stays out of the message. */
export function shortCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : "unknown";
}
