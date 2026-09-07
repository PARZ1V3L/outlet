# Outlet — Architecture

Three views: system overview, data model, and the grant (OAuth-style) flow.
All three describe the code as it exists in `vault/` + `sdk/` today; future
pieces are marked. Protocol detail lives in [spec/SPEC.md](../spec/SPEC.md).

## 1. System overview

The defining property: **Outlet provisions and meters; it is never in the
data path.** Apps call providers directly.

```mermaid
flowchart LR
    subgraph UserSide["User"]
        U["End user<br/>(owns provider account)"]
    end

    subgraph AppSide["Third-party app"]
        APP["App backend / frontend"]
        SDK["@useoutlet/sdk<br/>connect · refresh · status · revoke"]
        APP --- SDK
    end

    subgraph Outlet["Outlet (Cloudflare)"]
        GS["Grant screen<br/><i>useoutlet.dev/grant</i>"]
        DASH["User dashboard<br/><i>future</i>"]
        subgraph Vault["vault (Worker)"]
            R["routes/<br/>grants · users · health"]
            A["adapters/<br/>openai ✅ · anthropic ✅"]
            L["lib/<br/>crypto AES-GCM · db · meter"]
            R --> A
            R --> L
            A --> L
        end
        D1[("D1<br/>users · credentials · grants")]
        SEC["Workers secrets<br/>MASTER_KEY"]
        CRON["cron */5 min<br/>meter → auto-revoke"]
        L --> D1
        L -.reads.-> SEC
        CRON --> Vault
    end

    subgraph Providers["AI providers"]
        OAI["OpenAI<br/>admin API: projects · budgets ·<br/>service accounts · costs"]
        ANT["Anthropic<br/>admin API: workspaces · costs<br/>(keys via guided Console step)"]
        INF["Provider inference APIs"]
    end

    U -->|"connects account once"| Vault
    U -->|"approves grants"| GS
    SDK -->|"grant lifecycle (HTTPS/JSON)"| R
    A -->|"provision · usage · revoke"| OAI
    A -->|"provision · usage · revoke"| ANT
    APP ==>|"inference calls — DIRECT,<br/>scoped key, user's billing"| INF

    style APP fill:#1f2734,color:#fff
    style INF fill:#1f2734,color:#fff
```

The thick edge is the data path. It never touches Outlet.

## 2. Data model

Current schema (`vault/schema.sql`). One grant = one app × one provider ×
one user, with its own capped key.

```mermaid
erDiagram
    USERS ||--o{ CREDENTIALS : "has one per provider"
    USERS ||--o{ GRANTS : "approves"

    USERS {
        text id PK "usr_…"
        text email UK
        text created_at
    }

    CREDENTIALS {
        text user_id PK,FK
        text provider PK "openai | anthropic | google"
        text encrypted_admin_key "AES-256-GCM, MASTER_KEY in Workers secrets"
        text created_at
    }

    GRANTS {
        text id PK "grant_…"
        text user_id FK
        text app_id "registered app (APPS table planned)"
        text provider
        real cap_usd "monthly spend cap"
        text status "pending | active | capped | revoked"
        text provider_refs "JSON: projectId, serviceAccountId"
        text encrypted_app_key "the scoped key, encrypted at rest"
        text created_at
        text updated_at
    }
```

Planned next (not yet in schema): `APPS` (registered developer apps with
verified identity for the grant screen) and `AUDIT_LOG` (user-visible record
of every provision/refresh/revoke — SPEC §6).

## 3. Grant flow (OAuth-style)

OAuth-shaped: the app never sees the user's root credential; it receives a
scoped, capped, revocable key after explicit user consent.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant APP as App (@useoutlet/sdk)
    participant V as Outlet vault
    participant P as Provider admin API (OpenAI)
    participant I as Provider inference API

    Note over U,V: CONNECT — once per provider
    U->>V: POST /v0/users … /credentials (admin key)
    V->>V: validate sk-admin- prefix · AES-GCM encrypt · store in D1

    Note over APP,V: GRANT — once per app
    APP->>V: POST /v0/grants {app_id, providers, requested_cap_usd}
    V-->>APP: {grantRequestId, grantUrl}
    APP->>U: redirect to grantUrl (grant screen)
    U->>V: approve (cap confirmed)  POST /grants/:id/approve — user JWT + human check
    V->>P: create project "outlet · app"
    V->>P: set budget_limit_usd (belt)
    V->>P: create service account
    P-->>V: raw scoped key (sk-svcacct-…)
    V->>V: encrypt key · grant → active
    APP->>V: GET /v0/grants/:id (poll)
    V-->>APP: session {keys, capUsd, expiresAt}

    Note over APP,I: USE — every request, Outlet absent
    APP->>I: inference with scoped key (user's billing)

    Note over V,P: METER — cron every 5 min (suspenders)
    V->>P: costs grouped by project
    alt spend ≥ cap
        V->>P: delete service account (structural kill)
        V->>V: grant → capped
    end

    Note over U,P: REVOKE — user, app, or meter
    U->>V: DELETE /v0/grants/:id
    V->>P: delete service account + archive project
    V-->>APP: next refresh() → grant_revoked
```

Known prototype gaps (by design, tracked): crypto deviation from SPEC §6
is blessed in [ADR 0001](adr/0001-credential-encryption.md). The approve
step is no longer among them — it requires a verified user session
(ADR 0003) and, where a Turnstile secret is bound, a passed human check.
