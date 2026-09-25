// @vitest-environment jsdom
/** The Vue composable and component around a mocked mountConnectButton. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { App, Component } from "vue";
import { mountConnectButton } from "../../src/ui/index.js";
import { ConnectButton, useConnectButton } from "../../src/vue/index.js";
import type { ConnectButtonOptions } from "../../src/vue/index.js";

vi.mock("../../src/ui/index.js", () => ({ mountConnectButton: vi.fn() }));

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
let app: App | null = null;
const warnings: string[] = [];

beforeEach(() => {
  handles.length = 0;
  warnings.length = 0;
  mocked.mockReset().mockImplementation(() => {
    const h: Fake = { open: vi.fn(), close: vi.fn(), destroy: vi.fn() };
    handles.push(h);
    return h;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  app?.unmount();
  app = null;
  container.remove();
  expect(warnings).toEqual([]);
});

function mount(component: Component, props?: Record<string, unknown>): App {
  app = createApp(component, props);
  app.config.warnHandler = (msg) => { warnings.push(msg); };
  app.mount(container);
  return app;
}

describe("<ConnectButton>", () => {
  it("mounts once with the element and the options, and destroys on unmount", () => {
    const onSession = vi.fn();
    mount(ConnectButton, { ...base, onSession });
    expect(mocked).toHaveBeenCalledTimes(1);
    const div = container.firstElementChild as HTMLElement;
    expect(div.tagName).toBe("DIV");
    const [el, opts] = mocked.mock.calls[0]!;
    expect(el).toBe(div);
    expect(opts).toEqual(expect.objectContaining({
      mode: "both", providers: ["openai", "anthropic"], appId: "app_test", redirectUri: "https://app.example/outlet/return",
    }));
    const session = { keys: { openai: "sk-proj-x" } };
    opts.onSession(session as never);
    expect(onSession).toHaveBeenCalledWith(session);
    app!.unmount();
    app = null;
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(container.childNodes.length).toBe(0);
  });

  it("keeps the mount for an equal list or a new handler, mounts again when a field changes", async () => {
    const mode = ref<"both" | "direct">("both");
    const handler = ref(vi.fn());
    const Parent = defineComponent({
      setup: () => () => h(ConnectButton, { ...base, mode: mode.value, providers: ["openai", "anthropic"], onSession: handler.value }),
    });
    mount(Parent);
    expect(mocked).toHaveBeenCalledTimes(1);
    handler.value = vi.fn();
    await nextTick();
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(handles[0]!.destroy).not.toHaveBeenCalled();
    mocked.mock.calls[0]![1].onSession({ keys: {} } as never);
    expect(handler.value).toHaveBeenCalledTimes(1);
    mode.value = "direct";
    await nextTick();
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked.mock.calls[1]![0]).toBe(container.firstElementChild);
    expect(mocked.mock.calls[1]![1].mode).toBe("direct");
    expect(live()).toHaveLength(1);
  });
});

describe("useConnectButton()", () => {
  it("a Ref of options: open and close reach the handle, the target coming and going mounts and destroys", async () => {
    const options = ref<ConnectButtonOptions>({ ...base });
    const show = ref(false);
    let api!: { open(): void; close(): void };
    const Host = defineComponent({
      setup() {
        const { target, open, close } = useConnectButton(options);
        api = { open, close };
        return () => (show.value ? h("div", { ref: target, id: "target" }) : null);
      },
    });
    mount(Host);
    expect(mocked).not.toHaveBeenCalled();
    api.open();
    show.value = true;
    await nextTick();
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0]![0]).toBe(container.querySelector("#target"));
    api.open();
    expect(handles[0]!.open).toHaveBeenCalledTimes(1);
    api.close();
    expect(handles[0]!.close).toHaveBeenCalledTimes(1);
    options.value = { ...base, theme: "dark" };
    await nextTick();
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked.mock.calls[1]![1].theme).toBe("dark");
    show.value = false;
    await nextTick();
    expect(handles[1]!.destroy).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(0);
  });

  it("a new session object mounts again; the same one does not", async () => {
    const session = { grantId: "gr_1", keys: { openai: "sk-proj-x" } };
    const options = ref<ConnectButtonOptions>({ ...base, session: session as never });
    const Host = defineComponent({
      setup() {
        const { target } = useConnectButton(options);
        return () => h("div", { ref: target });
      },
    });
    mount(Host);
    expect(mocked).toHaveBeenCalledTimes(1);
    options.value = { ...base, session: session as never };
    await nextTick();
    expect(mocked).toHaveBeenCalledTimes(1);
    options.value = { ...base, session: { ...session } as never };
    await nextTick();
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(live()).toHaveLength(1);
  });
});
