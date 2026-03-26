# Flexpa — Health records & interoperability (notes)

Reference: [Flexpa](https://www.flexpa.com), [Flexpa Consent](https://www.flexpa.com/consent), [Flexpa Records](https://www.flexpa.com/records), [Try connect flow](https://my.flexpa.com/connect), [SMART Health Links API (Flexpa)](https://www.flexpa.com/docs/smart-health-links), [SMART Health Links blog post](https://www.flexpa.com/blog/smart-health-links-api-kill-the-clipboard).

---

## What Flexpa is

- **B2B infrastructure**, not a consumer “vault” in the usual sense: developers integrate Flexpa so **patients can authorize** access and apps receive **standardized FHIR** data.
- Positioning: health records for agents — clinical trials, benefits navigation, healthcare services, etc.
- **Networks** (as marketed): payer access aligned with **CMS patient access**, provider/EHR access aligned with **ONC (g)(10)** / **SMART on FHIR**, nationwide exchange via **TEFCA** (they cite **IAS**). They also mention **IAL2** identity proofing, **SMART Health Links**, and a **FHIR API**.

---

## How a patient’s data shows up (“getting records on Flexpa”)

Patients typically **do not** manually upload a full chart to Flexpa.

1. The patient uses an **app or workflow** that embeds Flexpa (or the standalone **MyFlexpa** / connect experience).
2. **Flexpa runs consent + identity/auth** (they describe handling auth from patient portals through SMART on FHIR and IAL2 proofing).
3. The patient **authorizes** access to data that already lives with **payers, provider systems, and/or exchanges** Flexpa can reach.
4. Flexpa **retrieves** that data and exposes it to the **developer’s backend** via tokens/API (FHIR).

**Short version:** Data is **pulled from upstream systems after consent**, not built from scratch on Flexpa.

**Direct try path:** Homepage links to **[my.flexpa.com/connect](https://my.flexpa.com/connect)** for a connect-style experience outside a specific partner app.

---

## Providers & QR codes (common confusion)

### Who has the QR?

- In the usual **“patient brings outside records”** flow, the **patient** (or their app) **has** the QR or shareable link — not the clinician “uploading a QR into the EHR.”
- **SMART Health Links (SHL)** are **`shlink:`** URLs that point to **encrypted** health payloads; they can be shared as **QR**, pasted URL, or embedded in apps. Recipients can open in a **browser** or **SHL-aware apps** ([Flexpa SHL post](https://www.flexpa.com/blog/smart-health-links-api-kill-the-clipboard)).

### Do tech‑averse providers “upload this to their EHR”?

- There is **no universal** “Import QR → Epic” path every clinic knows.
- Reality is closer to: a **supported scanner/app**, **opening the link** in a viewer, or **integration** into document/structured ingest — otherwise **view/summarize → manual charting**.

### Does scanning put data in the EHR automatically?

- **Only if the receiving side is built to ingest it.** Scanning means you can **access** the payload; **writing to problem list / meds / documents** depends on **EHR vendor**, **modules**, and **integration** — not guaranteed by the QR alone.

### Who *issues* QR / links?

- **Data holders** (labs, health systems, apps that assemble FHIR) can **generate** SHLs via APIs (e.g. Flexpa’s SHL API encrypts payload, returns `shlink:` URL). That is separate from the patient-presenting QR at a new provider visit.

---

## How Flexpa (and similar rails) get data from **insurers** if “only providers have the record”

Two different things are both called “records”:

| Source | What they tend to hold |
|--------|-------------------------|
| **Providers / EHRs** | Clinical chart: notes, orders, imaging reads, detailed visit content. |
| **Payers / insurers** | **Claims & encounters** (diagnosis/procedure codes, dates, places of service, amounts), **pharmacy claims**, eligibility/EOB-style data, and sometimes **clinical-adjacent** data (e.g. lab, depending on what the plan maintains and exposes). |

**Regulatory hook:** CMS **Interoperability and Patient Access** (**CMS-9115-F**) requires many **regulated payers** to expose member data via **FHIR-based Patient Access APIs** (claims/encounter data, clinical data including labs where applicable, generally **2016+** for current enrollees per CMS materials). See [CMS Patient Access API](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/patient-access-api).

**Mental model:** The **provider chart** and the **payer’s dataset** overlap but are not identical. Flexpa-style products use **patient-authorized** APIs to pull the **payer slice** (and other slices from EHRs/exchanges) into one developer integration.

---

## SMART Health Links — technical snapshot (from Flexpa’s description)

- Payload **encrypted** (e.g. AES-256-GCM); unique key per link; encrypted blob stored; **`shlink:`** URL embeds location + decryption material (bearer-token-like model).
- Optional **passcode**, **TTL**, **revocation**, brute-force lockout after failed passcodes.
- Can carry **FHIR**, **SMART Access Tokens**, or **SMART Health Cards** depending on use case.

---

## Glossary (quick)

- **FHIR** — Standard format for healthcare resources APIs often return.
- **SMART on FHIR** — OAuth-based app access to EHR FHIR APIs.
- **TEFCA** — Trusted Exchange Framework and Common Agreement; nationwide exchange context.
- **CMS-9115-F** — Payer Patient Access API requirements for covered payers.
- **SHL / `shlink:`** — SMART Health Link portable share mechanism (QR/URL).

---

*Internal notes for Notion — not legal or medical advice.*
