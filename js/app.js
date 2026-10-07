/* ==========================================================================
   AMCA Consolidated Platform — Prototype application logic
   Pure client-side, in-memory state. No backend — every "integration" action
   (raising a Xero invoice, sending a Mailchimp campaign) is simulated so the
   flow can be demonstrated end-to-end. "Now" is the fixed TODAY constant
   from data.js (2026-09-01), not the real system clock, so the demo data
   stays consistent across runs.
   ========================================================================== */

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
  trainingsMoodleSynced: false,
  trainingsVetTrakSynced: false,
  docTemplates: JSON.parse(JSON.stringify(DOC_TEMPLATES)),
  onboardingStages: JSON.parse(JSON.stringify(ONBOARDING_STAGES)),
  renewalStages: JSON.parse(JSON.stringify(RENEWAL_STAGES)),
  enquiryFields: JSON.parse(JSON.stringify(ENQUIRY_FORM_FIELDS)),
  followupFields: JSON.parse(JSON.stringify(FOLLOWUP_FORM_FIELDS)),
  feedbackRange: "30 days",
  view: "action",
  appMode: "crm",
  currentUser: CURRENT_USER,
  actionFilter: "mine",
  subtab: { members: "members-pipeline", nonmembers: "nonmembers-campaigns", renewal: "renewal-board", cms: "cms-guides", newsletter: "newsletter-history", usage: "usage-overview" },
  editingBenefitId: null,
  composeDraftId: null,
  imageSlots: {},
  users: JSON.parse(JSON.stringify(USERS)).map((u, i) => ({ ...u, access: i < 2 ? "Admin" : "Editor" })),
  newsletterHistory: { period: "12m", audience: "", status: "All" },
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
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function dueDateFor(severity) {
  return addDaysISO(TODAY, severity === "high" ? 1 : severity === "medium" ? 3 : 7);
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
function getOnboardOrder() {
  return state.onboardingStages.map((s) => s.id);
}
function getOnboardLabel(id) {
  const s = state.onboardingStages.find((x) => x.id === id);
  return s ? s.label : id;
}
function getOnboardStages() {
  return state.onboardingStages;
}
function getRenewalStages() {
  return state.renewalStages;
}
function nextStageId(order, currentId) {
  const idx = order.indexOf(currentId);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}
function getCompanyStatusLabel(c) {
  if (c.memberState === "prospect") return getOnboardLabel(c.onboardingStage);
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
  syncNavActive(viewId);
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
    case "doctemplates": return renderDocTemplatesSettings();
    case "integrations": return renderIntegrations();
    case "pipelinestages": return renderPipelineStagesSettings();
    case "formfields": return renderFormFieldsSettings();
    case "users": return renderUsersView();
    case "organizations": return renderOrganizations();
    case "pevents": return renderEventsSimple();
    case "ptraining": return renderTrainingSimple();
    case "pbenefits": return renderBenefitsSimple();
    case "phandbook": return renderHandbookPanel("phandbook-panel");
    case "usage": return switchSubtab("usage", state.subtab.usage);
    case "pdocgen": renderDocGenLaunch("pdocgen-launch"); return renderDocGen({ reviews: "pdocgen-reviews" });
  }
}

// ---------------------------------------------------------------- subtabs
function syncNavActive(viewId) {
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === viewId && (!b.dataset.subtab || b.dataset.subtab === state.subtab[viewId])));
}
const USAGE_PAGES = {
  "usage-overview": ["Usage Overview", "How staff and members are using each tool on the platform — across all member organisations."],
  "usage-chat": ["Chat Usage", "How AMCA staff use the AI chat assistant, and what they think of its answers."],
  "usage-handbook": ["Handbook Usage", "Reading sessions, readers and the sections they open — across all member organisations."],
  "usage-docgen": ["Document Generator Usage", "Documents generated and downloaded — across all member organisations."],
};
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
  } else if (section === "nonmembers") {
    if (id === "nonmembers-contacts") renderNonMemberContacts();
    else if (id === "nonmembers-lists") renderNonMemberListsGrid();
    else if (id === "nonmembers-campaigns") renderNonMemberCampaignsTab();
  } else if (section === "newsletter") {
    if (id === "newsletter-send") renderNewsletterSend();
    else if (id === "newsletter-history") renderNewsletterHistory();
    else if (id === "newsletter-subscribers") renderSubscribers();
    else if (id === "newsletter-unsub") renderUnsubEditor();
  } else if (section === "usage") {
    byId("usage-title").textContent = USAGE_PAGES[id][0];
    byId("usage-intro").textContent = USAGE_PAGES[id][1];
    syncNavActive("usage");
    if (id === "usage-overview") renderUsageOverview();
    else if (id === "usage-chat") renderChatUsage();
    else if (id === "usage-handbook") renderHandbookUsage("usage-handbook-body");
    else if (id === "usage-docgen") renderDocGenUsage("usage-docgen-body");
  } else if (section === "cms") {
    if (id === "cms-images") renderImagePlacements();
    else renderCmsPanel(id.replace("cms-", ""));
  }
}

