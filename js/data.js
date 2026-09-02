/* ==========================================================================
   AMCA CRM — Mock Data Layer
   ---------------------------------------------------------------------------
   Everything here is illustrative sample data for the interactive prototype.
   In the real build this is replaced by API calls into the CRM backend
   (companies/people/membership from the CRM DB, invoice + payment status
   from Xero, list/segment membership + campaign analytics from Mailchimp).
   "Today" for all relative-date logic in this prototype is 2026-09-01.
   ========================================================================== */

const TODAY = "2026-09-01";

// New-member pipeline: Enquiry and Qualifying are pre-existing qualification
// steps; Application → Proposal/Quote → Invoice → Payment is the sales/finance
// sequence, ending in Active membership (which then leaves this board).
const ONBOARDING_STAGES = [
  { id: "enquiry", label: "Enquiry" },
  { id: "qualifying", label: "Qualifying" },
  { id: "application", label: "Application Submitted" },
  { id: "proposal", label: "Proposal / Quote Sent" },
  { id: "invoice", label: "Invoice Raised" },
  { id: "payment", label: "Payment Received" },
];

// Renewal pipeline is deliberately shorter than onboarding — an existing
// member doesn't re-qualify or get re-proposed to, they just get invoiced.
const RENEWAL_STAGES = [
  { id: "upcoming", label: "Renewal Upcoming" },
  { id: "invoice_sent", label: "Renewal Invoice Sent" },
  { id: "renewed", label: "Renewed" },
  { id: "lapsed", label: "Lapsed" },
];

const MEMBER_CATEGORIES = [
  "Contractor Member",
  "Corporate Member",
  "Associate Member",
  "Affiliate Member",
];

const OWNERS = ["Michael Hamilton", "Marie Neisler"];

const ROLE_TYPES = [
  "Primary Contact",
  "Billing Contact",
  "Technical Representative",
  "Site Manager",
  "Delegate",
];

