# Documentation

The diagrams live at the top of [NOTES.md](../NOTES.md); these pages carry the detail behind each
one. The code is the source of truth — where it and a diagram disagree, the code is right.

| | Page | Covers |
|---|---|---|
| 1 | [Product flow](./01-product-flow.md) | The core loop, record lifecycle, role permissions, screen navigation |
| 2 | [Database design](./02-database-design.md) | ERD, the subject-vs-actor split, index rationale, immutability |
| 3 | [API contract](./03-api-contract.md) | Endpoint surface by role, error shape, pagination shapes, request lifecycle |
| 4 | [Request/response flow](./04-request-response-flow.md) | The audited write, write conflicts, sign-in, front-end data flow |

Two supporting docs, kept out of the main path on purpose:

| Page | Covers |
|---|---|
| [Deployment runbook](./deployment.md) | How the demo is hosted, and the traps worth knowing before redeploying |
| [The design pass](./design-pass.md) | How the UI got there — the chart palette, the sidebar rewrite, the two 3D scenes |
