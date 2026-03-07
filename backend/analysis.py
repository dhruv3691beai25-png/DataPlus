import numpy as np
import pandas as pd
import os
from dotenv import load_dotenv
from groq import Groq
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

# ---------- AI INSIGHTS ----------

def generate_ai_insights(df):
    try:
        summary = df.describe().to_string()
        prompt = f"""
        Analyze this dataset summary and give 3 short insights.

        {summary}
        """
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.choices[0].message.content
        insights = [line.strip() for line in text.split("\n") if line.strip()]
        return insights[:3]
    except Exception as e:
        print("=== GROQ ERROR DETAILS:", type(e).__name__, str(e))
        return [
            "AI insights unavailable.",
            "Dataset processed successfully.",
            "Groq API failed."
        ]


# ---------- CHAT WITH DATA ----------

def chat_with_data(message: str, dataset_summary: str, chat_history: list):
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        system_prompt = f"""You are a helpful data analyst assistant. 
The user has uploaded a CSV dataset. Here is the dataset summary:

{dataset_summary}

Answer the user's questions about this data clearly and concisely.
If they ask for insights or patterns, analyze the summary and provide useful observations.
Keep answers short, helpful and data-focused."""

        messages = [{"role": "system", "content": system_prompt}]

        # Include chat history for context
        for entry in chat_history[-6:]:  # last 6 messages for context
            messages.append({"role": entry["role"], "content": entry["content"]})

        messages.append({"role": "user", "content": message})

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=500
        )

        return response.choices[0].message.content

    except Exception as e:
        print("=== CHAT ERROR:", type(e).__name__, str(e))
        return "Sorry, I couldn't process your question. Please try again."


# ---------- MAIN DATASET ANALYSIS ----------

def analyze_dataset(df):
    rows, cols = df.shape
    missing_percent = (df.isnull().sum().sum() / (rows * cols)) * 100

    overview = {
        "rows": rows,
        "columns": cols,
        "column_names": list(df.columns),
        "column_types": df.dtypes.astype(str).to_dict(),
        "missing_percentage": round(missing_percent, 2)
    }

    column_categories = classify_columns(df)
    numeric_cols = df.select_dtypes(include=['int64', 'float64'])

    statistics = {}
    for col in numeric_cols.columns:
        statistics[col] = {
            "min": float(numeric_cols[col].min()),
            "mean": float(numeric_cols[col].mean()),
            "max": float(numeric_cols[col].max())
        }

    missing_values = {}
    for col in df.columns:
        missing_values[col] = int(df[col].isnull().sum())

    correlation = {
        col: {k: round(float(v), 4) for k, v in vals.items()}
        for col, vals in df.corr(numeric_only=True).to_dict().items()
    }

    outliers = detect_outliers(df)
    quality_score = data_quality_score(df)
    insights = generate_ai_insights(df)

    import math

    def clean(val):
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val

    def clean_dict(d):
        if isinstance(d, dict):
            return {k: clean_dict(v) for k, v in d.items()}
        elif isinstance(d, list):
            return [clean_dict(i) for i in d]
        else:
            return clean(d)

    preview_clean = [
        {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in row.items()}
        for row in df.head(10).to_dict(orient="records")
    ]

    return clean_dict({
        "overview": overview,
        "column_categories": column_categories,
        "statistics": statistics,
        "insights": insights,
        "preview": preview_clean,
        "missing_values": missing_values,
        "correlation": correlation,
        "outliers": outliers,
        "quality_score": quality_score
    })


# ---------- OUTLIER DETECTION ----------

def detect_outliers(df):
    numeric_cols = df.select_dtypes(include=[np.number])
    outlier_report = {}
    for col in numeric_cols:
        Q1 = numeric_cols[col].quantile(0.25)
        Q3 = numeric_cols[col].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR
        outliers = numeric_cols[(numeric_cols[col] < lower) | (numeric_cols[col] > upper)][col]
        outlier_report[col] = len(outliers)
    return outlier_report


# ---------- DATA QUALITY SCORE ----------

def data_quality_score(df):
    rows, cols = df.shape
    total_cells = rows * cols
    missing_cells = df.isnull().sum().sum()
    missing_score = (1 - (missing_cells / total_cells)) * 100
    numeric_cols = df.select_dtypes(include=['number'])
    outlier_count = 0
    for col in numeric_cols:
        Q1 = numeric_cols[col].quantile(0.25)
        Q3 = numeric_cols[col].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR
        outliers = numeric_cols[(numeric_cols[col] < lower) | (numeric_cols[col] > upper)][col]
        outlier_count += len(outliers)
    if rows == 0:
        outlier_score = 100
    else:
        outlier_score = max(0, 100 - (outlier_count / rows * 100))
    final_score = (missing_score * 0.7) + (outlier_score * 0.3)
    return round(final_score, 2)


# ---------- COLUMN CLASSIFICATION ----------

def classify_columns(df):
    column_types = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            column_types[col] = "Numerical"
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            column_types[col] = "Datetime"
        else:
            column_types[col] = "Categorical"
    return column_types