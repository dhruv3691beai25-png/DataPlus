from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import pandas as pd
import io
from analysis import analyze_dataset, chat_with_data
from clean_and_report import auto_clean_dataframe, generate_pdf_report

app = FastAPI(title="DataPulse - AI Data Insight Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_last_df_store = {}


@app.get("/")
def home():
    return {"message": "DataPulse API is running"}


@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        return {"error": "Only CSV files allowed"}
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        _last_df_store["df"] = df
        _last_df_store.pop("df_cleaned", None)
        result = analyze_dataset(df)
        return result
    except Exception as e:
        return {"error": str(e)}


@app.post("/clean-dataset")
async def clean_dataset():
    df = _last_df_store.get("df")
    if df is None:
        return {"error": "No dataset uploaded yet. Please upload a CSV first."}
    try:
        df_cleaned, clean_report, clean_summary = auto_clean_dataframe(df)
        _last_df_store["df_cleaned"] = df_cleaned
        analysis = analyze_dataset(df_cleaned)
        return {
            "analysis": analysis,
            "clean_report": clean_report,
            "clean_summary": clean_summary
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/export-pdf")
async def export_pdf():
    df = _last_df_store.get("df")
    if df is None:
        return JSONResponse({"error": "No dataset uploaded yet."}, status_code=400)
    try:
        df_cleaned = _last_df_store.get("df_cleaned", df)
        analysis = analyze_dataset(df)
        _, clean_report, clean_summary = auto_clean_dataframe(df)
        pdf_bytes = generate_pdf_report(df, df_cleaned, analysis, clean_report, clean_summary)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=datapulse_report.pdf"}
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class ChatRequest(BaseModel):
    message: str
    dataset_summary: str
    chat_history: list = []


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        reply = chat_with_data(
            message=request.message,
            dataset_summary=request.dataset_summary,
            chat_history=request.chat_history
        )
        return {"reply": reply}
    except Exception as e:
        return {"error": str(e)}