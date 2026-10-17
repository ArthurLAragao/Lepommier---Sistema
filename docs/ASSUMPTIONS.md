# Assumptions and owner decisions

## Confirmed by the supplied brief

- One local host, browser frontend, local backend and PostgreSQL; no cloud core dependency.
- Counter and manually entered WhatsApp orders; pickup, including third-party collection; no store delivery.
- Whole individual units; in-house and ready-made products; finished batches and waste.
- Up to five staff, individual accounts and four roles.
- One full payment before handover; an order can be entered unpaid. No deposits, partial payments, split tender, installments or customer credit.
- No official logo/palette/typeface verified. The interface direction is provisional.

## Initial operational defaults to validate

| Decision                | Initial default                                          | Why / owner validation                                                     |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Business timezone       | America/Fortaleza                                        | Explicit brief requirement, independent of host/browser                    |
| Cash drawer             | One active store session                                 | Prevent ambiguous payment attribution                                      |
| Discounts               | OWNER/MANAGER with reason                                | Cashier cannot silently alter price                                        |
| Refund approvals        | OWNER only                                               | Explicit sensitive permission                                              |
| Expiry boundary         | Batch blocked after its entered expiry date in Fortaleza | Owner must approve day-end interpretation; no food-safety rule is inferred |
| Stock allocation        | Earliest expiry then oldest receipt/ID                   | Stable FEFO, only eligible unreserved units                                |
| Customer marketing      | UNKNOWN until explicitly recorded                        | Existing records imply no consent                                          |
| Staff access            | Five active accounts initially                           | Owner included; validate before enforcement                                |
| Network                 | Loopback only                                            | LAN requires a separately reviewed configuration                           |
| Session duration        | Proposed 12 hours, non-sliding                           | Owner to validate shift duration/security                                  |
| Backup retention        | Proposed 14 daily + 4 weekly copies                      | Capacity, privacy and separate-device process to validate                  |
| Personal-data retention | No invented legal duration                               | Owner must approve documented retention and request handling               |

## Unknown, not guessed

Foundation input guards currently accept business/report dates from 2000 through 2099, amounts from 0 through 99,999,999 centavos and positive quantities up to 100,000 whole units per input. Validate these bounds before historical migration or unusually large operations; they are not evidence of the store's actual catalog or history. Customer birthday validation must be designed separately rather than reusing the business-date lower bound.

Existing customer spreadsheet columns, product catalog, prices, categories, suppliers, shelf lives, official brand assets, recipes, store address/contact information, real employee details and production quantities. No operational data is fabricated or silently imported.

## Environment findings

The provided workspace contained only empty `outputs/` and `work/` directories, with no Git repository, HTML/JavaScript registry or reusable brand asset. The prompt attachment is the only supplied source. Node 25.3.0 is on PATH; bundled Node 24.19.0 is available and selected for verification. Docker and psql were not found on PATH, and no Docker/PostgreSQL folder was found in Program Files. An absent command is not proof no installation exists elsewhere.
