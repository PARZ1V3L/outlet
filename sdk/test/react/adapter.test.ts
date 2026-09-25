// @vitest-environment jsdom
/** The React hook and component around a mocked mountConnectButton. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, createElement } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { mountConnectButton } from "../../src/ui/index.js";
import { ConnectButton, useConnectButton } from "../../src/react/index.js";
import type { ConnectButtonOptions } from "../../src/react/index.js";

vi.mock("../../src/ui/index.js", () => ({ mountConnectButton: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Fake = { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
const mocked = vi.mocked(mountConnectButton);
const handles: Fake[] = [];
const live = () => handles.filter((h) => h.destroy.mock.calls.length === 0);

const base: ConnectButtonOptions = {
  mode: "both",
  providers: ["openai", "anthropic"],
  appId: "app_test",
  redirectUri: "https://app.example/outlet/return",
  onSession: () => {},
};

let container: HTMLDivElement;
let root: Root;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  handles.length = 0;
  mocked.mockReset().mockImplementation(() => {
    const h: Fake = { open: vi.fn(), close: vi.fn(), destroy: vi.fn() };
    handles.push(h);
    return h;
  });
  consoleError = vi.spyOn(console, "error");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

const render = (el: ReactNode) => act(async () => root.render(el));

describe("<ConnectButton>", () => {
  it("mounts once with the element and the options, and destroys on unmount", async () => {
    const onSession = vi.fn();
    await render(createElement(ConnectButton, { ...base, onSession, className: "connect" }));
    expect(mocked).toHaveBeenCalledTimes(1);
    const div = container.firstElementChild as HTMLElement;
    expect(div.tagName).toBe("DIV");
    expect(div.className).toBe("connect");
    const [el, opts] = mocked.mock.calls[0]!;
    expect(el).toBe(div);
    expect(opts).toEqual(expect.objectContaining({
      mode: "both", providers: ["openai", "anthropic"], appId: "app_test", redirectUri: "https://app.example/outlet/return",
    }));
    const session = { keys: { openai: "sk-proj-x" } };
    await opts.onSession(session as never);
    expect(onSession).toHaveBeenCalledWith(session);
    await act(async () => root.unmount());
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(container.childNodes.length).toBe(0);
  });

  it("under StrictMode: one live mount at the end, none after unmount", async () => {
    await render(createElement(StrictMode, null, createElement(ConnectButton, base)));
    expect(mocked.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of mocked.mock.calls) expect(call[0]).toBe(container.firstElementChild);
    expect(live()).toHaveLength(1);
    await act(async () => root.unmount());
    expect(live()).toHaveLength(0);
  });

  it("keeps the mount for an equal list or a new handler, mounts again when a field changes", async () => {
    await render(createElement(ConnectButton, { ...base, providers: ["openai", "anthropic"] }));
    expect(mocked).toHaveBeenCalledTimes(1);
    const second = vi.fn();
    await render(createElement(ConnectButton, { ...base, providers: ["openai", "anthropic"], onSession: second }));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(handles[0]!.destroy).not.toHaveBeenCalled();
    await mocked.mock.calls[0]![1].onSession({ keys: {} } as never);
    expect(second).toHaveBeenCalledTimes(1);
    await render(createElement(ConnectButton, { ...base, mode: "direct" }));
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked.mock.calls[1]![0]).toBe(container.firstElementChild);
    expect(mocked.mock.calls[1]![1].mode).toBe("direct");
    expect(live()).toHaveLength(1);
  });

  it("a new session object mounts again; the same one does not", async () => {
    const session = { grantId: "gr_1", keys: { openai: "sk-proj-x" } } as never;
    await render(createElement(ConnectButton, { ...base, session }));
    await render(createElement(ConnectButton, { ...base, session }));
    expect(mocked).toHaveBeenCalledTimes(1);
    await render(createElement(ConnectButton, { ...base, session: { ...(session as object) } as never }));
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(live()).toHaveLength(1);
  });
});

type Api = { open(): void; close(): void };
function Harness({ show, expose }: { show: boolean; expose: (api: Api) => void }) {
  const { ref, open, close } = useConnectButton(base);
  expose({ open, close });
  return show ? createElement("div", { ref, id: "target" }) : null;
}

describe("useConnectButton()", () => {
  it("open and close reach the handle; the element attaching mounts, detaching destroys", async () => {
    let api!: Api;
    const expose = (a: Api) => { api = a; };
    await render(createElement(Harness, { show: false, expose }));
    expect(mocked).not.toHaveBeenCalled();
    api.open();
    await render(createElement(Harness, { show: true, expose }));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0]![0]).toBe(container.querySelector("#target"));
    api.open();
    expect(handles[0]!.open).toHaveBeenCalledTimes(1);
    api.close();
    expect(handles[0]!.close).toHaveBeenCalledTimes(1);
    await render(createElement(Harness, { show: false, expose }));
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});
