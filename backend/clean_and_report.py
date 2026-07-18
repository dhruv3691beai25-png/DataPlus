import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import io
import math
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# ─── COLORS ───────────────────────────────────────────────
DARK_BG    = colors.HexColor("#060a14")
CARD_BG    = colors.HexColor("#0f1729")
CYAN       = colors.HexColor("#00f5d4")
PINK       = colors.HexColor("#f72585")
BLUE       = colors.HexColor("#3a86ff")
ORANGE     = colors.HexColor("#fb8500")
GREEN      = colors.HexColor("#06d6a0")
LIGHT_TEXT = colors.HexColor("#e2e8f0")
MUTED_TEXT = colors.HexColor("#64748b")
BORDER     = colors.HexColor("#1e293b")

MPL_COLORS = ["#00f5d4", "#f72585", "#3a86ff", "#fb8500", "#06d6a0", "#7209b7", "#4cc9f0", "#ef233c"]

# ─── AUTO CLEANING ────────────────────────────────────────

def auto_clean_dataframe(df):
    """Clean dataframe and return cleaned df + report of changes."""
    report = []
    df_clean = df.copy()
    rows_before = len(df_clean)

    # 1. Fill numeric missing values with median
    numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        missing = df_clean[col].isnull().sum()
        if missing > 0:
            median_val = df_clean[col].median()
            df_clean[col].fillna(median_val, inplace=True)
            report.append({
                "column": col,
                "action": "Filled missing values",
                "detail": f"{missing} nulls → median ({round(median_val, 2)})"
            })

    # 2. Fill categorical missing values with mode
    cat_cols = df_clean.select_dtypes(include=["object"]).columns
    for col in cat_cols:
        missing = df_clean[col].isnull().sum()
        if missing > 0:
            mode_val = df_clean[col].mode()[0] if len(df_clean[col].mode()) > 0 else "Unknown"
            df_clean[col].fillna(mode_val, inplace=True)
            report.append({
                "column": col,
                "action": "Filled missing values",
                "detail": f"{missing} nulls → mode ('{mode_val}')"
            })

    # 3. Fix outliers using IQR — cap to boundary
    for col in numeric_cols:
        Q1 = df_clean[col].quantile(0.25)
        Q3 = df_clean[col].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR
        outliers = df_clean[(df_clean[col] < lower) | (df_clean[col] > upper)]
        if len(outliers) > 0:
            df_clean[col] = df_clean[col].clip(lower=lower, upper=upper)
            report.append({
                "column": col,
                "action": "Capped outliers",
                "detail": f"{len(outliers)} outliers clamped to [{round(lower,2)}, {round(upper,2)}]"
            })

    # 4. Remove duplicate rows
    dupes = df_clean.duplicated().sum()
    if dupes > 0:
        df_clean.drop_duplicates(inplace=True)
        report.append({
            "column": "All columns",
            "action": "Removed duplicates",
            "detail": f"{dupes} duplicate rows removed"
        })

    # Summary
    rows_after = len(df_clean)
    total_missing_before = df.isnull().sum().sum()

    summary = {
        "rows_before": rows_before,
        "rows_after": rows_after,
        "missing_fixed": int(total_missing_before),
        "changes": len(report)
    }

    return df_clean, report, summary


# ─── CHART GENERATORS ─────────────────────────────────────

def _fig_to_image(fig, width_cm=16):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    img = Image(buf)
    img.drawWidth  = width_cm * cm
    img.drawHeight = width_cm * cm * 0.5
    return img


def make_bar_chart(df):
    numeric_cols = df.select_dtypes(include=[np.number]).columns[:6]
    if len(numeric_cols) == 0:
        return None
    means = [df[c].mean() for c in numeric_cols]
    fig, ax = plt.subplots(figsize=(10, 4), facecolor="#0f1729")
    ax.set_facecolor("#0f1729")
    bars = ax.bar(numeric_cols, means, color=MPL_COLORS[:len(numeric_cols)],
                  edgecolor='none', width=0.5)
    ax.set_title("Column Mean Values", color="#e2e8f0", fontsize=13, pad=12)
    ax.tick_params(colors="#64748b")
    ax.spines[['top','right','left','bottom']].set_color("#1e293b")
    ax.yaxis.label.set_color("#64748b")
    for bar, val in zip(bars, means):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + max(means)*0.01,
                f'{val:.1f}', ha='center', va='bottom', color='#e2e8f0', fontsize=9)
    fig.tight_layout()
    return _fig_to_image(fig)


