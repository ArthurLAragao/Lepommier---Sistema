BEGIN;
-- Global business-date range scans cannot use only the existing product,
-- customer, source or cash-session prefixed indexes. No historical row changes.
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt",id);
CREATE INDEX "Order_fulfilledAt_id_idx" ON "Order"("fulfilledAt",id);
CREATE INDEX "Order_confirmedAt_id_idx" ON "Order"("confirmedAt",id);
CREATE INDEX "Payment_recordedAt_id_idx" ON "Payment"("recordedAt",id);
CREATE INDEX "Refund_recordedAt_id_idx" ON "Refund"("recordedAt",id);
CREATE INDEX "ProductionRecord_completedAt_id_idx" ON "ProductionRecord"("completedAt",id);
CREATE INDEX "PurchasedProductReceipt_recordedAt_id_idx" ON "PurchasedProductReceipt"("recordedAt",id);
CREATE INDEX "InventoryMovement_createdAt_id_idx" ON "InventoryMovement"("createdAt",id);
CREATE INDEX "Batch_expiresAt_id_idx" ON "Batch"("expiresAt",id);
COMMIT;
