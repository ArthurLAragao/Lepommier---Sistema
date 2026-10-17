# Permission matrix

The API enforces the implemented Phase 2 permissions below. The operational matrix specifies later modules; it does not claim that those modules exist. A hidden/disabled UI control is not authorization. Managers receive only the explicitly listed corrections. No default production credentials.

## Enforced in Phase 2

| Named permission                                                | OWNER | MANAGER | CASHIER | PRODUCTION |
| --------------------------------------------------------------- | ----- | ------- | ------- | ---------- |
| profile.self: current account, logout, own password change      | Yes   | Yes     | Yes     | Yes        |
| accounts.manage: list/create/edit/activate/disable/reset others | Yes   | No      | No      | No         |
| security.review: latest safe security events via API            | Yes   | No      | No      | No         |

The shared permission map, reusable route check and service reauthorization under the database lock enforce these rules. Settings navigation contains personal password controls and non-sensitive diagnostics for all roles; this resolves the earlier broad “Users/roles/settings” label. Only OWNER administers accounts or future store configuration. There is no editable store configuration in this phase. The authenticated overview is a non-operational foundation for all roles, without invented business figures.

Owner changes require account version and a reason. Any role change/disabling revokes the target's sessions. Resetting another account requires the owner's current password and a reason; self-reset uses own password change. Login identifiers are immutable. No destructive account deletion route exists. The last active owner cannot be demoted or disabled; concurrent changes reauthorize under the same database lock. Maximum five active accounts includes owners; deactivated accounts retain references/history. The limit is an explicit initial deployment policy, subject to owner review before pilot.

## Operational matrix for Phases 3–9

| Capability                       | OWNER | MANAGER                         | CASHIER             | PRODUCTION      |
| -------------------------------- | ----- | ------------------------------- | ------------------- | --------------- |
| Operational dashboard            | Yes   | Yes                             | Limited             | Production only |
| POS and pickup orders            | Yes   | Yes                             | Yes                 | No              |
| Necessary customer name/phone    | Yes   | Yes                             | Yes                 | No              |
| Sensitive CPF/private fields     | Yes   | Restricted                      | No                  | No              |
| Customer exports/imports         | Yes   | No by default                   | No                  | No              |
| Customer anonymization           | Yes   | No                              | No                  | No              |
| Products/categories/prices       | Yes   | Yes                             | Read active         | Read relevant   |
| Discount with reason             | Yes   | Yes                             | No                  | No              |
| Production and batch receipts    | Yes   | Yes                             | No                  | Yes             |
| Waste in permitted batches       | Yes   | Yes                             | No                  | Yes             |
| Stock adjustment/eligible return | Yes   | Yes, with reason                | No                  | No              |
| Record one full payment          | Yes   | Yes                             | Assigned session    | No              |
| Approve full refund              | Yes   | No by default                   | No                  | No              |
| Open/operate/close cash          | Yes   | Yes                             | Assigned session    | No              |
| Cash closing review              | Yes   | Yes                             | Own session summary | No              |
| Traceable cash correction        | Yes   | Yes, with reason                | No                  | No              |
| Business reports/export          | Yes   | Yes, excluding customer exports | No                  | Production only |
| Users/roles/settings             | Yes   | No                              | No                  | No              |
| Backup administration            | Yes   | No                              | No                  | No              |
| Audit/security review            | Yes   | No by default                   | No                  | No              |

## Session/setup controls implemented

One-time owner setup requires direct loopback plus a private file-delivered installation secret, exact Origin and required CSRF header. A database transaction closes it permanently while creating the owner; forwarded headers cannot authorize setup. Argon2id hashes, opaque digest-backed sessions, HttpOnly/SameSite=Strict/Path=/ cookies, 12-hour absolute expiry and logout invalidation are implemented. Secure applies to HTTPS; local HTTP is an explicit exception. A new login replaces old access. Password/role/activation changes revoke sessions. Missing/null Origin and missing/invalid CSRF header are rejected for every identity mutation. No CORS allowance or browser token storage.

Persistent login budgets are eight attempts per normalized identifier and sixty per direct source per fixed ten-minute window, with temporary retries and bounded password work. Security audit records login/logout/setup/account/permission/password events and coalesced denials. Price/discount/refund/cash/export/import/business audit comes with those modules. See AUTH_SECURITY.md for exact behavior and the Portuguese access guide for local recovery. Future permissions must be enforced on each backend endpoint before enabling its UI.
