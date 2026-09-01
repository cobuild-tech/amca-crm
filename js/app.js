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
  nonMembers: JSON.parse(JSON.stringify(NON_MEMBERS)),
  cms: JSON.parse(JSON.stringify(CMS_CONTENT)),
  events: JSON.parse(JSON.stringify(EVENTS)),
  trainings: JSON.parse(JSON.stringify(TRAININGS)),
  docTemplates: JSON.parse(JSON.stringify(DOC_TEMPLATES)),
  view: "action",
  subtab: { members: "members-pipeline", nonmembers: "nonmembers-contacts", renewal: "renewal-board", cms: "cms-guides" },
  editingBenefitId: null,
  dismissedActions: new Set(),
  syncLog: [
    { date: "2026-09-01 08:14", type: "sync", label: "Xero → CRM: 3 invoice status updates pulled" },
    { date: "2026-09-01 07:50", type: "sync", label: "Mailchimp → CRM: list counts reconciled (2,184 contacts)" },
    { date: "2026-08-31 22:00", type: "sync", label: "CRM → Website: nightly publish check completed" },
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
    case "newsletter": return renderNewsletterView();
    case "events": return renderEvents();
    case "training": return renderTraining();
    case "benefits": return renderBenefits();
    case "cms": return renderCmsSection();
    case "docgen": return renderDocGen();
    case "automation": return renderAutomation();
    case "integrations": return renderIntegrations();
    case "users": return renderUsers();
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
  } else if (section === "nonmembers") {
    if (id === "nonmembers-contacts") renderNonMemberContacts();
    else if (id === "nonmembers-lists") renderNonMemberListsGrid();
    else if (id === "nonmembers-campaigns") renderNonMemberCampaignsTab();
  } else if (section === "cms") {
    renderCmsPanel(id.replace("cms-", ""));
  }
}