// ---------------------------------------------------------------------------
// Companies (one record per member business) — the core CRM object.
// memberState: "prospect" | "active" | "lapsed"
// onboardingStage: set while memberState === "prospect"
// renewalStage: null, or "invoice_sent" / "renewed" / "lapsed" once a renewal
//   cycle has started — "upcoming" is derived automatically (see app.js)
//   for any active company inside the 90-day renewal window.
// ---------------------------------------------------------------------------
const COMPANIES = [
  {
    id: "c01",
    name: "Coastal Air Solutions Pty Ltd",
    abn: "45 123 456 789",
    category: "Contractor Member",
    memberState: "active",
    onboardingStage: null,
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: "2019-03-12",
    renewalDate: "2026-09-30",
    website: "coastalair.com.au",
    address: "14 Marina Drive, Southport QLD",
    xero: { contactId: "XERO-CT-1042", invoiceNo: "INV-1042", invoiceStatus: "not_raised", paymentStatus: "—", amount: 1650 },
    mailchimp: { synced: true, segments: ["Active Members", "QLD Region", "HVAC Contractors"] },
    people: [
      { id: "p01", name: "Michael Doyle", role: "Primary Contact", email: "michael@coastalair.com.au", phone: "0412 334 556", primary: true },
      { id: "p02", name: "Renee Doyle", role: "Billing Contact", email: "accounts@coastalair.com.au", phone: "0412 334 998", primary: false },
    ],
    timeline: [
      { date: "2026-08-02", type: "email", label: "Renewal reminder (60 days) sent" },
      { date: "2025-10-04", type: "policy", label: "Sent: F-Gas Regulation Update guide" },
      { date: "2019-03-12", type: "milestone", label: "Became a member" },
    ],
  },
  {
    id: "c02",
    name: "Meridian HVAC Group",
    abn: "88 234 567 891",
    category: "Corporate Member",
    memberState: "active",
    onboardingStage: null,
    renewalStage: null,
    owner: "Michael Hamilton",
    source: "Referral — industry event",
    joinDate: "2016-07-01",
    renewalDate: "2027-07-01",
    website: "meridianhvac.com.au",
    address: "220 Industrial Ave, Dandenong VIC",
    xero: { contactId: "XERO-CT-0871", invoiceNo: "INV-0871", invoiceStatus: "paid", paymentStatus: "Paid in full", amount: 3200 },
    mailchimp: { synced: true, segments: ["Active Members", "VIC Region", "Corporate Tier"] },
    people: [
      { id: "p03", name: "Angela Wu", role: "Primary Contact", email: "angela.wu@meridianhvac.com.au", phone: "0398 221 004", primary: true },
      { id: "p04", name: "Jason Petrov", role: "Technical Representative", email: "jason@meridianhvac.com.au", phone: "0398 221 077", primary: false },
      { id: "p05", name: "Linda Marsh", role: "Site Manager", email: "linda@meridianhvac.com.au", phone: "0398 221 090", primary: false },
    ],
    timeline: [
      { date: "2026-06-18", type: "benefit", label: "Benefits usage: Technical helpline (2 calls)" },
      { date: "2026-05-01", type: "policy", label: "Sent: 2026 Wage Award changes bulletin" },
      { date: "2016-07-01", type: "milestone", label: "Became a member" },
    ],
  },
  {
    id: "c03",
    name: "BreezeTech Industries",
    abn: "12 345 678 902",
    category: "Associate Member",
    memberState: "active",
    onboardingStage: null,
    renewalStage: "invoice_sent",
    owner: "Michael Hamilton",
    source: "Website enquiry form",
    joinDate: "2022-09-30",
    renewalDate: "2026-09-15",
    website: "breezetech.com.au",
    address: "5 Enterprise Court, Bibra Lake WA",
    xero: { contactId: "XERO-CT-1290", invoiceNo: "INV-1301", invoiceStatus: "sent", paymentStatus: "Awaiting payment", amount: 980 },
    mailchimp: { synced: true, segments: ["Active Members", "WA Region"] },
    people: [
      { id: "p06", name: "Farid Hossain", role: "Primary Contact", email: "farid@breezetech.com.au", phone: "0433 771 200", primary: true },
    ],
    timeline: [
      { date: "2026-08-15", type: "invoice", label: "Renewal invoice INV-1301 raised in Xero" },
      { date: "2026-07-15", type: "email", label: "Renewal reminder (60 days) sent" },
      { date: "2022-09-30", type: "milestone", label: "Became a member" },
    ],
  },
  {
    id: "c04",
    name: "Thermex Mechanical Services",
    abn: "77 456 123 890",
    category: "Contractor Member",
    memberState: "lapsed",
    onboardingStage: null,
    renewalStage: "lapsed",
    owner: "Marie Neisler",
    source: "Manual entry (legacy)",
    joinDate: "2014-01-20",
    renewalDate: "2025-11-01",
    website: "thermexmech.com.au",
    address: "9 Foundry Rd, Wingfield SA",
    xero: { contactId: "XERO-CT-0456", invoiceNo: "INV-0980", invoiceStatus: "overdue", paymentStatus: "Overdue 90+ days", amount: 1650 },
    mailchimp: { synced: true, segments: ["Lapsed Members", "SA Region"] },
    people: [
      { id: "p07", name: "Colin Baxter", role: "Primary Contact", email: "colin@thermexmech.com.au", phone: "0417 552 331", primary: true },
    ],
    timeline: [
      { date: "2025-12-02", type: "status", label: "Marked Lapsed — non-payment" },
      { date: "2025-11-01", type: "email", label: "Final renewal notice sent" },
      { date: "2014-01-20", type: "milestone", label: "Became a member" },
    ],
  },
  {
    id: "c05",
    name: "Austral Ventilation Co",
    abn: "33 998 214 771",
    category: "Contractor Member",
    memberState: "prospect",
    onboardingStage: "enquiry",
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: null,
    renewalDate: null,
    website: "australventilation.com.au",
    address: "2 Riverside Pl, Newcastle NSW",
    xero: null,
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p08", name: "Grace Kim", role: "Primary Contact", email: "grace@australventilation.com.au", phone: "0402 118 664", primary: true },
    ],
    timeline: [
      { date: "2026-08-27", type: "email", label: "Enquiry received — auto-acknowledgement sent" },
      { date: "2026-08-27", type: "lead", label: "Enquiry submitted via website form, owner assigned: Marie Neisler" },
    ],
  },
  {
    id: "c06",
    name: "Highline Mechanical",
    abn: "60 112 887 345",
    category: "Contractor Member",
    memberState: "prospect",
    onboardingStage: "application",
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: null,
    renewalDate: null,
    website: "highlinemech.com.au",
    address: "31 Grange Rd, Fyshwick ACT",
    xero: null,
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p09", name: "David Osei", role: "Primary Contact", email: "david@highlinemech.com.au", phone: "0421 990 214", primary: true },
    ],
    timeline: [
      { date: "2026-08-20", type: "application", label: "Membership application submitted for review" },
      { date: "2026-08-05", type: "status", label: "Qualified — moved to Application stage" },
      { date: "2026-07-29", type: "lead", label: "Enquiry submitted via website form, owner assigned: Marie Neisler" },
    ],
  },
  {
    id: "c07",
    name: "Southbank Cooling & Refrigeration",
    abn: "19 887 654 321",
    category: "Corporate Member",
    memberState: "prospect",
    onboardingStage: "qualifying",
    renewalStage: null,
    owner: "Michael Hamilton",
    source: "Referral — member introduction",
    joinDate: null,
    renewalDate: null,
    website: "southbankcooling.com.au",
    address: "88 Riverside Quay, Southbank VIC",
    xero: null,
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p10", name: "Elena Popescu", role: "Primary Contact", email: "elena@southbankcooling.com.au", phone: "0455 220 810", primary: true },
    ],
    timeline: [
      { date: "2026-08-24", type: "call", label: "Discovery call completed — eligibility confirmed" },
      { date: "2026-08-11", type: "lead", label: "Enquiry submitted via referral, owner assigned: Michael Hamilton" },
    ],
  },
  {
    id: "c08",
    name: "Vantage Air Pty Ltd",
    abn: "24 665 129 887",
    category: "Contractor Member",
    memberState: "active",
    onboardingStage: null,
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: "2021-02-18",
    renewalDate: "2027-02-18",
    website: "vantageair.com.au",
    address: "12 Frontier St, Perth WA",
    xero: { contactId: "XERO-CT-1177", invoiceNo: "INV-1177", invoiceStatus: "paid", paymentStatus: "Paid in full", amount: 1650 },
    mailchimp: { synced: true, segments: ["Active Members", "WA Region"] },
    people: [
      { id: "p11", name: "Nathan Reeve", role: "Primary Contact", email: "nathan@vantageair.com.au", phone: "0409 887 213", primary: true },
      { id: "p12", name: "Chloe Simmons", role: "Delegate", email: "chloe@vantageair.com.au", phone: "0409 887 240", primary: false },
    ],
    timeline: [
      { date: "2026-04-10", type: "policy", label: "Sent: New refrigerant handling licence guide" },
      { date: "2021-02-18", type: "milestone", label: "Became a member" },
    ],
  },
  {
    id: "c09",
    name: "Northern Rivers Air Systems",
    abn: "51 220 774 903",
    category: "Contractor Member",
    memberState: "prospect",
    onboardingStage: "proposal",
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: null,
    renewalDate: null,
    website: "northernriversair.com.au",
    address: "7 Union St, Lismore NSW",
    xero: null,
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p13", name: "Wayne Kelly", role: "Primary Contact", email: "wayne@northernriversair.com.au", phone: "0428 664 210", primary: true },
    ],
    timeline: [
      { date: "2026-08-29", type: "proposal", label: "Membership proposal & quote sent ($1,650/yr, Contractor tier)" },
      { date: "2026-08-22", type: "application", label: "Membership application submitted for review" },
      { date: "2026-08-10", type: "lead", label: "Enquiry submitted via website form, owner assigned: Marie Neisler" },
    ],
  },
  {
    id: "c10",
    name: "Ridgeback Mechanical Pty Ltd",
    abn: "38 902 441 665",
    category: "Contractor Member",
    memberState: "prospect",
    onboardingStage: "invoice",
    renewalStage: null,
    owner: "Marie Neisler",
    source: "Website enquiry form",
    joinDate: null,
    renewalDate: null,
    website: "ridgebackmech.com.au",
    address: "18 Traders Way, Toowoomba QLD",
    xero: { contactId: "XERO-CT-1408", invoiceNo: "INV-1408", invoiceStatus: "sent", paymentStatus: "Awaiting payment", amount: 1650 },
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p14", name: "Simone Carr", role: "Primary Contact", email: "simone@ridgebackmech.com.au", phone: "0447 118 902", primary: true },
    ],
    timeline: [
      { date: "2026-08-30", type: "invoice", label: "Membership invoice INV-1408 raised in Xero ($1,650)" },
      { date: "2026-08-25", type: "proposal", label: "Proposal accepted" },
      { date: "2026-08-04", type: "lead", label: "Enquiry submitted via website form, owner assigned: Marie Neisler" },
    ],
  },
  {
    id: "c11",
    name: "Delta Cooling Co",
    abn: "62 771 330 214",
    category: "Associate Member",
    memberState: "prospect",
    onboardingStage: "payment",
    renewalStage: null,
    owner: "Michael Hamilton",
    source: "Referral — member introduction",
    joinDate: null,
    renewalDate: null,
    website: "deltacooling.com.au",
    address: "3 Hargreaves St, Bendigo VIC",
    xero: { contactId: "XERO-CT-1390", invoiceNo: "INV-1390", invoiceStatus: "paid", paymentStatus: "Paid in full", amount: 980 },
    mailchimp: { synced: false, segments: [] },
    people: [
      { id: "p15", name: "Marcus Ihaka", role: "Primary Contact", email: "marcus@deltacooling.com.au", phone: "0433 208 771", primary: true },
    ],
    timeline: [
      { date: "2026-08-31", type: "invoice", label: "Payment received for INV-1390 — finalising onboarding" },
      { date: "2026-08-19", type: "invoice", label: "Invoice INV-1390 raised in Xero" },
      { date: "2026-07-30", type: "lead", label: "Enquiry submitted via referral, owner assigned: Michael Hamilton" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Non-members — past enquiries that didn't convert, plus event/training-only
// contacts. Kept in the same database so re-engagement is possible. Lapsed
// member companies (see COMPANIES above) also feed the "Former Members" list.
// A contact can belong to zero, one, or several lists (see NON_MEMBER_LISTS),
// assignable at creation, on bulk upload, or later from the Contacts tab.
// ---------------------------------------------------------------------------
const NON_MEMBERS = [
  { id: "n01", name: "Ridgeline Air Pty Ltd", contact: "Owen Marsh", email: "owen@ridgelineair.com.au", history: "Enquired 2024, did not proceed", lastTouch: "Attended: Refrigerant Safety Workshop, Jun 2026", lists: ["l1"], consent: true, unsubscribed: false },
  { id: "n02", name: "Ferris Industrial Cooling", contact: "Beth Ferris", email: "beth@ferriscooling.com.au", history: "Member 2015–2023, lapsed", lastTouch: "Attended: Annual HVAC Conference 2025", lists: ["l3"], consent: true, unsubscribed: false },
  { id: "n03", name: "Kade Nguyen (Individual)", contact: "Kade Nguyen", email: "kade.nguyen@gmail.com", history: "Completed Cert IV Certification, 2025", lists: ["l2"], lastTouch: "Awarded: Apprentice of the Year 2025", consent: true, unsubscribed: false },
  { id: "n04", name: "Bluewater Mechanical Services", contact: "Sam Ionescu", email: "sam@bluewatermech.com.au", history: "Enquired 2025, budget deferred", lastTouch: "Registered: Design Standards Update webinar", lists: ["l1"], consent: false, unsubscribed: false },
  { id: "n05", name: "Outback Refrigeration", contact: "Priya Chandra", email: "priya@outbackrefrig.com.au", history: "Attended 3 training courses since 2023", lastTouch: "Attended: Confined Spaces Safety Training", lists: ["l2", "l4"], consent: true, unsubscribed: false },
  { id: "n06", name: "Harbourside Air & Electrical", contact: "Ngaire Fenwick", email: "ngaire@harboursideair.com.au", history: "Attended Annual Conference 2025 & 2026", lists: ["l4"], lastTouch: "Attended: Annual HVAC Conference 2026", consent: true, unsubscribed: true },
];

// A mutable registry — staff can create new lists from the Lists tab.
const NON_MEMBER_LISTS = [
  { id: "l1", name: "Past Enquiries", description: "Enquired but didn't proceed to membership." },
  { id: "l2", name: "Training Alumni", description: "Completed a certification or short course, never joined." },
  { id: "l3", name: "Former Members", description: "Lapsed or resigned members — combined with companies marked Lapsed." },
  { id: "l4", name: "Event Attendees", description: "Attended an AMCA event or webinar without joining." },
];

// ---------------------------------------------------------------------------
// Site subscribers — newsletter-only signups (footer form, guide downloads,
// careers page) who are not CRM contacts of any other kind.
// ---------------------------------------------------------------------------
const SUBSCRIBERS = [
  { id: "s1", name: "James Harkness", email: "j.harkness@gmail.com", source: "Website footer signup", subscribedDate: "2026-07-02", unsubscribed: false },
  { id: "s2", name: "Maria O'Connor", email: "m.oconnor@outlook.com", source: "Guide download", subscribedDate: "2026-06-15", unsubscribed: false },
  { id: "s3", name: "Dev Singh", email: "d.singh@bigpond.com", source: "Website footer signup", subscribedDate: "2026-05-20", unsubscribed: true },
  { id: "s4", name: "Chris Wallace", email: "c.wallace@gmail.com", source: "Careers page signup", subscribedDate: "2026-08-11", unsubscribed: false },
];

// The public unsubscribe-confirmation page copy, editable from Newsletter.
const UNSUBSCRIBE_PAGE = {
  heading: "You've been unsubscribed",
  body: "You won't receive AMCA newsletter emails going forward. You may still receive service emails related to your membership, events you've registered for, or training you've enrolled in.",
};

// ---------------------------------------------------------------------------
// Events & Training — kept as separate content types with separate tabs.
// ---------------------------------------------------------------------------
const EVENTS = [
  { id: "e01", name: "Annual HVAC Conference 2026", date: "2026-11-12", format: "In-person", registrations: 214, audience: "Members + Non-members", published: true },
  { id: "e02", name: "F-Gas Regulation Update Webinar", date: "2026-09-24", format: "Webinar", registrations: 88, audience: "All contacts", published: true },
  { id: "e03", name: "Design Standards Update Webinar", date: "2026-09-05", format: "Webinar", registrations: 63, audience: "All contacts", published: true },
  { id: "e04", name: "State Chapter Networking Night — QLD", date: "2026-09-19", format: "In-person", registrations: 41, audience: "Members", published: false },
];

const TRAININGS = [
  { id: "t01", name: "Cert IV in HVAC/R — Spring Intake", date: "2026-10-06", format: "Certification", registrations: 31, audience: "Non-members (career pathway)", hours: 120, published: true },
  { id: "t02", name: "Confined Spaces Safety Training", date: "2026-09-18", format: "Short course", registrations: 46, audience: "All contacts", hours: 8, published: true },
  { id: "t03", name: "Refrigerant Handling Licence Refresher", date: "2026-09-11", format: "Short course", registrations: 37, audience: "Members", hours: 6, published: true },
  { id: "t04", name: "Apprentice Skills Bootcamp", date: "2026-10-20", format: "Certification", registrations: 22, audience: "Non-members (career pathway)", hours: 40, published: false },
];

// Events/training are normally synced from CEvent (see INTEGRATIONS); these
// are "new" records waiting to be pulled in by the Sync now action, so the
// sync flow has something to demonstrate. Manual creation stays available too.
const EVENTS_PENDING_SYNC = [
  { id: "e05", name: "Regional Roadshow — Newcastle", date: "2026-10-02", format: "In-person", registrations: 0, audience: "Members + Non-members", published: false },
];
const TRAININGS_PENDING_SYNC = [
  { id: "t05", name: "Cert III Pathway Info Session", date: "2026-10-15", format: "Info session", registrations: 0, audience: "Non-members (career pathway)", hours: 2, published: false },
];

// ---------------------------------------------------------------------------
// Benefits CMS — the content members are told about in the benefits email
// and see on the member portal.
//
// Category drives what's required before a benefit can be published:
//  - "Events" / "Training"   -> discountRate (the member discount/rate) must
//    be set — these ride on top of a real event/training run by AMCA itself.
//  - "Third-Party Discount"  -> stepsToAvail, eligibility and discountAmount
//    must all be set — an outside partner's offer needs to be unambiguous
//    about how a member actually claims it.
//  - anything else           -> description alone is enough.
// ---------------------------------------------------------------------------
const BENEFIT_CATEGORIES = ["Technical Support", "Third-Party Discount", "Resources", "Training", "Events", "Governance", "Member Support"];

const BENEFITS = [
  { id: "b01", title: "Technical Helpline", category: "Technical Support", description: "Unlimited phone & email access to AMCA's technical advisory team for code compliance and design queries.", tiers: ["Contractor Member", "Corporate Member"], status: "Published", updated: "2026-06-10" },
  { id: "b02", title: "Testo Member Pricing", category: "Third-Party Discount", description: "Ongoing discount on Testo HVAC/R diagnostic tools.", stepsToAvail: "Show your AMCA membership number at checkout on testo.com.au, or quote it by phone.", eligibility: "All current financial members.", discountAmount: "15% off list price", tiers: ["Contractor Member", "Corporate Member", "Associate Member"], status: "Published", updated: "2026-08-02" },
  { id: "b03", title: "Technical Standards Library", category: "Resources", description: "Full access to AMCA's design and installation standards library, updated as codes change.", tiers: ["Contractor Member", "Corporate Member"], status: "Published", updated: "2026-04-18" },
  { id: "b04", title: "Training Course Member Pricing", category: "Training", description: "Member pricing on all certification and short courses.", discountRate: "20% off all certification and short courses", tiers: ["Contractor Member", "Corporate Member", "Associate Member", "Affiliate Member"], status: "Published", updated: "2026-07-22" },
  { id: "b05", title: "Voting Rights", category: "Governance", description: "Vote at the AGM and in board elections.", tiers: ["Contractor Member", "Corporate Member"], status: "Published", updated: "2025-11-01" },
  { id: "b06", title: "Wellbeing Support Line", category: "Member Support", description: "Confidential counselling and wellbeing support for members and their staff.", tiers: ["Contractor Member", "Corporate Member", "Associate Member"], status: "Draft", updated: "2026-08-28" },
  { id: "b07", title: "Annual HVAC Conference — Member Rate", category: "Events", description: "Member registration pricing for the Annual HVAC Conference.", discountRate: "30% off standard registration", tiers: ["Contractor Member", "Corporate Member", "Associate Member", "Affiliate Member"], status: "Published", updated: "2026-08-20" },
];

// ---------------------------------------------------------------------------
// Automation Settings — the config screen for lifecycle email templates &
// workflow triggers, grouped by onboarding / renewal / offboarding.
// Each company's drawer shows its live progress against these same steps.
// ---------------------------------------------------------------------------
const WORKFLOWS = {
  onboarding: [
    { id: "ob1", name: "Enquiry acknowledgement", stageGate: "enquiry", trigger: "Enquiry submitted via website", delay: "Immediate", audience: "New lead", subject: "Thanks for your enquiry — AMCA Australia", active: true },
    { id: "ob2", name: "Application received", stageGate: "application", trigger: "Application submitted", delay: "Immediate", audience: "Applicant", subject: "We've received your membership application", active: true },
    { id: "ob3", name: "Proposal / quote sent", stageGate: "proposal", trigger: "Proposal issued", delay: "Immediate", audience: "Applicant", subject: "Your AMCA membership proposal", active: true },
    { id: "ob4", name: "Invoice issued", stageGate: "invoice", trigger: "Invoice raised in Xero", delay: "Immediate", audience: "Applicant", subject: "Your AMCA membership invoice", active: true },
    { id: "ob5", name: "Welcome pack", stageGate: "payment", trigger: "Payment received", delay: "Immediate", audience: "New member", subject: "Welcome to AMCA — here's what happens next", active: true },
    { id: "ob6", name: "Benefits walkthrough", stageGate: "active+7", trigger: "After welcome pack", delay: "+7 days", audience: "New member", subject: "Getting the most from your AMCA membership", active: true },
    { id: "ob7", name: "New member spotlight", stageGate: "active+30", trigger: "After welcome pack", delay: "+30 days", audience: "New member", subject: "Tell us about your business — new member spotlight", active: false },
  ],
  renewal: [
    { id: "rn1", name: "Renewal reminder (60 days)", stageGate: "upcoming", trigger: "60 days before renewal date", delay: "-60 days", audience: "Renewal due", subject: "Your AMCA membership renews in 60 days", active: true },
    { id: "rn2", name: "Renewal reminder (30 days)", stageGate: "upcoming", trigger: "30 days before renewal date", delay: "-30 days", audience: "Renewal due", subject: "Renewal reminder — 30 days to go", active: true },
    { id: "rn3", name: "Renewal invoice issued", stageGate: "invoice_sent", trigger: "Renewal invoice raised in Xero", delay: "Immediate", audience: "Renewal due", subject: "Your AMCA renewal invoice is ready", active: true },
    { id: "rn4", name: "Renewal reminder (7 days)", stageGate: "invoice_sent", trigger: "7 days before renewal date, unpaid", delay: "-7 days", audience: "Renewal due", subject: "Final reminder — your membership renews in 7 days", active: true },
    { id: "rn5", name: "Renewal confirmation", stageGate: "renewed", trigger: "Payment received in Xero", delay: "Immediate", audience: "Renewed member", subject: "You're all set — renewal confirmed", active: true },
  ],
  offboarding: [
    { id: "of1", name: "Overdue notice", stageGate: "overdue7", trigger: "Invoice 7 days overdue", delay: "+7 days", audience: "Unpaid renewal", subject: "We haven't received your renewal payment", active: true },
    { id: "of2", name: "Final notice", stageGate: "overdue30", trigger: "Invoice 30 days overdue", delay: "+30 days", audience: "Unpaid renewal", subject: "Final notice — your AMCA membership will lapse", active: true },
    { id: "of3", name: "Lapse confirmation", stageGate: "lapsed", trigger: "Marked lapsed", delay: "Immediate", audience: "Lapsed member", subject: "We've missed you — your AMCA membership has lapsed", active: true },
    { id: "of4", name: "Win-back offer", stageGate: "lapsed+30", trigger: "30 days after lapse", delay: "+30 days", audience: "Lapsed member", subject: "Come back to AMCA — here's what you're missing", active: false },
  ],
};

// ---------------------------------------------------------------------------
// Campaigns — generic, all-audience sends (as distinct from the automated
// per-company lifecycle emails above), with Mailchimp-style analytics.
// "Mixed" audience = some combination of Members + Non-member lists + Site
// Subscribers, selected per send (see the Newsletter builder in app.js).
// ---------------------------------------------------------------------------
const CAMPAIGNS = [
  { id: "cm1", name: "Q3 Benefits Spotlight", audience: "Members", segment: "All Active Members", sentDate: "2026-09-01", recipients: 0, delivered: 0, deliveredRate: null, openRate: null, clickRate: null, unsubscribes: null, status: "Scheduled", previewText: "New this quarter: three benefits worth a second look", bodyHtml: "<h2>Q3 Benefits Spotlight</h2><p>Here's what's new in your membership this quarter.</p>" },
  { id: "cm2", name: "Spring Training Calendar 2026", audience: "Non-members", segment: "Training Alumni", sentDate: "2026-08-18", recipients: 412, delivered: 404, deliveredRate: 98, openRate: 46, clickRate: 12, unsubscribes: 2, status: "Sent", previewText: "New certification dates just announced", bodyHtml: "<h2>Spring Training Calendar</h2><p>New dates are open for booking.</p>" },
  { id: "cm3", name: "New F-Gas Regulation Alert", audience: "Members", segment: "All Active Members", sentDate: "2026-08-01", recipients: 1860, delivered: 1829, deliveredRate: 98, openRate: 61, clickRate: 24, unsubscribes: 3, status: "Sent", previewText: "What changed, and what you need to do", bodyHtml: "<h2>F-Gas Regulation Update</h2><p>Here's what changed and what you need to do.</p>" },
  { id: "cm4", name: "Annual HVAC Conference — Save the Date", audience: "Mixed", segment: "All Contacts", sentDate: "2026-07-20", recipients: 2184, delivered: 2140, deliveredRate: 98, openRate: 38, clickRate: 9, unsubscribes: 5, status: "Sent", previewText: "12 November — mark your calendar", previewLists: ["l1", "l2", "l3", "l4"], bodyHtml: "<h2>Save the Date</h2><p>Join us on 12 November for the Annual HVAC Conference.</p>" },
  { id: "cm5", name: "Win-back: We've missed you", audience: "Non-members", segment: "Former Members", sentDate: "2026-07-05", recipients: 96, delivered: 93, deliveredRate: 97, openRate: 29, clickRate: 6, unsubscribes: 1, status: "Sent", previewText: "Here's what you're missing", bodyHtml: "<h2>We've missed you</h2><p>Come back and see what's new at AMCA.</p>" },
  { id: "cm6", name: "Apprentice of the Year — Nominations Open", audience: "Mixed", segment: "All Contacts", sentDate: "2026-06-14", recipients: 2140, delivered: 2091, deliveredRate: 98, openRate: 33, clickRate: 8, unsubscribes: 4, status: "Sent", previewText: "Nominate an outstanding apprentice today", bodyHtml: "<h2>Nominations Open</h2><p>Nominate an outstanding apprentice today.</p>" },
];

// ---------------------------------------------------------------------------
// Reusable campaign templates (Newsletter → Send). "Blank" starts empty.
// ---------------------------------------------------------------------------
const EMAIL_TEMPLATES = [
  { id: "tpl0", name: "Blank", subject: "", previewText: "", bodyHtml: "<p></p>" },
  { id: "tpl1", name: "Monthly Newsletter", subject: "AMCA Monthly Update", previewText: "What's new this month at AMCA", bodyHtml: "<h2>This month at AMCA</h2><p>A round-up of news, events and resources.</p>" },
  { id: "tpl2", name: "Event Invitation", subject: "You're invited: {{event_name}}", previewText: "Join us — registration is open", bodyHtml: "<h2>You're invited</h2><p>Join us for {{event_name}}. Registration is open now.</p>" },
  { id: "tpl3", name: "Training Announcement", subject: "New training dates just announced", previewText: "Book your place before spots fill up", bodyHtml: "<h2>New training dates</h2><p>New course dates are now open for booking.</p>" },
  { id: "tpl4", name: "Benefits Update", subject: "New: an updated member benefit", previewText: "See what's changed", bodyHtml: "<h2>Benefits update</h2><p>Here's what's new in your membership benefits.</p>" },
];

// ---------------------------------------------------------------------------
// Impact tracker — the numbers that go in a board report. Membership counts
// are derived live from COMPANIES/people in app.js; these are the ones that
// aren't derivable from CRM records alone.
// ---------------------------------------------------------------------------
const IMPACT_METRICS = {
  periodLabel: "FY2026, year to date (1 Sep)",
  trainingHoursDelivered: 1240,
  freeResourceHoursAccessed: 3860,
  freeResourcePdfDownloads: 5410,
  eventAttendeesYTD: 612,
  policyGuidesPublished: 18,
  renewalRate: 94,
};

// ---------------------------------------------------------------------------
// Integration status strip (Settings → Integrations)
// ---------------------------------------------------------------------------
const INTEGRATIONS = [
  { id: "xero", name: "Xero", role: "Onboarding & renewal invoices + payment status", status: "connected", lastSync: "2026-09-01 08:14" },
  { id: "mailchimp", name: "Mailchimp", role: "Contacts, segments & campaign analytics", status: "connected", lastSync: "2026-09-01 07:50" },
  { id: "website", name: "AMCA Website", role: "Login, paywall & member resources, CMS publishing", status: "connected", lastSync: "2026-09-01 08:20" },
  { id: "cevent", name: "CEvent", role: "Events & training registrations sync", status: "connected", lastSync: "2026-08-30 06:00" },
  { id: "moodle", name: "Moodle", role: "Training course sync (Platform view)", status: "connected", lastSync: "2026-08-30 06:00" },
];

// ---------------------------------------------------------------------------
// Users (Settings → User Management) — CRM seats, not member portal logins.
// ---------------------------------------------------------------------------
// Real AMCA national office staff (amca.com.au/Public/About/Team.aspx).
const USERS = [
  { id: "u1", name: "Ben Hawkins", email: "ben.hawkins@amca.com.au", role: "Chief Executive Officer", status: "Active", lastActive: "2026-09-01", chats: 28, messages: 156, documentsGenerated: 6 },
  { id: "u2", name: "Michael Hamilton", email: "michael.hamilton@amca.com.au", role: "Memberships & Partnerships", status: "Active", lastActive: "2026-09-01", chats: 41, messages: 264, documentsGenerated: 14 },
  { id: "u3", name: "Marie Neisler", email: "marie.neisler@amca.com.au", role: "Membership Services", status: "Active", lastActive: "2026-08-31", chats: 52, messages: 301, documentsGenerated: 19 },
  { id: "u4", name: "Brooke Alexander", email: "brooke.alexander@amca.com.au", role: "Finance Officer", status: "Active", lastActive: "2026-08-31", chats: 23, messages: 118, documentsGenerated: 22 },
  { id: "u5", name: "Andrew Kendt", email: "andrew.kendt@amca.com.au", role: "Corporate Services Manager", status: "Active", lastActive: "2026-08-28", chats: 14, messages: 76, documentsGenerated: 9 },
  { id: "u6", name: "Brendan Keogh", email: "brendan.keogh@amca.com.au", role: "Marketing & Communications", status: "Active", lastActive: "2026-08-31", chats: 33, messages: 189, documentsGenerated: 4 },
  { id: "u7", name: "John Castillo", email: "john.castillo@amca.com.au", role: "National Training Manager", status: "Active", lastActive: "2026-08-29", chats: 19, messages: 102, documentsGenerated: 7 },
  { id: "u8", name: "Kalli Ercegovic", email: "kalli.ercegovic@amca.com.au", role: "Training Administrator", status: "Active", lastActive: "2026-08-30", chats: 27, messages: 140, documentsGenerated: 11 },
  { id: "u9", name: "Ben Fogerty", email: "ben.fogerty@amca.com.au", role: "Technical Services", status: "Active", lastActive: "2026-08-27", chats: 12, messages: 68, documentsGenerated: 3 },
  { id: "u10", name: "Brendan Upton", email: "brendan.upton@amca.com.au", role: "BIM-MEPAUS Consultant", status: "Active", lastActive: "2026-08-25", chats: 6, messages: 31, documentsGenerated: 2 },
];

// Default logged-in user for this prototype session.
const CURRENT_USER = "Michael Hamilton";

// ---------------------------------------------------------------------------
// Organizations (Platform view only) — AMCA's state chapters, each a
// delegated sub-account with their own users.
// ---------------------------------------------------------------------------
const ORGANIZATIONS = [
  { id: "org1", name: "AMCA National", status: "Active", users: 5, createdDate: "2018-01-10" },
  { id: "org2", name: "AMCA QLD Chapter", status: "Active", users: 3, createdDate: "2019-04-22" },
  { id: "org3", name: "AMCA VIC Chapter", status: "Active", users: 2, createdDate: "2019-06-15" },
  { id: "org4", name: "AMCA WA Chapter", status: "Active", users: 1, createdDate: "2020-02-03" },
  { id: "org5", name: "AMCA NSW Chapter", status: "Invited", users: 0, createdDate: "2026-08-20" },
];

// ---------------------------------------------------------------------------
// Digital Handbook — built and maintained in a separate system; the CRM only
// needs an access/edit entry point and a sync status, not the content itself.
// ---------------------------------------------------------------------------
const HANDBOOK = {
  name: "AMCA Member Handbook",
  system: "Handbook CMS (separate system)",
  lastPublished: "2026-08-20",
  sections: 14,
  editUrl: "handbook.amca.com.au/admin",
  viewUrl: "handbook.amca.com.au",
};

// ---------------------------------------------------------------------------
// Document Generator — templates staff can edit and generate per company.
// ---------------------------------------------------------------------------
const DOC_TEMPLATES = [
  { id: "d1", name: "Membership Certificate", appliesTo: "Active members", body: "This certifies that {{company_name}} is a financial {{category}} of AMCA Australia, member since {{member_since}}.", active: true, updated: "2026-06-01" },
  { id: "d2", name: "Welcome Letter", appliesTo: "New members", body: "Dear {{primary_contact}}, welcome to AMCA Australia. {{company_name}} is now a {{category}}, effective {{member_since}}.", active: true, updated: "2026-05-12" },
  { id: "d3", name: "Renewal Invoice Cover Letter", appliesTo: "Renewal due members", body: "Dear {{primary_contact}}, please find attached your AMCA renewal invoice ({{invoice_no}}) for {{company_name}}, due {{renewal_date}}.", active: true, updated: "2026-07-30" },
  { id: "d4", name: "Compliance Statement", appliesTo: "Active members", body: "{{company_name}} ({{abn}}) is confirmed as a current {{category}} of AMCA Australia in good standing as at today's date.", active: false, updated: "2026-04-22" },
];

// Document Management workflow: a generated document sits "Awaiting review"
// until an approver publishes it; each publish bumps the version.
const DOC_REVIEWS_SEED = {
  awaiting: [
    { id: "dr1", category: "Membership Certificate", title: "Membership Certificate — Vantage Air Pty Ltd", editedBy: "Marie Neisler", submitted: "2026-08-31" },
  ],
  published: [
    { id: "dp1", category: "Welcome Letter", title: "Welcome Letter — Delta Cooling Co", editedBy: "Marie Neisler", approvedBy: "Michael Hamilton", when: "2026-08-31", version: 3 },
    { id: "dp2", category: "Welcome Letter", title: "Welcome Letter — Delta Cooling Co", editedBy: "Michael Hamilton", approvedBy: "Michael Hamilton", when: "2026-08-17", version: 2 },
    { id: "dp3", category: "Renewal Invoice Cover Letter", title: "Renewal Invoice Cover Letter — BreezeTech Industries", editedBy: "Brooke Alexander", approvedBy: "Andrew Kendt", when: "2026-08-12", version: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Feedback Analysis — usage/quality analytics for the AI-assisted tools
// (chat assist + document generator), independent of membership data.
// ---------------------------------------------------------------------------
const FEEDBACK_STATS = {
  totalQuestions: 47,
  totalFeedback: 0,
  totalPositive: 0,
  totalNegative: 0,
  withComments: 0,
  topTopics: [
    { topic: "Membership renewal", count: 14 },
    { topic: "F-Gas regulation changes", count: 9 },
    { topic: "Training course dates", count: 7 },
    { topic: "Technical helpline eligibility", count: 6 },
    { topic: "Benefits & discounts", count: 5 },
  ],
  topSources: [
    { source: "Member Handbook", count: 11 },
    { source: "F-Gas Regulation Guide", count: 8 },
    { source: "Technical Standards Library", count: 6 },
    { source: "Membership Categories page", count: 5 },
  ],
};

// Usage split by AI-assisted tool, shown under Users → Usage.
const TOOL_USAGE = {
  aiAssist: { totalUsers: 8, totalOrgs: 5, totalProjects: 23 },
  docGenerator: { totalUsers: 6, totalOrgs: 4, totalProjects: 10 },
};

// ---------------------------------------------------------------------------
// Website CMS — public-site content, separate from the operational
// Events/Training/Benefits tabs (which keep their own publish toggle).
// ---------------------------------------------------------------------------
const CMS_TYPES = [
  { key: "guides", label: "Guides" },
  { key: "blog", label: "Blog" },
  { key: "banners", label: "Banners" },
  { key: "awards", label: "Awards" },
  { key: "initiatives", label: "Initiatives" },
  { key: "impact", label: "Impact Updates" },
  { key: "careers", label: "Careers" },
];

const CMS_CONTENT = {
  guides: [
    { id: "g1", title: "Guide to the 2026 F-Gas Regulation Changes", summary: "What changed, who it affects, and the compliance deadline.", status: "Published", updated: "2026-08-10" },
    { id: "g2", title: "New Member Onboarding Guide", summary: "A step-by-step guide for newly joined contractor members.", status: "Published", updated: "2026-05-14" },
    { id: "g3", title: "2027 Design Standards Preview", summary: "Early look at the next standards revision, for member comment.", status: "Draft", updated: "2026-08-27" },
  ],
  blog: [
    { id: "bl1", title: "Why refrigerant handling licences are getting stricter", summary: "A look at the regulatory trend and what members should do now.", status: "Published", updated: "2026-08-05" },
    { id: "bl2", title: "Member spotlight: Vantage Air Pty Ltd", summary: "How a WA contractor member grew its apprentice program.", status: "Published", updated: "2026-07-18" },
  ],
  banners: [
    { id: "ba1", title: "AMCA Member Exclusive — Testo 15% off", summary: "Homepage hero banner promoting the Testo member discount.", status: "Published", updated: "2026-08-01" },
    { id: "ba2", title: "Annual HVAC Conference 2026 — Register Now", summary: "Sitewide banner counting down to the November conference.", status: "Draft", updated: "2026-08-29" },
  ],
  awards: [
    { id: "aw1", title: "Apprentice of the Year 2025 — Kade Nguyen", summary: "Awarded at the 2025 Annual Conference for outstanding apprenticeship performance.", status: "Published", updated: "2025-11-20" },
    { id: "aw2", title: "2026 Award Nominations Open", summary: "Call for nominations across all AMCA award categories.", status: "Published", updated: "2026-06-01" },
  ],
  initiatives: [
    { id: "in1", title: "Net Zero HVAC Roadmap", summary: "AMCA's industry initiative supporting the transition to low-GWP refrigerants.", status: "Published", updated: "2026-03-15" },
    { id: "in2", title: "Regional Apprentice Support Fund", summary: "New initiative subsidising apprentice training costs in regional areas.", status: "Draft", updated: "2026-08-22" },
  ],
  impact: [
    { id: "im1", title: "FY2026 Impact Report — Year to Date", summary: "Training hours delivered, resources accessed, and renewal rate this year.", status: "Published", updated: "2026-09-01" },
    { id: "im2", title: "FY2025 Impact Report", summary: "The full-year impact summary for FY2025.", status: "Published", updated: "2025-10-05" },
  ],
  careers: [
    { id: "ca1", title: "Technical Advisor — AMCA National Office", summary: "Full-time technical advisory role supporting the member helpline.", status: "Published", updated: "2026-08-15" },
    { id: "ca2", title: "Membership Coordinator (Part-time)", summary: "Supporting the membership team with onboarding and renewals.", status: "Draft", updated: "2026-08-30" },
  ],
};
