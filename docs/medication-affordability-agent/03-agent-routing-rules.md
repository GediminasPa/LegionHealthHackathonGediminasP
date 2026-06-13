# Agent Routing Rules

This should be implemented as deterministic logic around the LLM. The LLM can extract text and draft documents, but it should not invent eligibility rules.

## Inputs

Required:

- `drug_name`
- `quoted_price`
- `insurance_type`
- `pa_status`

Useful optional fields:

- `plan_name`
- `plan_id`
- `diagnosis`
- `deductible_remaining`
- `oop_remaining`
- `uploaded_text`
- `pharmacy_type`
- `state`
- `household_income`
- `household_size`

## Rule 1 - Public insurance blocks commercial copay cards

If insurance is Medicare, Medicaid, TRICARE, VA, CHAMPVA, or other federal/state healthcare program:

- Do not recommend manufacturer copay card as a secondary payer.
- Route to:
  - Extra Help/LIS or Medicaid support.
  - State Pharmaceutical Assistance Program, if applicable.
  - Independent charitable foundation.
  - Manufacturer PAP/free-drug program, if eligible.
  - Medicare Prescription Payment Plan, for Part D smoothing.
  - Formulary exception or appeal if denied/restricted.
  - Cash/discount comparison only as an "instead of insurance" option with a warning that it may not count toward deductible/OOP.

## Rule 2 - Commercial insurance can use copay cards, but check accumulator/maximizer risk

If insurance is commercial:

- Check for manufacturer copay card eligibility.
- Before recommending it as the main answer, scan uploaded text for accumulator/maximizer signals:
  - "copay assistance will not count"
  - "will not apply to your deductible"
  - "will not apply to your out-of-pocket maximum"
  - "non-essential health benefit"
  - "variable copay"
  - "PrudentRx"
  - "SaveOnSP"
  - "Variable Copay"
  - "Copay Armor"
  - "Payer Matrix"
  - "SHARx"
  - "PaydHealth"

If detected:

- Warn that the copay card may lower today's price but may not build deductible/OOP credit.
- Recommend asking the plan/PBM whether manufacturer assistance counts toward deductible and OOP max.
- Generate a plan-call script.

## Rule 3 - PA status changes the artifact

If PA is approved:

- Diagnose affordability/cost sharing.
- Generate prescriber message, foundation/PAP checklist, plan-call script, or payment-plan instructions.

If PA is denied:

- Generate appeal letter or coverage determination request.
- Ask for denial reason, diagnosis, prior therapies tried, and prescriber support.

If PA is pending:

- Generate office follow-up message and missing-information checklist.

If PA is unknown:

- Ask the user to upload or describe the pharmacy rejection/approval.
- If the drug has PA on the public formulary, tell the user PA is likely required.

## Rule 4 - Non-formulary or restriction

If drug is non-formulary:

- Generate formulary exception request.
- Ask prescriber for medical necessity and failed alternatives.
- Show covered alternatives, if known.

If drug has step therapy:

- Ask whether required alternatives were tried or contraindicated.
- Generate step-therapy exception request if appropriate.

If drug has quantity limit:

- Compare prescribed quantity to limit.
- If over limit, generate quantity-limit exception request.

## Rule 5 - Cash/discount price

Cash/discount cards are useful only when:

- The drug is not covered.
- The patient is uninsured.
- The cash price is materially lower than insurance cost.
- The patient understands cash spend may not count toward deductible/OOP.

For Medicare:

- Do not combine cash coupon with Part D in the same transaction.
- Explain that using a discount card instead of Part D may not count toward Part D OOP progress.

## Rule 6 - Foundation/PAP handling

Foundation grants:

- Treat status as volatile.
- Always show current status timestamp.
- If closed, generate alert-signup instructions.
- If open, generate application checklist.

Manufacturer PAP:

- Check insurance type, income, residency, and affordability-gap requirements.
- Do not claim guaranteed approval.
- Generate checklist and patient/prescriber forms.

## Output format

The agent should always produce:

1. "What is happening"
2. "What not to do"
3. "Best next step"
4. "Backup options"
5. "Generated artifact"
6. "Questions to confirm"

