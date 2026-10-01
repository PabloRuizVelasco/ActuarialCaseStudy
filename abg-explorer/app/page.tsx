"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ClipboardList, GitCompareArrows, ChartNoAxesCombined, Bookmark, RotateCcw, Info, ChevronDown, Download, ArrowRight, FileText } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { ChartContainer } from "@/components/ui/chart";
import { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell } from "@/components/ui/table";

type Risk = { greek: "Greek" | "Non-greek"; class_year: "Freshman" | "Sophomore" | "Junior" | "Senior" | "Grad student"; off_campus: "On campus" | "Off campus"; distance_to_campus: number; sprinklered: boolean; gpa: number; study: "Business" | "Humanities" | "Science" | "Other" };
type Draft = Omit<Risk, "gpa" | "distance_to_campus"> & { gpa: string; distance_to_campus: string };
type Coverage = { coverage: string; frequency: number; severity: number; pure_premium: number; loss_lae: number; fixed_expense: number; variable_expense: number; profit: number; premium: number; predictors: { frequency: string[]; severity: string[] } };
type Quote = { risk: Risk; program: string; tier: string; annual_premium: number; coverages: Coverage[]; totals: Pick<Coverage, "pure_premium" | "loss_lae" | "fixed_expense" | "variable_expense" | "profit" | "premium">; model_id: string; assumptions: { lae_ratio: number; variable_expense: number; target_profit: number } };
type PricingReview = { proposed_premium: number; indicated_premium: number; difference: number; difference_pct: number; loss_lae: number; fixed_expense: number; variable_expense: number; total_cost: number; underwriting_profit: number; underwriting_margin: number; combined_ratio: number; break_even_premium: number; target_profit: number; status: string };
type ReviewResponse = { quote: Quote; pricing_review: PricingReview };
type Comparison = { baseline: Quote; scenario: Quote; dollar_difference: number; percentage_difference: number; pricing_review: PricingReview };
type View = "quote" | "compare" | "portfolio";
const DEFAULT: Risk = { greek: "Non-greek", class_year: "Sophomore", off_campus: "On campus", distance_to_campus: 0, sprinklered: true, gpa: 3.2, study: "Science" };
const GREEK_GRAD: Risk = { greek: "Greek", class_year: "Grad student", off_campus: "Off campus", distance_to_campus: 4, sprinklered: false, gpa: 2.8, study: "Business" };
const STORAGE_KEY = "abg-pricing-baseline-v1";
const NAMES = ["Personal Property", "Additional Living Expense", "Guest Medical", "Liability"];
const LIMITS = ["$10,000 limit", "Limit not specified in source", "$150,000 limit", "$500,000 limit"];
const SHORT = ["Property", "Living expense", "Guest medical", "Liability"];
const COLORS = ["#168447", "#5d9c76", "#263e32", "#8393a0"];
const FIELD_LABELS: Record<keyof Risk, string> = { greek: "Greek membership", class_year: "Class year", off_campus: "Campus residence", distance_to_campus: "Distance to campus", sprinklered: "Sprinklers", gpa: "GPA", study: "Field of study" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const signedPct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const toDraft = (risk: Risk): Draft => ({ ...risk, gpa: String(risk.gpa), distance_to_campus: String(risk.distance_to_campus) });
const displayRisk = (key: keyof Risk, value: Risk[keyof Risk]) => key === "sprinklered" ? (value ? "Sprinklered" : "Not sprinklered") : key === "distance_to_campus" ? `${value} mi` : value === "Non-greek" ? "Non-Greek" : value === "Grad student" ? "Graduate student" : String(value);
const riskSummary = (risk: Risk) => `${displayRisk("greek", risk.greek)} · ${displayRisk("class_year", risk.class_year)} · ${risk.off_campus}${risk.off_campus === "Off campus" ? `, ${risk.distance_to_campus} mi` : ""} · GPA ${risk.gpa} · ${risk.study} · ${displayRisk("sprinklered", risk.sprinklered)}`;

function validate(draft: Draft): { risk: Risk | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const gpa = Number(draft.gpa), distance = Number(draft.distance_to_campus);
  if (draft.gpa.trim() === "" || !Number.isFinite(gpa) || gpa < 0 || gpa > 4) errors.gpa = "Enter a GPA between 0.0 and 4.0.";
  if (draft.distance_to_campus.trim() === "" || !Number.isFinite(distance) || distance < 0 || distance > 29.9) errors.distance = "Enter a distance between 0 and 29.9 miles.";
  if (draft.off_campus === "On campus" && distance !== 0) errors.distance = "On-campus distance must be zero.";
  if (!["Greek", "Non-greek"].includes(draft.greek) || !["Freshman", "Sophomore", "Junior", "Senior", "Grad student"].includes(draft.class_year) || !["On campus", "Off campus"].includes(draft.off_campus) || !["Business", "Humanities", "Science", "Other"].includes(draft.study) || typeof draft.sprinklered !== "boolean") errors.risk = "Choose valid risk characteristics.";
  return { risk: Object.keys(errors).length ? null : { greek: draft.greek, class_year: draft.class_year, off_campus: draft.off_campus, distance_to_campus: distance, sprinklered: draft.sprinklered, gpa, study: draft.study }, errors };
}

async function request<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(response.status === 422 ? "Check the risk characteristics and proposed premium." : "The pricing service is unavailable. Your inputs have been preserved.");
  return response.json();
}

