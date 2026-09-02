/* ==========================================================================
   AMCA CRM — Prototype application logic
   Pure client-side, in-memory state. No backend — every "integration" action
   (raising a Xero invoice, sending a Mailchimp campaign) is simulated so the
   flow can be demonstrated end-to-end. "Now" is the fixed TODAY constant
   from data.js (2026-09-01), not the real system clock, so the demo data
   stays consistent across runs.
   ========================================================================== */

const ONBOARD_ORDER = ONBOARDING_STAGES.map((s) => s.id);
const ONBOARD_LABEL = Object.fromEntries(ONBOARDING_STAGES.map((s) => [s.id, s.label]));
const CATEGORY_FEES = { "Contractor Member": 1650, "Corporate Member": 3200, "Associate Member": 980, "Affiliate Member": 500 };

const state = {
  companies: JSON.parse(JSON.stringify(COMPANIES)),
  benefits: JSON.parse(JSON.stringify(BENEFITS)),
  workflows: JSON.parse(JSON.stringify(WORKFLOWS)),
  campaigns: JSON.parse(JSON.stringify(CAMPAIGNS)),
  emailTemplates: JSON.parse(JSON.stringify(EMAIL_TEMPLATES)),
  nonMembers: JSON.parse(JSON.stringify(NON_MEMBERS)),
  nonMemberLists: JSON.parse(JSON.stringify(NON_MEMBER_LISTS)),
  subscribers: JSON.parse(JSON.stringify(SUBSCRIBERS)),
  unsubscribePage: JSON.parse(JSON.stringify(UNSUBSCRIBE_PAGE)),
  cms: JSON.parse(JSON.stringify(CMS_CONTENT)),
  events: JSON.parse(JSON.stringify(EVENTS)),
  trainings: JSON.parse(JSON.stringify(TRAININGS)),
  eventsSynced: false,
  trainingsSynced: false,
  docTemplates: JSON.parse(JSON.stringify(DOC_TEMPLATES)),
  view: "action",
  appMode: "crm",
  subtab: { members: "members-pipeline", nonmembers: "nonmembers-contacts", renewal: "renewal-board", cms: "cms-guides", newsletter: "newsletter-send", users: "users-members" },
  editingBenefitId: null,
  dismissedActions: new Set(),
  actionAssignee: {},
  syncLog: [
    { date: "2026-09-01 08:14", type: "sync", label: "Xero → CRM: 3 invoice status updates pulled" },
    { date: "2026-09-01 07:50", type: "sync", label: "Mailchimp → CRM: list counts reconciled (2,184 contacts)" },
    { date: "2026-08-31 22:00", type: "sync", label: "CRM → Website: nightly publish check completed" },
    { date: "2026-08-30 06:00", type: "sync", label: "CEvent → CRM: events & training registrations reconciled" },
  ],
};

// ---------------------------------------------------------------------- utils
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMoney(n) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-AU");
}
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(TODAY + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
}
function daysSince(iso) {
  const d = daysUntil(iso);
  return d == null ? null : -d;
}
function addYearsISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}
function genId(prefix) { return prefix + (Math.floor(Math.random() * 90000) + 10000); }
function byId(id) { return document.getElementById(id); }
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}
function showToast(message, type = "info") {
  const t = el("div", { class: "toast " + type }, message);
  byId("toast-container").appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function addTimeline(company, type, label) {
  company.timeline.unshift({ date: TODAY, type, label });
}
function logSync(label) {
  state.syncLog.unshift({ date: TODAY + " " + new Date().toTimeString().slice(0, 5), type: "sync", label });
}
function allActivity(limit) {
  const rows = [];
  state.companies.forEach((c) => c.timeline.forEach((t) => rows.push({ ...t, company: c.name })));
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows.slice(0, limit);
}
function invoiceBadge(status) {
  const map = {
    not_raised: ["Not raised", "badge-neutral"],
    sent: ["Sent — awaiting payment", "badge-warning"],
    paid: ["Paid", "badge-success"],
    overdue: ["Overdue", "badge-danger"],
  };
  return map[status] || ["—", "badge-neutral"];
}
function statCard(label, value, sub, accentClass) {
  return el("div", { class: "stat-card " + accentClass }, [
    el("div", { class: "stat-card__label" }, label),
    el("div", { class: "stat-card__value" }, String(value)),
    el("div", { class: "stat-card__sub" }, sub),
  ]);
}

// -------------------------------------------------------------- status logic
function getRenewalBoardStage(c) {
  if (c.memberState === "lapsed") return c.renewalStage === "lapsed" ? "lapsed" : null;
  if (c.memberState !== "active") return null;
  if (c.renewalStage === "invoice_sent") return "invoice_sent";
  if (c.renewalStage === "renewed") return "renewed";
  const d = daysUntil(c.renewalDate);
  if (d != null && d <= 90) return "upcoming";
  return null;
}
function getCompanyStatusLabel(c) {
  if (c.memberState === "prospect") return ONBOARD_LABEL[c.onboardingStage];
  if (c.memberState === "lapsed") return "Lapsed";
  const rs = getRenewalBoardStage(c);
  if (rs === "invoice_sent") return "Renewal Invoice Sent";
  if (rs === "upcoming") return "Renewal Upcoming";
  if (rs === "renewed") return "Renewed";
  return "Active";
}
function getCompanyStatusBadgeClass(c) {
  if (c.memberState === "prospect") return "badge-navy";
  if (c.memberState === "lapsed") return "badge-danger";
  const rs = getRenewalBoardStage(c);
  if (rs === "invoice_sent" || rs === "upcoming") return "badge-warning";
  if (rs === "renewed") return "badge-success";
  return "badge-teal";
}
function getCompanyStatusKey(c) {
  if (c.memberState === "prospect") return "onboarding:" + c.onboardingStage;
  return c.memberState;
}

// ------------------------------------------------------------------- routing
function showView(viewId) {
  state.view = viewId;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === viewId));
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  closeSettingsPopover();
  renderView(viewId);
}
function renderView(viewId) {
  switch (viewId) {
    case "action": return renderActionCenter();
    case "dashboard": return renderDashboard();
    case "members": return switchSubtab("members", state.subtab.members);
    case "nonmembers": return switchSubtab("nonmembers", state.subtab.nonmembers);
    case "newsletter": return switchSubtab("newsletter", state.subtab.newsletter);
    case "events": return renderEvents();
    case "training": return renderTraining();
    case "cms": return renderCmsSection();
    case "automation": return renderAutomation();
    case "integrations": return renderIntegrations();
    case "users": return renderUsersView();
    case "organizations": return renderOrganizations();
    case "pevents": return renderEventsSimple();
    case "ptraining": return renderTrainingSimple();
    case "pbenefits": return renderBenefitsSimple();
    case "phandbook": return renderHandbookPanel("phandbook-panel");
    case "pdocgen": return renderDocGen({ templates: "pdocgen-templates", form: "pdocgen-form", preview: "pdocgen-preview" });
  }
}

// ---------------------------------------------------------------- subtabs
function switchSubtab(section, id) {
  state.subtab[section] = id;
  if (section === "renewal") {
    document.querySelectorAll('[data-section="renewal"] .subtab-btn2').forEach((b) => b.classList.toggle("active", b.dataset.subtab2 === id));
    document.querySelectorAll(".subtab-panel2").forEach((p) => p.classList.toggle("active", p.id === id));
    renderPipelineRenewal();
    renderRenewalsBillingTable();
    return;
  }
  document.querySelectorAll(`[data-section="${section}"] .subtab-btn`).forEach((b) => b.classList.toggle("active", b.dataset.subtab === id));
  document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.toggle("active", p.id === id));

  if (section === "members") {
    if (id === "members-pipeline") renderPipelineNew();
    else if (id === "members-renewals") switchSubtab("renewal", state.subtab.renewal);
    else if (id === "members-directory") renderCompanies();
    else if (id === "members-benefits") renderBenefits();
    else if (id === "members-documents") renderDocGen();
    else if (id === "members-handbook") renderHandbookPanel();
  } else if (section === "nonmembers") {
    if (id === "nonmembers-contacts") renderNonMemberContacts();
    else if (id === "nonmembers-lists") renderNonMemberListsGrid();
    else if (id === "nonmembers-campaigns") renderNonMemberCampaignsTab();
  } else if (section === "newsletter") {
    if (id === "newsletter-send") renderNewsletterSend();
    else if (id === "newsletter-history") renderNewsletterHistory();
    else if (id === "newsletter-subscribers") renderSubscribers();
    else if (id === "newsletter-unsub") renderUnsubEditor();
  } else if (section === "cms") {
    renderCmsPanel(id.replace("cms-", ""));
  } else if (section === "users") {
    if (id === "users-members") renderUsers();
    else if (id === "users-usage") renderUsersUsage();
  }
}

