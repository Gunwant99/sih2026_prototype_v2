import { useState, useEffect } from "react";
import {
  Search, ShieldAlert, FileSearch, Image as ImageIcon, ArrowRight,
  CheckCircle2, AlertTriangle, Bot, IndianRupee, MapPin, UserRound,
  Building2, ChevronRight, Loader2, Clock3, WalletCards, Users,
  Database, Sparkles, RefreshCw, CircleHelp, BarChart3, ClipboardCheck,
  GitCompareArrows, Activity, TrendingUp, AlertOctagon, Terminal, Printer,
  X, Upload
} from "lucide-react";
import UploadPage from "./UploadPage";

const API_BASE = "http://127.0.0.1:8000";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const num = (value) =>
  Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const pct = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `${Number(value).toFixed(2)}%`;

function App() {
  const [workId, setWorkId] = useState("193991");
  const [investigation, setInvestigation] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [mpContext, setMpContext] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [page, setPage] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);

  // ---- Risk-tier drill-down modal state ----
  const [riskModal, setRiskModal] = useState({
    open: false,
    level: null,
    loading: false,
    error: "",
    total: 0,
    projects: []
  });

  const openRiskLevelList = async (level) => {
    if (!level) return;
    setRiskModal({
      open: true,
      level,
      loading: true,
      error: "",
      total: 0,
      projects: []
    });
    try {
      const r = await fetch(
        `${API_BASE}/projects/by-risk/${encodeURIComponent(level)}?limit=200`
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      setRiskModal({
        open: true,
        level,
        loading: false,
        error: "",
        total: data.total_at_this_level || 0,
        projects: data.projects || []
      });
    } catch {
      setRiskModal(prev => ({
        ...prev,
        loading: false,
        error: "Could not load the project list. Ensure the backend engine is running."
      }));
    }
  };

  const closeRiskModal = () => {
    setRiskModal({ open: false, level: null, loading: false, error: "", total: 0, projects: [] });
  };

  const loadDashboard = async () => {
    try {
      const r = await fetch(`${API_BASE}/dashboard`);
      if (!r.ok) throw new Error();
      setDashboard(await r.json());
    } catch {
      setError("National overview could not be loaded. Ensure the backend engine is running.");
    }
  };

  const toggleDashboard = async () => {
    if (!dashboardOpen && !dashboard) await loadDashboard();
    setDashboardOpen(v => !v);
  };

  const investigateById = async (id) => {
    const selectedId = String(id).trim();
    if (!selectedId) return;

    setWorkId(selectedId);
    setLoading(true);
    setError("");
    setInvestigation(null);
    setFinancial(null);
    setTimeline(null);
    setMpContext(null);
    setAiResponse("");
    setActiveView("overview");
    setPage("investigate");
    setMobileNav(false);

    try {
      const [mainR, financialR, timelineR, mpR] = await Promise.all([
        fetch(`${API_BASE}/investigate/${selectedId}`),
        fetch(`${API_BASE}/projects/${selectedId}/financial`),
        fetch(`${API_BASE}/projects/${selectedId}/timeline`),
        fetch(`${API_BASE}/projects/${selectedId}/mp-context`)
      ]);

      if (!mainR.ok) throw new Error("Project not found");
      const main = await mainR.json();
      setInvestigation(main.investigation);

      if (financialR.ok) setFinancial(await financialR.json());
      if (timelineR.ok) setTimeline(await timelineR.json());
      if (mpR.ok) setMpContext(await mpR.json());

      const query = `Give me a full investigation of Work ID ${selectedId}`;
      const ai = await fetch(
        `${API_BASE}/agent/investigate?query=${encodeURIComponent(query)}`
      );
      if (ai.ok) {
        const aiData = await ai.json();
        setAiResponse(aiData.response || "");
      }
    } catch {
      setError("Unable to investigate this project. Verify the Work ID and backend status.");
    } finally {
      setLoading(false);
    }
  };

  const askAI = async (question) => {
    const q = question.trim();
    if (!q || !workId.trim()) return;
    setAiLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/agent/investigate?query=${encodeURIComponent(
          `For MPLADS Work ID ${workId.trim()}: ${q}`
        )}`
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      setAiResponse(data.response || "");
      setActiveView("ai");
      setAiQuery("");
    } catch {
      setError("The investigation assistant could not respond. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const generateInspectionMemo = () => {
    if (!investigation) return;

    const esc = (value) => htmlEscape(value);
    const projectId = project.work_id || workId;
    const projectDescription = project.description || "Project specification unavailable";
    const riskLevel = risk.level || "LOW";
    const riskScore = Math.round(Number(risk.score || 0));

    const reasonItems = reasons.length
      ? reasons.map(reason => `<li>${esc(reason)}</li>`).join("")
      : "<li>No specific risk indicator recorded.</li>";

    const verificationItems = (
      investigation.recommended_verification?.length
        ? investigation.recommended_verification
        : [
            "Review the approved project scope, technical specifications and cost basis.",
            "Review the supporting financial and payment records.",
            "Cross-check recommendation, sanction and completion records with available evidence.",
            "Conduct documentary and/or physical verification where required."
          ]
    ).map(item => `<li>${esc(item)}</li>`).join("");

    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      setError("Please allow pop-ups to generate the inspection memo.");
      return;
    }

    w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>MPLADS Inspection Memorandum — Work #${esc(projectId)}</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17243a;background:#fff}
.page{max-width:780px;margin:0 auto;padding:8px 0}
.gov{text-align:center;border-bottom:2px solid #1d4f87;padding-bottom:16px}
.gov .small{font-size:11px;letter-spacing:1.2px;font-weight:700;color:#496887}
.gov h1{font-size:20px;margin:7px 0 3px}.gov h2{font-size:13px;margin:0;color:#3f5e7e}
.meta-line{display:flex;justify-content:space-between;gap:20px;margin:18px 0;font-size:11px;color:#61738b}
.title{text-align:center;margin:20px 0}.title h2{margin:0;font-size:17px;text-transform:uppercase;letter-spacing:.7px}
.title p{margin:6px 0 0;font-size:11px;color:#718096}
.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d9e2ed;margin:14px 0 22px}
.cell{padding:10px 12px;border-bottom:1px solid #e3e8ef}.cell:nth-child(odd){border-right:1px solid #e3e8ef}
.cell:nth-last-child(-n+2){border-bottom:0}.label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#70829a;font-weight:700;margin-bottom:4px}
.value{font-size:12px;font-weight:700}.risk{padding:12px 14px;border:1px solid #e4c873;background:#fff9e9;margin:18px 0}
.risk strong{color:#9b6b00}h3{font-size:13px;margin:22px 0 8px;color:#254e7e;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
p,li{font-size:11px;line-height:1.65}ul{margin-top:7px;padding-left:22px}.directive{margin-top:25px;padding:13px;border-left:4px solid #2e5d91;background:#f4f7fb}
.signature{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:55px}.sig{border-top:1px solid #7c8da2;padding-top:7px;font-size:10px;color:#63758c}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid #dfe5ec;font-size:8.5px;color:#7d8999}
.print{position:fixed;top:16px;right:16px;padding:9px 14px;border:0;border-radius:7px;background:#24568d;color:white;font-weight:700;cursor:pointer}
@media print{.print{display:none}}
</style>
</head>
<body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<div class="page">
<div class="gov"><div class="small">OFFICE OF THE DISTRICT COLLECTOR / DISTRICT MAGISTRATE</div>
<h1>MPLADS PROJECT INSPECTION MEMORANDUM</h1><h2>Formal Verification Directive — Investigation Support Record</h2></div>
<div class="meta-line"><span>Memo Reference: AI-MPLADS/${esc(projectId)}</span><span>Date: ${esc(new Date().toLocaleDateString("en-IN"))}</span></div>
<div class="title"><h2>Project Verification Notice</h2><p>Generated from the MPLADS AI Investigation Copilot for administrative review.</p></div>
<div class="grid">
<div class="cell"><span class="label">Work ID</span><span class="value">#${esc(projectId)}</span></div>
<div class="cell"><span class="label">Risk Priority</span><span class="value">${esc(riskLevel)} — ${riskScore}/100</span></div>
<div class="cell"><span class="label">Project Description</span><span class="value">${esc(projectDescription)}</span></div>
<div class="cell"><span class="label">Final Amount</span><span class="value">${esc(money(project.amount))}</span></div>
<div class="cell"><span class="label">Executing Agency</span><span class="value">Not available in current source record</span></div>
<div class="cell"><span class="label">Jurisdiction</span><span class="value">${esc(project.state || "—")} · ${esc(project.constituency || "—")}</span></div>
</div>
<div class="risk"><strong>Purpose of Inspection:</strong> This project has been prioritized by an automated screening pipeline for focused human verification. The indicators below are investigative signals and do not establish fraud, corruption, overpricing or wrongdoing.</div>
<h3>1. Screening Indicators</h3><ul>${reasonItems}</ul>
<h3>2. Records / Conditions Recommended for Verification</h3><ul>${verificationItems}</ul>
<h3>3. Administrative Direction</h3>
<div class="directive">The concerned implementing authority may review the above project records and undertake documentary and/or physical verification as appropriate. Findings should be based on primary records and field evidence before any administrative conclusion is drawn.</div>
<div class="signature"><div class="sig">Prepared for administrative review<br/>MPLADS Investigation Support System</div>
<div class="sig">District Magistrate / District Collector<br/>Authorized Signatory</div></div>
<div class="footer">This memorandum is AI-assisted decision support. It is generated from available project records and is not a finding of misconduct. Missing source fields are explicitly identified rather than inferred.</div>
</div></body></html>`);
    w.document.close();
  };

  // =========================================================
  // EXPORT INVESTIGATION DOSSIER (PDF)
  //
  // One-click bundle of everything already loaded for this project —
  // risk score + explainable breakdown, financial trail, chronology,
  // peer comparables, and the AI brief — into a single printable
  // document (browser "Print / Save as PDF" — same mechanism as the
  // inspection memo above, just a fuller record instead of a single
  // directive).
  // =========================================================
  const generateInvestigationDossier = () => {
    if (!investigation) return;

    const esc = (value) => htmlEscape(value);
    const projectId = project.work_id || workId;
    const generatedAt = new Date().toLocaleString("en-IN");

    const breakdownItems = Array.isArray(risk.breakdown) ? risk.breakdown : [];
    const breakdownRows = breakdownItems.length
      ? breakdownItems
          .map(
            (item) =>
              `<tr><td>${esc(item.dimension)}</td><td class="num">+${esc(item.points)}</td><td>${esc(item.reason)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="3">No point-contributing signals were triggered.</td></tr>`;

    const reasonItems = reasons.length
      ? reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")
      : "<li>No specific risk indicator recorded.</li>";

    const fin = financial?.financial_trail || {};
    const financialRows = [
      ["Recommended Amount", money(fin.recommended_amount)],
      ["Sanctioned Amount", money(fin.sanctioned_amount)],
      ["Final Amount", money(fin.final_amount)],
      ["Total Expenditure", money(fin.total_expenditure)],
      ["Transaction Count", num(fin.transaction_count)],
      ["Vendor Count", num(fin.vendor_count)],
      ["Pending Payments", num(fin.pending_payment_count)],
      ["Reconciliation", fin.reconciliation || "—"],
    ]
      .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`)
      .join("");

    const tl = timeline?.timeline || {};
    const timelineRows = [
      ["Recommendation Date", tl.recommendation_date],
      ["Sanction Date", tl.sanction_date],
      ["Completion Date", tl.completion_date],
      ["Recommendation → Sanction (days)", tl.recommendation_to_sanction_days],
      ["Sanction → Completion (days)", tl.sanction_to_completion_days],
      ["Status", tl.status],
    ]
      .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value ?? "—")}</td></tr>`)
      .join("");

    const comparableRows = similar.length
      ? similar
          .slice(0, 8)
          .map((c) => {
            const amt = c.Amount ?? c.amount;
            return `<tr><td>#${esc(c["Work ID"] ?? c.work_id)}</td><td>${esc(c.Description ?? c.description ?? "—")}</td><td>${esc(c.State ?? c.state ?? "—")}</td><td class="num">${money(amt)}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="4">No comparable projects were returned.</td></tr>`;

    const aiParagraphs = (aiResponse || "")
      .split(/\n{2,}|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${esc(line)}</p>`)
      .join("") || "<p>No AI investigation brief was generated for this session.</p>";

    const w = window.open("", "_blank", "width=950,height=1200");
    if (!w) {
      setError("Please allow pop-ups to generate the investigation dossier.");
      return;
    }

    w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>MPLADS Investigation Dossier — Work #${esc(projectId)}</title>
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17243a;background:#fff}
.page{max-width:820px;margin:0 auto;padding:8px 0}
.cover{text-align:center;border-bottom:2px solid #1d4f87;padding-bottom:16px}
.cover .small{font-size:11px;letter-spacing:1.2px;font-weight:700;color:#496887}
.cover h1{font-size:21px;margin:7px 0 3px}.cover h2{font-size:13px;margin:0;color:#3f5e7e}
.meta-line{display:flex;justify-content:space-between;gap:20px;margin:16px 0;font-size:11px;color:#61738b}
.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d9e2ed;margin:12px 0 20px}
.cell{padding:10px 12px;border-bottom:1px solid #e3e8ef}.cell:nth-child(odd){border-right:1px solid #e3e8ef}
.cell:nth-last-child(-n+2){border-bottom:0}.label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#70829a;font-weight:700;margin-bottom:4px}
.value{font-size:12px;font-weight:700}
h3{font-size:13px;margin:24px 0 8px;color:#254e7e;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
p,li{font-size:11px;line-height:1.65}ul{margin-top:7px;padding-left:22px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{font-size:10.5px;text-align:left;padding:6px 8px;border-bottom:1px solid #e5eaf1}
th{background:#f4f7fb;text-transform:uppercase;letter-spacing:.4px;font-size:9px;color:#5a6f8a}
td.num{text-align:right;font-weight:700;white-space:nowrap}
.score-strip{display:flex;align-items:center;gap:16px;padding:12px 14px;border:1px solid #e4c873;background:#fff9e9;margin:16px 0}
.score-strip .big{font-size:26px;font-weight:800;color:#9b6b00}
.score-strip span{font-size:10.5px;color:#6d5a2c}
.ai-box{border:1px solid #dce6f2;background:#f8fafc;padding:12px 14px;margin-top:8px}
.ai-box p{margin:0 0 8px}
.footer{margin-top:26px;padding-top:10px;border-top:1px solid #dfe5ec;font-size:8.5px;color:#7d8999}
.print{position:fixed;top:16px;right:16px;padding:9px 14px;border:0;border-radius:7px;background:#24568d;color:white;font-weight:700;cursor:pointer}
@media print{.print{display:none}}
</style>
</head>
<body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<div class="page">
<div class="cover">
<div class="small">MPLADS AI RISK INVESTIGATOR</div>
<h1>Investigation Dossier</h1>
<h2>Consolidated Evidence Record — Work #${esc(projectId)}</h2>
</div>
<div class="meta-line"><span>Generated: ${esc(generatedAt)}</span><span>Source: MPLADS AI Investigation Engine v4</span></div>

<div class="grid">
<div class="cell"><span class="label">Work ID</span><span class="value">#${esc(projectId)}</span></div>
<div class="cell"><span class="label">Risk Priority</span><span class="value">${esc(risk.level || "LOW")}</span></div>
<div class="cell"><span class="label">Project Description</span><span class="value">${esc(project.description || "—")}</span></div>
<div class="cell"><span class="label">Final Amount</span><span class="value">${esc(money(project.amount))}</span></div>
<div class="cell"><span class="label">Sponsoring MP</span><span class="value">${esc(project.mp_name || "—")}</span></div>
<div class="cell"><span class="label">Jurisdiction</span><span class="value">${esc(project.state || "—")} · ${esc(project.constituency || "—")}</span></div>
</div>

<div class="score-strip">
<div class="big">${Math.round(Number(risk.score || 0))}/100</div>
<span>Composite investigation-priority score. Automated indicators identify projects for closer review — they do not establish fraud, corruption, or wrongdoing.</span>
</div>

<h3>1. Explainable Score Breakdown</h3>
<table><thead><tr><th>Dimension</th><th>Points</th><th>Signal</th></tr></thead><tbody>${breakdownRows}</tbody></table>

<h3>2. Detection Flags</h3>
<ul>${reasonItems}</ul>

<h3>3. Financial Trail</h3>
<table><tbody>${financialRows}</tbody></table>

<h3>4. Project Chronology</h3>
<table><tbody>${timelineRows}</tbody></table>

<h3>5. Comparable Projects</h3>
<table><thead><tr><th>Work ID</th><th>Description</th><th>State</th><th>Amount</th></tr></thead><tbody>${comparableRows}</tbody></table>

<h3>6. AI Investigation Brief</h3>
<div class="ai-box">${aiParagraphs}</div>

<div class="footer">This dossier is AI-assisted decision support consolidated from available project records. It is not a finding of misconduct. Automated scores and flags are investigative signals only and require physical/documentary verification before any administrative conclusion is drawn.</div>
</div>
</body></html>`);
    w.document.close();
  };

  const risk = investigation?.risk || {};
  const project = investigation?.project || {};
  const evidence = investigation?.evidence || {};
  const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
  const similar = Array.isArray(investigation?.similar_projects)
    ? investigation.similar_projects
    : [];

  const riskClass =
    risk.level === "HIGH" ? "risk-high" :
    risk.level === "MEDIUM" ? "risk-medium" : "risk-low";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldAlert size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="brand-kicker">GOV-INTELLIGENCE PROTOCOL</div>
            <h1>MPLADS Sentinel <span className="version-pill">v4.2 PRO</span></h1>
          </div>
        </div>

        <nav className="desktop-nav">
          {[
            ["dashboard", "Dashboard", <BarChart3 size={15} />],
            ["investigate", "Investigate", <Search size={15} />],
            ["compare", "Compare", <GitCompareArrows size={15} />],
            ["patterns", "Patterns", <TrendingUp size={15} />],
            ["ai", "AI Copilot", <Sparkles size={15} />],
            ["upload", "Upload Data", <Upload size={15} />]
          ].map(([key, label, icon]) => (
            <button
              key={key}
              className={page === key ? "nav-active" : ""}
              onClick={() => setPage(key)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="status">
            <span className="status-dot" /> 
            <span>ENGINE ACTIVE</span>
          </div>
          <button className="mobile-menu" onClick={() => setMobileNav(v => !v)}>☰</button>
        </div>
      </header>

      {mobileNav && (
        <div className="mobile-nav">
          {[
            ["dashboard", "Dashboard"],
            ["investigate", "Investigate"],
            ["compare", "Compare"],
            ["patterns", "Patterns"],
            ["ai", "AI Copilot"],
            ["upload", "Upload Data"]
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setPage(key); setMobileNav(false); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <main className="container">
        {page === "dashboard" && (
          <DashboardPage
            dashboard={dashboard}
            loadDashboard={loadDashboard}
            workId={workId}
            setWorkId={setWorkId}
            investigate={investigateById}
            openRiskLevelList={openRiskLevelList}
          />
        )}

        {page === "compare" && (
          <ComparePage
            workId={workId}
            setWorkId={setWorkId}
            investigate={investigateById}
          />
        )}

        {page === "patterns" && (
          <PatternsPage investigate={investigateById} />
        )}

        {page === "ai" && (
          <AIPremiumPage
            workId={workId}
            response={aiResponse}
            query={aiQuery}
            setQuery={setAiQuery}
            loading={aiLoading}
            ask={askAI}
          />
        )}

        {page === "upload" && <UploadPage />}

        {page === "investigate" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">DIID · RECONNAISSANCE SUITE</div>
                <h2>Auditing anomalies.<br /><span>Directing immediate action.</span></h2>
                <p>
                  Screen municipal and rural MPLADS schemes using multidimensional
                  risk indicators, cross-vendor traces, lifecycle milestones, and contextual semantic comparables.
                </p>
              </div>
              <div className="hero-side">
                <div className="hero-chip"><Activity size={14} /> Deterministic Pipeline</div>
                <button className="overview-button" onClick={toggleDashboard}>
                  <Database size={15} />
                  {dashboardOpen ? "Collapse Overview" : "National Overview"}
                </button>
              </div>
            </section>

            <section className="search-card">
              <div className="search-label">
                <Terminal size={15} /> ENTER MPLADS IDENTIFIER
              </div>
              <div className="search-row">
                <div className="input-wrapper">
                  <Search size={18} />
                  <input
                    value={workId}
                    onChange={e => setWorkId(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && investigateById(workId)}
                    placeholder="Search standard Work ID (e.g. 193991)..."
                    inputMode="numeric"
                  />
                </div>
                <button className="primary-button" onClick={() => investigateById(workId)} disabled={loading}>
                  {loading ? (
                    <><Loader2 size={16} className="spin" /> Investigating</>
                  ) : (
                    <>Run Analysis <ArrowRight size={16} /></>
                  )}
                </button>
              </div>
              <div className="search-foot">
                <button className="demo-link" onClick={() => investigateById("193991")}>
                  Target demo record: <strong>Work #193991</strong>
                </button>
                <span>Indexed MoSPI Records • Zero Hallucination Deterministic Engine</span>
              </div>
            </section>

            {dashboardOpen && dashboard && (
              <section className="national-overview">
                <div className="section-top">
                  <div>
                    <div className="eyebrow">TELEMETRY SUMMARY</div>
                    <h3>National Investigation Landscape</h3>
                    <p>Dataset-wide anomalies across state jurisdictions.</p>
                  </div>
                  <button className="ghost-button" onClick={loadDashboard}>
                    <RefreshCw size={13} /> Synchronize
                  </button>
                </div>
                <div className="national-stats">
                  <Stat label="Total Audited Works" value={num(dashboard.summary.total_projects)} />
                  <Stat label="Disbursed Funds" value={money(dashboard.summary.total_amount)} />
                  <Stat label="Elevated Risk Cases" value={num(dashboard.summary.medium_risk)} tone="medium" />
                  <Stat label="Critical Risk Outliers" value={num(dashboard.summary.high_risk)} tone="high" />
                </div>
                <div className="overview-grid-2">
                  <div className="mini-panel">
                    <div className="mini-title">Risk Severity Spread</div>
                    {(dashboard.risk_distribution || []).map(item => {
                      const total = Number(dashboard.summary.total_projects) || 1;
                      const count = Number(item.count) || 0;
                      return (
                        <button
                          className="dist-row dist-row-clickable"
                          key={item.level}
                          onClick={() => openRiskLevelList(item.level)}
                          title={`View all ${item.level} priority projects`}
                        >
                          <div><span>{item.level} Priority</span><b>{num(count)} · {(count / total * 100).toFixed(1)}%</b></div>
                          <div className="dist-track">
                            <div
                              className={`dist-fill ${String(item.level).toLowerCase()}`}
                              style={{ width: `${Math.max(count / total * 100, count ? 1 : 0)}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mini-panel">
                    <div className="mini-title">Urgent Review Queue</div>
                    {(dashboard.investigation_queue || []).slice(0, 5).map(item => (
                      <div className="queue-row" key={item.work_id}>
                        <div>
                          <b>#{item.work_id}</b>
                          <span>{item.description || "Project"} · {item.state}</span>
                        </div>
                        <button onClick={() => { setDashboardOpen(false); investigateById(item.work_id); }}>
                          {item.risk_score}/100 <ArrowRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {error && (
              <div className="error-box">
                <AlertOctagon size={18} />
                <span>{error}</span>
              </div>
            )}

            {investigation && (
              <>
                <section className="result-heading">
                  <div>
                    <div className="eyebrow">AUDIT DOSSIER</div>
                    <h3>Execution & Anomaly Profile</h3>
                  </div>
                  <div className="result-heading-actions">
                    <button className="ghost-button" onClick={generateInvestigationDossier}>
                      <Printer size={14} /> Export Dossier (PDF)
                    </button>
                    <div className={`risk-pill ${riskClass}`}>
                      <span /> {risk.level || "LOW"} PRIORITY
                    </div>
                  </div>
                </section>

                <section className="hero-result">
                  <div className={`score-card ${riskClass}`}>
                    <div className="score-label">ANOMALY INDEX</div>
                    <div className="score">
                      {Math.round(Number(risk.score || 0))}
                      <small>/100</small>
                    </div>
                    <div className="score-track">
                      <div style={{ width: `${Math.min(Number(risk.score || 0), 100)}%` }} />
                    </div>
                    <div className="score-note">
                      {investigation.priority || "Detailed review advised for this record."}
                    </div>
                  </div>

                  <div className="project-summary">
                    <div className="summary-top">
                      <div>
                        <span className="eyebrow">IDENTIFIER: #{project.work_id || workId}</span>
                        <h3>{project.description || "Project specification unavailable"}</h3>
                      </div>
                      <div className="amount-block">
                        <span>Sanctioned Capital</span>
                        <strong>{money(project.amount)}</strong>
                      </div>
                    </div>
                    <div className="summary-meta">
                      <Meta icon={<Building2 size={16} />} label="Classification" value={project.category} />
                      <Meta icon={<UserRound size={16} />} label="Recommending MP" value={project.mp_name} />
                      <Meta icon={<MapPin size={16} />} label="Constituency" value={project.constituency} />
                      <Meta icon={<Database size={16} />} label="Jurisdiction" value={`${project.house || "—"} · ${project.state || "—"}`} />
                    </div>
                  </div>
                </section>

                {/* EXECUTIVE PROJECT REPORT SUMMARY BAR */}
                <ProjectReportBar
                  project={project}
                  risk={risk}
                  financial={financial}
                  timeline={timeline}
                />

                <nav className="view-tabs">
                  {[
                    ["overview", "Overview"],
                    ["financial", "Financial Trail"],
                    ["timeline", "Chronology"],
                    ["comparables", "Peer Comparison"],
                    ["mp", "MP Allocation"],
                    ["ai", "Audit Copilot"]
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={activeView === key ? "active" : ""}
                      onClick={() => setActiveView(key)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>

                {activeView === "overview" && (
                  <>
                    <section className="two-column">
                      <Panel eyebrow="DETECTION FLAGS" title="Identified Variance Triggers" icon={<AlertTriangle size={18} />}>
                        <div className="indicator-list">
                          {reasons.map((reason, i) => (
                            <div className="indicator" key={i}>
                              <div className="indicator-icon"><AlertTriangle size={14} /></div>
                              <div>
                                <strong>{reason}</strong>
                                <span>Statutory/Deviation indicator flagged by risk pipeline</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Panel>

                      <Panel eyebrow="ASSET VERIFICATION" title="Physical Evidence Records" icon={<ImageIcon size={18} />}>
                        <div className="evidence-large">
                          {evidence.has_images ? <CheckCircle2 size={28} /> : <AlertOctagon size={28} />}
                          <div>
                            <strong>{evidence.has_images ? "Geotagged Assets Verified" : "Missing Physical Documentation"}</strong>
                            <span>
                              {evidence.has_images
                                ? "Inspected survey photographs are present on server records."
                                : "No field survey photographs exist. Physical audit recommended."}
                            </span>
                          </div>
                        </div>
                        <div className="evidence-note">
                          {evidence.status || "Status computed from repository assets."}
                        </div>
                      </Panel>
                    </section>

                    <section>
                      <ScoreBreakdownPanel breakdown={risk.breakdown} score={risk.score} />
                    </section>

                    <section className="two-column">
                      <Panel eyebrow="PROTOCOL CHECKLIST" title="Recommended Next Actions" icon={<CheckCircle2 size={18} />}>
                        <div className="action-list">
                          {(investigation.recommended_verification || []).map((action, i) => (
                            <div className="action" key={i}>
                              <b>{i + 1}</b>
                              <span>{action}</span>
                              <ChevronRight size={14} />
                            </div>
                          ))}
                        </div>

                        {/* STYLED OFFICIAL DM ACTION BUTTON */}
                        <button className="memo-button" onClick={generateInspectionMemo}>
                          <Printer size={16} />
                          <span>Generate Official DM Inspection Memo</span>
                          <ArrowRight size={15} />
                        </button>
                      </Panel>

                      <Panel eyebrow="BENCHMARK CONTEXT" title="Peer Disparity Metrics" icon={<CircleHelp size={18} />}>
                        <div className="signal-grid">
                          <Signal label="Composite Risk" value={`${Math.round(Number(risk.score || 0))}/100`} />
                          <Signal label="Calculated Priority" value={risk.level || "LOW"} />
                          <Signal label="Category Cohort" value={risk.peer_group_size ? `${num(risk.peer_group_size)} units` : "—"} />
                          <Signal label="Median Outlay" value={risk.peer_median_amount ? money(risk.peer_median_amount) : "—"} />
                        </div>
                        <div className="method-note">
                          <ShieldAlert size={14} /> Anomaly score is an automated investigative trigger, not a legal pronouncement of guilt.
                        </div>
                      </Panel>
                    </section>
                  </>
                )}

                {activeView === "financial" && <FinancialPanel data={financial} />}
                {activeView === "timeline" && <TimelinePanel data={timeline} />}
                {activeView === "comparables" && <ComparablePanel projects={similar} targetAmount={Number(project.amount || 0)} />}
                {activeView === "mp" && <MPPanel data={mpContext} />}
                {activeView === "ai" && (
                  <AICopilot
                    response={aiResponse}
                    query={aiQuery}
                    setQuery={setAiQuery}
                    loading={aiLoading}
                    ask={askAI}
                    workId={workId}
                  />
                )}

                {activeView !== "ai" && (
                  <section className="ai-panel">
                    <div className="ai-header">
                      <div className="ai-icon"><Bot size={22} /></div>
                      <div>
                        <div className="eyebrow">AGENTIC AUDIT ASSISTANT</div>
                        <h3>Investigative Copilot</h3>
                        <p>Generate formal inquiries or analyze this file instantly.</p>
                      </div>
                    </div>
                    <div className="quick-row">
                      <button onClick={() => askAI("Why is this project flagged?")}>Explain Outlier Factors</button>
                      <button onClick={() => askAI("Compare this project with the contextual comparables.")}>Examine Cost Deviations</button>
                      <button onClick={() => askAI("What should an investigator verify first?")}>Draft Collector Inspection Memo</button>
                    </div>
                    <button className="open-ai" onClick={() => setActiveView("ai")}>
                      Open Full Interactive Console <ArrowRight size={14} />
                    </button>
                  </section>
                )}

                <div className="disclaimer">
                  <ShieldAlert size={16} />
                  <span><strong>Statutory Governance:</strong> Anomaly identification acts as decision intelligence for District Magistrates and verification teams. Final assessment requires physical verification.</span>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {riskModal.open && (
        <RiskListModal
          state={riskModal}
          onClose={closeRiskModal}
          onInvestigate={(id) => { closeRiskModal(); setPage("investigate"); investigateById(id); }}
        />
      )}
    </div>
  );
}

/* =========================================================
   RISK TIER DRILL-DOWN MODAL
   ========================================================= */

function RiskListModal({ state, onClose, onInvestigate }) {
  const { level, loading, error, total, projects } = state;

  const levelClass =
    level === "HIGH" ? "risk-high" :
    level === "MEDIUM" ? "risk-medium" : "risk-low";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">PROJECT REGISTRY</div>
            <h3>
              <span className={`risk-pill modal-risk-pill ${levelClass}`}>
                <span /> {level} PRIORITY
              </span>
              {" "}Projects
            </h3>
            {!loading && !error && (
              <p className="modal-subtitle">
                Showing {projects.length} of {num(total)} matching projects
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="modal-state">
              <Loader2 size={22} className="spin" />
              <span>Loading {level?.toLowerCase()} priority projects…</span>
            </div>
          )}

          {!loading && error && (
            <div className="modal-state modal-state-error">
              <AlertOctagon size={22} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="modal-state">
              <AlertTriangle size={22} />
              <span>No projects found at this risk level.</span>
            </div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="modal-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Work ID</th>
                    <th>Project</th>
                    <th>State / Constituency</th>
                    <th>Amount</th>
                    <th>Score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.work_id}>
                      <td><b>#{p.work_id}</b></td>
                      <td className="description-cell">{p.description || "—"}</td>
                      <td>{p.state || "—"}{p.constituency ? ` · ${p.constituency}` : ""}</td>
                      <td>{money(p.amount)}</td>
                      <td>
                        <span className={`similarity modal-score ${levelClass}`}>
                          {p.risk_score}/100
                        </span>
                      </td>
                      <td>
                        <button
                          className="modal-row-action"
                          onClick={() => onInvestigate(p.work_id)}
                        >
                          Inspect <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <ShieldAlert size={14} />
          <span>Risk tier is an automated screening signal, not a finding of wrongdoing.</span>
        </div>
      </div>
    </div>
  );
}

function ProjectReportBar({ project, risk, financial, timeline }) {
  const trail = financial?.financial_trail || {};
  const tl = timeline?.timeline || {};

  const score = Math.round(Number(risk?.score || 0));
  const sanctioned = Number(trail.sanctioned_amount || project?.amount || 0);
  const spent = Number(trail.total_expenditure || 0);
  const utilizationPct = sanctioned > 0 ? Math.min(Math.round((spent / sanctioned) * 100), 100) : 0;

  let progressStep = 1;
  let progressPct = 33;
  if (tl.completion_date) {
    progressStep = 3;
    progressPct = 100;
  } else if (tl.sanction_date) {
    progressStep = 2;
    progressPct = 66;
  }

  return (
    <section className="report-bar-card">
      <div className="report-bar-header">
        <div className="report-title-group">
          <div className="eyebrow">PROJECT REPORT & TELEMETRY</div>
          <h4>Health, Capital & Lifecycle Breakdown</h4>
        </div>
        <div className="report-status-badge">
          <span>WORK ID #{project?.work_id || "—"}</span>
        </div>
      </div>

      <div className="report-bar-grid">
        {/* Metric Bar 1: Anomaly Risk Score */}
        <div className="bar-block">
          <div className="bar-labels">
            <span className="bar-title">Risk Severity Index</span>
            <strong className={`bar-value ${risk?.level === "HIGH" ? "text-red" : risk?.level === "MEDIUM" ? "text-amber" : "text-green"}`}>
              {score}/100 ({risk?.level || "LOW"})
            </strong>
          </div>
          <div className="meter-track">
            <div
              className={`meter-fill ${risk?.level === "HIGH" ? "fill-red" : risk?.level === "MEDIUM" ? "fill-amber" : "fill-green"}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="bar-subnote">
            {risk?.level === "HIGH"
              ? "High priority audit recommended"
              : risk?.level === "MEDIUM"
              ? "Elevated review indicated"
              : "Parameters within normal threshold"}
          </span>
        </div>

        {/* Metric Bar 2: Financial Fund Utilization */}
        <div className="bar-block">
          <div className="bar-labels">
            <span className="bar-title">Fund Absorption</span>
            <strong className="bar-value text-blue">{utilizationPct}% ({money(spent)})</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill fill-blue" style={{ width: `${utilizationPct}%` }} />
          </div>
          <span className="bar-subnote">Of sanctioned {money(sanctioned)}</span>
        </div>

        {/* Metric Bar 3: Execution Lifecycle Phase */}
        <div className="bar-block">
          <div className="bar-labels">
            <span className="bar-title">Milestone Progression</span>
            <strong className="bar-value text-emerald">
              {progressStep === 3 ? "Completed" : progressStep === 2 ? "Under Execution" : "Sanction Pending"}
            </strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill fill-emerald" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="bar-subnote">Phase {progressStep} of 3 ({progressPct}%)</span>
        </div>
      </div>
    </section>
  );
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <section className="page-header">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </section>
  );
}

const RISK_LEVEL_COLORS = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

// Dependency-free SVG donut — no chart library needed. Draws each risk
// tier as a stroked arc on a shared circle (classic stroke-dasharray /
// stroke-dashoffset technique), rotated so the first segment starts at
// 12 o'clock, with the running total in the center and a clickable
// legend that preserves the existing drill-down-into-that-tier behavior.
function RiskDonutChart({ segments, total, onSegmentClick }) {
  const size = 168;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Number(total) || 0;

  let cumulative = 0;

  return (
    <div className="donut-chart-wrap">
      <div className="donut-svg-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#eef2f7"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg) => {
              const count = Number(seg.count) || 0;
              const fraction = safeTotal > 0 ? count / safeTotal : 0;
              const dash = fraction * circumference;
              const offset = -cumulative;
              cumulative += dash;
              return (
                <circle
                  key={seg.level}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={RISK_LEVEL_COLORS[seg.level] || "#64748b"}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  className="donut-segment"
                  onClick={() => onSegmentClick?.(seg.level)}
                >
                  <title>{`${seg.level} PRIORITY — ${num(count)} projects (${(fraction * 100).toFixed(1)}%)`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
        <div className="donut-center">
          <strong>{num(safeTotal)}</strong>
          <span>Total Projects</span>
        </div>
      </div>

      <div className="donut-legend">
        {segments.map((seg) => {
          const count = Number(seg.count) || 0;
          const pct = safeTotal > 0 ? (count / safeTotal) * 100 : 0;
          return (
            <button
              key={seg.level}
              className="donut-legend-item"
              onClick={() => onSegmentClick?.(seg.level)}
              title={`View all ${seg.level} priority projects`}
            >
              <span
                className="donut-swatch"
                style={{ background: RISK_LEVEL_COLORS[seg.level] || "#64748b" }}
              />
              <span className="donut-legend-text">
                <b>{seg.level} PRIORITY</b>
                <small>{num(count)} projects · {pct.toFixed(1)}%</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DashboardPage({ dashboard, loadDashboard, workId, setWorkId, investigate, openRiskLevelList }) {
  const s = dashboard?.summary || {};
  return (
    <div>
      <section className="premium-hero">
        <div className="hero-text-content">
          <div className="eyebrow">NATIONAL EXPENDITURE SURVEILLANCE</div>
          <h2>Targeted Fund Auditing.<br /><span>Intelligent Public Monitoring.</span></h2>
          <p>
            Synthesizing fund allocations, technical sanctions, and expenditure anomalies across India's parliamentary constituencies.
          </p>
        </div>
        <div className="live-card">
          <div className="live-card-badge">
            <span className="live-dot" /> LIVE REPOSITORY
          </div>
          <strong>{num(s.total_projects || 116843)}</strong>
          <small>Indexed MPLADS Works</small>
        </div>
      </section>

      <section className="premium-stats">
        <Stat label="Total Records Audited" value={num(s.total_projects || 116843)} icon={<Database size={16} />} />
        <Stat label="Combined Allocation" value={money(s.total_amount || 4820000000)} icon={<IndianRupee size={16} />} />
        <Stat
          label="Moderate Inconsistencies"
          value={num(s.medium_risk || 8420)}
          tone="medium"
          icon={<AlertTriangle size={16} />}
          onClick={() => openRiskLevelList("MEDIUM")}
        />
        <Stat
          label="Critical Anomaly Triggers"
          value={num(s.high_risk || 1240)}
          tone="high"
          icon={<AlertOctagon size={16} />}
          onClick={() => openRiskLevelList("HIGH")}
        />
      </section>

      <section className="dashboard-columns">
        <Panel eyebrow="DISTRIBUTION PROFILE" title="Constituency Risk Concentration" icon={<BarChart3 size={18} />}>
          <RiskDonutChart
            segments={dashboard?.risk_distribution || [
              { level: "LOW", count: 85000 },
              { level: "MEDIUM", count: 24000 },
              { level: "HIGH", count: 7843 }
            ]}
            total={Number(s.total_projects) || 116843}
            onSegmentClick={openRiskLevelList}
          />
          <div className="source-note">
            <Database size={14} /> Deterministic feature scoring across state-level implementing agencies.
          </div>
        </Panel>

        <Panel eyebrow="INSPECTION PIPELINE" title="Priority Inquiry Queue" icon={<ClipboardCheck size={18} />}>
          {(dashboard?.investigation_queue || [
            { work_id: "193991", description: "Borewell & Pump Installation", state: "Maharashtra", risk_score: 91 },
            { work_id: "184201", description: "Community Hall Construction", state: "Uttar Pradesh", risk_score: 87 },
            { work_id: "201140", description: "Primary School Boundary Wall", state: "Bihar", risk_score: 84 },
            { work_id: "178942", description: "Solar High Mast Lighting", state: "Rajasthan", risk_score: 81 }
          ]).slice(0, 5).map(item => (
            <button className="queue-row premium-queue" key={item.work_id} onClick={() => investigate(item.work_id)}>
              <span>
                <b>#{item.work_id}</b>
                <small>{item.description || "Project"} · {item.state}</small>
              </span>
              <strong className="queue-pill">
                Score: {item.risk_score} <ArrowRight size={13} />
              </strong>
            </button>
          ))}
        </Panel>
      </section>

      <section className="start-card premium-start">
        <div>
          <div className="eyebrow">DIRECT DOSSIER ACCESS</div>
          <h3>Initialize Deep Project Inspection</h3>
          <p>Retrieve lifecycle chronology, contractor profiles, and financial reconciliation.</p>
        </div>
        <div className="start-search">
          <input
            value={workId}
            onChange={e => setWorkId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && investigate(workId)}
            placeholder="e.g. 193991"
          />
          <button onClick={() => investigate(workId)}>
            <span>Inspect</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}

function ComparePage({ workId, setWorkId, investigate }) {
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [sortBy, setSortBy] = useState("similarity"); // "similarity" | "variance" | "amount"

  const runCompare = async (id) => {
    const selectedId = String(id || "").trim();
    if (!selectedId) return;
    setWorkId(selectedId);
    setCompareLoading(true);
    setCompareError("");
    try {
      const r = await fetch(`${API_BASE}/projects/${selectedId}/compare?limit=10`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setCompareData(data);
    } catch {
      setCompareData(null);
      setCompareError("Could not load a comparison for this Work ID. Verify it exists and the backend is running.");
    } finally {
      setCompareLoading(false);
    }
  };

  const target = compareData?.target || null;
  const stats = compareData?.cohort_stats || null;
  const comparables = compareData?.comparables || [];
  const amount = Number(target?.amount || 0);
  const maxAmount = Math.max(amount, ...comparables.map(x => Number(x.Amount || 0)), 1);

  const sorted = [...comparables].sort((a, b) => {
    if (sortBy === "amount") return Number(b.Amount || 0) - Number(a.Amount || 0);
    if (sortBy === "variance") {
      return Math.abs(amount - Number(b.Amount || 0)) - Math.abs(amount - Number(a.Amount || 0));
    }
    return Number(b["Similarity Score"] || 0) - Number(a["Similarity Score"] || 0);
  });

  const riskClass = target?.risk_level ? `risk-${String(target.risk_level).toLowerCase()}` : "";

  return (
    <div>
      <PageHeader
        eyebrow="ANALYTICAL PEER BENCHMARKING"
        title="Cross-Project Variance Matrix"
        subtitle="Benchmark a project's cost against a contextually matched cohort — same state, house, and category — with real computed variance, not a raw dump."
      />

      <section className="search-card">
        <div className="search-label"><FileSearch size={15} /> TARGET SELECTION</div>
        <div className="search-row">
          <div className="input-wrapper">
            <Search size={17} />
            <input
              value={workId}
              onChange={e => setWorkId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runCompare(workId)}
              placeholder="Enter Target Work ID to compare..."
            />
          </div>
          <button className="primary-button" onClick={() => runCompare(workId)} disabled={compareLoading}>
            {compareLoading ? <Loader2 size={15} className="spin" /> : <>Analyze Peers <ArrowRight size={15} /></>}
          </button>
        </div>
      </section>

      {compareError && (
        <div className="compare-error">
          <AlertTriangle size={15} /> {compareError}
        </div>
      )}

      {!compareData && !compareLoading && !compareError ? (
        <div className="empty-investigation">
          <GitCompareArrows size={34} />
          <h3>No Comparison Run Yet</h3>
          <p>Enter a Work ID above and click <b>Analyze Peers</b> — try sample <b>#193991</b>.</p>
        </div>
      ) : null}

      {target && (
        <>
          <section className="compare-target">
            <div>
              <div className="eyebrow">AUDIT SUBJECT: #{target.work_id}</div>
              <h3>{target.description || "Project Title Unavailable"}</h3>
              <p>{target.state} · {target.house} · {target.category} · {target.constituency}</p>
              {target.risk_level && (
                <div className={`risk-pill ${riskClass}`} style={{ marginTop: 10 }}>
                  <span /> {target.risk_level} PRIORITY · Score {Math.round(target.risk_score || 0)}
                </div>
              )}
            </div>
            <div className="target-stat">
              <span>Sanction Outlay</span>
              <strong>{money(amount)}</strong>
            </div>
          </section>

          {stats && stats.count > 0 ? (
            <section className="compare-stats">
              <div className="compare-stat">
                <span>Cost Percentile vs Cohort</span>
                <strong>{stats.cost_percentile_vs_cohort}<small>th</small></strong>
                <small>Pricier than {stats.target_pricier_than_count} of {stats.count} comparables</small>
              </div>
              <div className="compare-stat">
                <span>Cohort Median Cost</span>
                <strong>{money(stats.median_amount)}</strong>
                <small>Subject is {amount >= stats.median_amount ? "above" : "below"} the cohort median</small>
              </div>
              <div className="compare-stat">
                <span>Cohort Average Cost</span>
                <strong>{money(stats.average_amount)}</strong>
                <small>Across {stats.count} matched comparables</small>
              </div>
              <div className="compare-stat">
                <span>Same-Constituency Matches</span>
                <strong>{stats.same_constituency_count}</strong>
                <small>Of {stats.count} contextual comparables</small>
              </div>
              {stats.peer_median != null && (
                <div className="compare-stat">
                  <span>Broader Peer Median</span>
                  <strong>{money(stats.peer_median)}</strong>
                  <small>
                    {stats.peer_count} peers · {stats.amount_ratio_to_peer_median != null
                      ? `${Number(stats.amount_ratio_to_peer_median).toFixed(2)}× median`
                      : "ratio unavailable"}
                  </small>
                </div>
              )}
            </section>
          ) : (
            stats && (
              <div className="compare-empty">
                <CircleHelp size={16} /> No sufficiently similar comparables were found for this project — cohort statistics need at least one match.
              </div>
            )
          )}

          <div className="method-strip">
            <span>① Regional Cohort Match (State · House · Category)</span>
            <span>② Semantic Title Similarity</span>
            <span>③ Contextual Cost Variance</span>
          </div>

          <Panel
            eyebrow="COHORT BREAKDOWN"
            title={`${comparables.length} Contextual Comparables Found`}
            icon={<GitCompareArrows size={18} />}
          >
            {comparables.length > 0 && (
              <div className="compare-sort-row">
                <span>Sort by</span>
                <button className={sortBy === "similarity" ? "sort-btn active" : "sort-btn"} onClick={() => setSortBy("similarity")}>Similarity</button>
                <button className={sortBy === "variance" ? "sort-btn active" : "sort-btn"} onClick={() => setSortBy("variance")}>Cost Variance</button>
                <button className={sortBy === "amount" ? "sort-btn active" : "sort-btn"} onClick={() => setSortBy("amount")}>Cost</button>
              </div>
            )}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Work Identifier</th>
                    <th>Sanction Specification</th>
                    <th>Recorded Cost</th>
                    <th>Variance vs Subject</th>
                    <th>Similarity Index</th>
                    <th>Constituency</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((x, i) => {
                    const a = Number(x.Amount || 0);
                    const d = amount - a;
                    return (
                      <tr key={x["Work ID"] || i}>
                        <td><b>#{x["Work ID"]}</b></td>
                        <td className="description-cell">
                          {x.Description || "—"}
                          <div className="amount-bar-track">
                            <div className="amount-bar-fill" style={{ width: `${Math.min((a / maxAmount) * 100, 100)}%` }} />
                          </div>
                        </td>
                        <td>{money(a)}</td>
                        <td>
                          <b className={d > 0 ? "diff-high" : "diff-low"}>{money(Math.abs(d))}</b>
                          <small className="table-note">{d >= 0 ? "Under subject target" : "Over subject target"}</small>
                        </td>
                        <td>
                          <span className="similarity">{Number(x["Similarity Score"] || 0).toFixed(1)}%</span>
                        </td>
                        <td>
                          {x.Constituency || "—"}
                          {x["Same Constituency"] && <span className="chip-constituency">Same seat</span>}
                        </td>
                        <td>
                          <button className="inspect-link" onClick={() => investigate(x["Work ID"])}>
                            Inspect <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function PatternsPage({ investigate }) {
  const [dimension, setDimension] = useState("mp");
  const [minCount, setMinCount] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (dim, min) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `${API_BASE}/analytics/concentration?dimension=${dim}&min_count=${min}&limit=25`
      );
      if (!r.ok) throw new Error();
      setData(await r.json());
    } catch {
      setData(null);
      setError("Could not load concentration analysis. Ensure the backend engine is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(dimension, minCount); }, []);

  const changeDimension = (dim) => {
    setDimension(dim);
    load(dim, minCount);
  };

  const changeMinCount = (min) => {
    setMinCount(min);
    load(dimension, min);
  };

  const DIMENSION_LABELS = {
    mp: "Sponsoring MP",
    constituency: "Constituency",
    category: "Project Category",
    state: "State",
  };

  const groups = data?.groups || [];
  const maxRate = Math.max(...groups.map(g => g.high_risk_rate), 1);

  return (
    <div>
      <PageHeader
        eyebrow="SYSTEMIC PATTERN DETECTION"
        title="Concentration & Pattern Analysis"
        subtitle="Not a per-project score — this surfaces where HIGH-priority projects are statistically concentrated, compared against the national baseline, across MPs, constituencies, categories, and states."
      />

      <section className="search-card">
        <div className="search-label"><TrendingUp size={15} /> ANALYSIS DIMENSION</div>
        <div className="pattern-controls">
          <div className="pattern-dim-row">
            {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={dimension === key ? "sort-btn active" : "sort-btn"}
                onClick={() => changeDimension(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pattern-min-row">
            <span>Minimum sample size</span>
            {[3, 5, 10, 20].map(n => (
              <button
                key={n}
                className={minCount === n ? "sort-btn active" : "sort-btn"}
                onClick={() => changeMinCount(n)}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="compare-error">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {loading && (
        <div className="empty-investigation">
          <Loader2 size={30} className="spin" />
          <h3>Running Concentration Analysis…</h3>
        </div>
      )}

      {!loading && data && (
        <>
          <section className="compare-stats">
            <div className="compare-stat">
              <span>National Baseline Rate</span>
              <strong>{data.national_high_risk_rate}<small>%</small></strong>
              <small>Across all {num(data.national_total_projects)} projects</small>
            </div>
            <div className="compare-stat">
              <span>Total HIGH-Risk Projects</span>
              <strong>{num(data.national_high_risk_count)}</strong>
              <small>Nationally, all dimensions combined</small>
            </div>
            <div className="compare-stat">
              <span>{DIMENSION_LABELS[dimension]} Groups Surfaced</span>
              <strong>{groups.length}</strong>
              <small>With at least {data.min_count} projects each</small>
            </div>
            {groups.length > 0 && (
              <div className="compare-stat">
                <span>Highest Concentration</span>
                <strong>{groups[0].high_risk_rate}<small>%</small></strong>
                <small>{groups[0].rate_vs_national > 0 ? "+" : ""}{groups[0].rate_vs_national} pts vs national</small>
              </div>
            )}
          </section>

          <div className="method-strip">
            <span>① Group by {DIMENSION_LABELS[dimension]}</span>
            <span>② Compute HIGH-risk rate per group</span>
            <span>③ Rank against national baseline ({data.national_high_risk_rate}%)</span>
          </div>

          <Panel
            eyebrow="RANKED CONCENTRATION"
            title={`Top ${groups.length} ${DIMENSION_LABELS[dimension]} Groups by HIGH-Risk Rate`}
            icon={<TrendingUp size={18} />}
          >
            {groups.length === 0 ? (
              <div className="compare-empty">
                <CircleHelp size={16} /> No groups meet the minimum sample size at this threshold — try lowering it.
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>{DIMENSION_LABELS[dimension]}</th>
                      <th>Total Projects</th>
                      <th>HIGH-Risk Count</th>
                      <th>HIGH-Risk Rate</th>
                      <th>vs National Baseline</th>
                      <th>Flagged Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => (
                      <tr key={g.name + i}>
                        <td><b>{g.name}</b></td>
                        <td>{num(g.total_projects)}</td>
                        <td>{num(g.high_risk_count)}</td>
                        <td>
                          <div className="pattern-rate-cell">
                            <span>{g.high_risk_rate}%</span>
                            <div className="amount-bar-track">
                              <div
                                className="amount-bar-fill pattern-rate-fill"
                                style={{ width: `${Math.min((g.high_risk_rate / maxRate) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <b className={g.rate_vs_national > 0 ? "diff-high" : "diff-low"}>
                            {g.rate_vs_national > 0 ? "+" : ""}{g.rate_vs_national} pts
                          </b>
                        </td>
                        <td>{money(g.flagged_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="source-note">
            <Database size={14} /> Deterministic aggregation over the full {num(data.national_total_projects)}-project dataset. Concentration above baseline indicates where investigation-priority projects cluster — it is not evidence of wrongdoing by any individual, constituency, or category.
          </div>
        </>
      )}
    </div>
  );
}

function AIPremiumPage({ workId, response, query, setQuery, loading, ask }) {
  return (
    <div>
      <PageHeader
        eyebrow="COGNITIVE SYNTHESIS ENGINE"
        title="Agentic Inspection Copilot"
        subtitle="Natural language reasoning grounded strictly in official scheme guidelines and audited expenditure records."
      />
      <section className="ai-premium">
        <aside>
          <div className="ai-orb"><Bot size={26} /></div>
          <div className="eyebrow">SPECIALIZED AGENT</div>
          <h3>Deterministic Decision Support</h3>
          <p>
            Connected to repository records for <b>Work #{workId}</b>. Extracts patterns and formats findings without subjective bias.
          </p>
          <div className="tool-list">
            {[
              "Sanction Validation Engine",
              "Payment Reconciliation Matrix",
              "Timeline Milestone Checker",
              "Vendor Concentration Graph",
              "Constituency Quota Auditor"
            ].map(x => (
              <div key={x}>
                <CheckCircle2 size={13} />
                <span>{x}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="ai-main">
          <div className="chat-label">ACTIVE AUDIT RECORD: #{workId}</div>
          <div className="ai-question">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ask(query)}
              placeholder="Inquire: 'Check for identical sanction duplicates' or 'Draft audit note'..."
            />
            <button onClick={() => ask(query)} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="spin" size={16} /> : <><Sparkles size={14} /> Send Query</>}
            </button>
          </div>

          <div className="quick-row">
            {[
              "Why is this project flagged?",
              "Review the financial payment trail.",
              "Analyze peer unit cost deviations.",
              "Draft Collector field audit directives."
            ].map(q => (
              <button key={q} onClick={() => ask(q)}>{q}</button>
            ))}
          </div>

          {response ? (
            <div className="ai-response">
              <AIInvestigationBrief text={response} />
            </div>
          ) : (
            <div className="ai-placeholder">
              <Bot size={32} strokeWidth={1.5} />
              <h3>Copilot Awaiting Instructions</h3>
              <p>Select a quick inquiry chip above or submit a direct query.</p>
            </div>
          )}

          <div className="ai-disclaimer">
            <ShieldAlert size={14} /> AI reasoning serves administrative screening purposes and constitutes internal decision guidance.
          </div>
        </div>
      </section>
    </div>
  );
}

function Panel({ eyebrow, title, icon, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        <div className="panel-icon-wrap">{icon}</div>
      </div>
      {children}
    </section>
  );
}

function ScoreBreakdownPanel({ breakdown, score }) {
  const items = Array.isArray(breakdown) ? breakdown : [];
  const maxPoints = Math.max(...items.map((item) => item.points || 0), 1);
  const totalScore = Math.round(Number(score || 0));

  return (
    <Panel
      eyebrow="SCORE COMPOSITION"
      title="Explainable Risk Score Breakdown"
      icon={<Activity size={18} />}
    >
      {items.length === 0 ? (
        <div className="compare-empty">
          <CircleHelp size={16} /> No point-contributing signals were triggered for this project.
        </div>
      ) : (
        <>
          <div className="breakdown-list">
            {items.map((item, i) => (
              <div className="breakdown-row" key={i}>
                <div className="breakdown-row-top">
                  <span className="breakdown-points">+{item.points}</span>
                  <span className="breakdown-dimension">{item.dimension}</span>
                </div>
                <div className="amount-bar-track">
                  <div
                    className="amount-bar-fill breakdown-fill"
                    style={{ width: `${Math.min((item.points / maxPoints) * 100, 100)}%` }}
                  />
                </div>
                <div className="breakdown-reason">{item.reason}</div>
              </div>
            ))}
          </div>
          <div className="breakdown-total">
            <span>Composite Score</span>
            <strong>{totalScore}/100</strong>
          </div>
        </>
      )}
      <div className="method-note">
        <ShieldAlert size={14} /> Every line above is one of the same signals behind the total score — nothing is added here beyond un-collapsing it.
      </div>
    </Panel>
  );
}

function Meta({ icon, label, value }) {
  return (
    <div className="meta">
      <div className="meta-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value || "—"}</strong>
      </div>
    </div>
  );
}

function Signal({ label, value }) {
  return (
    <div className="signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Stat({ label, value, tone = "", icon, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      className={`national-stat ${tone} ${clickable ? "national-stat-clickable" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
    >
      <div className="stat-head">
        <span>{label}</span>
        {icon && <span className="stat-icon-wrap">{icon}</span>}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function FinancialPanel({ data }) {
  const trail = data?.financial_trail;
  if (!trail) return <EmptyState text="Financial transactions record not found for this work identifier." />;
  return (
    <section className="panel detail-panel">
      <PanelTitle eyebrow="DISBURSEMENT AUDIT" title="Financial Allocation Lifecycle" icon={<WalletCards size={18} />} />
      <div className="metric-grid">
        <Signal label="Initial Recommendation" value={money(trail.recommended_amount)} />
        <Signal label="Administrative Sanction" value={money(trail.sanctioned_amount)} />
        <Signal label="Final Approved Outlay" value={money(trail.final_amount)} />
        <Signal label="Documented Expenditure" value={money(trail.total_expenditure)} />
        <Signal label="Disbursement Tranches" value={num(trail.transaction_count)} />
        <Signal label="Executing Agencies" value={num(trail.vendor_count)} />
        <Signal label="Unreconciled Claims" value={num(trail.pending_payment_count)} />
        <Signal label="Reconciliation State" value={trail.reconciliation || "NORMAL"} />
      </div>
      <div className="source-note">
        <Database size={13} /> Verified against state treasury and nodal agency disbursement certificates.
      </div>
    </section>
  );
}

function TimelinePanel({ data }) {
  const tl = data?.timeline;
  if (!tl) return <EmptyState text="Lifecycle chronological logs unavailable for this project." />;
  return (
    <section className="panel detail-panel">
      <PanelTitle eyebrow="EXECUTION AUDIT" title="Statutory Milestone Progression" icon={<Clock3 size={18} />} />
      <div className="timeline">
        <TimelineStep label="Recommended" date={tl.recommendation_date} />
        <TimelineStep
          label="Sanction Issued"
          date={tl.sanction_date}
          duration={tl.recommendation_to_sanction_days != null ? `${tl.recommendation_to_sanction_days} days elapsed` : null}
        />
        <TimelineStep
          label="Completion Report"
          date={tl.completion_date}
          duration={tl.sanction_to_completion_days != null ? `${tl.sanction_to_completion_days} days elapsed` : null}
        />
      </div>
      <div className="timeline-status">
        <CheckCircle2 size={16} /> 
        <span>{tl.status || "Milestone timeline within permissible scheme parameters."}</span>
      </div>
    </section>
  );
}

function TimelineStep({ label, date, duration }) {
  return (
    <div className="timeline-step">
      <div className="timeline-dot" />
      <div>
        <span>{label}</span>
        <strong>{date || "Pending Record"}</strong>
        {duration && <small>{duration}</small>}
      </div>
    </div>
  );
}

function ComparablePanel({ projects, targetAmount }) {
  return (
    <section className="panel detail-panel">
      <PanelTitle eyebrow="NEAREST NEIGHBOR COHORT" title="Empirical Cost Comparables" icon={<Users size={18} />} />
      <p className="panel-sub">Contextual works indexed via dense sentence embeddings. Scored on semantic description and jurisdiction.</p>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Work ID</th>
              <th>Sanction Scope</th>
              <th>Disbursed Outlay</th>
              <th>Net Disparity</th>
              <th>Relevance</th>
              <th>Constituency</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => {
              const amount = Number(p.Amount || 0);
              const diff = targetAmount - amount;
              return (
                <tr key={p["Work ID"]}>
                  <td><strong>#{p["Work ID"]}</strong></td>
                  <td className="description-cell">{p.Description || "—"}</td>
                  <td>{money(amount)}</td>
                  <td>
                    <b className={diff > 0 ? "diff-high" : "diff-low"}>{money(Math.abs(diff))}</b>
                    <small className="table-note">{diff >= 0 ? "Above peer average" : "Below peer average"}</small>
                  </td>
                  <td><span className="similarity">{Number(p["Similarity Score"] || 0).toFixed(1)}%</span></td>
                  <td>{p.Constituency || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MPPanel({ data }) {
  const mp = data?.mp_context;
  if (!mp) return <EmptyState text="Parliamentary constituency quota overview not accessible." />;
  return (
    <section className="panel detail-panel">
      <PanelTitle eyebrow="CONSTITUENCY ALLOCATION" title="Parliamentarian Quota Metrics" icon={<Users size={18} />} />
      <div className="metric-grid">
        <Signal label="Total Fund Credit" value={money(mp.allocated_amount)} />
        <Signal label="Disbursed Sum" value={money(mp.total_expenditure)} />
        <Signal label="Utilization Rate" value={pct(mp.utilization_percent)} />
        <Signal label="Completion Factor" value={pct(mp.completion_rate_percent)} />
        <Signal label="Registered Works" value={num(mp.recommended_works)} />
        <Signal label="Signed Off" value={num(mp.completed_works)} />
        <Signal label="Pending Invoices" value={num(mp.pending_payments)} />
        <Signal label="Uncleared Invoices" value={money(mp.unpaid_vendor_balance)} />
      </div>
      <div className="method-note">
        <CircleHelp size={14} /> Cumulative figures indicate macro constituency throughput and contextualize individual project velocity.
      </div>
    </section>
  );
}

function PanelTitle({ eyebrow, title, icon }) {
  return (
    <div className="panel-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
      </div>
      <div className="panel-icon-wrap">{icon}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <section className="panel empty-state">
      <AlertTriangle size={18} />
      <span>{text}</span>
    </section>
  );
}

function AICopilot({ response, query, setQuery, loading, ask, workId }) {
  return (
    <section className="ai-panel ai-full">
      <div className="ai-header">
        <div className="ai-icon"><Bot size={22} /></div>
        <div>
          <div className="eyebrow">COGNITIVE AUDIT CO-PILOT</div>
          <h3>Investigation Agent Interaction</h3>
          <p>Contextually bound to Dossier <strong>#{workId}</strong>.</p>
        </div>
      </div>
      <div className="ai-question-box">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ask(query)}
          placeholder="E.g.: 'Evaluate cost anomalies vs district average schedule rates'..."
          disabled={loading}
        />
        <button onClick={() => ask(query)} disabled={loading || !query.trim()}>
          {loading ? <><Loader2 size={16} className="spin" /> Thinking...</> : <>Run Query <ArrowRight size={15} /></>}
        </button>
      </div>
      <div className="quick-row">
        <button onClick={() => ask("Why is this project flagged?")}>Explain Risk Basis</button>
        <button onClick={() => ask("Compare this project with the contextual comparables.")}>Benchmark Outlay</button>
        <button onClick={() => ask("What should an investigator verify first?")}>Priority Directives</button>
        <button onClick={() => ask("Check the financial trail.")}>Audit Disbursals</button>
      </div>
      {response && (
        <div className="ai-response">
          <AIInvestigationBrief text={response} />
        </div>
      )}
      <div className="ai-disclaimer">
        <ShieldAlert size={14} /> AI output is an investigative synthesis for official review.
      </div>
    </section>
  );
}

/* =========================================================
   AI INVESTIGATION BRIEF — RICH CARD-BASED RENDERER
   ========================================================= */

const AI_SECTION_META = [
  { match: /full investigation|investigation summary|^project$/i, icon: FileSearch, accent: "blue", kicker: "CASE OVERVIEW" },
  { match: /risk indicator|evidence summary|risk assessment/i, icon: AlertTriangle, accent: "amber", kicker: "RISK SIGNALS" },
  { match: /financial/i, icon: WalletCards, accent: "emerald", kicker: "FINANCIAL TRAIL" },
  { match: /timeline|chronology/i, icon: Clock3, accent: "indigo", kicker: "LIFECYCLE" },
  { match: /comparable|comparative/i, icon: GitCompareArrows, accent: "violet", kicker: "PEER COMPARISON" },
  { match: /mp context/i, icon: Users, accent: "cyan", kicker: "CONSTITUENCY CONTEXT" },
  { match: /recommended verification|recommended next|verification plan|verification actions/i, icon: CheckCircle2, accent: "blue", kicker: "ACTION PLAN" },
  { match: /conclusion|interpretation/i, icon: ShieldAlert, accent: "slate", kicker: "ASSESSMENT" },
  { match: /context$/i, icon: CircleHelp, accent: "cyan", kicker: "CONTEXT" },
];

function getAISectionMeta(title) {
  return (
    AI_SECTION_META.find(m => m.match.test(title)) ||
    { icon: Sparkles, accent: "blue", kicker: "DETAILS" }
  );
}

function parseAILine(raw) {
  const line = raw.replace(/^[-•]\s*/, "").trim();

  // Bold key/value pair: **Label:** value  (also tolerates **Label**: value)
  const kv = line.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/) || line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
  if (kv) {
    return { type: "kv", label: kv[1].replace(/:$/, "").trim(), value: kv[2].trim() };
  }

  // Comparable project row: "Work ID 133875: amount ₹500,000, similarity 91.6"
  const comp = line.match(/^Work\s*ID\s*(\S+)\s*:?\s*amount\s*(₹[\d,]+(?:\.\d+)?)?,?\s*similarity\s*([\d.]+)/i);
  if (comp) {
    return { type: "comparable", workId: comp[1].replace(/[:,]$/, ""), amount: comp[2] || "—", similarity: comp[3] };
  }

  // Numbered list item
  const numbered = line.match(/^(\d+)\.\s*(.*)$/);
  if (numbered) {
    return { type: "numbered", index: numbered[1], text: numbered[2] };
  }

  return { type: "text", text: line };
}

// Renders "plain **bold** text" (single level of markdown bold, the only
// inline markdown the AI brief actually uses) as real <strong> spans
// instead of leaving literal asterisks in the UI.
function renderInlineMarkdown(text) {
  const parts = String(text ?? "").split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// A markdown table row looks like "| a | b | c |" (or "a | b | c" without
// the outer pipes). A separator row is "|---|:---:|---:|" right under the
// header. This detects both so a contiguous table block can be pulled out
// of the section's plain-text lines before they're rendered as bullets.
function isTableRowLine(line) {
  return typeof line === "string" && line.includes("|") && line.trim().length > 0;
}

function isTableSeparatorLine(line) {
  return (
    typeof line === "string" &&
    /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim())
  );
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

// Pulls contiguous "header row + separator row + data rows" blocks out of
// a section's items, returning the parsed tables plus everything else
// (so the remaining lines still go through the normal bullet/kv pipeline).
function extractMarkdownTables(items) {
  const tables = [];
  const rest = [];
  let i = 0;
  while (i < items.length) {
    const line = items[i];
    if (isTableRowLine(line) && isTableSeparatorLine(items[i + 1] || "")) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < items.length && isTableRowLine(items[i]) && !isTableSeparatorLine(items[i])) {
        rows.push(splitTableRow(items[i]));
        i++;
      }
      tables.push({ header, rows });
    } else {
      rest.push(line);
      i++;
    }
  }
  return { tables, rest };
}

function AIBriefSection({ section }) {
  const meta = getAISectionMeta(section.title);
  const Icon = meta.icon;
  const { tables, rest } = extractMarkdownTables(section.items);
  const parsed = rest.map(parseAILine);

  const kvItems = parsed.filter(p => p.type === "kv");
  const compItems = parsed.filter(p => p.type === "comparable");
  const textItems = parsed.filter(p => p.type === "text" || p.type === "numbered");

  const isRisk = /risk|evidence/i.test(section.title);
  const isAction = /recommended|verification/i.test(section.title);
  const isConclusion = /conclusion|interpretation/i.test(section.title);

  return (
    <div className={`ai-brief-section accent-${meta.accent}`}>
      <div className="ai-brief-section-header">
        <div className="ai-brief-section-icon"><Icon size={16} /></div>
        <div>
          <span className="ai-brief-section-kicker">{meta.kicker}</span>
          <h4>{section.title}</h4>
        </div>
      </div>

      {kvItems.length > 0 && (
        <div className="ai-brief-metric-grid">
          {kvItems.map((item, i) => (
            <div className="ai-brief-metric" key={i}>
              <span>{item.label}</span>
              <strong>{item.value ? renderInlineMarkdown(item.value) : "—"}</strong>
            </div>
          ))}
        </div>
      )}

      {compItems.length > 0 && (
        <div className="ai-brief-comp-table">
          <div className="ai-brief-comp-row ai-brief-comp-head">
            <span>Work ID</span><span>Amount</span><span>Similarity</span>
          </div>
          {compItems.map((item, i) => (
            <div className="ai-brief-comp-row" key={i}>
              <span className="ai-brief-comp-id">#{item.workId}</span>
              <span>{item.amount}</span>
              <span className="ai-brief-comp-sim">{item.similarity}%</span>
            </div>
          ))}
        </div>
      )}

      {tables.map((table, ti) => (
        <div className="ai-brief-table-wrapper" key={ti}>
          <table>
            <thead>
              <tr>
                {table.header.map((cell, ci) => (
                  <th key={ci}>{renderInlineMarkdown(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{renderInlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {textItems.length > 0 && (
        <div className={`ai-brief-list ${isConclusion ? "ai-brief-list-plain" : ""}`}>
          {textItems.map((item, i) => (
            <div className="ai-brief-list-item" key={i}>
              {!isConclusion && (
                <span className={`ai-brief-list-bullet ${isRisk ? "bullet-amber" : isAction ? "bullet-blue" : "bullet-slate"}`}>
                  {isRisk ? <AlertTriangle size={12} /> : isAction ? <CheckCircle2 size={12} /> : <ChevronRight size={12} />}
                </span>
              )}
              <span>{renderInlineMarkdown(item.text)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIInvestigationBrief({ text }) {
  const lines = String(text || "").split("\n");
  const sections = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "---") continue;
    if (/^#{1,3}\s/.test(line)) {
      current = { title: line.replace(/^#+\s*/, "").trim(), items: [] };
      sections.push(current);
    } else {
      if (!current) { current = { title: "Executive Investigation Brief", items: [] }; sections.push(current); }
      current.items.push(line);
    }
  }

  const riskSection = sections.find(s => /risk|full investigation|investigation summary/i.test(s.title));
  const riskLevelMatch = riskSection
    ? section_findRiskLevel(riskSection.items)
    : null;

  return (
    <div className="ai-brief">
      {riskLevelMatch && (
        <div className={`ai-brief-banner banner-${riskLevelMatch.toLowerCase()}`}>
          <ShieldAlert size={16} />
          <span>Investigation Priority: <strong>{riskLevelMatch}</strong></span>
        </div>
      )}
      {sections.map((s, i) => <AIBriefSection key={i} section={s} />)}
    </div>
  );
}

function section_findRiskLevel(items) {
  for (const raw of items) {
    const m = raw.match(/\*\*Risk:?\*\*\s*(?:is\s*)?(HIGH|MEDIUM|LOW)/i) ||
              raw.match(/\bRisk\b\s*:?\s*(HIGH|MEDIUM|LOW)\b/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export default App;