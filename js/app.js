/* ==========================================================================
   AMCA CRM — Prototype application logic
   Pure client-side, in-memory state. No backend — every "integration" action
   (raising a Xero invoice, sending a Mailchimp campaign) is simulated so the
   flow can be demonstrated end-to-end.
   ========================================================================== */

const STAGE_ORDER = PIPELINE_STAGES.map((s) => s.id);
const STAGE_LABEL = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s.label]));
const NEXT_STAGE = { enquiry: "qualifying", qualifying: "application", application: "active" };

const state = {
  companies: JSON.parse(JSON.stringify(COMPANIES)),
  view: "dashboard",
  persona: "member_active",
  syncLog: [
    { date: "2026-09-01 08:14", type: "sync", label: "Xero → CRM: 3 invoice status updates pulled" },
    { date: "2026-09-01 07:50", type: "sync", label: "Mailchimp → CRM: list counts reconciled (2,184 contacts)" },
    { date: "2026-08-31 22:00", type: "sync", label: "CRM → Website: nightly access-rule refresh completed" },
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
  const today = new Date("2026-09-01T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
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
function stageBadgeClass(stage) {
  if (stage === "active") return "badge-teal";
  if (stage === "renewal_due") return "badge-warning";
  if (stage === "lapsed") return "badge-danger";
  return "badge-navy";
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
function showToast(message, type = "info") {
  const t = el("div", { class: "toast " + type }, message);
  byId("toast-container").appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function addTimeline(company, type, label) {
  company.timeline.unshift({ date: "2026-09-01", type, label });
}
function allActivity(limit) {
  const rows = [];
  state.companies.forEach((c) => c.timeline.forEach((t) => rows.push({ ...t, company: c.name })));
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows.slice(0, limit);
}

// ------------------------------------------------------------------- routing
function showView(viewId) {
  state.view = viewId;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === viewId));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  renderView(viewId);
}
function renderView(viewId) {
  switch (viewId) {
    case "dashboard": return renderDashboard();
    case "pipeline": return renderPipeline();
    case "companies": return renderCompanies();
    case "renewals": return renderRenewals();
    case "comms": return renderComms();
    case "nonmembers": return renderNonMembers();
    case "access": return renderAccess();
    case "integrations": return renderIntegrations();
  }
}

// ----------------------------------------------------------------- dashboard
function renderDashboard() {
  const active = state.companies.filter((c) => c.stage === "active").length;
  const renewalDue = state.companies.filter((c) => c.stage === "renewal_due").length;
  const openEnquiries = state.companies.filter((c) => ["enquiry", "qualifying", "application"].includes(c.stage)).length;
  const lapsed = state.companies.filter((c) => c.stage === "lapsed").length;

  const stats = byId("dashboard-stats");
  stats.innerHTML = "";
  stats.append(
    statCard("Active members", active, `${state.companies.length} companies on file`, ""),
    statCard("Open enquiries", openEnquiries, "In enquiry → application", "accent-orange"),
    statCard("Renewals due", renewalDue, "Within the next 60 days", "accent-teal"),
    statCard("Lapsed", lapsed, "Candidates for re-engagement", "")
  );

  const funnel = byId("dashboard-funnel");
  funnel.innerHTML = "";
  const max = Math.max(...PIPELINE_STAGES.map((s) => state.companies.filter((c) => c.stage === s.id).length), 1);
  PIPELINE_STAGES.forEach((s) => {
    const count = state.companies.filter((c) => c.stage === s.id).length;
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
    .filter((c) => c.renewalDate)
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
  EVENTS.slice(0, 5).forEach((e) => {
    eventsList.append(
      el("div", { class: "mini-item" }, [
        el("div", { class: "mini-item__main" }, [
          el("div", { class: "mini-item__title" }, e.name),
          el("div", { class: "mini-item__meta" }, `${e.type} · ${fmtDate(e.date)}`),
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

// ------------------------------------------------------------------ pipeline
function renderPipeline() {
  const board = byId("pipeline-board");
  board.innerHTML = "";
  PIPELINE_STAGES.forEach((stage) => {
    const companies = state.companies.filter((c) => c.stage === stage.id);
    const col = el("div", { class: "pipeline-col", "data-group": stage.group }, [
      el("div", { class: "pipeline-col__head" }, [
        el("div", { class: "pipeline-col__title" }, stage.label),
        el("div", { class: "pipeline-col__count" }, String(companies.length)),
      ]),
    ]);
    companies.forEach((c) => col.appendChild(pipelineCard(c, stage)));
    board.appendChild(col);
  });
}
function pipelineCard(c, stage) {
  const card = el("div", { class: "pipeline-card" }, [
    el("div", { class: "pipeline-card__name" }, c.name),
    el("div", { class: "pipeline-card__meta" }, `${c.category} · Owner: ${c.owner}`),
  ]);
  card.addEventListener("click", (e) => { if (e.target.tagName !== "BUTTON") openDrawer(c.id); });

  const actions = el("div", { class: "pipeline-card__actions" });
  if (NEXT_STAGE[stage.id]) {
    actions.append(
      el("button", { class: "btn btn-sm btn-primary", onclick: (e) => { e.stopPropagation(); advanceStage(c.id, NEXT_STAGE[stage.id]); } },
        `→ ${STAGE_LABEL[NEXT_STAGE[stage.id]]}`)
    );
  }
  if (stage.id === "renewal_due") {
    actions.append(
      el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); advanceStage(c.id, "active", true); } }, "Mark renewed"),
      el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); advanceStage(c.id, "lapsed"); } }, "Mark lapsed")
    );
  }
  if (stage.id === "lapsed") {
    actions.append(el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); advanceStage(c.id, "enquiry"); } }, "Re-engage"));
  }
  card.appendChild(actions);
  return card;
}
function advanceStage(companyId, newStage, isRenewal = false) {
  const c = state.companies.find((x) => x.id === companyId);
  if (!c) return;
  c.stage = newStage;
  if (newStage === "active" && !c.joinDate) {
    c.joinDate = "2026-09-01";
    c.renewalDate = "2027-09-01";
    addTimeline(c, "milestone", "Became a member");
    showToast(`${c.name} is now an active member. Welcome sequence triggered.`, "success");
  } else if (isRenewal) {
    c.renewalDate = "2027-09-01";
    c.xero.invoiceStatus = "paid";
    c.xero.paymentStatus = "Paid in full";
    addTimeline(c, "status", "Renewal confirmed — renewal date rolled to 2027-09-01");
    showToast(`${c.name} renewed. Confirmation email sent, Mailchimp segment updated.`, "success");
  } else if (newStage === "lapsed") {
    addTimeline(c, "status", "Marked Lapsed — non-payment");
    showToast(`${c.name} marked as lapsed. Moved to non-member nurture list.`, "info");
  } else if (newStage === "enquiry") {
    addTimeline(c, "lead", "Re-engaged — moved back into the pipeline");
    showToast(`${c.name} re-engaged and returned to the pipeline.`, "info");
  } else {
    addTimeline(c, "status", `Moved to ${STAGE_LABEL[newStage]}`);
    showToast(`${c.name} moved to "${STAGE_LABEL[newStage]}".`, "info");
  }
  renderView(state.view);
  if (byId("drawer").classList.contains("open")) openDrawer(companyId);
}

// ---------------------------------------------------------------- companies
function renderCompanies() {
  const catSel = byId("company-filter-category");
  if (catSel.options.length <= 1) MEMBER_CATEGORIES.forEach((cat) => catSel.append(el("option", { value: cat }, cat)));
  const stageSel = byId("company-filter-stage");
  if (stageSel.options.length <= 1) PIPELINE_STAGES.forEach((s) => stageSel.append(el("option", { value: s.id }, s.label)));

  const draw = () => {
    const q = byId("company-search").value.trim().toLowerCase();
    const cat = catSel.value;
    const stg = stageSel.value;
    const rows = state.companies.filter((c) => {
      const matchesQ = !q || c.name.toLowerCase().includes(q) || c.people.some((p) => p.name.toLowerCase().includes(q));
      return matchesQ && (!cat || c.category === cat) && (!stg || c.stage === stg);
    });
    const wrap = byId("companies-table");
    wrap.innerHTML = "";
    const table = el("table", {}, [
      el("thead", {}, el("tr", {}, ["Company", "Category", "Stage", "Owner", "People", "Renewal date"].map((h) => el("th", {}, h)))),
    ]);
    const tbody = el("tbody");
    rows.forEach((c) => {
      const tr = el("tr", { class: "clickable", onclick: () => openDrawer(c.id) }, [
        el("td", { class: "cell-primary" }, c.name),
        el("td", {}, c.category),
        el("td", {}, el("span", { class: "badge " + stageBadgeClass(c.stage) }, STAGE_LABEL[c.stage])),
        el("td", {}, c.owner),
        el("td", {}, `${c.people.length} contact${c.people.length === 1 ? "" : "s"}`),
        el("td", {}, fmtDate(c.renewalDate)),
      ]);
      tbody.appendChild(tr);
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

// ----------------------------------------------------------------- renewals
function renderRenewals() {
  const wrap = byId("renewals-table");
  wrap.innerHTML = "";
  const rows = state.companies.filter((c) => c.xero).sort((a, b) => (a.renewalDate > b.renewalDate ? 1 : -1));
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Company", "Category", "Join date", "Renewal date", "Status", "Xero invoice", "Payment status", ""].map((h) => el("th", {}, h)))),
  ]);
  const tbody = el("tbody");
  rows.forEach((c) => {
    const [invLabel, invClass] = invoiceBadge(c.xero.invoiceStatus);
    const tr = el("tr", {}, [
      el("td", { class: "cell-primary clickable", onclick: () => openDrawer(c.id) }, c.name),
      el("td", {}, c.category),
      el("td", {}, fmtDate(c.joinDate)),
      el("td", {}, fmtDate(c.renewalDate)),
      el("td", {}, el("span", { class: "badge " + stageBadgeClass(c.stage) }, STAGE_LABEL[c.stage])),
      el("td", {}, el("span", { class: "badge " + invClass }, invLabel)),
      el("td", { class: "cell-muted" }, c.xero.paymentStatus),
      el("td", {}, renewalAction(c)),
    ]);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}
function renewalAction(c) {
  if (c.xero.invoiceStatus === "not_raised") {
    return el("button", { class: "btn btn-sm btn-primary", onclick: () => raiseInvoice(c.id) }, "Raise invoice in Xero");
  }
  if (c.xero.invoiceStatus === "sent" || c.xero.invoiceStatus === "overdue") {
    return el("button", { class: "btn btn-sm", onclick: () => markPaid(c.id) }, "Mark paid (webhook test)");
  }
  return el("span", { class: "cell-muted" }, c.xero.invoiceNo);
}
function raiseInvoice(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.xero.invoiceStatus = "sent";
  c.xero.paymentStatus = "Awaiting payment";
  c.xero.invoiceNo = "INV-" + (1300 + Math.floor(Number(companyId.replace(/\D/g, "")) * 7));
  addTimeline(c, "invoice", `Renewal invoice ${c.xero.invoiceNo} raised in Xero ($${c.xero.amount})`);
  showToast(`Invoice ${c.xero.invoiceNo} created in Xero for ${c.name} — awaiting payment.`, "success");
  renderRenewals();
}
function markPaid(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  c.xero.invoiceStatus = "paid";
  c.xero.paymentStatus = "Paid in full";
  addTimeline(c, "invoice", `Payment received in Xero for ${c.xero.invoiceNo}`);
  state.syncLog.unshift({ date: "2026-09-01 " + new Date().toTimeString().slice(0, 5), type: "sync", label: `Xero webhook: payment received for ${c.name} (${c.xero.invoiceNo})` });
  showToast(`Payment confirmed for ${c.name}. Renewal confirmation email queued.`, "success");
  renderRenewals();
}

// -------------------------------------------------------------------- comms
function renderComms() {
  const wrap = byId("comms-sequence");
  wrap.innerHTML = "";
  COMMS_SEQUENCE.forEach((step) => {
    wrap.append(
      el("div", { class: "comms-step" }, [
        el("div", { class: "comms-step__rail" }, [el("div", { class: "comms-step__dot" }), el("div", { class: "comms-step__line" })]),
        el("div", { class: "comms-step__card" }, [
          el("div", { class: "comms-step__top" }, [
            el("div", { class: "comms-step__stage" }, step.stage),
            el("span", { class: "badge badge-navy" }, "Automated"),
          ]),
          el("div", { class: "comms-step__subject" }, `“${step.subject}”`),
          el("div", { class: "comms-step__meta" }, [
            el("span", {}, [el("b", {}, "Trigger: "), step.trigger]),
            el("span", {}, [el("b", {}, "Audience: "), step.audience]),
          ]),
        ]),
      ])
    );
  });
}

// -------------------------------------------------------------- non-members
function renderNonMembers() {
  const eventsWrap = byId("events-list");
  eventsWrap.innerHTML = "";
  const eTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Event / training", "Date", "Type", "Reg."].map((h) => el("th", {}, h))))]);
  const eBody = el("tbody");
  EVENTS.forEach((e) => {
    eBody.appendChild(el("tr", {}, [
      el("td", { class: "cell-primary" }, e.name),
      el("td", {}, fmtDate(e.date)),
      el("td", {}, el("span", { class: "badge badge-navy" }, e.type)),
      el("td", {}, String(e.registrations)),
    ]));
  });
  eTable.appendChild(eBody);
  eventsWrap.appendChild(eTable);

  const nmWrap = byId("nonmembers-list");
  nmWrap.innerHTML = "";
  const nTable = el("table", {}, [el("thead", {}, el("tr", {}, ["Name", "Tag", "Last touch"].map((h) => el("th", {}, h))))]);
  const nBody = el("tbody");
  NON_MEMBERS.forEach((n) => {
    nBody.appendChild(el("tr", {}, [
      el("td", {}, [el("div", { class: "cell-primary" }, n.name), el("div", { class: "cell-muted" }, n.contact)]),
      el("td", {}, el("span", { class: "badge badge-neutral" }, n.tag)),
      el("td", { class: "cell-muted" }, n.lastTouch),
    ]));
  });
  nTable.appendChild(nBody);
  nmWrap.appendChild(nTable);

  renderCampaignBuilder();
}
function renderCampaignBuilder() {
  const wrap = byId("campaign-builder");
  wrap.innerHTML = "";
  const segments = {
    "Past Enquiries": NON_MEMBERS.filter((n) => n.tag === "Past Enquiry").length,
    "Training Alumni": NON_MEMBERS.filter((n) => n.tag === "Training Alumni").length,
    "Former Members": NON_MEMBERS.filter((n) => n.tag === "Former Member").length,
    "All non-members": NON_MEMBERS.length,
  };
  const segSelect = el("select", {}, Object.keys(segments).map((s) => el("option", { value: s }, s)));
  const typeSelect = el("select", {}, ["Event invitation", "New training announcement", "Achievement / award spotlight", "General update"].map((t) => el("option", { value: t }, t)));
  const subject = el("input", { type: "text", placeholder: "Subject line…", value: "New training dates just announced" });
  const summary = el("div", { class: "campaign-summary" });

  const updateSummary = () => {
    const count = segments[segSelect.value];
    summary.textContent = `Sending "${typeSelect.value}" to segment “${segSelect.value}” — ${count} recipient${count === 1 ? "" : "s"}, synced live from the CRM into Mailchimp.`;
  };
  segSelect.onchange = updateSummary;
  typeSelect.onchange = updateSummary;

  wrap.append(
    el("div", { class: "campaign-row" }, [
      el("label", {}, "Segment:"), segSelect,
      el("label", {}, "Message type:"), typeSelect,
    ]),
    el("div", { class: "campaign-row" }, [el("label", {}, "Subject:"), subject]),
    summary,
    el("div", { class: "campaign-row" }, [
      el("button", {
        class: "btn btn-primary",
        onclick: () => {
          const count = segments[segSelect.value];
          state.syncLog.unshift({ date: "2026-09-01 " + new Date().toTimeString().slice(0, 5), type: "campaign", label: `Mailchimp campaign sent: "${subject.value}" → ${segSelect.value} (${count} recipients)` });
          showToast(`Campaign sent via Mailchimp to ${count} contact${count === 1 ? "" : "s"} in “${segSelect.value}”.`, "success");
        },
      }, "Send via Mailchimp"),
    ])
  );
  updateSummary();
}

// ------------------------------------------------------------------- access
function renderAccess() {
  const sel = byId("persona-select");
  if (sel.options.length === 0) {
    ACCESS_PERSONAS.forEach((p) => sel.append(el("option", { value: p.id }, p.label)));
    sel.value = state.persona;
    sel.onchange = () => { state.persona = sel.value; renderAccess(); };
  }
  const wrap = byId("portal-preview");
  wrap.innerHTML = "";
  PORTAL_RESOURCES.forEach((r) => {
    const unlocked = r.rule.includes(state.persona);
    wrap.append(
      el("div", { class: "resource-card " + (unlocked ? "unlocked" : "locked") }, [
        el("div", { class: "resource-card__name" }, r.name),
        el("div", { class: "resource-card__status" }, unlocked ? "🔓 Visible" : "🔒 Hidden / paywalled"),
      ])
    );
  });
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

// -------------------------------------------------------------------- drawer
function openDrawer(companyId) {
  const c = state.companies.find((x) => x.id === companyId);
  if (!c) return;
  byId("drawer-title").textContent = c.name;
  const body = byId("drawer-body");
  body.innerHTML = "";

  body.append(
    el("div", { class: "drawer-section" }, [
      el("div", {}, [
        el("span", { class: "badge " + stageBadgeClass(c.stage) }, STAGE_LABEL[c.stage]),
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
        el("dt", {}, "Join date"), el("dd", {}, fmtDate(c.joinDate)),
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
function closeDrawer() {
  byId("drawer").classList.remove("open");
  byId("drawer-overlay").classList.remove("open");
}

// --------------------------------------------------------------------- init
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.goto)));
  byId("drawer-close").addEventListener("click", closeDrawer);
  byId("drawer-overlay").addEventListener("click", closeDrawer);
  showView("dashboard");
});
