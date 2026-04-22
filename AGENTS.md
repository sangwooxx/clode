# AGENTS

TASK TYPE: [bugfix / refactor / feature / integration / qa-fix / release-integrity]

CONTEXT:
We are building a production-grade SaaS ERP for contractor companies.
Architecture: Next.js frontend + Python backend API.
This repository uses separate Vercel projects for frontend and backend, so release integrity must be verified explicitly and not inferred from local state alone.

GOAL:
Every change that affects the live product must be published and verified on GitHub and Vercel before it is reported as done.

SCOPE:
- repo-wide engineering workflow
- frontend, backend, routing, deploy, alias, and environment changes
- any task that changes user-visible behavior or production runtime behavior

CONSTRAINTS:
- do not report `done` from a local-only state
- do not treat green CI or a green Vercel check as sufficient proof by itself
- do not mix unrelated local commits into a production release
- if local `main` contains unrelated work, isolate the scoped release from `origin/main`
- keep release evidence concrete: commit SHA, deployment target, alias/domain, live URL result

REQUIRED ACTIONS:
1. Analyze current code and release state.
2. If the local branch is dirty or contains unrelated commits, isolate the scoped change on a clean branch based on `origin/main`.
3. Implement and verify the change locally.
4. Commit the scoped change.
5. Push the change to GitHub.
6. Verify the correct Vercel project built the expected commit.
7. Verify the canonical alias or public domain points to the expected deployment.
8. Run a live smoke-check on the real public URL for the impacted flow.
9. Only then report the task as complete.

DEFINITION OF DONE:
- the scoped change exists on GitHub in the intended branch, normally `main`
- the expected Vercel deployment is ready
- the canonical alias or public domain resolves to that deployment
- the impacted live flow passes a smoke-check on the public URL
- the final report includes exact release evidence

REPORT FORMAT:
STATUS:
CHANGES:
VERIFICATION:
RISKS:
NEXT STEP:
