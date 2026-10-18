# Permission matrix

The API enforces Phase 2 identity, Phase 3 registry, Phase 4 inventory Phase 5 sales and Phase 6 cash permissions below. The remaining operational matrix specifies later modules; it does not claim those modules exist. A hidden/disabled UI control is not authorization. No default production credentials.

## Enforced in Phase 2

| Named permission                                                | OWNER | MANAGER | CASHIER | PRODUCTION |
| --------------------------------------------------------------- | ----- | ------- | ------- | ---------- |
| profile.self: current account, logout, own password change      | Yes   | Yes     | Yes     | Yes        |
| accounts.manage: list/create/edit/activate/disable/reset others | Yes   | No      | No      | No         |
| security.review: latest safe security events via API            | Yes   | No      | No      | No         |

The shared permission map, reusable route check and service reauthorization under the database lock enforce these rules. Settings navigation contains personal password controls and non-sensitive diagnostics for all roles; this resolves the earlier broad “Users/roles/settings” label. Only OWNER administers accounts or future store configuration. There is no editable store configuration in this phase. The overview now shows the real Phase 7 dashboard only to OWNER; other roles see authorized operational shortcuts without owner financial figures.

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

All services recheck current actor/session and permission under the shared security lock. Stock mutation, audit and operation result commit atomically. Cost fields are omitted rather than frontend hidden. Reservation allocation/release/consumption has no arbitrary HTTP mutation route; Phase 5 order services validate genuine OrderItem ownership without granting unrestricted cashier inventory consumption. See PHASE_4_DECISIONS.md and RESERVATION_CONTRACT.md.

## Enforced in Phase 5

| Named permission             | OWNER                                                       | MANAGER     | CASHIER     | PRODUCTION |
| ---------------------------- | ----------------------------------------------------------- | ----------- | ----------- | ---------- |
| orders.read                  | Order/sale details and necessary collection data            | Same        | Same        | No         |
| orders.write                 | Create/edit/confirm/progress drafts/orders                  | Same        | Same        | No         |
| orders.checkout              | Immediate full counter sale                                 | Same        | Same        | No         |
| orders.pay / orders.handover | Full payment / eligible paid pickup                         | Same        | Same        | No         |
| orders.cancel                | Unfulfilled; paid requires orders.refund                    | Unpaid only | Unpaid only | No         |
| orders.discount              | Coded reason required                                       | Same        | No          | No         |
| orders.refund                | Original-method full refund, explicit external confirmation | No          | No          | No         |
| orders.operations            | Own key plus current operation permission                   | Same        | Same        | No         |
| cash.open                    | Explicit opening/float                                      | Same        | No          | No         |

Order list/detail selects exclude customer CPF/contact/address/private notes and product cost. Collection name/notes are necessary order-only fields; no customer PII snapshot. Production has no order queue or new customer endpoint. Customer history additionally requires customers.read; CASHIER cannot retrieve inactive/anonymized profiles, while authorized order-number history remains available without resurrecting identity. Cashier current-session DTO omits opening float. All writes use the existing transactional actor/session recheck and exact Origin/Host/CSRF. See PHASE_5_DECISIONS.md for lock ordering and the intentionally shared one-store cash-session policy. No unrestricted cashier reservation permission was added.

## Enforced in Phase 6

| Named permission | OWNER                                                             | MANAGER                    | CASHIER                           | PRODUCTION |
| ---------------- | ----------------------------------------------------------------- | -------------------------- | --------------------------------- | ---------- |
| cash.current     | Minimal active identity plus separately authorized details        | Same                       | Active ID/opening actor/time only | No         |
| cash.open        | Explicit opening and float                                        | Yes                        | No                                | No         |
| cash.read        | Current/history/details/source lists and read-only reconciliation | Yes                        | No                                | No         |
| cash.movements   | Addition/withdrawal/expense                                       | Yes                        | No                                | No         |
| cash.close       | Reviewed version, explicit count and explanation                  | Yes                        | No                                | No         |
| cash.review      | Append review of closed counted session                           | No                         | No                                | No         |
| cash.correct     | One full linked opposite movement in current session              | No                         | No                                | No         |
| cash.operations  | Own key plus current operation permission                         | Same, permitted kinds only | No                                | No         |

