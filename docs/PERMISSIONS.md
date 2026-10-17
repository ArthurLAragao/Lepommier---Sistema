# Permission matrix

The API must enforce this matrix. A hidden/disabled UI control is not authorization. OWNER has all access; managers receive only the explicitly listed corrections. No default production credentials.

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

## Session/setup controls

One-time owner setup on loopback with installation secret and database race guard. Disable setup after owner creation. Established password hashing; opaque sessions in HttpOnly SameSite cookies; expiry and logout invalidation. Secure cookies under HTTPS, documented local HTTP exception. Mutations validate Origin/CSRF. Rate limit login. Never store auth tokens in localStorage or log credentials/cookies.

Protect the last active owner from deactivation/demotion. Role changes invalidate affected sessions. At most five active staff is an initial owner-validatable operational limit. Audit login/security outcomes, permission changes, price changes, discounts, refunds, cancellations, adjustments, cash corrections, exports, imports and settings changes.