// -------------------------------------------------------------- action center
function computeActionItems() {
  const items = [];
  state.companies.forEach((c) => {
    if (c.memberState === "prospect") {
      if (c.onboardingStage === "enquiry") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        items.push({ id: "ac-enq-" + c.id, severity: d >= 4 ? "high" : "medium", title: `Qualify enquiry: ${c.name}`, detail: `In "Enquiry" for ${d} day${d === 1 ? "" : "s"} — owner ${c.owner}.`, companyId: c.id, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "proposal") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        items.push({ id: "ac-prop-" + c.id, severity: d >= 5 ? "high" : "low", title: `Follow up on proposal: ${c.name}`, detail: `Proposal sent ${d} day${d === 1 ? "" : "s"} ago, no response yet.`, companyId: c.id, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "invoice" && c.xero?.invoiceStatus === "sent") {
        items.push({ id: "ac-inv-" + c.id, severity: "medium", title: `Chase membership invoice: ${c.name}`, detail: `${c.xero.invoiceNo} (${fmtMoney(c.xero.amount)}) sent, awaiting payment.`, companyId: c.id, action: { label: "Mark paid", run: () => markProspectInvoicePaid(c.id) } });
      }
      if (c.onboardingStage === "payment") {
        items.push({ id: "ac-act-" + c.id, severity: "high", title: `Activate membership: ${c.name}`, detail: `Payment received — welcome sequence is ready to send.`, companyId: c.id, action: { label: "Activate", run: () => activateCompany(c.id) } });
      }
    }
    if (c.memberState === "active") {
      const rs = getRenewalBoardStage(c);
      const d = daysUntil(c.renewalDate);
      if (rs === "upcoming" && d != null && d <= 30) {
        items.push({ id: "ac-ren-" + c.id, severity: "high", title: `Raise renewal invoice: ${c.name}`, detail: `Renews in ${d} day${d === 1 ? "" : "s"} (${fmtDate(c.renewalDate)}), no invoice raised yet.`, companyId: c.id, action: { label: "Raise invoice", run: () => raiseRenewalInvoice(c.id) } });
      } else if (rs === "invoice_sent" && d != null && d <= 10) {
        items.push({ id: "ac-follow-" + c.id, severity: "high", title: `Follow up before lapse: ${c.name}`, detail: `Renewal invoice sent, ${d} day${d === 1 ? "" : "s"} left, still unpaid.`, companyId: c.id, action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
      if (c.xero?.invoiceStatus === "overdue") {
        items.push({ id: "ac-overdue-" + c.id, severity: "high", title: `Overdue payment: ${c.name}`, detail: `${c.xero.invoiceNo} overdue — ${c.xero.paymentStatus}.`, companyId: c.id, action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
    }
  });
  state.benefits.forEach((b) => {
    if (b.status === "Draft") items.push({ id: "ac-benefit-" + b.id, severity: "low", title: `Review draft benefit: ${b.title}`, detail: `Last updated ${fmtDate(b.updated)} — publish when ready.`, action: { label: "Open benefits", goto: "benefits" } });
  });
  state.campaigns.forEach((cm) => {
    if (cm.status === "Scheduled") items.push({ id: "ac-camp-" + cm.id, severity: "medium", title: `Scheduled campaign due: ${cm.name}`, detail: `Set to send ${fmtDate(cm.sentDate)} to "${cm.segment}".`, action: { label: "Open newsletter", goto: "newsletter" } });
  });
  Object.entries(state.cms).forEach(([key, items_]) => {
    items_.filter((x) => x.status === "Draft").forEach((x) => {
      items.push({ id: "ac-cms-" + x.id, severity: "low", title: `Review draft content: ${x.title}`, detail: `${CMS_TYPES.find((t) => t.key === key)?.label || key} — last updated ${fmtDate(x.updated)}.`, action: { label: "Open website", goto: "cms" } });
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

    wrap.append(
      el("div", { class: "action-item severity-" + item.severity }, [
        el("div", { class: "action-item__main" }, [
          el("div", { class: "action-item__title", onclick: item.companyId ? () => openDrawer(item.companyId) : null }, item.title),
          el("div", { class: "action-item__detail" }, item.detail),
        ]),
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
function statCard(label, value, sub, accentClass) {
  return el("div", { class: "stat-card " + accentClass }, [
    el("div", { class: "stat-card__label" }, label),
    el("div", { class: "stat-card__value" }, String(value)),
    el("div", { class: "stat-card__sub" }, sub),
  ]);
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

// -------------------------------------------------------- campaigns (shared)
function segmentOptionsFor(audience) {
  if (audience === "Members") return ["All Active Members", "Contractor Members", "Corporate Members", "Renewal-Due Members"];
  if (audience === "Non-members") return NON_MEMBER_LISTS.map((l) => l.name);
  return ["All Contacts"];
}
function nonMemberSegmentContacts(segment) {
  const list = NON_MEMBER_LISTS.find((l) => l.name === segment);
  if (!list) return [];
  let contacts = state.nonMembers.filter((n) => n.tag === list.tag);
  if (list.tag === "Former Member") {
    const lapsedAsContacts = state.companies.filter((c) => c.memberState === "lapsed").map((c) => ({ consent: true, unsubscribed: false }));
    contacts = contacts.concat(lapsedAsContacts);
  }
  return contacts;
}
function segmentRecipientInfo(audience, segment) {
  const activeCompanies = state.companies.filter((c) => c.memberState === "active");
  const peopleIn = (cats) => activeCompanies.filter((c) => !cats || cats.includes(c.category)).reduce((s, c) => s + c.people.length, 0);
  if (audience === "Members") {
    let total;
    if (segment === "Contractor Members") total = peopleIn(["Contractor Member"]);
    else if (segment === "Corporate Members") total = peopleIn(["Corporate Member"]);
    else if (segment === "Renewal-Due Members") total = activeCompanies.filter((c) => getRenewalBoardStage(c)).reduce((s, c) => s + c.people.length, 0);
    else total = peopleIn(null);
    return { total, sendable: total, blocked: 0 };
  }
  if (audience === "Non-members") {
    const contacts = nonMemberSegmentContacts(segment);
    const sendable = contacts.filter((c) => c.consent && !c.unsubscribed).length;
    return { total: contacts.length, sendable, blocked: contacts.length - sendable };
  }
  const memberTotal = peopleIn(null);
  const nonMemberSendable = state.nonMembers.filter((n) => n.consent && !n.unsubscribed).length;
  const nonMemberTotal = state.nonMembers.length;
  return { total: memberTotal + nonMemberTotal, sendable: memberTotal + nonMemberSendable, blocked: nonMemberTotal - nonMemberSendable };
}
function buildCampaignBuilder(container, opts) {
  container.innerHTML = "";
  const lockedAudience = opts.lockedAudience;
  const audienceSelect = lockedAudience
    ? null
    : el("select", {}, ["Members", "Non-members", "Mixed"].map((a) => el("option", { value: a }, a)));
  const segmentSelect = el("select", {});
  const typeSelect = el("select", {}, ["Newsletter", "Event invitation", "New training announcement", "Benefits update", "Policy / regulation alert", "Achievement or award spotlight"].map((t) => el("option", { value: t }, t)));
  const subject = el("input", { type: "text", placeholder: "Subject line…", value: "New training dates just announced" });
  const summary = el("div", { class: "campaign-summary" });

  const currentAudience = () => (lockedAudience ? lockedAudience : audienceSelect.value);
  const rebuildSegments = () => {
    segmentSelect.innerHTML = "";
    segmentOptionsFor(currentAudience()).forEach((s) => segmentSelect.append(el("option", { value: s }, s)));
    updateSummary();
  };
  const updateSummary = () => {
    const info = segmentRecipientInfo(currentAudience(), segmentSelect.value);
    let text = `Sending "${typeSelect.value}" to “${segmentSelect.value}” (${currentAudience()}) — ${info.sendable} recipient${info.sendable === 1 ? "" : "s"}.`;
    if (info.blocked > 0) text += ` ${info.blocked} excluded (no consent or unsubscribed).`;
    summary.textContent = text;
  };
  if (audienceSelect) audienceSelect.onchange = rebuildSegments;
  segmentSelect.onchange = updateSummary;
  typeSelect.onchange = updateSummary;

  const row1Children = [];
  if (audienceSelect) row1Children.push(el("label", {}, "Audience:"), audienceSelect);
  row1Children.push(el("label", {}, "Segment:"), segmentSelect);

  container.append(
    el("div", { class: "campaign-row" }, row1Children),
    el("div", { class: "campaign-row" }, [el("label", {}, "Message type:"), typeSelect]),
    el("div", { class: "campaign-row" }, [el("label", {}, "Subject:"), subject]),
    summary,
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary",
        onclick: () => {
          const info = segmentRecipientInfo(currentAudience(), segmentSelect.value);
          const delivered = Math.round(info.sendable * 0.98);
          const baseOpen = currentAudience() === "Members" ? 55 : currentAudience() === "Non-members" ? 35 : 42;
          const openRate = Math.max(0, baseOpen - (info.sendable > 1000 ? 8 : 0));
          const clickRate = Math.round(openRate * 0.22);
          state.campaigns.unshift({ id: "cm" + (Math.floor(Math.random() * 90000) + 10000), name: subject.value, audience: currentAudience(), segment: segmentSelect.value, sentDate: TODAY, recipients: info.sendable, delivered, deliveredRate: info.sendable ? 98 : null, openRate: info.sendable ? openRate : null, clickRate: info.sendable ? clickRate : null, status: "Sent" });
          logSync(`Mailchimp campaign sent: "${subject.value}" → ${segmentSelect.value} (${info.sendable} recipients, consent-checked)`);
          showToast(`Campaign sent via Mailchimp to ${info.sendable} contact${info.sendable === 1 ? "" : "s"} in “${segmentSelect.value}”.`, "success");
          renderCampaignsTable(byId("campaigns-table"), null);
          renderCampaignsTable(byId("nonmember-campaigns-table"), "Non-members");
        },
      }, "Send via Mailchimp"),
    ])
  );
  rebuildSegments();
}
function rateClass(rate, kind) {
  if (rate == null) return "badge-neutral";
  if (kind === "open") return rate >= 45 ? "badge-success" : rate >= 25 ? "badge-warning" : "badge-danger";
  if (kind === "click") return rate >= 15 ? "badge-success" : rate >= 7 ? "badge-warning" : "badge-danger";
  return rate >= 95 ? "badge-success" : "badge-warning";
}
function renderCampaignsTable(wrap, audienceFilter) {
  if (!wrap) return;
  wrap.innerHTML = "";
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Campaign", "Audience", "Segment", "Sent", "Recipients", "Delivered", "Open rate", "Click rate", "Status"].map((h) => el("th", {}, h)))),
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
      el("td", {}, el("span", { class: "badge " + (cm.status === "Sent" ? "badge-success" : "badge-neutral") }, cm.status)),
    ]));
  });
  if (!tbody.children.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "9", class: "cell-muted" }, "No campaigns yet.")));
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function renderNewsletterView() {
  buildCampaignBuilder(byId("campaign-builder"), {});
  renderCampaignsTable(byId("campaigns-table"), null);
}

// -------------------------------------------------------------------- events
function renderEvents() {
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

// ------------------------------------------------------------------ training
function renderTraining() {
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

// ------------------------------------------------------------------ benefits
function renderBenefits() {
  byId("benefits-count").textContent = `${state.benefits.length} benefits · ${state.benefits.filter((b) => b.status === "Published").length} published, ${state.benefits.filter((b) => b.status === "Draft").length} draft`;
  byId("benefit-add-btn").onclick = () => openBenefitForm(null);

  const grid = byId("benefits-grid");
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
  b.status = b.status === "Published" ? "Draft" : "Published";
  b.updated = TODAY;
  showToast(`"${b.title}" is now ${b.status}.`, "success");
  renderBenefits();
}
function openBenefitForm(id) {
  state.editingBenefitId = id;
  const b = id ? state.benefits.find((x) => x.id === id) : { title: "", category: "Discounts", description: "", tiers: [], status: "Draft" };
  const panel = byId("benefit-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const titleInput = el("input", { type: "text", value: b.title, placeholder: "Benefit title" });
  const categoryInput = el("input", { type: "text", value: b.category, placeholder: "Category" });
  const descInput = el("textarea", { rows: "3", placeholder: "Description" }, b.description);
  const tierBoxes = MEMBER_CATEGORIES.map((cat) => {
    const box = el("input", { type: "checkbox" });
    box.checked = b.tiers.includes(cat);
    return el("label", { class: "tier-check" }, [box, " " + cat]);
  });
  panel.append(
    el("h3", {}, id ? "Edit benefit" : "Add benefit"),
    el("div", { class: "form-row" }, [el("label", {}, "Title"), titleInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Category"), categoryInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Description"), descInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Member tiers"), el("div", { class: "tier-check-group" }, tierBoxes)]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary",
        onclick: () => {
          const tiers = tierBoxes.filter((l) => l.querySelector("input").checked).map((l) => l.textContent.trim());
          const payload = { title: titleInput.value.trim() || "Untitled benefit", category: categoryInput.value.trim() || "General", description: descInput.value.trim(), tiers, updated: TODAY };
          if (id) Object.assign(b, payload);
          else state.benefits.unshift({ id: "b" + (Math.floor(Math.random() * 90000) + 10000), status: "Draft", ...payload });
          panel.style.display = "none";
          showToast(id ? "Benefit updated." : "Benefit added as draft.", "success");
          renderBenefits();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// --------------------------------------------------------------- non-members
function renderNonMemberContacts() {
  const wrap = byId("nonmembers-list");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Contact", "Tag", "Consent", "Subscribed", "History / last touch"].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  state.nonMembers.forEach((n) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, n.name),
      el("td", { class: "cell-muted" }, n.contact),
      el("td", {}, el("span", { class: "badge badge-neutral" }, n.tag)),
      el("td", {}, el("span", { class: "badge " + (n.consent ? "badge-success" : "badge-danger") }, n.consent ? "Yes" : "No")),
      el("td", {}, el("span", { class: "badge " + (n.unsubscribed ? "badge-danger" : "badge-success") }, n.unsubscribed ? "Unsubscribed" : "Subscribed")),
      el("td", { class: "cell-muted" }, `${n.history} · ${n.lastTouch}`),
    ]));
  });
  state.companies.filter((c) => c.memberState === "lapsed").forEach((c) => {
    const primary = c.people.find((p) => p.primary) || c.people[0];
    tbody.appendChild(el("tr", { class: "clickable", onclick: () => openDrawer(c.id) }, [
      el("td", { class: "cell-primary" }, c.name),
      el("td", { class: "cell-muted" }, primary?.name || "—"),
      el("td", {}, el("span", { class: "badge badge-danger" }, "Former Member")),
      el("td", {}, el("span", { class: "badge badge-success" }, "Yes")),
      el("td", {}, el("span", { class: "badge badge-success" }, "Subscribed")),
      el("td", { class: "cell-muted" }, `Member ${fmtDate(c.joinDate)} – ${fmtDate(c.renewalDate)}, lapsed`),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function renderNonMemberListsGrid() {
  const listsWrap = byId("nonmember-lists-grid");
  listsWrap.innerHTML = "";
  NON_MEMBER_LISTS.forEach((list) => {
    let count = state.nonMembers.filter((n) => n.tag === list.tag).length;
    if (list.tag === "Former Member") count += state.companies.filter((c) => c.memberState === "lapsed").length;
    listsWrap.append(el("div", { class: "stat-card" }, [
      el("div", { class: "stat-card__label" }, list.name),
      el("div", { class: "stat-card__value" }, String(count)),
      el("div", { class: "stat-card__sub" }, list.description),
    ]));
  });
}
function renderNonMemberCampaignsTab() {
  buildCampaignBuilder(byId("nonmember-campaign-builder"), { lockedAudience: "Non-members" });
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
  if (key === "handbook") {
    panel.append(
      el("p", { class: "subtab-intro" }, "The handbook itself is authored and published in a separate system — this is just the access point and sync status."),
      el("div", { class: "panel" }, [
        el("div", { class: "drawer-kv", style: "grid-template-columns:160px 1fr;" }, [
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
    return;
  }
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
            else state.cms[k].unshift({ id: k + (Math.floor(Math.random() * 90000) + 10000), status: "Draft", ...payload });
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
function renderDocGen() {
  const wrap = byId("docgen-templates");
  wrap.innerHTML = "";
  state.docTemplates.forEach((t) => {
    const row = el("div", { class: "workflow-row" });
    const top = el("div", { class: "workflow-row__top" }, [
      el("div", { class: "workflow-row__name" }, t.name),
      el("button", { class: "btn btn-sm " + (t.active ? "" : "btn-ghost"), onclick: () => { t.active = !t.active; renderDocGen(); } }, t.active ? "Active" : "Paused"),
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
          el("button", { class: "btn btn-sm btn-primary", onclick: () => { t.body = textarea.value; showToast("Template updated.", "success"); renderDocGen(); } }, "Save"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: () => editor.remove() }, "Cancel"),
        ]),
      ]);
      row.appendChild(editor);
    }
    wrap.appendChild(row);
  });

  const form = byId("docgen-form");
  form.innerHTML = "";
  const companySelect = el("select", {}, state.companies.map((c) => el("option", { value: c.id }, c.name)));
  const templateSelect = el("select", {}, state.docTemplates.filter((t) => t.active).map((t) => el("option", { value: t.id }, t.name)));
  form.append(
    el("div", { class: "campaign-row" }, [el("label", {}, "Company:"), companySelect, el("label", {}, "Template:"), templateSelect]),
    el("div", { class: "campaign-row" }, [
      el("button", { class: "btn btn-primary", onclick: () => generateDocument(companySelect.value, templateSelect.value) }, "Generate document"),
    ])
  );
}
function generateDocument(companyId, templateId) {
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
  const preview = byId("docgen-preview");
  preview.style.display = "block";
  preview.innerHTML = "";
  preview.append(el("h3", {}, `${t.name} — ${c.name}`), el("p", {}, merged));
  addTimeline(c, "document", `Generated document: ${t.name}`);
  showToast(`"${t.name}" generated for ${c.name}.`, "success");
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
function renderUsers() {
  const wrap = byId("users-table");
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Email", "Role", "Status", "Last active"].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  USERS.forEach((u) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, u.name),
      el("td", { class: "cell-muted" }, u.email),
      el("td", {}, el("span", { class: "badge badge-navy" }, u.role)),
      el("td", {}, el("span", { class: "badge " + (u.status === "Active" ? "badge-success" : "badge-warning") }, u.status)),
      el("td", { class: "cell-muted" }, u.lastActive === "—" ? "—" : fmtDate(u.lastActive)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
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

// --------------------------------------------------------------------- init
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll(".settings-popover .nav-btn, .settings-popover button").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
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
  showView("action");
});
