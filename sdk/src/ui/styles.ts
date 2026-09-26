/**
 * The widget's stylesheet, adopted into each shadow root through a
 * constructable CSSStyleSheet (works under a strict Content-Security-Policy,
 * no inline styles) with a <style> element as the fallback where the
 * constructor is missing (Safari before 16.4, Firefox before 101).
 *
 * Measurements and colors come from the design set: 460px sheet, 20px
 * corners, a bottom sheet with a 12px inset on phones; paper #FAF8F3 /
 * ink #18181A / muted #62625C and dark #232326 / #FAF8F3 / #B8B8B2;
 * the primary action #D6F436 on graphite. Host Manrope with a system fallback.
 */

const THEME_LIGHT =
  "--bg:#faf8f3;--ink:#18181a;--muted:#62625c;--line:#d1cfc5;--field:#fff;--accent:#d6f436;" +
  "--error:#9c3045;--focus:#789200;--veil:#22222213;--sig:#18181a;--eye:#84a800";
const THEME_DARK =
  "--bg:#232326;--ink:#faf8f3;--muted:#b8b8b2;--line:#434347;--field:#18181a;--accent:#d6f436;" +
  "--error:#f2a6b6;--focus:#d6f436;--veil:#00000055;--sig:#faf8f3;--eye:#d6f436";