// -------------------------------------------------------------- action center
function benefitDefaultAssignee(b) {
  if (b.category === "Technical Support") return "Ben Fogerty";
  if (b.category === "Training") return "John Castillo";
  if (b.category === "Events") return "Brendan Keogh";
  if (b.category === "Third-Party Discount") return "Brendan Keogh";
  return "Ben Hawkins";
}
function computeActionItems() {
  const items = [];
  state.companies.forEach((c) => {
    if (c.memberState === "prospect") {
      if (c.onboardingStage === "enquiry") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        const severity = d >= 4 ? "high" : "medium";
        items.push({ id: "ac-enq-" + c.id, severity, dueDate: dueDateFor(severity), title: `Qualify enquiry: ${c.name}`, detail: `In "Enquiry" for ${d} day${d === 1 ? "" : "s"} — owner ${c.owner}.`, companyId: c.id, assignee: c.owner, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "proposal") {
        const d = daysSince(c.timeline[0]?.date) ?? 0;
        const severity = d >= 5 ? "high" : "low";
        items.push({ id: "ac-prop-" + c.id, severity, dueDate: dueDateFor(severity), title: `Follow up on proposal: ${c.name}`, detail: `Proposal sent ${d} day${d === 1 ? "" : "s"} ago, no response yet.`, companyId: c.id, assignee: c.owner, action: { label: "Open pipeline", goto: "members", gotoSubtab: "members-pipeline" } });
      }
      if (c.onboardingStage === "invoice" && c.xero?.invoiceStatus === "sent") {
        items.push({ id: "ac-inv-" + c.id, severity: "medium", dueDate: dueDateFor("medium"), title: `Chase membership invoice: ${c.name}`, detail: `${c.xero.invoiceNo} (${fmtMoney(c.xero.amount)}) sent, awaiting payment.`, companyId: c.id, assignee: "Brooke Alexander", action: { label: "Mark paid", run: () => markProspectInvoicePaid(c.id) } });
      }
      if (c.onboardingStage === "payment") {
        items.push({ id: "ac-act-" + c.id, severity: "high", dueDate: dueDateFor("high"), title: `Activate membership: ${c.name}`, detail: `Payment received — welcome sequence is ready to send.`, companyId: c.id, assignee: c.owner, action: { label: "Activate", run: () => activateCompany(c.id) } });
      }
    }
    if (c.memberState === "active") {
      const rs = getRenewalBoardStage(c);
      const d = daysUntil(c.renewalDate);
      if (rs === "upcoming" && d != null && d <= 30) {
        items.push({ id: "ac-ren-" + c.id, severity: "high", dueDate: dueDateFor("high"), title: `Raise renewal invoice: ${c.name}`, detail: `Renews in ${d} day${d === 1 ? "" : "s"} (${fmtDate(c.renewalDate)}), no invoice raised yet.`, companyId: c.id, assignee: "Brooke Alexander", action: { label: "Raise invoice", run: () => raiseRenewalInvoice(c.id) } });
      } else if (rs === "invoice_sent" && d != null && d <= 10) {
        items.push({ id: "ac-follow-" + c.id, severity: "high", dueDate: dueDateFor("high"), title: `Follow up before lapse: ${c.name}`, detail: `Renewal invoice sent, ${d} day${d === 1 ? "" : "s"} left, still unpaid.`, companyId: c.id, assignee: "Brooke Alexander", action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
      if (c.xero?.invoiceStatus === "overdue") {
        items.push({ id: "ac-overdue-" + c.id, severity: "high", dueDate: dueDateFor("high"), title: `Overdue payment: ${c.name}`, detail: `${c.xero.invoiceNo} overdue — ${c.xero.paymentStatus}.`, companyId: c.id, assignee: "Andrew Kendt", action: { label: "Open renewals", goto: "members", gotoSubtab: "members-renewals" } });
      }
    }
  });
  state.benefits.forEach((b) => {
    if (b.status === "Draft") items.push({ id: "ac-benefit-" + b.id, severity: "low", dueDate: dueDateFor("low"), title: `Review draft benefit: ${b.title}`, detail: `Last updated ${fmtDate(b.updated)} — publish when ready.`, assignee: benefitDefaultAssignee(b), action: { label: "Open benefits", goto: "members", gotoSubtab: "members-benefits" } });
  });
  state.campaigns.forEach((cm) => {
    if (cm.status === "Scheduled") items.push({ id: "ac-camp-" + cm.id, severity: "medium", dueDate: cm.sentDate, title: `Scheduled campaign due: ${cm.name}`, detail: `Set to send ${fmtDate(cm.sentDate)} to "${cm.segment}".`, assignee: "Brendan Keogh", action: { label: "Open newsletter", goto: "newsletter" } });
  });
  Object.entries(state.cms).forEach(([key, items_]) => {
    items_.filter((x) => x.status === "Draft").forEach((x) => {
      items.push({ id: "ac-cms-" + x.id, severity: "low", dueDate: dueDateFor("low"), title: `Review draft content: ${x.title}`, detail: `${CMS_TYPES.find((t) => t.key === key)?.label || key} — last updated ${fmtDate(x.updated)}.`, assignee: "Brendan Keogh", action: { label: "Open website", goto: "cms" } });
    });
  });
  return items.filter((i) => !state.dismissedActions.has(i.id)).sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}
function renderActionCenter() {
  const all = computeActionItems();
  const items = state.actionFilter === "mine" ? all.filter((i) => (state.actionAssignee[i.id] || i.assignee) === state.currentUser) : all;

  const filterBar = el("div", { class: "action-filter-bar" }, [
    el("button", { class: "chip-btn " + (state.actionFilter === "mine" ? "active" : ""), onclick: () => { state.actionFilter = "mine"; renderActionCenter(); } }, `My tasks (${all.filter((i) => (state.actionAssignee[i.id] || i.assignee) === state.currentUser).length})`),
    el("button", { class: "chip-btn " + (state.actionFilter === "all" ? "active" : ""), onclick: () => { state.actionFilter = "all"; renderActionCenter(); } }, `All tasks (${all.length})`),
  ]);

  const wrap = byId("action-items");
  wrap.innerHTML = "";
  wrap.appendChild(filterBar);
  if (!items.length) {
    wrap.appendChild(el("div", { class: "panel" }, state.actionFilter === "mine" ? `Nothing assigned to ${state.currentUser} right now — nice work.` : "Nothing needs attention right now — nice work."));
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
    assigneeSelect.value = state.actionAssignee[item.id] || item.assignee || state.currentUser;
    assigneeSelect.onchange = () => { state.actionAssignee[item.id] = assigneeSelect.value; showToast(`Reassigned to ${assigneeSelect.value}.`, "info"); renderActionCenter(); };

    wrap.append(
      el("div", { class: "action-item severity-" + item.severity }, [
        el("div", { class: "action-item__main" }, [
          el("div", { class: "action-item__title", onclick: item.companyId ? () => openDrawer(item.companyId) : null }, item.title),
          el("div", { class: "action-item__detail" }, item.detail),
          el("div", { class: "action-item__due" }, "Due " + fmtDate(item.dueDate)),
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

  const lapsed = state.companies.filter((c) => c.memberState === "lapsed").length;
  const renderTiles = (gridId, tiles) => {
    const grid = byId(gridId);
    grid.innerHTML = "";
    tiles.forEach(([label, value, sub]) => {
      grid.append(el("div", { class: "impact-tile" }, [
        el("div", { class: "impact-tile__value" }, String(value)),
        el("div", { class: "impact-tile__label" }, label),
        sub ? el("div", { class: "impact-tile__sub" }, sub) : null,
      ]));
    });
  };

  // Impact = outcomes delivered to the industry (board-report numbers).
  renderTiles("impact-grid", [
    ["Training hours delivered", IMPACT_METRICS.trainingHoursDelivered.toLocaleString(), "YTD"],
    ["Free resource hours accessed", IMPACT_METRICS.freeResourceHoursAccessed.toLocaleString(), "YTD"],
    ["Resource PDFs downloaded", IMPACT_METRICS.freeResourcePdfDownloads.toLocaleString(), "YTD"],
    ["Event & training attendances", IMPACT_METRICS.eventAttendeesYTD.toLocaleString(), "YTD"],
    ["Policy & regulation guides published", IMPACT_METRICS.policyGuidesPublished, "YTD"],
  ]);

  // Membership health = the state of the member base itself.
  renderTiles("membership-grid", [
    ["Active members", activeCompanies.length, "Organisations"],
    ["Portal users", activeUsers, "People with member login access"],
    ["Renewal rate", IMPACT_METRICS.renewalRate + "%", "Trailing 12 months"],
    ["Lapsed", lapsed, "Candidates for re-engagement"],
  ]);

  const openProspects = state.companies.filter((c) => c.memberState === "prospect").length;
  const renewalActive = state.companies.filter((c) => ["upcoming", "invoice_sent"].includes(getRenewalBoardStage(c))).length;
  const openActions = computeActionItems().length;

  const stats = byId("dashboard-stats");
  stats.innerHTML = "";
  stats.append(
    statCard("Open enquiries & applications", openProspects, "In the new member pipeline", ""),
    statCard("Renewals in progress", renewalActive, "Upcoming or invoiced", "accent-orange"),
    statCard("Open action items", openActions, "Needing attention today", "accent-teal")
  );

  const funnel = byId("dashboard-funnel");
  funnel.innerHTML = "";
  const max = Math.max(...state.onboardingStages.map((s) => state.companies.filter((c) => c.memberState === "prospect" && c.onboardingStage === s.id).length), 1);
  state.onboardingStages.forEach((s) => {
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

  const usageGrid = byId("dashboard-usage");
  usageGrid.innerHTML = "";
  usageGrid.append(
    statCard("Total chats", USERS.reduce((s, u) => s + (u.chats || 0), 0), "Across all users", ""),
    statCard("Messages sent", USERS.reduce((s, u) => s + (u.messages || 0), 0), "Across all users", "accent-teal"),
    statCard("Docs generated", USERS.reduce((s, u) => s + (u.documentsGenerated || 0), 0), "Across all users", "accent-orange")
  );
}

// -------------------------------------------------------------- new members
function renderPipelineNew() {
  const board = byId("pipeline-board-new");
  board.innerHTML = "";
  state.onboardingStages.forEach((stage) => {
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
  const order = getOnboardOrder();
  const has = (id) => order.includes(id);
  let matched = true;
  if (stage === "enquiry" && has("qualifying")) actions.append(actionBtn("→ Qualifying", () => moveOnboarding(c.id, "qualifying", "Moved to Qualifying")));
  else if (stage === "qualifying" && has("application")) actions.append(actionBtn("→ Application", () => moveOnboarding(c.id, "application", "Membership application submitted for review")));
  else if (stage === "application" && has("proposal")) actions.append(actionBtn("→ Proposal / Quote", () => moveOnboarding(c.id, "proposal", "Membership proposal & quote sent")));
  else if (stage === "proposal" && has("invoice")) actions.append(actionBtn("Raise invoice (Xero)", () => raiseNewMemberInvoice(c.id)));
  else if (stage === "invoice" && has("payment")) actions.append(actionBtn("Mark paid (Xero)", () => markProspectInvoicePaid(c.id)));
  else if (stage === "payment") actions.append(actionBtn("Activate membership", () => activateCompany(c.id)));
  else matched = false;
  if (!matched) {
    const next = nextStageId(order, stage);
    if (next) actions.append(actionBtn(`→ ${getOnboardLabel(next)}`, () => moveOnboarding(c.id, next, `Moved to ${getOnboardLabel(next)}`)));
    else actions.append(actionBtn("Activate membership", () => activateCompany(c.id)));
  }
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
  showToast(`${c.name} moved to "${getOnboardLabel(nextStage)}".`, "info");
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
  state.renewalStages.forEach((stage) => {
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
    state.onboardingStages.forEach((s) => stageSel.append(el("option", { value: "onboarding:" + s.id }, s.label)));
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
  return {
    total: memberCount + nmContacts.length + subTotal,
    sendable: memberCount + nmSendable + subSendable,
    blocked: nmBlocked + (subTotal - subSendable),
    split: { members: memberCount, nonMembers: nmSendable, subscribers: subSendable },
  };
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
function checkboxRow(label, onchange, checked) {
  const box = el("input", { type: "checkbox" });
  box.checked = !!checked;
  box.addEventListener("change", () => onchange(box.checked, box));
  return { row: el("label", { class: "tier-check" }, [box, " " + label]), box };
}

// ---------------------------------------------------------- campaign metrics
// Every rate is derived from raw counts so the table, the summary strip and
// the per-newsletter report can never disagree with each other.
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : null; }
function campaignStats(cm) {
  if (cm.status !== "Sent") return { sent: false, recipients: cm.recipients || 0 };
  const bounces = (cm.hardBounces || 0) + (cm.softBounces || 0);
  const delivered = cm.recipients - bounces;
  const totalOpens = cm.totalOpens || Math.round(cm.uniqueOpens * 1.62);
  const totalClicks = cm.totalClicks || Math.round(cm.uniqueClicks * 1.38);
  return {
    sent: true,
    recipients: cm.recipients,
    delivered,
    bounces,
    hardBounces: cm.hardBounces || 0,
    softBounces: cm.softBounces || 0,
    uniqueOpens: cm.uniqueOpens,
    totalOpens,
    uniqueClicks: cm.uniqueClicks,
    totalClicks,
    unsubscribes: cm.unsubscribes || 0,
    complaints: cm.complaints || 0,
    deliveryRate: pct(delivered, cm.recipients),
    bounceRate: pct(bounces, cm.recipients),
    openRate: pct(cm.uniqueOpens, delivered),
    clickRate: pct(cm.uniqueClicks, delivered),
    ctor: pct(cm.uniqueClicks, cm.uniqueOpens),
    unsubRate: pct(cm.unsubscribes || 0, delivered),
    complaintRate: pct(cm.complaints || 0, delivered),
  };
}
function fmtPct(v) { return v == null ? "—" : (Number.isInteger(v) ? v : v.toFixed(1)) + "%"; }
// Deterministic pseudo-random so a campaign's generated detail is stable
// across re-renders (mock data only — Mailchimp supplies the real thing).
function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Cumulative unique opens/clicks for the first 7 days after send.
const ENGAGEMENT_DECAY = [0.58, 0.19, 0.09, 0.05, 0.04, 0.03, 0.02];
function campaignEngagementCurve(cm) {
  const st = campaignStats(cm);
  let o = 0, c = 0;
  return ENGAGEMENT_DECAY.map((share, i) => {
    o += share; c += share;
    return { label: "Day " + (i + 1), opens: Math.round(st.uniqueOpens * Math.min(o, 1)), clicks: Math.round(st.uniqueClicks * Math.min(c, 1)) };
  });
}
function campaignAudienceSplit(cm) {
  const st = campaignStats(cm);
  const shares = cm.audience === "Members" ? [1, 0, 0] : cm.audience === "Non-members" ? [0, 1, 0] : cm.audience === "Subscribers" ? [0, 0, 1] : [0.78, 0.15, 0.07];
  const lift = [1.18, 0.82, 0.9];
  return [["Members", 0], ["Non-members", 1], ["Site subscribers", 2]]
    .filter(([, i]) => shares[i] > 0)
    .map(([label, i]) => {
      const delivered = Math.round(st.delivered * shares[i]);
      const openRate = Math.min(95, Math.round((st.openRate * (shares[i] === 1 ? 1 : lift[i])) * 10) / 10);
      return { label, delivered, openRate, clickRate: Math.round(openRate * (st.ctor / 100) * 10) / 10 };
    });
}
function campaignRecipientSample(cm) {
  const rnd = seededRandom(cm.id);
  const people = [];
  state.companies.filter((c) => c.memberState === "active").forEach((c) => c.people.forEach((p) => people.push({ name: p.name, email: p.email, org: c.name, group: "Members" })));
  state.nonMembers.forEach((n) => people.push({ name: n.contact, email: n.email, org: n.name, group: "Non-members" }));
  state.subscribers.forEach((s) => people.push({ name: s.name, email: s.email, org: "Site subscriber", group: "Site subscribers" }));
  const allowed = cm.audience === "Mixed" ? null : cm.audience === "Subscribers" ? "Site subscribers" : cm.audience;
  const pool = people.filter((p) => !allowed || p.group === allowed);
  const st = campaignStats(cm);
  const sendDay = new Date(cm.sentDate + "T" + (cm.sendTime || "09:00"));
  return pool.slice(0, 12).map((p) => {
    const r = rnd();
    let status, mins;
    if (r < st.bounceRate / 100 * 3) { status = "Bounced"; mins = 1; }
    else if (r < (st.bounceRate / 100 * 3) + 0.04) { status = "Unsubscribed"; mins = 30 + Math.floor(rnd() * 600); }
    else if (r < st.clickRate / 100 + 0.08) { status = "Clicked"; mins = 5 + Math.floor(rnd() * 900); }
    else if (r < st.openRate / 100 + 0.1) { status = "Opened"; mins = 5 + Math.floor(rnd() * 2400); }
    else { status = "Not opened"; mins = null; }
    const at = mins == null ? null : new Date(sendDay.getTime() + mins * 60000);
    return { ...p, status, at, opens: status === "Clicked" || status === "Opened" ? 1 + Math.floor(rnd() * 4) : 0 };
  });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return fmtDate(d.toISOString().slice(0, 10)) + " " + d.toTimeString().slice(0, 5);
}
function campaignStatusBadge(status) {
  const cls = { Sent: "badge-success", Scheduled: "badge-orange", Draft: "badge-neutral", Sending: "badge-teal" }[status] || "badge-neutral";
  return el("span", { class: "badge " + cls }, status);
}

// -------------------------------------------------------------- line chart
// A small, dependency-free SVG line chart: one y-axis, 2px lines, end-of-line
// direct labels, legend, and a crosshair + tooltip on hover.
function lineChart({ labels, series, yFormat = (v) => v, yMax, height = 220, tooltipTitle }) {
  const W = 640, H = height, pad = { l: 44, r: 92, t: 14, b: 30 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxVal = yMax || Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const tickStep = (() => { const raw = maxVal / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((st) => st >= raw); })();
  const ticks = Math.ceil(maxVal / tickStep);
  const niceMax = tickStep * ticks;
  const x = (i) => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / niceMax) * ih;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("role", "img");
  const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; svg.appendChild(n); return n; };

  for (let i = 0; i <= ticks; i++) {
    const v = tickStep * i;
    mk("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: i === 0 ? "chart-axis" : "chart-grid" });
    mk("text", { x: pad.l - 8, y: y(v) + 4, "text-anchor": "end", class: "chart-tick" }, yFormat(Math.round(v * 10) / 10));
  }
  const step = Math.ceil(labels.length / 8);
  labels.forEach((lab, i) => {
    if (i % step === 0 || i === labels.length - 1) mk("text", { x: x(i), y: H - 8, "text-anchor": "middle", class: "chart-tick" }, lab);
  });
  const endLabels = [];
  series.forEach((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (pts.length > 1) mk("path", { d: pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "), class: "chart-line", stroke: s.color });
    pts.forEach((p) => mk("circle", { cx: p[0], cy: p[1], r: 3.5, fill: s.color, class: "chart-dot" }));
    const last = pts[pts.length - 1];
    if (last) endLabels.push({ y: last[1], x: last[0], text: s.name, color: s.color });
  });
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  endLabels.forEach((l) => {
    mk("circle", { cx: l.x + 10, cy: l.y - 4, r: 4, fill: l.color });
    mk("text", { x: l.x + 18, y: l.y, class: "chart-direct-label" }, l.text);
  });

  const cross = mk("line", { x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih, class: "chart-crosshair", visibility: "hidden" });
  const hit = mk("rect", { x: pad.l - 10, y: 0, width: iw + 20, height: H, fill: "transparent" });
  const wrap = el("div", { class: "chart" });
  const tip = el("div", { class: "chart-tip" });
  const legend = el("div", { class: "chart-legend" }, series.map((s) => el("span", { class: "chart-legend__item" }, [el("span", { class: "chart-legend__swatch", style: `background:${s.color}` }), s.name])));
  if (series.length > 1) wrap.append(legend);
  wrap.append(svg, tip);
  const move = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    let idx = labels.length === 1 ? 0 : Math.round(((px - pad.l) / iw) * (labels.length - 1));
    idx = Math.max(0, Math.min(labels.length - 1, idx));
    cross.setAttribute("x1", x(idx)); cross.setAttribute("x2", x(idx)); cross.setAttribute("visibility", "visible");
    tip.innerHTML = "";
    tip.append(el("div", { class: "chart-tip__title" }, tooltipTitle ? tooltipTitle(idx) : labels[idx]));
    series.forEach((s) => tip.append(el("div", { class: "chart-tip__row" }, [el("span", { class: "chart-legend__swatch", style: `background:${s.color}` }), el("span", {}, s.name), el("strong", {}, s.values[idx] == null ? "—" : yFormat(s.values[idx]))])));
    tip.style.display = "block";
    const left = (x(idx) / W) * rect.width;
    tip.style.left = Math.min(Math.max(left + 12, 0), rect.width - 200) + "px";
    tip.style.top = "8px";
  };
  hit.addEventListener("mousemove", move);
  hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tip.style.display = "none"; });
  return wrap;
}
const CHART_COLORS = { primary: "#0072ae", secondary: "#f47920" };

// ------------------------------------------------------- history & analytics
const NEWSLETTER_PERIODS = [["3m", "Last 3 months", 3], ["6m", "Last 6 months", 6], ["12m", "Last 12 months", 12], ["all", "All time", null]];
function campaignsInPeriod(periodKey, audienceFilter) {
  const months = NEWSLETTER_PERIODS.find((p) => p[0] === periodKey)?.[2];
  const cutoff = months ? new Date(new Date(TODAY).setMonth(new Date(TODAY).getMonth() - months)).toISOString().slice(0, 10) : "0000";
  return state.campaigns.filter((cm) => cm.status === "Sent" && cm.sentDate >= cutoff && (!audienceFilter || cm.audience === audienceFilter));
}
function aggregateStats(rows) {
  const t = rows.map(campaignStats).reduce((a, s) => {
    ["recipients", "delivered", "bounces", "uniqueOpens", "uniqueClicks", "unsubscribes", "complaints"].forEach((k) => { a[k] = (a[k] || 0) + s[k]; });
    return a;
  }, {});
  return { ...t, sends: rows.length, deliveryRate: pct(t.delivered, t.recipients), openRate: pct(t.uniqueOpens, t.delivered), clickRate: pct(t.uniqueClicks, t.delivered), ctor: pct(t.uniqueClicks, t.uniqueOpens), unsubRate: pct(t.unsubscribes, t.delivered) };
}
function renderCampaignSummary(container, audienceFilter, periodKey = "all") {
  if (!container) return;
  container.innerHTML = "";
  const rows = campaignsInPeriod(periodKey, audienceFilter);
  const a = aggregateStats(rows);
  const periodLabel = NEWSLETTER_PERIODS.find((p) => p[0] === periodKey)?.[1] || "All time";
  container.append(
    statCard("Campaigns sent", rows.length, periodLabel, ""),
    statCard("Delivered", (a.delivered || 0).toLocaleString(), `${fmtPct(a.deliveryRate)} delivery rate`, "accent-teal"),
    statCard("Open rate", fmtPct(a.openRate), `${(a.uniqueOpens || 0).toLocaleString()} unique opens`, ""),
    statCard("Click rate", fmtPct(a.clickRate), `${fmtPct(a.ctor)} click-to-open`, "accent-orange"),
    statCard("Unsubscribes", a.unsubscribes || 0, `${fmtPct(a.unsubRate)} · ${a.complaints || 0} spam complaints`, "")
  );
}
function renderCampaignsTable(wrap, audienceFilter, opts = {}) {
  if (!wrap) return;
  wrap.innerHTML = "";
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Newsletter", "Audience", "Sent / scheduled", "Recipients", "Delivered", "Open rate", "Click rate", "CTOR", "Unsubs", "Bounces", "Status"].map((h) => el("th", {}, h)))),
  ]);
  const tbody = el("tbody");
  state.campaigns
    .filter((cm) => (!audienceFilter || cm.audience === audienceFilter) && (!opts.status || opts.status === "All" || cm.status === opts.status))
    .sort((a, b) => (a.sentDate < b.sentDate ? 1 : -1))
    .forEach((cm) => {
      const st = campaignStats(cm);
      const rate = (v, kind) => (st.sent ? el("span", { class: "badge " + rateClass(v, kind) }, fmtPct(v)) : el("span", { class: "cell-muted" }, "—"));
      tbody.appendChild(el("tr", { class: "clickable", onclick: () => (cm.status === "Draft" ? openDraftInComposer(cm.id) : openCampaignReport(cm.id)) }, [
        el("td", { class: "cell-primary" }, [el("div", {}, cm.name), cm.internalName && cm.internalName !== cm.name ? el("div", { class: "cell-sub" }, cm.internalName) : null]),
        el("td", {}, el("span", { class: "badge badge-navy" }, cm.audience)),
        el("td", {}, [el("div", {}, fmtDate(cm.sentDate)), el("div", { class: "cell-sub" }, (cm.sendTime || "") + " AEST")]),
        el("td", {}, st.recipients ? st.recipients.toLocaleString() : "—"),
        el("td", {}, rate(st.deliveryRate, "delivered")),
        el("td", {}, rate(st.openRate, "open")),
        el("td", {}, rate(st.clickRate, "click")),
        el("td", { class: "cell-muted" }, st.sent ? fmtPct(st.ctor) : "—"),
        el("td", { class: "cell-muted" }, st.sent ? String(st.unsubscribes) : "—"),
        el("td", { class: "cell-muted" }, st.sent ? String(st.bounces) : "—"),
        el("td", {}, campaignStatusBadge(cm.status)),
      ]));
    });
  if (!tbody.children.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "11", class: "cell-muted" }, "No campaigns match.")));
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function rateClass(rate, kind) {
  if (rate == null) return "badge-neutral";
  if (kind === "open") return rate >= 45 ? "badge-success" : rate >= 25 ? "badge-warning" : "badge-danger";
  if (kind === "click") return rate >= 15 ? "badge-success" : rate >= 7 ? "badge-warning" : "badge-danger";
  return rate >= 97 ? "badge-success" : "badge-warning";
}
function newsletterActivityFeed(rows) {
  const events = [];
  const unsubPool = state.subscribers.concat(state.nonMembers.map((n) => ({ name: n.contact })));
  rows.forEach((cm) => {
    const st = campaignStats(cm);
    const rnd = seededRandom(cm.id + "feed");
    events.push({ date: cm.sentDate, type: "send", text: `Sent "${cm.name}" to ${st.recipients.toLocaleString()} recipients (${cm.segment})` });
    const day1 = Math.round(st.uniqueOpens * ENGAGEMENT_DECAY[0]);
    events.push({ date: cm.sentDate, type: "open", text: `${day1.toLocaleString()} opened "${cm.name}" in the first 24 hours` });
    const top = (cm.links || [])[0];
    if (top) events.push({ date: cm.sentDate, type: "click", text: `Top link: "${top[0]}" — ${Math.round(st.totalClicks * top[2]).toLocaleString()} clicks` });
    if (st.hardBounces >= 15) events.push({ date: cm.sentDate, type: "bounce", text: `${st.hardBounces} hard bounces on "${cm.name}" — addresses suppressed` });
    const start = Math.floor(rnd() * unsubPool.length);
    for (let i = 0; i < Math.min(2, st.unsubscribes); i++) {
      const who = unsubPool[(start + i) % unsubPool.length];
      events.push({ date: cm.sentDate, type: "unsub", text: `${who.name} unsubscribed via "${cm.name}"` });
    }
    if (st.complaints) events.push({ date: cm.sentDate, type: "complaint", text: `${st.complaints} spam complaint${st.complaints === 1 ? "" : "s"} on "${cm.name}"` });
  });
  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}
const ACTIVITY_ICONS = { send: "✉", open: "◉", click: "↗", bounce: "⚠", unsub: "⊘", complaint: "⚑" };
function renderNewsletterHistory() {
  const host = byId("newsletter-history-body");
  const ui = state.newsletterHistory;
  host.innerHTML = "";

  const periodSel = el("div", { class: "segmented" }, NEWSLETTER_PERIODS.map(([key, label]) =>
    el("button", { class: "segmented__btn" + (ui.period === key ? " active" : ""), onclick: () => { ui.period = key; renderNewsletterHistory(); } }, label)));
  const audienceSel = el("select", { onchange: (e) => { ui.audience = e.target.value; renderNewsletterHistory(); } },
    [["", "All audiences"], ["Members", "Members"], ["Non-members", "Non-members"], ["Mixed", "Mixed"], ["Subscribers", "Subscribers"]].map(([v, l]) => {
      const o = el("option", { value: v }, l); if (v === ui.audience) o.selected = true; return o;
    }));
  host.append(el("div", { class: "toolbar toolbar--filters" }, [periodSel, audienceSel,
    el("button", { class: "btn btn-primary", style: "margin-left:auto;", onclick: () => { state.composeDraftId = null; switchSubtab("newsletter", "newsletter-send"); } }, "+ New newsletter")]));

  const summary = el("div", { class: "stat-grid stat-grid--5" });
  host.append(summary);
  renderCampaignSummary(summary, ui.audience || null, ui.period);

  const rows = campaignsInPeriod(ui.period, ui.audience || null).sort((a, b) => (a.sentDate > b.sentDate ? 1 : -1));
  const chartPanel = el("div", { class: "panel" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, "Engagement per send"), el("span", { class: "cell-muted" }, "Unique open and click rate of each newsletter, oldest → newest")]),
  ]);
  if (rows.length) {
    const stats = rows.map(campaignStats);
    chartPanel.append(lineChart({
      labels: rows.map((cm) => fmtDate(cm.sentDate).replace(/ 20\d\d$/, "")),
      series: [
        { name: "Open rate", color: CHART_COLORS.primary, values: stats.map((s) => s.openRate) },
        { name: "Click rate", color: CHART_COLORS.secondary, values: stats.map((s) => s.clickRate) },
      ],
      yFormat: (v) => v + "%",
      tooltipTitle: (i) => `${rows[i].name} · ${fmtDate(rows[i].sentDate)}`,
    }));
  } else chartPanel.append(el("p", { class: "cell-muted" }, "No sends in this period."));

  const feed = newsletterActivityFeed(rows).slice(0, 14);
  const feedPanel = el("div", { class: "panel" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, "Activity"), el("span", { class: "cell-muted" }, NEWSLETTER_PERIODS.find((p) => p[0] === ui.period)[1])]),
    feed.length ? el("div", { class: "nl-feed" }, feed.map((e) => el("div", { class: "nl-feed__row nl-feed__row--" + e.type }, [
      el("span", { class: "nl-feed__icon", "aria-hidden": "true" }, ACTIVITY_ICONS[e.type]),
      el("div", {}, [el("div", { class: "nl-feed__text" }, e.text), el("div", { class: "cell-sub" }, fmtDate(e.date))]),
    ]))) : el("p", { class: "cell-muted" }, "No activity in this period."),
  ]);
  host.append(el("div", { class: "grid-2 grid-2--wide-left" }, [chartPanel, feedPanel]));

  const statusFilter = el("div", { class: "segmented segmented--sm" }, ["All", "Sent", "Scheduled", "Draft"].map((s) =>
    el("button", { class: "segmented__btn" + (ui.status === s ? " active" : ""), onclick: () => { ui.status = s; renderNewsletterHistory(); } }, s)));
  const tableWrap = el("div", { class: "data-table" });
  host.append(el("div", { class: "panel" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, "All newsletters"), statusFilter]),
    el("p", { class: "panel__intro" }, "Click a sent or scheduled newsletter for its full report; click a draft to keep editing it."),
    tableWrap,
  ]));
  renderCampaignsTable(tableWrap, ui.audience || null, { status: ui.status });
}

// ------------------------------------------------------ per-newsletter report
function openCampaignReport(id) {
  const cm = state.campaigns.find((c) => c.id === id);
  if (!cm) return;
  const st = campaignStats(cm);
  byId("campaign-report-title").textContent = cm.name;
  const body = byId("campaign-report-body");
  body.innerHTML = "";

  const meta = el("dl", { class: "drawer-kv" }, [
    el("dt", {}, "Status"), el("dd", {}, campaignStatusBadge(cm.status)),
    el("dt", {}, cm.status === "Sent" ? "Sent" : "Scheduled for"), el("dd", {}, `${fmtDate(cm.sentDate)}, ${cm.sendTime || NEWSLETTER_DEFAULTS.sendTime} AEST`),
    el("dt", {}, "From"), el("dd", {}, `${cm.fromName || NEWSLETTER_DEFAULTS.fromName} <${cm.fromEmail || NEWSLETTER_DEFAULTS.fromEmail}>`),
    el("dt", {}, "Reply-to"), el("dd", {}, cm.replyTo || NEWSLETTER_DEFAULTS.replyTo),
    el("dt", {}, "Audience"), el("dd", {}, `${cm.audience} — ${cm.segment}`),
    el("dt", {}, "Preview text"), el("dd", {}, cm.previewText || "—"),
    el("dt", {}, "Internal name"), el("dd", {}, cm.internalName || "—"),
  ]);
  body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "Overview"), meta]));

  if (!st.sent) {
    body.append(el("div", { class: "drawer-section" }, [
      el("p", {}, `This newsletter hasn't gone out yet. Approx. ${st.recipients.toLocaleString()} recipients after consent and unsubscribe checks.`),
      el("div", { class: "campaign-row", style: "margin-top:10px;" }, [
        el("button", { class: "btn", onclick: () => { cm.status = "Draft"; closeCampaignReport(); openDraftInComposer(cm.id); showToast("Schedule cancelled — moved back to drafts.", "info"); } }, "Cancel schedule & edit"),
      ]),
    ]), el("div", { class: "drawer-section" }, [el("h3", {}, "Content"), el("div", { class: "email-preview", html: cm.bodyHtml })]));
    openReportDrawer();
    return;
  }

  const kpi = (label, value, sub) => el("div", { class: "kpi" }, [el("div", { class: "kpi__label" }, label), el("div", { class: "kpi__value" }, value), sub ? el("div", { class: "kpi__sub" }, sub) : null]);
  body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "Performance"), el("div", { class: "kpi-grid" }, [
    kpi("Recipients", st.recipients.toLocaleString(), "After consent checks"),
    kpi("Delivered", fmtPct(st.deliveryRate), `${st.delivered.toLocaleString()} inboxes`),
    kpi("Open rate", fmtPct(st.openRate), `${st.uniqueOpens.toLocaleString()} unique · ${st.totalOpens.toLocaleString()} total`),
    kpi("Click rate", fmtPct(st.clickRate), `${st.uniqueClicks.toLocaleString()} unique · ${st.totalClicks.toLocaleString()} total`),
    kpi("Click-to-open", fmtPct(st.ctor), "Clicks ÷ opens"),
    kpi("Bounces", String(st.bounces), `${st.hardBounces} hard · ${st.softBounces} soft · ${fmtPct(st.bounceRate)}`),
    kpi("Unsubscribes", String(st.unsubscribes), fmtPct(st.unsubRate)),
    kpi("Spam complaints", String(st.complaints), fmtPct(st.complaintRate)),
  ])]));

  const funnelRows = [["Sent", st.recipients], ["Delivered", st.delivered], ["Opened", st.uniqueOpens], ["Clicked", st.uniqueClicks]];
  body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "Delivery funnel"), el("div", { class: "funnel" }, funnelRows.map(([label, n]) =>
    el("div", { class: "funnel-row" }, [
      el("div", { class: "funnel-row__label" }, label),
      el("div", { class: "funnel-row__bar-track" }, el("div", { class: "funnel-row__bar", style: `width:${(n / st.recipients) * 100}%` })),
      el("div", { class: "funnel-row__count funnel-row__count--wide" }, `${n.toLocaleString()} · ${fmtPct(pct(n, st.recipients))}`),
    ])))]));

  const curve = campaignEngagementCurve(cm);
  body.append(el("div", { class: "drawer-section" }, [
    el("h3", {}, "Engagement over the first 7 days"),
    el("p", { class: "cell-muted", style: "font-size:12.5px;margin-bottom:6px;" }, `Cumulative unique opens and clicks. ${Math.round(ENGAGEMENT_DECAY[0] * 100)}% of opens landed in the first 24 hours.`),
    lineChart({ labels: curve.map((p) => p.label), series: [
      { name: "Opens", color: CHART_COLORS.primary, values: curve.map((p) => p.opens) },
      { name: "Clicks", color: CHART_COLORS.secondary, values: curve.map((p) => p.clicks) },
    ], yFormat: (v) => Math.round(v).toLocaleString(), height: 200 }),
  ]));

  const links = cm.links || [];
  if (links.length) {
    const linkTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Link", "Clicks", "Share"].map((h) => el("th", {}, h))))]);
    const tb = el("tbody");
    links.forEach(([label, url, share]) => tb.append(el("tr", {}, [
      el("td", {}, [el("div", { class: "cell-primary" }, label), el("div", { class: "cell-sub" }, url)]),
      el("td", {}, Math.round(st.totalClicks * share).toLocaleString()),
      el("td", {}, el("div", { class: "share-bar" }, [el("div", { class: "share-bar__fill", style: `width:${share * 100}%` }), el("span", {}, Math.round(share * 100) + "%")])),
    ])));
    linkTable.append(tb);
    body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "Top links"), el("div", { class: "data-table" }, linkTable)]));
  }

  const split = campaignAudienceSplit(cm);
  const splitTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Audience group", "Delivered", "Open rate", "Click rate"].map((h) => el("th", {}, h))))]);
  const sb = el("tbody");
  split.forEach((g) => sb.append(el("tr", {}, [el("td", { class: "cell-primary" }, g.label), el("td", {}, g.delivered.toLocaleString()),
    el("td", {}, el("span", { class: "badge " + rateClass(g.openRate, "open") }, fmtPct(g.openRate))),
    el("td", {}, el("span", { class: "badge " + rateClass(g.clickRate, "click") }, fmtPct(g.clickRate)))])));
  splitTable.append(sb);
  body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "By audience group"), el("div", { class: "data-table" }, splitTable)]));

  const sample = campaignRecipientSample(cm);
  const recTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Recipient", "Group", "Activity", "Opens", "Last activity"].map((h) => el("th", {}, h))))]);
  const rb = el("tbody");
  const statusCls = { Clicked: "badge-success", Opened: "badge-teal", "Not opened": "badge-neutral", Bounced: "badge-danger", Unsubscribed: "badge-warning" };
  sample.forEach((r) => rb.append(el("tr", {}, [
    el("td", {}, [el("div", { class: "cell-primary" }, r.name), el("div", { class: "cell-sub" }, r.org)]),
    el("td", { class: "cell-muted" }, r.group),
    el("td", {}, el("span", { class: "badge " + statusCls[r.status] }, r.status)),
    el("td", { class: "cell-muted" }, String(r.opens)),
    el("td", { class: "cell-muted" }, fmtDateTime(r.at)),
  ])));
  recTable.append(rb);
  body.append(el("div", { class: "drawer-section" }, [
    el("div", { class: "panel__head" }, [el("h3", { style: "margin:0;" }, "Recipient activity"),
      el("button", { class: "btn btn-sm", onclick: () => showToast(`Exported recipient activity for "${cm.name}" (CSV, ${st.recipients.toLocaleString()} rows).`, "success") }, "Export CSV")]),
    el("p", { class: "cell-muted", style: "font-size:12.5px;margin-bottom:6px;" }, `Showing ${sample.length} of ${st.recipients.toLocaleString()} recipients.`),
    el("div", { class: "data-table" }, recTable),
  ]));

  body.append(el("div", { class: "drawer-section" }, [el("h3", {}, "Content"), el("div", { class: "email-preview", html: cm.bodyHtml })]));
  body.append(el("div", { class: "campaign-row" }, [
    el("button", { class: "btn", onclick: () => { duplicateCampaign(cm.id); closeCampaignReport(); } }, "Duplicate as new draft"),
    el("button", { class: "btn btn-ghost", onclick: () => showToast("Opens the campaign report in Mailchimp (separate system).", "info") }, "Open in Mailchimp"),
  ]));
  openReportDrawer();
}
function openReportDrawer() {
  byId("campaign-report-drawer").classList.add("open");
  byId("campaign-report-overlay").classList.add("open");
  byId("campaign-report-body").scrollTop = 0;
}
function closeCampaignReport() {
  byId("campaign-report-drawer").classList.remove("open");
  byId("campaign-report-overlay").classList.remove("open");
}
function duplicateCampaign(id) {
  const src = state.campaigns.find((c) => c.id === id);
  const copy = {
    id: genId("cm"), name: src.name + " (copy)", internalName: (src.internalName || src.name) + " (copy)", audience: src.audience, segment: src.segment,
    sentDate: TODAY, sendTime: src.sendTime, status: "Draft", previewText: src.previewText, bodyHtml: src.bodyHtml,
    fromName: src.fromName, fromEmail: src.fromEmail, replyTo: src.replyTo, createdBy: state.currentUser?.name,
  };
  state.campaigns.unshift(copy);
  openDraftInComposer(copy.id);
  showToast(`Draft created from "${src.name}".`, "success");
}
function openDraftInComposer(id) {
  state.composeDraftId = id;
  if (state.view !== "newsletter") { state.subtab.newsletter = "newsletter-send"; showView("newsletter"); }
  else switchSubtab("newsletter", "newsletter-send");
}

