from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from backend.service import MODEL_ID, pricing_review, provenance, quote

app = FastAPI(title="ABG Pricing Explorer · Underwriting", version="2.0.0")


class Risk(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    greek: Literal["Greek", "Non-greek"]
    class_year: Literal["Freshman", "Sophomore", "Junior", "Senior", "Grad student"]
    off_campus: Literal["On campus", "Off campus"]
    distance_to_campus: float = Field(ge=0, le=29.9)
    sprinklered: StrictBool
    gpa: float = Field(ge=0, le=4)
    study: Literal["Business", "Humanities", "Science", "Other"]

    @model_validator(mode="after")
    def check_campus_distance(self):
        if self.off_campus == "On campus" and self.distance_to_campus != 0:
            raise ValueError("On-campus students must have a distance of zero miles")
        return self


class Comparison(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    baseline: Risk
    scenario: Risk
    proposed_premium: float | None = Field(default=None, gt=0, le=1_000_000)


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    risk: Risk
    proposed_premium: float | None = Field(default=None, gt=0, le=1_000_000)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "ABG Pricing Explorer", "workspace": "underwriting", "model_id": MODEL_ID, "coefficient_count": 42, "provenance": provenance}


@app.post("/api/quote")
def get_quote(risk: Risk):
    return quote(risk.model_dump())


@app.post("/api/review")
def review(request: Review):
    indication = quote(request.risk.model_dump())
    return {"quote": indication, "pricing_review": pricing_review(indication, request.proposed_premium)}


@app.post("/api/compare")
def compare(request: Comparison):
    baseline = quote(request.baseline.model_dump())
    scenario = quote(request.scenario.model_dump())
    delta = scenario["annual_premium"] - baseline["annual_premium"]
    return {"baseline": baseline, "scenario": scenario, "dollar_difference": delta,
            "percentage_difference": delta / baseline["annual_premium"] * 100,
            "pricing_review": pricing_review(scenario, request.proposed_premium)}


# In a production local run, FastAPI serves the exported React app and API
# from the same origin. During development, Vite proxies /api to this server.
static_dir = Path(__file__).parent.parent / "abg-explorer/dist/client"
if (static_dir / "index.html").is_file():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="explorer")
