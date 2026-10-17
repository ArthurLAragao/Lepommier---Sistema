# Permission matrix

The API enforces Phase 2 identity, Phase 3 registry and Phase 4 inventory permissions below. The remaining operational matrix specifies later modules; it does not claim those modules exist. A hidden/disabled UI control is not authorization. No default production credentials.

## Enforced in Phase 2

| Named permission                                                | OWNER | MANAGER | CASHIER | PRODUCTION |
| --------------------------------------------------------------- | ----- | ------- | ------- | ---------- |
| profile.self: current account, logout, own password change      | Yes   | Yes     | Yes     | Yes        |
| accounts.manage: list/create/edit/activate/disable/reset others | Yes   | No      | No      | No         |
| security.review: latest safe security events via API            | Yes   | No      | No      | No         |

The shared permission map, reusable route check and service reauthorization under the database lock enforce these rules. Settings navigation contains personal password controls and non-sensitive diagnostics for all roles; this resolves the earlier broad “Users/roles/settings” label. Only OWNER administers accounts or future store configuration. There is no editable store configuration in this phase. The authenticated overview is a non-operational foundation for all roles, without invented business figures.

Owner changes require account version and a reason. Any role change/disabling revokes the target's sessions. Resetting another account requires the owner's current password and a reason; self-reset uses own password change. Login identifiers are immutable. No destructive account deletion route exists. The last active owner cannot be demoted or disabled; concurrent changes reauthorize under the same database lock. Maximum five active accounts includes owners; deactivated accounts retain references/history. The limit is an explicit initial deployment policy, subject to owner review before pilot.

## Enforced in Phase 3

| Named permission                    | OWNER                                     | MANAGER                      | CASHIER                        | PRODUCTION  |
| ----------------------------------- | ----------------------------------------- | ---------------------------- | ------------------------------ | ----------- |
| customers.read                      | All states                                | All states                   | Active only                    | No          |
| customers.write                     | Create/edit                               | Create/edit permitted fields | Create/correct name/phone only | No          |
| customers.manage                    | Deactivate/reactivate                     | Deactivate/reactivate        | No                             | No          |
| customers.operational               | Email/birthday/address/current marketing  | Same                         | No                             | No          |
| customers.private                   | CPF/operational notes                     | No                           | No                             | No          |
| customers.marketing                 | Change preference/read evidence history   | No                           | No                             | No          |
| customers.import / customers.export | Yes, explicit reviewed action             | No                           | No                             | No          |
| customers.anonymize                 | Yes, registration confirmation and reason | No                           | No                             | No          |
| catalog.read                        | All states                                | All states                   | Active only                    | Active only |
| catalog.manage                      | Categories/products/prices/status         | Same                         | No                             | No          |
| catalog.cost                        | Optional estimated unit cost              | Same                         | No                             | No          |

Customer lists select ID/registration/name/phone/status/timestamps/version. Detail adds only fields granted above. Owner CPF starts masked in the UI; OWNER API detail is intentionally full. MANAGER reads only current marketing state, without evidence/history or modification. CASHIER cannot send hidden fields through manipulated requests, view inactive customers or infer them from duplicate counts. PRODUCTION receives no customer data. Search is restricted to name/phone/registration; no private-field searching/counting. Catalog list/detail selects cost only with catalog.cost; read-only roles cannot request inactive scopes.

This resolves the former “restricted manager CPF” ambiguity as **no manager CPF or private notes**, and “read relevant production catalog” as **all active catalog products, without cost** for this phase. Managers may edit catalog/price/cost, but bulk customer data, anonymization and marketing administration remain owner-only. Inactive category does not hide an otherwise active product; references are retained and its category state is explicit.

Every registry service reauthorizes the actor/session inside the existing database lock transaction. Revocation committed before lock acquisition prevents completion; a transaction holding the lock finishes before a later account change. Customer/category/product versions reject stale edits. Registry mutations preserve exact Origin/Host and the existing CSRF model. No customer/catalog delete endpoint exists. See PHASE_3_DECISIONS.md, CUSTOMER_PRIVACY.md and REGISTRY_OPERATOR_GUIDE.pt-BR.md.

## Enforced in Phase 4

