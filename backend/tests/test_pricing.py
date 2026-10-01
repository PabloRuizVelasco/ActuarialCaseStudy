from itertools import product

from fastapi.testclient import TestClient
import pytest

from backend.app import app
from backend.service import quote

client = TestClient(app)
DEFAULT = dict(greek="Non-greek", class_year="Sophomore", off_campus="On campus",
               distance_to_campus=0, sprinklered=True, gpa=3.2, study="Science")


@pytest.mark.parametrize("greek,gpa,sprinklered,expected", [
    ("Greek", 3.5, False, [422.8214, 946.7366, 725.3091, 141.3918]),
    ("Non-greek", 3.0, True, [71.0312, 188.7188, 214.1570, 48.5283]),
])
def test_saved_notebook_08_examples(greek, gpa, sprinklered, expected):
    result = quote({**DEFAULT, "greek": greek, "class_year": "Freshman", "gpa": gpa,
                    "sprinklered": sprinklered, "off_campus": "Off campus", "distance_to_campus": 1.2})
    assert [row["pure_premium"] for row in result["coverages"]] == pytest.approx(expected, abs=0.002)


@pytest.mark.parametrize("risk,expected", [
    (DEFAULT, 756.90),
    ({**DEFAULT, "greek": "Greek", "class_year": "Grad student", "off_campus": "Off campus",
      "distance_to_campus": 4.0, "sprinklered": False, "gpa": 2.8, "study": "Business"}, 5704.15),
])
def test_handoff_worked_premiums(risk, expected):
    # Six-decimal coefficients and rounded book means require a 3-cent tolerance.
    assert quote(risk)["annual_premium"] == pytest.approx(expected, abs=0.03)


def test_every_program_tier_and_accounting_identity():
    for greek, grad, campus in product(["Greek", "Non-greek"], [False, True], [False, True]):
        risk = {**DEFAULT, "greek": greek, "class_year": "Grad student" if grad else "Junior",
                "off_campus": "On campus" if campus else "Off campus", "distance_to_campus": 0 if campus else 5}
        result = client.post("/api/quote", json=risk)
        assert result.status_code == 200
        data = result.json()
        tier = ("Standard" if campus else "Non-Standard") if grad else ("Preferred-Plus" if campus else "Preferred")
        assert data["tier"] == tier
        totals = data["totals"]
        assert totals["premium"] == pytest.approx(sum(totals[k] for k in ["loss_lae", "fixed_expense", "variable_expense", "profit"]))
        assert totals["fixed_expense"] == pytest.approx(51.5355)
        assert totals["profit"] / totals["premium"] == pytest.approx(0.05)


@pytest.mark.parametrize("change", [{"gpa": 4.1}, {"gpa": -1}, {"gpa": "NaN"},
    {"distance_to_campus": 30}, {"distance_to_campus": -1}, {"distance_to_campus": 5},
    {"class_year": "Unknown"}, {"study": "Engineering"}, {"greek": "Yes"}, {"sprinklered": "true"}, {"risk_tier": 1}])
def test_invalid_risks_rejected(change):
    assert client.post("/api/quote", json={**DEFAULT, **change}).status_code == 422


def test_compare_same_and_off_campus():
    same = client.post("/api/compare", json={"baseline": DEFAULT, "scenario": DEFAULT}).json()
    assert same["dollar_difference"] == 0
    assert same["percentage_difference"] == 0
    scenario = {**DEFAULT, "off_campus": "Off campus", "distance_to_campus": 5}
    data = client.post("/api/compare", json={"baseline": DEFAULT, "scenario": scenario}).json()
    assert data["dollar_difference"] > 0
    assert data["percentage_difference"] == pytest.approx(data["dollar_difference"] / data["baseline"]["annual_premium"] * 100)
    assert data["baseline"]["risk"] == DEFAULT


def test_review_at_indication_preserves_target_margin():
    data = client.post("/api/review", json={"risk": DEFAULT}).json()
    review = data["pricing_review"]
    assert data["quote"]["annual_premium"] == quote(DEFAULT)["annual_premium"]
    assert review["difference"] == 0
    assert review["status"] == "At model indication"
    assert review["underwriting_margin"] == pytest.approx(0.05)
    assert review["combined_ratio"] == pytest.approx(0.95)


def test_proposed_price_recalculates_variable_cost_without_changing_indication():
    data = client.post("/api/review", json={"risk": DEFAULT, "proposed_premium": 700}).json()
    review = data["pricing_review"]
    totals = data["quote"]["totals"]
    assert data["quote"]["annual_premium"] == pytest.approx(756.90, abs=0.03)
    assert review["variable_expense"] == pytest.approx(144.2)
    assert review["underwriting_profit"] == pytest.approx(700 - totals["loss_lae"] - totals["fixed_expense"] - 144.2)
    assert review["underwriting_profit"] < 0
    assert review["combined_ratio"] > 1
    assert review["combined_ratio"] + review["underwriting_margin"] == pytest.approx(1)
    assert review["status"] == "Below model indication"
    break_even = client.post("/api/review", json={"risk": DEFAULT, "proposed_premium": review["break_even_premium"]}).json()["pricing_review"]
    assert break_even["combined_ratio"] == pytest.approx(1)
    assert break_even["underwriting_profit"] == pytest.approx(0, abs=1e-9)


@pytest.mark.parametrize("premium", [0, -1, "NaN", "Infinity", 1_000_001])
def test_review_rejects_invalid_proposed_premiums(premium):
    assert client.post("/api/review", json={"risk": DEFAULT, "proposed_premium": premium}).status_code == 422


def test_comparison_review_uses_current_risk_not_saved_baseline():
    risk = {**DEFAULT, "off_campus": "Off campus", "distance_to_campus": 5}
    data = client.post("/api/compare", json={"baseline": DEFAULT, "scenario": risk, "proposed_premium": 900}).json()
    review = data["pricing_review"]
    assert review["indicated_premium"] == data["scenario"]["annual_premium"]
    assert review["loss_lae"] == data["scenario"]["totals"]["loss_lae"]
    assert review["proposed_premium"] == 900


def test_predictor_display_matches_supplied_classification_structure():
    data = quote(DEFAULT)
    pp, ale, gm, liability = data["coverages"]
    assert "class_year" not in pp["predictors"]["severity"]
    assert "class_year" in ale["predictors"]["severity"]
    assert "class_year" in gm["predictors"]["severity"]
    assert liability["predictors"]["severity"] == ["distance_to_campus"]
    assert "sprinklered" not in gm["predictors"]["frequency"]
