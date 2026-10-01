/**
 * What a browser build gets for @useoutlet/sdk/plan (the package's "browser"
 * export condition): the same names, and one clear error. The real entry
 * listens on 127.0.0.1 and keeps a file, so it cannot run in a page.
 */
import { OutletError } from "../types.js";
import { NODE_ONLY } from "./words.js";

function refuse(): never {
  throw new OutletError(NODE_ONLY, "plan_node_only");
}

export const connectPlan = refuse;
export const restorePlan = refuse;
export const refreshPlan = refuse;
export const forgetPlan = refuse;
export const planModels = refuse;
export const planFileStore = refuse;
export const planStreamEnd = refuse;

refuse();