Cashier may record existing authorized sale/payments against the shared active session, but cannot view drawer totals/float/history or close it. Manager has operational history and movements, explicitly no review/correction. Production has no cash route/navigation/projection. Full detail selects only necessary financial references, amounts, actors/times and restricted cash reasons; no customer identity/contact/CPF, catalog cost, session tokens, or tender details are returned by cash endpoints. Authorized linked order detail uses its existing separate permission check.

Mutations reauthorize actor/session under the existing singleton before the operation/cash lock. Revocation first prevents completion; an already-held operation commits before a later revocation. Exact Origin/Host/CSRF apply to every new mutation, and uncertain-result lookup checks both actor ownership and current kind permission. Legacy closed sessions without a counted snapshot are read-only historical evidence, without fabricated review/counts. See CASH_SESSION_POLICY.md.

## Reporting policy and remaining release administration

Phase 7 business reports/exports enforce the explicit named permissions and projections below. The earlier speculative matrix does not grant manager CPF, cashier historical cash, manager review/corrections or production financial reporting. Backup administration and installation/pilot acceptance remain pending. Existing identity and registry policies above remain authoritative.

## Session/setup controls implemented

One-time owner setup requires direct loopback plus a private file-delivered installation secret, exact Origin and required CSRF header. A database transaction closes it permanently while creating the owner; forwarded headers cannot authorize setup. Argon2id hashes, opaque digest-backed sessions, HttpOnly/SameSite=Strict/Path=/ cookies, 12-hour absolute expiry and logout invalidation are implemented. Secure applies to HTTPS; local HTTP is an explicit exception. A new login replaces old access. Password/role/activation changes revoke sessions. Missing/null Origin and missing/invalid CSRF header are rejected for every identity mutation. No CORS allowance or browser token storage.

Persistent login budgets are eight attempts per normalized identifier and sixty per direct source per fixed ten-minute window, with temporary retries and bounded password work. Audit includes identity, customer changes/preferences/anonymization/import/export and catalog/price/cost events, with safe metadata. Order/discount/payment/refund/cash-opening audit is implemented with coded metadata and no personal-text snapshots. See AUTH_SECURITY.md for exact behavior and the Portuguese access guide for local recovery. Future permissions must be enforced on each backend endpoint before enabling its UI.

## Enforced in Phase 7

| Named permission  | OWNER                          | MANAGER               | CASHIER | PRODUCTION |
| ----------------- | ------------------------------ | --------------------- | ------- | ---------- |
| reports.dashboard | Yes                            | No                    | No      | No         |
| reports.financial | Yes                            | Yes                   | No      | No         |
| reports.stock     | Yes                            | Yes                   | No      | Yes        |
| reports.cash      | Yes                            | Yes                   | No      | No         |
| reports.customers | One selected customer          | One selected customer | No      | No         |
| reports.cost      | Recorded optional receipt cost | Same                  | No      | No         |
| reports.export    | Explicit bounded CSV           | No                    | No      | No         |

Single-customer report export additionally requires customers.export. General reports omit customer PII, private notes and collector details. PRODUCTION has production, permitted waste and inventory projections, no financial/customer/cost fields or counts; its filter lookup exposes identity only. MANAGER's explicit reporting grants do not broaden accounts/private-customer/bulk-export rights. Existing CASHIER payment/current-session views remain unchanged. Every endpoint and source uses backend authorization. Routine reads recheck within a short read-only snapshot; a role change appears on the next read. Exports reauthorize again before safe audit/delivery.