function CoverageTable({ quote }: { quote: Quote }) {
  return <section className="panel coverage-table-panel" aria-labelledby="coverage-heading">
    <div className="section-heading"><div><h2 id="coverage-heading">Coverage indications</h2><p>Expected claim cost and indicated annual premium</p></div><span className="unit-label">USD / policy year</span></div>
    <Table className="numeric-table coverage-table"><TableHeader><TableRow><TableHead scope="col">Coverage / limit</TableHead><TableHead scope="col">Claims / 100<br />policy years</TableHead><TableHead scope="col">Average<br />severity</TableHead><TableHead scope="col">Pure<br />premium</TableHead><TableHead scope="col">Losses<br />+ LAE</TableHead><TableHead scope="col">Indicated<br />premium</TableHead></TableRow></TableHeader>
      <TableBody>{quote.coverages.map((row, i) => <TableRow key={row.coverage}><TableHead scope="row"><div className="coverage-name"><i style={{ background: COLORS[i] }} /><span>{NAMES[i]}<small>{LIMITS[i]}</small></span></div></TableHead><TableCell>{(row.frequency * 100).toFixed(2)}</TableCell><TableCell>{money(row.severity)}</TableCell><TableCell>{money(row.pure_premium)}</TableCell><TableCell>{money(row.loss_lae)}</TableCell><TableCell className="premium-cell">{money(row.premium)}</TableCell></TableRow>)}</TableBody>
      <TableFooter><TableRow><TableHead scope="row">Total / policy year</TableHead><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(quote.totals.pure_premium)}</TableCell><TableCell>{money(quote.totals.loss_lae)}</TableCell><TableCell className="premium-cell">{money(quote.annual_premium)}</TableCell></TableRow></TableFooter>
    </Table><p className="table-scroll-hint">Scroll horizontally to review all coverage metrics.</p><p className="source-note">Frequency is expected claim count, not claim probability. Indications include expenses and a {pct(quote.assumptions.target_profit)} profit target. Individual amounts are rounded for display.</p>
  </section>;
}

function CoverageChart({ quote, baseline }: { quote: Quote; baseline?: Quote }) {
  const data = quote.coverages.map((row, i) => ({ name: SHORT[i], premium: row.premium, baseline: baseline?.coverages[i].premium ?? 0, fill: COLORS[i] }));
  return <section className="panel allocation-panel" aria-label="Annual premium allocation">
    <div className="section-heading"><div><h2>Premium allocation</h2><p>{baseline ? "Baseline and current risk indications" : "Model indication by coverage"}</p></div></div>
    {baseline && <div className="chart-legend"><span><i style={{ background: "#cbd2ce" }} />Baseline</span><span><i style={{ background: "#168447" }} />Current risk</span></div>}
    <ChartContainer className="premium-chart" config={{ premium: { label: "Current risk", color: "#168447" }, baseline: { label: "Baseline", color: "#cbd2ce" } }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 24, left: 0 }} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke="#e4e9e6" />
        <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickCount={3} minTickGap={16} tickFormatter={(value: number) => `$${value.toLocaleString()}`} label={{ value: "Annual premium (USD)", position: "bottom", offset: 10, fill: "#64736b", fontSize: 12 }} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={104} />
        <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 5, border: "1px solid #dfe6e1", boxShadow: "none" }} cursor={{ fill: "#f3f6f4" }} />
        {baseline && <Bar dataKey="baseline" name="Baseline" fill="#cbd2ce" radius={[0, 3, 3, 0]} maxBarSize={15} isAnimationActive={false} />}
        <Bar dataKey="premium" name="Current risk" radius={[0, 3, 3, 0]} maxBarSize={25} isAnimationActive={false}>{data.map((row) => <Cell key={row.name} fill={row.fill} />)}</Bar>
      </BarChart>
    </ChartContainer><p className="source-note">Source: ABG model snapshot {quote.model_id}. Proposed pricing does not change these coverage indications.</p>
  </section>;
}

