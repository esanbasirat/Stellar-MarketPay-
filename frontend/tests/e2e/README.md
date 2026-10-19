# End-to-End (E2E) & Visual Regression Test Suite

This directory contains the Playwright end-to-end (E2E), accessibility (a11y), and visual regression test suites for the Stellar MarketPay frontend.

---

## Directory Structure

```
frontend/tests/e2e/
├── accessibility.spec.ts         # Automated WCAG 2.1 AA & contrast audits via @axe-core/playwright
├── core-journeys.spec.ts          # Core user journeys across landing, jobs, and dashboard
├── dispute-flow.spec.ts           # Dispute creation, evidence submission, and arbitration flows
├── freelancer-onboarding.spec.ts  # Multi-step freelancer profile & onboarding wizard
├── full-marketplace-flow.spec.ts  # End-to-end client job posting -> escrow lock -> release
├── visual-regression.spec.ts      # Pixel-level visual regression screenshots (dark & light themes)
├── wallet-connection.spec.ts      # Freighter wallet extension mock connection & auth flows
├── helpers/                       # Test fixtures, mock data, and DOM stabilizers
└── snapshots/                     # Committed baseline screenshots for visual regression
    └── visual-regression.spec.ts-snapshots/
```

---

## Running Tests Locally

From the `frontend/` directory:

### 1. Run all E2E specs
```bash
npm run test:e2e
```

### 2. Run Accessibility audits
```bash
npm run test:a11y
```

### 3. Run Visual Regression suite
```bash
npm run test:visual
```

### 4. Update Visual Regression baseline snapshots
When intentional design changes or theme updates are made, update the committed baseline snapshots:
```bash
npm run test:visual:update
```

---

## CI & Nightly Automation

Automated testing is divided between fast PR checks and exhaustive nightly verification:

### 1. Pull Request / Push CI (`.github/workflows/ci.yml` & `e2e.yml`)
- Runs targeted wallet connection specs and smoke journey tests on pull requests.
- Designed to provide quick (< 5 min) feedback to contributors.

### 2. Nightly Full-Suite Execution (`.github/workflows/e2e.yml`)
- **Trigger**: Runs every night at `02:00 UTC` via GitHub Actions `schedule:` cron (`0 2 * * *`), or on-demand via `workflow_dispatch`.
- **Scope**: Executes **all** test suites across both `chromium` (light mode) and `chromium-dark` (dark mode) projects:
  - Accessibility (`accessibility.spec.ts`)
  - User journeys (`core-journeys.spec.ts`, `full-marketplace-flow.spec.ts`, `freelancer-onboarding.spec.ts`)
  - Dispute resolution (`dispute-flow.spec.ts`)
  - Wallet integration (`wallet-connection.spec.ts`)
  - Visual regression (`visual-regression.spec.ts`)
- **Artifact Retention**: On completion of every run (`if: always()`), full HTML reports and test results (`playwright-report/` and `test-results/`) are uploaded and retained for **30 days**.

---

## Failure Notification Path

When the nightly scheduled run fails:

1. **Artifacts Published**: The workflow automatically attaches `nightly-e2e-report-<runId>` containing HTML test reports, failure traces, and side-by-side visual difference images.
2. **Automated Incident Issue**:
   - The workflow queries open repository issues for the label `e2e-failure`.
   - If no open issue exists, it files a new GitHub issue titled `🚨 Nightly E2E / Visual Regression Suite Failed (YYYY-MM-DD)` labeled with `bug`, `e2e-failure`, and `automated-test`.
   - If an existing open incident issue exists, it appends a comment linking to the latest red workflow run.
3. **Triaging Failures**:
   - Download the test report artifact from the run summary.
   - Inspect diff images under `frontend/test-results/`.
   - If the failure is an unintended regression, file a bug fix.
   - If the failure is due to an intentional UI update, regenerate baseline snapshots with `npm run test:visual:update` and open a PR.