// ------------------------------------------------------------------- composer
const MERGE_TAGS = [["First name", "{{first_name}}"], ["Organisation", "{{company}}"], ["Membership tier", "{{membership_tier}}"], ["Renewal date", "{{renewal_date}}"]];
function buildCampaignComposer(container, opts) {
  const mode = opts.mode;
  const draft = opts.draftId ? state.campaigns.find((c) => c.id === opts.draftId) : null;
  container.innerHTML = "";
  container.classList.toggle("composer--split", mode === "newsletter");
  const selection = { memberCriteria: new Set(), nonMemberLists: new Set(), includeSubscribers: false };
  const settings = { trackOpens: true, trackClicks: true, utm: true, delivery: "now", previewDevice: "desktop", tests: [] };
  const field = (label, control, hint) => el("div", { class: "form-row" }, [el("label", {}, label), control, hint || null]);
  const section = (num, title, children) => el("section", { class: "composer-section" }, [el("h3", { class: "composer-section__title" }, [el("span", { class: "composer-section__num" }, String(num)), title]), ...children]);

  // 1. Setup
  const internalInput = el("input", { type: "text", placeholder: "e.g. Monthly Update Oct 2026 — only staff see this" });
  const templateSelect = el("select", {}, state.emailTemplates.map((t) => el("option", { value: t.id }, t.name)));
  const manageBtn = el("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => toggleTemplateManager() }, "Manage templates");
  const manageHost = el("div", { style: "display:none;" });

  // 2. Sender
  const senderSelect = el("select", {}, NEWSLETTER_SENDERS.map((s) => el("option", { value: s.id }, `${s.fromName} <${s.fromEmail}>`)));
  const replyInput = el("input", { type: "email", value: NEWSLETTER_DEFAULTS.replyTo });

  // 3. Subject & preview
  const subjectInput = el("input", { type: "text", placeholder: "Subject line…" });
  const previewInput = el("input", { type: "text", placeholder: "Preview text (inbox snippet)…" });
  const subjectCount = el("div", { class: "char-count" });
  const previewCount = el("div", { class: "char-count" });
  const inboxPreview = el("div", { class: "inbox-preview" });
  let lastFocused = null;

  // 4. Content
  const bodyTextarea = el("textarea", { rows: "10", class: "html-editor", placeholder: "<h2>Heading</h2>\n<p>Body copy…</p>" });
  const previewPane = el("div", { class: "email-preview email-preview--desktop" });
  const deviceToggle = el("div", { class: "segmented segmented--sm" }, ["desktop", "mobile"].map((d) =>
    el("button", { type: "button", class: "segmented__btn" + (d === "desktop" ? " active" : ""), "data-device": d, onclick: () => {
      settings.previewDevice = d;
      deviceToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.device === d));
      previewPane.className = "email-preview email-preview--" + d;
    } }, d === "desktop" ? "Desktop" : "Mobile")));
  const mergeBar = el("div", { class: "merge-bar" }, [el("span", { class: "cell-muted" }, "Insert merge tag:"), ...MERGE_TAGS.map(([label, tag]) =>
    el("button", { type: "button", class: "chip-btn", onclick: () => insertTag(tag) }, label))]);
  [subjectInput, previewInput, bodyTextarea].forEach((n) => n.addEventListener("focus", () => { lastFocused = n; }));
  function insertTag(tag) {
    const target = lastFocused || bodyTextarea;
    const start = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? target.value.length;
    target.value = target.value.slice(0, start) + tag + target.value.slice(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + tag.length;
    refreshAll();
  }

  // 5. Audience
  const summary = el("div", { class: "campaign-summary" });
  const audienceBlocks = [];
  if (mode === "newsletter") {
    const memberChecks = [["all", "All Active Members"], ["contractor", "Contractor Members"], ["corporate", "Corporate Members"], ["renewal_due", "Renewal-Due Members"]]
      .map(([key, label]) => checkboxRow(label, (checked) => { checked ? selection.memberCriteria.add(key) : selection.memberCriteria.delete(key); refreshAll(); }).row);
    audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Members"), el("div", { class: "tier-check-group" }, memberChecks)]));
  }
  const listRows = state.nonMemberLists.map((list) => checkboxRow(list.name, (checked) => { checked ? selection.nonMemberLists.add(list.id) : selection.nonMemberLists.delete(list.id); refreshAll(); }));
  const allLists = checkboxRow("All lists", (checked) => {
    listRows.forEach((r) => { r.box.checked = checked; });
    if (checked) state.nonMemberLists.forEach((l) => selection.nonMemberLists.add(l.id));
    else selection.nonMemberLists.clear();
    refreshAll();
  });
  audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Non-Members"), el("div", { class: "tier-check-group" }, [allLists.row, ...listRows.map((r) => r.row)])]));
  if (mode === "newsletter") {
    const subRow = checkboxRow("Include site subscribers", (checked) => { selection.includeSubscribers = checked; refreshAll(); });
    audienceBlocks.push(el("fieldset", { class: "audience-block" }, [el("legend", {}, "Subscribers"), el("div", { class: "tier-check-group" }, [subRow.row])]));
  }

  // 6. Tracking
  const utmInput = el("input", { type: "text", placeholder: "utm_campaign value" });
  const trackRows = [
    checkboxRow("Track opens", (c) => { settings.trackOpens = c; refreshAll(); }, true).row,
    checkboxRow("Track link clicks", (c) => { settings.trackClicks = c; refreshAll(); }, true).row,
    checkboxRow("Add Google Analytics (UTM) tags to links", (c) => { settings.utm = c; utmInput.disabled = !c; }, true).row,
  ];

  // 7. Delivery
  const dateInput = el("input", { type: "date", value: TODAY, min: TODAY });
  const timeInput = el("input", { type: "time", value: NEWSLETTER_DEFAULTS.sendTime });
  const scheduleFields = el("div", { class: "campaign-row", style: "display:none;" }, [dateInput, timeInput, el("span", { class: "cell-muted" }, "AEST (Sydney)")]);
  const deliveryRadios = el("div", { class: "tier-check-group" }, [["now", "Send immediately"], ["schedule", "Schedule for later"]].map(([v, l]) => {
    const r = el("input", { type: "radio", name: "nl-delivery-" + mode, value: v });
    if (v === "now") r.checked = true;
    r.addEventListener("change", () => { settings.delivery = v; scheduleFields.style.display = v === "schedule" ? "flex" : "none"; refreshAll(); });
    return el("label", { class: "tier-check" }, [r, " " + l]);
  }));

  // 8. Test
  const testInput = el("input", { type: "text", placeholder: "you@amca.com.au, colleague@amca.com.au" });
  const testLog = el("div", { class: "cell-muted", style: "font-size:12px;" });
  const testBtn = el("button", { type: "button", class: "btn btn-sm", onclick: () => {
    const emails = testInput.value.split(/[,\s]+/).filter((e) => /.+@.+\..+/.test(e));
    if (!emails.length) { showToast("Enter at least one valid email address for the test.", "info"); return; }
    settings.tests.push({ at: new Date().toTimeString().slice(0, 5), to: emails });
    testLog.textContent = settings.tests.map((t) => `Test sent ${t.at} → ${t.to.join(", ")}`).join(" · ");
    showToast(`Test email sent to ${emails.join(", ")}.`, "success");
    refreshAll();
  } }, "Send test");

  // Side: checklist + actions
  const checklist = el("ul", { class: "checklist" });
  const recipientsBox = el("div", { class: "recipients-box" });
  const draftBtn = el("button", { type: "button", class: "btn", onclick: () => saveDraft(true) }, "Save draft");
  const reviewBtn = el("button", { type: "button", class: "btn btn-primary", onclick: () => openReview() }, "Review & send");

  // ---- template management (unchanged behaviour)
  const rebuildTemplateSelect = () => {
    templateSelect.innerHTML = "";
    state.emailTemplates.forEach((t) => templateSelect.append(el("option", { value: t.id }, t.name)));
  };
  function toggleTemplateManager() {
    manageHost.style.display = manageHost.style.display === "none" ? "block" : "none";
    if (manageHost.style.display === "block") renderTemplateManager();
  }
  function renderTemplateManager() {
    manageHost.innerHTML = "";
    const list = el("div", { class: "workflow-list" });
    state.emailTemplates.forEach((t) => {
      list.appendChild(el("div", { class: "workflow-row" }, [
        el("div", { class: "workflow-row__top" }, [
          el("div", { class: "workflow-row__name" }, t.name),
          el("div", { class: "campaign-row" }, [
            el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => openTemplateForm(t.id) }, "Edit"),
            el("button", {
              type: "button", class: "btn btn-sm btn-ghost", onclick: () => {
                if (state.emailTemplates.length <= 1) { showToast("At least one template must remain.", "info"); return; }
                if (!confirm(`Delete template "${t.name}"?`)) return;
                state.emailTemplates = state.emailTemplates.filter((x) => x.id !== t.id);
                rebuildTemplateSelect();
                renderTemplateManager();
                showToast(`"${t.name}" deleted.`, "info");
              },
            }, "Delete"),
          ]),
        ]),
        el("div", { class: "workflow-row__subject" }, `“${t.subject || "(no subject)"}”`),
      ]));
    });
    manageHost.append(list, el("button", { type: "button", class: "btn btn-sm btn-primary", style: "margin-top:10px;", onclick: () => openTemplateForm(null) }, "+ Add template"));
  }
  function openTemplateForm(id) {
    const t = id ? state.emailTemplates.find((x) => x.id === id) : { name: "", subject: "", previewText: "", bodyHtml: "<p></p>" };
    const nameInput = el("input", { type: "text", value: t.name, placeholder: "Template name" });
    const subjInput = el("input", { type: "text", value: t.subject, placeholder: "Default subject" });
    const prevInput = el("input", { type: "text", value: t.previewText, placeholder: "Default preview text" });
    const bodyInput = el("textarea", { rows: "3" }, t.bodyHtml);
    manageHost.innerHTML = "";
    manageHost.append(el("div", { class: "panel" }, [
      el("h3", {}, id ? "Edit template" : "Add template"),
      field("Name", nameInput), field("Default subject", subjInput), field("Default preview text", prevInput), field("Default body (HTML)", bodyInput),
      el("div", { class: "campaign-row" }, [
        el("button", {
          type: "button", class: "btn btn-sm btn-primary", onclick: () => {
            if (!nameInput.value.trim()) { showToast("Template name is required.", "info"); return; }
            const payload = { name: nameInput.value.trim(), subject: subjInput.value, previewText: prevInput.value, bodyHtml: bodyInput.value };
            if (id) Object.assign(t, payload);
            else state.emailTemplates.push({ id: genId("tpl"), ...payload });
            rebuildTemplateSelect();
            renderTemplateManager();
            showToast(id ? "Template updated." : "Template added.", "success");
          },
        }, "Save"),
        el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => renderTemplateManager() }, "Cancel"),
      ]),
    ]));
  }
  const applyTemplate = () => {
    const t = state.emailTemplates.find((x) => x.id === templateSelect.value) || state.emailTemplates[0];
    subjectInput.value = t.subject;
    previewInput.value = t.previewText;
    bodyTextarea.value = t.bodyHtml;
    refreshAll();
  };
  templateSelect.onchange = applyTemplate;

  // ---- live state
  const sender = () => NEWSLETTER_SENDERS.find((s) => s.id === senderSelect.value) || NEWSLETTER_SENDERS[0];
  const renderMerge = (s) => s.replace(/{{first_name}}/g, "Alex").replace(/{{company}}/g, "Highline Mechanical").replace(/{{membership_tier}}/g, "Contractor Member").replace(/{{renewal_date}}/g, "1 March 2027");
  const footerHtml = `<div class="email-footer">AMCA Australia · Level 1, 123 Example St, Melbourne VIC 3000<br>You're receiving this because you're an AMCA member or subscribed at amca.com.au. <u>Update preferences</u> · <u>Unsubscribe</u></div>`;
  function checks() {
    const info = composerRecipientInfo(selection);
    const schedOk = settings.delivery === "now" || (dateInput.value && timeInput.value && (dateInput.value > TODAY || dateInput.value === TODAY));
    return [
      { ok: !!internalInput.value.trim(), label: "Campaign name set", soft: true },
      { ok: !!subjectInput.value.trim(), label: "Subject line written" },
      { ok: subjectInput.value.length <= 60, label: "Subject ≤ 60 characters", soft: true },
      { ok: !!previewInput.value.trim(), label: "Preview text written", soft: true },
      { ok: bodyTextarea.value.replace(/<[^>]*>/g, "").trim().length > 20, label: "Body has content" },
      { ok: info.sendable > 0, label: `Audience selected (${info.sendable.toLocaleString()} recipients)` },
      { ok: true, label: "Unsubscribe link & postal address (added automatically)" },
      { ok: schedOk, label: settings.delivery === "now" ? "Sending immediately" : "Send date & time set" },
      { ok: settings.tests.length > 0, label: "Test email sent", soft: true },
    ];
  }
  function refreshAll() {
    subjectCount.textContent = `${subjectInput.value.length} / 60`;
    subjectCount.classList.toggle("char-count--over", subjectInput.value.length > 60);
    previewCount.textContent = `${previewInput.value.length} / 90`;
    previewCount.classList.toggle("char-count--over", previewInput.value.length > 90);
    inboxPreview.innerHTML = "";
    inboxPreview.append(
      el("div", { class: "inbox-preview__from" }, sender().fromName),
      el("div", { class: "inbox-preview__subject" }, renderMerge(subjectInput.value) || "(no subject)"),
      el("div", { class: "inbox-preview__snippet" }, renderMerge(previewInput.value) || "(no preview text — inboxes will show the first line of the body)")
    );
    previewPane.innerHTML = renderMerge(bodyTextarea.value || "<p class='cell-muted'>Nothing to preview yet.</p>") + footerHtml;
    if (!utmInput.dataset.touched) utmInput.value = (internalInput.value || subjectInput.value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

    const info = composerRecipientInfo(selection);
    let text = `${describeSelection(selection)} — ${info.sendable.toLocaleString()} recipient${info.sendable === 1 ? "" : "s"}.`;
    if (info.blocked > 0) text += ` ${info.blocked} excluded (no consent or unsubscribed).`;
    summary.textContent = text;
    recipientsBox.innerHTML = "";
    recipientsBox.append(
      el("div", { class: "recipients-box__total" }, info.sendable.toLocaleString()),
      el("div", { class: "cell-muted" }, "recipients after consent & unsubscribe checks"),
      el("div", { class: "recipients-box__split" }, [
        el("span", {}, `Members ${info.split.members}`), el("span", {}, `Non-members ${info.split.nonMembers}`), el("span", {}, `Subscribers ${info.split.subscribers}`),
      ])
    );
    checklist.innerHTML = "";
    checks().forEach((c) => checklist.append(el("li", { class: c.ok ? "ok" : c.soft ? "warn" : "fail" }, [el("span", { class: "checklist__icon", "aria-hidden": "true" }, c.ok ? "✓" : c.soft ? "!" : "✕"), c.label])));
    reviewBtn.textContent = settings.delivery === "schedule" ? "Review & schedule" : "Review & send";
  }
  [internalInput, subjectInput, previewInput, bodyTextarea, replyInput, dateInput, timeInput].forEach((n) => n.addEventListener("input", refreshAll));
  senderSelect.addEventListener("change", refreshAll);
  utmInput.addEventListener("input", () => { utmInput.dataset.touched = "1"; });

  function payload(status) {
    const info = composerRecipientInfo(selection);
    const s = sender();
    return {
      name: subjectInput.value.trim() || "Untitled newsletter", internalName: internalInput.value.trim(), audience: audienceTypeFor(selection), segment: describeSelection(selection),
      previewText: previewInput.value, bodyHtml: bodyTextarea.value, fromName: s.fromName, fromEmail: s.fromEmail, replyTo: replyInput.value,
      sentDate: settings.delivery === "schedule" ? dateInput.value : TODAY, sendTime: settings.delivery === "schedule" ? timeInput.value : new Date().toTimeString().slice(0, 5),
      recipients: info.sendable, status, tracking: { opens: settings.trackOpens, clicks: settings.trackClicks, utm: settings.utm ? utmInput.value : null },
      createdBy: state.currentUser?.name,
    };
  }
  let currentId = draft ? draft.id : null;
  function upsert(data) {
    const existing = currentId && state.campaigns.find((c) => c.id === currentId);
    if (existing) { Object.assign(existing, data); return existing; }
    const cm = { id: genId("cm"), ...data };
    state.campaigns.unshift(cm);
    currentId = cm.id;
    if (mode === "newsletter") state.composeDraftId = cm.id;
    return cm;
  }
  function saveDraft(toast) {
    const cm = upsert(payload("Draft"));
    if (toast) showToast(`Draft "${cm.internalName || cm.name}" saved.`, "success");
    opts.onSaved && opts.onSaved();
    return cm;
  }
  function openReview() {
    const failing = checks().filter((c) => !c.ok && !c.soft);
    if (failing.length) { showToast("Fix before sending: " + failing.map((c) => c.label.toLowerCase()).join(", ") + ".", "info"); return; }
    const p = payload(settings.delivery === "schedule" ? "Scheduled" : "Sent");
    const warnings = checks().filter((c) => !c.ok && c.soft);
    const modal = el("div", { class: "modal" }, [
      el("div", { class: "modal__card" }, [
        el("h2", {}, settings.delivery === "schedule" ? "Schedule this newsletter?" : "Send this newsletter now?"),
        el("dl", { class: "drawer-kv", style: "margin:12px 0;" }, [
          el("dt", {}, "Subject"), el("dd", {}, p.name),
          el("dt", {}, "Preview text"), el("dd", {}, p.previewText || "—"),
          el("dt", {}, "From"), el("dd", {}, `${p.fromName} <${p.fromEmail}>`),
          el("dt", {}, "Reply-to"), el("dd", {}, p.replyTo),
          el("dt", {}, "Audience"), el("dd", {}, `${p.segment}`),
          el("dt", {}, "Recipients"), el("dd", {}, p.recipients.toLocaleString()),
          el("dt", {}, "Delivery"), el("dd", {}, settings.delivery === "schedule" ? `${fmtDate(p.sentDate)} at ${p.sendTime} AEST` : "Immediately"),
          el("dt", {}, "Tracking"), el("dd", {}, [settings.trackOpens && "opens", settings.trackClicks && "clicks", settings.utm && `UTM: ${utmInput.value}`].filter(Boolean).join(", ") || "Off"),
        ]),
        warnings.length ? el("div", { class: "review-warn" }, "Optional steps skipped: " + warnings.map((w) => w.label).join(" · ")) : null,
        el("div", { class: "campaign-row", style: "justify-content:flex-end;margin-top:14px;" }, [
          el("button", { type: "button", class: "btn", onclick: () => modal.remove() }, "Back to editing"),
          el("button", { type: "button", class: "btn btn-primary", onclick: () => { modal.remove(); commit(p); } }, settings.delivery === "schedule" ? "Schedule" : "Send now"),
        ]),
      ]),
    ]);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.append(modal);
  }
  function commit(p) {
    if (p.status === "Sent") {
      const rnd = seededRandom(p.name + p.recipients);
      const baseOpen = p.audience === "Members" ? 0.55 : p.audience === "Non-members" ? 0.35 : p.audience === "Subscribers" ? 0.4 : 0.4;
      const hard = Math.round(p.recipients * 0.006), soft = Math.round(p.recipients * 0.01);
      const delivered = p.recipients - hard - soft;
      const opens = Math.round(delivered * (baseOpen - rnd() * 0.05));
      Object.assign(p, { hardBounces: hard, softBounces: soft, uniqueOpens: opens, uniqueClicks: Math.round(opens * (0.2 + rnd() * 0.1)), unsubscribes: Math.round(p.recipients * 0.002), complaints: 0,
        links: [["Read more", "amca.com.au", 0.7], ["View in browser", "mailchi.mp/amca", 0.3]] });
    }
    upsert(p);
    logSync(p.status === "Sent"
      ? `Mailchimp campaign sent: "${p.name}" → ${p.segment} (${p.recipients} recipients, consent-checked)`
      : `Mailchimp campaign scheduled: "${p.name}" for ${fmtDate(p.sentDate)} ${p.sendTime} AEST (${p.recipients} recipients)`);
    showToast(p.status === "Sent" ? `Newsletter sent via Mailchimp to ${p.recipients.toLocaleString()} contact${p.recipients === 1 ? "" : "s"}.` : `Newsletter scheduled for ${fmtDate(p.sentDate)} at ${p.sendTime} AEST.`, "success");
    opts.onSent && opts.onSent();
  }

  // ---- layout
  const main = el("div", { class: "composer-main" }, [
    section(1, "Setup", [
      field("Campaign name (internal)", internalInput),
      el("div", { class: "form-row" }, [el("label", {}, "Start from template"), el("div", { class: "campaign-row" }, [templateSelect, manageBtn])]),
      manageHost,
    ]),
    section(2, "Sender", [el("div", { class: "form-grid-2" }, [field("From", senderSelect), field("Reply-to address", replyInput)])]),
    section(3, "Subject & inbox preview", [
      field("Subject line", subjectInput, subjectCount),
      field("Preview text", previewInput, previewCount),
      el("div", { class: "form-row" }, [el("label", {}, "How it looks in the inbox"), inboxPreview]),
    ]),
    section(4, "Content", [
      mergeBar,
      el("div", { class: "editor-row" }, [
        el("div", { class: "editor-col" }, [el("label", {}, "Email body (HTML)"), bodyTextarea]),
        el("div", { class: "editor-col" }, [el("div", { class: "editor-col__head" }, [el("label", {}, "Preview (sample data)"), deviceToggle]), previewPane]),
      ]),
    ]),
    section(5, "Audience", [el("div", { class: "audience-picker" }, audienceBlocks), summary]),
    section(6, "Tracking", [el("div", { class: "tier-check-group tier-check-group--stack" }, trackRows), field("UTM campaign tag", utmInput)]),
    section(7, "Delivery", [deliveryRadios, scheduleFields]),
    section(8, "Send a test", [el("div", { class: "campaign-row" }, [testInput, testBtn]), testLog]),
  ]);
  const side = el("aside", { class: "composer-side" }, [
    el("div", { class: "panel composer-side__card" }, [
      el("h3", {}, draft ? "Editing draft" : "Ready to send?"),
      recipientsBox,
      checklist,
      el("div", { class: "composer-side__actions" }, [reviewBtn, draftBtn]),
    ]),
  ]);
  container.append(main, side);

  if (draft) {
    internalInput.value = draft.internalName || "";
    subjectInput.value = draft.name || "";
    previewInput.value = draft.previewText || "";
    bodyTextarea.value = draft.bodyHtml || "";
    const s = NEWSLETTER_SENDERS.find((x) => x.fromEmail === draft.fromEmail);
    if (s) senderSelect.value = s.id;
    if (draft.replyTo) replyInput.value = draft.replyTo;
    refreshAll();
  } else applyTemplate();
}

