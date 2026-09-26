// @vitest-environment jsdom
/** The React hook and component around the real mountConnectButton. */
import { afterEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConnectButton, useConnectButton } from "../../src/react/index.js";
import { click, sheet, state } from "../ui/helpers.js";

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

it("<ConnectButton> passes directKeyStorage through: the paste screen says where the app keeps the key", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(ConnectButton, { mode: "direct", providers: ["openai"], directKeyStorage: "server", onSession() {} })));
  const div = container.firstElementChild as HTMLElement;
  div.shadowRoot!.querySelector("button")!.click();
  click("I have my Direct API key");
  expect(state()).toBe("direct-openai-paste");
  expect(sheet().querySelector("p.key-storage")?.textContent).toBe("This app keeps your Direct API key on its server.");
  await act(async () => root.unmount());
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