def make_pie_chart(df):
    numeric_cols = list(df.select_dtypes(include=[np.number]).columns[:6])
    if len(numeric_cols) < 2:
        return None

    # Filter out columns with zero or NaN means (ax.pie fails on all-zero data)
    filtered = [(c, abs(df[c].mean())) for c in numeric_cols]
    filtered = [(c, m) for c, m in filtered if m and not np.isnan(m)]
    if len(filtered) < 2:
        return None

    labels, means = zip(*filtered)
    fig, ax = plt.subplots(figsize=(7, 4), facecolor="#0f1729")
    pie_result = ax.pie(
        means, labels=labels, autopct='%1.1f%%',
        colors=MPL_COLORS[:len(means)],
        textprops={'color': '#e2e8f0', 'fontsize': 9},
        wedgeprops={'edgecolor': '#0f1729', 'linewidth': 2}
    )
    # ax.pie returns (wedges, texts) or (wedges, texts, autotexts) depending on autopct
    autotexts = pie_result[2] if len(pie_result) > 2 else []
    for at in autotexts:
        at.set_color('#060a14')
        at.set_fontweight('bold')
    ax.set_title("Mean Value Distribution", color="#e2e8f0", fontsize=13, pad=12)
    fig.tight_layout()
    return _fig_to_image(fig, width_cm=14)


def make_missing_chart(df):
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    if len(missing) == 0:
        return None
    fig, ax = plt.subplots(figsize=(10, max(3, len(missing)*0.6)), facecolor="#0f1729")
    ax.set_facecolor("#0f1729")
    colors_list = ["#f72585" if v > 0 else "#06d6a0" for v in missing.values]
    bars = ax.barh(missing.index, missing.values, color=colors_list, edgecolor='none')
    ax.set_title("Missing Values per Column", color="#e2e8f0", fontsize=13, pad=12)
    ax.tick_params(colors="#64748b")
    ax.spines[['top','right','left','bottom']].set_color("#1e293b")
    for bar, val in zip(bars, missing.values):
        ax.text(val + 0.1, bar.get_y() + bar.get_height()/2,
                str(val), va='center', color='#e2e8f0', fontsize=9)
    fig.tight_layout()
    return _fig_to_image(fig)


def make_correlation_heatmap(df):
    numeric_df = df.select_dtypes(include=[np.number])
    if len(numeric_df.columns) < 2:
        return None
    corr = numeric_df.corr()
    fig, ax = plt.subplots(figsize=(8, 6), facecolor="#0f1729")
    ax.set_facecolor("#0f1729")
    im = ax.imshow(corr.values, cmap='RdYlGn', vmin=-1, vmax=1, aspect='auto')
    ax.set_xticks(range(len(corr.columns)))
    ax.set_yticks(range(len(corr.columns)))
    ax.set_xticklabels(corr.columns, rotation=45, ha='right', color='#94a3b8', fontsize=9)
    ax.set_yticklabels(corr.columns, color='#94a3b8', fontsize=9)
    for i in range(len(corr)):
        for j in range(len(corr.columns)):
            val = corr.values[i, j]
            ax.text(j, i, f'{val:.2f}', ha='center', va='center',
                    color='#060a14' if abs(val) > 0.5 else '#e2e8f0', fontsize=8, fontweight='bold')
    plt.colorbar(im, ax=ax).ax.tick_params(colors='#64748b')
    ax.set_title("Correlation Heatmap", color="#e2e8f0", fontsize=13, pad=12)
    fig.tight_layout()
    return _fig_to_image(fig, width_cm=14)


# ─── PDF BUILDER ──────────────────────────────────────────