function refreshAllCampaignViews() {
  if (byId("newsletter-history-body")) renderNewsletterHistory();
  renderCampaignSummary(byId("nonmember-campaign-summary"), "Non-members");
  renderCampaignsTable(byId("nonmember-campaigns-table"), "Non-members");
}
function renderNewsletterSend() {
  const draftId = state.composeDraftId;
  const draft = draftId && state.campaigns.find((c) => c.id === draftId);
  byId("newsletter-compose-title").textContent = draft ? `Edit draft — ${draft.internalName || draft.name}` : "New newsletter";
  buildCampaignComposer(byId("campaign-builder"), {
    mode: "newsletter",
    draftId,
    onSent: () => { state.composeDraftId = null; refreshAllCampaignViews(); switchSubtab("newsletter", "newsletter-history"); },
    onSaved: () => { refreshAllCampaignViews(); },
  });
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
  const moodle = INTEGRATIONS.find((i) => i.id === "moodle");
  const vettrak = INTEGRATIONS.find((i) => i.id === "vettrak");
  const bothSynced = state.trainingsMoodleSynced && state.trainingsVetTrakSynced;
  byId("training-sync-status").textContent = bothSynced ? "Synced with Moodle & VetTrak — up to date" : `Last synced: Moodle ${moodle.lastSync} · VetTrak ${vettrak.lastSync}`;
  byId("training-sync-moodle-btn").onclick = () => {
    if (state.trainingsMoodleSynced) { showToast("Already up to date with Moodle.", "info"); return; }
    TRAININGS_PENDING_SYNC_MOODLE.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsMoodleSynced = true;
    logSync(`Moodle sync: ${TRAININGS_PENDING_SYNC_MOODLE.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC_MOODLE.length} new training record(s) synced from Moodle.`, "success");
    renderTraining();
  };
  byId("training-sync-vettrak-btn").onclick = () => {
    if (state.trainingsVetTrakSynced) { showToast("Already up to date with VetTrak.", "info"); return; }
    TRAININGS_PENDING_SYNC_VETTRAK.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsVetTrakSynced = true;
    logSync(`VetTrak sync: ${TRAININGS_PENDING_SYNC_VETTRAK.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC_VETTRAK.length} new training record(s) synced from VetTrak.`, "success");
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
  renderCampaignsTable(byId("nonmember-campaigns-table"), "Non-members");
  byId("nonmember-campaign-new-btn").onclick = openCampaignDrawer;
}
function openCampaignDrawer() {
  buildCampaignComposer(byId("nonmember-campaign-builder"), {
    mode: "nonmember",
    onSent: () => { refreshAllCampaignViews(); closeCampaignDrawer(); },
  });
  byId("campaign-drawer").classList.add("open");
  byId("campaign-drawer-overlay").classList.add("open");
}
function closeCampaignDrawer() {
  byId("campaign-drawer").classList.remove("open");
  byId("campaign-drawer-overlay").classList.remove("open");
}

// ----------------------------------------------------------------- automation
function renderAutomation() {
  renderWorkflowList("workflow-onboarding", "onboarding");
  renderWorkflowList("workflow-renewal", "renewal");
  renderWorkflowList("workflow-offboarding", "offboarding");
}
// Lifecycle emails get the same editing tools as a newsletter: subject,
// preview text, HTML body with merge tags, live preview and a test send.
function defaultLifecycleBody(step) {
  return `<h2>${step.subject.replace(/ — AMCA Australia$/, "")}</h2>\n<p>Hi {{first_name}},</p>\n<p>[${step.name} — write the message for ${step.audience.toLowerCase()} here.]</p>\n<p>Kind regards,<br>The AMCA Membership Team</p>`;
}
function buildLifecycleEmailEditor(step, onClose) {
  const subjectInput = el("input", { type: "text", value: step.subject });
  const previewInput = el("input", { type: "text", value: step.previewText || "", placeholder: "Preview text (inbox snippet)…" });
  const bodyInput = el("textarea", { rows: "10", class: "html-editor" });
  bodyInput.value = step.bodyHtml || defaultLifecycleBody(step);
  const previewPane = el("div", { class: "email-preview email-preview--desktop" });
  const inbox = el("div", { class: "inbox-preview" });
  const subjectCount = el("div", { class: "char-count" });
  const testInput = el("input", { type: "text", placeholder: "you@amca.com.au" });
  let lastFocused = bodyInput;
  [subjectInput, previewInput, bodyInput].forEach((n) => n.addEventListener("focus", () => { lastFocused = n; }));
  const sample = (t) => t.replace(/{{first_name}}/g, "Alex").replace(/{{company}}/g, "Highline Mechanical").replace(/{{membership_tier}}/g, "Contractor Member").replace(/{{renewal_date}}/g, "1 March 2027");
  const refresh = () => {
    subjectCount.textContent = `${subjectInput.value.length} / 60`;
    subjectCount.classList.toggle("char-count--over", subjectInput.value.length > 60);
    inbox.innerHTML = "";
    inbox.append(el("div", { class: "inbox-preview__from" }, "AMCA Australia"), el("div", { class: "inbox-preview__subject" }, sample(subjectInput.value) || "(no subject)"), el("div", { class: "inbox-preview__snippet" }, sample(previewInput.value) || "(no preview text)"));
    previewPane.innerHTML = sample(bodyInput.value) + `<div class="email-footer">AMCA Australia · Level 1, 123 Example St, Melbourne VIC 3000</div>`;
  };
  [subjectInput, previewInput, bodyInput].forEach((n) => n.addEventListener("input", refresh));
  const deviceToggle = el("div", { class: "segmented segmented--sm" }, ["desktop", "mobile"].map((d) =>
    el("button", { type: "button", class: "segmented__btn" + (d === "desktop" ? " active" : ""), "data-device": d, onclick: () => {
      deviceToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.device === d));
      previewPane.className = "email-preview email-preview--" + d;
    } }, d === "desktop" ? "Desktop" : "Mobile")));
  const mergeBar = el("div", { class: "merge-bar" }, [el("span", { class: "cell-muted" }, "Insert merge tag:"), ...MERGE_TAGS.map(([label, tag]) =>
    el("button", { type: "button", class: "chip-btn", onclick: () => {
      const t = lastFocused, st = t.selectionStart ?? t.value.length, en = t.selectionEnd ?? t.value.length;
      t.value = t.value.slice(0, st) + tag + t.value.slice(en); t.focus(); t.selectionStart = t.selectionEnd = st + tag.length; refresh();
    } }, label))]);
  const editor = el("div", { class: "workflow-editor workflow-editor--full" }, [
    el("div", { class: "form-row" }, [el("label", {}, "Subject line"), subjectInput, subjectCount]),
    el("div", { class: "form-row" }, [el("label", {}, "Preview text"), previewInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Inbox preview"), inbox]),
    mergeBar,
    el("div", { class: "editor-row" }, [
      el("div", { class: "editor-col" }, [el("label", {}, "Email body (HTML)"), bodyInput]),
      el("div", { class: "editor-col" }, [el("div", { class: "editor-col__head" }, [el("label", {}, "Preview (sample data)"), deviceToggle]), previewPane]),
    ]),
    el("div", { class: "campaign-row" }, [
      testInput,
      el("button", { type: "button", class: "btn btn-sm", onclick: () => {
        const emails = testInput.value.split(/[,\s]+/).filter((e) => /.+@.+\..+/.test(e));
        if (!emails.length) { showToast("Enter at least one valid email address for the test.", "info"); return; }
        showToast(`Test of "${step.name}" sent to ${emails.join(", ")}.`, "success");
      } }, "Send test"),
    ]),
    el("div", { class: "campaign-row" }, [
      el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => {
        if (!subjectInput.value.trim()) { showToast("Subject line is required.", "info"); return; }
        Object.assign(step, { subject: subjectInput.value, previewText: previewInput.value, bodyHtml: bodyInput.value });
        showToast(`"${step.name}" template saved.`, "success"); renderAutomation();
      } }, "Save"),
      el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: onClose }, "Cancel"),
    ]),
  ]);
  refresh();
  return editor;
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
      row.appendChild(buildLifecycleEmailEditor(step, () => row.querySelector(".workflow-editor")?.remove()));
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
    subtabWrap.append(el("button", { class: "subtab-btn", "data-subtab": "cms-images" }, "Images"));
    panelsWrap.append(el("div", { class: "subtab-panel", id: "cms-images" }));

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
const docRepoTabState = {};
const docLibraryCategoryState = {};
function renderDocReviews(reviewsContainerId) {
  const host = byId(reviewsContainerId);
  if (!host) return;
  if (!docRepoTabState[reviewsContainerId]) docRepoTabState[reviewsContainerId] = "awaiting";
  const activeTab = docRepoTabState[reviewsContainerId];
  host.innerHTML = "";

  const pending = state.docTemplates.filter((d) => d.pending);
  const tabs = el("div", { class: "subtabs subtabs--nested" }, [
    el("button", { class: "doc-tab-btn " + (activeTab === "awaiting" ? "active" : ""), onclick: () => { docRepoTabState[reviewsContainerId] = "awaiting"; renderDocReviews(reviewsContainerId); } }, `Awaiting review (${pending.length})`),
    el("button", { class: "doc-tab-btn " + (activeTab === "repo" ? "active" : ""), onclick: () => { docRepoTabState[reviewsContainerId] = "repo"; renderDocReviews(reviewsContainerId); } }, "Library"),
  ]);
  host.appendChild(tabs);

  const byCategory = {};
  state.docTemplates.forEach((d) => { (byCategory[d.category] = byCategory[d.category] || []).push(d); });

  if (activeTab === "awaiting") {
    const panel = el("div", { class: "panel" });
    Object.entries(byCategory).forEach(([category, docs]) => {
      const docsPending = docs.filter((d) => d.pending);
      if (!docsPending.length) return;
      panel.append(el("div", { class: "workflow-row__meta", style: "margin:4px 0 6px;" }, `${category} (${docsPending.length})`));
      docsPending.forEach((d) => {
        panel.append(
          el("div", { class: "person-row clickable", onclick: () => openDocDetail(d.id) }, [
            el("div", {}, [
              el("div", { class: "person-row__name" }, `${d.title} · ${d.code}`),
              el("div", { class: "person-row__role" }, `${d.pending.editedBy} · ${fmtDate(d.pending.submitted)}`),
            ]),
            el("span", { class: "badge badge-warning" }, "In review"),
          ])
        );
      });
    });
    if (!pending.length) panel.append(el("p", { class: "cell-muted" }, "Nothing awaiting review."));
    host.appendChild(panel);
    return;
  }

  // Library — the entire document set, browsable by category
  const openCat = docLibraryCategoryState[reviewsContainerId];
  if (!openCat) {
    host.append(
      el("p", {}, [el("b", {}, String(state.docTemplates.length)), ` documents across ${DOC_CATEGORIES.length} categories`]),
      el("div", { class: "benefits-grid" }, DOC_CATEGORIES.map((cat) => {
        const docs = byCategory[cat.key] || [];
        return el("div", { class: "benefit-card clickable", onclick: () => { docLibraryCategoryState[reviewsContainerId] = cat.key; renderDocReviews(reviewsContainerId); } }, [
          el("div", { class: "benefit-card__top" }, [el("h3", {}, cat.label), el("span", { class: "badge badge-navy" }, String(docs.length))]),
          el("p", { class: "benefit-card__desc" }, cat.description),
          el("div", { class: "benefit-card__meta" }, docs.length ? `${docs.filter((d) => d.liveVersion).length} published · ${docs.filter((d) => d.pending).length} in review` : "No documents yet"),
        ]);
      }))
    );
    return;
  }

  const cat = DOC_CATEGORIES.find((c) => c.key === openCat);
  const docs = byCategory[openCat] || [];
  host.append(
    el("button", { class: "btn btn-sm btn-ghost", style: "margin-bottom:10px;", onclick: () => { docLibraryCategoryState[reviewsContainerId] = null; renderDocReviews(reviewsContainerId); } }, "← All categories"),
    el("div", { class: "panel" }, [
      el("div", { class: "panel__head" }, el("h2", {}, `${cat.label} (${docs.length})`)),
      el("p", { class: "cell-muted", style: "margin-bottom:10px;" }, cat.description),
      ...docs.map((d) =>
        el("div", { class: "person-row clickable", onclick: () => openDocDetail(d.id) }, [
          el("div", {}, [
            el("div", { class: "person-row__name" }, `${d.title} · ${d.code}`),
            el("div", { class: "person-row__role" }, `Applies to: ${d.appliesTo || "—"}`),
          ]),
          el("div", { style: "display:flex;align-items:center;gap:8px;" }, [
            d.pending ? el("span", { class: "badge badge-warning" }, "Edit in review") : null,
            el("span", { class: "badge badge-neutral" }, d.liveVersion ? "v" + d.liveVersion + " live" : "Not yet published"),
          ]),
        ])
      ),
      !docs.length ? el("p", { class: "cell-muted" }, "No documents in this category yet.") : null,
    ])
  );
}

