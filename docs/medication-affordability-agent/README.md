# Legion Health Hackathon - Medication Affordability Agent

This folder contains the practical version of the thesis we discussed: a hackathon-scoped agent for patients who already have a prescription and are shocked by the pharmacy price.

## Recommended focus

Build a **post-prior-authorization prescription price rescue agent**.

The user story:

> My doctor prescribed a medication. Prior authorization was approved, denied, or is stuck. The pharmacy still says the drug costs hundreds or thousands of dollars. What should I do next?

The agent should not try to be a live PBM-connected price oracle. For the hackathon, it should use the patient's quoted price, public formularies, public drug assistance resources, and uploaded documents to route the patient to the right next action.

## Folder contents

- [01-product-scope.md](01-product-scope.md): realistic thesis, MVP, and what not to claim.
- [02-real-demo-case-enbrel-wellcare.md](02-real-demo-case-enbrel-wellcare.md): a concrete demo using a real drug and real plan.
- [03-agent-routing-rules.md](03-agent-routing-rules.md): deterministic routing logic for the agent.
- [04-demo-agent-output.md](04-demo-agent-output.md): sample output the agent can show in the demo.
- [05-agent-architecture.md](05-agent-architecture.md): orchestrator and specialist-agent split.
- [06-source-registry.md](06-source-registry.md): integration source list with status and review cadence.
- [demo-routing-data.json](demo-routing-data.json): structured data seed for the prototype.
- [sources.md](sources.md): source links used for the demo and pitch.

## The sharp one-liner

GoodRx tells you a coupon price. This agent tells you the correct next move for your insurance situation and generates the paperwork.

## The realistic hackathon promise

Do claim:

- "We diagnose why the drug is expensive."
- "We route by insurance type, eligibility, and plan restrictions."
- "We generate the next artifact: appeal letter, prescriber message, assistance checklist, or call script."
- "We can work without PBM connectivity because the patient provides the quoted pharmacy price and documents."

Do not claim:

- "We know the exact live patient copay before adjudication."
- "We automatically submit prior authorizations or PAP applications."
- "We can guarantee a lower price for every patient."