def generate_pdf_report(df_original, df_cleaned, analysis, clean_report, clean_summary):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8*cm, rightMargin=1.8*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm
    )

    # Styles
    def style(name, **kwargs):
        base = {
            "fontName": "Helvetica",
            "fontSize": 11,
            "textColor": LIGHT_TEXT,
            "leading": 16,
        }
        base.update(kwargs)
        return ParagraphStyle(name, **base)

    S_TITLE   = style("title",   fontName="Helvetica-Bold", fontSize=26, textColor=CYAN,    alignment=TA_CENTER, spaceAfter=4)
    S_SUB     = style("sub",     fontSize=12, textColor=MUTED_TEXT, alignment=TA_CENTER, spaceAfter=2)
    S_H1      = style("h1",      fontName="Helvetica-Bold", fontSize=16, textColor=CYAN,    spaceBefore=14, spaceAfter=6)
    S_H2      = style("h2",      fontName="Helvetica-Bold", fontSize=13, textColor=LIGHT_TEXT, spaceBefore=10, spaceAfter=4)
    S_BODY    = style("body",    fontSize=10, textColor=MUTED_TEXT, leading=15)
    S_BADGE   = style("badge",   fontName="Helvetica-Bold", fontSize=10, textColor=GREEN)

    def hr():
        return HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8, spaceBefore=4)

    def section(title):
        return [Paragraph(title, S_H1), hr()]

    overview = analysis.get("overview", {})
    story = []

    # ── COVER ──────────────────────────────────────────────
    story.append(Spacer(1, 1.5*cm))
    story.append(Paragraph("DataPulse", S_TITLE))
    story.append(Paragraph("AI Data Analysis Report", S_SUB))
    story.append(Spacer(1, 0.3*cm))
    story.append(hr())
    story.append(Spacer(1, 0.5*cm))

    # ── OVERVIEW STATS ─────────────────────────────────────
    story += section("📊 Dataset Overview")

    stat_data = [
        ["Metric", "Value"],
        ["Total Rows", str(overview.get("rows", "—"))],
        ["Total Columns", str(overview.get("columns", "—"))],
        ["Missing Values", f"{overview.get('missing_percentage', 0)}%"],
        ["Quality Score", f"{analysis.get('quality_score', '—')}%"],
        ["Numeric Columns", str(len(df_original.select_dtypes(include=[np.number]).columns))],
        ["Categorical Columns", str(len(df_original.select_dtypes(include=['object']).columns))],
    ]

    t = Table(stat_data, colWidths=[8*cm, 8*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0),  CARD_BG),
        ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 10),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [DARK_BG, CARD_BG]),
        ("TEXTCOLOR",   (0,1), (0,-1),  MUTED_TEXT),
        ("TEXTCOLOR",   (1,1), (1,-1),  LIGHT_TEXT),
        ("FONTNAME",    (1,1), (1,-1),  "Helvetica-Bold"),
        ("GRID",        (0,0), (-1,-1), 0.5, BORDER),
        ("PADDING",     (0,0), (-1,-1), 8),
        ("ALIGN",       (1,0), (1,-1),  "CENTER"),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.6*cm))

    # ── COLUMN INFO ────────────────────────────────────────
    story += section("🗂 Column Information")
    col_data = [["Column", "Type", "Missing", "Unique"]]
    for col in df_original.columns:
        dtype = analysis.get("column_categories", {}).get(col, "—")
        missing = df_original[col].isnull().sum()
        unique = df_original[col].nunique()
        col_data.append([col, dtype, str(missing), str(unique)])

    t2 = Table(col_data, colWidths=[6*cm, 3.5*cm, 3*cm, 3.5*cm])
    t2.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0),  CARD_BG),
        ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [DARK_BG, CARD_BG]),
        ("TEXTCOLOR",   (0,1), (-1,-1), LIGHT_TEXT),
        ("GRID",        (0,0), (-1,-1), 0.5, BORDER),
        ("PADDING",     (0,0), (-1,-1), 7),
        ("ALIGN",       (1,0), (-1,-1), "CENTER"),
    ]))
    story.append(t2)
    story.append(Spacer(1, 0.6*cm))

    # ── STATISTICS ─────────────────────────────────────────
    if analysis.get("statistics"):
        story += section("📈 Numeric Statistics")
        stats = analysis["statistics"]
        stat_rows = [["Column", "Min", "Mean", "Max"]]
        for col, s in stats.items():
            stat_rows.append([col, str(round(s["min"],2)), str(round(s["mean"],2)), str(round(s["max"],2))])
        t3 = Table(stat_rows, colWidths=[6*cm, 3.5*cm, 3*cm, 3.5*cm])
        t3.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0),  CARD_BG),
            ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
            ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [DARK_BG, CARD_BG]),
            ("TEXTCOLOR",   (0,1), (0,-1),  LIGHT_TEXT),
            ("TEXTCOLOR",   (1,1), (-1,-1), GREEN),
            ("FONTNAME",    (1,1), (-1,-1), "Helvetica-Bold"),
            ("GRID",        (0,0), (-1,-1), 0.5, BORDER),
            ("PADDING",     (0,0), (-1,-1), 7),
            ("ALIGN",       (1,0), (-1,-1), "CENTER"),
        ]))
        story.append(t3)
        story.append(Spacer(1, 0.6*cm))

    # ── CHARTS ─────────────────────────────────────────────
    story += section("📊 Visual Analysis")

    bar = make_bar_chart(df_original)
    if bar:
        story.append(Paragraph("Bar Chart — Mean Values", S_H2))
        story.append(bar)
        story.append(Spacer(1, 0.4*cm))

    pie = make_pie_chart(df_original)
    if pie:
        story.append(Paragraph("Pie Chart — Distribution", S_H2))
        story.append(pie)
        story.append(Spacer(1, 0.4*cm))

    miss_chart = make_missing_chart(df_original)
    if miss_chart:
        story.append(Paragraph("Missing Values Chart", S_H2))
        story.append(miss_chart)
        story.append(Spacer(1, 0.4*cm))

    heatmap = make_correlation_heatmap(df_original)
    if heatmap:
        story.append(Paragraph("Correlation Heatmap", S_H2))
        story.append(heatmap)
        story.append(Spacer(1, 0.4*cm))

    # ── AI INSIGHTS ────────────────────────────────────────
    insights = analysis.get("insights", [])
    if insights:
        story += section("🤖 AI Insights")
        for i, insight in enumerate(insights):
            story.append(Paragraph(f"<b>{i+1}.</b> {insight}", S_BODY))
            story.append(Spacer(1, 0.2*cm))
        story.append(Spacer(1, 0.4*cm))

    # ── CLEANING REPORT ────────────────────────────────────
    story += section("🧹 Auto Cleaning Report")

    story.append(Paragraph(
        f"Rows before: <b>{clean_summary['rows_before']}</b> &nbsp;|&nbsp; "
        f"Rows after: <b>{clean_summary['rows_after']}</b> &nbsp;|&nbsp; "
        f"Missing fixed: <b>{clean_summary['missing_fixed']}</b> &nbsp;|&nbsp; "
        f"Total changes: <b>{clean_summary['changes']}</b>",
        style("summary", fontSize=10, textColor=CYAN)
    ))
    story.append(Spacer(1, 0.3*cm))

    if clean_report:
        clean_data = [["Column", "Action", "Detail"]]
        for item in clean_report:
            clean_data.append([item["column"], item["action"], item["detail"]])
        t4 = Table(clean_data, colWidths=[4.5*cm, 4*cm, 7.5*cm])
        t4.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0),  CARD_BG),
            ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
            ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [DARK_BG, CARD_BG]),
            ("TEXTCOLOR",   (0,1), (-1,-1), LIGHT_TEXT),
            ("GRID",        (0,0), (-1,-1), 0.5, BORDER),
            ("PADDING",     (0,0), (-1,-1), 6),
            ("VALIGN",      (0,0), (-1,-1), "TOP"),
        ]))
        story.append(t4)
    else:
        story.append(Paragraph("✅ No cleaning needed — dataset was already clean!", S_BADGE))

    story.append(Spacer(1, 0.6*cm))

    # ── OUTLIERS ───────────────────────────────────────────
    outliers = analysis.get("outliers", {})
    if any(v > 0 for v in outliers.values()):
        story += section("⚠ Outliers Detected")
        out_data = [["Column", "Outlier Count"]]
        for col, count in outliers.items():
            if count > 0:
                out_data.append([col, str(count)])
        t5 = Table(out_data, colWidths=[10*cm, 6*cm])
        t5.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0),  CARD_BG),
            ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
            ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [DARK_BG, CARD_BG]),
            ("TEXTCOLOR",   (0,1), (0,-1),  LIGHT_TEXT),
            ("TEXTCOLOR",   (1,1), (1,-1),  PINK),
            ("FONTNAME",    (1,1), (1,-1),  "Helvetica-Bold"),
            ("GRID",        (0,0), (-1,-1), 0.5, BORDER),
            ("PADDING",     (0,0), (-1,-1), 7),
            ("ALIGN",       (1,0), (1,-1),  "CENTER"),
        ]))
        story.append(t5)

    # Build
    doc.build(story)
    buf.seek(0)
    return buf.read()