function ScenarioAnalysis({ comparison }: { comparison: Comparison }) {
  const changes = (Object.keys(FIELD_LABELS) as (keyof Risk)[]).filter((key) => comparison.baseline.risk[key] !== comparison.scenario.risk[key]);
  return <section className="panel scenario-panel" aria-labelledby="scenario-heading"><div className="section-heading"><div><h2 id="scenario-heading">Scenario variance</h2><p>{comparison.baseline.program} / {comparison.baseline.tier} <span className="inline-arrow">→</span> {comparison.scenario.program} / {comparison.scenario.tier}</p></div><span className="badge">{changes.length} input{changes.length === 1 ? "" : "s"} changed</span></div>
    <div className="variance-metrics"><div><span>Baseline indication</span><strong>{money(comparison.baseline.annual_premium)}</strong></div><div><span>Annual change</span><strong>{signedMoney(comparison.dollar_difference)}</strong></div><div><span>Rate change</span><strong>{signedPct(comparison.percentage_difference)}</strong></div></div>
    <div className="scenario-tables"><Table className="change-table"><TableHeader><TableRow><TableHead scope="col">Changed characteristic</TableHead><TableHead scope="col">Baseline</TableHead><TableHead scope="col">Current risk</TableHead></TableRow></TableHeader><TableBody>{changes.length ? changes.map((key) => <TableRow key={key}><TableHead scope="row">{FIELD_LABELS[key]}</TableHead><TableCell>{displayRisk(key, comparison.baseline.risk[key])}</TableCell><TableCell>{displayRisk(key, comparison.scenario.risk[key])}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3}>No risk changes. Adjust the characteristics to assess a scenario.</TableCell></TableRow>}</TableBody></Table>
      <Table className="numeric-table variance-table"><TableHeader><TableRow><TableHead scope="col">Coverage</TableHead><TableHead scope="col">Baseline</TableHead><TableHead scope="col">Current</TableHead><TableHead scope="col">Change</TableHead></TableRow></TableHeader><TableBody>{comparison.scenario.coverages.map((row, i) => <TableRow key={row.coverage}><TableHead scope="row">{SHORT[i]}</TableHead><TableCell>{money(comparison.baseline.coverages[i].premium)}</TableCell><TableCell>{money(row.premium)}</TableCell><TableCell>{signedMoney(row.premium - comparison.baseline.coverages[i].premium)}</TableCell></TableRow>)}</TableBody></Table>
    </div><p className="source-note">Both risks are scored with the current model and the same expense assumptions. This variance reflects changes to the modeled risk, separate from a proposed premium.</p>
  </section>;
}

function Calculation({ quote }: { quote: Quote }) {
  const predictorLabels = (fields: string[]) => fields.map((field) => FIELD_LABELS[field as keyof Risk] ?? field).join(", ") || "Intercept only";
  return <details className="calculation"><summary><span><Info size={17} />Model drivers & calculation basis</span><ChevronDown size={18} /></summary><div className="calculation-body">
    <h3>Predictors used in the fitted models</h3><p>These are the actual variables present in each coverage model. The scenario view shows their combined pricing effect for the risks selected.</p>
    <Table className="predictor-table"><TableHeader><TableRow><TableHead scope="col">Coverage</TableHead><TableHead scope="col">Frequency predictors</TableHead><TableHead scope="col">Severity predictors</TableHead></TableRow></TableHeader><TableBody>{quote.coverages.map((row, i) => <TableRow key={row.coverage}><TableHead scope="row">{SHORT[i]}</TableHead><TableCell>{predictorLabels(row.predictors.frequency)}</TableCell><TableCell>{predictorLabels(row.predictors.severity)}</TableCell></TableRow>)}</TableBody></Table>
    <h3>Indicated premium</h3><p>Each coverage uses exp(linear predictor) for frequency and severity. Program and tier classify the risk; no additional tier factors are applied to the model output.</p>
    <div className="formula">Premium = [frequency × severity × (1 + 8.5 / 66.2) + fixed expense] / (1 − 20.6% − 5.0%)</div>
    <dl className="cost-chain"><div><dt>Expected losses + LAE</dt><dd>{money(quote.totals.loss_lae)}</dd></div><div><dt>Flat fixed expense</dt><dd>{money(quote.totals.fixed_expense)}</dd></div><div><dt>Variable expense · {pct(quote.assumptions.variable_expense)}</dt><dd>{money(quote.totals.variable_expense)}</dd></div><div><dt>Target underwriting profit · {pct(quote.assumptions.target_profit)}</dt><dd>{money(quote.totals.profit)}</dd></div><div className="total"><dt>Indicated annual premium</dt><dd>{money(quote.annual_premium)}</dd></div></dl>
    <p className="method-note"><strong>Model provenance.</strong> All 42 coefficients were recovered from saved output in notebook 08 at six-decimal precision. Severity intercepts already contain the log-normal mean correction. Fixed expenses use the handoff&apos;s rounded book loss + LAE averages × 5.1% and remain flat across risks. Model snapshot: {quote.model_id}.</p>
    <p className="method-note"><strong>Review limitations.</strong> The full-precision exports and portfolio dataset were not supplied. The rounded rating manual still requires balancing. Guest Medical&apos;s known retransformation bias is retained. This synthetic case-study tool evaluates modeled pricing; underwriting eligibility, approval, and binding rules have not been supplied.</p>
  </div></details>;
}

