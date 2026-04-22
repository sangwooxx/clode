# Release Checklist

## Mandatory release integrity gate

- `done` does not mean local tests only
- any live-impacting change must complete `commit -> push -> deploy -> alias/domain verification -> live smoke-check`
- green GitHub CI or a green Vercel check is not enough without verifying the public alias/domain
- if local `main` contains unrelated work, release the scoped change from a clean branch based on `origin/main`
- the release report must include the exact GitHub SHA, deployment target, canonical alias/domain, and live smoke-check result
- for frontend browser QA, the canonical public frontend remains `https://clode-web.vercel.app`

## Before internal milestone closure

- Dev reports `ready_for_qa`
- QA result recorded
- stage status updated
- docs updated where relevant

## Before publishing a new demo build

- scoped change is already committed and pushed to GitHub
- expected Vercel project built the expected commit
- canonical alias or public domain points to the intended deployment
- live smoke-check on the public URL passed for the impacted flow
- supported startup path verified
- demo data verified
- no real business data present
- login flow verified
- contract / invoice / time modules consistent
- known limitations updated
- changelog updated

## Before external handoff

- demo credentials confirmed
- README current
- roadmap current
- QA result current
- UI QA pass confirmed
- no temporary QA artifacts in repository
