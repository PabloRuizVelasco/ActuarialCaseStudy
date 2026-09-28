from pathlib import Path
import numpy as np
import pandas as pd

PROC = Path(__file__).resolve().parent.parent / "data" / "processed"

COVERAGES = ['Personal Property', 'Additional Living Expense',
             'Guest Medical', 'Liability']

coefs = pd.concat([pd.read_csv(PROC / "freq_coefficients.csv"),
                   pd.read_csv(PROC / "sev_coefficients.csv")],
                  ignore_index=True)


def linear_predictor(risk, coverage, component):
    d   = coefs[(coefs.coverage == coverage) & (coefs.component == component)]
    eta = 0.0
    for term, b in zip(d.term, d.coef):
        if term == 'Intercept':
            eta += b
        elif ' = ' in term:
            var, level = term.split(' = ', 1)
            if str(risk[var]) == level:
                eta += b
        else:
            eta += b * float(risk[term])
    return eta


def expected_cost(risk, detail=False):
    rows = []
    for c in COVERAGES:
        f = np.exp(linear_predictor(risk, c, 'frequency'))
        s = np.exp(linear_predictor(risk, c, 'severity'))
        rows.append({'coverage': c, 'frequency': f,
                     'severity': s, 'pure_premium': f * s})
    out = pd.DataFrame(rows)
    return out if detail else out.pure_premium.sum()