function Portfolio() {
  return <section className="panel portfolio-view"><div className="section-heading"><div><p className="eyebrow">PORTFOLIO REVIEW</p><h2>Three-year forecasting · phase two</h2></div><ChartNoAxesCombined size={25} /></div><p className="portfolio-intro">The starting-book references below provide context for a future retention and profitability review. Forecast results will follow after manual balancing and restoration of the portfolio data.</p>
    <div className="portfolio-reference"><div><span>Starting policy count</span><strong>10,000</strong><small>1,965 Greek · 8,035 Non-Greek</small></div><div><span>Indicated mean premium</span><strong>$1,427.47</strong><small>Before manual balancing</small></div><div><span>Target combined ratio</span><strong>95.0%</strong><small>At the indicated rate level</small></div></div><p className="source-note">Source: ABG project handoff, sections 6–8. Reference values, not a forecast.</p>
    <ol className="forecast-steps"><li><span>01</span><div><h3>Balance the rating manual</h3><p>Restore the portfolio data and reconcile rounded factors and base rates with indicated premium by coverage and tier.</p></div></li><li><span>02</span><div><h3>Set retention and growth assumptions</h3><p>Review Greek and Non-Greek retention, new-business growth, coverage trends, and the fixed expense pool.</p></div></li><li><span>03</span><div><h3>Review projected underwriting results</h3><p>Compare policy count, premium, underwriting profit, and combined ratio over three years.</p></div></li></ol>
  </section>;
}

