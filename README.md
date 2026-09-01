# AMCA CRM — Membership & Engagement Platform

An interactive, click-through prototype of the CRM described for AMCA Australia. It has no backend — all data is mocked in [`js/data.js`](js/data.js) and mutated in memory — but every screen, workflow and integration touchpoint in the brief is represented so it can be demoed and validated before real build work starts.

Brand palette and type sampled from [amca.com.au](https://amca.com.au) (navy `#0072AE`, orange `#F47920`, teal `#45C2AE`).

## Run it

No build step. Open [`index.html`](index.html) directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## What's in the prototype

| Screen | Covers |
|---|---|
| **Dashboard** | Pipeline snapshot, renewals due, recent activity, upcoming events — the daily landing page. |
| **Membership Pipeline** | Kanban from *Enquiry → Qualifying → Application → Member (Active) → Renewal Due → Lapsed*. Cards can be advanced, renewed, lapsed, or re-engaged; every move writes a timeline entry. This is where the website enquiry form, and nothing else, should write new leads. |
| **Companies & People** | One record per member business — the company plus every person inside it and their role (Primary Contact, Billing Contact, Technical Rep, etc.). Searchable and filterable by category/stage. |
| **Renewals & Billing** | The renewals view: category, join date, renewal date, status, and a live-looking Xero invoice/payment badge. "Raise invoice in Xero" and a mock payment webhook are wired up so the invoice → paid flow can be demoed end-to-end. |
| **Member Comms** | The lifecycle email sequence: enquiry acknowledgement → welcome → benefits → policy/regulation updates → renewal reminders (60/30/7 day) → renewal confirmation or lapse notice. |
| **Non-Members** | Events & training registrations, the non-member/past-member database, and a campaign builder that sends a defined segment (Past Enquiries, Training Alumni, Former Members) to Mailchimp instead of the whole list. |
| **Website Access** | A persona switcher (Guest / Non-member / Active member / Renewal-due member / Lapsed member / Staff) that shows exactly which resources unlock — this is the paywall logic the CRM needs to hand the website. |
| **Integrations** | Connection status and a running sync log for Xero, Mailchimp and the website, standing in for the webhooks/API calls the real build will make. |

## Data model (what the real build persists)

```
Company (one per member business)
  ├─ category, stage, owner, source, join date, renewal date
  ├─ xero:      { contactId, invoiceNo, invoiceStatus, paymentStatus, amount }
  ├─ mailchimp: { synced, segments[] }
  ├─ people[]:  { name, role, email, phone, primary }
  └─ timeline[]: append-only activity log (emails sent, stage changes, invoices, payments)
```

`stage` drives everything downstream: it decides which lifecycle email fires next, whether a renewal invoice can be raised, which Mailchimp segments a contact belongs to, and what the website's access-control check returns for that member's staff and portal users.

## Replacing mock data with real integrations

- **Leads** — point the website's enquiry form directly at the CRM's lead-create endpoint with an owner-assignment rule, instead of a Google Form + manual Asana copy.
- **Xero** — "Raise invoice in Xero" becomes a real call to the Xero API against the company's Xero contact; payment status is written back via a Xero webhook (mocked here with "Mark paid (webhook test)").
- **Mailchimp** — segments sync on every stage change via the Mailchimp API (mocked here as static per-company segment tags).
- **Website** — the persona switcher on the Website Access screen becomes a real session check: the website calls the CRM (or reads a short-lived JWT/claims token it issues) for membership status + role on every page load to drive the paywall.

## Structure

```
index.html        Screen layout / containers
css/styles.css     AMCA-branded styling
js/data.js         Mock companies, people, events, comms sequence, access rules
js/app.js          Rendering + interactivity (state lives in memory only)
```
