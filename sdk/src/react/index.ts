/**
 * @useoutlet/sdk/react: the Connect your AI button as a React hook and a
 * React component. No JSX in this module, so no compiler setting is needed.
 *
 *   import { useConnectButton } from "@useoutlet/sdk/react";
 *
 *   function Connect() {
 *     const { ref } = useConnectButton({
 *       mode: "both",
 *       providers: ["openai", "anthropic"],
 *       appId: "app_yourapp",
 *       redirectUri: "https://yourapp.com/outlet/return",
 *       onSession: (session) => { ai = new OpenAI({ apiKey: session.keys.openai }); },
 *     });
 *     return <div ref={ref} />;
 *   }
 *
 * Or the component: <ConnectButton mode="both" providers={[...]} onSession={...} />.
 * In Next.js, mount the button in a client component.
 *
 * The hook mounts with mountConnectButton() when the element attaches and
 * destroys the button when it detaches or the component unmounts. React
 * StrictMode's double mount leaves one live button. When mode, providers,
 * appId, redirectUri, requestedCapUsd, baseUrl, theme or session change,
 * the button is destroyed and mounted again; a new onSession or onError
 * reaches the button without one.
 */
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { currentOptions, mountKey } from "../adapters/options.js";
import { mountConnectButton } from "../ui/index.js";
import type { ConnectButtonHandle, ConnectButtonOptions } from "../ui/types.js";

export type {
  ConnectButtonHandle, ConnectButtonOptions, ConnectMode, CustomProvider, UiProvider,
} from "../ui/types.js";

export interface UseConnectButton {
  /** Put it on the element the button mounts in, an empty div. */
  ref: (el: HTMLElement | null) => void;
  /** Open the sheet. Nothing happens before the element attaches. */
  open(): void;
  /** Close the sheet. */
  close(): void;
}

export function useConnectButton(options: ConnectButtonOptions): UseConnectButton {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const handle = useRef<ConnectButtonHandle | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const key = mountKey(options);
  const session = options.session;
  useEffect(() => {
    if (!target) return;
    const mounted = mountConnectButton(target, currentOptions(() => latest.current));
    handle.current = mounted;
    return () => {
      if (handle.current === mounted) handle.current = null;
      mounted.destroy();
    };
  }, [target, key, session]);

  const ref = useCallback((el: HTMLElement | null) => setTarget(el), []);
  const open = useCallback(() => handle.current?.open(), []);
  const close = useCallback(() => handle.current?.close(), []);
  return { ref, open, close };
}

export type ConnectButtonProps = ConnectButtonOptions & { className?: string };

/** One div with the button in it. The props are the options. */
export function ConnectButton(props: ConnectButtonProps): ReactElement {
  const { className, ...options } = props;
  const { ref } = useConnectButton(options);
  return createElement("div", { ref, className });
}