// -------------------------------------------------------- document detail
function openDocDetail(docId) {
  const d = state.docTemplates.find((x) => x.id === docId);
  if (!d) return;
  byId("doc-detail-drawer").dataset.docId = docId;
  byId("doc-detail-title").textContent = `${d.title} · ${d.code}`;
  renderDocDetailBody(d);
  byId("doc-detail-drawer").classList.add("open");
  byId("doc-detail-drawer-overlay").classList.add("open");
}
function closeDocDetail() {
  byId("doc-detail-drawer").classList.remove("open");
  byId("doc-detail-drawer-overlay").classList.remove("open");
}
function refreshDocDetailIfOpen() {
  const id = byId("doc-detail-drawer").dataset.docId;
  if (id && byId("doc-detail-drawer").classList.contains("open")) {
    const d = state.docTemplates.find((x) => x.id === id);
    if (d) renderDocDetailBody(d);
  }
}
function renderDocDetailBody(d) {
  const body = byId("doc-detail-body");
  body.innerHTML = "";

  body.append(
    el("div", { class: "drawer-section" }, [
      el("span", { class: "badge badge-navy" }, d.category),
      " ",
      el("span", { class: "badge " + (d.liveVersion ? "badge-success" : "badge-neutral") }, d.liveVersion ? "v" + d.liveVersion + " live" : "Not yet published"),
    ])
  );

  if (d.pending) {
    body.append(
      el("div", { class: "drawer-section" }, [
        el("h3", {}, "Pending submission"),
        el("div", { class: "campaign-summary", style: "margin-bottom:10px;" }, [
          el("b", {}, "Submission note: "), d.pending.note || "(none)",
        ]),
        el("div", { class: "cell-muted", style: "margin-bottom:10px;" }, `Submitted by ${d.pending.editedBy} · ${fmtDate(d.pending.submitted)}`),
        el("div", { class: "campaign-row" }, [
          el("button", { class: "btn btn-sm", onclick: () => requestDocChanges(d.id) }, "Request changes"),
          el("button", { class: "btn btn-sm", style: "border-color:var(--danger);color:var(--danger);", onclick: () => rejectDocEdit(d.id) }, "Reject edit"),
          el("button", { class: "btn btn-sm btn-primary", onclick: () => approveDocReview(d.id) }, "Approve & publish"),
        ]),
      ])
    );
  }

  body.append(
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Overview"),
      el("p", {}, d.overview),
    ])
  );

  const historyEntries = [...d.history].reverse();
  const typeMeta = {
    submitted: { label: "Submitted for review", cls: "badge-navy" },
    published: { label: "Published", cls: "badge-success" },
    rejected: { label: "Rejected", cls: "badge-danger" },
    changes_requested: { label: "Changes requested", cls: "badge-warning" },
    restored: { label: "Restored from a past version", cls: "badge-neutral" },
  };
  body.append(
    el("div", { class: "drawer-section" }, [
      el("h3", {}, "Edit history"),
      el("div", { class: "activity-list" }, historyEntries.length ? historyEntries.map((h) => {
        const meta = typeMeta[h.type] || { label: h.type, cls: "badge-neutral" };
        const isLive = h.type === "published" && h.version === d.liveVersion;
        return el("div", { class: "activity-item", style: "grid-template-columns:90px 1fr auto;align-items:start;gap:10px;" }, [
          el("div", { class: "activity-item__date" }, fmtDate(h.date)),
          el("div", {}, [
            el("div", {}, [
              el("span", { class: "badge " + meta.cls, style: "margin-right:6px;" }, meta.label),
              h.version != null ? el("span", { class: "badge " + (isLive ? "badge-success" : "badge-neutral") }, "v" + h.version + (isLive ? " LIVE" : "")) : null,
            ]),
            el("div", { class: "cell-muted" }, h.actor),
            h.note ? el("div", { style: "font-style:italic;font-size:12.5px;margin-top:2px;" }, `“${h.note}”`) : null,
          ]),
          h.type === "published" && !isLive
            ? el("button", { class: "btn btn-sm", onclick: () => restoreDocVersion(d.id, h.version) }, "Restore")
            : null,
        ]);
      }) : [el("p", { class: "cell-muted" }, "No history yet.")]),
    ])
  );
}
function approveDocReview(docId) {
  const d = state.docTemplates.find((x) => x.id === docId);
  if (!d || !d.pending) return;
  const nextVersion = d.liveVersion + 1;
  d.history.push({ type: "submitted", actor: d.pending.editedBy, date: d.pending.submitted, note: d.pending.note });
  d.history.push({ type: "published", actor: state.currentUser, date: TODAY, version: nextVersion });
  d.liveVersion = nextVersion;
  d.updated = TODAY;
  d.pending = null;
  showToast(`"${d.title}" approved and published (v${nextVersion}).`, "success");
  refreshDocDetailIfOpen();
  renderAllDocGenViews();
}
function rejectDocEdit(docId) {
  const d = state.docTemplates.find((x) => x.id === docId);
  if (!d || !d.pending) return;
  const reason = prompt(`Reason for rejecting this edit to "${d.title}"?`, "");
  if (reason === null) return;
  d.history.push({ type: "submitted", actor: d.pending.editedBy, date: d.pending.submitted, note: d.pending.note });
  d.history.push({ type: "rejected", actor: state.currentUser, date: TODAY, note: reason });
  d.pending = null;
  showToast(`Edit to "${d.title}" rejected.`, "info");
  refreshDocDetailIfOpen();
  renderAllDocGenViews();
}
function requestDocChanges(docId) {
  const d = state.docTemplates.find((x) => x.id === docId);
  if (!d || !d.pending) return;
  const note = prompt(`What changes are needed for "${d.title}"?`, "");
  if (note === null) return;
  d.history.push({ type: "changes_requested", actor: state.currentUser, date: TODAY, note });
  showToast(`Changes requested for "${d.title}".`, "info");
  refreshDocDetailIfOpen();
  renderAllDocGenViews();
}
function restoreDocVersion(docId, version) {
  const d = state.docTemplates.find((x) => x.id === docId);
  if (!d) return;
  if (!confirm(`Restore "${d.title}" to v${version}? This becomes the new live version.`)) return;
  d.history.push({ type: "restored", actor: state.currentUser, date: TODAY, version, note: `Restored to v${version}` });
  d.liveVersion = version;
  d.updated = TODAY;
  showToast(`"${d.title}" restored to v${version}.`, "success");
  refreshDocDetailIfOpen();
  renderAllDocGenViews();
}
function renderAllDocGenViews() {
  ["docgen-reviews", "pdocgen-reviews"].forEach((id) => { if (byId(id)) renderDocReviews(id); });
}
function renderDocGen(ids) {
  const idOf = ids || { reviews: "docgen-reviews" };
  renderDocReviews(idOf.reviews);
}