// -------------------------------------------------------------- action center
function computeActionItems() {
  const items = [];
  state.companies.forEach((c) => {
    if (c.memberState === "prospect") {
      if (c.onboardingStage === "enquiry") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        items.push({ id: "ac-enq-" + c.id, severity: d >= 4 ? "high" : "medium", title: `Qualify enquiry: ${c.name}`, detail: `In "Enquiry" for ${d} day${d === 1 ? "" : "s"} — owner ${c.owner}.`, companyId: c.id, assignee: c.owner, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "proposal") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        items.push({ id: "ac-prop-" + c.id, severity: d >= 5 ? "high" : "low", title: `Follow up on proposal: ${c.name}`, detail: `Proposal sent ${d} day${d === 1 ? "" : "s"} ago, no response yet.`, companyId: c.id, assignee: c.owner, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "invoice" && c.xero?.invoiceStatus === "sent") {
        items.push({ id: "ac-inv-" + c.id, severity: "medium", title: `Chase membership invoice: ${c.name}`, detail: `${c.xero.invoiceNo} (${fmtMoney(c.xero.amount)}) sent, awaiting payment.`, companyId: c.id, assignee: c.owner, action: { label: "Mark paid", run: () => markProspectInvoicePaid(c.id) } });
      }
      if (c.onboardingStage === "payment") {
        items.push({ id: "ac-act-" + c.id, severity: "high", title: `Activate membership: ${c.name}`, detail: `Payment received — welcome sequence is ready to send.`, companyId: c.id, assignee: c.owner, action: { label: "Activate", run: () => activateCompany(c.id) } });
      }
    }
    if (c.memberState === "active") {
      const rs = getRenewalBoardStage(c);
      const d = daysUntil(c.renewalDate);
      if (rs === "upcoming" && d != null && d <= 30) {
        items.push({ id: "ac-ren-" + c.id, severity: "high", title: `Raise renewal invoice: ${c.name}`, detail: `Renews in ${d} day${d === 1 ? "" : "s"} (${fmtDate(c.renewalDate)}), no invoice raised yet.`, companyId: c.id, assignee: c.owner, action: { label: "Raise invoice", run: () => raiseRenewalInvoice(c.id) } });
      } else if (rs === "invoice_sent" && d != null && d <= 10) {
        items.push({ id: "ac-follow-" + c.id, severity: "high", title: `Follow up before lapse: ${c.name}`, detail: `Renewal invoice sent, ${d} day${d === 1 ? "" : "s"} left, still unpaid.`, companyId: c.id, assignee: c.owner, action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
      if (c.xero?.invoiceStatus === "overdue") {
        items.push({ id: "ac-overdue-" + c.id, severity: "high", title: `Overdue payment: ${c.name}`, detail: `${c.xero.invoiceNo} overdue — ${c.xero.paymentStatus}.`, companyId: c.id, assignee: c.owner, action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
    }
  });
  state.benefits.forEach((b) => {
    if (b.status === "Draft") items.push({ id: "ac-benefit-" + b.id, severity: "low", title: `Review draft benefit: ${b.title}`, detail: `Last updated ${fmtDate(b.updated)} — publish when ready.`, assignee: "Brendan Wills", action: { label: "Open benefits", goto: "members", gotoSubtab: "members-benefits" } });
  });
  state.campaigns.forEach((cm) => {
    if (cm.status === "Scheduled") items.push({ id: "ac-camp-" + cm.id, severity: "medium", title: `Scheduled campaign due: ${cm.name}`, detail: `Set to send ${fmtDate(cm.sentDate)} to "${cm.segment}".`, assignee: "Brendan Wills", action: { label: "Open newsletter", goto: "newsletter" } });
  });
  Object.entries(state.cms).forEach(([key, items_]) => {
    items_.filter((x) => x.status === "Draft").forEach((x) => {
      items.push({ id: "ac-cms-" + x.id, severity: "low", title: `Review draft content: ${x.title}`, detail: `${CMS_TYPES.find((t) => t.key === key)?.label || key} — last updated ${fmtDate(x.updated)}.`, assignee: "Brendan Wills", action: { label: "Open website", goto: "cms" } });
    });
  });
  return items.filter((i) => !state.dismissedActions.has(i.id)).sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}
function renderActionCenter() {
  const items = computeActionItems();
  const wrap = byId("action-items");
  wrap.innerHTML = "";
  if (!items.length) {
    wrap.appendChild(el("div", { class: "panel" }, "Nothing needs attention right now — nice work."));
    return;
  }
  items.forEach((item) => {
    const actions = el("div", { class: "action-item__actions" });
    if (item.action?.run) {
      actions.append(el("button", { class: "btn btn-sm btn-primary", onclick: () => { item.action.run(); renderView(state.view); } }, item.action.label));
    } else if (item.action?.goto) {
      actions.append(el("button", { class: "btn btn-sm", onclick: () => { if (item.action.gotoSubtab) state.subtab[item.action.goto] = item.action.gotoSubtab; showView(item.action.goto); } }, item.action.label));
    }
    actions.append(el("button", { class: "btn btn-sm btn-ghost", onclick: () => { state.dismissedActions.add(item.id); renderActionCenter(); showToast("Marked as done.", "success"); } }, "Mark done"));

    const assigneeSelect = el("select", { class: "assignee-select" }, USERS.map((u) => el("option", { value: u.name }, u.name)));
    assigneeSelect.value = state.actionAssignee[item.id] || item.assignee || "Brendan Wills";
    assigneeSelect.onchange = () => { state.actionAssignee[item.id] = assigneeSelect.value; showToast(`Reassigned to ${assigneeSelect.value}.`, "info"); };

    wrap.append(
      el("div", { class: "action-item severity-" + item.severity }, [
        el("div", { class: "action-item__main" }, [
          el("div", { class: "action-item__title", onclick: item.companyId ? () => openDrawer(item.companyId) : null }, item.title),
          el("div", { class: "action-item__detail" }, item.detail),
        ]),
        el("div", { class: "action-item__assignee" }, [el("span", { class: "cell-muted" }, "Assigned to"), assigneeSelect]),
        actions,
      ])
    );
  });
}

// ----------------------------------------------------------------- dashboard
function renderDashboard() {
  byId("impact-period").textContent = IMPACT_METRICS.periodLabel;
  const activeCompanies = state.companies.filter((c) => c.memberState === "active");
  const activeUsers = activeCompanies.reduce((sum, c) => sum + c.people.length, 0);

  const impactGrid = byId("impact-grid");
  impactGrid.innerHTML = "";
  [
    ["Active members", activeCompanies.length, ""],
    ["Portal users", activeUsers, "People with member login access"],
    ["Training hours delivered", IMPACT_METRICS.trainingHoursDelivered.toLocaleString(), "YTD"],
    ["Free resource hours accessed", IMPACT_METRICS.freeResourceHoursAccessed.toLocaleString(), "YTD"],
    ["Resource PDFs downloaded", IMPACT_METRICS.freeResourcePdfDownloads.toLocaleString(), "YTD"],
    ["Event & training attendances", IMPACT_METRICS.eventAttendeesYTD.toLocaleString(), "YTD"],
    ["Policy & regulation guides published", IMPACT_METRICS.policyGuidesPublished, "YTD"],
    ["Renewal rate", IMPACT_METRICS.renewalRate + "%", "Trailing 12 months"],
  ].forEach(([label, value, sub]) => {
    impactGrid.append(el("div", { class: "impact-tile" }, [
      el("div", { class: "impact-tile__value" }, String(value)),
      el("div", { class: "impact-tile__label" }, label),
      sub ? el("div", { class: "impact-tile__sub" }, sub) : null,
    ]));
  });

  const openProspects = state.companies.filter((c) => c.memberState === "prospect").length;
  const renewalActive = state.companies.filter((c) => ["upcoming", "invoice_sent"].includes(getRenewalBoardStage(c))).length;
  const lapsed = state.companies.filter((c) => c.memberState === "lapsed").length;
  const openActions = computeActionItems().length;

  const stats = byId("dashboard-stats");
  stats.innerHTML = "";
  stats.append(
    statCard("Open enquiries & applications", openProspects, "In the new member pipeline", ""),
    statCard("Renewals in progress", renewalActive, "Upcoming or invoiced", "accent-orange"),
    statCard("Lapsed", lapsed, "Candidates for re-engagement", ""),
    statCard("Open action items", openActions, "Needing attention today", "accent-teal")
  );

  const funnel = byId("dashboard-funnel");
  funnel.innerHTML = "";
  const max = Math.max(...ONBOARDING_STAGES.map((s) => state.companies.filter((c) => c.memberState === "prospect" && c.onboardingStage === s.id).length), 1);
  ONBOARDING_STAGES.forEach((s) => {
    const count = state.companies.filter((c) => c.memberState === "prospect" && c.onboardingStage === s.id).length;
    funnel.append(
      el("div", { class: "funnel-row" }, [
        el("div", { class: "funnel-row__label" }, s.label),
        el("div", { class: "funnel-row__bar-track" }, el("div", { class: "funnel-row__bar", style: `width:${(count / max) * 100}%` })),
        el("div", { class: "funnel-row__count" }, String(count)),
      ])
    );
  });

  const renewalsList = byId("dashboard-renewals");
  renewalsList.innerHTML = "";
  state.companies
    .filter((c) => c.memberState === "active" && c.renewalDate)
    .sort((a, b) => (a.renewalDate > b.renewalDate ? 1 : -1))
    .slice(0, 5)
    .forEach((c) => {
      const d = daysUntil(c.renewalDate);
      renewalsList.append(
        el("div", { class: "mini-item" }, [
          el("div", { class: "mini-item__main" }, [
            el("div", { class: "mini-item__title" }, c.name),
            el("div", { class: "mini-item__meta" }, `${c.category} · renews ${fmtDate(c.renewalDate)}`),
          ]),
          el("span", { class: "badge " + (d <= 0 ? "badge-danger" : d <= 30 ? "badge-warning" : "badge-neutral") }, d <= 0 ? "Overdue" : `${d}d`),
        ])
      );
    });

  const activity = byId("dashboard-activity");
  activity.innerHTML = "";
  allActivity(8).forEach((a) => {
    activity.append(
      el("div", { class: "activity-item" }, [
        el("div", { class: "activity-item__date" }, fmtDate(a.date)),
        el("div", {}, [el("b", {}, a.company + ": "), a.label]),
      ])
    );
  });

  const eventsList = byId("dashboard-events");
  eventsList.innerHTML = "";
  [...state.events, ...state.trainings].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(0, 5).forEach((e) => {
    eventsList.append(
      el("div", { class: "mini-item" }, [
        el("div", { class: "mini-item__main" }, [
          el("div", { class: "mini-item__title" }, e.name),
          el("div", { class: "mini-item__meta" }, `${e.format} · ${fmtDate(e.date)}`),
        ]),
        el("span", { class: "badge badge-navy" }, `${e.registrations} reg.`),
      ])
    );
  });
}

// -------------------------------------------------------------- new members
function renderPipelineNew() {
  const board = byId("pipeline-board-new");
  board.innerHTML = "";
  ONBOARDING_STAGES.forEach((stage) => {
    const companies = state.companies.filter((c) => c.memberState === "prospect" && c.onboardingStage === stage.id);
    const col = el("div", { class: "pipeline-col" }, [
      el("div", { class: "pipeline-col__head" }, [
        el("div", { class: "pipeline-col__title" }, stage.label),
        el("div", { class: "pipeline-col__count" }, String(companies.length)),
      ]),
    ]);
    companies.forEach((c) => col.appendChild(onboardingCard(c)));
    board.appendChild(col);
  });
}
function onboardingCard(c) {
  const card = el("div", { class: "pipeline-card" }, [
    el("div", { class: "pipeline-card__name" }, c.name),
    el("div", { class: "pipeline-card__meta" }, `${c.category} · Owner: ${c.owner}`),
  ]);
  card.addEventListener("click", (e) => { if (e.target.tagName !== "BUTTON") openDrawer(c.id); });
  const actions = el("div", { class: "pipeline-card__actions" });
  const stage = c.onboardingStage;
  if (stage === "enquiry") actions.append(actionBtn("→ Qualifying", () => moveOnboarding(c.id, "qualifying", "Moved to Qualifying")));
  if (stage === "qualifying") actions.append(actionBtn("→ Application", () => moveOnboarding(c.id, "application", "Membership application submitted for review")));
  if (stage === "application") actions.append(actionBtn("→ Proposal / Quote", () => moveOnboarding(c.id, "proposal", "Membership proposal & quote sent")));
  if (stage === "proposal") actions.append(actionBtn("Raise invoice (Xero)", () => raiseNewMemberInvoice(c.id)));
  if (stage === "invoice") actions.append(actionBtn("Mark paid (Xero)", () => markProspectInvoicePaid(c.id)));
  if (stage === "payment") actions.append(actionBtn("Activate membership", () => activateCompany(c.id)));
  card.appendChild(actions);
  return card;
}
function actionBtn(label, fn) {
  return el("button", { class: "btn btn-sm btn-primary", onclick: (e) => { e.stopPropagation(); fn(); renderView(state.view); refreshDrawerIfOpen(); } }, label);
}
function moveOnboarding(companyId, nextStage, note) {
  const c = state.companies.find((x) => x.id === companyId);
  c.onboardingStage = nextStage;
  addTimeline(c, "status", note);
  showToast(`${c.name} moved to "${ONBOARD_LABEL[nextStage]}".`, "info");
}
function raiseNewMemberInvoice(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  const amount = CATEGORY_FEES[c.category] || 1650;
  const invoiceNo = "INV-" + (1400 + Math.abs(companyId.charCodeAt(1) * 13 + companyId.charCodeAt(2) * 7) % 500);
  c.xero = { contactId: "XERO-CT-" + companyId.toUpperCase(), invoiceNo, invoiceStatus: "sent", paymentStatus: "Awaiting payment", amount };
  c.onboardingStage = "invoice";
  addTimeline(c, "invoice", `Membership invoice ${invoiceNo} raised in Xero (${fmtMoney(amount)})`);
  showToast(`Invoice ${invoiceNo} created in Xero for ${c.name}.`, "success");
}
function markProspectInvoicePaid(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.xero.invoiceStatus = "paid";
  c.xero.paymentStatus = "Paid in full";
  c.onboardingStage = "payment";
  addTimeline(c, "invoice", `Payment received for ${c.xero.invoiceNo} — finalising onboarding`);
  logSync(`Xero webhook: payment received for ${c.name} (${c.xero.invoiceNo})`);
  showToast(`Payment confirmed for ${c.name}. Ready to activate.`, "success");
}
function activateCompany(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.memberState = "active";
  c.onboardingStage = null;
  c.joinDate = TODAY;
  c.renewalDate = addYearsISO(TODAY, 1);
  c.mailchimp = { synced: true, segments: ["Active Members", c.category.replace(" Member", " Tier")] };
  addTimeline(c, "milestone", "Became a member — welcome pack sent");
  logSync(`Mailchimp: ${c.name} added to "Active Members" segment`);
  showToast(`${c.name} is now an active member. Welcome sequence triggered.`, "success");
}

// ------------------------------------------------------------------ renewals
function renderPipelineRenewal() {
  const board = byId("pipeline-board-renewal");
  if (!board) return;
  board.innerHTML = "";
  RENEWAL_STAGES.forEach((stage) => {
    const companies = state.companies.filter((c) => getRenewalBoardStage(c) === stage.id);
    const groupAttrs = stage.id === "renewed" ? { "data-group": "member" } : stage.id === "lapsed" ? { "data-group": "former" } : {};
    const col = el("div", { class: "pipeline-col", ...groupAttrs }, [
      el("div", { class: "pipeline-col__head" }, [
        el("div", { class: "pipeline-col__title" }, stage.label),
        el("div", { class: "pipeline-col__count" }, String(companies.length)),
      ]),
    ]);
    companies.forEach((c) => col.appendChild(renewalCard(c, stage.id)));
    board.appendChild(col);
  });
}
function renewalCard(c, stageId) {
  const card = el("div", { class: "pipeline-card" }, [
    el("div", { class: "pipeline-card__name" }, c.name),
    el("div", { class: "pipeline-card__meta" }, `${c.category} · renews ${fmtDate(c.renewalDate)}`),
  ]);
  card.addEventListener("click", (e) => { if (e.target.tagName !== "BUTTON") openDrawer(c.id); });
  const actions = el("div", { class: "pipeline-card__actions" });
  if (stageId === "upcoming") actions.append(actionBtn("Raise invoice (Xero)", () => raiseRenewalInvoice(c.id)));
  if (stageId === "invoice_sent") {
    actions.append(
      el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); markRenewed(c.id); renderView(state.view); refreshDrawerIfOpen(); } }, "Mark renewed"),
      el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); markLapsedFromRenewal(c.id); renderView(state.view); refreshDrawerIfOpen(); } }, "Mark lapsed")
    );
  }
  if (stageId === "lapsed") actions.append(actionBtn("Re-engage", () => reEngage(c.id)));
  card.appendChild(actions);
  return card;
}
function raiseRenewalInvoice(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  if (!c.xero) c.xero = { contactId: "XERO-CT-" + companyId.toUpperCase(), amount: CATEGORY_FEES[c.category] || 1650 };
  c.xero.invoiceNo = "INV-" + (1300 + Math.abs(companyId.charCodeAt(1) * 7) % 500);
  c.xero.invoiceStatus = "sent";
  c.xero.paymentStatus = "Awaiting payment";
  c.renewalStage = "invoice_sent";
  addTimeline(c, "invoice", `Renewal invoice ${c.xero.invoiceNo} raised in Xero (${fmtMoney(c.xero.amount)})`);
  showToast(`Invoice ${c.xero.invoiceNo} created in Xero for ${c.name} — awaiting payment.`, "success");
}
function markRenewed(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.renewalStage = "renewed";
  c.renewalDate = addYearsISO(c.renewalDate, 1);
  c.xero.invoiceStatus = "paid";
  c.xero.paymentStatus = "Paid in full";
  addTimeline(c, "status", `Renewal confirmed — renewal date rolled to ${fmtDate(c.renewalDate)}`);
  showToast(`${c.name} renewed. Confirmation email sent, Mailchimp segment updated.`, "success");
}
function markLapsedFromRenewal(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.memberState = "lapsed";
  c.renewalStage = "lapsed";
  if (c.xero) c.xero.invoiceStatus = "overdue";
  addTimeline(c, "status", "Marked Lapsed — non-payment");
  showToast(`${c.name} marked as lapsed. Moved to non-member nurture list.`, "info");
}
function reEngage(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.memberState = "prospect";
  c.onboardingStage = "enquiry";
  c.renewalStage = null;
  addTimeline(c, "lead", "Re-engaged — moved back into the new member pipeline");
  showToast(`${c.name} re-engaged and returned to the pipeline.`, "info");
}
function renderRenewalsBillingTable() {
  const wrap = byId("renewals-table");
  if (!wrap) return;
  wrap.innerHTML = "";
  const rows = state.companies.filter((c) => c.xero).sort((a, b) => {
    const ka = a.renewalDate || "9999", kb = b.renewalDate || "9999";
    return ka > kb ? 1 : -1;
  });
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Company", "Category", "Member since", "Renewal date", "Status", "Xero invoice", "Payment status", ""].map((h) => el("th", {}, h)))),
  ]);
  const tbody = el("tbody");
  rows.forEach((c) => {
    const [invLabel, invClass] = invoiceBadge(c.xero.invoiceStatus);
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary clickable", onclick: () => openDrawer(c.id) }, c.name),
      el("td", {}, c.category),
      el("td", {}, fmtDate(c.joinDate)),
      el("td", {}, fmtDate(c.renewalDate)),
      el("td", {}, el("span", { class: "badge " + getCompanyStatusBadgeClass(c) }, getCompanyStatusLabel(c))),
      el("td", {}, el("span", { class: "badge " + invClass }, invLabel)),
      el("td", { class: "cell-muted" }, c.xero.paymentStatus),
      el("td", {}, billingActionButton(c)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function billingActionButton(c) {
  if (c.memberState === "prospect" && c.xero.invoiceStatus === "sent") return el("button", { class: "btn btn-sm btn-primary", onclick: () => { markProspectInvoicePaid(c.id); renderRenewalsBillingTable(); } }, "Mark paid");
  if (c.memberState === "active" && c.xero.invoiceStatus === "not_raised") return el("button", { class: "btn btn-sm btn-primary", onclick: () => { raiseRenewalInvoice(c.id); renderRenewalsBillingTable(); } }, "Raise invoice");
  if (c.memberState === "active" && c.xero.invoiceStatus === "sent") return el("button", { class: "btn btn-sm", onclick: () => { markRenewed(c.id); renderRenewalsBillingTable(); } }, "Mark paid");
  if (c.memberState === "lapsed") return el("button", { class: "btn btn-sm", onclick: () => showToast(`Final notice re-sent to ${c.name}.`, "info") }, "Send final notice");
  return el("span", { class: "cell-muted" }, c.xero.invoiceNo || "—");
}

// ---------------------------------------------------------------- companies
function renderCompanies() {
  const catSel = byId("company-filter-category");
  if (catSel.options.length <= 1) MEMBER_CATEGORIES.forEach((cat) => catSel.append(el("option", { value: cat }, cat)));
  const stageSel = byId("company-filter-stage");
  if (stageSel.options.length <= 1) {
    ONBOARDING_STAGES.forEach((s) => stageSel.append(el("option", { value: "onboarding:" + s.id }, s.label)));
    stageSel.append(el("option", { value: "active" }, "Active"));
    stageSel.append(el("option", { value: "lapsed" }, "Lapsed"));
  }

  const draw = () => {
    const q = byId("company-search").value.trim().toLowerCase();
    const cat = catSel.value;
    const stg = stageSel.value;
    const rows = state.companies.filter((c) => {
      const matchesQ = !q || c.name.toLowerCase().includes(q) || c.people.some((p) => p.name.toLowerCase().includes(q));
      return matchesQ && (!cat || c.category === cat) && (!stg || getCompanyStatusKey(c) === stg);
    });
    const wrap = byId("companies-table");
    wrap.innerHTML = "";
    const table = el("table", {}, [
      el("thead", {}, el("tr", {}, ["Company", "Category", "Status", "Owner", "People", "Member since"].map((h) => el("th", {}, h)))),
    ]);
    const tbody = el("tbody");
    rows.forEach((c) => {
      tbody.appendChild(el("tr", { class: "clickable", onclick: () => openDrawer(c.id) }, [
        el("td", { class: "cell-primary" }, c.name),
        el("td", {}, c.category),
        el("td", {}, el("span", { class: "badge " + getCompanyStatusBadgeClass(c) }, getCompanyStatusLabel(c))),
        el("td", {}, c.owner),
        el("td", {}, `${c.people.length} contact${c.people.length === 1 ? "" : "s"}`),
        el("td", {}, fmtDate(c.joinDate)),
      ]));
    });
    if (!rows.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "6", class: "cell-muted" }, "No companies match this search.")));
    table.appendChild(tbody);
    wrap.appendChild(table);
  };
  byId("company-search").oninput = draw;
  catSel.onchange = draw;
  stageSel.onchange = draw;
  draw();
}

