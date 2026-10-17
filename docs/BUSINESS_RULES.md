# Business rules

These are initial operational defaults to validate with the owner. They are not claims of accounting, tax, food-safety or legal compliance.

## Units and money

Sell whole individual units only. Money is integer centavos. Unit prices are bounded safe integers; order/payment/refund amounts and aggregate history use checked BigInt arithmetic and decimal-string DTOs. Parse Brazilian decimal input strictly; reject malformed, negative or ambiguous input instead of guessing. Price changes affect future sales, never historical item snapshots. Discounts require the explicit permission and an audit reason. No client-submitted total is trusted.

## Orders and payments (implemented Phase 5)

Order flow: DRAFT → CONFIRMED → PREPARING → READY → FULFILLED, with controlled cancellation before fulfillment. Payment state is independent: UNPAID, PAID, REFUNDED. Drafts do not reserve. Confirmation reserves eligible available stock, freezes items/prices and disallows backorders. Payment can occur before pickup or at pickup; full successful payment is required before handover.

Each order has one full payment, one method, no deposits, split tender, installments or customer credit. A full refund is a separate audited operation. Cash, Pix, debit card and credit card are accepted methods; card credit is not store-provided credit. Pix/card are manually confirmed by the employee; no bank/provider verification is implied. Never collect card numbers or security codes.

An active cash session is required for recording payments/refunds. Cash tender must cover the final total; change is tender minus total; only the sale total enters cash receipts. Immediate counter sale must create snapshots, payment, fulfillment, stock consumption, audit and idempotency response in one transaction.

Unpaid cancellation releases reservations. A paid unfulfilled cancellation requires an explicit full refund and releases reservations. Refund of a fulfilled sale never automatically restocks food. An eligible return requires a separate authorized reason and decision. Financial effects belong to the current relevant cash session, without rewriting previous closures.

## Inventory, production and waste

Implemented ledger movements: OPENING, PRODUCTION_RECEIPT, PURCHASED_RECEIPT, CONSUMPTION, WASTE, ADJUSTMENT_IN and ADJUSTMENT_OUT. CONSUMPTION belongs to the existing reservation service, now composed atomically by genuine sales/handover. Returns never automatically restock. Physical is the signed ledger total; reserved is outstanding batch allocation; available is the sum of each eligible batch's physical minus reserved. Expired stock remains physical and blocked until explicit disposal. Report physical, reserved and sellable separately without adding overlapping categories.

Completing PLANNED → IN_PROGRESS → COMPLETED production receives actual positive finished units once, not planned units; cancel open records without stock effect. Yield shortfall is not finished-stock waste. PRODUCED/BOTH permit production, PURCHASED/BOTH permit purchased receipt, and active state/origin are rechecked transactionally. Deactivation blocks new/start/complete operations while cancellation remains available. Purchased cost is an optional restricted historical snapshot, without catalog-cost overwrite or cash effect. Handover composes owned reservation consumption with validated full-payment/order state in one transaction.

Expiry is date-only and valid through that date in Fortaleza, blocked afterward. No automatic waste or invented shelf life. Unknown expiry requires NOT_PROVIDED/LEGACY_COUNT and is initially eligible after dated FEFO batches; owner must validate this policy, not infer food safety. FEFO ties use recordedAt then ID. Future eligibility-through dates exclude known earlier-expiring batches. Expired reservations cannot be consumed or silently reassigned; release explicitly before a new valid source revision. Batch identity/expiry is immutable. Opening may record already-expired physical units; new production/receipts/positive adjustment cannot receive already-expired units. All recorded instants are server time; no arbitrary backdating.

Commands use 1–100,000 whole units; each batch caps at 1 trillion. BigInt/numeric sums serialize as decimal strings. Ledger/projections/allocations/source/audit/idempotent result commit together, with deferred database consistency checks and fresh versions. Stock setter/history editing/deletion and silent reconciliation repair are absent. Adjustment is a reasoned IN/OUT delta; record corrections reference the original movement and preserve it. Read-only reconciliation blocks unreliable availability and reports findings. See PHASE_4_DECISIONS.md and INVENTORY_INVARIANTS.md.

Waste records batch, quantity, reason, user and time. OTHER requires explanation. Disposing of reserved units is rejected until affected reservations are resolved. Waste beyond eligible unreserved batch quantity is rejected. Production loss and finished-product waste must not double-count the same physical units. Adjustments require permission, reason, before/after context and audit.

