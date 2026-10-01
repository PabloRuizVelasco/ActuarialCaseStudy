"""Recover displayed coefficients without executing or changing the notebooks."""
import argparse
import csv
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil


class SavedTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = []
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td":
            self.cell = ""

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data

    def handle_endtag(self, tag):
        if tag == "td":
            self.row.append(self.cell.strip())
            self.cell = None
        elif tag == "tr" and self.row:
            self.rows.append(self.row)


def recover(source: Path, destination: Path):
    notebook = source / "notebooks/08_CombinedModels.ipynb"
    nb = json.loads(notebook.read_text(encoding="utf-8"))
    parser = SavedTable()
    parser.feed("".join(nb["cells"][2]["outputs"][0]["data"]["text/html"]))
    fields = ["coverage", "term", "coef", "pval", "se", "component"]
    rows = [dict(zip(fields, row, strict=True)) for row in parser.rows]
    assert len(rows) == 42, "Expected the 42 saved combined-model coefficients"
    assert sum(row["component"] == "frequency" for row in rows) == 19
    proc = destination / "data/processed"
    proc.mkdir(parents=True, exist_ok=True)
    (destination / "src").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / "src/rating.py", destination / "src/rating.py")
    for component, prefix in [("frequency", "freq"), ("severity", "sev")]:
        with (proc / f"{prefix}_coefficients.csv").open("w", newline="", encoding="utf-8") as out:
            writer = csv.DictWriter(out, fieldnames=fields)
            writer.writeheader()
            writer.writerows(row for row in rows if row["component"] == component)
    provenance = {
        "source": "08_CombinedModels.ipynb, cell 2, saved HTML output",
        "notebook_sha256": hashlib.sha256(notebook.read_bytes()).hexdigest(),
        "rating_source_sha256": hashlib.sha256((source / "src/rating.py").read_bytes()).hexdigest(),
        "precision": "Coefficients displayed to six decimal places; original CSV precision unavailable.",
        "severity_intercepts": "Already include sigma squared / 2; no additional correction applied.",
        "status": "Recovered notebook snapshot; model-indicated estimates, not a balanced rating manual.",
        "fixed_expense_source": "ABG_project_handoff.md section 6, rounded book loss + LAE means multiplied by 0.051.",
    }
    (destination / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(f"Recovered {len(rows)} coefficients and copied the unchanged rating.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    recover(args.source, args.destination)
