# Product requirements

## Purpose and scope

The owner can understand store performance without reconstructing paper records. Up to five individual employees can record ordinary operations quickly when the internet is disconnected. The first release runs on one store computer: a local browser, local API and local PostgreSQL. Customers do not need accounts.

Sales sources are the counter and manually entered WhatsApp orders. There is no store delivery service. Pickup may be by the customer or a third party, recorded as a plain operational note. No automatic messages or WhatsApp/bank integrations are authorized.

## Release requirements

| Area               | Required behavior                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Secure first owner setup, individual accounts, expiring server sessions, backend roles, login throttling, audit events                                                                                                    |
| Customers          | Optional identification for counter sales, required name on registered profiles, normalized non-unique phones, optional validated CPF, explicit marketing preferences, history, safe CSV preview/mapping/duplicate review |
| Catalog            | Categories, product SKU, origin, integer centavo prices/costs, whole unit quantities, soft deactivation, historical item snapshots                                                                                        |
| Inventory          | Append-only ledger, batches, expiry, FEFO allocation, on-hand/reserved/available balances, transactions and last-unit concurrency protection                                                                              |
| Production         | Plan, start, complete once, cancel, actual quantity distinct from plan, finished-product receipt only on completion                                                                                                       |
| Purchased products | Supplier reference, unit receipt, optional cost, batch and business-entered expiry                                                                                                                                        |
| Waste              | Reason, actor, batch, quantity, cost versus potential retail value, reservation conflict checks                                                                                                                           |
| POS                | Search/filter, cart, optional customer, authorized discount, one full payment, change, atomic fulfillment and ledger writes, idempotent retry                                                                             |
| Pickup orders      | Draft versus confirmed reservation, separate payment state, paid before handover, explicit cancellation/refund                                                                                                            |
| Cash               | One drawer/session, opening float, cash movements, full refunds, expected/count/difference, immutable closing snapshot                                                                                                    |
| Reporting          | Defined fulfilled sales versus receipts/refunds, daily business-date boundaries, history, reconciliation, controlled safe CSV                                                                                             |
| Operations         | Health/readiness, local assets, persistent restart, backup and tested clean restore, installation/update/operator guides                                                                                                  |

## UX and visual direction

Desktop first at 1366×768 or larger. Navigation: Visão geral, Vendas, Pedidos, Clientes, Produtos, Produção, Estoque, Caixa, Relatórios, Configurações. Unimplemented modules must be identified as unavailable. Never show invented operational totals as real.

Use provisional warm neutral/cream surfaces, dark readable text, muted green accents, restrained terracotta, subtle borders/shadows and system typography. Use the text “Le Pommier”; no invented official logo. Status must have text as well as color. Use visible keyboard focus, labels, accessible dialogs and honest loading/error/empty states. Avoid decorative charts.

All interface copy is pt-BR. Currency is BRL, dates DD/MM/YYYY, time 24-hour, business timezone America/Fortaleza. No tokens or operational database in localStorage.

## Explicit exclusions

Weight/fractional checkout, deposits, partial/split payments, installment schedules, customer debt, backorders, ingredient stock, recipe costing, full accounting/profit, fiscal compliance claims, customer accounts, public online shop, cloud synchronization and remote mobile deployment are excluded from v1. See the original supplied brief in PROJECT_BRIEF.txt for the full acceptance scenarios.

## Release gates

Critical business transitions must pass PostgreSQL integration tests and realistic browser scenarios. Backup restore, restart persistence, offline core operation, authorization and concurrency must be demonstrated. A compile/build is not a release gate by itself. The operator and owner validate assumptions and the pilot checklist before real use.