// -------------------------------------------------------- campaign composer
function membersMatchingCriteria(criteria) {
  if (!criteria.size) return [];
  return state.companies.filter((c) => c.memberState === "active").filter((c) => {
    if (criteria.has("all")) return true;
    if (criteria.has("contractor") && c.category === "Contractor Member") return true;
    if (criteria.has("corporate") && c.category === "Corporate Member") return true;
    if (criteria.has("renewal_due") && getRenewalBoardStage(c)) return true;
    return false;
  });
}
function nonMemberContactsMatchingLists(listIds) {
  if (!listIds.size) return [];
  const contacts = state.nonMembers.filter((n) => n.lists.some((l) => listIds.has(l)));
  const extra = listIds.has("l3") ? state.companies.filter((c) => c.memberState === "lapsed").map(() => ({ consent: true, unsubscribed: false })) : [];
  return contacts.concat(extra);
}
function composerRecipientInfo(selection) {
  const members = membersMatchingCriteria(selection.memberCriteria);
  const memberCount = members.reduce((s, c) => s + c.people.length, 0);
  const nmContacts = nonMemberContactsMatchingLists(selection.nonMemberLists);
  const nmSendable = nmContacts.filter((c) => c.consent && !c.unsubscribed).length;
  const nmBlocked = nmContacts.length - nmSendable;
  let subTotal = 0, subSendable = 0;
  if (selection.includeSubscribers) {
    subTotal = state.subscribers.length;
    subSendable = state.subscribers.filter((s) => !s.unsubscribed).length;
  }
  return { total: memberCount + nmContacts.length + subTotal, sendable: memberCount + nmSendable + subSendable, blocked: nmBlocked + (subTotal - subSendable) };
}
function describeSelection(selection) {
  const parts = [];
  const memberLabels = { all: "All Active Members", contractor: "Contractor Members", corporate: "Corporate Members", renewal_due: "Renewal-Due Members" };
  selection.memberCriteria.forEach((k) => parts.push(memberLabels[k]));
  selection.nonMemberLists.forEach((id) => parts.push(state.nonMemberLists.find((l) => l.id === id)?.name || id));
  if (selection.includeSubscribers) parts.push("Site Subscribers");
  return parts.length ? parts.join(", ") : "No audience selected";
}
function audienceTypeFor(selection) {
  const flags = [selection.memberCriteria.size > 0, selection.nonMemberLists.size > 0, !!selection.includeSubscribers];
  const count = flags.filter(Boolean).length;
  if (count > 1) return "Mixed";
  if (flags[0]) return "Members";
  if (flags[1]) return "Non-members";
  if (flags[2]) return "Subscribers";
  return "None";
}
function checkboxRow(label, onchange) {
  const box = el("input", { type: "checkbox" });
  box.addEventListener("change", () => onchange(box.checked, box));
  return { row: el("label", { class: "tier-check" }, [box, " " + label]), box };
}
function buildCampaignComposer(container, opts) {
  const mode = opts.mode;
  container.innerHTML = "";
  const selection = { memberCriteria: new Set(), nonMemberLists: new Set(), includeSubscribers: false };

  const templateSelect = el("select", {}, state.emailTemplates.map((t) => el("option", { value: t.id }, t.name)));
  const subjectInput = el("input", { type: "text", placeholder: "Subject line…" });
  const previewInput = el("input", { type: "text", placeholder: "Preview text (inbox snippet)…" });
  const bodyTextarea = el("textarea", { rows: "6", class: "html-editor", placeholder: "<h2>Heading</h2>\n<p>Body copy…</p>" });
  const previewPane = el("div", { class: "email-preview" });
  const summary = el("div", { class: "campaign-summary" });

  const applyTemplate = () => {
    const t = state.emailTemplates.find((x) => x.id === templateSelect.value) || state.emailTemplates[0];
    subjectInput.value = t.subject;
    previewInput.value = t.previewText;
    bodyTextarea.value = t.bodyHtml;
    updatePreview();
  };
  const updatePreview = () => { previewPane.innerHTML = bodyTextarea.value || "<p class='cell-muted'>Nothing to preview yet.</p>"; };
  const updateSummary = () => {
    const info = composerRecipientInfo(selection);
    let text = `${describeSelection(selection)} — ${info.sendable} recipient${info.sendable === 1 ? "" : "s"}.`;
    if (info.blocked > 0) text += ` ${info.blocked} excluded (no consent or unsubscribed).`;
    summary.textContent = text;
  };
  templateSelect.onchange = applyTemplate;
  bodyTextarea.oninput = updatePreview;

  const audienceBlocks = [];
  if (mode === "newsletter") {
    const memberChecks = [["all", "All Active Members"], ["contractor", "Contractor Members"], ["corporate", "Corporate Members"], ["renewal_due", "Renewal-Due Members"]]
      .map(([key, label]) => checkboxRow(label, (checked) => { checked ? selection.memberCriteria.add(key) : selection.memberCriteria.delete(key); updateSummary(); }).row);
    audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Members"), el("div", { class: "tier-check-group" }, memberChecks)]));
  }
  const listRows = state.nonMemberLists.map((list) => checkboxRow(list.name, (checked) => { checked ? selection.nonMemberLists.add(list.id) : selection.nonMemberLists.delete(list.id); updateSummary(); }));
  const allLists = checkboxRow("All lists", (checked) => {
    listRows.forEach((r) => { r.box.checked = checked; });
    if (checked) state.nonMemberLists.forEach((l) => selection.nonMemberLists.add(l.id));
    else selection.nonMemberLists.clear();
    updateSummary();
  });
  audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Non-Members"), el("div", { class: "tier-check-group" }, [allLists.row, ...listRows.map((r) => r.row)])]));
  if (mode === "newsletter") {
    const subRow = checkboxRow("Include site subscribers", (checked) => { selection.includeSubscribers = checked; updateSummary(); });
    audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Subscribers"), el("div", { class: "tier-check-group" }, [subRow.row])]));
  }

  const sendBtn = el("button", {
    class: "btn btn-primary",
    onclick: () => {
      const info = composerRecipientInfo(selection);
      if (!info.sendable) { showToast("Select at least one audience with recipients before sending.", "info"); return; }
      const audienceType = audienceTypeFor(selection);
      const delivered = Math.round(info.sendable * 0.98);
      const baseOpen = audienceType === "Members" ? 55 : audienceType === "Non-members" ? 35 : audienceType === "Subscribers" ? 40 : 42;
      const openRate = Math.max(0, baseOpen - (info.sendable > 1000 ? 8 : 0));
      const clickRate = Math.round(openRate * 0.22);
      const unsubscribes = Math.max(0, Math.round(info.sendable * 0.002));
      state.campaigns.unshift({
        id: genId("cm"), name: subjectInput.value || "Untitled campaign", audience: audienceType, segment: describeSelection(selection),
        sentDate: TODAY, recipients: info.sendable, delivered, deliveredRate: 98, openRate, clickRate, unsubscribes, status: "Sent",
        previewText: previewInput.value, bodyHtml: bodyTextarea.value,
      });
      logSync(`Mailchimp campaign sent: "${subjectInput.value}" → ${describeSelection(selection)} (${info.sendable} recipients, consent-checked)`);
      showToast(`Campaign sent via Mailchimp to ${info.sendable} contact${info.sendable === 1 ? "" : "s"}.`, "success");
      opts.onSent && opts.onSent();
    },
  }, "Send via Mailchimp");

  container.append(
    el("div", { class: "campaign-row" }, [el("label", {}, "Template:"), templateSelect]),
    el("div", { class: "campaign-row" }, [el("label", {}, "Subject:"), subjectInput]),
    el("div", { class: "campaign-row" }, [el("label", {}, "Preview text:"), previewInput]),
    el("div", { class: "editor-row" }, [
      el("div", { class: "editor-col" }, [el("label", {}, "Email body (HTML)"), bodyTextarea]),
      el("div", { class: "editor-col" }, [el("label", {}, "Preview"), previewPane]),
    ]),
    el("div", { class: "audience-picker" }, audienceBlocks),
    summary,
    el("div", { class: "campaign-row" }, [sendBtn])
  );
  applyTemplate();
  updateSummary();
}
function rateClass(rate, kind) {
  if (rate == null) return "badge-neutral";
  if (kind === "open") return rate >= 45 ? "badge-success" : rate >= 25 ? "badge-warning" : "badge-danger";
  if (kind === "click") return rate >= 15 ? "badge-success" : rate >= 7 ? "badge-warning" : "badge-danger";
  return rate >= 95 ? "badge-success" : "badge-warning";
}
function renderCampaignSummary(container, audienceFilter) {
  if (!container) return;
  container.innerHTML = "";
  const rows = state.campaigns.filter((cm) => cm.status === "Sent" && (!audienceFilter || cm.audience === audienceFilter));
  const totalRecipients = rows.reduce((s, c) => s + (c.recipients || 0), 0);
  const avgOpen = rows.length ? Math.round(rows.reduce((s, c) => s + (c.openRate || 0), 0) / rows.length) : 0;
  const avgClick = rows.length ? Math.round(rows.reduce((s, c) => s + (c.clickRate || 0), 0) / rows.length) : 0;
  const totalUnsub = rows.reduce((s, c) => s + (c.unsubscribes || 0), 0);
  container.append(
    statCard("Campaigns sent", rows.length, "All time", ""),
    statCard("Total recipients reached", totalRecipients.toLocaleString(), "All time", "accent-teal"),
    statCard("Avg. open rate", avgOpen + "%", "Across sent campaigns", ""),
    statCard("Avg. click rate", avgClick + "%", "Across sent campaigns", "accent-orange"),
    statCard("Unsubscribes", totalUnsub, "All time", "")
  );
}
function renderCampaignsTable(wrap, audienceFilter) {
  if (!wrap) return;
  wrap.innerHTML = "";
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Campaign", "Audience", "Segment", "Sent", "Recipients", "Delivered", "Open rate", "Click rate", "Unsubs", "Status"].map((h) => el("th", {}, h)))),
  ]);
  const tbody = el("tbody");
  state.campaigns.filter((cm) => !audienceFilter || cm.audience === audienceFilter).sort((a, b) => (a.sentDate < b.sentDate ? 1 : -1)).forEach((cm) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, cm.name),
      el("td", {}, el("span", { class: "badge badge-navy" }, cm.audience)),
      el("td", { class: "cell-muted" }, cm.segment),
      el("td", {}, fmtDate(cm.sentDate)),
      el("td", {}, cm.recipients ? cm.recipients.toLocaleString() : "—"),
      el("td", {}, cm.deliveredRate != null ? el("span", { class: "badge " + rateClass(cm.deliveredRate, "delivered") }, cm.deliveredRate + "%") : "—"),
      el("td", {}, cm.openRate != null ? el("span", { class: "badge " + rateClass(cm.openRate, "open") }, cm.openRate + "%") : "—"),
      el("td", {}, cm.clickRate != null ? el("span", { class: "badge " + rateClass(cm.clickRate, "click") }, cm.clickRate + "%") : "—"),
      el("td", { class: "cell-muted" }, cm.unsubscribes != null ? String(cm.unsubscribes) : "—"),
      el("td", {}, el("span", { class: "badge " + (cm.status === "Sent" ? "badge-success" : "badge-neutral") }, cm.status)),
    ]));
  });
  if (!tbody.children.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "10", class: "cell-muted" }, "No campaigns yet.")));
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function refreshAllCampaignViews() {
  renderCampaignSummary(byId("campaign-summary-strip"), null);
  renderCampaignsTable(byId("campaigns-table"), null);
  renderCampaignSummary(byId("nonmember-campaign-summary"), "Non-members");
  renderCampaignsTable(byId("nonmember-campaigns-table"), "Non-members");
}
function renderNewsletterSend() {
  buildCampaignComposer(byId("campaign-builder"), { mode: "newsletter", onSent: refreshAllCampaignViews });
}
function renderNewsletterHistory() {
  renderCampaignSummary(byId("campaign-summary-strip"), null);
  renderCampaignsTable(byId("campaigns-table"), null);
}
function renderSubscribers() {
  byId("subscriber-add-btn").onclick = () => openSubscriberForm();
  const wrap = byId("subscribers-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Email", "Source", "Subscribed", "Status", ""].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.subscribers.forEach((s) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, s.name),
      el("td", { class: "cell-muted" }, s.email),
      el("td", { class: "cell-muted" }, s.source),
      el("td", {}, fmtDate(s.subscribedDate)),
      el("td", {}, el("span", { class: "badge " + (s.unsubscribed ? "badge-danger" : "badge-success") }, s.unsubscribed ? "Unsubscribed" : "Subscribed")),
      el("td", {}, el("button", { class: "btn btn-sm", onclick: () => { s.unsubscribed = !s.unsubscribed; renderSubscribers(); } }, s.unsubscribed ? "Resubscribe" : "Unsubscribe")),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openSubscriberForm() {
  const panel = byId("subscriber-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Name" });
  const emailInput = el("input", { type: "text", placeholder: "Email" });
  const sourceInput = el("input", { type: "text", value: "Manually added", placeholder: "Source" });
  panel.append(
    el("h3", {}, "Add subscriber"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Email"), emailInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Source"), sourceInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!emailInput.value.trim()) { showToast("Email is required.", "info"); return; }
          state.subscribers.unshift({ id: genId("s"), name: nameInput.value.trim() || "—", email: emailInput.value.trim(), source: sourceInput.value.trim() || "Manually added", subscribedDate: TODAY, unsubscribed: false });
          panel.style.display = "none";
          showToast("Subscriber added.", "success");
          renderSubscribers();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}
