"""
Layer 1 — Strategic Brain: Forecasting API
FastAPI server exposing /forecast endpoint for base_green times.
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from forecast_model import get_forecast

app = FastAPI(
    title="Traffic Signal Forecast API",
    description="Adaptive AI-Based Traffic Signal System — Layer 1 Strategic Brain",
    version="1.0.0",
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "Traffic Signal Forecast API",
        "version": "1.0.0",
        "endpoints": ["/forecast", "/health"],
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/forecast")
def forecast(
    junction: str = Query("silk_board", description="Junction name"),
    horizon: int = Query(30, description="Forecast horizon in minutes"),
):
    """
    Returns forecast base_green per arm for the given junction.
    
    Example: GET /forecast?junction=silk_board&horizon=30
    Response: { arm_N: 38, arm_E: 22, arm_S: 45, arm_W: 30 }
    """
    return get_forecast(junction=junction, horizon=horizon)