## Cash and closing (future Phase 6 rules, not implemented)

One store drawer and one active session. Expected physical cash = opening float + cash receipts + additions − cash refunds − withdrawals − cash expenses. Pix/card are reported separately and never increase physical cash. Closing is transactional, records counted cash, difference and explanation, and preserves the snapshot. Later corrections are traceable authorized movements, never silent edits/deletion of closed records.

## Customer and history

Anonymous counter sales are supported. Registered customer name is required; phone, email, birthday, CPF, notes and reference address are optional. Phones normalize to a consistent Brazilian/international digit representation, without uniqueness assumptions. Duplicate review never silently merges. CPF check digits are format validation, not identity verification. Marketing defaults UNKNOWN, with source/time of changes.

Anonymization removes identification while retaining operational history under restricted access. Imports require preview, column mapping, row validation, duplicate decisions and a summary; no silent overwrite. Spreadsheet exports neutralize formula prefixes as well as escaping CSV syntax.

## Phase 3 implemented registry rules

Customer name is the sole required personal field. Full date-only birthdays from 1900 through today in Fortaleza are supported; day/month alone is refused. Brazilian phone normalization never invents digits and is nonunique. Email is trimmed/lowercased, optional and nonunique; CPF is optional, check-digit validated and uniquely bound even on inactive customers. Duplicate CPF requires review/skip; shared phone/email or advisory normalized-name match requires a coded reason to create separately. No merges or destructive customer deletion.

Marketing defaults UNKNOWN and only OWNER changes it with source/reason/actor/time and optional evidence. OPTED_IN cannot use NO_EVIDENCE; record-review opt-in needs a reference. Imports never change marketing. There is no sending or legal-compliance claim. Deactivation is reversible; owner-only reasoned/confirmed anonymization clears identifying attributes/evidence, disables and sets OPTED_OUT, preserving IDs and safe history. Earlier downloads/backups are not rewritten. See CUSTOMER_PRIVACY.md.

Categories have unique normalized names. Deactivation blocks new links, retains existing products and does not cascade active flags. Products use unique uppercase SKU, supported origin, whole-unit integer centavo pricing and optional restricted estimated cost; zero price requires explicit confirmation, negative/fractional money is rejected. Storage/shelf-life are text references only. Price/cost changes are audited. Stock accounting is in the separate Phase 4 ledger, never a mutable catalog quantity. Product photo upload is omitted. Phase 5 order items snapshot product code/name/version/unit price and allocated discounts; later catalog changes do not rewrite them.

Version checks prevent stale customer/category/product updates, including status changes. Named backend permissions and transactional actor rechecks apply to reads, mutations and bulk CSV. Atomic imports create-or-skip, never update/merge; confirmation retries return the prior result. Export is owner-only/minimal/formula-safe/excludes anonymized customers. See CUSTOMER_CSV.md and PHASE_3_DECISIONS.md for exact bounds and policies.

## Integrity

Transactions and database safeguards protect last-unit races, duplicate payment/completion, cash session opening/closing and first-run owner setup. Audit high-impact actions and permission changes without secrets/unnecessary personal data. Sensitive actions require backend authorization even if a UI button is hidden.

## Phase 5 resolved policies

OWNER/MANAGER explicitly open one shared active cash session; there is no close endpoint or automatic opening. Only OWNER approves refunds/paid cancellation. MANAGER may grant coded discounts; CASHIER may sell/pay/handover/cancel unpaid orders without discounts/refunds/opening. Zero-total drafts may exist but confirmation/checkout rejects zero totals; no no-charge completion or fictitious cash receipt. Each command has at most 20 distinct products and each line 1-100,000 units; subtotal/total cap 99,999,999 centavos, exact proportional discount allocation.

WHATSAPP requires an active non-anonymized customer and future pickup within 365 days, interpreted in America/Fortaleza independently of browser timezone. Confirmation revalidates current customer/product/version/price and eligibility through pickup date. Confirmed items/customer/pickup are fixed; cancellation/recreation replaces amendments and expired allocations. Paid cancellation refunds/releases atomically; fulfilled refund preserves handover and consumption. Refund is always full and original-method with explicit confirmation of external execution, using the current session. Neither bank verification nor a second charge/refund after network failure is implied. See ORDER_PAYMENT_POLICY.md, CASH_FOUNDATION.md and PHASE_5_DECISIONS.md.
