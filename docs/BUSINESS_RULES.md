# Business rules

These are initial operational defaults to validate with the owner. They are not claims of accounting, tax, food-safety or legal compliance.

## Units and money

Sell whole individual units only. Money is integer centavos, validated as a bounded safe integer. Parse Brazilian decimal input strictly; reject malformed, negative or ambiguous input instead of guessing. Price changes affect future sales, never historical item snapshots. Discounts require the explicit permission and an audit reason. No client-submitted total is trusted.

## Orders and payments

Order flow: DRAFT → CONFIRMED → PREPARING → READY → FULFILLED, with controlled cancellation before fulfillment. Payment state is independent: UNPAID, PAID, REFUNDED. Drafts do not reserve. Confirmation reserves eligible available stock, freezes items/prices and disallows backorders. Payment can occur before pickup or at pickup; full successful payment is required before handover.

Each order has one full payment, one method, no deposits, split tender, installments or customer credit. A full refund is a separate audited operation. Cash, Pix, debit card and credit card are accepted methods; card credit is not store-provided credit. Pix/card are manually confirmed by the employee; no bank/provider verification is implied. Never collect card numbers or security codes.

An active cash session is required for recording payments/refunds. Cash tender must cover the final total; change is tender minus total; only the sale total enters cash receipts. Immediate counter sale must create snapshots, payment, fulfillment, stock consumption, audit and idempotency response in one transaction.

Unpaid cancellation releases reservations. A paid unfulfilled cancellation requires an explicit full refund and releases reservations. Refund of a fulfilled sale never automatically restocks food. An eligible return requires a separate authorized reason and decision. Financial effects belong to the current relevant cash session, without rewriting previous closures.

## Inventory, production and waste

Ledger movements: OPENING, PRODUCTION_RECEIPT, PURCHASED_RECEIPT, FULFILLMENT, WASTE, ADJUSTMENT and ELIGIBLE_RETURN. On-hand is the signed ledger total; reserved is active allocation; available is eligible on-hand minus active reservations. Expired stock is physically on hand but blocked from sale, and must be explicitly disposed of. Report physical and sellable stock separately.

Completing production once receives actual finished units, not planned units. Purchased receipts increase finished stock. Future pickup payment does not remove physical stock. Handover consumes reservation and stock together. Allocation is FEFO with stable tie-breaking; business-approved expiry is entered by an authorized person, not invented by software.

Waste records batch, quantity, reason, user and time. OTHER requires explanation. Disposing of reserved units is rejected until affected reservations are resolved. Waste beyond eligible unreserved batch quantity is rejected. Production loss and finished-product waste must not double-count the same physical units. Adjustments require permission, reason, before/after context and audit.

## Cash and closing

One store drawer and one active session. Expected physical cash = opening float + cash receipts + additions − cash refunds − withdrawals − cash expenses. Pix/card are reported separately and never increase physical cash. Closing is transactional, records counted cash, difference and explanation, and preserves the snapshot. Later corrections are traceable authorized movements, never silent edits/deletion of closed records.

## Customer and history

Anonymous counter sales are supported. Registered customer name is required; phone, email, birthday, CPF, notes and reference address are optional. Phones normalize to a consistent Brazilian/international digit representation, without uniqueness assumptions. Duplicate review never silently merges. CPF check digits are format validation, not identity verification. Marketing defaults UNKNOWN, with source/time of changes.

Anonymization removes identification while retaining operational history under restricted access. Imports require preview, column mapping, row validation, duplicate decisions and a summary; no silent overwrite. Spreadsheet exports neutralize formula prefixes as well as escaping CSV syntax.

## Phase 3 implemented registry rules

Customer name is the sole required personal field. Full date-only birthdays from 1900 through today in Fortaleza are supported; day/month alone is refused. Brazilian phone normalization never invents digits and is nonunique. Email is trimmed/lowercased, optional and nonunique; CPF is optional, check-digit validated and uniquely bound even on inactive customers. Duplicate CPF requires review/skip; shared phone/email or advisory normalized-name match requires a coded reason to create separately. No merges or destructive customer deletion.

Marketing defaults UNKNOWN and only OWNER changes it with source/reason/actor/time and optional evidence. OPTED_IN cannot use NO_EVIDENCE; record-review opt-in needs a reference. Imports never change marketing. There is no sending or legal-compliance claim. Deactivation is reversible; owner-only reasoned/confirmed anonymization clears identifying attributes/evidence, disables and sets OPTED_OUT, preserving IDs and safe history. Earlier downloads/backups are not rewritten. See CUSTOMER_PRIVACY.md.

Categories have unique normalized names. Deactivation blocks new links, retains existing products and does not cascade active flags. Products use unique uppercase SKU, supported origin, whole-unit integer centavo pricing and optional restricted estimated cost; zero price requires explicit confirmation, negative/fractional money is rejected. Storage/shelf-life are text references only. Price/cost changes are audited. No quantity, availability, stock accounting or product photo upload exists. Future orders must snapshot prices; historical sales-price behavior remains unverified until sales exist.

Version checks prevent stale customer/category/product updates, including status changes. Named backend permissions and transactional actor rechecks apply to reads, mutations and bulk CSV. Atomic imports create-or-skip, never update/merge; confirmation retries return the prior result. Export is owner-only/minimal/formula-safe/excludes anonymized customers. See CUSTOMER_CSV.md and PHASE_3_DECISIONS.md for exact bounds and policies.

## Integrity

Transactions and database safeguards protect last-unit races, duplicate payment/completion, cash session opening/closing and first-run owner setup. Audit high-impact actions and permission changes without secrets/unnecessary personal data. Sensitive actions require backend authorization even if a UI button is hidden.
