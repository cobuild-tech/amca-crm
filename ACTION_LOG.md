# AMCA CRM Prototype — Action Log

A running record of decisions made and what's still open, so nothing gets lost between rounds of feedback. Newest first.

## Open action pointers (need your input or are blocked)

- **Handbook screens** — I couldn't inspect `amca-dev.aetheragents.ai/tenant-admin` directly; it's behind SSO login I don't have credentials for. Everything built so far (Document Management, Feedback Analysis, Usage) is from the screenshots you shared. If you log in on your end, share what the Handbook edit/approval screens look like and I'll match them the same way.
- **Document Generator submission source** — the review queue (Awaiting review / Published) is now display-only seed data; there's no in-app way to submit a new SWMS for review (matching the reference, which also doesn't show a "create" flow — presumably documents enter the queue from elsewhere upstream). Confirm that's the right scope, or tell me where submissions should come from.
- **Email template management** location — added inline under the campaign composer ("Manage templates"). Document templates (SWMS) live under Settings instead, per your instruction. Confirm both are where you'd expect.

## Round 6 — layout, Non-Members reorder, template CRUD, training sync split, SWMS pivot

- Pipeline board columns now size to their actual card count instead of a flat forced height, and the horizontal scrollbar is hidden (still scrollable, just not visually ugly).
- Added 4 more prospect companies so the new-member funnel shows a realistic decreasing shape (3→2→2→1→1→1) instead of "1" in every stage.
- Non-Members: **Campaigns is now the first tab**; the composer moved into a right-side sliding panel ("+ New Campaign") so the analytics summary and campaign list are visible immediately without scrolling past a form.
- Added full CRUD for **email templates** (create/edit/delete) inline in the campaign composer — previously selection-only.
- Training now syncs from **Moodle** (e-learning) and **VetTrak** (RTO enrolments) as two separate actions; it no longer uses CEvent (Events still does).
- **Document Generator rebuilt**: removed the Templates panel and the "Generate a document" flow entirely from that screen. It is now purely the Awaiting Review → Published workflow, matching your reference screenshots. Templates moved to **Settings → Document Templates**, with full add/edit/delete.
- Content pivoted away from "Membership Certificate" — Document Generator is a **SWMS (Safe Work Method Statement) library** (HVAC Equipment Installation, Confined Space Entry, Refrigerant Handling, Working at Heights), not a membership-document tool.

## Round 5 — real Document Management + Feedback Analysis

- Document Generator rebuilt with a real Awaiting Review → Published workflow (version history, edited-by/approved-by), matching your reference product's Document Management screen.
- Added a **Feedback Analysis** screen (date-range chips, Total Questions/Feedback/Positive/Negative/Satisfaction/With Comments, Recent feedback, Top 10 topics/sources).
- Users → Usage split into **AI Assist Usage** and **Document Generator Usage**, each with Organizations/Users/Projects stats and a bar chart.
- Handbook, Document Generator and Feedback Analysis promoted to top-level nav in both views (previously buried under Members, or missing from Unified entirely).

## Round 4 — real staff, task filtering, view toggle naming

- Replaced all fictional users with the actual AMCA national office team (from amca.com.au/Public/About/Team.aspx): Ben Hawkins, Michael Hamilton, Marie Neisler, Brooke Alexander, Andrew Kendt, Brendan Keogh, John Castillo, Kalli Ercegovic, Ben Fogerty, Brendan Upton.
- Company ownership and Action Center assignees reassigned to match real roles (membership → Michael Hamilton/Marie Neisler by tier; billing → Brooke Alexander; benefit review routed by category).
- Action Center defaults to **"My tasks"** (signed in as Michael Hamilton) with an "All tasks" toggle; every item now has a due date.
- View toggle relabelled **"Unified View"** (everything together — CRM + Platform + Web) / **"Web View"** (website + limited platform), replacing the earlier "CRM View"/"Platform View" framing. Organizations and Users are visible in both.

## Round 3 — Platform View toggle

- Added a second, stripped-down navigation alongside the full CRM: Organizations, Users, limited Events/Training/Benefits (no member targeting), Website, Handbook, Document Generator — as a fallback pitch in case the full CRM/membership scope isn't approved.
- The original CRM view was left untouched apart from adding a Usage sub-tab to User Management.

## Round 1–2 — the base prototype

- Split the membership pipeline into New Member (Enquiry → Qualifying → Application → Proposal/Quote → Invoice → Payment → Active) and a shorter Renewal pipeline (Upcoming → Invoice Sent → Renewed/Lapsed).
- Added Action Center, Impact tracker, Benefits/Website/Non-member CMS, consent-aware campaigns, subscriber management, and the Automation Settings config for lifecycle emails.
