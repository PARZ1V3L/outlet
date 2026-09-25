// @vitest-environment jsdom
/** The Vue composable and component around the real mountConnectButton. */
import { afterEach, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { ConnectButton, useConnectButton } from "../../src/vue/index.js";

afterEach(() => document.body.replaceChildren());

const overlay = () => document.body.querySelector("[data-outlet-overlay]");

it("<ConnectButton> mounts the real button into the element; destroy() leaves it empty", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(ConnectButton, { mode: "direct", providers: ["openai"], onSession() {} });
  app.mount(container);
  const div = container.firstElementChild as HTMLElement;
  expect(div.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Connect your AI");
  app.unmount();
  expect(div.shadowRoot!.childNodes.length).toBe(0);
  expect(div.childNodes.length).toBe(0);
});

it("useConnectButton(): open() shows the real sheet, unmount takes it down", () => {
  let api!: { open(): void; close(): void };
  const Host = defineComponent({
    setup() {
      const { target, open, close } = useConnectButton({ mode: "direct", providers: ["openai"], onSession() {} });
      api = { open, close };
      return () => h("div", { ref: target });
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(Host);
  app.mount(container);
  const div = container.firstElementChild as HTMLElement;
  expect(overlay()).toBeNull();
  api.open();
  expect(overlay()).not.toBeNull();
  api.close();
  expect(overlay()).toBeNull();
  api.open();
  app.unmount();
  expect(overlay()).toBeNull();
  expect(div.shadowRoot!.childNodes.length).toBe(0);
});
