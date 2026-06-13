# Agent Architecture

CopayGuard should use one primary orchestrator agent with narrower specialist
agents or deterministic tools behind it. The orchestrator owns the patient-facing
thread, decides which case type it is handling, calls the right specialist, and
merges the results into one coherent recommendation.

## Orchestrator Responsibilities

The orchestrator should:

- Classify the case moment: before fill, at sticker shock, or after coupon behavior.
- Preserve patient context across the investigation.
- Decide which specialist agents or tools are needed.
- Enforce eligibility guardrails before presenting recommendations.
- Keep uncertainty visible, especially when no live adjudicated price is available.
- Produce the final patient-facing output: diagnosis, best next step, backup routes,
  generated artifact, and questions to confirm.

The orchestrator should not:

- Invent eligibility rules.
- Treat cash prices as stackable with insurance.
- Recommend manufacturer copay cards for Medicare, Medicaid, TRICARE, VA, CHAMPVA,
  or other government-program coverage.
- Claim live PBM, RTPB, ePA, or foundation-submission access unless the integration
  actually exists.

## Specialist Agents And Tools

| Specialist | When to run | Main outputs |
|---|---|---|
| Intake/document extraction | Any uploaded receipt, denial, EOB, plan letter, insurance card, or pharmacy screenshot | Structured facts, quoted price, PA status, payer/PBM names, rejection text, accumulator keywords |
| Drug identity | Every case | Normalized drug name, RxCUI/NDC candidates, brand/generic, dose form, manufacturer |
| Public price basis | Before fill or sticker shock | NADAC/acquisition-cost context, cash-price caveats, public list-price context when available |
| Formulary and UM | Before fill, PA uncertainty, non-formulary, step therapy, quantity limit | Tier, PA, step therapy, quantity limit, specialty status, appeal/exception trigger |
| Insurance eligibility router | Every case | Commercial, Medicare, Medicaid, uninsured, unknown route; copay-card legality; deductible/OOP caveats |
| Cash/coupon comparator | Sticker shock or uninsured/cash scenario | Cash-vs-insurance recommendation with deductible/OOP warning |
| Assistance matcher | High price, specialty drug, Medicare, uninsured, or underinsured | Copay card, PAP, foundation, Extra Help, SPAP, M3P, or DTC cash candidates |
| Accumulator/maximizer detector | Commercial insurance, copay-card use, or odd coupon behavior | Risk level, detected vendor/keywords, plan-call script |
| Appeal/artifact writer | Denied, non-formulary, PA pending, unaffordable covered drug, or exception need | Appeal letter, coverage exception request, prescriber note, plan-call script, PAP checklist |
| Follow-up monitor | Fund closed, PA pending, appeal sent, refill upcoming, coupon cap risk | Reminders, recheck tasks, fund-open alerts, next-fill check-in |

## Background Execution Pattern

Run the orchestrator synchronously for the main chat response, then run specialist
work in background passes when it can improve the case without blocking the user.

Good background candidates:

- Rechecking foundation fund status.
- Refreshing program terms and source timestamps.
- Monitoring refill dates or appeal follow-up windows.
- Parsing uploaded documents after the first response.
- Searching for accumulator/maximizer language in long plan PDFs.

Bad background candidates:

- Anything that changes a safety-critical eligibility rule without review.
- Anything that claims live patient-specific benefit information without a real
  eligibility or RTPB integration.
- Anything that submits forms or shares PHI externally without explicit patient
  authorization.

## Case Routing

1. **Before fill**
   - Run drug identity, formulary/UM, public price basis, assistance matcher, and
     cash/coupon comparator.
   - Goal: identify likely blockers and cheaper routes before the pharmacy quote.

2. **At sticker shock**
   - Run document extraction, eligibility router, assistance matcher, cash/coupon
     comparator, and appeal/artifact writer.
   - Goal: explain the high quote and produce the next action.

3. **After weird coupon behavior**
   - Run document extraction, accumulator/maximizer detector, eligibility router,
     and artifact writer.
   - Goal: separate "coupon lowered today's price" from "coupon counted toward
     deductible/OOP" and create a plan-call or appeal path.

## Implementation Notes

- Prefer deterministic functions for eligibility gates and dangerous branches.
- Use the LLM for extraction, summarization, routing explanation, and artifact
  drafting.
- Store each specialist result as a sourced fact with `checked_at`, confidence,
  and whether it came from user-provided text, public source data, or a mocked
  integration.
- The final recommendation should always say whether a route is a true price
  reduction, cash-flow smoothing, coverage path, or unknown.