function reviewMemo(quote: Quote, pricing: PricingReview, comparison: Comparison | null, notes: string): string {
  const lines = ["# ABG underwriting pricing review", "", `Prepared: ${new Date().toISOString()}`, `Model snapshot: ${quote.model_id}`, "Status: Model-indicated estimate · synthetic case study", "", "## Risk characteristics", "", ...Object.entries(quote.risk).map(([key, value]) => `- ${FIELD_LABELS[key as keyof Risk]}: ${displayRisk(key as keyof Risk, value)}`), `- Program / tier: ${quote.program} / ${quote.tier}`, "", "## Coverage indications", "", "| Coverage | Claims / 100 policy years | Average severity | Pure premium | Losses + LAE | Indicated premium |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...quote.coverages.map((row, i) => `| ${NAMES[i]} (${LIMITS[i]}) | ${(row.frequency * 100).toFixed(2)} | ${money(row.severity)} | ${money(row.pure_premium)} | ${money(row.loss_lae)} | ${money(row.premium)} |`), "", `Total indicated annual premium: **${money(quote.annual_premium)}**`, "", "## Proposed pricing review", "", `- Proposed annual premium: ${money(pricing.proposed_premium)}`, `- Variance to indication: ${signedMoney(pricing.difference)} / ${signedPct(pricing.difference_pct)}`, `- Pricing position: ${pricing.status}`, `- Expected losses + LAE: ${money(pricing.loss_lae)}`, `- Fixed expense: ${money(pricing.fixed_expense)}`, `- Variable expense at proposed premium: ${money(pricing.variable_expense)}`, `- Modeled underwriting result: ${signedMoney(pricing.underwriting_profit)}`, `- Modeled underwriting margin: ${pct(pricing.underwriting_margin)}`, `- Modeled combined ratio: ${pct(pricing.combined_ratio)}`, `- Break-even annual premium: ${money(pricing.break_even_premium)}`, `- Target underwriting margin: ${pct(pricing.target_profit)}`, ""];
  if (comparison) {
    lines.push("## Scenario comparison", "", `Baseline: ${riskSummary(comparison.baseline.risk)}`, `Current risk: ${riskSummary(comparison.scenario.risk)}`, `Classification: ${comparison.baseline.program} / ${comparison.baseline.tier} → ${comparison.scenario.program} / ${comparison.scenario.tier}`, `Baseline indication: ${money(comparison.baseline.annual_premium)}`, `Scenario indication: ${money(comparison.scenario.annual_premium)}`, `Annual change: ${signedMoney(comparison.dollar_difference)} / ${signedPct(comparison.percentage_difference)}`, "", ...((Object.keys(FIELD_LABELS) as (keyof Risk)[]).filter((key) => comparison.baseline.risk[key] !== comparison.scenario.risk[key]).map((key) => `- ${FIELD_LABELS[key]}: ${displayRisk(key, comparison.baseline.risk[key])} → ${displayRisk(key, comparison.scenario.risk[key])}`)), "");
  }
  lines.push("## Reviewer notes", "", notes.trim() || "No reviewer notes entered.", "", "## Calculation basis and limitations", "", "Indicated premium = [frequency × severity × (1 + 8.5 / 66.2) + fixed expense] / (1 − 20.6% − 5.0%). Frequency is expected claim count, not claim probability. Proposed pricing holds modeled losses + LAE and fixed expense constant, and recalculates variable expense at 20.6% of proposed premium. Combined ratio = (losses + LAE + fixed expense + variable expense) / proposed premium. No coverage allocation of the proposed premium is inferred.", "", "The 42 coefficients were recovered from notebook 08 output at six-decimal precision; severity intercepts already include the log-normal mean correction. Fixed expenses use rounded book loss + LAE means × 5.1%. Original full-precision CSV exports and portfolio data were not supplied. The rounded manual is not balanced and known Guest Medical retransformation bias is retained. Underwriting eligibility, approval, and binding rules have not been supplied. This memo records modeled pricing and reviewer observations; it is not an underwriting approval or binding quote.", "");
  return lines.join("\n");
}

export default function Home() {
  const [view, setView] = useState<View>("quote");
  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT));
  const [baseline, setBaseline] = useState<Risk | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState<PricingReview | null>(null);
  const [proposed, setProposed] = useState("");
  const [notes, setNotes] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [calculatedKey, setCalculatedKey] = useState("");
  const { risk, errors } = useMemo(() => validate(draft), [draft]);
  const validKey = risk ? JSON.stringify(risk) : "";
  const proposedValue = proposed.trim() === "" ? null : Number(proposed);
  const proposedError = proposedValue !== null && (!Number.isFinite(proposedValue) || proposedValue <= 0 || proposedValue > 1_000_000) ? "Enter a premium greater than $0 and no more than $1,000,000." : "";
  const requestKey = JSON.stringify({ risk, proposed_premium: proposedError ? null : proposedValue, baseline: view === "compare" ? baseline : null });
  const assessmentCurrent = quote && validKey === JSON.stringify(quote.risk) && !error;
  const pricingCurrent = assessmentCurrent && pricing && calculatedKey === requestKey && !busy && !proposedError;
  const comparisonCurrent = view === "compare" && comparison && calculatedKey === requestKey && !busy;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { const parsed = JSON.parse(stored); if (parsed?.version === 1 && parsed.risk && validate(toDraft(parsed.risk)).risk) setBaseline(parsed.risk); }
    } catch { setStorageNotice("Device storage is unavailable. Baselines will be kept for this session."); }
  }, []);

  const saveBaseline = useCallback((value: Risk) => {
    const copy = { ...value }; setBaseline(copy);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, risk: copy })); setStorageNotice("Baseline saved on this device."); }
    catch { setStorageNotice("Baseline saved for this session. Device storage is unavailable."); }
  }, []);

  useEffect(() => {
    if (!risk) { setBusy(false); setQuote(null); setPricing(null); setComparison(null); setError(""); return; }
    const controller = new AbortController();
    setBusy(true); setError(""); setExportNotice("");
    const payload = JSON.parse(requestKey);
    const timer = setTimeout(async () => {
      try {
        if (payload.baseline) {
          const result = await request<Comparison>("compare", { baseline: payload.baseline, scenario: payload.risk, proposed_premium: payload.proposed_premium }, controller.signal);
          if (!controller.signal.aborted) { setQuote(result.scenario); setComparison(result); setPricing(result.pricing_review); setCalculatedKey(requestKey); }
        } else {
          const result = await request<ReviewResponse>("review", { risk: payload.risk, proposed_premium: payload.proposed_premium }, controller.signal);
          if (!controller.signal.aborted) { setQuote(result.quote); setComparison(null); setPricing(result.pricing_review); setCalculatedKey(requestKey); }
        }
      } catch (failure) {
        if (!controller.signal.aborted) { setQuote(null); setPricing(null); setComparison(null); setError(failure instanceof Error ? failure.message : "Unable to calculate the pricing review."); }
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, retry]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((previous) => ({ ...previous, [key]: value, ...(key === "off_campus" && value === "On campus" ? { distance_to_campus: "0" } : {}) })); }
  function campusComparison() { saveBaseline(DEFAULT); setDraft(toDraft({ ...DEFAULT, off_campus: "Off campus", distance_to_campus: 5 })); setView("compare"); }
  function exportReview() {
    if (!pricingCurrent || !quote || !pricing) return;
    const blob = new Blob([reviewMemo(quote, pricing, comparisonCurrent ? comparison : null, notes)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `ABG-underwriting-review-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setExportNotice("Memo download started with the current risk, pricing basis, and notes.");
  }

  useEffect(() => {
    type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({
        name: "configure_abg_student", title: "Set ABG underwriting risk",
        description: "Set the seven risk characteristics in the visible underwriting workbench and start recalculation. Returns the configured risk; indications are calculated by the pricing service afterward.",
        inputSchema: { type: "object", properties: {
          greek: { enum: ["Greek", "Non-greek"] }, class_year: { enum: ["Freshman", "Sophomore", "Junior", "Senior", "Grad student"] },
          off_campus: { enum: ["On campus", "Off campus"] }, distance_to_campus: { type: "number", minimum: 0, maximum: 29.9 },
          sprinklered: { type: "boolean" }, gpa: { type: "number", minimum: 0, maximum: 4 }, study: { enum: ["Business", "Humanities", "Science", "Other"] },
        }, required: Object.keys(DEFAULT), additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 7 || !Object.keys(DEFAULT).every((key) => key in input)) throw new Error("Provide exactly the seven risk characteristics.");
          const candidate = input as Risk;
          if (typeof candidate.gpa !== "number" || typeof candidate.distance_to_campus !== "number") throw new Error("GPA and distance must be numbers.");
          const checked = validate(toDraft(candidate));
          if (!checked.risk) throw new Error(Object.values(checked.errors).join(" "));
          flushSync(() => { setDraft(toDraft(checked.risk!)); setView("quote"); });
          return { profile: checked.risk, status: "Risk configured; indication recalculation started" };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Visible controls remain available without WebMCP. */ }
    return () => lifecycle.abort();
  }, []);

  const nav = [{ id: "quote" as View, label: "Risk assessment", icon: ClipboardList }, { id: "compare" as View, label: "Scenario analysis", icon: GitCompareArrows }, { id: "portfolio" as View, label: "Portfolio review", icon: ChartNoAxesCombined }];
  return <div className="explorer"><header className="topbar"><a className="brand" href="/" aria-label="ABG Pricing Explorer home"><span className="brand-mark">ABG</span><div><strong>Pricing Explorer</strong><span>UNDERWRITING WORKBENCH</span></div></a><span className="top-status"><span className="status-dot" />Case-study model · local workspace</span></header>
    <main><div className="title-row"><div><p className="eyebrow">DORMITORY INSURANCE / ABG</p><h1>Underwriting pricing review</h1><p className="title-caption">Coverage-level loss costs, classification, and proposed pricing in one workspace.</p></div><span className="estimate-badge">Model-indicated estimates</span></div>
      <nav className="view-tabs" aria-label="Workbench views">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><Icon size={18} />{label}{id === "portfolio" && <span>Phase 2</span>}</button>)}</nav>
      {view === "portfolio" ? <Portfolio /> : <div className="workspace"><aside className="input-panel panel"><div className="input-heading"><h2>Risk characteristics</h2><button className="reset" onClick={() => setDraft(toDraft(DEFAULT))} aria-label="Reset risk characteristics"><RotateCcw size={14} />Reset</button></div><p className="panel-caption">One policy · annual exposure</p>
        <p className="field-group-label">CLASSIFICATION</p>
        <div className="field"><label htmlFor="greek">Greek membership</label><NativeSelect id="greek" value={draft.greek} onChange={(e) => update("greek", e.target.value as Risk["greek"])}><option value="Non-greek">Non-Greek</option><option value="Greek">Greek</option></NativeSelect></div>
        <div className="field"><label htmlFor="class-year">Class year</label><NativeSelect id="class-year" value={draft.class_year} onChange={(e) => update("class_year", e.target.value as Risk["class_year"])}>{["Freshman", "Sophomore", "Junior", "Senior", "Grad student"].map((year) => <option key={year} value={year}>{year === "Grad student" ? "Graduate student" : year}</option>)}</NativeSelect></div>
        <p className="field-group-label">LOCATION & PROTECTION</p>
        <div className="field"><label htmlFor="residence">Campus residence</label><NativeSelect id="residence" value={draft.off_campus} onChange={(e) => update("off_campus", e.target.value as Risk["off_campus"])}><option>On campus</option><option>Off campus</option></NativeSelect></div>
        <div className="field"><label htmlFor="distance">Distance to campus <span>miles</span></label><Input id="distance" type="number" min={0} max={29.9} step={0.1} value={draft.distance_to_campus} disabled={draft.off_campus === "On campus"} onChange={(e) => update("distance_to_campus", e.target.value)} aria-invalid={!!errors.distance} aria-describedby="distance-note" /><small id="distance-note" className={errors.distance ? "field-error" : ""}>{errors.distance || (draft.off_campus === "On campus" ? "On-campus risks use zero miles." : "Model range: 0–29.9 miles.")}</small></div>
        <div className="field"><label htmlFor="sprinklers">Sprinkler protection</label><NativeSelect id="sprinklers" value={String(draft.sprinklered)} onChange={(e) => update("sprinklered", e.target.value === "true")}><option value="true">Sprinklered</option><option value="false">Not sprinklered</option></NativeSelect></div>
        <p className="field-group-label">ACADEMIC CHARACTERISTICS</p>
        <div className="field-pair"><div className="field"><label htmlFor="gpa">GPA</label><Input id="gpa" type="number" min={0} max={4} step={0.1} value={draft.gpa} onChange={(e) => update("gpa", e.target.value)} aria-invalid={!!errors.gpa} aria-describedby={errors.gpa ? "gpa-error" : undefined} />{errors.gpa && <small id="gpa-error" className="field-error">{errors.gpa}</small>}</div><div className="field"><label htmlFor="study">Field of study</label><NativeSelect id="study" value={draft.study} onChange={(e) => update("study", e.target.value as Risk["study"])}>{["Business", "Humanities", "Science", "Other"].map((study) => <option key={study}>{study}</option>)}</NativeSelect></div></div>
        <Button variant="outline" className="save-button" disabled={!risk} onClick={() => risk && saveBaseline(risk)}><Bookmark size={15} />{baseline ? "Replace saved baseline" : "Save as baseline"}</Button>{storageNotice && <p className="storage-notice" role="status">{storageNotice}</p>}
        <div className="worked-examples"><span>REFERENCE RISKS</span><button onClick={() => setDraft(toDraft(DEFAULT))}>Non-Greek sophomore <ArrowRight size={13} /></button><button onClick={() => setDraft(toDraft(GREEK_GRAD))}>Greek graduate <ArrowRight size={13} /></button></div>
      </aside><section className="results" aria-label="Underwriting pricing review" aria-busy={busy}>
        <div className="results-heading"><div><p className="eyebrow">{view === "compare" ? "BASELINE / CURRENT RISK" : "CURRENT RISK"}</p><h2>{view === "compare" ? "Scenario pricing review" : "Risk & pricing assessment"}</h2></div><span className="calculation-status" role="status">{busy ? "Recalculating…" : !risk || proposedError ? "Check inputs" : error ? "Service unavailable" : "Model current"}</span></div>
        {error && <div role="alert" className="error-panel"><p>{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry calculation</Button></div>}
        {!risk && <div role="alert" className="error-panel">{Object.values(errors).join(" ")}</div>}
        {view === "compare" && !baseline && <div className="baseline-prompt panel"><GitCompareArrows size={23} /><div><h3>Set a baseline for the review</h3><p>Save the current risk, then change its characteristics to isolate the modeled pricing effect.</p></div><Button variant="outline" onClick={campusComparison}>On campus vs. 5 miles away</Button></div>}
        {view === "compare" && baseline && <div className="baseline-strip"><Bookmark size={17} /><div><strong>Saved baseline</strong><span>{riskSummary(baseline)}</span></div><button onClick={() => setDraft(toDraft(baseline))}>Restore inputs</button></div>}
        {assessmentCurrent && quote ? <><div className="assessment-summary"><div className="indication-stat"><span>Indicated annual premium</span><strong>{money(quote.annual_premium)}</strong><small>Four coverages · {pct(quote.assumptions.target_profit)} target margin</small></div><div><span>Program</span><strong>{quote.program}</strong><small>Membership classification</small></div><div><span>Rating tier</span><strong>{quote.tier}</strong><small>{quote.risk.class_year === "Grad student" ? "Graduate" : "Undergraduate"} · {quote.risk.off_campus.toLowerCase()}</small></div><div><span>Expected losses + LAE</span><strong>{money(quote.totals.loss_lae)}</strong><small>Before expenses and profit</small></div></div>
          {comparisonCurrent && comparison && <ScenarioAnalysis comparison={comparison} />}<CoverageTable quote={quote} />
        </> : busy && <div className="calculating-panel" role="status">Calculating coverage indications…</div>}
        <div className="review-grid"><section className="panel pricing-panel" aria-labelledby="pricing-heading"><div className="section-heading"><div><h2 id="pricing-heading">Proposed pricing review</h2><p>Assess margin against the modeled cost basis</p></div><ClipboardList size={20} /></div>
          <div className="proposed-control"><div className="field"><label htmlFor="proposed-premium">Proposed annual premium <span>USD</span></label><Input id="proposed-premium" type="number" min={0.01} max={1_000_000} step={0.01} placeholder={assessmentCurrent && quote ? quote.annual_premium.toFixed(2) : "Use model indication"} value={proposed} onChange={(e) => setProposed(e.target.value)} aria-invalid={!!proposedError} aria-describedby="proposed-note" /><small id="proposed-note" className={proposedError ? "field-error" : ""}>{proposedError || (proposed.trim() ? "Applies to the current risk only." : "Blank uses the unrounded model indication.")}</small></div><Button variant="outline" onClick={() => setProposed("")} disabled={!proposed}>Use indication</Button></div>
          {pricingCurrent && pricing ? <><div className={`pricing-position ${pricing.difference < -0.005 ? "below" : ""}`}><strong>{pricing.status}</strong><span>{signedMoney(pricing.difference)} / {signedPct(pricing.difference_pct)}</span></div><div className="pricing-metrics"><div><span>Modeled UW result</span><strong className={pricing.underwriting_profit < 0 ? "negative" : ""}>{signedMoney(pricing.underwriting_profit)}</strong></div><div><span>UW margin</span><strong>{pct(pricing.underwriting_margin)}</strong></div><div><span>Combined ratio</span><strong className={pricing.combined_ratio > 1 ? "negative" : ""}>{pct(pricing.combined_ratio)}</strong></div></div><dl className="pricing-costs"><div><dt>Losses + LAE</dt><dd>{money(pricing.loss_lae)}</dd></div><div><dt>Fixed expense</dt><dd>{money(pricing.fixed_expense)}</dd></div><div><dt>Variable expense · 20.6% of proposed</dt><dd>{money(pricing.variable_expense)}</dd></div><div className="cost-total"><dt>Break-even annual premium</dt><dd>{money(pricing.break_even_premium)}</dd></div></dl></> : <p className="pricing-placeholder" role="status">{proposedError ? "Correct the proposed premium to review profitability." : busy ? "Updating the pricing review…" : "Valid risk inputs are needed for pricing review."}</p>}
          <p className="source-note">Losses + LAE and fixed expense stay constant. Variable expense follows the proposed premium. Target margin: 5.0%. Results represent modeled expectations.</p>
        </section>{assessmentCurrent && quote && <CoverageChart quote={quote} baseline={comparisonCurrent && comparison ? comparison.baseline : undefined} />}</div>
        <section className="panel review-notes"><div className="section-heading"><div><h2>Reviewer notes</h2><p>Record observations and the basis for a proposed price</p></div><FileText size={20} /></div><label className="sr-only" htmlFor="reviewer-notes">Reviewer notes</label><Textarea id="reviewer-notes" placeholder="Document risk observations, pricing rationale, and outstanding information…" value={notes} onChange={(e) => { setNotes(e.target.value); setExportNotice(""); }} /><div className="memo-actions"><p>Export the current review before closing or refreshing this page.</p><Button onClick={exportReview} disabled={!pricingCurrent}><Download size={15} />Export review memo</Button></div>{exportNotice && <p className="storage-notice" role="status">{exportNotice}</p>}</section>
        <aside className="model-status"><Info size={17} /><div><strong>Model limitations for review</strong><p>Six-decimal coefficient snapshot · rounded manual awaiting balancing · known Guest Medical bias retained. Eligibility and approval rules have not been supplied.</p></div></aside>
        {assessmentCurrent && quote && <Calculation quote={quote} />}
      </section></div>}
      <footer><span>ABG · Underwriting workbench · synthetic actuarial case study</span><span>Model indications and reviewer observations</span></footer>
    </main>
  </div>;
}
