# PDF QA Frontend

## Canonical QA target

- frontend URL: `https://clode-web.vercel.app`
- Vercel project: `clode`
- frontend root directory: `frontend`

This is the only frontend URL that should be used for browser QA of the PDF flow.

## Non-canonical aliases

- `https://clode-iota.vercel.app`
  - backend/router project
  - not the direct frontend QA target
- `https://clode-next.vercel.app`
  - historical frontend alias
  - do not use for QA

## PDF scope

Current operational PDF scope on the canonical frontend:
- `/employees`
- `/workwear`
- `/work-cards`
- `/hours`

## Expected QA flow

For each module above:
1. open the module on `clode-web.vercel.app`
2. verify the PDF action is visible in the main action area
3. open the PDF configuration dialog
4. verify document sections are visible
5. verify table column configuration is visible where applicable
6. run the print/PDF flow from the dialog

## Product expectation

The PDF output is a dedicated Clode document:
- it is not a print of the current screen
- it has document sections
- it has a branded document header
- it supports section selection
- it supports column selection for table-based documents
