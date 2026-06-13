# Product Scope - Realistic Hackathon Version

## Core problem

Patients are told a medication is "approved" or "covered," then still face a high pharmacy price. The real problem is not only price search. The patient needs to know:

1. Why is this drug expensive for me?
2. Which assistance pathway is legally and financially valid for my insurance type?
3. What document, call, appeal, or enrollment step should I do next?

This is especially painful after prior authorization because the patient assumes approval means affordability. In reality, approval can still leave the patient with a deductible, specialty-tier coinsurance, Medicare Part D cost sharing, a formulary restriction, a specialty pharmacy requirement, or a copay accumulator/maximizer.

## Recommended product

Build an **eligibility-correct affordability routing agent**.

Inputs:

- Drug name and dose.
- Quoted pharmacy price.
- Insurance type: commercial, Medicare, Medicaid, uninsured, unknown.
- Prior authorization status: approved, denied, pending, unknown.
- Optional upload: pharmacy receipt, PA approval/denial, plan letter, EOB, insurance card, formulary screenshot.

Outputs:

- Plain-English diagnosis.
- Ranked next actions.
- One generated artifact: appeal letter, coverage exception request, prescriber message, insurer call script, or assistance application checklist.

## Why this is a real inefficiency

The system has many legitimate cost-reduction levers, but they are scattered:

- Commercial copay cards can work immediately but are blocked for Medicare/Medicaid and can be weakened by accumulators/maximizers.
- Medicare patients cannot usually use manufacturer copay cards with Part D, but they may qualify for Extra Help, foundations, PAPs, or the Medicare Prescription Payment Plan.
- Foundation grants open and close unpredictably.
- Prior authorization and appeals are intimidating and underused.
- Cash/discount prices can sometimes beat insurance, but they usually do not count toward the deductible or Medicare Part D out-of-pocket progress.

The product value is deciding the right route, not listing every possible coupon.

## MVP flow

1. Intake
   - Ask for drug, price, insurance type, PA status, and optional upload.

2. Normalize
   - Map drug to brand/generic, class, common diagnosis, specialty status, and manufacturer support programs.

3. Plan check
   - Use public formulary data where available.
   - For the demo, use a real Medicare Part D plan and drug.
   - For commercial users, rely on uploaded plan language and vendor-name detection.

4. Route
   - Commercial: copay card first, unless accumulator/maximizer risk is detected.
   - Medicare: no manufacturer copay card; route to Extra Help, foundations, PAP, Medicare Prescription Payment Plan, or coverage appeal.
   - Medicaid: no manufacturer copay card; route to Medicaid formulary/PA appeal and state support.
   - Uninsured: manufacturer PAP, cash price, DTC cash program, charity care.
   - Denied or non-formulary: generate appeal/formulary exception.

5. Execute
   - Generate one signed-ready or copy-ready artifact.

## Best hackathon demo

Use a real drug and real plan:

- Drug: Enbrel SureClick 50 mg/mL, a high-cost specialty biologic.
- Plan: Wellcare Value Script (PDP), 2026 Medicare Part D plan, California plan ID S4802-163-0.
- Situation: Prior authorization is approved, but the patient is quoted about $2,100 for the first fill because it is a covered high-cost Part D specialty drug and the patient has not yet met the 2026 Part D out-of-pocket cap.

The agent's "wow" moment:

> A manufacturer copay card looks attractive, but because this patient is on Medicare Part D, the agent blocks that route and instead gives the Medicare-correct options: Extra Help screening, foundation status check, Amgen Safety Net Foundation eligibility, Medicare Prescription Payment Plan smoothing, and a prescriber/plan letter if PA or exception support is needed.

## What makes this beyond GoodRx

GoodRx is useful for cash/discount comparison. But this agent does things GoodRx does not center:

- Identifies when cash is the wrong move because it will not count toward insurance progress.
- Blocks legally invalid copay-card routing for Medicare/Medicaid.
- Detects prior authorization, step therapy, quantity limit, and specialty-tier problems.
- Detects accumulator/maximizer language in commercial plans.
- Produces the next artifact instead of only listing links.

## Realistic implementation for the hackathon

Use:

- Public formulary PDFs or manually curated formulary rows.
- Public manufacturer support pages.
- Public Medicare rules.
- A small curated assistance-resource table.
- Uploaded documents and LLM extraction.
- Deterministic eligibility rules for dangerous branches, especially Medicare/copay card logic.

Do not require:

- PBM API access.
- Surescripts RTPB.
- GoodRx API approval.
- CoverMyMeds/ePA API.
- Live foundation portal submission.

