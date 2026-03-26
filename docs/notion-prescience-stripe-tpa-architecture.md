# Prescience TPA — Stripe architecture & operating model (notes)

This document is **only** the Prescience / Stripe / Connect / Treasury / Issuing / fiduciary discussion. **Flexpa and health-record interoperability** are documented separately.

**Stripe references:** [Financial Accounts (Connect)](https://docs.stripe.com/financial-accounts/connect/account-management/financial-accounts), [Outbound payments](https://docs.stripe.com/financial-accounts/connect/moving-money/out-of/outbound-payments), [Fund Issuing balances (Connect)](https://docs.stripe.com/issuing/connect/funding), [Issuing on Connect](https://docs.stripe.com/issuing/connect).

---

## Product story (summary)

1. **Employer** links bank (e.g. Plaid in your UI, or Stripe Financial Connections) and prefunds **claims float**.
2. **Patient** books via Prescience; **onboarding** adds **HSA and/or card** for **copays**.
3. **Prefunded** money sits in **Stripe** structures **per employer** (see architecture below).
4. Patient uses **Prescience / TPA-branded insurance card**; at visit, patient pays with **Stripe Issuing** physical/virtual card (interchange is a revenue line — **not** a fixed “1%” in planning).
5. **Copay**: charge patient’s **HSA/card** via normal **Stripe Payments** (`PaymentIntent` / `SetupIntent`), **not** Treasury Outbound Payments.
6. **Fee to employer**: e.g. **% of savings** vs sticker price — **invoice** or **ACH** on a schedule (immediate vs monthly).
7. **Fallback**: if card fails, **provider** uses **provider billing portal** (URL on card); **pay provider** via **OutboundPayment** (or related) from the appropriate **Financial Account** to verified provider bank. **Disputes** are **your** policy layer (whether to forward to patient, etc.).

**Stop-loss** is treated as a **separate** contract/funding stream from **claims float**; still may require **segregation** on the Stripe side (separate Financial Accounts or connected accounts) per **plan documents and counsel**.

---

## Critical API distinction: copay vs “pay the provider”

| Direction | Stripe pattern |
|-----------|----------------|
| **Money in from patient** (copay, HSA, card) | **`PaymentIntent`** / **`SetupIntent`**, **`Customer`**, **`PaymentMethod`**. |
| **Money out to provider bank** | **Treasury `OutboundPayment`** from a **`FinancialAccount`** to a verified **`us_bank_account`** (or wire, per enabled features). |

**Outbound Payments** are **not** used to “charge” the patient.

---

## Account topology (recommended)

```
Platform (Prescience) Stripe account
  ├── Connect application
  ├── Webhooks (Connect, Treasury, Issuing, Payments)
  └── Issuing program (platform-level; cards tied per Stripe Connect Issuing rules)

Per employer
  └── Connected Account (Custom) — legal owner of that Stripe account
        ├── Capabilities: treasury (required for FA), card_issuing, transfers, …
        ├── treasury.financial_account — claims float / fiduciary *operationally*
        └── Issuing balance — funded per Stripe Connect Issuing funding docs
```

- **Custom** connected accounts: typical when you need **Treasury + Issuing** and you control UX.
- **Stripe constraint:** **Accounts v2 does not support Financial Accounts workflows**; use **Accounts v1** for `treasury` and `card_issuing` on connected accounts ([Financial Accounts doc](https://docs.stripe.com/financial-accounts/connect/account-management/financial-accounts)).
- **Limit:** up to **3** open Financial Accounts per connected account (closed FAs don’t count).

---

## Stripe objects by actor

### Employer (connected account)

| Object | Purpose |
|--------|---------|
| `Account` (connected) | KYB/KYC; legal entity. |
| `treasury.financial_account` | Segregated **balance**; ACH in/out (with features enabled); **not** the same bucket as generic “connected account balance” for payments. |
| Feature flags | e.g. `financial_addresses.aba`, `inbound_transfers.ach`, `outbound_payments.ach`, `outbound_payments.us_domestic_wire`, `deposit_insurance`, `card_issuing` on FA, etc. |
| Issuing balance | Funds for **card spend**; top-up per [Fund Issuing balances with Connect](https://docs.stripe.com/issuing/connect/funding) (US **pull** funding default, etc.). |

### Patient

| Object | Purpose |
|--------|---------|
| `Customer` | Holds default payment method for **copays** (platform or employer-scoped — pick one model). |
| `SetupIntent` / `PaymentIntent` | Save and charge **HSA** (runs as debit card) / **credit card**. |
| Issuing `Cardholder` + `Card` | **Card at POS**; authorization webhooks for your rules (eligibility, limits, MCC, allowlist). |

### Provider

| Object | Purpose |
|--------|---------|
| Verified `us_bank_account` `PaymentMethod` | **Destination** for **OutboundPayment** when portal pays provider. |

---

## Money flows (implementation map)

### A — Employer prefunding

1. Onboarding completes → `treasury` **active** on connected account.
2. `POST /v1/treasury/financial_accounts` with header **`Stripe-Account: {connected_account_id}`**.
3. Enable **inbound ACH** (+ **ABA** details if employer **pushes** ACH/wire to routing/account).
4. Pull from employer bank: **Financial Connections** or **Plaid**-facilitated mandate + ACH into FA / top-up path Stripe supports.
5. Allocate to **Issuing balance** per Stripe Issuing funding rules so cards can spend.

**Your DB:** map `employer_id` ↔ `acct_xxx` ↔ `fa_xxx` ↔ Issuing allocation.

### B — Patient copay (HSA / card)

- **`PaymentIntent`** against stored **`PaymentMethod`**.
- Funds typically land in **platform** balance unless you deliberately charge **on_behalf_of** a connected account (uncommon for copays; legal/accounting driven).

**Internal policy:** whether copay cash is forwarded to provider, netted against claims, or held — implemented with **Transfers** / **OutboundPayment** / ledger, not by misusing Outbound APIs for “charge patient.”

### C — Visit: Issuing card swipe

- **Webhook-driven** auth handling (`issuing_authorization.request`, transactions, etc.).
- Settlement consumes **Issuing balance** for that connected account.

### D — Provider fallback payout

- **`OutboundPayment`** from the correct **`FinancialAccount`** to provider’s bank PM ([doc](https://docs.stripe.com/financial-accounts/connect/moving-money/out-of/outbound-payments)).
- Track `processing` → `posted` / `failed` / `returned`.

### E — Prescience fee (% of savings)

- **Stripe Invoicing / Billing** for recurring **monthly true-up**, or one-off **Invoices**.
- Charge employer **card/ACH on file**, or internal transfer from employer FA **only if** agreements and regulations allow.

---

## Webhooks (minimum)

- **Connect:** `account.updated` (requirements, capabilities).
- **Treasury:** `treasury.financial_account.created`, `treasury.financial_account.features_status_updated`, `treasury.financial_account.closed`.
- **Issuing:** authorization + transaction events for approvals and ledgering.
- **Payments:** `payment_intent.succeeded`, `payment_intent.payment_failed`.

Use **idempotency keys** on creates; reconcile Stripe objects to an internal **ledger**.

---

## “Customer owning the account is cleaner” — yes, your UI can do this

- **Employer as owner** maps to **their** **Connect connected `Account`** + **`FinancialAccount`** (not “everything on platform balance”).
- **Not** the same as Stripe **`Customer`** (payer object for saved cards).

**Your UI flow:**

1. Create connected **`Account`** when employer signs up.
2. Run **Stripe Connect Onboarding** (`AccountLink` / hosted onboarding, or **Embedded Connect**).
3. Employer completes **KYB/KYC** as **account holder**.
4. After **`treasury`** active, your backend creates **`FinancialAccount`** with **`Stripe-Account`** header.
5. Your dashboards call your API → Stripe with **platform secret** + **`Stripe-Account`**.

Prescience remains the **platform**; the **employer entity** is the **connected account owner** in Stripe.

**Patients:** usually **`Customer` + PaymentMethods + Issuing Cardholder**, not a full business **connected account** per patient (unless you explicitly choose that model for other reasons).

---

## Fiduciary / “fiduciary account on Stripe”

- **Legal layer:** ERISA/plan/trust language defines **who** is fiduciary, **titling**, and **segregation** (claims vs stop-loss vs operating). Stripe does not replace **plan documents** or **trustee** structure.
- **Ops layer:** **Treasury Financial Accounts** are real **bank-partner** balances suitable **if counsel** confirms they meet the plan’s requirements for holding **employer remittances** / **plan assets**.

**“Counsel required”** means: benefits/ERISA/TPA lawyer validates that **your** Connect + FA structure matches **fiduciary** and **regulatory** obligations — Stripe support cannot sign off on that.

**Practical question for counsel:** *We hold employer remittances in Stripe Treasury Financial Accounts under Connect model X (employer-owned connected accounts). Does this satisfy plan/trust/TPA requirements, and how must funds be segregated from stop-loss and Prescience operating revenue?*

---

## Interest / AUM narrative

- Whether balances **earn yield** and **who** receives it depends on **Stripe Treasury / partner bank terms** and your contracts — verify in **current** Stripe agreements and product docs, don’t assume.

---

## Implementation order (suggested)

1. Connect Custom accounts + onboarding + `account.updated`.
2. `FinancialAccount` create + feature activation + ABA + inbound ACH.
3. Issuing Connect funding + test authorizations.
4. Payments SetupIntent/PaymentIntent for copays.
5. OutboundPayment to test provider bank in test mode.
6. Invoicing/Billing for employer fees.
7. Harden webhooks, idempotency, ledger reconciliation.

---

## What you must own outside Stripe

- Eligibility, network, allowed spend, and auth rules for Issuing.
- Claims adjudication, sticker vs allowed amounts, **fee basis** audit trail.
- Provider verification, dispute policy, patient re-billing decisions.
- Mapping of all IDs and money movement to **accounting** and **reporting**.

---

*Internal notes for Notion — not legal, tax, or compliance advice. Engage qualified counsel for ERISA/TPA/money-transmission questions.*
