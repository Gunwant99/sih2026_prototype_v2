import { useState, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileCheck,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

function RiskBadge({ level }) {
  const norm = String(level || "low").toLowerCase();
  const theme = {
    high: { bg: "#fef2f2", text: "#b91c1c", dot: "#ef4444", border: "#fecaca" },
    medium: { bg: "#fffbeb", text: "#b45309", dot: "#f59e0b", border: "#fde68a" },
    low: { bg: "#ecfdf5", text: "#047857", dot: "#10b981", border: "#a7f3d0" },
  }[norm] || { bg: "#f3f4f6", text: "#4b5563", dot: "#9ca3af", border: "#e5e7eb" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: theme.bg,
        color: theme.text,
        border: `1px solid ${theme.border}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: theme.dot,
        }}
      />
      {(level || "LOW").toUpperCase()}
    </span>
  );
}

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setResult(null);
    setSaved(null);
    setError("");
  };

  const handleFile = (selectedFile) => {
    if (selectedFile) {
      reset();
      setFile(selectedFile);
    }
  };

  const analyze = async () => {
    if (!file) return;
    reset();
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/uploads/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed.");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const saveToDatabase = async () => {
    if (!result?.upload_id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/uploads/${result.upload_id}/commit`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed.");
      setSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (result?.upload_id) {
      await fetch(`${API_BASE}/uploads/${result.upload_id}`, { method: "DELETE" }).catch(() => {});
    }
    reset();
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* Page Header */}
      <section style={{ marginBottom: 28 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#4f46e5",
            textTransform: "uppercase",
          }}
        >
          Data Ingestion
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 8px 0", color: "#111827" }}>
          Analyze new field data
        </h2>
        <p style={{ margin: 0, color: "#4b5563", fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
          Upload a CSV export or a text-based PDF report to run risk scoring. No records will be committed to the database until explicitly verified and saved.
        </p>
      </section>

      {/* Upload Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          border: `2px dashed ${isDragOver ? "#4f46e5" : "#d1d5db"}`,
          backgroundColor: isDragOver ? "#f5f3ff" : "#fafafa",
          borderRadius: 12,
          padding: "32px 24px",
          textAlign: "center",
          transition: "all 0.2s ease",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "inline-flex", padding: 12, borderRadius: 50, background: "#eef2ff", color: "#4f46e5", marginBottom: 12 }}>
          {file ? <FileCheck size={28} /> : <UploadCloud size={28} />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", marginBottom: 4 }}>
          {file ? file.name : "Select or drag a file to analyze"}
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Supported formats: .csv, .pdf
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: "none" }}
          id="file-upload"
        />

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <label
            htmlFor="file-upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#374151",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Browse files
          </label>

          <button
            type="button"
            disabled={!file || analyzing}
            onClick={analyze}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              backgroundColor: !file || analyzing ? "#9ca3af" : "#4f46e5",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 500,
              cursor: !file || analyzing ? "not-allowed" : "pointer",
            }}
          >
            {analyzing ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />}
            {analyzing ? "Analyzing…" : "Run Risk Analysis"}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Summary Metric Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {[
              { label: "ROWS DETECTED", value: result.row_count, color: "#111827" },
              { label: "HIGH RISK", value: result.risk_summary?.high ?? 0, color: "#dc2626" },
              { label: "MEDIUM RISK", value: result.risk_summary?.medium ?? 0, color: "#d97706" },
              { label: "LOW RISK", value: result.risk_summary?.low ?? 0, color: "#059669" },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "16px 20px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.04em" }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: card.color, marginTop: 4 }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: "#ffffff",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#4b5563" }}>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Work ID</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Description</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>State</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => (
                    <tr
                      key={row.work_id ?? i}
                      style={{ borderBottom: i === result.preview.length - 1 ? "none" : "1px solid #f3f4f6" }}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 500, color: "#111827" }}>{row.work_id}</td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", maxWidth: 300 }}>{row.description}</td>
                      <td style={{ padding: "12px 16px", color: "#4b5563" }}>{row.state}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                        ₹{Number(row.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <RiskBadge level={row.risk_level} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.preview_truncated && (
              <div
                style={{
                  padding: "10px 16px",
                  background: "#f9fafb",
                  borderTop: "1px solid #e5e7eb",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Showing first {result.preview.length} of {result.row_count} rows.
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={saveToDatabase}
              disabled={saving || !!saved}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                backgroundColor: saved ? "#059669" : saving ? "#9ca3af" : "#111827",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                cursor: saving || saved ? "default" : "pointer",
              }}
            >
              {saving ? (
                <Loader2 size={16} className="spin" />
              ) : saved ? (
                <CheckCircle2 size={16} />
              ) : (
                <Database size={16} />
              )}
              {saved ? "Committed to DB" : saving ? "Saving…" : "Save to Database"}
            </button>

            <button
              type="button"
              onClick={discard}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                color: "#dc2626",
                fontSize: 14,
                fontWeight: 500,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              <Trash2 size={15} />
              Discard
            </button>
          </div>

          {/* Success Banner */}
          {saved && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={18} />
              Successfully saved {saved.rows_saved} rows to batch #{saved.batch_id}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}