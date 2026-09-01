/* ==========================================================================
   AMCA CRM — Mock Data Layer
   ---------------------------------------------------------------------------
   Everything here is illustrative sample data for the interactive prototype.
   In the real build this is replaced by API calls into the CRM backend
   (companies/people/membership from the CRM DB, invoice + payment status
   from Xero, list/segment membership from Mailchimp).
   ========================================================================== */

const PIPELINE_STAGES = [
  { id: "enquiry", label: "Enquiry", group: "prospect" },
  { id: "qualifying", label: "Qualifying", group: "prospect" },
  { id: "application", label: "Application Submitted", group: "prospect" },
  { id: "active", label: "Member – Active", group: "member" },
  { id: "renewal_due", label: "Renewal Due", group: "member" },
  { id: "lapsed", label: "Lapsed", group: "former" },
];

const MEMBER_CATEGORIES = [
  "Contractor Member",
  "Corporate Member",
  "Associate Member",
  "Affiliate Member",
];

const OWNERS = ["Brendan Wills", "Priya Nair", "Tom Faulkner", "Sarah Iuliano"];

const ROLE_TYPES = [
  "Primary Contact",
  "Billing Contact",
  "Technical Representative",
  "Site Manager",
  "Delegate",
];

// ---------------------------------------------------------------------------
// Companies (one record per member business) — the core CRM object.
// ---------------------------------------------------------------------------
const COMPANIES = [
  {
    id: "c01",
    name: "Coastal Air Solutions Pty Ltd",
    abn: "45 123 456 789",
    category: "Contractor Member",
    stage: "renewal_due",
    owner: "Brendan Wills",
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
    stage: "active",
    owner: "Priya Nair",
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
    stage: "renewal_due",
    owner: "Tom Faulkner",
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
    stage: "lapsed",
    owner: "Sarah Iuliano",
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
    stage: "enquiry",
    owner: "Brendan Wills",
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
      { date: "2026-08-27", type: "lead", label: "Enquiry submitted via website form, owner assigned: Brendan Wills" },
    ],
  },
  {
    id: "c06",
    name: "Highline Mechanical",
    abn: "60 112 887 345",
    category: "Contractor Member",
    stage: "application",
    owner: "Priya Nair",
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
      { date: "2026-07-29", type: "lead", label: "Enquiry submitted via website form, owner assigned: Priya Nair" },
    ],
  },
  {
    id: "c07",
    name: "Southbank Cooling & Refrigeration",
    abn: "19 887 654 321",
    category: "Corporate Member",
    stage: "qualifying",
    owner: "Tom Faulkner",
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
      { date: "2026-08-11", type: "lead", label: "Enquiry submitted via referral, owner assigned: Tom Faulkner" },
    ],
  },
  {
    id: "c08",
    name: "Vantage Air Pty Ltd",
    abn: "24 665 129 887",
    category: "Contractor Member",
    stage: "active",
    owner: "Sarah Iuliano",
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
];

// ---------------------------------------------------------------------------
// Non-members — past enquiries that didn't convert, plus event/training-only
// contacts. Kept in the same database so re-engagement is possible.
// ---------------------------------------------------------------------------
const NON_MEMBERS = [
  { id: "n01", name: "Ridgeline Air Pty Ltd", contact: "Owen Marsh", email: "owen@ridgelineair.com.au", history: "Enquired 2024, did not proceed", lastTouch: "Attended: Refrigerant Safety Workshop, Jun 2026", tag: "Past Enquiry" },
  { id: "n02", name: "Ferris Industrial Cooling", contact: "Beth Ferris", email: "beth@ferriscooling.com.au", history: "Member 2015–2023, lapsed", lastTouch: "Attended: Annual HVAC Conference 2025", tag: "Former Member" },
  { id: "n03", name: "Kade Nguyen (Individual)", contact: "Kade Nguyen", email: "kade.nguyen@gmail.com", history: "Completed Cert IV Certification, 2025", tag: "Training Alumni", lastTouch: "Awarded: Apprentice of the Year 2025" },
  { id: "n04", name: "Bluewater Mechanical Services", contact: "Sam Ionescu", email: "sam@bluewatermech.com.au", history: "Enquired 2025, budget deferred", lastTouch: "Registered: Design Standards Update webinar", tag: "Past Enquiry" },
  { id: "n05", name: "Outback Refrigeration", contact: "Priya Chandra", email: "priya@outbackrefrig.com.au", history: "Attended 3 training courses since 2023", lastTouch: "Attended: Confined Spaces Safety Training", tag: "Training Alumni" },
];

