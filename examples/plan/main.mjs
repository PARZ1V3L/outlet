/**
 * Connect your AI with a ChatGPT plan, from a command-line app. It restores
 * the saved sign-in or opens the browser for a new one, lists the models on
 * the plan and streams one answer. When the plan ends (its limit, a
 * disconnect, a sign-in that can no longer be refreshed), it asks for a
 * Direct API key and carries on with Outlet.direct(). That fallback is the
 * point: OpenAI never moves the user to other billing by itself.
 *
 * OpenAI allows ChatGPT plan use in open-source apps and in personal projects
 * that run on the user's own machine. A paid or hosted app needs OpenAI's
 * approval first.
 *
 *   npm install @useoutlet/sdk openai
 *   node main.mjs "Say hello in five words."
 *   node main.mjs --refresh     also refreshes the plan token once
 *   node main.mjs --forget      ends the sign-in and deletes the local record
 *
 * OUTLET_EXAMPLE_MODEL names the model. The default is the first on the plan.
 *
 * The sign-in is kept in ~/.config/outlet-plan-example/outlet-plan.json, a
 * file only you can read. Nothing here prints a token: what is shown is cut
 * to its last four characters.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import OpenAI from "openai";
import Outlet, { ConnectionEndedError } from "@useoutlet/sdk";
import { connectPlan, forgetPlan, planModels, planStreamEnd, refreshPlan, restorePlan } from "@useoutlet/sdk/plan";

const APP = { provider: "openai", appName: "Outlet plan example" };
const MANAGE_USAGE = "https://chatgpt.com/settings/usage";
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const prompt = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ") || "Say hello in five words.";

const lastFour = (token) => `…${token.slice(-4)}`;
/** The typed end, as thrown or as OpenAI's SDK reports it: an error from its
 *  fetch comes back as a connection error with the end on `cause`. */
const endOf = (e) => (e instanceof ConnectionEndedError ? e : e?.cause instanceof ConnectionEndedError ? e.cause : null);
const until = (session) => new Date(session.expiresAt).toLocaleTimeString();

/** The saved sign-in, or a new one in the browser. */
async function signIn() {
  try {
    const saved = await restorePlan(APP);
    if (saved) return saved;
  } catch (e) {
    if (!(e instanceof ConnectionEndedError)) throw e;
    console.log(e.message);
  }
  console.log("Continue with ChatGPT: your browser opens for one sign-in at OpenAI.");
  return connectPlan(APP);
}

/** One streamed answer. Works the same on a plan session and a Direct one. */
async function answer(session, model) {
  const ai = new OpenAI({
    apiKey: session.keys.openai,
    // The wrapped fetch turns OpenAI's limit into ConnectionEndedError.
    fetch: Outlet.wrapFetch({ session: () => session }),
    // No retries: an end is not a failure to try again.
    maxRetries: 0,
  });
  const stream = await ai.responses.create({
    model,
    input: [{ role: "user", content: prompt }],
    store: false,
    stream: true,
  });
  let completed = false;
  for await (const event of stream) {
    // A limit can arrive after the stream opens. The wrapper never reads a stream.
    const end = planStreamEnd(event, session);
    if (end) throw end;
    if (event.type === "response.output_text.delta") process.stdout.write(event.delta);
    if (event.type === "response.completed") completed = true;
  }
  process.stdout.write("\n");
  if (!completed) throw new Error("The answer stopped before it was complete.");
}

/** A line typed without showing on the screen. */
async function askHidden(question) {
  process.stdout.write(question);
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
  try {
    return (await rl.question("")).trim();
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}

/** The plan ended: carry on with the user's own API key. Same session shape. */
async function directInstead(ended) {
  console.log(ended.message);
  if (ended.reason === "capped") console.log(`Manage usage: ${MANAGE_USAGE}`);
  const key = process.env.OPENAI_API_KEY || (await askHidden("Paste a Direct API key from platform.openai.com to carry on: "));
  const session = await Outlet.direct({ keys: { openai: key } });
  console.log(`Using a Direct API key (${lastFour(session.keys.openai)}). Your OpenAI API account pays for this request.`);
  return session;
}

if (flags.includes("--forget")) {
  const { revoked } = await forgetPlan(APP);
  console.log(revoked ? "Signed out. The local record is deleted." : "The local record is deleted. OpenAI did not confirm the sign-out.");
  console.log(`To disconnect the app at OpenAI too, open ${MANAGE_USAGE}`);
  process.exit(0);
}

let session = await signIn();
console.log(`Signed in with ChatGPT. Token ${lastFour(session.keys.openai)}, good until ${until(session)}.`);

const models = await planModels(session);
const model = process.env.OUTLET_EXAMPLE_MODEL || models[0]?.slug;
console.log(`Models on this plan: ${models.map((m) => m.slug).join(", ")}. Using ${model}.`);
console.log(`Using ChatGPT plan. Manage usage: ${MANAGE_USAGE}`);

try {
  try {
    await answer(session, model);
  } catch (e) {
    // A 401 on a plan token is settled by one refresh: a new token, or the typed end.
    if (!(e instanceof OpenAI.APIError) || e.status !== 401) throw e;
    session = await refreshPlan(session);
    await answer(session, model);
  }
  if (flags.includes("--refresh")) {
    session = await refreshPlan(session);
    console.log(`The plan token was refreshed. Token ${lastFour(session.keys.openai)}, good until ${until(session)}.`);
  }
} catch (e) {
  const ended = endOf(e);
  if (!ended) throw e;
  session = await directInstead(ended);
  await answer(session, model);
}
