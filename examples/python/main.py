"""
Connect your AI, from a Python server. One FastAPI app with two routes:
/connect starts a Vault connection request and sends the user to the grant
URL. /outlet/return takes the code and state back on the return address and
exchanges them for the session. This app is a public client (no app secret):
the exchange carries the PKCE proof, and the session's refresh token
authorizes refresh(), status() and revoke() later. The Vault App key is
shown masked. A real app hands it to the provider's official SDK.

    pip install useoutlet fastapi uvicorn
    OUTLET_APP_ID=app_yourapp uvicorn main:app --port 8000

Then open http://localhost:8000/. Outlet registers
http://localhost/outlet/return for every app. It matches any port.
"""

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from useoutlet import ConnectionEndedError, Outlet, OutletError, OutletSession

app = FastAPI()
outlet = Outlet(app_id=os.environ.get("OUTLET_APP_ID", "app_demo"))  # no secret: a public client
PORT = int(os.environ.get("PORT", "8000"))
RETURN_ADDRESS = f"http://localhost:{PORT}/outlet/return"

# The sessions this process holds, by grant id. A real app keeps the grant id
# and the refresh token in its own store, with the user. Never the key.
sessions: dict[str, OutletSession] = {}

PREFIXES = ("sk-svcacct-", "sk-proj-", "sk-ant-", "sk-or-v1-", "sk-", "AIza")


def masked(key: str) -> str:
    """The key with everything but its known prefix hidden."""
    head = next((p for p in PREFIXES if key.startswith(p)), "")
    return f"{head}… ({len(key)} chars)"


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return '<p><a href="/connect">Connect your AI</a></p>'


@app.get("/connect")
def connect() -> RedirectResponse:
    # The request names one provider. The client holds the PKCE values until
    # the user comes back.
    request = outlet.connect(
        providers=["anthropic"], requested_cap_usd=10, redirect_uri=RETURN_ADDRESS
    )
    return RedirectResponse(request.grant_url)


@app.get("/outlet/return", response_class=HTMLResponse)
def outlet_return(code: str = "", state: str = "") -> str:
    try:
        session = outlet.exchange(code, state)
    except OutletError as e:
        raise HTTPException(status_code=400, detail=f"{e.code}: {e.message}") from None
    sessions[session.grant_id] = session
    keys = ", ".join(f"{provider}: {masked(key)}" for provider, key in session.keys.items())
    return (
        f"<p>Connected. Grant {session.grant_id}, Vault cap ${session.cap_usd:g} a month.</p>"
        f"<p>{keys}</p>"
        f'<p><a href="/status/{session.grant_id}">Check the connection</a></p>'
    )


@app.get("/status/{grant_id}", response_class=HTMLResponse)
def status(grant_id: str) -> str:
    try:
        info = outlet.status(grant_id)
    except ConnectionEndedError as e:
        return f"<p>This connection ended: {e.reason}.</p><p>{e.message}</p>"
    return f"<p>{info.status}: ${info.spend_usd:g} of the ${info.cap_usd:g} Vault cap used this month.</p>"