// ------------------------------------------------ document templates (Settings)
function renderDocTemplatesSettings() {
  byId("doctemplates-count").textContent = `${state.docTemplates.length} templates · ${state.docTemplates.filter((t) => t.active).length} active`;
  byId("doctemplate-add-btn").onclick = () => openDocTemplateForm(null);
  const wrap = byId("doctemplates-list");
  wrap.innerHTML = "";
  state.docTemplates.forEach((t) => {
    const row = el("div", { class: "workflow-row" });
    const top = el("div", { class: "workflow-row__top" }, [
      el("div", { class: "workflow-row__name" }, `${t.title} · ${t.code}`),
      el("button", { class: "btn btn-sm " + (t.active ? "" : "btn-ghost"), onclick: () => { t.active = !t.active; renderDocTemplatesSettings(); } }, t.active ? "Active" : "Paused"),
    ]);
    const meta = el("div", { class: "workflow-row__meta" }, [el("span", {}, [el("b", {}, "Category: "), t.category]), el("span", {}, [el("b", {}, "Applies to: "), t.appliesTo]), el("span", {}, [el("b", {}, "Updated: "), fmtDate(t.updated)])]);
    const bodyLine = el("div", { class: "workflow-row__subject" }, t.overview);
    const actions = el("div", { class: "campaign-row" }, [
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => openDocTemplateForm(t.id) }, "Edit"),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => {
        if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
        state.docTemplates = state.docTemplates.filter((x) => x.id !== t.id);
        showToast(`"${t.title}" deleted.`, "info");
        renderDocTemplatesSettings();
      } }, "Delete"),
    ]);
    row.append(top, meta, bodyLine, actions);
    wrap.appendChild(row);
  });
}
function openDocTemplateForm(id) {
  const t = id ? state.docTemplates.find((x) => x.id === id) : { title: "", code: "", category: "SWMS", appliesTo: "", overview: "", active: true };
  const panel = byId("doctemplate-form-panel");
  panel.style.display = "block";
  panel.innerHTML = "";
  const titleInput = el("input", { type: "text", value: t.title, placeholder: "Document title" });
  const codeInput = el("input", { type: "text", value: t.code, placeholder: "Document code, e.g. SWMS-005" });
  const categoryInput = el("input", { type: "text", value: t.category, placeholder: "Category, e.g. SWMS" });
  const appliesInput = el("input", { type: "text", value: t.appliesTo, placeholder: "Applies to" });
  const overviewInput = el("textarea", { rows: "4", placeholder: "Overview / scope" }, t.overview);
  panel.append(
    el("h3", {}, id ? "Edit template" : "Add template"),
    el("div", { class: "form-row" }, [el("label", {}, "Title"), titleInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Code"), codeInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Category"), categoryInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Applies to"), appliesInput]),
    el("div", { class: "form-row" }, [el("label", {}, "Overview"), overviewInput]),
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary", onclick: () => {
          if (!titleInput.value.trim()) { showToast("Title is required.", "info"); return; }
          const payload = { title: titleInput.value.trim(), code: codeInput.value.trim(), category: categoryInput.value.trim() || "General", appliesTo: appliesInput.value.trim(), overview: overviewInput.value.trim(), updated: TODAY };
          if (id) Object.assign(t, payload);
          else state.docTemplates.push({ id: genId("d"), active: true, liveVersion: 0, pending: null, history: [], ...payload });
          panel.style.display = "none";
          showToast(id ? "Template updated." : "Template added.", "success");
          renderDocTemplatesSettings();
          renderAllDocGenViews();
        },
      }, "Save"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ])
  );
}

// ------------------------------------------------------- pipeline stages
function moveArrayItem(arr, idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  const [item] = arr.splice(idx, 1);
  arr.splice(newIdx, 0, item);
}
function renderStageList(containerId, stages) {
  const wrap = byId(containerId);
  wrap.innerHTML = "";
  stages.forEach((s, idx) => {
    const labelInput = el("input", { type: "text", value: s.label, style: "max-width:260px;" });
    labelInput.addEventListener("change", () => {
      if (!labelInput.value.trim()) { labelInput.value = s.label; return; }
      s.label = labelInput.value.trim();
      showToast("Stage renamed.", "success");
    });
    const row = el("div", { class: "workflow-row" }, [
      el("div", { class: "workflow-row__top" }, [
        labelInput,
        el("div", { class: "campaign-row" }, [
          el("button", { class: "btn btn-sm btn-ghost", ...(idx === 0 ? { disabled: "disabled" } : {}), onclick: () => { moveArrayItem(stages, idx, -1); renderStageList(containerId, stages); } }, "↑"),
          el("button", { class: "btn btn-sm btn-ghost", ...(idx === stages.length - 1 ? { disabled: "disabled" } : {}), onclick: () => { moveArrayItem(stages, idx, 1); renderStageList(containerId, stages); } }, "↓"),
          el("button", {
            class: "btn btn-sm btn-ghost", onclick: () => {
              if (stages.length <= 1) { showToast("At least one stage must remain.", "info"); return; }
              if (!confirm(`Delete stage "${s.label}"?`)) return;
              stages.splice(stages.indexOf(s), 1);
              renderStageList(containerId, stages);
              showToast("Stage deleted.", "info");
            },
          }, "Delete"),
        ]),
      ]),
      el("div", { class: "workflow-row__meta" }, [el("span", {}, [el("b", {}, "id: "), s.id])]),
    ]);
    wrap.appendChild(row);
  });
}
function addStage(stages, containerId, prefix) {
  const label = prompt("New stage name:", "");
  if (!label || !label.trim()) return;
  stages.push({ id: prefix + "_" + Date.now().toString(36), label: label.trim() });
  renderStageList(containerId, stages);
  showToast("Stage added.", "success");
}
function renderPipelineStagesSettings() {
  renderStageList("onboard-stages-list", state.onboardingStages);
  renderStageList("renewal-stages-list", state.renewalStages);
  byId("onboard-stage-add-btn").onclick = () => addStage(state.onboardingStages, "onboard-stages-list", "os");
  byId("renewal-stage-add-btn").onclick = () => addStage(state.renewalStages, "renewal-stages-list", "rs");
}

// -------------------------------------------------------------- form fields
function renderFieldList(containerId, fields) {
  const wrap = byId(containerId);
  wrap.innerHTML = "";
  fields.forEach((f, idx) => {
    const labelInput = el("input", { type: "text", value: f.label, style: "max-width:220px;" });
    labelInput.addEventListener("change", () => { if (labelInput.value.trim()) { f.label = labelInput.value.trim(); showToast("Field updated.", "success"); } else labelInput.value = f.label; });
    const typeSelect = el("select", {}, ["text", "select", "email", "phone", "textarea"].map((t) => el("option", { value: t, ...(f.type === t ? { selected: "selected" } : {}) }, t)));
    typeSelect.addEventListener("change", () => { f.type = typeSelect.value; });
    const requiredBox = el("input", { type: "checkbox", ...(f.required ? { checked: "checked" } : {}) });
    requiredBox.addEventListener("change", () => { f.required = requiredBox.checked; });
    const row = el("div", { class: "workflow-row" }, [
      el("div", { class: "workflow-row__top" }, [
        labelInput,
        el("div", { class: "campaign-row" }, [
          el("button", { class: "btn btn-sm btn-ghost", ...(idx === 0 ? { disabled: "disabled" } : {}), onclick: () => { moveArrayItem(fields, idx, -1); renderFieldList(containerId, fields); } }, "↑"),
          el("button", { class: "btn btn-sm btn-ghost", ...(idx === fields.length - 1 ? { disabled: "disabled" } : {}), onclick: () => { moveArrayItem(fields, idx, 1); renderFieldList(containerId, fields); } }, "↓"),
          el("button", {
            class: "btn btn-sm btn-ghost", onclick: () => {
              if (!confirm(`Delete field "${f.label}"?`)) return;
              fields.splice(fields.indexOf(f), 1);
              renderFieldList(containerId, fields);
              showToast("Field deleted.", "info");
            },
          }, "Delete"),
        ]),
      ]),
      el("div", { class: "workflow-row__meta" }, [
        el("span", {}, [el("b", {}, "Type: "), typeSelect]),
        el("label", {}, [requiredBox, " Required"]),
      ]),
    ]);
    wrap.appendChild(row);
  });
}
function addField(fields, containerId, prefix) {
  const label = prompt("New field label:", "");
  if (!label || !label.trim()) return;
  fields.push({ id: prefix + "_" + Date.now().toString(36), label: label.trim(), type: "text", required: false });
  renderFieldList(containerId, fields);
  showToast("Field added.", "success");
}
function renderFormFieldsSettings() {
  renderFieldList("enquiry-fields-list", state.enquiryFields);
  renderFieldList("followup-fields-list", state.followupFields);
  byId("enquiry-field-add-btn").onclick = () => addField(state.enquiryFields, "enquiry-fields-list", "f");
  byId("followup-field-add-btn").onclick = () => addField(state.followupFields, "followup-fields-list", "g");
}

// -------------------------------------------------------------- handbook
// ------------------------------------------------- tool usage dashboards
// Handbook and Document Generator are built as separate apps. Here the
// platform shows how they're being used across the member base, plus an
// entry point that will redirect to the real app once it's connected.
const USAGE_PERIODS = [["30d", "Last 30 days"], ["90d", "Last 90 days"], ["12m", "Last 12 months"]];
function dailyUsageSeries(seed, baseline) {
  const rnd = seededRandom(seed);
  const end = new Date(TODAY);
  const days = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i);
    const dow = d.getDay();
    const weekday = dow === 0 || dow === 6 ? 0.25 : 1;
    const growth = 0.7 + 0.3 * ((364 - i) / 364);
    days.push({ date: d.toISOString().slice(0, 10), v: Math.round(baseline * weekday * growth * (0.75 + rnd() * 0.5)) });
  }
  return days;
}
function bucketSeries(days, period) {
  if (period === "30d") return days.slice(-30).map((d) => ({ label: fmtDate(d.date).replace(/ 20\d\d$/, ""), v: d.v }));
  if (period === "90d") {
    const last = days.slice(-91), out = [];
    for (let i = 0; i < last.length; i += 7) { const wk = last.slice(i, i + 7); out.push({ label: "w/c " + fmtDate(wk[0].date).replace(/ 20\d\d$/, ""), v: wk.reduce((s, d) => s + d.v, 0) }); }
    return out;
  }
  const map = new Map();
  days.forEach((d) => { const k = d.date.slice(0, 7); map.set(k, (map.get(k) || 0) + d.v); });
  return [...map.entries()].slice(-12).map(([k, v]) => ({ label: new Date(k + "-01").toLocaleString("en-AU", { month: "short" }), v }));
}
function sumPeriod(days, period) {
  const n = period === "30d" ? 30 : period === "90d" ? 91 : 365;
  return days.slice(-n).reduce((s, d) => s + d.v, 0);
}
function orgUsageRows(seed, total, period) {
  const rnd = seededRandom(seed + period);
  const idle = (i) => (seed === "dg" ? i % 4 === 3 : i % 6 === 5);
  const weights = USAGE_MEMBER_ORGS.map((o, i) => ({ o, w: idle(i) ? 0 : o.seats * (0.3 + rnd() * 1.1) }));
  const tw = weights.reduce((s, x) => s + x.w, 0);
  return weights.map(({ o, w }) => {
    const value = Math.round((w / tw) * total);
    const lastDays = value ? Math.floor(rnd() * (period === "30d" ? 20 : 45)) : null;
    const last = lastDays == null ? null : new Date(new Date(TODAY).getTime() - lastDays * 86400000).toISOString().slice(0, 10);
    return { ...o, value, users: value ? Math.max(1, Math.min(o.seats, Math.round(o.seats * (0.35 + rnd() * 0.6)))) : 0, last };
  }).sort((a, b) => b.value - a.value);
}
function usagePeriodToggle(current, onChange) {
  return el("div", { class: "segmented" }, USAGE_PERIODS.map(([k, l]) => el("button", { class: "segmented__btn" + (current === k ? " active" : ""), onclick: () => onChange(k) }, l)));
}
function appLaunchBanner({ title, text, cta, url }) {
  return el("div", { class: "app-launch" }, [
    el("div", { class: "app-launch__icon", "aria-hidden": "true" }, "↗"),
    el("div", { class: "app-launch__text" }, [el("strong", {}, title), el("p", {}, text), el("code", {}, url)]),
    el("button", { class: "btn btn-primary", onclick: () => showToast(`Will redirect to ${url} once the app is connected — placeholder for now.`, "info") }, cta),
  ]);
}
function orgUsageTable(rows, cols) {
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Member organisation", "State", ...cols.map((c) => c.label), "Last activity"].map((h) => el("th", {}, h))))]);
  const tb = el("tbody");
  const max = Math.max(1, ...rows.map((r) => r.value));
  rows.forEach((r) => tb.append(el("tr", {}, [
    el("td", {}, [el("div", { class: "cell-primary" }, r.name), el("div", { class: "cell-sub" }, r.category)]),
    el("td", { class: "cell-muted" }, r.state),
    ...cols.map((c) => el("td", {}, c.render(r, max))),
    el("td", { class: "cell-muted" }, r.last ? fmtDate(r.last) : el("span", { class: "badge badge-warning" }, "No activity")),
  ])));
  table.append(tb);
  return el("div", { class: "data-table" }, table);
}
const shareCell = (r, max, text) => el("div", { class: "share-bar" }, [el("div", { class: "share-bar__fill", style: `width:${(r.value / max) * 100}%` }), el("span", {}, text)]);

