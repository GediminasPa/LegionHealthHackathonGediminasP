# Real Demo Case - Enbrel on Wellcare Value Script PDP

## Demo persona

Name: Maria Chen  
Location: California  
Insurance: Medicare Part D through Wellcare Value Script (PDP), plan ID S4802-163-0  
Diagnosis: Rheumatoid arthritis  
Drug: Enbrel SureClick 50 mg/mL, one injection weekly  
Status: Prior authorization approved  
Problem: Specialty pharmacy says the first fill will cost about $2,100

This is realistic and demoable because the plan and drug data are public.

## Real plan facts

Plan:

- Wellcare Value Script (PDP), 2026.
- California plan ID: S4802-163-0.
- Annual deductible: $615.
- Deductible applies to tiers 3-6.
- Tier 5 specialty drug coinsurance: 25%.
- 2026 Medicare Part D out-of-pocket threshold: $2,100.
- After the threshold is reached, covered Part D drugs cost $0 for the rest of the calendar year.

Formulary facts:

- Enbrel SureClick 50 mg/mL is listed on the Wellcare Value Script 2026 formulary.
- It is Tier 5 specialty.
- It requires prior authorization.
- It has a quantity limit of 8 mL per 28 days.

Drug price facts:

- Enbrel's January 7, 2026 list price/WAC for 50 mg/mL SureClick is $2,141.37 per syringe.
- A common maintenance dose is 50 mg weekly.
- Four weekly syringes would have a WAC proxy of about $8,565.48 before plan discounts or rebates.

Important caveat:

The actual point-of-sale cost is based on the plan's adjudicated price, not WAC. For a hackathon demo, WAC is a defensible public proxy to explain why 25% specialty coinsurance can create a very high first-fill bill.

## Why the patient sees a high price even after PA

Prior authorization answers one question:

> Will the plan cover the drug at all?

It does not answer:

> Will the patient be able to afford the cost share?

For Maria, the likely explanation is:

- Enbrel is covered but sits on a high-cost specialty tier.
- The plan has a deductible and 25% specialty coinsurance.
- Because Enbrel is expensive, the patient can hit the 2026 Part D out-of-pocket cap quickly.
- The first fill can still be financially painful even though annual exposure is capped.

## What the agent should not do

The agent should not recommend the Enbrel commercial copay card to Maria.

Reason:

- Maria is on Medicare Part D.
- Manufacturer copay cards are generally for commercially insured patients.
- Enbrel/Amgen support terms exclude prescriptions paid in whole or in part by Medicare, Medicaid, or other federal/state healthcare programs.

This is a strong demo moment because many naive "savings agents" would suggest the copay card. The correct agent blocks it.

## Correct route for this patient

Recommended order:

1. Confirm PA approval and specialty pharmacy routing.
   - If PA is approved, the problem is cost sharing, not coverage denial.
   - If PA is denied or pending, generate a coverage determination/appeal request.

2. Screen for Extra Help/LIS.
   - Medicare says Extra Help can lower Part D premiums, deductibles, coinsurance, and other drug costs.
   - If eligible, this is likely the best route.

3. Check current foundation grant status.
   - PAN Foundation has an RA fund page, but fund status can change and, as of the June 13, 2026 check, PAN is transitioning toward TotalAssist on July 1, 2026.
   - HealthWell has an AutoImmune Medicare Access fund category covering RA, PsA, psoriasis, and ankylosing spondylitis, but its disease-fund listing showed that fund as closed on the June 13, 2026 check.
   - The product should never hardcode "available"; it should show "check now / sign up for alerts."

4. Check Amgen Safety Net Foundation.
   - Amgen Safety Net Foundation may support qualifying Medicare patients with an affordability gap and no alternative financial support.
   - For Enbrel, the 2026 income guidance in the public application materials should be checked in the app.

5. Offer Medicare Prescription Payment Plan smoothing.
   - This does not reduce the total cost.
   - It spreads covered Part D out-of-pocket costs across the calendar year.
   - For a patient facing a $2,100 first-fill shock, smoothing can convert the immediate cash shock into a monthly budgeting problem.

6. Generate a prescriber message.
   - Ask the rheumatologist whether a covered lower-cost alternative is clinically appropriate.
   - Ask the office to include medical necessity and prior treatment history if an exception or appeal is needed.

## Demo math

Use this as an explanation, not as a guaranteed price quote:

```text
Drug: Enbrel SureClick 50 mg/mL
Dose: 1 syringe weekly
Public WAC: $2,141.37 per syringe
Four-week WAC proxy: $8,565.48
Plan specialty coinsurance: 25%
2026 Medicare Part D OOP threshold: $2,100

If Maria has spent $0 toward Part D OOP this year, a high-cost first fill can push her to the $2,100 cap.
After that, covered Part D drugs are $0 for the rest of 2026.
```

## Demo result

The agent's answer:

> Your Enbrel is covered but expensive because it is a Tier 5 specialty drug with prior authorization and 25% coinsurance. Since you are on Medicare Part D, do not use the manufacturer copay card. Your best next steps are Extra Help screening, foundation/PAP checks, and Medicare Prescription Payment Plan smoothing. I drafted the message to your rheumatologist and the call script for Wellcare.

