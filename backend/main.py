"""Small FastAPI data source for the Abraham Bike dashboard demo."""

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Abraham Bike Dashboard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/dashboard")
def dashboard_summary() -> dict:
    """Return illustrative figures until a real CRM connector is configured."""
    return {
        "source": "Demo data",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "currency": "VND",
        "kpis": {
            "sales": {"value": 8_420_000_000, "change_percent": 12.8},
            "collections": {"value": 6_180_000_000, "sales_ratio_percent": 73.4},
            "target_completion_percent": 78,
            "overdue_receivables": {"value": 1_260_000_000, "dealer_count": 12},
        },
        "regional_sales": [
            {"region": "Miền Bắc", "value": 2_480_000_000},
            {"region": "Miền Trung", "value": 1_640_000_000},
            {"region": "Miền Nam", "value": 3_620_000_000},
            {"region": "Tây Nguyên", "value": 680_000_000},
        ],
        "alerts": [
            {"title": "Công nợ quá hạn trên 90 ngày", "severity": "urgent"},
            {"title": "Đại lý ngừng mua 60 ngày", "severity": "high"},
            {"title": "Nguy cơ không đạt KPI tháng", "severity": "high"},
        ],
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
