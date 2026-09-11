/**
 * The widget's stylesheet, adopted into each shadow root through a
 * constructable CSSStyleSheet (works under a strict Content-Security-Policy,
 * no inline styles) with a <style> element as the fallback where the
 * constructor is missing (Safari before 16.4, Firefox before 101).
 *
 * Measurements and colors come from the design set: 460px sheet, 20px
 * corners, a bottom sheet with a 12px inset on phones; paper #FAF8F3 /
 * ink #18181A / muted #62625C and dark #232326 / #FAF8F3 / #B8B8B2;
 * the primary action #D6F436 on graphite. System fonts only.
 */

const THEME_LIGHT =
  "--bg:#faf8f3;--ink:#18181a;--muted:#62625c;--line:#d1cfc5;--field:#fff;--accent:#d6f436;" +
  "--error:#9c3045;--focus:#789200;--veil:#22222213;--sig:#18181a;--eye:#84a800";
const THEME_DARK =
  "--bg:#232326;--ink:#faf8f3;--muted:#b8b8b2;--line:#525256;--field:#18181a;--accent:#d6f436;" +
  "--error:#f2a6b6;--focus:#d6f436;--veil:#00000055;--sig:#faf8f3;--eye:#d6f436";

export const CSS = `
.root{all:initial;display:block;box-sizing:border-box;${THEME_LIGHT};
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;color:var(--ink);
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

/* the overlay: fixed, follows the visual viewport when a keyboard is open */
.overlay{position:fixed;left:0;right:0;top:var(--vv-top,0px);height:var(--vv-height,100vh);
display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147483000}
.veil{position:absolute;inset:0;background:var(--veil);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
dialog.overlay::backdrop{background:transparent}
.sheet{position:relative;width:460px;max-width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);
border-radius:20px;box-shadow:0 24px 80px #0003;max-height:calc(100% - 60px);overflow:auto;overscroll-behavior:contain;
scrollbar-gutter:stable;padding:24px 28px 20px}
.status-card{min-height:320px}

/* the top bar */
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px;min-height:44px}
.brand{display:flex;gap:10px;align-items:center;font-size:13px;font-weight:650}
.tile{display:grid;place-items:center;background:#18181a;border-radius:11px;width:40px;height:40px;flex:none}
.tile svg{width:25px;height:25px}
.tile.mode{width:44px;height:44px;border-radius:12px;color:#d6f436}
.chrome{display:flex;gap:8px}
.icon-button{width:44px;height:44px;display:grid;place-items:center;border-radius:10px;font-size:24px;line-height:1}
.icon-button:hover{background:#8882}
.lockup{gap:5px}
.lockup>span{display:flex;align-items:center}
.signature{width:23px;height:23px;flex:none}
.signature>rect:first-of-type{stroke:var(--sig)}
.signature .eyeL,.signature .eyeR{fill:var(--eye)}
.wordmark{width:71px;height:auto;max-height:17px;color:var(--ink)}
.wordmark path{fill:var(--ink)}

/* words */
:where(.root) h1{font-size:29px;line-height:1.13;letter-spacing:-.045em;margin:0 0 24px;font-weight:780;overflow-wrap:break-word}
:where(.root) p{margin:0 0 13px;color:var(--muted);font-size:14px;line-height:1.65}
:where(.root) p:has(+.actions),:where(.root) p:has(+.provider-link){margin-bottom:0}
:where(.root) ul,:where(.root) ol{margin:0;padding:0}
.explanation{list-style:disc;padding-left:18px}
.explanation li{padding-left:3px;margin:0 0 12px;color:var(--muted);font-size:14px;line-height:1.65}
.explanation li:last-child{margin-bottom:0}
.explanation li::marker{color:var(--muted);font-size:.7em}
.overview-steps{padding-left:23px}
.overview-steps li{padding-left:8px;margin:0 0 18px;line-height:1.65;font-size:14px;color:var(--muted)}
.overview-steps li:last-child{margin-bottom:0}
.overview-steps li::marker{font-weight:700;color:var(--ink)}
.error{color:var(--error)}
.fine{font-size:12px;line-height:1.65;margin:22px 0 0}
.foot{font-size:11px;text-align:center;margin:20px 0 0;color:var(--muted)}

/* the choice and the provider rows */
.choice{display:flex;width:100%;gap:16px;text-align:left;border-bottom:1px solid var(--line);padding:20px 0;color:var(--ink);border-radius:4px}
.choice:first-of-type{padding-top:0}
.choice:last-of-type{border-bottom:0;padding-bottom:6px}
.choice-copy{flex:1;min-width:0}
.choice-name{display:block;font-size:19px;line-height:1.25;letter-spacing:-.025em;font-weight:700}
.choice-desc{display:block;margin-top:8px;font-size:14px;line-height:1.65;color:var(--muted)}
.choice:hover .choice-name{text-decoration:underline;text-underline-offset:4px}
.arrow{margin-left:auto;font-size:22px;line-height:1;align-self:center}
.provider{width:100%;min-height:65px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-weight:650;padding:0 6px;border-radius:4px}
.provider:hover{background:#8881}

/* actions and links */
.actions{margin-top:24px;display:grid;gap:12px}
.primary,.secondary{border-radius:11px;min-height:49px;padding:12px 16px;font-size:14px;font-weight:750;text-align:center;display:block;width:100%}
.primary{background:var(--accent);border:1px solid transparent;color:#18181a}
.primary:hover{filter:brightness(.96)}
.primary:disabled{cursor:default;filter:saturate(.5) brightness(.95)}
.secondary{color:var(--muted);text-decoration:underline;text-underline-offset:4px}
.external-link{display:inline-flex;align-items:center;gap:8px;max-width:100%;min-height:44px;vertical-align:middle}
.external-link .link-label{min-width:0;overflow-wrap:anywhere}
.external-arrow{width:14px;height:14px;flex:0 0 14px;opacity:.75}
.overview-steps .external-link{vertical-align:baseline}
.provider-link{justify-content:center;padding:10px 14px;border-radius:9px;background:#faf8f3;color:#18181a;border:1px solid #d1cfc5;font-size:13px;font-weight:700;text-decoration:none;margin-top:16px}
.actions>.provider-link{margin:0;width:100%;min-height:49px;display:flex}
.guide{margin-top:8px;font-size:12px}
.guide+.foot{margin-top:12px}

/* the connect box */
.field-label{display:block;font-size:13px;font-weight:700;margin:24px 0 10px}
.connect-box{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:13px;background:var(--field);padding:7px}
.connect-box .tile{width:34px;height:36px;border-radius:9px}
.connect-box .tile svg{width:23px;height:23px}
.connect-box input{min-width:0;flex:1;width:100%;border:0;background:transparent;color:var(--ink);
font:16px ui-monospace,SFMono-Regular,Menlo,monospace;min-height:44px;padding:0;margin:0;outline-offset:2px}
.connect-box input::placeholder{color:var(--muted);font-size:12px;opacity:1}
.connect-box input[aria-invalid="true"]{caret-color:var(--error)}
.save{background:#18181a;color:#faf8f3;border:1px solid #525255;border-radius:9px;min-height:44px;padding:0 12px;font-size:13px;font-weight:700}

/* status screens */
.message{text-align:center;display:flex;flex-direction:column;justify-content:flex-start;padding-top:8px}
.message .tile{margin:0 auto 16px;width:58px;height:58px;border-radius:16px}
.message .tile svg{width:39px;height:39px}
.message h1{margin:0 0 12px}
.message p{margin:0}
.message p+p{margin-top:6px}
.message .actions{margin-top:24px}
.busy{display:block;width:28px;height:28px;border:2px solid var(--line);border-top-color:var(--ink);border-radius:50%;margin:0 auto 16px;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.eyeL{transform-box:fill-box;transform-origin:center}
.wink .eyeL{animation:wink .5s ease .1s}
@keyframes wink{0%,100%{transform:scaleY(1)}45%,65%{transform:scaleY(.14)}}

@media(max-width:540px){
.overlay{align-items:flex-end;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}
.sheet{width:100%;padding:19px 19px 20px;max-height:calc(100% - 52px)}
.top{margin-bottom:24px}
h1{font-size:28px}
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