| Named permission       | OWNER                                               | MANAGER                 | CASHIER                                    | PRODUCTION                     |
| ---------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------ | ------------------------------ |
| inventory.availability | All permitted scopes                                | Same                    | Active sellable identity/availability only | Relevant stock                 |
| inventory.read         | Detailed physical/reserved/blocked, batches/history | Same                    | No                                         | Yes                            |
| production.manage      | Plan/start/complete/cancel/list                     | Same                    | No                                         | Yes                            |
| inventory.opening      | Yes                                                 | Yes                     | No                                         | No                             |
| inventory.receive      | Yes                                                 | Yes                     | No                                         | No                             |
| inventory.waste        | All permitted batches                               | Same                    | No                                         | Production-source batches only |
| inventory.adjust       | Reasoned/versioned IN/OUT                           | Same                    | No                                         | No                             |
| inventory.cost         | Optional historical purchase unit cost              | Yes, explicitly granted | No                                         | No                             |
| inventory.reconcile    | Read-only diagnostics                               | Same                    | No                                         | No                             |
| inventory.operations   | Actor-owned, current kind permission                | Same                    | No                                         | Permitted own commands         |
| inventory.reservations | Internal domain service only                        | Same                    | No                                         | No                             |

This explicitly narrows the former future “production and batch receipts” wording: production employees receive units only through production completion, never purchased receipts/opening/adjustments. Their waste scope is checked on the backend batch source. MANAGER cost visibility is an explicit extension consistent with existing catalog.cost; it is omitted from CASHIER/PRODUCTION database selects and DTOs. CASHIER cannot request inactive scopes or detailed batch/history/production paths. No inventory endpoint contains customer PII. Restricted roles cannot submit hidden costs or manipulate mutation routes.

All services recheck current actor/session and permission under the shared security lock. Stock mutation, audit and operation result commit atomically. Cost fields are omitted rather than frontend hidden. Reservation allocation/release/consumption has no arbitrary HTTP mutation route; Phase 5 must validate a real business source and design cashier order permissions without granting unrestricted inventory consumption. See PHASE_4_DECISIONS.md and RESERVATION_CONTRACT.md.

## Remaining operational matrix for Phases 5-9

| Capability                    | OWNER | MANAGER                         | CASHIER             | PRODUCTION      |
| ----------------------------- | ----- | ------------------------------- | ------------------- | --------------- |
| Operational dashboard         | Yes   | Yes                             | Limited             | Production only |
| POS and pickup orders         | Yes   | Yes                             | Yes                 | No              |
| Necessary customer name/phone | Yes   | Yes                             | Yes                 | No              |
| Sensitive CPF/private fields  | Yes   | Restricted                      | No                  | No              |
| Customer exports/imports      | Yes   | No by default                   | No                  | No              |
| Customer anonymization        | Yes   | No                              | No                  | No              |
| Products/categories/prices    | Yes   | Yes                             | Read active         | Read relevant   |
| Discount with reason          | Yes   | Yes                             | No                  | No              |
| Eligible return decision      | Yes   | Yes, with reason                | No                  | No              |
| Record one full payment       | Yes   | Yes                             | Assigned session    | No              |
| Approve full refund           | Yes   | No by default                   | No                  | No              |
| Open/operate/close cash       | Yes   | Yes                             | Assigned session    | No              |
| Cash closing review           | Yes   | Yes                             | Own session summary | No              |
| Traceable cash correction     | Yes   | Yes, with reason                | No                  | No              |
| Business reports/export       | Yes   | Yes, excluding customer exports | No                  | Production only |
| Users/roles/settings          | Yes   | No                              | No                  | No              |
| Backup administration         | Yes   | No                              | No                  | No              |
| Audit/security review         | Yes   | No by default                   | No                  | No              |

## Session/setup controls implemented

One-time owner setup requires direct loopback plus a private file-delivered installation secret, exact Origin and required CSRF header. A database transaction closes it permanently while creating the owner; forwarded headers cannot authorize setup. Argon2id hashes, opaque digest-backed sessions, HttpOnly/SameSite=Strict/Path=/ cookies, 12-hour absolute expiry and logout invalidation are implemented. Secure applies to HTTPS; local HTTP is an explicit exception. A new login replaces old access. Password/role/activation changes revoke sessions. Missing/null Origin and missing/invalid CSRF header are rejected for every identity mutation. No CORS allowance or browser token storage.

Persistent login budgets are eight attempts per normalized identifier and sixty per direct source per fixed ten-minute window, with temporary retries and bounded password work. Audit includes identity, customer changes/preferences/anonymization/import/export and catalog/price/cost events, with safe metadata. Discount/refund/cash audit remains pending those modules. See AUTH_SECURITY.md for exact behavior and the Portuguese access guide for local recovery. Future permissions must be enforced on each backend endpoint before enabling its UI.