// ---------------------------------------------------------------------------
// Events & Training — drives the non-member nurture flow.
// ---------------------------------------------------------------------------
const EVENTS = [
  { id: "e01", name: "Annual HVAC Conference 2026", date: "2026-11-12", type: "Event", registrations: 214, audience: "Members + Non-members" },
  { id: "e02", name: "F-Gas Regulation Update Webinar", date: "2026-09-24", type: "Webinar", registrations: 88, audience: "All contacts" },
  { id: "e03", name: "Cert IV in HVAC/R — Spring Intake", date: "2026-10-06", type: "Certification", registrations: 31, audience: "Non-members (career pathway)" },
  { id: "e04", name: "Confined Spaces Safety Training", date: "2026-09-18", type: "Training", registrations: 46, audience: "All contacts" },
  { id: "e05", name: "Design Standards Update Webinar", date: "2026-09-05", type: "Webinar", registrations: 63, audience: "All contacts" },
];

// ---------------------------------------------------------------------------
// Member lifecycle comms — the automated email sequence.
// ---------------------------------------------------------------------------
const COMMS_SEQUENCE = [
  { id: "seq01", stage: "Enquiry received", trigger: "Website form submitted", audience: "New lead", subject: "Thanks for your enquiry — AMCA Australia" },
  { id: "seq02", stage: "Welcome", trigger: "Application approved", audience: "New member", subject: "Welcome to AMCA — here's what happens next" },
  { id: "seq03", stage: "Benefits walkthrough", trigger: "+7 days after welcome", audience: "New member", subject: "Getting the most from your AMCA membership" },
  { id: "seq04", stage: "Policy & regulation updates", trigger: "Published by Advocacy team", audience: "All active members", subject: "New: F-Gas Regulation changes you need to know" },
  { id: "seq05", stage: "Renewal reminder (60 days)", trigger: "60 days before renewal date", audience: "Renewal due", subject: "Your AMCA membership renews in 60 days" },
  { id: "seq06", stage: "Renewal reminder (30 days)", trigger: "30 days before renewal date", audience: "Renewal due", subject: "Renewal reminder — 30 days to go" },
  { id: "seq07", stage: "Renewal reminder (7 days)", trigger: "7 days before renewal date", audience: "Renewal due", subject: "Final reminder — your membership renews in 7 days" },
  { id: "seq08", stage: "Renewal confirmation", trigger: "Payment received in Xero", audience: "Renewed member", subject: "You're all set — renewal confirmed" },
  { id: "seq09", stage: "Lapse notice", trigger: "30 days overdue, unpaid", audience: "Lapsed member", subject: "We've missed you — your AMCA membership has lapsed" },
];

// ---------------------------------------------------------------------------
// Website access rules — what each persona can see on the member portal.
// ---------------------------------------------------------------------------
const ACCESS_PERSONAS = [
  { id: "guest", label: "Guest (not logged in)" },
  { id: "non_member", label: "Non-member (logged in)" },
  { id: "member_active", label: "Member — Active" },
  { id: "member_renewal_due", label: "Member — Renewal Due" },
  { id: "member_lapsed", label: "Member — Lapsed" },
  { id: "staff", label: "AMCA Staff" },
];

const PORTAL_RESOURCES = [
  { id: "r1", name: "Industry News & Advocacy Updates", rule: ["guest", "non_member", "member_active", "member_renewal_due", "member_lapsed", "staff"] },
  { id: "r2", name: "Event & Training Registration", rule: ["guest", "non_member", "member_active", "member_renewal_due", "member_lapsed", "staff"] },
  { id: "r3", name: "Member Directory", rule: ["member_active", "member_renewal_due", "staff"] },
  { id: "r4", name: "Technical Standards Library", rule: ["member_active", "member_renewal_due", "staff"] },
  { id: "r5", name: "Regulation & Policy Guides", rule: ["member_active", "member_renewal_due", "staff"] },
  { id: "r6", name: "Member Pricing on Training", rule: ["member_active", "member_renewal_due", "staff"] },
  { id: "r7", name: "Technical Helpline Booking", rule: ["member_active", "staff"] },
  { id: "r8", name: "Vote in AMCA Elections", rule: ["member_active", "staff"] },
  { id: "r9", name: "Renew / Update Billing Details", rule: ["member_active", "member_renewal_due", "member_lapsed", "staff"] },
  { id: "r10", name: "Admin: Manage All Members", rule: ["staff"] },
];

// ---------------------------------------------------------------------------
// Integration status strip
// ---------------------------------------------------------------------------
const INTEGRATIONS = [
  { id: "xero", name: "Xero", role: "Renewal invoices + payment status", status: "connected", lastSync: "2026-09-01 08:14" },
  { id: "mailchimp", name: "Mailchimp", role: "Contacts, segments & campaigns", status: "connected", lastSync: "2026-09-01 07:50" },
  { id: "website", name: "AMCA Website", role: "Login, paywall & member resources", status: "connected", lastSync: "2026-09-01 08:20" },
];
