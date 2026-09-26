// @vitest-environment jsdom
/** The Direct paste screen's line on where the app keeps the Direct API
 *  key: one line for each value of directKeyStorage, none when unset. */
import { afterEach, describe, expect, it } from "vitest";
import { OutletError } from "../../src/index.js";
import { type ConnectButtonOptions, mountConnectButton } from "../../src/ui/index.js";
import { cleanup, click, mount, sheet, state } from "./helpers.js";

afterEach(cleanup);

const line = () => sheet().querySelector("p.key-storage")?.textContent ?? null;
const reassurance = () => Array.from(sheet().querySelectorAll(".key-reassurance li"), (li) => li.textContent);

/** The paste screen of one Direct provider, reached from its entry screen. */
function openPaste(opts: Partial<ConnectButtonOptions> = {}, provider = "openai") {
  const m = mount({ mode: "direct", providers: ["openai"], ...opts });
  m.handle.open();
  click("I have my Direct API key");
  expect(state()).toBe(`direct-${provider}-paste`);
  return m;
}

describe("directKeyStorage on the Direct paste screen", () => {
  it('"browser": the screen says the app keeps the Direct API key in the browser', () => {
    openPaste({ directKeyStorage: "browser" });
    expect(line()).toBe("This app keeps your Direct API key in your browser.");
    expect(reassurance()).toEqual(["Checked on this device.", "Passed to this app.", "Never sent to Outlet."]);
  });

  it('"server": the screen says the app keeps the Direct API key on its server', () => {
    openPaste({ directKeyStorage: "server" });
    expect(line()).toBe("This app keeps your Direct API key on its server.");
  });

  it("unset: no line, and the three reassurance lines stand alone", () => {
    openPaste();
    expect(line()).toBeNull();
    expect(reassurance()).toHaveLength(3);
    expect(sheet().textContent).not.toContain("keeps your Direct API key");
  });

  it("the generic Direct screen, for a provider the app describes, says the same line", () => {
    openPaste({ providers: [{ id: "runway", name: "Runway", keysUrl: "https://dev.runwayml.com/" }], directKeyStorage: "server" }, "runway");
    expect(line()).toBe("This app keeps your Direct API key on its server.");
  });

  it("any other value fails at mount", () => {
    let thrown: unknown;
    try {
      mountConnectButton(document.createElement("div"), { mode: "direct", providers: ["openai"], onSession() {}, directKeyStorage: "cloud" as never });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OutletError);
    expect((thrown as OutletError).code).toBe("ui_direct_key_storage");
  });
});
