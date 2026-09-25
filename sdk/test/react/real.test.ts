// @vitest-environment jsdom
/** The React hook and component around the real mountConnectButton. */
import { afterEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConnectButton, useConnectButton } from "../../src/react/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

const overlay = () => document.body.querySelector("[data-outlet-overlay]");

it("<ConnectButton> mounts the real button into the element; destroy() leaves it empty", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(ConnectButton, { mode: "direct", providers: ["openai"], onSession() {} })));
  const div = container.firstElementChild as HTMLElement;
  expect(div.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Connect your AI");
  await act(async () => root.unmount());
  expect(div.shadowRoot!.childNodes.length).toBe(0);
  expect(div.childNodes.length).toBe(0);
});

it("useConnectButton(): open() shows the real sheet, unmount takes it down", async () => {
  let api!: { open(): void; close(): void };
  function Host() {
    const { ref, open, close } = useConnectButton({ mode: "direct", providers: ["openai"], onSession() {} });
    api = { open, close };
    return createElement("div", { ref });
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Host)));
  const div = container.firstElementChild as HTMLElement;
  expect(overlay()).toBeNull();
  api.open();
  expect(overlay()).not.toBeNull();
  api.close();
  expect(overlay()).toBeNull();
  api.open();
  await act(async () => root.unmount());
  expect(overlay()).toBeNull();
  expect(div.shadowRoot!.childNodes.length).toBe(0);
});
