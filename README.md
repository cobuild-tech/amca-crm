# AMCA CRM — Membership & Engagement Platform

An interactive, click-through prototype of the CRM described for AMCA Australia. It has no backend — all data is mocked in [`js/data.js`](js/data.js) and mutated in memory — but every screen, workflow and integration touchpoint discussed is represented so it can be demoed and validated before real build work starts.

Brand palette and type sampled from [amca.com.au](https://amca.com.au) (navy `#0072AE`, orange `#F47920`, teal `#45C2AE`).

## Run it

No build step. Open [`index.html`](index.html) directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Navigation

The sidebar is flat, but **Members** and **Non-Members** are sections with their own sub-tabs (like a second-level menu). A gear icon at the bottom of the sidebar opens **Settings** — the config-type screens (Automation, Integrations, Users) that staff visit rarely, kept out of the main list.

| Area | Sub-tabs / contents |
|---|---|
| **Action Center** | Computed to-do list — overdue invoices, stuck enquiries, draft content, scheduled campaigns — each with a one-click action where possible. |
| **Dashboard** | Impact tracker (training hours delivered, resource downloads, renewal rate, etc. — the board-report numbers), pipeline snapshot, renewals due, recent activity. |
| **Members** | *Pipeline* — new-member kanban: Enquiry → Qualifying → Application → Proposal/Quote → Invoice → Payment → Active. *Renewals* — a deliberately shorter pipeline (Upcoming → Invoice Sent → Renewed/Lapsed) plus a Xero billing table. *Directory* — one row per member business with category, status, owner, member-since. |
| **Non-Members** | *Contacts* — every past enquiry, training alumnus and lapsed member, with consent + subscribed flags. *Lists* — segment sizes. *Campaigns* — a campaign builder locked to non-member segments; sends only count contacts who've given consent and haven't unsubscribed. |
| **Newsletter** | The generic, all-audience campaign tool (members, non-members, or mixed) with deliverability/open/click analytics — this is the "send to everyone" equivalent. |
| **Events** / **Training** | Registration lists with a publish/unpublish toggle and a notify action. |
| **Benefits** | Lightweight CMS for what each membership tier gets — publish/unpublish, add/edit. |
| **Website** | Sub-tabs for Guides, Blog, Banners, Awards, Initiatives, Impact Updates, Careers (same add/edit/publish pattern as Benefits) plus **Handbook** — an access-point stub, since the handbook itself is a separate system. |
| **Document Generator** | Editable mail-merge templates (Membership Certificate, Welcome Letter, etc.) and a generate flow that merges a chosen company's data into the template text. |
| **Settings (gear)** | Automation Settings (the onboarding/renewal/offboarding email + workflow config — every company's drawer checks its own progress against this), Integrations, User Management. |

**Company drawer**: click any company anywhere to open it. It shows overview, people, Xero billing (if applicable), Mailchimp segments, **that company's own lifecycle-comms checklist** (which of the Automation Settings steps are sent / next up / upcoming / paused for *this* company specifically), and its activity timeline.

## Data model (what the real build persists)

```
Company (one per member business)
  ├─ memberState: "prospect" | "active" | "lapsed"
  ├─ onboardingStage: set while a prospect (drives the new-member pipeline)
  ├─ renewalStage: null | "invoice_sent" | "renewed" | "lapsed" (renewal pipeline)
  ├─ category, owner, source, joinDate ("member since"), renewalDate
  ├─ xero:      { contactId, invoiceNo, invoiceStatus, paymentStatus, amount }
  ├─ mailchimp: { synced, segments[] }
  ├─ people[]:  { name, role, email, phone, primary }
  └─ timeline[]: append-only activity log (emails sent, stage changes, invoices, payments)
```

`memberState` + `onboardingStage`/`renewalStage` drive everything downstream: which lifecycle email is next (checked against `WORKFLOWS` in `data.js`), whether an invoice can be raised, which Mailchimp segment a company belongs to, and what shows in the Companies directory and Non-Member lists (a company that lapses automatically appears under Non-Members → Former Members).

## Replacing mock data with real integrations

- **Leads** — point the website's enquiry form directly at the CRM's lead-create endpoint with an owner-assignment rule, instead of a Google Form + manual Asana copy.
- **Xero** — "Raise invoice" becomes a real call to the Xero API against the company's Xero contact; payment status is written back via a Xero webhook (mocked here with "Mark paid").
- **Mailchimp** — segments sync on every stage change via the Mailchimp API; campaign sends and their analytics (delivered/open/click) come back from real Mailchimp reporting instead of the simulated numbers here. Consent/unsubscribe flags should be the source of truth Mailchimp itself enforces, not just a CRM-side filter.
- **Website** — Website tab content (Guides/Blog/Banners/etc.) publishes through the site's actual CMS/API instead of local state; Events/Training publish toggles do the same.
- **Digital Handbook** — this prototype only stubs the access point (`HANDBOOK` in `data.js`); the real handbook is a separate system being built independently.
- **Document Generator** — template merge fields (`{{company_name}}`, `{{member_since}}`, etc.) map onto real CRM fields; a real build would render to PDF rather than an on-screen preview.

## Structure

```
index.html        Screen layout / containers (sidebar + sections + sub-tabs)
css/styles.css     AMCA-branded styling, incl. sidebar, subtabs, cards, kanban
js/data.js         Mock companies, people, workflows, benefits, CMS content, campaigns
js/app.js          Rendering + interactivity (state lives in memory only)
```
