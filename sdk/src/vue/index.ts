/**
 * @useoutlet/sdk/vue: the Connect your AI button as a Vue composable and a
 * Vue component. Render functions only: no single-file component, no
 * template compiler.
 *
 *   <script setup lang="ts">
 *   import { useConnectButton } from "@useoutlet/sdk/vue";
 *
 *   const { target } = useConnectButton({
 *     mode: "both",
 *     providers: ["openai", "anthropic"],
 *     appId: "app_yourapp",
 *     redirectUri: "https://yourapp.com/outlet/return",
 *     onSession: (session) => { ai = new OpenAI({ apiKey: session.keys.openai }); },
 *   });
 *   </script>
 *
 *   <template><div ref="target"></div></template>
 *
 * Or the component: <ConnectButton mode="both" :providers="[...]" :on-session="..." />.
 *
 * The composable mounts with mountConnectButton() in onMounted and destroys
 * the button in onBeforeUnmount. Pass a Ref (or a computed) to change the
 * options later: when mode, providers, appId, redirectUri, requestedCapUsd,
 * baseUrl, theme or session change, the button is destroyed and mounted
 * again; a new onSession or onError reaches the button without one.
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, unref, watch } from "vue";
import type { PropType, Ref } from "vue";
import { currentOptions, mountKey } from "../adapters/options.js";
import type { OutletSession, Provider } from "../types.js";
import { mountConnectButton } from "../ui/index.js";
import type { ConnectButtonHandle, ConnectButtonOptions, ConnectMode, CustomProvider } from "../ui/types.js";

export type {
  ConnectButtonHandle, ConnectButtonOptions, ConnectMode, CustomProvider, UiProvider,
} from "../ui/types.js";

export interface UseConnectButton {
  /** Bind it to the element the button mounts in, an empty div: ref="target". */
  target: Ref<HTMLElement | null>;
  /** Open the sheet. Nothing happens before the component mounts. */
  open(): void;
  /** Close the sheet. */
  close(): void;
}

export function useConnectButton(
  options: ConnectButtonOptions | Ref<ConnectButtonOptions>,
): UseConnectButton {
  const target = ref<HTMLElement | null>(null);
  let handle: ConnectButtonHandle | null = null;
  let mountedOn: HTMLElement | null = null;
  const current = (): ConnectButtonOptions => unref(options);

  function unmount(): void {
    handle?.destroy();
    handle = null;
    mountedOn = null;
  }
  function mount(): void {
    unmount();
    const el = target.value;
    if (!el) return;
    handle = mountConnectButton(el, currentOptions(current));
    mountedOn = el;
  }

  onMounted(mount);
  onBeforeUnmount(unmount);
  // The element arrived or left after mount (v-if): mount there, or clear.
  watch(target, (el) => { if (el !== mountedOn) mount(); }, { flush: "post" });
  // The options changed in a way the button reads once: mount again.
  watch([() => mountKey(current()), () => current().session], mount, { flush: "post" });

  return {
    target,
    open: () => handle?.open(),
    close: () => handle?.close(),
  };
}

/** One div with the button in it. The props are the options. */
export const ConnectButton = defineComponent({
  name: "ConnectButton",
  props: {
    mode: { type: String as PropType<ConnectMode>, required: true },
    providers: { type: Array as PropType<Array<Provider | CustomProvider>>, required: true },
    appId: String,
    redirectUri: String,
    requestedCapUsd: Number,
    baseUrl: String,
    onSession: { type: Function as PropType<ConnectButtonOptions["onSession"]>, required: true },
    onError: Function as PropType<(error: unknown) => void>,
    theme: String as PropType<"auto" | "light" | "dark">,
    session: [Object, Promise] as PropType<OutletSession | Promise<OutletSession>>,
  },
  setup(props) {
    const { target } = useConnectButton(props as ConnectButtonOptions);
    return () => h("div", { ref: target });
  },
});
