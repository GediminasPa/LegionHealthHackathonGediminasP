# Demo Agent Output

This is a sample response for the Enbrel + Wellcare Value Script demo.

## User input

```text
Drug: Enbrel SureClick 50 mg/mL
Dose: once weekly
Insurance: Medicare Part D
Plan: Wellcare Value Script (PDP), California, S4802-163-0
PA status: approved
Quoted price: $2,100
Diagnosis: rheumatoid arthritis
```

## Agent answer

### What is happening

Your Enbrel appears to be covered by your Wellcare Value Script Part D plan, but it is expensive because it is a Tier 5 specialty drug. The 2026 formulary lists Enbrel SureClick as Tier 5 with prior authorization and a quantity limit.

Because your PA is approved, the issue is probably not "coverage denied." It is cost sharing. Your plan has a deductible and Tier 5 specialty coinsurance, and Medicare Part D has a $2,100 out-of-pocket threshold in 2026. A high-cost first fill can push you to that threshold quickly.

### What not to do

Do not use the Enbrel manufacturer copay card as the main recommendation. You are on Medicare Part D, and manufacturer copay cards are generally not valid when the prescription is paid for in whole or in part by Medicare or another government healthcare program.

Also be careful with cash coupons. A discount card might show a price, but it usually cannot be combined with Medicare Part D and may not count toward your Part D out-of-pocket progress.

### Best next step

Check whether you qualify for Extra Help. If you do, it can lower Medicare Part D premiums, deductibles, coinsurance, and other drug costs.

### Backup options

1. Check independent foundation grants for rheumatoid arthritis.
   - PAN and HealthWell fund status changes often.
   - If the fund is closed, sign up for alerts.

2. Check Amgen Safety Net Foundation.
   - This may be available for qualifying Medicare patients with an affordability gap and no alternative financial support.

3. Use the Medicare Prescription Payment Plan if you cannot lower the total cost.
   - This does not reduce the total cost.
   - It spreads covered Part D out-of-pocket costs across the calendar year.

4. Ask your rheumatologist whether a clinically appropriate lower-cost covered alternative exists.

## Generated artifact - message to prescriber

```text
Subject: Help needed with Enbrel Part D affordability and alternatives

Hi Dr. [Name],

My Enbrel SureClick 50 mg/mL prescription was approved under prior authorization, but the specialty pharmacy quoted me about $2,100 for the first fill under my Wellcare Value Script Medicare Part D plan.

Could your office help me with two things?

1. Confirm that the Enbrel prior authorization is active and that the prescription is being routed to the correct network specialty pharmacy.

2. If the cost remains unaffordable, please advise whether any clinically appropriate covered alternatives would be reasonable for my rheumatoid arthritis, considering my treatment history and prior response. If you believe Enbrel remains medically necessary, could you provide a short medical necessity statement that I can use for any coverage determination, exception, or assistance application?

I am also checking Medicare Extra Help, independent foundation grants, and Amgen Safety Net Foundation assistance. If your office has a diagnosis code, prior therapy history, and recent chart note that can support those applications, that would help.

Thank you,
Maria Chen
```

## Generated artifact - Wellcare call script

```text
Hi, I am calling about my Enbrel SureClick 50 mg/mL prescription. My plan is Wellcare Value Script PDP, and I was quoted about $2,100.

Can you confirm:

1. Is my prior authorization approved and active?
2. Is Enbrel being processed under Part D, not Part B?
3. What pharmacy should fill it to receive in-network coverage?
4. How much of this quoted amount applies to my 2026 Part D out-of-pocket threshold?
5. After I reach the $2,100 Part D out-of-pocket threshold, will covered Part D drugs be $0 for the rest of the year?
6. Am I eligible to enroll in the Medicare Prescription Payment Plan to spread this cost across the rest of the calendar year?
```

