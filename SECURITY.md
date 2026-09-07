# Security

Outlet's design minimizes what there is to steal: the SDK has zero
dependencies and runs on your user's device in direct mode; the vault
stores admin keys encrypted and nothing decryptable is ever displayed;
prompts and completions never touch Outlet in any mode.

## Reporting a vulnerability

Email security@useoutlet.dev with what you found, how to reproduce it,
and what you believe the impact is.

You will get a human reply, typically within 2 business days. Outlet is
a small operation, so expect best-effort triage, honest updates while a
fix is in flight, and credit in the fix notes if you want it. There is
no bug bounty program yet.

## Scope

The vault (api.useoutlet.dev), the site and grant screen
(useoutlet.dev), and the published @useoutlet/sdk package.
Provider-side issues belong to the provider.

## Please

Do not test against accounts or credentials that are not yours, do not
run automated scanners against the vault (rate limits will fire), and
give us a reasonable window before public disclosure. We move fast on
real reports.
