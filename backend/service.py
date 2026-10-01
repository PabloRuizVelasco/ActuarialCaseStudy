"""Thin pricing wrapper around the supplied src/rating.py."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "model"
spec = importlib.util.spec_from_file_location("abg_original_rating", MODEL_DIR / "src/rating.py")
rating = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rating)
provenance = json.loads((MODEL_DIR / "provenance.json").read_text(encoding="utf-8"))
if hashlib.sha256((MODEL_DIR / "src/rating.py").read_bytes()).hexdigest() != provenance["rating_source_sha256"]:
    raise RuntimeError("The bundled rating function differs from its recorded source")
if len(rating.coefs) != 42 or rating.coefs.duplicated(["coverage", "component", "term"]).any():
    raise RuntimeError("Incomplete or duplicate model coefficients")
if not all(math.isfinite(float(value)) for value in rating.coefs.coef):
    raise RuntimeError("Non-finite model coefficients")

LAE_RATIO = 8.5 / 66.2
VARIABLE_EXPENSE = (18.1 + 2.5) / 100
TARGET_PROFIT = 0.05
GENERAL_EXPENSE = 0.051
# Rounded book averages supplied in handoff section 6. These are held flat
# across policies; do not recalculate fixed expense from each applicant's loss.
BOOK_LOSS_LAE = dict(zip(rating.COVERAGES, [113.76, 325.97, 493.04, 77.73]))
FIXED_EXPENSE = {coverage: mean * GENERAL_EXPENSE for coverage, mean in BOOK_LOSS_LAE.items()}
MODEL_ID = hashlib.sha256((MODEL_DIR / "data/processed/freq_coefficients.csv").read_bytes()
                          + (MODEL_DIR / "data/processed/sev_coefficients.csv").read_bytes()).hexdigest()[:12]
PREDICTORS = {
    coverage: {
        component: list(dict.fromkeys(term.split(" = ", 1)[0] for term in
            rating.coefs.loc[(rating.coefs.coverage == coverage) &
                             (rating.coefs.component == component), "term"]
            if term != "Intercept"))
        for component in ["frequency", "severity"]
    }
    for coverage in rating.COVERAGES
}


def quote(risk: dict) -> dict:
    result = rating.expected_cost(risk, detail=True)
    rows = []
    for row in result.to_dict(orient="records"):
        loss_lae = row["pure_premium"] * (1 + LAE_RATIO)
        fixed = FIXED_EXPENSE[row["coverage"]]
        premium = (loss_lae + fixed) / (1 - VARIABLE_EXPENSE - TARGET_PROFIT)
        rows.append({**row, "predictors": PREDICTORS[row["coverage"]], "loss_lae": loss_lae, "fixed_expense": fixed,
                     "variable_expense": premium * VARIABLE_EXPENSE,
                     "profit": premium * TARGET_PROFIT, "premium": premium})
    totals = {key: sum(row[key] for row in rows) for key in
              ["pure_premium", "loss_lae", "fixed_expense", "variable_expense", "profit", "premium"]}
    grad = risk["class_year"] == "Grad student"
    on_campus = risk["off_campus"] == "On campus"
    tier = ("Standard" if on_campus else "Non-Standard") if grad else ("Preferred-Plus" if on_campus else "Preferred")
    return {"risk": risk, "program": "Non-Greek" if risk["greek"] == "Non-greek" else "Greek",
            "tier": tier, "annual_premium": totals["premium"], "coverages": rows, "totals": totals,
            "model_id": MODEL_ID, "status": "Model-indicated estimate", "provenance": provenance,
            "assumptions": {"lae_ratio": LAE_RATIO, "variable_expense": VARIABLE_EXPENSE,
                            "target_profit": TARGET_PROFIT, "fixed_expense": FIXED_EXPENSE}}


def pricing_review(indication: dict, proposed_premium: float | None = None) -> dict:
    """Evaluate a proposed total without changing or reallocating model rates."""
    proposed = indication["annual_premium"] if proposed_premium is None else proposed_premium
    if not math.isfinite(proposed) or proposed <= 0:
        raise ValueError("Proposed premium must be positive and finite")
    loss_lae = indication["totals"]["loss_lae"]
    fixed = indication["totals"]["fixed_expense"]
    variable = proposed * VARIABLE_EXPENSE
    total_cost = loss_lae + fixed + variable
    profit = proposed - total_cost
    difference = proposed - indication["annual_premium"]
    status = "At model indication" if abs(difference) < 0.005 else (
        "Below model indication" if difference < 0 else "Above model indication")
    return {"proposed_premium": proposed, "indicated_premium": indication["annual_premium"],
            "difference": difference, "difference_pct": difference / indication["annual_premium"] * 100,
            "loss_lae": loss_lae, "fixed_expense": fixed, "variable_expense": variable,
            "total_cost": total_cost, "underwriting_profit": profit,
            "underwriting_margin": profit / proposed, "combined_ratio": total_cost / proposed,
            "break_even_premium": (loss_lae + fixed) / (1 - VARIABLE_EXPENSE),
            "target_profit": TARGET_PROFIT, "status": status}