export const CSS = `
.root{all:initial;display:block;box-sizing:border-box;${THEME_LIGHT};
font-family:Manrope,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;color:var(--ink);
-webkit-text-size-adjust:100%;text-size-adjust:100%}
.root.t-dark{${THEME_DARK}}
@media(prefers-color-scheme:dark){.root.t-auto{${THEME_DARK}}}
:where(.root) *,:where(.root) *::before,:where(.root) *::after{box-sizing:border-box}
:where(.root) button,:where(.root) a,:where(.root) input{font:inherit;color:inherit}
:where(.root) button{cursor:pointer;touch-action:manipulation;background:none;border:0;padding:0;margin:0;text-align:inherit}
:where(.root) a{text-decoration:underline;text-underline-offset:4px;overflow-wrap:anywhere;touch-action:manipulation}
:where(.root) a:hover{text-decoration-thickness:2px}
:where(.root) svg{display:block;flex:none}
:where(.root) :focus-visible{outline:3px solid var(--focus);outline-offset:4px}
:where(.root) h1:focus,:where(.root) h1:focus-visible{outline:none}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* the trigger */
.trigger{display:inline-block}
.fixed-button{display:block;width:264px;height:61px;border-radius:11px;padding:0}
.fixed-button>svg{width:264px;height:61px;display:block}
.fixed-button:hover{box-shadow:0 0 0 1px #a1af65,0 0 16px #d6f4360d}
.connected-button{min-height:61px;width:264px;display:flex;align-items:center;justify-content:center;gap:12px;
border-radius:11px;border:1px solid #525255;background:#18181a;color:#faf8f3;font-size:15px;font-weight:750}
.connected-button svg{width:29px;height:29px}
.connected-button:hover{box-shadow:0 0 0 1px #a1af65,0 0 16px #d6f4360d}

/* The overlay follows the visual viewport above a phone keyboard. */
.overlay{position:fixed;left:0;right:0;top:var(--vv-top,0px);height:var(--vv-height,100dvh);
display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147483000}
.veil{position:absolute;inset:0;background:var(--veil);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
dialog.overlay::backdrop{background:transparent}
.sheet{position:relative;display:flex;flex-direction:column;width:460px;max-width:100%;max-height:calc(100% - 16px);min-height:0;color:var(--ink)}
.sheet-card{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;background:var(--bg);border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 80px #0003;overflow:hidden}
.sheet-body{min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;scroll-padding:18px;padding:25px 28px 24px}

/* The same header, content, action area and footer in both modes. */
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:24px 24px 0;flex:none}
.brand{display:flex;gap:11px;align-items:center;font-size:13px;font-weight:700;min-width:0}
.tile{display:grid;place-items:center;background:#18181a;border-radius:11px;width:40px;height:40px;flex:none}
.tile svg{width:25px;height:25px}
.tile.mode{color:#d6f436}
.chrome{display:flex;flex:none}
.icon-button{width:40px;height:40px;display:grid;place-items:center;border-radius:9px;color:var(--muted)}
.icon-button svg{width:19px;height:19px}
.icon-button:hover{background:#8881;color:var(--ink)}
.lockup{gap:5px}
.lockup>span{display:flex;align-items:center}
.signature{width:23px;height:23px;flex:none}
.signature>rect:first-of-type{stroke:var(--sig)}
.signature .eyeL,.signature .eyeR{fill:var(--eye)}
.wordmark{width:71px;height:auto;max-height:17px;color:var(--ink)}
.wordmark path{fill:var(--ink)}
:where(.root) h1{font-size:28px;line-height:1.15;letter-spacing:-.04em;margin:0 0 25px;font-weight:800;overflow-wrap:break-word}
:where(.root) p{margin:0 0 14px;color:var(--muted);font-size:13px;line-height:1.65}
:where(.root) p:last-child{margin-bottom:0}
:where(.root) ul,:where(.root) ol{margin:0;padding:0}
.explanation{list-style:disc;padding-left:18px}
.explanation li{padding-left:3px;margin:0 0 12px;color:var(--muted);font-size:13px;line-height:1.65}
.explanation li:last-child{margin-bottom:0}
.explanation li::marker{color:var(--muted);font-size:.7em}
.error{color:var(--error)}
p.error{color:var(--error)}
.fine{font-size:12px;line-height:1.65;margin:22px 0 0}
.foot{font-size:11px;line-height:1.5;text-align:center;margin:12px 0 0;color:var(--muted);flex:none}

/* Choice rows remain whole, labelled buttons. */
.choice{display:flex;width:100%;gap:16px;text-align:left;border-bottom:1px solid var(--line);padding:18px 0;color:var(--ink);border-radius:4px}
.choice:first-of-type{padding-top:0}
.choice:last-of-type{border-bottom:0;padding-bottom:0}
.choice-copy{flex:1;min-width:0}
.choice-name{display:block;font-size:18px;line-height:1.25;letter-spacing:-.025em;font-weight:800}
.choice-desc{display:block;margin-top:7px;font-size:12px;line-height:1.65;color:var(--muted)}
.choice:hover .choice-name{text-decoration:underline;text-underline-offset:4px}
.arrow{margin-left:auto;font-size:22px;line-height:1;align-self:center}
.provider{width:100%;min-height:60px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-weight:700;padding:0 6px;border-radius:4px}
.provider:last-child{border:0}
.provider:hover{background:#8881}

/* Actions are outside the scrolling content, in document order. */
.actions{display:grid;gap:10px}
.sheet-actions{flex:none;background:var(--bg);padding:18px 28px 24px;border-top:1px solid var(--line)}
.primary,.secondary{border-radius:10px;min-height:50px;padding:12px 16px;font-size:14px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;line-height:1.45}
.primary{background:var(--accent);border:1px solid transparent;color:#18181a}
.primary:hover{filter:brightness(.96)}
.primary:disabled{cursor:default;background:var(--field);border-color:var(--line);color:var(--muted);filter:none}
.secondary{color:var(--ink);border:1px solid var(--line);min-height:42px;font-size:13px;font-weight:700;padding:10px 14px}
.secondary:hover{background:#8881}
.primary svg{width:18px;height:18px}
.external-link{display:inline-flex;align-items:center;gap:8px;max-width:100%;min-height:44px;vertical-align:middle}
.external-link .link-label{min-width:0;overflow-wrap:anywhere}
.external-arrow{width:14px;height:14px;flex:0 0 14px;opacity:.75}
.provider-link{justify-content:center;padding:10px 14px;border-radius:9px;background:var(--field);color:var(--ink);border:1px solid var(--line);font-size:13px;font-weight:700;text-decoration:none}
.actions>.provider-link{width:100%;min-height:44px;display:flex}
.guide{font-size:12px;color:var(--muted);min-height:34px}
.sheet-actions>.guide{display:flex;justify-content:center;margin:0}
.guide-screen .guide-open{display:inline-flex;justify-content:flex-start;width:fit-content;min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink);padding:9px 12px;font-size:12px;font-weight:700;text-decoration:none}
.guide-open:hover{border-color:var(--muted)}
.overview-steps{list-style:none;counter-reset:step;display:grid;gap:20px}
.overview-steps li{position:relative;counter-increment:step;padding-left:36px;line-height:1.65;font-size:14px;color:var(--ink);min-height:24px}
.overview-steps li::before{content:counter(step) / "";position:absolute;left:0;top:0;width:24px;height:24px;border:1px solid var(--line);border-radius:50%;color:var(--muted);text-align:center;font:500 12px/22px ui-monospace,monospace}
.overview-steps li:has(.guide-open)::before{top:10px}
.link-host{display:block;margin-top:5px;color:var(--muted);font:500 11px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}
p.guide-note{margin:22px 0 0;font-size:12px}

/* Optional detail scrolls with its content; Continue remains outside it. */
.vault-details{border-top:1px solid var(--line);margin-top:24px}
.vault-details summary{cursor:pointer;min-height:48px;padding:13px 0;color:var(--muted);font-size:12px;font-weight:700}
.vault-details .fine{margin-bottom:0}
p.fine-in-view{margin:6px 0 0}
.vault-steps{list-style:none;display:grid;gap:20px}
.vault-steps li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:12px;align-items:start}
.vault-steps .step-number{width:24px;height:24px;border:1px solid var(--line);border-radius:50%;text-align:center;color:var(--muted);font:500 12px/22px ui-monospace,monospace}
.vault-steps h2{color:var(--ink);font-size:14px;font-weight:800;line-height:1.5;letter-spacing:-.015em;margin:0 0 4px}
.vault-steps p{font-size:12px;line-height:1.6;margin:0}
.vault-steps .step-trust{display:flex;align-items:center;gap:7px;margin-top:7px;font-size:12px}
.step-trust svg{width:14px;height:14px}
.vault-step-sheet summary{display:flex;align-items:center;justify-content:space-between;gap:12px;list-style:none}
.vault-step-sheet summary::-webkit-details-marker{display:none}
.vault-step-sheet summary svg{width:15px;height:15px}
.vault-step-sheet details[open] summary svg{transform:rotate(45deg)}
.vault-detail-body{display:grid;gap:10px}
.vault-detail-body p{font-size:12px;line-height:1.7;margin:0}

/* One input border. Save uses the common action area. */
.field-label{display:block;font-size:12px;font-weight:700;margin:0 0 10px}
.connect-box{border:1px solid var(--line);border-radius:10px;background:var(--field);padding:0}
.connect-box:focus-within{outline:2px solid var(--focus);outline-offset:2px}
.connect-box input{display:block;width:100%;min-width:0;border:0;border-radius:10px;background:transparent;color:var(--ink);font:16px ui-monospace,SFMono-Regular,Menlo,monospace;min-height:54px;padding:14px;margin:0;outline:none}
.connect-box input:focus-visible{outline:none}
.connect-box input::placeholder{font:500 13px Manrope,system-ui,sans-serif;color:var(--muted);opacity:1}
.connect-box:has(input[aria-invalid="true"]){border-color:var(--error)}
.connect-box input[aria-invalid="true"]{caret-color:var(--error)}
p.field-hint{margin:10px 0 0;font-size:12px}
p.field-error{margin:12px 0 0;font-size:12px}
.key-reassurance{list-style:none;display:grid;gap:9px;padding:0;margin:22px 0 0}
.key-reassurance li{display:flex;align-items:center;gap:10px;padding:0;margin:0;color:var(--muted);font-size:12px;line-height:1.5}
.key-reassurance svg{width:15px;height:15px;opacity:.8}
p.key-storage{margin:14px 0 0;font-size:12px;line-height:1.5}

/* Status wording and completion behavior stay unchanged. */
.message{text-align:center;display:flex;flex-direction:column;justify-content:center;padding:8px 0 14px;min-height:206px}
.message .tile{margin:0 auto 20px;width:52px;height:52px;border-radius:14px}
.message .tile svg{width:35px;height:35px}
.message h1{margin:0 0 14px}
.message p{margin:0}
.message p+p{margin-top:6px}
.busy{display:block;width:28px;height:28px;border:2px solid var(--line);border-top-color:var(--ink);border-radius:50%;margin:0 auto 16px;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.eyeL{transform-box:fill-box;transform-origin:center}
.wink .eyeL{animation:wink .5s ease .1s}
@keyframes wink{0%,100%{transform:scaleY(1)}45%,65%{transform:scaleY(.14)}}
@media(max-width:540px){
.overlay{align-items:flex-end;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}
.sheet{width:100%;max-height:100%}
.top{padding:20px 18px 0}
.sheet-body{padding:23px 22px 22px}
.sheet-actions{padding:16px 22px 20px}
:where(.root) h1{font-size:26px}
.brand{font-size:12px;gap:10px}
.tile.mode{width:38px;height:38px}
.icon-button{width:36px}
.foot{margin-top:10px}
}
@media(max-width:350px){
.top{padding:16px 14px 0;gap:6px}
.sheet-body{padding:20px 18px}
.sheet-actions{padding:14px 18px 18px}
.brand{font-size:11px;gap:8px}
.tile.mode{width:34px;height:34px}
.icon-button{width:32px}
:where(.root) h1{font-size:25px}
.overview-steps li{padding-left:33px;font-size:13px}
.guide-screen .guide-open{font-size:11px;padding:9px}
.connect-box input::placeholder{font-size:12px}
}
@media(max-height:480px){
.sheet{max-height:100%}
.top{padding-top:12px}
.sheet-body{padding-top:16px;padding-bottom:16px}
.sheet-actions{padding-top:12px;padding-bottom:12px;gap:4px}
.primary{min-height:46px}
.foot{margin-top:7px}
:where(.root) h1{margin-bottom:18px}
}
@media(prefers-reduced-motion:reduce){
.busy,.wink .eyeL{animation:none}
:where(.root) *{scroll-behavior:auto!important}
}
`;

export type StylePath = "constructable" | "style";

/** Feature test for constructable stylesheets on this root. */
export function canConstruct(root: ShadowRoot): boolean {
  return (
    typeof CSSStyleSheet !== "undefined" &&
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === "function" &&
    "adoptedStyleSheets" in root
  );
}

let shared: CSSStyleSheet | null = null;

/** Adopt the widget stylesheet into a shadow root. */
export function adoptStyles(root: ShadowRoot): StylePath {
  if (canConstruct(root)) {
    if (!shared) {
      shared = new CSSStyleSheet();
      shared.replaceSync(CSS);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, shared];
    return "constructable";
  }
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  return "style";
}

/** A second, tiny sheet the overlay rewrites as the visual viewport moves
 *  (the phone keyboard). Same two paths, no style attribute anywhere. */
export interface DynamicSheet {
  set(css: string): void;
}

export function dynamicSheet(root: ShadowRoot): DynamicSheet {
  if (canConstruct(root)) {
    const sheet = new CSSStyleSheet();
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return { set: (css) => sheet.replaceSync(css) };
  }
  const style = document.createElement("style");
  root.appendChild(style);
  return { set: (css) => { style.textContent = css; } };
}
