# QA Process

## Non-negotiable rule

No stage is closed without QA PASS.

## Stage flow

1. Dev implements
2. Dev reports `ready_for_qa`
3. QA validates the stage
4. QA returns `PASS` or `FAIL`
5. `FAIL` goes back to Dev
6. Only `PASS` allows closure

## QA types used in this project

### Logic QA
- source of truth validation,
- CRUD correctness,
- ID-based consistency,
- archival behavior,
- migration and data integrity.

### UI QA
- no horizontal scroll on core desktop views,
- aligned cards and panels,
- readable tables,
- text fitting inside controls and tiles,
- stable spacing and layout,
- no visual regressions between modules.

## MVP-level QA expectation

Before external handoff, QA must explicitly confirm:
- operational correctness,
- data consistency,
- visual readiness,
- stable supported runtime,
- demo-safe data only.
