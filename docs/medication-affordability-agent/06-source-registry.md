# Source Registry

This registry is the working list of sources CopayGuard can connect to, curate,
or monitor over time. It is separate from the demo source list because it tracks
integration status and review cadence, not just citations.

Status legend:

- **Connected now**: suitable for direct implementation or already represented in
  code/data.
- **Curate now**: useful now, but should be stored as structured data with source
  URLs and `checked_at` timestamps.
- **Mock now**: show the workflow, but do not claim live access.
- **Partner later**: valuable, but gated by contracts, certification, or payer/PBM
  relationships.
- **Monitor**: review periodically for rule, price, or availability changes.

## Core Public Data

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| RxNorm / RxNav | Connected now | Normalize drug names, RxCUIs, NDC relationships | Quarterly or on API error | Low-friction identity layer. |
| openFDA NDC Directory | Connected now | Product, labeler, packaging, brand/generic metadata | Quarterly or on API error | Not a price source. |
| NADAC / Medicaid Drug Pricing API | Connected now | Public acquisition-cost basis by NDC | Weekly/monthly | Good grounding signal, not patient OOP. |
| CMS Part D Formulary PUF | Connected now | Medicare Part D tier, PA, step therapy, quantity limits | Quarterly | Requires download/ETL, not a live API. |
| Da Vinci PDex US Drug Formulary FHIR / USDF | Connected now / Mock now | Demo FHIR formulary workflow and future API shape | Quarterly | Public reference servers may be synthetic. Do not present sample values as real plan data. |

## Patient And Plan Inputs

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| Pharmacy receipt or quote | Connected now | Actual user-provided price and pharmacy context | Per case | Often more useful than public price estimates. |
| Pharmacy rejection message | Connected now | PA, non-formulary, refill-too-soon, quantity-limit, or plan routing clues | Per case | OCR/pasted text should be stored as user-provided evidence. |
| PA approval or denial letter | Connected now | PA status, denial reason, appeal deadline, required documentation | Per case | Drives artifact selection. |
| EOB or plan letter | Connected now | Deductible/OOP context, accumulator language, specialty routing | Per case | Watch for misleading or incomplete plan language. |
| Insurance card | Connected now | Payer, PBM, BIN, PCN, group, member context | Per case | Do not expose member IDs in logs. |
| Formulary PDF or screenshot | Connected now | Drug tier, PA, ST, QL, specialty pharmacy requirement | Per case and plan year | Prefer source timestamp and plan ID. |

## Insurance And Benefit Rails

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| Medicare.gov Part D cost pages | Curate now | Part D deductible/OOP cap and cost-stage explanation | Quarterly and plan-year changes | Context only, not live adjudication. |
| Medicare Prescription Payment Plan | Curate now | Cash-flow smoothing route for Part D | Quarterly and plan-year changes | Not a total price reduction. |
| SSA / Medicare Extra Help | Curate now | Low-income subsidy screening and routing | Quarterly and annual threshold changes | Ask income/household facts before suggesting likely eligibility. |
| State Pharmaceutical Assistance Programs | Curate now | State-level Medicare wraparound or drug assistance | Quarterly | Rules vary heavily by state. |
| Health plan or PBM member portal estimate | Mock now / Partner later | Patient-specific cost estimate before pharmacy | Per integration | User can provide screenshots manually before API access exists. |
| X12 270/271 via Stedi or clearinghouse | Partner later | Eligibility, coverage, deductible/OOP balances where payer supports it | Per integration | Requires account, payer enrollment, and PHI handling. |
| Surescripts / Arrive Health RTPB | Partner later | Patient-specific OOP, coverage, PA status, alternatives | Per integration | True price rail, but not self-serve. |

## Cash, Coupon, And Direct-Pay Sources

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| GoodRx | Mock now / Partner later | Cash/discount comparison and coupon metadata | Daily/weekly if live; monthly if manual | Alternative to insurance, not stackable. Warn on deductible/OOP credit. |
| SingleCare / RxSaver-style cards | Curate now / Partner later | Additional cash discount comparisons | Daily/weekly if live; monthly if manual | Same cash-vs-insurance warnings. |
| Mark Cuban Cost Plus Drugs | Curate now | Transparent cash pricing for covered meds | Monthly | Cash path; may not count toward insurance progress. |
| Manufacturer direct cash programs | Curate now | Brand-specific cash pathways | Monthly | Prices and eligibility can change quickly. |
| Ozempic / NovoCare cost and savings pages | Curate now | Ozempic commercial savings, self-pay bands, and deductible/OOP caveats | Monthly and before demos | Use as public estimate bands only; not a live plan claim. |
| Amazon Pharmacy / RxPass-style programs | Curate now | Cash/subscription comparison for eligible meds | Monthly | Usually best for common generics, not specialty biologics. |