function renderHandbookPanel(targetId) {
  const panel = byId(targetId || "phandbook-panel");
  panel.innerHTML = "";
  panel.append(
    appLaunchBanner({ title: "Open the Handbook", text: "The handbook itself is being built as a separate app. This button will take staff straight into it (and editors into its admin) once it's connected.", cta: "Open Handbook ↗", url: HANDBOOK.viewUrl }),
    el("div", { class: "panel" }, [
      el("dl", { class: "drawer-kv", style: "grid-template-columns:160px 1fr;" }, [
        el("dt", {}, "Handbook"), el("dd", {}, HANDBOOK.name),
        el("dt", {}, "System"), el("dd", {}, HANDBOOK.system),
        el("dt", {}, "Sections"), el("dd", {}, String(HANDBOOK.sections)),
        el("dt", {}, "Last published"), el("dd", {}, fmtDate(HANDBOOK.lastPublished)),
      ]),
      el("div", { class: "campaign-row", style: "margin-top:12px;" }, [
        el("button", { class: "btn", onclick: () => showToast("Opens " + HANDBOOK.editUrl + " (separate system) — placeholder until connected.", "info") }, "Edit in Handbook admin ↗"),
        el("button", { class: "btn btn-ghost", onclick: () => { state.subtab.usage = "usage-handbook"; showView("usage"); } }, "See readership →"),
      ]),
    ])
  );
}
function handbookTotals(period) {
  const sessions = sumPeriod(dailyUsageSeries("hb-sessions", 42), period);
  return { sessions, readers: Math.round(sessions * 0.38), reads: Math.round(sessions * 2.4), orgs: orgUsageRows("hb", sessions, period) };
}
function renderHandbookUsage(targetId) {
  const panel = byId(targetId);
  const period = state.handbookPeriod || "90d";
  panel.innerHTML = "";
  const sessionsDaily = dailyUsageSeries("hb-sessions", 42);
  const sessions = sumPeriod(sessionsDaily, period);
  const readers = Math.round(sessions * 0.38);
  const reads = Math.round(sessions * 2.4);
  const orgs = orgUsageRows("hb", sessions, period);
  const activeOrgs = orgs.filter((o) => o.value).length;
  const buckets = bucketSeries(sessionsDaily, period);

  panel.append(
    el("div", { class: "toolbar toolbar--filters" }, [usagePeriodToggle(period, (k) => { state.handbookPeriod = k; renderHandbookUsage(targetId); }),
      el("span", { class: "cell-muted", style: "margin-left:auto;" }, `${HANDBOOK.sections} sections · last published ${fmtDate(HANDBOOK.lastPublished)}`)]),
  );
  const stats = el("div", { class: "stat-grid stat-grid--5" }, [
    statCard("Reading sessions", sessions.toLocaleString(), USAGE_PERIODS.find((p) => p[0] === period)[1], ""),
    statCard("Unique readers", readers.toLocaleString(), "Member staff who opened it", "accent-teal"),
    statCard("Section reads", reads.toLocaleString(), `${(reads / sessions).toFixed(1)} sections per session`, ""),
    statCard("Avg. reading time", "6m 40s", "Per session", "accent-orange"),
    statCard("Member orgs reading", `${activeOrgs} / ${orgs.length}`, `${Math.round((activeOrgs / orgs.length) * 100)}% of members`, ""),
  ]);
  panel.append(stats);

  const sectionRnd = seededRandom("hb-sections" + period);
  const sectionRows = HANDBOOK_SECTIONS.map((name, i) => ({ name, value: Math.round(reads * (i < 6 ? 0.1 + sectionRnd() * 0.06 : 0.02 + sectionRnd() * 0.04)) })).sort((a, b) => b.value - a.value);
  const sMax = sectionRows[0].value;
  const sectionTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Section", "Reads"].map((h) => el("th", {}, h))))]);
  const stb = el("tbody");
  sectionRows.slice(0, 8).forEach((r) => stb.append(el("tr", {}, [el("td", { class: "cell-primary" }, r.name), el("td", {}, shareCell(r, sMax, r.value.toLocaleString()))])));
  sectionTable.append(stb);

  panel.append(el("div", { class: "grid-2 grid-2--wide-left" }, [
    el("div", { class: "panel" }, [el("div", { class: "panel__head" }, [el("h2", {}, "Reading sessions"), el("span", { class: "cell-muted" }, period === "30d" ? "Per day" : period === "90d" ? "Per week" : "Per month")]),
      lineChart({ labels: buckets.map((b) => b.label), series: [{ name: "Sessions", color: CHART_COLORS.primary, values: buckets.map((b) => b.v) }], yFormat: (v) => Math.round(v).toLocaleString() })]),
    el("div", { class: "panel" }, [el("div", { class: "panel__head" }, [el("h2", {}, "Most-read sections")]), el("div", { class: "data-table" }, sectionTable)]),
  ]));
  panel.append(el("div", { class: "panel" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, "By member organisation"), el("span", { class: "cell-muted" }, "Orgs with no activity are worth a nudge")]),
    orgUsageTable(orgs, [
      { label: "Readers", render: (r) => `${r.users} / ${r.seats}` },
      { label: "Sessions", render: (r, max) => shareCell(r, max, r.value.toLocaleString()) },
    ]),
  ]));
}

function renderDocGenLaunch(targetId) {
  const panel = byId(targetId);
  panel.innerHTML = "";
  panel.append(appLaunchBanner({ title: "Open the Document Generator", text: "Members generate SWMS and safety documents in the Document Generator app, which is being built separately. This will redirect there once it's connected.", cta: "Open Document Generator ↗", url: "docs.amca.com.au" }));
}
function docgenTotals(period) {
  const genDaily = dailyUsageSeries("dg-generated", 11);
  const generated = sumPeriod(genDaily, period);
  const downloaded = sumPeriod(genDaily.map((d, i) => ({ ...d, v: Math.round(d.v * (0.74 + seededRandom("dl" + i)() * 0.18)) })), period);
  return { generated, downloaded, orgs: orgUsageRows("dg", generated, period) };
}
function renderUsageOverview() {
  const panel = byId("usage-overview");
  const period = state.usagePeriod || "90d";
  panel.innerHTML = "";
  const hb = handbookTotals(period), dg = docgenTotals(period), ch = chatTotals();
  const pLabel = USAGE_PERIODS.find((p) => p[0] === period)[1];
  const tool = (name, sub, tab, stats) => el("div", { class: "panel usage-tool" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, name), el("a", { class: "link-btn", href: "#", onclick: (e) => { e.preventDefault(); switchSubtab("usage", tab); } }, "Open " + name + " usage →")]),
    el("p", { class: "panel__intro" }, sub),
    el("div", { class: "kpi-grid kpi-grid--3" }, stats.map(([l, v, s2]) => el("div", { class: "kpi" }, [el("div", { class: "kpi__label" }, l), el("div", { class: "kpi__value" }, v), s2 ? el("div", { class: "kpi__sub" }, s2) : null]))),
  ]);
  const active = (orgs) => orgs.filter((o) => o.value).length;
  const both = hb.orgs.filter((o) => o.value && dg.orgs.find((d) => d.name === o.name && d.value)).length;
  const none = USAGE_MEMBER_ORGS.filter((o) => !hb.orgs.find((h) => h.name === o.name && h.value) && !dg.orgs.find((d) => d.name === o.name && d.value));
  panel.append(
    el("div", { class: "toolbar toolbar--filters" }, [usagePeriodToggle(period, (k) => { state.usagePeriod = k; renderUsageOverview(); }), el("span", { class: "cell-muted", style: "margin-left:auto;" }, "Chat figures are all-time — chat history doesn't yet carry dates")]),
    el("div", { class: "stat-grid stat-grid--4" }, [
      statCard("Member orgs active", `${USAGE_MEMBER_ORGS.length - none.length} / ${USAGE_MEMBER_ORGS.length}`, `Used at least one tool · ${pLabel.toLowerCase()}`, ""),
      statCard("Using Handbook + Doc Generator", both, "Member orgs using both", "accent-teal"),
      statCard("Handbook sessions", hb.sessions.toLocaleString(), pLabel, ""),
      statCard("Documents generated", dg.generated.toLocaleString(), pLabel, "accent-orange"),
    ]),
    el("div", { class: "usage-tools" }, [
      tool("Chat", "AI assistant used by AMCA staff.", "usage-chat", [["Chats", ch.chats.toLocaleString(), "All time"], ["Messages", ch.messages.toLocaleString(), "All time"], ["Staff using it", `${ch.users} / ${USERS.length}`, null]]),
      tool("Handbook", "Member handbook readership.", "usage-handbook", [["Sessions", hb.sessions.toLocaleString(), pLabel], ["Unique readers", hb.readers.toLocaleString(), null], ["Member orgs", `${active(hb.orgs)} / ${hb.orgs.length}`, null]]),
      tool("Document Generator", "SWMS and safety documents members create.", "usage-docgen", [["Generated", dg.generated.toLocaleString(), pLabel], ["Downloaded", dg.downloaded.toLocaleString(), `${Math.round((dg.downloaded / dg.generated) * 100)}% of generated`], ["Member orgs", `${active(dg.orgs)} / ${dg.orgs.length}`, null]]),
    ]),
    none.length ? el("div", { class: "panel" }, [
      el("div", { class: "panel__head" }, [el("h2", {}, "Member organisations not using any tool"), el("span", { class: "cell-muted" }, pLabel)]),
      el("p", { class: "panel__intro" }, "Worth a check-in from the membership team."),
      el("div", { class: "chip-list" }, none.map((o) => el("span", { class: "badge badge-warning" }, `${o.name} · ${o.state}`))),
    ]) : null,
  );
}
function renderDocGenUsage(targetId) {
  const panel = byId(targetId);
  const period = state.docgenPeriod || "90d";
  panel.innerHTML = "";
  const genDaily = dailyUsageSeries("dg-generated", 11);
  const generated = sumPeriod(genDaily, period);
  const dlDaily = genDaily.map((d, i) => ({ ...d, v: Math.round(d.v * (0.74 + seededRandom("dl" + i)() * 0.18)) }));
  const downloaded = sumPeriod(dlDaily, period);
  const orgs = orgUsageRows("dg", generated, period);
  const activeOrgs = orgs.filter((o) => o.value).length;
  const g = bucketSeries(genDaily, period), d = bucketSeries(dlDaily, period);

  panel.append(
    el("div", { class: "toolbar toolbar--filters" }, [usagePeriodToggle(period, (k) => { state.docgenPeriod = k; renderDocGenUsage(targetId); })]),
    el("div", { class: "stat-grid stat-grid--5" }, [
      statCard("Documents generated", generated.toLocaleString(), USAGE_PERIODS.find((p) => p[0] === period)[1], ""),
      statCard("Downloaded", downloaded.toLocaleString(), `${Math.round((downloaded / generated) * 100)}% of generated`, "accent-teal"),
      statCard("Member orgs using", `${activeOrgs} / ${orgs.length}`, `${Math.round((activeOrgs / orgs.length) * 100)}% of members`, ""),
      statCard("Avg. per active org", (generated / Math.max(1, activeOrgs)).toFixed(1), "Documents generated", "accent-orange"),
      statCard("Templates in library", state.docTemplates.length, `${state.docTemplates.filter((t) => t.active).length} active`, ""),
    ]),
  );
  const tRnd = seededRandom("dg-templates" + period);
  const tRows = state.docTemplates.map((t) => { const v = Math.round(generated * (0.05 + tRnd() * 0.2)); return { name: t.title, code: t.code, value: v, dl: Math.round(v * (0.75 + tRnd() * 0.2)) }; }).sort((a, b) => b.value - a.value);
  const tMax = Math.max(1, ...tRows.map((r) => r.value));
  const tTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Template", "Generated"].map((h) => el("th", {}, h))))]);
  const ttb = el("tbody");
  tRows.slice(0, 8).forEach((r) => ttb.append(el("tr", {}, [el("td", {}, [el("div", { class: "cell-primary" }, r.name), el("div", { class: "cell-sub" }, `${r.code} · ${r.dl.toLocaleString()} downloaded`)]), el("td", {}, shareCell(r, tMax, r.value.toLocaleString()))])));
  tTable.append(ttb);
  panel.append(el("div", { class: "grid-2 grid-2--wide-left" }, [
    el("div", { class: "panel" }, [el("div", { class: "panel__head" }, [el("h2", {}, "Generated vs downloaded"), el("span", { class: "cell-muted" }, period === "30d" ? "Per day" : period === "90d" ? "Per week" : "Per month")]),
      lineChart({ labels: g.map((b) => b.label), series: [
        { name: "Generated", color: CHART_COLORS.primary, values: g.map((b) => b.v) },
        { name: "Downloaded", color: CHART_COLORS.secondary, values: d.map((b) => b.v) },
      ], yFormat: (v) => Math.round(v).toLocaleString() })]),
    el("div", { class: "panel" }, [el("div", { class: "panel__head" }, [el("h2", {}, "Most-used templates")]), el("div", { class: "data-table" }, tTable)]),
  ]));
  panel.append(el("div", { class: "panel" }, [
    el("div", { class: "panel__head" }, [el("h2", {}, "By member organisation"), el("span", { class: "cell-muted" }, "Orgs with no activity are worth a nudge")]),
    orgUsageTable(orgs, [
      { label: "Users", render: (r) => `${r.users} / ${r.seats}` },
      { label: "Generated", render: (r, max) => shareCell(r, max, r.value.toLocaleString()) },
      { label: "Downloaded", render: (r) => Math.round(r.value * 0.82).toLocaleString() },
    ]),
  ]));
}


