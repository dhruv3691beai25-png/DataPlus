import { useDropzone } from "react-dropzone";
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Bar, Pie, Line, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const COLORS = ["#00f5d4", "#f72585", "#7209b7", "#3a86ff", "#fb8500", "#06d6a0", "#ef233c", "#4cc9f0"];

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "👋 Hi! Upload a CSV and I'll help you explore your data!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [cleanLoading, setCleanLoading] = useState(false);
  const [cleanReport, setCleanReport] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatOpen]);

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    try {
      const res = await axios.post("http://127.0.0.1:8000/upload-dataset", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setData(res.data);
      setActiveTab("overview");
      setChatMessages([{ role: "assistant", content: `✅ Dataset loaded! ${res.data.overview.rows} rows × ${res.data.overview.columns} columns. Ask me anything!` }]);
    } catch (error) {
      alert("Upload failed: " + error.message);
    }
    setLoading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "text/csv": [".csv"] } });

  const buildDatasetSummary = () => {
    if (!data) return "No dataset uploaded yet.";
    let summary = `Rows: ${data.overview.rows}, Columns: ${data.overview.columns}\nMissing: ${data.overview.missing_percentage}%\nColumns: ${data.overview.column_names.join(", ")}\n\n`;
    if (data.statistics) {
      summary += "Stats:\n";
      for (const [col, s] of Object.entries(data.statistics)) {
        summary += `- ${col}: min=${s.min}, mean=${s.mean.toFixed(2)}, max=${s.max}\n`;
      }
    }
    if (data.insights) summary += "\nInsights:\n" + data.insights.map((ins, i) => `${i + 1}. ${ins}`).join("\n");
    return summary;
  };

  const handleClean = async () => {
    setCleanLoading(true);
    try {
      const res = await axios.post("http://127.0.0.1:8000/clean-dataset");
      if (res.data.error) { alert(res.data.error); return; }
      setData(res.data.analysis);
      setCleanReport(res.data);
      setActiveTab("overview");
      setChatMessages(prev => [...prev, { role: "assistant", content: `🧹 Data cleaned! Fixed ${res.data.clean_summary.missing_fixed} missing values and made ${res.data.clean_summary.changes} total changes.` }]);
    } catch (err) {
      alert("Clean failed: " + err.message);
    }
    setCleanLoading(false);
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await axios.get("http://127.0.0.1:8000/export-pdf", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "datapulse_report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
    setPdfLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await axios.post("http://127.0.0.1:8000/chat", {
        message: chatInput,
        dataset_summary: buildDatasetSummary(),
        chat_history: chatMessages.slice(-6)
      });
      setChatMessages([...updated, { role: "assistant", content: res.data.reply }]);
    } catch {
      setChatMessages([...updated, { role: "assistant", content: "❌ Server error. Is backend running?" }]);
    }
    setChatLoading(false);
  };

  const downloadChat = () => {
    const text = chatMessages.map(m => `${m.role === "user" ? "You" : "AI"}: ${m.content}`).join("\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "chat_history.txt";
    a.click();
  };

  const numericKeys = data ? Object.keys(data.statistics || {}) : [];

  const getPieData = () => ({
    labels: numericKeys,
    datasets: [{
      data: numericKeys.map(k => Math.abs(data.statistics[k].mean)),
      backgroundColor: COLORS,
      borderColor: "#0a0e1a",
      borderWidth: 2
    }]
  });

  const getLineData = () => ({
    labels: numericKeys,
    datasets: [
      { label: "Min", data: numericKeys.map(k => data.statistics[k].min), borderColor: "#00f5d4", backgroundColor: "rgba(0,245,212,0.08)", tension: 0.4, fill: true, pointBackgroundColor: "#00f5d4", pointRadius: 5 },
      { label: "Mean", data: numericKeys.map(k => data.statistics[k].mean), borderColor: "#f72585", backgroundColor: "rgba(247,37,133,0.08)", tension: 0.4, fill: true, pointBackgroundColor: "#f72585", pointRadius: 5 },
      { label: "Max", data: numericKeys.map(k => data.statistics[k].max), borderColor: "#3a86ff", backgroundColor: "rgba(58,134,255,0.08)", tension: 0.4, fill: true, pointBackgroundColor: "#3a86ff", pointRadius: 5 }
    ]
  });

  const getScatterData = () => {
    const [colX, colY] = numericKeys;
    if (!colX || !colY) return null;
    return {
      datasets: [{
        label: `${colX} vs ${colY}`,
        data: (data.preview || []).map(row => ({ x: parseFloat(row[colX]) || 0, y: parseFloat(row[colY]) || 0 })),
        backgroundColor: "rgba(0,245,212,0.6)",
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    };
  };

  const chartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#cbd5e1", font: { family: "'DM Sans', sans-serif" } } },
      tooltip: { backgroundColor: "#1e293b", titleColor: "#00f5d4", bodyColor: "#cbd5e1" }
    },
    scales: {
      x: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" } },
      y: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" } }
    }
  });

  const TABS = ["overview", "charts", "preview", "insights"];

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(0,245,212,0.3)} 50%{box-shadow:0 0 40px rgba(0,245,212,0.7)} }
        .tab-btn:hover { background: rgba(0,245,212,0.1) !important; color: #00f5d4 !important; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.4) !important; }
        .upload-zone:hover { border-color: #00f5d4 !important; background: rgba(0,245,212,0.05) !important; }
        .chip:hover { background: rgba(0,245,212,0.15) !important; color: #00f5d4 !important; }
        .chat-bubble-btn:hover { transform: scale(1.1); }
        .action-btn:hover { transform: translateY(-2px); filter: brightness(1.15); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
        tr:hover td { background: rgba(0,245,212,0.03) !important; }
      `}</style>

      <div style={styles.bgGrid} />

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", position: "relative", zIndex: 1 }}>
        <header style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>⬡</span>
            <span style={styles.logoText}>DataPulse</span>
          </div>
          <div style={styles.headerBadge}>✦ AI-Powered Analytics</div>
        </header>
      </div>

      {/* HERO */}
      <div style={styles.hero}>
        <div style={styles.heroTag}>✦ Instant CSV Intelligence</div>
        <h1 style={styles.heroTitle}>
          Transform Raw Data<br />
          <span style={styles.heroAccent}>Into Sharp Insights</span>
        </h1>
        <p style={styles.heroSub}>Upload any CSV and get AI-generated analysis, charts, and insights in seconds.</p>

        <div {...getRootProps()} className="upload-zone" style={{ ...styles.uploadZone, ...(isDragActive ? styles.uploadZoneActive : {}) }}>
          <input {...getInputProps()} />
          <div style={styles.uploadIcon}>📂</div>
          <div style={styles.uploadText}>{isDragActive ? "Drop it here!" : "Drag & Drop your CSV"}</div>
          <div style={styles.uploadSub}>or click to browse files</div>
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div style={styles.loaderWrap}>
          <div style={styles.loaderRing} />
          <p style={styles.loaderText}>Analyzing your dataset...</p>
        </div>
      )}

      {/* DASHBOARD */}
      {data && (
        <div style={styles.dashboard}>

          {/* STAT CARDS */}
          <div style={styles.statGrid}>
            {[
              { label: "Total Rows", value: data.overview.rows.toLocaleString(), icon: "⬛", color: "#00f5d4" },
              { label: "Columns", value: data.overview.columns, icon: "⬜", color: "#f72585" },
              { label: "Missing %", value: `${data.overview.missing_percentage}%`, icon: "◈", color: "#fb8500" },
              { label: "Quality Score", value: `${data.quality_score}%`, icon: "◉", color: "#06d6a0" }
            ].map((s, i) => (
              <div key={i} className="card-hover" style={{ ...styles.statCard, transition: "all 0.3s" }}>
                <div style={{ ...styles.statIcon, color: s.color }}>{s.icon}</div>
                <div style={{ ...styles.statValue, color: s.color }}>{s.value}</div>
                <div style={styles.statLabel}>{s.label}</div>
                <div style={{ ...styles.statLine, background: s.color }} />
              </div>
            ))}
          </div>

          {/* ACTION BUTTONS */}
          <div style={styles.actionRow}>
            <button
              className="action-btn"
              style={{ ...styles.actionBtn, background: cleanLoading ? "#1e293b" : "linear-gradient(135deg,#06d6a0,#0891b2)" }}
              onClick={handleClean}
              disabled={cleanLoading}
            >
              {cleanLoading ? "🧹 Cleaning..." : "🧹 Auto Clean Data"}
            </button>
            <button
              className="action-btn"
              style={{ ...styles.actionBtn, background: pdfLoading ? "#1e293b" : "linear-gradient(135deg,#f72585,#7209b7)" }}
              onClick={handleExportPDF}
              disabled={pdfLoading}
            >
              {pdfLoading ? "📄 Generating..." : "📄 Export PDF Report"}
            </button>
          </div>

          {/* CLEAN REPORT BANNER */}
          {cleanReport && (
            <div style={styles.cleanBanner}>
              <span style={{ color: "#06d6a0", fontWeight: 700 }}>✅ Data Cleaned!</span>
              &nbsp;&nbsp;
              {cleanReport.clean_summary.missing_fixed} missing values fixed &nbsp;·&nbsp;
              {cleanReport.clean_summary.changes} changes made &nbsp;·&nbsp;
              {cleanReport.clean_summary.rows_before - cleanReport.clean_summary.rows_after} duplicate rows removed
            </div>
          )}

          {/* TABS */}
          <div style={styles.tabBar}>
            {TABS.map(tab => (
              <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)}
                style={{ ...styles.tabBtn, ...(activeTab === tab ? styles.tabActive : {}) }}>
                {tab === "overview" ? "📋 Overview" : tab === "charts" ? "📊 Charts" : tab === "preview" ? "🔍 Preview" : "🤖 Insights"}
              </button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div style={styles.tabContent}>
              <div style={styles.twoCol}>
                <div style={styles.panel}>
                  <h3 style={styles.panelTitle}>Column Types</h3>
                  <div style={styles.colList}>
                    {Object.entries(data.column_categories).map(([col, type]) => (
                      <div key={col} style={styles.colRow}>
                        <span style={styles.colName}>{col}</span>
                        <span style={{ ...styles.colBadge, background: type === "Numerical" ? "rgba(0,245,212,0.12)" : type === "Datetime" ? "rgba(76,201,240,0.12)" : "rgba(251,133,0,0.12)", color: type === "Numerical" ? "#00f5d4" : type === "Datetime" ? "#4cc9f0" : "#fb8500", border: `1px solid ${type === "Numerical" ? "rgba(0,245,212,0.3)" : type === "Datetime" ? "rgba(76,201,240,0.3)" : "rgba(251,133,0,0.3)"}` }}>
                          {type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={styles.panel}>
                  <h3 style={styles.panelTitle}>Missing Values</h3>
                  <div style={styles.colList}>
                    {Object.entries(data.missing_values).map(([col, count]) => (
                      <div key={col} style={styles.colRow}>
                        <span style={styles.colName}>{col}</span>
                        <div style={styles.missingBar}>
                          <div style={{ ...styles.missingFill, width: `${Math.min((count / data.overview.rows) * 100, 100)}%`, background: count === 0 ? "#06d6a0" : "#f72585" }} />
                        </div>
                        <span style={{ color: count === 0 ? "#06d6a0" : "#f72585", fontSize: "12px", minWidth: "24px", textAlign: "right" }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {data.outliers && (
                <div style={{ ...styles.panel, marginTop: "24px" }}>
                  <h3 style={styles.panelTitle}>Outliers Detected</h3>
                  <div style={styles.outlierGrid}>
                    {Object.entries(data.outliers).map(([col, count]) => (
                      <div key={col} style={styles.outlierCard}>
                        <div style={styles.outlierCount}>{count}</div>
                        <div style={styles.outlierCol}>{col}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHARTS TAB */}
          {activeTab === "charts" && (
            <div style={styles.tabContent}>
              <div style={styles.chartGrid}>
                <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>📊 Bar — Min / Mean / Max</h3>
                  <div style={{ height: "300px" }}>
                    {numericKeys.length > 0 && (
                      <Bar data={{
                        labels: numericKeys, datasets: [
                          { label: "Min", data: numericKeys.map(k => data.statistics[k].min), backgroundColor: "#3a86ff" },
                          { label: "Mean", data: numericKeys.map(k => data.statistics[k].mean), backgroundColor: "#00f5d4" },
                          { label: "Max", data: numericKeys.map(k => data.statistics[k].max), backgroundColor: "#f72585" }
                        ]
                      }} options={chartOptions()} />
                    )}
                  </div>
                </div>

                <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>🥧 Pie — Mean Distribution</h3>
                  <div style={{ height: "300px" }}>
                    {numericKeys.length > 0 && (
                      <Pie data={getPieData()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#cbd5e1" } }, tooltip: { backgroundColor: "#1e293b", titleColor: "#00f5d4", bodyColor: "#cbd5e1" } } }} />
                    )}
                  </div>
                </div>

                <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>📈 Line — Trends Across Columns</h3>
                  <div style={{ height: "300px" }}>
                    {numericKeys.length > 0 && <Line data={getLineData()} options={chartOptions()} />}
                  </div>
                </div>

                <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>✦ Scatter — {numericKeys[0]} vs {numericKeys[1]}</h3>
                  <div style={{ height: "300px" }}>
                    {numericKeys.length >= 2
                      ? <Scatter data={getScatterData()} options={chartOptions()} />
                      : <div style={styles.noData}>Need at least 2 numeric columns</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PREVIEW TAB */}
          {activeTab === "preview" && data?.preview && (
            <div style={styles.tabContent}>
              <div style={styles.panel}>
                <h3 style={styles.panelTitle}>Dataset Preview — First 10 Rows</h3>
                <div style={{ overflowX: "auto", marginTop: "16px" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>{Object.keys(data.preview[0]).map(col => <th key={col} style={styles.th}>{col}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.preview.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                          {Object.values(row).map((val, j) => <td key={j} style={styles.td}>{String(val)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* INSIGHTS TAB */}
          {activeTab === "insights" && (
            <div style={styles.tabContent}>
              <div style={styles.insightGrid}>
                {(data.insights || []).map((insight, i) => (
                  <div key={i} style={styles.insightCard}>
                    <div style={styles.insightNum}>0{i + 1}</div>
                    <p style={styles.insightText}>{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* FLOATING CHAT */}
      <div className="chat-bubble-btn" style={styles.chatBubble} onClick={() => setChatOpen(!chatOpen)}>
        {chatOpen ? "✕" : "💬"}
      </div>

      {chatOpen && (
        <div style={styles.chatWindow}>
          <div style={styles.chatHeader}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px", fontFamily: "'Syne', sans-serif" }}>🤖 Data Assistant</div>
              <div style={{ fontSize: "11px", opacity: 0.5, marginTop: "2px" }}>Powered by Groq AI</div>
            </div>
            <button onClick={downloadChat} style={styles.dlBtn}>⬇ Save</button>
          </div>

          <div style={styles.chatBody}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={msg.role === "user" ? styles.userMsg : styles.aiMsg}>{msg.content}</div>
            ))}
            {chatLoading && (
              <div style={styles.aiMsg}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{ display: "inline-block", marginRight: "3px", animation: `pulse 1s ${d}s infinite`, fontSize: "10px" }}>●</span>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {data && chatMessages.length <= 1 && (
            <div style={styles.chips}>
              {["What are the key patterns?", "Which column has most missing data?", "Give me 3 insights"].map((q, i) => (
                <button key={i} className="chip" onClick={() => setChatInput(q)} style={styles.chip}>{q}</button>
              ))}
            </div>
          )}

          <div style={styles.chatFooter}>
            <textarea style={styles.chatInput} placeholder={data ? "Ask about your data..." : "Upload a CSV first..."} value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              rows={1} />
            <button style={{ ...styles.sendBtn, opacity: chatLoading || !chatInput.trim() ? 0.4 : 1 }} onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { background: "#060a14", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", position: "relative", overflowX: "hidden" },
  bgGrid: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(0,245,212,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.03) 1px,transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none", zIndex: 0 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "20px 48px" },
  logo: { display: "flex", alignItems: "center", gap: "10px" },
  logoIcon: { fontSize: "24px", color: "#00f5d4" },
  logoText: { fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" },
  headerBadge: { background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.2)", color: "#00f5d4", padding: "6px 16px", borderRadius: "20px", fontSize: "12px" },
  hero: { position: "relative", zIndex: 1, textAlign: "center", padding: "60px 48px 50px" },
  heroTag: { display: "inline-block", color: "#00f5d4", fontSize: "12px", letterSpacing: "3px", marginBottom: "20px", opacity: 0.8 },
  heroTitle: { fontFamily: "'Syne', sans-serif", fontSize: "clamp(36px,4vw,58px)", fontWeight: 800, lineHeight: 1.1, marginBottom: "16px", letterSpacing: "-2px" },
  heroAccent: { background: "linear-gradient(90deg,#00f5d4,#f72585)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  heroSub: { color: "#64748b", fontSize: "16px", maxWidth: "440px", margin: "0 auto 36px", lineHeight: 1.6 },
  uploadZone: { maxWidth: "520px", margin: "0 auto", border: "2px dashed rgba(0,245,212,0.25)", borderRadius: "16px", padding: "36px 32px", cursor: "pointer", transition: "all 0.3s", background: "rgba(0,245,212,0.02)" },
  uploadZoneActive: { borderColor: "#00f5d4", background: "rgba(0,245,212,0.08)" },
  uploadIcon: { fontSize: "40px", marginBottom: "12px", display: "block", animation: "float 3s ease-in-out infinite" },
  uploadText: { fontFamily: "'Syne', sans-serif", fontSize: "18px", fontWeight: 700, marginBottom: "6px" },
  uploadSub: { color: "#475569", fontSize: "13px" },
  loaderWrap: { display: "flex", flexDirection: "column", alignItems: "center", padding: "60px", gap: "20px" },
  loaderRing: { width: "52px", height: "52px", border: "3px solid #1e293b", borderTop: "3px solid #00f5d4", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loaderText: { color: "#64748b", fontSize: "13px", letterSpacing: "1px" },
  dashboard: { position: "relative", zIndex: 1, width: "100%", padding: "40px 5% 80px", animation: "slideUp 0.5s ease" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "24px", marginBottom: "36px" },
  statCard: { background: "rgba(10,14,26,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px", padding: "36px 32px", position: "relative", overflow: "hidden", minHeight: "160px" },
  statIcon: { fontSize: "26px", marginBottom: "18px" },
  statValue: { fontFamily: "'Syne', sans-serif", fontSize: "42px", fontWeight: 800, lineHeight: 1 },
  statLabel: { color: "#475569", fontSize: "13px", marginTop: "10px", letterSpacing: "0.5px" },
  statLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: "3px", opacity: 0.6 },
  tabBar: { display: "flex", gap: "6px", marginBottom: "28px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0" },
  tabBtn: { background: "transparent", border: "none", color: "#475569", padding: "14px 28px", fontSize: "14px", fontWeight: 500, cursor: "pointer", borderRadius: "8px 8px 0 0", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", borderBottom: "2px solid transparent" },
  tabActive: { color: "#00f5d4", borderBottom: "2px solid #00f5d4", background: "rgba(0,245,212,0.05)" },
  tabContent: { animation: "slideUp 0.3s ease" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" },
  panel: { background: "rgba(10,14,26,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px", padding: "36px" },
  panelTitle: { fontFamily: "'Syne', sans-serif", fontSize: "17px", fontWeight: 700, marginBottom: "24px", color: "#e2e8f0" },
  colList: { display: "flex", flexDirection: "column", gap: "14px" },
  colRow: { display: "flex", alignItems: "center", gap: "14px" },
  colName: { fontSize: "14px", color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  colBadge: { padding: "5px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" },
  missingBar: { flex: 1, height: "7px", background: "#1e293b", borderRadius: "4px", overflow: "hidden" },
  missingFill: { height: "100%", borderRadius: "4px", transition: "width 0.8s ease" },
  outlierGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "16px", marginTop: "16px" },
  outlierCard: { background: "rgba(247,37,133,0.05)", border: "1px solid rgba(247,37,133,0.15)", borderRadius: "14px", padding: "24px", textAlign: "center" },
  outlierCount: { fontFamily: "'Syne', sans-serif", fontSize: "38px", fontWeight: 800, color: "#f72585" },
  outlierCol: { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  chartGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "24px" },
  chartCard: { background: "rgba(10,14,26,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px", padding: "28px" },
  chartTitle: { fontFamily: "'Syne', sans-serif", fontSize: "13px", fontWeight: 700, marginBottom: "16px", color: "#64748b", letterSpacing: "0.5px" },
  noData: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#334155", fontSize: "13px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(0,245,212,0.15)", color: "#00f5d4", fontWeight: 600, whiteSpace: "nowrap", fontFamily: "'Syne', sans-serif", fontSize: "12px", letterSpacing: "0.5px" },
  td: { padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#94a3b8", transition: "background 0.2s" },
  insightGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "20px" },
  insightCard: { background: "rgba(10,14,26,0.9)", border: "1px solid rgba(0,245,212,0.12)", borderRadius: "18px", padding: "36px", position: "relative", overflow: "hidden", minHeight: "140px" },
  insightNum: { fontFamily: "'Syne', sans-serif", fontSize: "52px", fontWeight: 800, color: "rgba(0,245,212,0.07)", position: "absolute", top: "12px", right: "18px", lineHeight: 1 },
  insightText: { color: "#cbd5e1", lineHeight: 1.9, fontSize: "16px", position: "relative", zIndex: 1 },
  chatBubble: { position: "fixed", bottom: "30px", right: "30px", width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg,#00f5d4,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", cursor: "pointer", boxShadow: "0 8px 30px rgba(0,245,212,0.35)", zIndex: 1000, animation: "glow 3s ease-in-out infinite", transition: "transform 0.2s" },
  chatWindow: { position: "fixed", bottom: "100px", right: "30px", width: "355px", height: "490px", background: "#0a0e1a", border: "1px solid rgba(0,245,212,0.12)", borderRadius: "20px", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.7)", zIndex: 999, animation: "slideUp 0.3s ease", overflow: "hidden" },
  chatHeader: { background: "linear-gradient(135deg,rgba(0,245,212,0.08),rgba(8,145,178,0.08))", borderBottom: "1px solid rgba(0,245,212,0.08)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  chatBody: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  userMsg: { alignSelf: "flex-end", background: "linear-gradient(135deg,#00f5d4,#0891b2)", color: "#060a14", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", maxWidth: "85%", fontSize: "13px", lineHeight: 1.5, fontWeight: 500 },
  aiMsg: { alignSelf: "flex-start", background: "#1e293b", color: "#cbd5e1", padding: "10px 14px", borderRadius: "16px 16px 16px 4px", maxWidth: "85%", fontSize: "13px", lineHeight: 1.5 },
  chips: { padding: "8px 14px", display: "flex", flexDirection: "column", gap: "5px" },
  chip: { background: "rgba(0,245,212,0.04)", border: "1px solid rgba(0,245,212,0.12)", color: "#64748b", padding: "7px 12px", borderRadius: "8px", fontSize: "12px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif" },
  chatFooter: { padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px", alignItems: "flex-end" },
  chatInput: { flex: 1, background: "#1e293b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", color: "white", padding: "10px 12px", fontSize: "13px", resize: "none", outline: "none", fontFamily: "'DM Sans', sans-serif" },
  sendBtn: { background: "linear-gradient(135deg,#00f5d4,#0891b2)", border: "none", borderRadius: "10px", color: "#060a14", width: "38px", height: "38px", cursor: "pointer", fontSize: "16px", fontWeight: 700, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center" },
  actionRow: { display: "flex", gap: "14px", marginBottom: "24px" },
  actionBtn: { border: "none", borderRadius: "12px", color: "white", padding: "13px 28px", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", letterSpacing: "0.3px" },
  cleanBanner: { background: "rgba(6,214,160,0.08)", border: "1px solid rgba(6,214,160,0.25)", borderRadius: "12px", padding: "14px 20px", marginBottom: "20px", fontSize: "13px", color: "#94a3b8" },
  dlBtn: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#64748b", padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }
};

export default App;