## Clinical Alternative Context

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| ADA Standards of Care pharmacologic treatment chapter | Curate now | Diabetes medication class context for prescriber-discussion alternatives | Annually and when living standards update | Do not present as a patient-specific substitution recommendation. |

## Assistance Programs

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| Manufacturer copay card pages | Curate now | Commercial copay support eligibility and caps | Monthly and before demo | Block for Medicare/Medicaid/government coverage. |
| Manufacturer PAP pages | Curate now | Free-drug or underinsured support | Monthly | Eligibility varies by income, insurance, diagnosis, and alternatives. |
| NeedyMeds | Curate now / Partner later | PAP discovery | Monthly | No reliable public API assumption. Store facts with source URLs. |
| RxAssist | Curate now / Partner later | PAP discovery | Monthly | Same structured-data approach. |
| Medicine Assistance Tool | Curate now / Partner later | PAP discovery | Monthly | Same structured-data approach. |
| PAN Foundation | Curate now | Disease-fund grants and status | Weekly for active cases | Fund status changes quickly. |
| HealthWell Foundation | Curate now | Disease-fund grants and status | Weekly for active cases | Fund status changes quickly. |
| Good Days | Curate now | Disease-fund grants and status | Weekly for active cases | Fund status changes quickly. |
| The Assistance Fund | Curate now | Disease-fund grants and status | Weekly for active cases | Fund status changes quickly. |
| CancerCare Co-Payment Assistance Foundation | Curate now | Oncology grant routing | Weekly for active cases | Disease-specific availability. |
| Patient Advocate Foundation | Curate now | Financial aid and case-management routing | Weekly for active cases | Confirm program scope per disease. |

## Accumulator, Maximizer, And AFP Detection

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| Local maximizer vendor table | Connected now | Vendor-name and keyword detection | Monthly/quarterly | Source: `../HealthcareLandscapeResearch/data/maximizer-vendors.json`. |
| KFF copay adjustment background | Curate now | Explain accumulator/maximizer mechanics | Quarterly | Background only; use user's plan documents for actual determination. |
| Patient plan documents | Connected now | Detect actual plan language | Per case | Look for "variable copay", "non-essential health benefit", "will not count", and vendor names. |
| Employer benefit guide | Connected now | Detect plan-level accumulator/maximizer programs | Per case and plan year | Often clearer than pharmacy receipts. |

## Appeals And Execution Sources

| Source | Status | Use | Review cadence | Notes |
|---|---|---|---|---|
| Payer appeal instructions | Curate now | Appeal address, deadlines, fax/upload path | Per case | Must come from the actual plan or denial when possible. |
| CMS Part D coverage determination and appeals guidance | Curate now | Medicare appeal path | Quarterly | Useful for Medicare-specific artifact routing. |
| Prescriber clinical details from user | Connected now | Medical necessity, failed alternatives, contraindications | Per case | Required before strong appeal drafting. |
| CoverMyMeds / Surescripts ePA | Partner later | Submit or track ePA | Per integration | Do not claim auto-submission without access and authorization. |
| Fax/email/e-sign workflow | Mock now / Partner later | Send prepared artifacts | Per integration | Human review/signature should remain explicit. |

## Review Process

Use this lightweight review loop:

1. **Per active case**: verify patient-provided quote, plan name, PA status,
   fund status, and any appeal deadline.
2. **Weekly**: review active foundation fund status and cash/coupon sources used
   in current demo cases.
3. **Monthly**: review manufacturer copay/PAP terms, DTC cash programs,
   accumulator/maximizer vendor names, and curated assistance data.
4. **Quarterly**: refresh CMS Part D files, source URLs, API assumptions, and
   public regulatory context.
5. **Before public demo or release**: re-run guardrail tests for Medicare copay
   cards, cash-vs-insurance warnings, accumulator detection, and uncertainty
   language.

Every sourced fact stored for the agent should include:

- `source_id`
- `source_url`
- `checked_at`
- `retrieval_method`: API, user_upload, manual_curation, mock, or partner
- `confidence`: high, medium, or low
- `applies_to`: commercial, Medicare, Medicaid, uninsured, or unknown
- `limitations`