// ---------------------------------------------------------- website images
function ratioLabel(w, h) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h);
  return `${w / d}:${h / d}`;
}
function renderImagePlacements() {
  const panel = byId("cms-images");
  panel.innerHTML = "";
  const filter = state.imagePageFilter || "";
  const pages = [...new Set(IMAGE_PLACEMENTS.map((p) => p.page))];
  const filled = IMAGE_PLACEMENTS.filter((p) => state.imageSlots[p.id]).length;
  const pageSel = el("select", { onchange: (e) => { state.imagePageFilter = e.target.value; renderImagePlacements(); } }, [["", "All pages"], ...pages.map((p) => [p, p])].map(([v, l]) => { const o = el("option", { value: v }, l); if (v === filter) o.selected = true; return o; }));
  panel.append(
    el("p", { class: "subtab-intro" }, "Every image slot on amca.com.au has one exact size. Upload any image — it's checked against the slot, resized or centre-cropped to fit, and compressed for the web."),
    el("div", { class: "toolbar toolbar--filters" }, [pageSel, el("span", { class: "cell-muted", style: "margin-left:auto;" }, `${filled} of ${IMAGE_PLACEMENTS.length} slots filled`)]),
  );
  const grid = el("div", { class: "img-grid" });
  IMAGE_PLACEMENTS.filter((p) => !filter || p.page === filter).forEach((p) => grid.append(imagePlacementCard(p)));
  panel.append(grid);
}
function imagePlacementCard(p) {
  const slot = state.imageSlots[p.id];
  const card = el("div", { class: "img-card" });
  const frame = el("div", { class: "img-stage" }, el("div", { class: "img-frame", style: `aspect-ratio:${p.width}/${p.height};width:min(100%, calc(170px * ${p.width} / ${p.height}));` },
    slot ? el("img", { src: slot.dataUrl, alt: slot.alt || "" }) : el("div", { class: "img-frame__empty" }, [el("strong", {}, `${p.width} × ${p.height}`), el("span", {}, ratioLabel(p.width, p.height))])));
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none;" });
  const msg = el("div", { class: "img-msg" });
  const alt = el("input", { type: "text", placeholder: "Alt text — describe the image for screen readers", value: slot?.alt || "" });
  alt.addEventListener("change", () => { if (state.imageSlots[p.id]) { state.imageSlots[p.id].alt = alt.value.trim(); renderImagePlacements(); } });
  const status = !slot ? ["Empty", "badge-neutral"] : !slot.alt ? ["Needs alt text", "badge-warning"] : ["Live", "badge-success"];
  card.append(
    frame,
    el("div", { class: "img-card__body" }, [
      el("div", { class: "img-card__top" }, [el("h3", {}, p.name), el("span", { class: "badge " + status[1] }, status[0])]),
      el("div", { class: "img-card__specs" }, [el("span", { class: "badge badge-navy" }, p.page), `${p.width} × ${p.height}px · ${ratioLabel(p.width, p.height)} · ${p.formats.join(", ")} · ≤ ${p.maxKb} KB`]),
      p.note ? el("p", { class: "img-card__note" }, p.note) : null,
      slot ? el("div", { class: "cell-sub" }, `Uploaded ${fmtDate(slot.uploadedAt)} · ${slot.sourceName} · ${slot.kb} KB${slot.cropped ? " · centre-cropped" : slot.resized ? " · resized" : ""}`) : null,
      slot ? alt : null,
      msg,
      el("div", { class: "campaign-row" }, [
        el("button", { class: "btn btn-sm " + (slot ? "" : "btn-primary"), onclick: () => fileInput.click() }, slot ? "Replace" : "Upload image"),
        slot ? el("button", { class: "btn btn-sm btn-ghost btn-danger-text", onclick: () => { if (!confirm(`Remove the image from "${p.name}"?`)) return; delete state.imageSlots[p.id]; renderImagePlacements(); showToast(`"${p.name}" cleared.`, "info"); } }, "Remove") : null,
        fileInput,
      ]),
    ]),
  );
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showMsg("That file isn't an image.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => handleImage(img, file);
      img.onerror = () => showMsg("Couldn't read that image.", "error");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });
  function showMsg(text, kind, actions) {
    msg.innerHTML = "";
    msg.className = "img-msg img-msg--" + kind;
    msg.append(el("div", {}, text));
    if (actions) msg.append(el("div", { class: "campaign-row", style: "margin-top:6px;" }, actions));
  }
  function handleImage(img, file) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const target = p.width / p.height, actual = w / h;
    if (w < p.width || h < p.height) {
      const sameRatio = Math.abs(actual - target) / target < 0.01;
      showMsg(`Too small: ${w} × ${h}px. This slot needs at least ${p.width} × ${p.height}px${sameRatio ? "" : ` (${ratioLabel(p.width, p.height)})`} — upscaling would look blurry. Please use a larger original.`, "error");
      return;
    }
    if (Math.abs(actual - target) / target < 0.01) { commit(img, file, { resized: w !== p.width }); return; }
    showMsg(`This image is ${w} × ${h}px (${ratioLabel(w, h)}); the slot is ${p.width} × ${p.height}px (${ratioLabel(p.width, p.height)}). It can be centre-cropped to fit.`, "warn", [
      el("button", { class: "btn btn-sm btn-primary", onclick: () => commit(img, file, { cropped: true }) }, "Crop to fit"),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => { msg.innerHTML = ""; msg.className = "img-msg"; } }, "Cancel"),
    ]);
  }
  function commit(img, file, flags) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const target = p.width / p.height;
    let sw = w, sh = h, sx = 0, sy = 0;
    if (w / h > target) { sw = Math.round(h * target); sx = Math.round((w - sw) / 2); } else { sh = Math.round(w / target); sy = Math.round((h - sh) / 2); }
    const canvas = document.createElement("canvas");
    canvas.width = p.width; canvas.height = p.height;
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, p.width, p.height);
    const mime = p.formats.includes("JPG") ? "image/jpeg" : "image/png";
    let q = 0.86, dataUrl = canvas.toDataURL(mime, q);
    const kbOf = (u) => Math.round((u.length * 3) / 4 / 1024);
    while (mime === "image/jpeg" && kbOf(dataUrl) > p.maxKb && q > 0.4) { q -= 0.08; dataUrl = canvas.toDataURL(mime, q); }
    const kb = kbOf(dataUrl);
    if (kb > p.maxKb) { showMsg(`Even compressed, this image is ${kb} KB — over the ${p.maxKb} KB limit. Try a simpler image.`, "error"); return; }
    state.imageSlots[p.id] = { dataUrl, alt: state.imageSlots[p.id]?.alt || "", uploadedAt: TODAY, sourceName: file.name, kb, ...flags };
    renderImagePlacements();
    showToast(`"${p.name}" updated — ${p.width} × ${p.height}px, ${kb} KB. Add alt text to publish.`, "success");
  }
  return card;
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
  renderUsers();
}
const STAFF_ROLES = ["Chief Executive Officer", "Memberships & Partnerships", "Membership Services", "Finance Officer", "Corporate Services Manager", "Marketing & Communications", "National Training Manager", "Training Administrator", "Technical Services", "BIM-MEPAUS Consultant"];
const ACCESS_LEVELS = ["Admin", "Editor", "Viewer"];
function renderUsers() {
  const wrap = byId("users-table");
  const search = byId("users-search");
  byId("user-invite-btn").onclick = openInviteForm;
  search.oninput = renderUsers;
  const q = search.value.trim().toLowerCase();
  const rows = state.users.filter((u) => !q || [u.name, u.email, u.role].some((v) => v.toLowerCase().includes(q)));
  byId("users-count").textContent = `${state.users.filter((u) => u.status === "Active").length} active · ${state.users.filter((u) => u.status === "Invited").length} invited · ${state.users.filter((u) => u.status === "Deactivated").length} deactivated`;
  wrap.innerHTML = "";
  const table = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Role", "Access", "Status", "Last active", "Actions"].map((h) => el("th", {}, h))))]);
  const tbody = el("tbody");
  rows.forEach((u) => {
    const accessSel = el("select", { class: "inline-select", onchange: (e) => { u.access = e.target.value; showToast(`${u.name} is now ${u.access}.`, "success"); } }, ACCESS_LEVELS.map((a) => { const o = el("option", { value: a }, a); if ((u.access || "Editor") === a) o.selected = true; return o; }));
    const isSelf = u.name === state.currentUser?.name;
    if (isSelf) accessSel.disabled = true;
    const actions = el("div", { class: "row-actions" });
    if (u.status === "Invited") {
      actions.append(el("button", { class: "btn btn-sm", onclick: () => { u.invitedAt = TODAY; showToast(`Invite re-sent to ${u.email}.`, "success"); renderUsers(); } }, "Resend invite"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { if (!confirm(`Revoke the invite for ${u.email}?`)) return; state.users = state.users.filter((x) => x.id !== u.id); showToast(`Invite for ${u.email} revoked.`, "info"); renderUsers(); } }, "Revoke"));
    } else if (!isSelf) {
      actions.append(el("button", { class: "btn btn-sm", onclick: () => { u.status = u.status === "Active" ? "Deactivated" : "Active"; showToast(`${u.name} ${u.status === "Active" ? "reactivated" : "deactivated — sign-in blocked, history kept"}.`, "info"); renderUsers(); } }, u.status === "Active" ? "Deactivate" : "Reactivate"),
        el("button", { class: "btn btn-sm btn-ghost btn-danger-text", onclick: () => { if (!confirm(`Remove ${u.name}? Their seat is freed; records they created stay.`)) return; state.users = state.users.filter((x) => x.id !== u.id); showToast(`${u.name} removed.`, "info"); renderUsers(); } }, "Remove"));
    } else actions.append(el("span", { class: "cell-muted" }, "You"));
    const statusCls = { Active: "badge-success", Invited: "badge-orange", Deactivated: "badge-neutral" }[u.status] || "badge-warning";
    tbody.appendChild(el("tr", {}, [
      el("td", {}, [el("div", { class: "cell-primary" }, u.name), el("div", { class: "cell-sub" }, u.email)]),
      el("td", { class: "cell-muted" }, u.role),
      el("td", {}, accessSel),
      el("td", {}, el("span", { class: "badge " + statusCls }, u.status)),
      el("td", { class: "cell-muted" }, u.status === "Invited" ? `Invited ${fmtDate(u.invitedAt)}` : u.lastActive === "—" ? "—" : fmtDate(u.lastActive)),
      el("td", {}, actions),
    ]));
  });
  if (!rows.length) tbody.appendChild(el("tr", {}, el("td", { colspan: "6", class: "cell-muted" }, "No users match.")));
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function openInviteForm() {
  const panel = byId("user-invite-panel");
  if (panel.style.display === "block") { panel.style.display = "none"; return; }
  const name = el("input", { type: "text", placeholder: "Full name" });
  const email = el("input", { type: "email", placeholder: "name@amca.com.au" });
  const role = el("select", {}, STAFF_ROLES.map((r) => el("option", { value: r }, r)));
  const access = el("select", {}, ACCESS_LEVELS.map((a) => { const o = el("option", { value: a }, a); if (a === "Editor") o.selected = true; return o; }));
  panel.innerHTML = "";
  panel.append(
    el("h3", {}, "Invite a staff user"),
    el("p", { class: "cell-muted", style: "margin-bottom:10px;font-size:13px;" }, "They'll get an email to set a password. Seats are for AMCA staff — member portal logins are managed per organisation."),
    el("div", { class: "form-grid-2" }, [
      el("div", { class: "form-row" }, [el("label", {}, "Name"), name]),
      el("div", { class: "form-row" }, [el("label", {}, "Email"), email]),
      el("div", { class: "form-row" }, [el("label", {}, "Role"), role]),
      el("div", { class: "form-row" }, [el("label", {}, "Access level"), access]),
    ]),
    el("div", { class: "campaign-row" }, [
      el("button", { class: "btn btn-primary", onclick: () => {
        if (!name.value.trim() || !/.+@.+\..+/.test(email.value)) { showToast("Name and a valid email are required.", "info"); return; }
        if (state.users.some((u) => u.email.toLowerCase() === email.value.trim().toLowerCase())) { showToast("That email already has a seat.", "info"); return; }
        state.users.push({ id: genId("u"), name: name.value.trim(), email: email.value.trim(), role: role.value, access: access.value, status: "Invited", invitedAt: TODAY, lastActive: "—" });
        panel.style.display = "none";
        showToast(`Invite sent to ${email.value.trim()}.`, "success");
        renderUsers();
      } }, "Send invite"),
      el("button", { class: "btn btn-ghost", onclick: () => { panel.style.display = "none"; } }, "Cancel"),
    ]),
  );
  panel.style.display = "block";
  name.focus();
}
function renderChatUsage() {
  renderToolUsagePanel("usage-ai-assist", TOOL_USAGE.aiAssist);
  renderFeedbackAnalysis();
}
function chatTotals() {
  return {
    chats: USERS.reduce((s, u) => s + (u.chats || 0), 0),
    messages: USERS.reduce((s, u) => s + (u.messages || 0), 0),
    users: USERS.filter((u) => (u.chats || 0) > 0).length,
  };
}
function orgUsageBreakdown(totalProjects) {
  const weighted = ORGANIZATIONS.filter((o) => o.users > 0);
  const totalWeight = weighted.reduce((s, o) => s + o.users, 0);
  return weighted
    .map((o) => ({ name: o.name, count: Math.max(1, Math.round((o.users / totalWeight) * totalProjects)) }))
    .sort((a, b) => b.count - a.count);
}
function renderToolUsagePanel(containerId, usage) {
  const host = byId(containerId);
  if (!host) return;
  host.innerHTML = "";
  host.append(
    el("div", { class: "stat-grid", style: "grid-template-columns:repeat(3,1fr);margin-bottom:14px;" }, [
      statCard("Organizations", usage.totalOrgs, "Registered", ""),
      statCard("Total users", usage.totalUsers, "Across all organizations", ""),
      statCard("Total projects", usage.totalProjects, "Across all organizations", ""),
    ]),
    el("div", { class: "cell-muted", style: "margin-bottom:8px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;" }, "Projects by organization"),
    el("div", { class: "funnel" }, orgUsageBreakdown(usage.totalProjects).map((row) => {
      const max = Math.max(...orgUsageBreakdown(usage.totalProjects).map((r) => r.count), 1);
      return el("div", { class: "funnel-row" }, [
        el("div", { class: "funnel-row__label" }, row.name),
        el("div", { class: "funnel-row__bar-track" }, el("div", { class: "funnel-row__bar", style: `width:${(row.count / max) * 100}%` })),
        el("div", { class: "funnel-row__count" }, String(row.count)),
      ]);
    }))
  );
}

// ---------------------------------------------------------- feedback analysis
function renderFeedbackAnalysis() {
  const toolbar = byId("feedback-range-toolbar");
  toolbar.innerHTML = "";
  ["7 days", "30 days", "90 days", "All time"].forEach((range) => {
    toolbar.append(el("button", { class: "chip-btn " + (state.feedbackRange === range ? "active" : ""), onclick: () => { state.feedbackRange = range; renderFeedbackAnalysis(); } }, range));
  });

  const stats = byId("feedback-stats");
  stats.innerHTML = "";
  const satisfaction = FEEDBACK_STATS.totalFeedback ? Math.round((FEEDBACK_STATS.totalPositive / FEEDBACK_STATS.totalFeedback) * 100) : 0;
  stats.append(
    statCard("Total Questions", FEEDBACK_STATS.totalQuestions, "", ""),
    statCard("Total Feedback", FEEDBACK_STATS.totalFeedback, "", ""),
    statCard("Total Positive", FEEDBACK_STATS.totalPositive, "", "accent-teal"),
    statCard("Total Negative", FEEDBACK_STATS.totalNegative, "", ""),
    statCard("Satisfaction", satisfaction + "%", "", ""),
    statCard("With Comments", FEEDBACK_STATS.withComments, "", "")
  );

  const recent = byId("feedback-recent");
  recent.innerHTML = "";
  recent.append(el("p", { class: "cell-muted" }, `No feedback in this period (${state.feedbackRange}).`));

  const topics = byId("feedback-topics");
  topics.innerHTML = "";
  FEEDBACK_STATS.topTopics.forEach((t) => {
    topics.append(el("div", { class: "mini-item" }, [
      el("div", { class: "mini-item__title" }, t.topic),
      el("span", { class: "badge badge-navy" }, String(t.count)),
    ]));
  });

  const sources = byId("feedback-sources");
  sources.innerHTML = "";
  FEEDBACK_STATS.topSources.forEach((s) => {
    sources.append(el("div", { class: "mini-item" }, [
      el("div", { class: "mini-item__title" }, s.source),
      el("span", { class: "badge badge-teal" }, String(s.count)),
    ]));
  });
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
    tbody.appendChild(el("tr", { class: "clickable", onclick: () => openOrgDetail(o.id) }, [
      el("td", { class: "cell-primary" }, o.name),
      el("td", {}, el("span", { class: "badge " + (o.status === "Active" ? "badge-success" : "badge-warning") }, o.status)),
      el("td", {}, String(o.users)),
      el("td", { class: "cell-muted" }, fmtDate(o.createdDate)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function companiesForOrgRegion(region) {
  if (!region) return state.companies;
  return state.companies.filter((c) => (c.address || "").includes(region));
}
function openOrgDetail(orgId) {
  const o = ORGANIZATIONS.find((x) => x.id === orgId);
  if (!o) return;
  byId("org-detail-drawer").dataset.orgId = orgId;
  byId("org-detail-title").textContent = o.name;
  renderOrgDetailBody(o);
  byId("org-detail-drawer").classList.add("open");
  byId("org-detail-drawer-overlay").classList.add("open");
}
function closeOrgDetail() {
  byId("org-detail-drawer").classList.remove("open");
  byId("org-detail-drawer-overlay").classList.remove("open");
}
function renderOrgDetailBody(o) {
  const body = byId("org-detail-body");
  body.innerHTML = "";
  const access = ORG_USER_ACCESS[o.id] || [];
  body.appendChild(el("div", {}, [
    el("div", { class: "drawer-kv" }, [
      el("dt", {}, "Status"), el("dd", {}, el("span", { class: "badge " + (o.status === "Active" ? "badge-success" : "badge-warning") }, o.status)),
      el("dt", {}, "Region"), el("dd", {}, o.region || "National"),
      el("dt", {}, "Created"), el("dd", {}, fmtDate(o.createdDate)),
      el("dt", {}, "Users with access"), el("dd", {}, String(o.users)),
    ]),
    el("div", { class: "panel", style: "margin-top:14px;" }, [
      el("div", { class: "panel__head" }, [el("h2", {}, "User access")]),
      el("p", { class: "cell-muted", style: "margin-bottom:10px;" }, "Who has access to this organization, and for what period."),
      access.length
        ? el("table", {}, [
            el("thead", {}, el("tr", {}, ["User", "Access from", "Access to"].map((h) => el("th", {}, h)))),
            el("tbody", {}, access.map((a) => el("tr", {}, [
              el("td", { class: "cell-primary" }, a.user),
              el("td", {}, fmtDate(a.accessFrom)),
              el("td", {}, a.accessTo ? fmtDate(a.accessTo) : el("span", { class: "badge badge-success" }, "Ongoing")),
            ]))),
          ])
        : el("p", { class: "cell-muted" }, "No users currently have access to this organization."),
    ]),
    state.appMode === "crm"
      ? el("div", { class: "panel", style: "margin-top:14px;" }, [
          el("div", { class: "panel__head" }, [el("h2", {}, "Linked member companies")]),
          el("p", { class: "cell-muted", style: "margin-bottom:10px;" }, o.region ? `Member companies based in ${o.region}.` : "All member companies (national)."),
          (() => {
            const companies = companiesForOrgRegion(o.region);
            return companies.length
              ? el("table", {}, [
                  el("thead", {}, el("tr", {}, ["Company", "Category", "Status"].map((h) => el("th", {}, h)))),
                  el("tbody", {}, companies.map((c) => el("tr", { class: "clickable", onclick: () => { closeOrgDetail(); openDrawer(c.id); } }, [
                    el("td", { class: "cell-primary" }, c.name),
                    el("td", {}, c.category),
                    el("td", {}, el("span", { class: "badge " + getCompanyStatusBadgeClass(c) }, getCompanyStatusLabel(c))),
                  ]))),
                ])
              : el("p", { class: "cell-muted" }, "No member companies linked to this region.");
          })(),
        ])
      : null,
  ]));
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
  const vettrak = INTEGRATIONS.find((i) => i.id === "vettrak");
  const bothSynced = state.trainingsMoodleSynced && state.trainingsVetTrakSynced;
  byId("ptraining-sync-status").textContent = bothSynced ? "Synced with Moodle & VetTrak — up to date" : `Last synced: Moodle ${moodle.lastSync} · VetTrak ${vettrak.lastSync}`;
  byId("ptraining-sync-moodle-btn").onclick = () => {
    if (state.trainingsMoodleSynced) { showToast("Already up to date with Moodle.", "info"); return; }
    TRAININGS_PENDING_SYNC_MOODLE.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsMoodleSynced = true;
    logSync(`Moodle sync: ${TRAININGS_PENDING_SYNC_MOODLE.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC_MOODLE.length} new training record(s) synced from Moodle.`, "success");
    renderTrainingSimple();
  };
  byId("ptraining-sync-vettrak-btn").onclick = () => {
    if (state.trainingsVetTrakSynced) { showToast("Already up to date with VetTrak.", "info"); return; }
    TRAININGS_PENDING_SYNC_VETTRAK.forEach((t) => state.trainings.push({ ...t }));
    state.trainingsVetTrakSynced = true;
    logSync(`VetTrak sync: ${TRAININGS_PENDING_SYNC_VETTRAK.length} new training record(s) pulled in`);
    showToast(`${TRAININGS_PENDING_SYNC_VETTRAK.length} new training record(s) synced from VetTrak.`, "success");
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
    const order = getOnboardOrder();
    const gateIdx = order.indexOf(step.stageGate);
    if (gateIdx === -1) return "upcoming";
    const curIdx = order.indexOf(c.onboardingStage);
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
  document.querySelectorAll(".sidebar__nav .nav-btn, .sidebar__nav .nav-group-label").forEach((b) => {
    const m = b.dataset.mode;
    b.style.display = (m === "both" || m === mode) ? "" : "none";
  });
  showView(mode === "crm" ? "action" : "organizations");
}

// --------------------------------------------------------------------- init
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".mode-toggle__btn").forEach((btn) => btn.addEventListener("click", () => setAppMode(btn.dataset.appmode)));
  document.querySelectorAll(".sidebar__nav .nav-btn").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.subtab) state.subtab[btn.dataset.view] = btn.dataset.subtab;
    showView(btn.dataset.view);
  }));
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
  byId("campaign-drawer-close").addEventListener("click", closeCampaignDrawer);
  byId("campaign-drawer-overlay").addEventListener("click", closeCampaignDrawer);
  byId("campaign-report-close").addEventListener("click", closeCampaignReport);
  byId("campaign-report-overlay").addEventListener("click", closeCampaignReport);
  byId("doc-detail-close").addEventListener("click", closeDocDetail);
  byId("doc-detail-drawer-overlay").addEventListener("click", closeDocDetail);
  byId("org-detail-close").addEventListener("click", closeOrgDetail);
  byId("org-detail-drawer-overlay").addEventListener("click", closeOrgDetail);
  setAppMode("crm");
});