function renderUnsubEditor() {
  const wrap = byId("unsub-editor");
  wrap.innerHTML = "";
  const headingInput = el("input", { type: "text", value: state.unsubscribePage.heading });
  const bodyTextarea = el("textarea", { rows: "4" }, state.unsubscribePage.body);
  const previewBox = el("div", { class: "email-preview" }, [el("h3", {}, state.unsubscribePage.heading), el("p", {}, state.unsubscribePage.body)]);
  wrap.append(
    el("div", { class: "form-row" }, [el("label", {}, "Heading"), headingInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Body"), bodyTextarea]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          state.unsubscribePage.heading = headingInput.value;
          state.unsubscribePage.body = bodyTextarea.value;
          showToast("Unsubscribe page updated.", "success");
          renderUnsubEditor();
        },
      }, "Save"),
    ]),
    el("div", { class: "cell-muted", style: "margin-top:14px;" }, "Live preview:"),
    previewBox
  );
}

// -------------------------------------------------------------------- events
function renderEvents() {
  const cevent = INTEGRATIONS.find((i) => i.id === "cevent");
  byId("events-sync-status").textContent = state.eventsSynced ? "Synced with CEvent — up to date" : `Last synced from CEvent: ${cevent.lastSync}`;
  byId("events-sync-btn").onclick = () => {
    if (state.eventsSynced) { showToast("Already up to date with CEvent.", "info"); return; }
    EVENTS_PENDING_SYNC.forEach((e) => state.events.push({ ...e }));
    state.eventsSynced = true;
    logSync(`CEvent sync: ${EVENTS_PENDING_SYNC.length} new event(s) pulled in`);
    showToast(`${EVENTS_PENDING_SYNC.length} new event(s) synced from CEvent.`, "success");
    renderEvents();
  };
  byId("event-add-btn").onclick = () => openEventForm();

  const wrap = byId("events-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Event", "Date", "Format", "Audience", "Registrations", "Published", ""].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.events.forEach((e) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, e.name),
      el("td", {}, fmtDate(e.date)),
      el("td", {}, el("span", { class: "badge badge-navy" }, e.format)),
      el("td", { class: "cell-muted" }, e.audience),
      el("td", {}, String(e.registrations)),
      el("td", {}, el("span", { class: "badge " + (e.published ? "badge-success" : "badge-neutral") }, e.published ? "Published" : "Draft")),
      el("td", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm", onclick: () => { logSync(`Reminder email sent to ${e.registrations} registrants: "${e.name}"`); showToast(`Reminder sent to ${e.registrations} registrants.`, "success"); } }, "Notify"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { e.published = !e.published; renderEvents(); showToast(`"${e.name}" is now ${e.published ? "published" : "a draft"}.`, "success"); } }, e.published ? "Unpublish" : "Publish"),
      ]),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openEventForm() {
  const panel = byId("event-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Event name" });
  const dateInput = el("input", { type: "date", value: TODAY });
  const formatSelect = el("select", {}, ["In-person", "Webinar", "Online"].map((f) => el("option", { value: f }, f)));
  const audienceInput = el("input", { type: "text", value: "Members + Non-members", placeholder: "Audience" });
  panel.append(
    el("h3", {}, "Add event"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Date"), dateInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Format"), formatSelect]),
    el("div", { class: "form-row" }, [el("label", {}, "Audience"), audienceInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Event name is required.", "info"); return; }
          state.events.push({ id: genId("e"), name: nameInput.value.trim(), date: dateInput.value, format: formatSelect.value, registrations: 0, audience: audienceInput.value.trim(), published: false });
          panel.style.display = "none";
          showToast("Event added as a draft.", "success");
          renderEvents();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ------------------------------------------------------------------ training
function renderTraining() {
  const cevent = INTEGRATIONS.find((i) => i.id === "cevent");
  byId("training-sync-status").textContent = state.trainingsSynced ? "Synced with CEvent — up to date" : `Last synced from CEvent: ${cevent.lastSync}`;
  byId("training-sync-btn").onclick = () => {
    if (state.trainingsSynced) { showToast("Already up to date with CEvent.", "info"); return; }
    TRAININGS_PENDING_SYNC.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsSynced = true;
    logSync(`CEvent sync: ${TRAININGS_PENDING_SYNC.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC.length} new training record(s) synced from CEvent.`, "success");
    renderTraining();
  };
  byId("training-add-btn").onclick = () => openTrainingForm();

  const wrap = byId("training-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Course", "Date", "Format", "Hours", "Audience", "Registrations", "Published", ""].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.trainings.forEach((t) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, t.name),
      el("td", {}, fmtDate(t.date)),
      el("td", {}, el("span", { class: "badge badge-teal" }, t.format)),
      el("td", {}, t.hours + "h"),
      el("td", { class: "cell-muted" }, t.audience),
      el("td", {}, String(t.registrations)),
      el("td", {}, el("span", { class: "badge " + (t.published ? "badge-success" : "badge-neutral") }, t.published ? "Published" : "Draft")),
      el("td", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm", onclick: () => { logSync(`Info pack sent to ${t.registrations} registrants: "${t.name}"`); showToast(`Info pack sent to ${t.registrations} registrants.`, "success"); } }, "Send pack"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { t.published = !t.published; renderTraining(); showToast(`"${t.name}" is now ${t.published ? "published" : "a draft"}.`, "success"); } }, t.published ? "Unpublish" : "Publish"),
      ]),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openTrainingForm() {
  const panel = byId("training-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Course name" });
  const dateInput = el("input", { type: "date", value: TODAY });
  const formatSelect = el("select", {}, ["Certification", "Short course", "Info session"].map((f) => el("option", { value: f }, f)));
  const hoursInput = el("input", { type: "number", value: "8", min: "1" });
  const audienceInput = el("input", { type: "text", value: "All contacts", placeholder: "Audience" });
  panel.append(
    el("h3", {}, "Add training"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Date"), dateInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Format"), formatSelect]),
    el("div", { class: "form-row" }, [el("label", {}, "Hours"), hoursInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Audience"), audienceInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Course name is required.", "info"); return; }
          state.trainings.push({ id: genId("t"), name: nameInput.value.trim(), date: dateInput.value, format: formatSelect.value, hours: Number(hoursInput.value) || 1, registrations: 0, audience: audienceInput.value.trim(), published: false });
          panel.style.display = "none";
          showToast("Training added as a draft.", "success");
          renderTraining();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ------------------------------------------------------------------ benefits
function benefitRequiredFieldsMet(b) {
  if (b.category === "Events" || b.category === "Training") return !!(b.discountRate && b.discountRate.trim());
  if (b.category === "Third-Party Discount") return !!(b.stepsToAvail?.trim() && b.eligibility?.trim() && b.discountAmount?.trim());
  return true;
}
function renderBenefits() {
  byId("benefits-count").textContent = `${state.benefits.length} benefits · ${state.benefits.filter((b) => b.status === "Published").length} published, ${state.benefits.filter((b) => b.status === "Draft").length} draft`;
  byId("benefit-add-btn").onclick = () => openBenefitForm(null);

  const grid = byId("benefits-grid");
  grid.innerHTML = "";
  state.benefits.forEach((b) => {
    const extraLines = [];
    if (b.category === "Events" || b.category === "Training") {
      if (b.discountRate) extraLines.push(el("div", { class: "benefit-card__meta" }, `Member rate: ${b.discountRate}`));
    } else if (b.category === "Third-Party Discount") {
      if (b.discountAmount) extraLines.push(el("div", { class: "benefit-card__meta" }, `Discount: ${b.discountAmount}`));
      if (b.eligibility) extraLines.push(el("div", { class: "benefit-card__meta" }, `Eligibility: ${b.eligibility}`));
      if (b.stepsToAvail) extraLines.push(el("div", { class: "benefit-card__meta" }, `How to claim: ${b.stepsToAvail}`));
    }
    grid.append(
      el("div", { class: "benefit-card" }, [
        el("div", { class: "benefit-card__top" }, [
          el("span", { class: "badge badge-navy" }, b.category),
          el("span", { class: "badge " + (b.status === "Published" ? "badge-success" : "badge-warning") }, b.status),
        ]),
        el("h3", {}, b.title),
        el("p", { class: "benefit-card__desc" }, b.description),
        ...extraLines,
        el("div", { class: "benefit-card__tiers" }, b.tiers.map((t) => el("span", { class: "badge badge-neutral" }, t))),
        el("div", { class: "benefit-card__meta" }, `Updated ${fmtDate(b.updated)}`),
        el("div", { class: "benefit-card__actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openBenefitForm(b.id) }, "Edit"),
          el("button", { class: "btn btn-sm", onclick: () => toggleBenefitStatus(b.id) }, b.status === "Published" ? "Unpublish" : "Publish"),
        ]),
      ])
    );
  });
}
function toggleBenefitStatus(id) {
  const b = state.benefits.find((x) => x.id === id);
  if (b.status !== "Published" && !benefitRequiredFieldsMet(b)) {
    const msg = (b.category === "Events" || b.category === "Training")
      ? `Add the member discount rate before publishing "${b.title}".`
      : `Add steps to avail, eligibility and the discount amount before publishing "${b.title}".`;
    showToast(msg, "info");
    return;
  }
  b.status = b.status === "Published" ? "Draft" : "Published";
  b.updated = TODAY;
  showToast(`"${b.title}" is now ${b.status}.`, "success");
  renderBenefits();
}
function openBenefitForm(id) {
  state.editingBenefitId = id;
  const b = id ? state.benefits.find((x) => x.id === id) : { title: "", category: BENEFIT_CATEGORIES[0], description: "", tiers: [], status: "Draft", discountRate: "", stepsToAvail: "", eligibility: "", discountAmount: "" };
  const panel = byId("benefit-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";

  const titleInput = el("input", { type: "text", value: b.title, placeholder: "Benefit title" });
  const categorySelect = el("select", {}, BENEFIT_CATEGORIES.map((c) => el("option", { value: c }, c)));
  categorySelect.value = b.category;
  const descInput = el("textarea", { rows: "3", placeholder: "Description" }, b.description);
  const tierBoxes = MEMBER_CATEGORIES.map((cat) => {
    const box = el("input", { type: "checkbox" });
    box.checked = b.tiers.includes(cat);
    return el("label", { class: "tier-check" }, [box, " " + cat]);
  });
  const conditionalHost = el("div", {});
  function renderConditionalFields() {
    conditionalHost.innerHTML = "";
    if (categorySelect.value === "Events" || categorySelect.value === "Training") {
      const discountInput = el("input", { type: "text", value: b.discountRate || "", placeholder: "e.g. 20% off standard registration" });
      discountInput.dataset.field = "discountRate";
      conditionalHost.append(el("div", { class: "form-row" }, [el("label", {}, "Member discount / rate — required to publish"), discountInput]));
    } else if (categorySelect.value === "Third-Party Discount") {
      const stepsInput = el("textarea", { rows: "2", placeholder: "How does a member claim this?" }, b.stepsToAvail || "");
      stepsInput.dataset.field = "stepsToAvail";
      const eligInput = el("input", { type: "text", value: b.eligibility || "", placeholder: "Who is eligible?" });
      eligInput.dataset.field = "eligibility";
      const amountInput = el("input", { type: "text", value: b.discountAmount || "", placeholder: "How much? e.g. 15% off" });
      amountInput.dataset.field = "discountAmount";
      conditionalHost.append(
        el("div", { class: "form-row" }, [el("label", {}, "Steps to avail — required to publish"), stepsInput]),
        el("div", { class: "form-row" }, [el("label", {}, "Eligibility — required to publish"), eligInput]),
        el("div", { class: "form-row" }, [el("label", {}, "Discount amount — required to publish"), amountInput])
      );
    }
  }
  categorySelect.onchange = renderConditionalFields;

  panel.append(
    el("h3", {}, id ? "Edit benefit" : "Add benefit"),
    el("div", { class: "form-row" }, [el("label", {}, "Title"), titleInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Category"), categorySelect]),
    el("div", { class: "form-row" }, [el("label", {}, "Description"), descInput]),
    conditionalHost,
    el("div", { class: "form-row" }, [el("label", {}, "Member tiers"), el("div", { class: "tier-check-group" }, tierBoxes)]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          const tiers = tierBoxes.filter((l) => l.querySelector("input").checked).map((l) => l.textContent.trim());
          const getField = (name) => conditionalHost.querySelector(`[data-field="${name}"]`)?.value.trim() || "";
          const payload = {
            title: titleInput.value.trim() || "Untitled benefit", category: categorySelect.value, description: descInput.value.trim(), tiers, updated: TODAY,
            discountRate: getField("discountRate"), stepsToAvail: getField("stepsToAvail"), eligibility: getField("eligibility"), discountAmount: getField("discountAmount"),
          };
          if (id) Object.assign(b, payload);
          else state.benefits.unshift({ id: genId("b"), status: "Draft", ...payload });
          panel.style.display = "none";
          showToast(id ? "Benefit updated." : "Benefit added as draft.", "success");
          renderBenefits();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
  renderConditionalFields();
}

// --------------------------------------------------------------- non-members
function contactMatchesFilter(n, filterValue) {
  if (!filterValue) return true;
  if (filterValue === "__none__") return !n.lists || n.lists.length === 0;
  return n.lists && n.lists.includes(filterValue);
}
function listBadges(listIds) {
  if (!listIds || !listIds.length) return el("span", { class: "cell-muted" }, "—");
  return el("div", {}, listIds.map((id) => el("span", { class: "badge badge-neutral", style: "margin:0 4px 4px 0;display:inline-flex;" }, state.nonMemberLists.find((l) => l.id === id)?.name || id)));
}
function renderNonMemberContacts() {
  const filterSel = byId("contact-filter-list");
  if (filterSel.options.length <= 2) state.nonMemberLists.forEach((l) => filterSel.append(el("option", { value: l.id }, l.name)));
  byId("contact-add-btn").onclick = () => openContactForm(null);
  byId("contact-bulk-btn").onclick = () => openBulkUploadForm();

  const draw = () => {
    const q = byId("contact-search").value.trim().toLowerCase();
    const filterValue = filterSel.value;
    const wrap = byId("nonmembers-list");
    wrap.innerHTML = "";
    const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Contact", "Lists", "Consent", "Subscribed", "History / last touch", ""].map((h) => el("th", {}, h))))]);
    const tbody = el("tbody");
    state.nonMembers
      .filter((n) => contactMatchesFilter(n, filterValue))
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.contact.toLowerCase().includes(q) || (n.email || "").toLowerCase().includes(q))
      .forEach((n) => {
        tbody.appendChild(el("tr", {}, [
          el("td", { class: "cell-primary" }, n.name),
          el("td", { class: "cell-muted" }, n.contact),
          el("td", {}, listBadges(n.lists)),
          el("td", {}, el("span", { class: "badge " + (n.consent ? "badge-success" : "badge-danger") }, n.consent ? "Yes" : "No")),
          el("td", {}, el("span", { class: "badge " + (n.unsubscribed ? "badge-danger" : "badge-success") }, n.unsubscribed ? "Unsubscribed" : "Subscribed")),
          el("td", { class: "cell-muted" }, `${n.history} · ${n.lastTouch}`),
          el("td", {}, el("button", { class: "btn btn-sm", onclick: () => openContactForm(n.id) }, "Edit")),
        ]));
      });
    if (!filterValue) {
      state.companies.filter((c) => c.memberState === "lapsed").forEach((c) => {
        if (q && !c.name.toLowerCase().includes(q)) return;
        const primary = c.people.find((p) => p.primary) || c.people[0];
        tbody.appendChild(el("tr", { class: "clickable", onclick: () => openDrawer(c.id) }, [
          el("td", { class: "cell-primary" }, c.name),
          el("td", { class: "cell-muted" }, primary?.name || "—"),
          el("td", {}, el("span", { class: "badge badge-danger" }, "Former Member")),
          el("td", {}, el("span", { class: "badge badge-success" }, "Yes")),
          el("td", {}, el("span", { class: "badge badge-success" }, "Subscribed")),
          el("td", { class: "cell-muted" }, `Member ${fmtDate(c.joinDate)} – ${fmtDate(c.renewalDate)}, lapsed`),
          el("td", {}, el("span", { class: "cell-muted" }, "Company")),
        ]));
      });
    }
    if (!tbody.children.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "7", class: "cell-muted" }, "No contacts match this search.")));
    table.appendChild(tbody);
    wrap.appendChild(table);
  };
  byId("contact-search").oninput = draw;
  filterSel.onchange = draw;
  draw();
}
function openContactForm(id) {
  const n = id ? state.nonMembers.find((x) => x.id === id) : { name: "", contact: "", email: "", history: "", lastTouch: "", lists: [], consent: true, unsubscribed: false };
  const panel = byId("contact-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", value: n.name, placeholder: "Business or individual name" });
  const contactInput = el("input", { type: "text", value: n.contact, placeholder: "Contact person" });
  const emailInput = el("input", { type: "text", value: n.email, placeholder: "Email" });
  const consentBox = el("input", { type: "checkbox" }); consentBox.checked = n.consent;
  const unsubBox = el("input", { type: "checkbox" }); unsubBox.checked = n.unsubscribed;
  const listBoxes = state.nonMemberLists.map((list) => {
    const box = el("input", { type: "checkbox" });
    box.checked = n.lists.includes(list.id);
    box.dataset.listId = list.id;
    return el("label", { class: "tier-check" }, [box, " " + list.name]);
  });
  panel.append(
    el("h3", {}, id ? "Edit contact" : "Add contact"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Contact person"), contactInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Email"), emailInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Lists (one or more)"), el("div", { class: "tier-check-group" }, listBoxes)]),
    el("div", { class: "campaign-row" }, [
      el("label", { class: "tier-check" }, [consentBox, " Marketing consent given"]),
      el("label", { class: "tier-check" }, [unsubBox, " Unsubscribed"]),
    ]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Name is required.", "info"); return; }
          const lists = listBoxes.filter((l) => l.querySelector("input").checked).map((l) => l.querySelector("input").dataset.listId);
          const payload = { name: nameInput.value.trim(), contact: contactInput.value.trim(), email: emailInput.value.trim(), lists, consent: consentBox.checked, unsubscribed: unsubBox.checked };
          if (id) Object.assign(n, payload);
          else state.nonMembers.unshift({ id: genId("n"), history: "Manually added", lastTouch: "Added " + fmtDate(TODAY), ...payload });
          panel.style.display = "none";
          showToast(id ? "Contact updated." : "Contact added.", "success");
          renderNonMemberContacts();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}
function openBulkUploadForm() {
  const panel = byId("contact-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const textarea = el("textarea", { rows: "6", placeholder: "One per line: Name, Contact person, Email" });
  const listBoxes = state.nonMemberLists.map((list) => {
    const box = el("input", { type: "checkbox" });
    box.dataset.listId = list.id;
    return el("label", { class: "tier-check" }, [box, " " + list.name]);
  });
  panel.append(
    el("h3", {}, "Bulk upload contacts"),
    el("p", { class: "cell-muted" }, "Paste one contact per line as Name, Contact person, Email. Assign list(s) to apply to everyone uploaded — consent is assumed given unless changed later."),
    el("div", { class: "form-row" }, [el("label", {}, "Contacts (CSV-style)"), textarea]),
    el("div", { class: "form-row" }, [el("label", {}, "Assign to list(s)"), el("div", { class: "tier-check-group" }, listBoxes)]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          const lists = listBoxes.filter((l) => l.querySelector("input").checked).map((l) => l.querySelector("input").dataset.listId);
          const lines = textarea.value.split("\n").map((l) => l.trim()).filter(Boolean);
          let count = 0;
          lines.forEach((line) => {
            const [name, contact, email] = line.split(",").map((x) => (x || "").trim());
            if (!name) return;
            state.nonMembers.unshift({ id: genId("n"), name, contact: contact || "—", email: email || "—", history: "Bulk uploaded", lastTouch: "Uploaded " + fmtDate(TODAY), lists, consent: true, unsubscribed: false });
            count++;
          });
          panel.style.display = "none";
          showToast(`${count} contact${count === 1 ? "" : "s"} uploaded${lists.length ? " and added to " + lists.length + " list(s)" : ""}.`, "success");
          renderNonMemberContacts();
        },
      }, "Upload"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}
function renderNonMemberListsGrid() {
  byId("list-add-btn").onclick = () => openListForm(null);
  const listsWrap = byId("nonmember-lists-grid");
  listsWrap.innerHTML = "";
  state.nonMemberLists.forEach((list) => {
    let count = state.nonMembers.filter((n) => n.lists.includes(list.id)).length;
    if (list.id === "l3") count += state.companies.filter((c) => c.memberState === "lapsed").length;
    listsWrap.append(el("div", { class: "stat-card" }, [
      el("div", { class: "stat-card__label" }, list.name),
      el("div", { class: "stat-card__value" }, String(count)),
      el("div", { class: "stat-card__sub" }, list.description),
      el("button", { class: "btn btn-sm", style: "margin-top:10px;", onclick: () => openListForm(list.id) }, "Edit"),
    ]));
  });
}
function openListForm(id) {
  const list = id ? state.nonMemberLists.find((x) => x.id === id) : { name: "", description: "" };
  const panel = byId("list-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", value: list.name, placeholder: "List name" });
  const descInput = el("input", { type: "text", value: list.description, placeholder: "Description" });
  panel.append(
    el("h3", {}, id ? "Edit list" : "Add list"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Description"), descInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("List name is required.", "info"); return; }
          if (id) { list.name = nameInput.value.trim(); list.description = descInput.value.trim(); }
          else state.nonMemberLists.push({ id: genId("l"), name: nameInput.value.trim(), description: descInput.value.trim() });
          panel.style.display = "none";
          showToast(id ? "List updated." : "List created.", "success");
          renderNonMemberListsGrid();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}
function renderNonMemberCampaignsTab() {
  renderCampaignSummary(byId("nonmember-campaign-summary"), "Non-members");
  buildCampaignComposer(byId("nonmember-campaign-builder"), { mode: "nonmember", onSent: refreshAllCampaignViews });
  renderCampaignsTable(byId("nonmember-campaigns-table"), "Non-members");
}

// ----------------------------------------------------------------- automation
function renderAutomation() {
  renderWorkflowList("workflow-onboarding", "onboarding");
  renderWorkflowList("workflow-renewal", "renewal");
  renderWorkflowList("workflow-offboarding", "offboarding");
}
function renderWorkflowList(containerId, category) {
  const wrap = byId(containerId);
  wrap.innerHTML = "";
  state.workflows[category].forEach((step) => {
    const row = el("div", { class: "workflow-row" });
    const top = el("div", { class: "workflow-row__top" }, [
      el("div", { class: "workflow-row__name" }, step.name),
      el("button", { class: "btn btn-sm " + (step.active ? "" : "btn-ghost"), onclick: () => { step.active = !step.active; renderAutomation(); showToast(`"${step.name}" is now ${step.active ? "active" : "paused"}.`, "info"); } }, step.active ? "Active" : "Paused"),
    ]);
    const meta = el("div", { class: "workflow-row__meta" }, [
      el("span", {}, [el("b", {}, "Trigger: "), step.trigger]),
      el("span", {}, [el("b", {}, "Delay: "), step.delay]),
      el("span", {}, [el("b", {}, "Audience: "), step.audience]),
    ]);
    const subjectLine = el("div", { class: "workflow-row__subject" }, `“${step.subject}”`);
    const editBtn = el("button", { class: "btn btn-sm btn-ghost", onclick: () => toggleEdit() }, "Edit template");
    row.append(top, meta, subjectLine, editBtn);
    function toggleEdit() {
      if (row.querySelector(".workflow-editor")) { row.querySelector(".workflow-editor").remove(); return; }
      const input = el("input", { type: "text", value: step.subject });
      const editor = el("div", { class: "workflow-editor" }, [
        el("label", {}, "Subject line"),
        input,
        el("div", { class: "campaign-row" }, [
          el("button", { class: "btn btn-sm btn-primary", onclick: () => { step.subject = input.value; showToast("Template updated.", "success"); renderAutomation(); } }, "Save"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: () => editor.remove() }, "Cancel"),
        ]),
      ]);
      row.appendChild(editor);
    }
    wrap.appendChild(row);
  });
}

// -------------------------------------------------------------- website (cms)
function renderCmsSection() {
  const subtabWrap = byId("cms-subtabs");
  const panelsWrap = byId("cms-panels");
  if (!subtabWrap.children.length) {
    CMS_TYPES.forEach((t) => subtabWrap.append(el("button", { class: "subtab-btn", "data-subtab": "cms-" + t.key }, t.label)));
    CMS_TYPES.forEach((t) => panelsWrap.append(el("div", { class: "subtab-panel", id: "cms-" + t.key })));
  }
  switchSubtab("cms", state.subtab.cms);
}
function renderCmsPanel(key) {
  const panel = byId("cms-" + key);
  if (!panel) return;
  panel.innerHTML = "";
  const typeLabel = CMS_TYPES.find((t) => t.key === key)?.label || key;
  const toolbar = el("div", { class: "toolbar" }, [
    el("span", { class: "cell-muted" }, `${state.cms[key].length} items`),
    el("button", { class: "btn btn-primary", style: "margin-left:auto;", onclick: () => openCmsForm(key, null) }, `+ Add ${typeLabel.replace(/s$/, "")}`),
  ]);
  const formHost = el("div", { class: "panel cms-form-host", style: "display:none;" });
  const grid = el("div", { class: "benefits-grid" });
  state.cms[key].forEach((item) => {
    grid.append(
      el("div", { class: "benefit-card" }, [
        el("div", { class: "benefit-card__top" }, [
          el("span", { class: "badge badge-navy" }, typeLabel),
          el("span", { class: "badge " + (item.status === "Published" ? "badge-success" : "badge-warning") }, item.status),
        ]),
        el("h3", {}, item.title),
        el("p", { class: "benefit-card__desc" }, item.summary),
        el("div", { class: "benefit-card__meta" }, `Updated ${fmtDate(item.updated)}`),
        el("div", { class: "benefit-card__actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openCmsForm(key, item.id) }, "Edit"),
          el("button", { class: "btn btn-sm", onclick: () => { item.status = item.status === "Published" ? "Draft" : "Published"; item.updated = TODAY; renderCmsPanel(key); showToast(`"${item.title}" is now ${item.status}.`, "success"); } }, item.status === "Published" ? "Unpublish" : "Publish"),
        ]),
      ])
    );
  });
  panel.append(toolbar, formHost, grid);

  function openCmsForm(k, id) {
    const item = id ? state.cms[k].find((x) => x.id === id) : { title: "", summary: "", status: "Draft" };
    formHost.style.display = "block";
    formHost.innerHTML = "";
    const titleInput = el("input", { type: "text", value: item.title, placeholder: "Title" });
    const summaryInput = el("textarea", { rows: "3", placeholder: "Summary" }, item.summary);
    formHost.append(
      el("h3", {}, id ? "Edit" : "Add " + typeLabel.replace(/s$/, "")),
      el("div", { class: "form-row" }, [el("label", {}, "Title"), titleInput]),
      el("div", { class: "form-row" }, [el("label", {}, "Summary"), summaryInput]),
      el("div", { class: "campaign-row" }, [
        el("button", {
          class: "btn btn-primary",
          onclick: () => {
            const payload = { title: titleInput.value.trim() || "Untitled", summary: summaryInput.value.trim(), updated: TODAY };
            if (id) Object.assign(item, payload);
            else state.cms[k].unshift({ id: genId(k), status: "Draft", ...payload });
            formHost.style.display = "none";
            showToast(id ? "Updated." : "Added as draft.", "success");
            renderCmsPanel(k);
          },
        }, "Save"),
        el("button", { class: "btn btn-ghost", onclick: () => { formHost.style.display = "none"; } }, "Cancel"),
      ])
    );
  }
}

// -------------------------------------------------------------- document gen
function renderDocGen(ids) {
  const idOf = ids || { templates: "docgen-templates", form: "docgen-form", preview: "docgen-preview" };
  const wrap = byId(idOf.templates);
  wrap.innerHTML = "";
  state.docTemplates.forEach((t) => {
    const row = el("div", { class: "workflow-row" });
    const top = el("div", { class: "workflow-row__top" }, [
      el("div", { class: "workflow-row__name" }, t.name),
      el("button", { class: "btn btn-sm " + (t.active ? "" : "btn-ghost"), onclick: () => { t.active = !t.active; renderDocGen(ids); } }, t.active ? "Active" : "Paused"),
    ]);
    const meta = el("div", { class: "workflow-row__meta" }, [el("span", {}, [el("b", {}, "Applies to: "), t.appliesTo]), el("span", {}, [el("b", {}, "Updated: "), fmtDate(t.updated)])]);
    const bodyLine = el("div", { class: "workflow-row__subject" }, t.body);
    const editBtn = el("button", { class: "btn btn-sm btn-ghost", onclick: toggleEdit }, "Edit template");
    row.append(top, meta, bodyLine, editBtn);
    function toggleEdit() {
      if (row.querySelector(".workflow-editor")) { row.querySelector(".workflow-editor").remove(); return; }
      const textarea = el("textarea", { rows: "3" }, t.body);
      const editor = el("div", { class: "workflow-editor" }, [
        el("label", {}, "Template body (use {{merge_fields}})"),
        textarea,
        el("div", { class: "campaign-row" }, [
          el("button", { class: "btn btn-sm btn-primary", onclick: () => { t.body = textarea.value; showToast("Template updated.", "success"); renderDocGen(ids); } }, "Save"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: () => editor.remove() }, "Cancel"),
        ]),
      ]);
      row.appendChild(editor);
    }
    wrap.appendChild(row);
  });

  const form = byId(idOf.form);
  form.innerHTML = "";
  const companySelect = el("select", {}, state.companies.map((c) => el("option", { value: c.id }, c.name)));
  const templateSelect = el("select", {}, state.docTemplates.filter((t) => t.active).map((t) => el("option", { value: t.id }, t.name)));
  form.append(
    el("div", { class: "campaign-row" }, [el("label", {}, "Company:"), companySelect, el("label", {}, "Template:"), templateSelect]),
    el("div", { class: "campaign-row" }, [
      el("button", { class: "btn btn-primary", onclick: () => generateDocument(companySelect.value, templateSelect.value, idOf.preview) }, "Generate document"),
    ])
  );
}
function generateDocument(companyId, templateId, previewId) {
  const c = state.companies.find((x) => x.id === companyId);
  const t = state.docTemplates.find((x) => x.id === templateId);
  const primary = c.people.find((p) => p.primary) || c.people[0];
  const merged = t.body
    .replaceAll("{{company_name}}", c.name)
    .replaceAll("{{category}}", c.category)
    .replaceAll("{{member_since}}", fmtDate(c.joinDate))
    .replaceAll("{{renewal_date}}", fmtDate(c.renewalDate))
    .replaceAll("{{primary_contact}}", primary ? primary.name : "—")
    .replaceAll("{{abn}}", c.abn)
    .replaceAll("{{invoice_no}}", c.xero?.invoiceNo || "—");
  const preview = byId(previewId || "docgen-preview");
  preview.style.display = "block";
  preview.innerHTML = "";
  preview.append(el("h3", {}, `${t.name} — ${c.name}`), el("p", {}, merged));
  addTimeline(c, "document", `Generated document: ${t.name}`);
  showToast(`"${t.name}" generated for ${c.name}.`, "success");
}

// -------------------------------------------------------------- handbook
function renderHandbookPanel(targetId) {
  const panel = byId(targetId || "handbook-panel");
  panel.innerHTML = "";
  panel.append(
    el("div", { class: "panel" }, [
      el("dl", { class: "drawer-kv", style: "grid-template-columns:160px 1fr;" }, [
        el("dt", {}, "Handbook"), el("dd", {}, HANDBOOK.name),
        el("dt", {}, "System"), el("dd", {}, HANDBOOK.system),
        el("dt", {}, "Sections"), el("dd", {}, String(HANDBOOK.sections)),
        el("dt", {}, "Last published"), el("dd", {}, fmtDate(HANDBOOK.lastPublished)),
      ]),
      el("div", { class: "campaign-row", style: "margin-top:12px;" }, [
        el("button", { class: "btn btn-primary", onclick: () => showToast("Opens " + HANDBOOK.editUrl + " (separate system).", "info") }, "Edit handbook"),
        el("button", { class: "btn", onclick: () => showToast("Opens " + HANDBOOK.viewUrl + " (separate system).", "info") }, "View live handbook"),
      ]),
    ])
  );
}

// -------------------------------------------------------------- integrations
function renderIntegrations() {
  const grid = byId("integrations-grid");
  grid.innerHTML = "";
  INTEGRATIONS.forEach((i) => {
    grid.append(
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-card__label" }, i.name),
        el("div", { class: "stat-card__value", style: "font-size:18px;" }, [el("span", { class: "badge badge-success" }, "Connected")]),
        el("div", { class: "stat-card__sub" }, i.role),
        el("div", { class: "stat-card__sub" }, "Last sync: " + i.lastSync),
      ])
    );
  });
  const log = byId("sync-log");
  log.innerHTML = "";
  state.syncLog.forEach((s) => {
    log.append(el("div", { class: "activity-item" }, [el("div", { class: "activity-item__date" }, s.date), el("div", {}, s.label)]));
  });
}

// -------------------------------------------------------------------- users
function renderUsersView() {
  switchSubtab("users", state.subtab.users);
}
function renderUsers() {
  const wrap = byId("users-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Email", "Role", "Status", "Last active", "Chats", "Messages", "Docs generated"].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  USERS.forEach((u) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, u.name),
      el("td", { class: "cell-muted" }, u.email),
      el("td", {}, el("span", { class: "badge badge-navy" }, u.role)),
      el("td", {}, el("span", { class: "badge " + (u.status === "Active" ? "badge-success" : "badge-warning") }, u.status)),
      el("td", { class: "cell-muted" }, u.lastActive === "—" ? "—" : fmtDate(u.lastActive)),
      el("td", {}, String(u.chats ?? 0)),
      el("td", {}, String(u.messages ?? 0)),
      el("td", {}, String(u.documentsGenerated ?? 0)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function renderUsersUsage() {
  const grid = byId("users-usage-grid");
  grid.innerHTML = "";
  const totalChats = USERS.reduce((s, u) => s + (u.chats || 0), 0);
  const totalMessages = USERS.reduce((s, u) => s + (u.messages || 0), 0);
  const totalDocs = USERS.reduce((s, u) => s + (u.documentsGenerated || 0), 0);
  grid.append(
    statCard("Total chats", totalChats, "Across all users", ""),
    statCard("Messages sent", totalMessages, "Across all users", "accent-teal"),
    statCard("Documents generated", totalDocs, "Across all users", "accent-orange"),
    statCard("Active users", USERS.filter((u) => u.status === "Active").length, `of ${USERS.length} total`, "")
  );
}

// ------------------------------------------------------- platform view (orgs)
function renderOrganizations() {
  byId("org-count").textContent = `${ORGANIZATIONS.length} organizations`;
  byId("org-add-btn").onclick = () => openOrgForm();
  const wrap = byId("organizations-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Organization", "Status", "Users", "Created"].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  ORGANIZATIONS.forEach((o) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, o.name),
      el("td", {}, el("span", { class: "badge " + (o.status === "Active" ? "badge-success" : "badge-warning") }, o.status)),
      el("td", {}, String(o.users)),
      el("td", { class: "cell-muted" }, fmtDate(o.createdDate)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openOrgForm() {
  const panel = byId("org-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Organization name" });
  panel.append(
    el("h3", {}, "Add organization"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Organization name is required.", "info"); return; }
          ORGANIZATIONS.push({ id: genId("org"), name: nameInput.value.trim(), status: "Invited", users: 0, createdDate: TODAY });
          panel.style.display = "none";
          showToast("Organization added.", "success");
          renderOrganizations();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ------------------------------------------------- platform view (events/training)
function renderEventsSimple() {
  const moodleLike = INTEGRATIONS.find((i) => i.id === "cevent");
  byId("pevents-sync-status").textContent = state.eventsSynced ? "Synced with CEvent — up to date" : `Last synced from CEvent: ${moodleLike.lastSync}`;
  byId("pevents-sync-btn").onclick = () => {
    if (state.eventsSynced) { showToast("Already up to date with CEvent.", "info"); return; }
    EVENTS_PENDING_SYNC.forEach((e) => state.events.push({ ...e }));
    state.eventsSynced = true;
    logSync(`CEvent sync: ${EVENTS_PENDING_SYNC.length} new event(s) pulled in`);
    showToast(`${EVENTS_PENDING_SYNC.length} new event(s) synced from CEvent.`, "success");
    renderEventsSimple();
  };
  byId("pevent-add-btn").onclick = () => openPEventForm();

  const wrap = byId("pevents-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Event", "Date", "Format", "Published", ""].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.events.forEach((e) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, e.name),
      el("td", {}, fmtDate(e.date)),
      el("td", {}, el("span", { class: "badge badge-navy" }, e.format)),
      el("td", {}, el("span", { class: "badge " + (e.published ? "badge-success" : "badge-neutral") }, e.published ? "Published" : "Draft")),
      el("td", {}, el("button", { class: "btn btn-sm btn-ghost", onclick: () => { e.published = !e.published; renderEventsSimple(); showToast(`"${e.name}" is now ${e.published ? "published" : "a draft"}.`, "success"); } }, e.published ? "Unpublish" : "Publish")),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openPEventForm() {
  const panel = byId("pevent-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Event name" });
  const dateInput = el("input", { type: "date", value: TODAY });
  const formatSelect = el("select", {}, ["In-person", "Webinar", "Online"].map((f) => el("option", { value: f }, f)));
  panel.append(
    el("h3", {}, "Add event"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Date"), dateInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Format"), formatSelect]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Event name is required.", "info"); return; }
          state.events.push({ id: genId("e"), name: nameInput.value.trim(), date: dateInput.value, format: formatSelect.value, registrations: 0, audience: "", published: false });
          panel.style.display = "none";
          showToast("Event added as a draft.", "success");
          renderEventsSimple();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}
function renderTrainingSimple() {
  const moodle = INTEGRATIONS.find((i) => i.id === "moodle");
  byId("ptraining-sync-status").textContent = state.trainingsSynced ? "Synced with Moodle — up to date" : `Last synced from Moodle: ${moodle.lastSync}`;
  byId("ptraining-sync-btn").onclick = () => {
    if (state.trainingsSynced) { showToast("Already up to date with Moodle.", "info"); return; }
    TRAININGS_PENDING_SYNC.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsSynced = true;
    logSync(`Moodle sync: ${TRAININGS_PENDING_SYNC.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC.length} new training record(s) synced from Moodle.`, "success");
    renderTrainingSimple();
  };
  byId("ptraining-add-btn").onclick = () => openPTrainingForm();

  const wrap = byId("ptraining-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Course", "Date", "Format", "Hours", "Published", ""].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.trainings.forEach((t) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, t.name),
      el("td", {}, fmtDate(t.date)),
      el("td", {}, el("span", { class: "badge badge-teal" }, t.format)),
      el("td", {}, t.hours + "h"),
      el("td", {}, el("span", { class: "badge " + (t.published ? "badge-success" : "badge-neutral") }, t.published ? "Published" : "Draft")),
      el("td", {}, el("button", { class: "btn btn-sm btn-ghost", onclick: () => { t.published = !t.published; renderTrainingSimple(); showToast(`"${t.name}" is now ${t.published ? "published" : "a draft"}.`, "success"); } }, t.published ? "Unpublish" : "Publish")),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openPTrainingForm() {
  const panel = byId("ptraining-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const nameInput = el("input", { type: "text", placeholder: "Course name" });
  const dateInput = el("input", { type: "date", value: TODAY });
  const formatSelect = el("select", {}, ["Certification", "Short course", "Info session"].map((f) => el("option", { value: f }, f)));
  const hoursInput = el("input", { type: "number", value: "8", min: "1" });
  panel.append(
    el("h3", {}, "Add training"),
    el("div", { class: "form-row" }, [el("label", {}, "Name"), nameInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Date"), dateInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Format"), formatSelect]),
    el("div", { class: "form-row" }, [el("label", {}, "Hours"), hoursInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) { showToast("Course name is required.", "info"); return; }
          state.trainings.push({ id: genId("t"), name: nameInput.value.trim(), date: dateInput.value, format: formatSelect.value, hours: Number(hoursInput.value) || 1, registrations: 0, audience: "", published: false });
          panel.style.display = "none";
          showToast("Training added as a draft.", "success");
          renderTrainingSimple();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ---------------------------------------------------------- platform benefits
function renderBenefitsSimple() {
  byId("pbenefits-count").textContent = `${state.benefits.length} benefits · ${state.benefits.filter((b) => b.status === "Published").length} published, ${state.benefits.filter((b) => b.status === "Draft").length} draft`;
  byId("pbenefit-add-btn").onclick = () => openBenefitFormSimple(null);
  const grid = byId("pbenefits-grid");
  grid.innerHTML = "";
  state.benefits.forEach((b) => {
    grid.append(
      el("div", { class: "benefit-card" }, [
        el("div", { class: "benefit-card__top" }, [
          el("span", { class: "badge badge-navy" }, b.category),
          el("span", { class: "badge " + (b.status === "Published" ? "badge-success" : "badge-warning") }, b.status),
        ]),
        el("h3", {}, b.title),
        el("p", { class: "benefit-card__desc" }, b.description),
        el("div", { class: "benefit-card__meta" }, `Updated ${fmtDate(b.updated)}`),
        el("div", { class: "benefit-card__actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openBenefitFormSimple(b.id) }, "Edit"),
          el("button", { class: "btn btn-sm", onclick: () => { b.status = b.status === "Published" ? "Draft" : "Published"; b.updated = TODAY; renderBenefitsSimple(); showToast(`"${b.title}" is now ${b.status}.`, "success"); } }, b.status === "Published" ? "Unpublish" : "Publish"),
        ]),
      ])
    );
  });
}
function openBenefitFormSimple(id) {
  const b = id ? state.benefits.find((x) => x.id === id) : { title: "", category: BENEFIT_CATEGORIES[0], description: "", tiers: [], status: "Draft" };
  const panel = byId("pbenefit-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const titleInput = el("input", { type: "text", value: b.title, placeholder: "Benefit title" });
  const categorySelect = el("select", {}, BENEFIT_CATEGORIES.map((c) => el("option", { value: c }, c)));
  categorySelect.value = b.category;
  const descInput = el("textarea", { rows: "3", placeholder: "Description" }, b.description);
  panel.append(
    el("h3", {}, id ? "Edit benefit" : "Add benefit"),
    el("div", { class: "form-row" }, [el("label", {}, "Title"), titleInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Category"), categorySelect]),
    el("div", { class: "form-row" }, [el("label", {}, "Description"), descInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          const payload = { title: titleInput.value.trim() || "Untitled benefit", category: categorySelect.value, description: descInput.value.trim(), updated: TODAY };
          if (id) Object.assign(b, payload);
          else state.benefits.unshift({ id: genId("b"), status: "Draft", tiers: [], ...payload });
          panel.style.display = "none";
          showToast(id ? "Benefit updated." : "Benefit added as draft.", "success");
          renderBenefitsSimple();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ------------------------------------------------------------ lifecycle comms
function companyWorkflowCategory(c) {
  if (c.memberState === "prospect") return "onboarding";
  if (c.memberState === "lapsed") return "offboarding";
  return "renewal";
}
function companyWorkflowStatus(c, step) {
  if (!step.active) return "paused";
  const cat = companyWorkflowCategory(c);
  if (cat === "onboarding") {
    const gateIdx = ONBOARD_ORDER.indexOf(step.stageGate);
    if (gateIdx === -1) return "upcoming";
    const curIdx = ONBOARD_ORDER.indexOf(c.onboardingStage);
    if (gateIdx < curIdx) return "sent";
    if (gateIdx === curIdx) return "next";
    return "upcoming";
  }
  if (cat === "renewal") {
    const d = daysUntil(c.renewalDate);
    const rs = c.renewalStage;
    if (step.id === "rn1") return d != null && d <= 60 ? "sent" : "upcoming";
    if (step.id === "rn2") return d != null && d <= 30 ? "sent" : "upcoming";
    if (step.id === "rn3") return rs === "invoice_sent" || rs === "renewed" ? "sent" : "upcoming";
    if (step.id === "rn4") return (rs === "invoice_sent" && d != null && d <= 7) || rs === "renewed" ? "sent" : "upcoming";
    if (step.id === "rn5") return rs === "renewed" ? "sent" : "upcoming";
    return "upcoming";
  }
  if (step.id === "of1" || step.id === "of2" || step.id === "of3") return "sent";
  return "upcoming";
}
function renderCompanyComms(c) {
  const category = companyWorkflowCategory(c);
  const steps = state.workflows[category];
  const statusLabel = { sent: "Sent", next: "Next up", upcoming: "Upcoming", paused: "Paused" };
  const statusClass = { sent: "badge-success", next: "badge-warning", upcoming: "badge-neutral", paused: "badge-neutral" };
  return el("div", { class: "comms-checklist" }, [
    el("div", { class: "cell-muted", style: "margin-bottom:8px;" }, `${category.charAt(0).toUpperCase() + category.slice(1)} sequence — configured in Settings → Automation Settings.`),
    ...steps.map((step) => {
      const status = companyWorkflowStatus(c, step);
      return el("div", { class: "comms-checklist__row" }, [
        el("div", {}, [
          el("div", { class: "comms-checklist__name" }, step.name),
          el("div", { class: "comms-checklist__subject" }, `“${step.subject}”`),
        ]),
        el("span", { class: "badge " + statusClass[status] }, statusLabel[status]),
      ]);
    }),
  ]);
}

// -------------------------------------------------------------------- drawer
function openDrawer(companyId) {
  byId("drawer").dataset.companyId = companyId;
  const c = state.companies.find((x) => x.id === companyId);
  if (!c) return;
  byId("drawer-title").textContent = c.name;
  const body = byId("drawer-body");
  body.innerHTML = "";

  body.append(
    el("div", { class: "drawer-section" }, [
      el("div", {}, [
        el("span", { class: "badge " + getCompanyStatusBadgeClass(c) }, getCompanyStatusLabel(c)),
        " ",
        el("span", { class: "badge badge-navy" }, c.category),
      ]),
    ]),
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Overview"),
      el("dl", { class: "drawer-kv" }, [
        el("dt", {}, "ABN"), el("dd", {}, c.abn),
        el("dt", {}, "Owner"), el("dd", {}, c.owner),
        el("dt", {}, "Source"), el("dd", {}, c.source),
        el("dt", {}, "Member since"), el("dd", {}, fmtDate(c.joinDate)),
        el("dt", {}, "Renewal date"), el("dd", {}, fmtDate(c.renewalDate)),
        el("dt", {}, "Website"), el("dd", {}, c.website),
        el("dt", {}, "Address"), el("dd", {}, c.address),
      ]),
    ]),
    el("div", { class: "drawer-section" }, [
      el("h3", {}, `People (${c.people.length})`),
      ...c.people.map((p) => el("div", { class: "person-row" }, [
        el("div", {}, [el("div", { class: "person-row__name" }, p.name + (p.primary ? " ★" : "")), el("div", { class: "person-row__role" }, p.role)]),
        el("div", { class: "cell-muted" }, p.email),
      ])),
    ])
  );

  if (c.xero) {
    const [invLabel, invClass] = invoiceBadge(c.xero.invoiceStatus);
    body.append(
      el("div", { class: "drawer-section" }, [
        el("h3", {}, "Billing (Xero)"),
        el("dl", { class: "drawer-kv" }, [
          el("dt", {}, "Invoice"), el("dd", {}, c.xero.invoiceNo || "—"),
          el("dt", {}, "Status"), el("dd", {}, el("span", { class: "badge " + invClass }, invLabel)),
          el("dt", {}, "Payment"), el("dd", {}, c.xero.paymentStatus),
          el("dt", {}, "Amount"), el("dd", {}, fmtMoney(c.xero.amount)),
        ]),
      ])
    );
  }

  body.append(
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Mailchimp segments"),
      c.mailchimp.synced
        ? el("div", {}, c.mailchimp.segments.map((s) => el("span", { class: "badge badge-teal", style: "margin:0 6px 6px 0;display:inline-flex;" }, s)))
        : el("div", { class: "cell-muted" }, "Not yet synced — syncs automatically once membership is confirmed."),
    ]),
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Lifecycle comms for this company"),
      renderCompanyComms(c),
    ]),
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Timeline"),
      el("div", { class: "activity-list" }, c.timeline.map((t) => el("div", { class: "activity-item" }, [
        el("div", { class: "activity-item__date" }, fmtDate(t.date)),
        el("div", {}, t.label),
      ]))),
    ])
  );

  byId("drawer").classList.add("open");
  byId("drawer-overlay").classList.add("open");
}
function refreshDrawerIfOpen() {
  const id = byId("drawer").dataset.companyId;
  if (id && byId("drawer").classList.contains("open")) openDrawer(id);
}
function closeDrawer() {
  byId("drawer").classList.remove("open");
  byId("drawer-overlay").classList.remove("open");
}

// -------------------------------------------------------------- settings gear
function closeSettingsPopover() { byId("settings-popover").classList.remove("open"); }
function toggleSettingsPopover(e) { e.stopPropagation(); byId("settings-popover").classList.toggle("open"); }

// ---------------------------------------------------------------- app mode
function setAppMode(mode) {
  state.appMode = mode;
  document.querySelectorAll(".mode-toggle__btn").forEach((b) => b.classList.toggle("active", b.dataset.appmode === mode));
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((b) => {
    const m = b.dataset.mode;
    b.style.display = (m === "both" || m === mode) ? "" : "none";
  });
  byId("settings-wrap").style.display = mode === "crm" ? "" : "none";
  showView(mode === "crm" ? "action" : "organizations");
}

// --------------------------------------------------------------------- init
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".mode-toggle__btn").forEach((btn) => btn.addEventListener("click", () => setAppMode(btn.dataset.appmode)));
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll(".settings-popover button").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => {
    const sub = btn.dataset.gotoSubtab;
    if (sub) state.subtab[btn.dataset.goto] = sub;
    showView(btn.dataset.goto);
  }));
  document.addEventListener("click", (e) => {
    const b1 = e.target.closest(".subtab-btn");
    if (b1) { const section = b1.closest(".subtabs").dataset.section; switchSubtab(section, b1.dataset.subtab); }
    const b2 = e.target.closest(".subtab-btn2");
    if (b2) switchSubtab("renewal", b2.dataset.subtab2);
  });
  byId("settings-gear").addEventListener("click", toggleSettingsPopover);
  document.addEventListener("click", closeSettingsPopover);
  byId("drawer-close").addEventListener("click", closeDrawer);
  byId("drawer-overlay").addEventListener("click", closeDrawer);
  setAppMode("crm");
});
