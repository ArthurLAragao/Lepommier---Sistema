-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('COUNTER', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD');

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "orderItemId" UUID;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "reservationId" UUID;

-- CreateTable
CREATE TABLE "CashSession" (
    "id" UUID NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "openedById" UUID NOT NULL,
    "openingFloatCents" BIGINT NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "operationId" UUID NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "OrderSource" NOT NULL,
    "customerId" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL DEFAULT 0,
    "discountReason" VARCHAR(32),
    "totalCents" BIGINT NOT NULL,
    "pickupAt" TIMESTAMPTZ(3),
    "pickupPerson" VARCHAR(120),
    "collectionNote" VARCHAR(500),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "preparingAt" TIMESTAMPTZ(3),
    "readyAt" TIMESTAMPTZ(3),
    "fulfilledAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(32),
    "creatorId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productCode" VARCHAR(32) NOT NULL,
    "productName" VARCHAR(120) NOT NULL,
    "productVersion" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "subtotalCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL,
    "totalCents" BIGINT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "tenderedCents" BIGINT,
    "changeCents" BIGINT,
    "manuallyConfirmed" BOOLEAN NOT NULL,
    "actorId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "operationId" UUID NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "externalRefundConfirmed" BOOLEAN NOT NULL,
    "actorId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "operationId" UUID NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "state" "OrderStatus" NOT NULL,
    "reason" VARCHAR(32),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_operationId_key" ON "CashSession"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_customerId_fulfilledAt_id_idx" ON "Order"("customerId", "fulfilledAt", "id");

-- CreateIndex
CREATE INDEX "Order_status_pickupAt_id_idx" ON "Order"("status", "pickupAt", "id");

-- CreateIndex
CREATE INDEX "Order_source_createdAt_id_idx" ON "Order"("source", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_id_productId_quantity_key" ON "OrderItem"("id", "productId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_operationId_key" ON "Payment"("operationId");

-- CreateIndex
CREATE INDEX "Payment_cashSessionId_method_recordedAt_idx" ON "Payment"("cashSessionId", "method", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_orderId_key" ON "Payment"("id", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_orderId_key" ON "Refund"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_operationId_key" ON "Refund"("operationId");

-- CreateIndex
CREATE INDEX "Refund_cashSessionId_method_recordedAt_idx" ON "Refund"("cashSessionId", "method", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_orderId_key" ON "Refund"("paymentId", "orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_id_idx" ON "OrderEvent"("orderId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderItemId_key" ON "InventoryReservation"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderItemId_productId_quantity_key" ON "InventoryReservation"("orderItemId", "productId", "quantity");

-- CreateIndex
CREATE INDEX "InventoryMovement_reservationId_idx" ON "InventoryMovement"("reservationId");

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderItemId_productId_quantity_fkey" FOREIGN KEY ("orderItemId", "productId", "quantity") REFERENCES "OrderItem"("id", "productId", "quantity") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reservationId_productId_fkey" FOREIGN KEY ("reservationId", "productId") REFERENCES "InventoryReservation"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_orderId_fkey" FOREIGN KEY ("paymentId", "orderId") REFERENCES "Payment"("id", "orderId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Extend the existing operation/ledger system; preserve all INTERNAL legacy sources.
ALTER TABLE "InventoryOperation" DROP CONSTRAINT "InventoryOperation_result";
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_result" CHECK ("kind" IN ('OPENING','RECEIPT','PLAN','START','CANCEL','COMPLETE','WASTE','ADJUST','RESERVE','RESERVE_MULTI','RELEASE','CONSUME','SALE_CHECKOUT','ORDER_CREATE','ORDER_EDIT','ORDER_CONFIRM','ORDER_PREPARE','ORDER_READY','ORDER_PAY','ORDER_HANDOVER','ORDER_CANCEL','ORDER_REFUND','CASH_OPEN') AND "requestDigest" ~ '^[a-f0-9]{64}$' AND (("result" IS NULL AND "completedAt" IS NULL) OR ("result" IS NOT NULL AND jsonb_typeof("result")='object' AND "completedAt" IS NOT NULL)));
ALTER TABLE "InventoryReservation" DROP CONSTRAINT "Reservation_bounds";
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "Reservation_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND "version">0 AND (("sourceNamespace"='INTERNAL' AND "orderItemId" IS NULL) OR ("sourceNamespace"='ORDER' AND "orderItemId" IS NOT NULL AND "sourceReference"="orderItemId")) AND "eligibilityThrough" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31' AND (("status"='ACTIVE' AND "closedAt" IS NULL) OR ("status"<>'ACTIVE' AND "closedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "CashSession_one_active" ON "CashSession" ((1)) WHERE "closedAt" IS NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_discount_reason_required" CHECK ("discountCents"=0 OR "discountReason" IS NOT NULL);
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_bounds" CHECK ("openingFloatCents" BETWEEN 0 AND 99999999 AND ("closedAt" IS NULL OR "closedAt">"openedAt"));
ALTER TABLE "Order" ADD CONSTRAINT "Order_bounds" CHECK ("number">0 AND "version">0 AND "subtotalCents" BETWEEN 0 AND 99999999 AND "discountCents" BETWEEN 0 AND "subtotalCents" AND "totalCents"="subtotalCents"-"discountCents" AND ("discountCents"=0 OR "discountReason" IN ('PROMOTION','PRICE_AGREEMENT','COURTESY')) AND ("source"<>'WHATSAPP' OR ("customerId" IS NOT NULL AND "pickupAt" IS NOT NULL)) AND ("source"<>'COUNTER' OR "pickupAt" IS NULL) AND ("confirmedAt" IS NULL OR "totalCents">0));
ALTER TABLE "Order" ADD CONSTRAINT "Order_state_fields" CHECK (
 ("status"='DRAFT' AND "confirmedAt" IS NULL AND "preparingAt" IS NULL AND "readyAt" IS NULL AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
 ("status"='CONFIRMED' AND "confirmedAt" IS NOT NULL AND "preparingAt" IS NULL AND "readyAt" IS NULL AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
 ("status"='PREPARING' AND "confirmedAt" IS NOT NULL AND "preparingAt" IS NOT NULL AND "readyAt" IS NULL AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
 ("status"='READY' AND "confirmedAt" IS NOT NULL AND "preparingAt" IS NOT NULL AND "readyAt" IS NOT NULL AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
 ("status"='FULFILLED' AND "confirmedAt" IS NOT NULL AND "fulfilledAt" IS NOT NULL AND "cancelledAt" IS NULL AND ("source"='COUNTER' OR ("preparingAt" IS NOT NULL AND "readyAt" IS NOT NULL))) OR
 ("status"='CANCELLED' AND "cancelledAt" IS NOT NULL AND "fulfilledAt" IS NULL AND "cancelReason" IS NOT NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_timestamps" CHECK (("confirmedAt" IS NULL OR "confirmedAt">="createdAt") AND ("preparingAt" IS NULL OR "preparingAt">="confirmedAt") AND ("readyAt" IS NULL OR "readyAt">="preparingAt") AND ("fulfilledAt" IS NULL OR "fulfilledAt">="confirmedAt") AND ("cancelledAt" IS NULL OR "cancelledAt">="createdAt") AND ("cancelReason" IS NULL OR "cancelReason" IN ('CUSTOMER_REQUEST','ENTRY_ERROR','STOCK_UNAVAILABLE','QUALITY_ISSUE')));
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_money_units" CHECK ("quantity" BETWEEN 1 AND 100000 AND "productVersion">0 AND "unitPriceCents" BETWEEN 0 AND 99999999 AND "subtotalCents"="quantity"::bigint*"unitPriceCents"::bigint AND "subtotalCents"<=99999999 AND "discountCents" BETWEEN 0 AND "subtotalCents" AND "totalCents"="subtotalCents"-"discountCents");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_full_bounds" CHECK ("amountCents" BETWEEN 1 AND 99999999 AND "manuallyConfirmed" AND (("method"='CASH' AND "tenderedCents" IS NOT NULL AND "tenderedCents" BETWEEN "amountCents" AND 99999999 AND "changeCents" IS NOT NULL AND "changeCents"="tenderedCents"-"amountCents") OR ("method"<>'CASH' AND "tenderedCents" IS NULL AND "changeCents" IS NULL)));
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_full_bounds" CHECK ("amountCents" BETWEEN 1 AND 99999999 AND "externalRefundConfirmed" AND "reason" IN ('CUSTOMER_REQUEST','ENTRY_ERROR','STOCK_UNAVAILABLE','QUALITY_ISSUE'));
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_codes" CHECK ("type" IN ('ORDER_CREATED','ORDER_EDITED','ORDER_CONFIRMED','ORDER_PREPARING','ORDER_READY','PAYMENT_RECORDED','ORDER_FULFILLED','ORDER_CANCELLED','REFUND_RECORDED') AND ("reason" IS NULL OR "reason" IN ('CUSTOMER_REQUEST','ENTRY_ERROR','STOCK_UNAVAILABLE','QUALITY_ISSUE')));
CREATE TRIGGER "Payment_append_only" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE TRIGGER "Refund_append_only" BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE TRIGGER "OrderEvent_append_only" BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE FUNCTION protect_cash_opening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cash references must be retained'; END IF;
 IF (to_jsonb(NEW)-'closedAt') IS DISTINCT FROM (to_jsonb(OLD)-'closedAt') OR OLD."closedAt" IS NOT NULL THEN RAISE EXCEPTION 'Opening cash history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CashSession_opening_immutable" BEFORE UPDATE OR DELETE ON "CashSession" FOR EACH ROW EXECUTE FUNCTION protect_cash_opening();
CREATE FUNCTION require_financial_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "InventoryOperation"%ROWTYPE; session_row "CashSession"%ROWTYPE; expected_actor UUID;
BEGIN
 SELECT * INTO op FROM "InventoryOperation" WHERE "id"=NEW."operationId";
 IF TG_TABLE_NAME='CashSession' THEN
  expected_actor:=NEW."openedById";
  IF op."kind"<>'CASH_OPEN' THEN RAISE EXCEPTION 'Opening requires its operation'; END IF;
 ELSE
  expected_actor:=NEW."actorId";
  SELECT * INTO session_row FROM "CashSession" WHERE "id"=NEW."cashSessionId" FOR UPDATE;
  IF session_row."id" IS NULL OR session_row."closedAt" IS NOT NULL OR NEW."recordedAt"<session_row."openedAt" THEN RAISE EXCEPTION 'Financial record requires current open session'; END IF;
  IF (TG_TABLE_NAME='Payment' AND op."kind" NOT IN ('SALE_CHECKOUT','ORDER_PAY')) OR (TG_TABLE_NAME='Refund' AND op."kind" NOT IN ('ORDER_CANCEL','ORDER_REFUND')) THEN RAISE EXCEPTION 'Financial operation kind does not match'; END IF;
 END IF;
 IF op."id" IS NULL OR op."actorId"<>expected_actor OR op."completedAt" IS NOT NULL THEN RAISE EXCEPTION 'Financial record requires pending actor operation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Payment_operation" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION require_financial_operation();
CREATE TRIGGER "Refund_operation" BEFORE INSERT ON "Refund" FOR EACH ROW EXECUTE FUNCTION require_financial_operation();
CREATE TRIGGER "CashSession_operation" BEFORE INSERT ON "CashSession" FOR EACH ROW EXECUTE FUNCTION require_financial_operation();
CREATE FUNCTION protect_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed TEXT[]:=ARRAY['status','confirmedAt','preparingAt','readyAt','fulfilledAt','cancelledAt','cancelReason','updatedAt','version']; anon BOOLEAN;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orders cannot be deleted'; END IF;
 IF (NEW."id",NEW."number",NEW."creatorId",NEW."createdAt") IS DISTINCT FROM (OLD."id",OLD."number",OLD."creatorId",OLD."createdAt") THEN RAISE EXCEPTION 'Order identity is immutable'; END IF;
 IF NEW IS DISTINCT FROM OLD AND NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Order writes require a new version'; END IF;
 SELECT "anonymizedAt" IS NOT NULL INTO anon FROM "Customer" WHERE "id"=OLD."customerId";
 IF anon AND NEW."pickupPerson" IS NULL AND NEW."collectionNote" IS NULL AND NEW."notes" IS NULL THEN allowed:=allowed||ARRAY['pickupPerson','collectionNote','notes']; END IF;
 IF OLD."status"<>'DRAFT' AND (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN RAISE EXCEPTION 'Confirmed snapshots are immutable'; END IF;
 IF OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" OR OLD."preparingAt" IS NOT NULL AND NEW."preparingAt" IS DISTINCT FROM OLD."preparingAt" OR OLD."readyAt" IS NOT NULL AND NEW."readyAt" IS DISTINCT FROM OLD."readyAt" OR OLD."fulfilledAt" IS NOT NULL AND NEW."fulfilledAt" IS DISTINCT FROM OLD."fulfilledAt" OR OLD."cancelledAt" IS NOT NULL AND (NEW."cancelledAt",NEW."cancelReason") IS DISTINCT FROM (OLD."cancelledAt",OLD."cancelReason") THEN RAISE EXCEPTION 'Recorded lifecycle timestamps are immutable'; END IF;
 IF NEW."status"<>OLD."status" AND NOT ((OLD."status"='DRAFT' AND NEW."status" IN ('CONFIRMED','CANCELLED')) OR (OLD."status"='CONFIRMED' AND (NEW."status" IN ('PREPARING','CANCELLED') OR (NEW."status"='FULFILLED' AND NEW."source"='COUNTER'))) OR (OLD."status"='PREPARING' AND NEW."status" IN ('READY','CANCELLED')) OR (OLD."status"='READY' AND NEW."status" IN ('FULFILLED','CANCELLED'))) THEN RAISE EXCEPTION 'Invalid order transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Order_history" BEFORE UPDATE OR DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION protect_order_history();
CREATE FUNCTION protect_order_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "OrderStatus";
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft lines explicitly; snapshots cannot be overwritten'; END IF;
 IF TG_OP='DELETE' THEN SELECT "status" INTO parent_status FROM "Order" WHERE "id"=OLD."orderId"; ELSE SELECT "status" INTO parent_status FROM "Order" WHERE "id"=NEW."orderId"; END IF;
 IF parent_status IS DISTINCT FROM 'DRAFT'::"OrderStatus" THEN RAISE EXCEPTION 'Only draft items can be inserted or removed'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "OrderItem_snapshot" BEFORE INSERT OR UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION protect_order_item();
CREATE FUNCTION protect_reservation_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','closedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','closedAt']) OR OLD."status"<>'ACTIVE' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Reservation source and terminal history are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Reservation_source" BEFORE UPDATE OR DELETE ON "InventoryReservation" FOR EACH ROW EXECUTE FUNCTION protect_reservation_source();
CREATE OR REPLACE FUNCTION require_open_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation_row "InventoryOperation"%ROWTYPE; reservation_row "InventoryReservation"%ROWTYPE;
BEGIN
 SELECT * INTO operation_row FROM "InventoryOperation" WHERE "id"=NEW."operationId";
 IF operation_row."id" IS NULL OR operation_row."completedAt" IS NOT NULL OR operation_row."actorId"<>NEW."actorId" OR NOT ((operation_row."kind"='OPENING' AND NEW."type"='OPENING') OR (operation_row."kind"='RECEIPT' AND NEW."type"='PURCHASED_RECEIPT') OR (operation_row."kind"='COMPLETE' AND NEW."type"='PRODUCTION_RECEIPT') OR (operation_row."kind"='WASTE' AND NEW."type"='WASTE') OR (operation_row."kind"='ADJUST' AND NEW."type" IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT')) OR (operation_row."kind" IN ('CONSUME','SALE_CHECKOUT','ORDER_HANDOVER') AND NEW."type"='CONSUMPTION')) THEN RAISE EXCEPTION 'Movement requires its pending authorized operation'; END IF;
 IF operation_row."kind" IN ('SALE_CHECKOUT','ORDER_HANDOVER') THEN
  SELECT * INTO reservation_row FROM "InventoryReservation" WHERE "id"=NEW."reservationId";
  IF reservation_row."sourceNamespace" IS DISTINCT FROM 'ORDER' OR reservation_row."productId" IS DISTINCT FROM NEW."productId" THEN RAISE EXCEPTION 'Sales consumption requires genuine order allocation'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Scrub collection PII without rewriting monetary snapshots, events, payments or audit.
CREATE FUNCTION reject_anonymized_order_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "Customer" WHERE "id"=NEW."customerId" AND "anonymizedAt" IS NOT NULL) AND (NEW."pickupPerson" IS NOT NULL OR NEW."collectionNote" IS NOT NULL OR NEW."notes" IS NOT NULL) THEN RAISE EXCEPTION 'Anonymized customer cannot regain collection text'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Order_privacy" BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION reject_anonymized_order_text();
CREATE FUNCTION scrub_customer_order_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."anonymizedAt" IS NULL AND NEW."anonymizedAt" IS NOT NULL THEN UPDATE "Order" SET "pickupPerson"=NULL,"collectionNote"=NULL,"notes"=NULL,"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "customerId"=NEW."id" AND ("pickupPerson" IS NOT NULL OR "collectionNote" IS NOT NULL OR "notes" IS NOT NULL); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER "Customer_order_privacy" AFTER UPDATE OF "anonymizedAt" ON "Customer" FOR EACH ROW EXECUTE FUNCTION scrub_customer_order_text();

-- Cross-table accounting is verified at transaction commit, never claimed by a row CHECK.
CREATE FUNCTION check_order_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; order_row "Order"%ROWTYPE; item_count INTEGER; subtotal NUMERIC; discount NUMERIC; total NUMERIC; payment_row "Payment"%ROWTYPE; refund_row "Refund"%ROWTYPE; bad BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='Order' THEN target:=NEW."id";
 ELSIF TG_TABLE_NAME IN ('OrderItem','Payment','Refund') THEN IF TG_OP='DELETE' THEN target:=OLD."orderId"; ELSE target:=NEW."orderId"; END IF;
 ELSIF TG_TABLE_NAME='InventoryReservation' THEN SELECT "orderId" INTO target FROM "OrderItem" WHERE "id"=NEW."orderItemId";
 ELSE SELECT i."orderId" INTO target FROM "InventoryReservation" r JOIN "OrderItem" i ON i."id"=r."orderItemId" WHERE r."id"=NEW."reservationId";
 END IF;
 IF target IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO order_row FROM "Order" WHERE "id"=target;
 SELECT COUNT(*),COALESCE(SUM("subtotalCents"),0),COALESCE(SUM("discountCents"),0),COALESCE(SUM("totalCents"),0) INTO item_count,subtotal,discount,total FROM "OrderItem" WHERE "orderId"=target;
 IF item_count NOT BETWEEN 1 AND 20 OR subtotal<>order_row."subtotalCents" OR discount<>order_row."discountCents" OR total<>order_row."totalCents" THEN RAISE EXCEPTION 'Order totals must equal its item snapshots'; END IF;
 SELECT * INTO payment_row FROM "Payment" WHERE "orderId"=target;
 SELECT * INTO refund_row FROM "Refund" WHERE "orderId"=target;
 IF payment_row."id" IS NOT NULL AND (order_row."confirmedAt" IS NULL OR payment_row."amountCents"<>order_row."totalCents" OR NOT EXISTS(SELECT 1 FROM "InventoryOperation" op WHERE op."id"=payment_row."operationId" AND op."result"->>'targetId'=target::text)) THEN RAISE EXCEPTION 'Payment must match full confirmed order and operation'; END IF;
 IF refund_row."id" IS NOT NULL AND (payment_row."id" IS NULL OR refund_row."paymentId"<>payment_row."id" OR refund_row."amountCents"<>payment_row."amountCents" OR refund_row."method"<>payment_row."method" OR order_row."status" NOT IN ('CANCELLED','FULFILLED') OR NOT EXISTS(SELECT 1 FROM "InventoryOperation" op WHERE op."id"=refund_row."operationId" AND op."result"->>'targetId'=target::text)) THEN RAISE EXCEPTION 'Refund must preserve original full payment and fulfilment history'; END IF;
 IF (order_row."status"='FULFILLED' AND payment_row."id" IS NULL) OR (order_row."status"='CANCELLED' AND payment_row."id" IS NOT NULL AND refund_row."id" IS NULL) OR (order_row."status"='DRAFT' AND payment_row."id" IS NOT NULL) THEN RAISE EXCEPTION 'Order payment/state invariant failed'; END IF;
 IF order_row."confirmedAt" IS NULL THEN
  IF EXISTS(SELECT 1 FROM "InventoryReservation" r JOIN "OrderItem" i ON i."id"=r."orderItemId" WHERE i."orderId"=target) THEN RAISE EXCEPTION 'Draft or unconfirmed cancellation cannot reserve'; END IF;
 ELSE
  SELECT EXISTS(SELECT 1 FROM "OrderItem" i LEFT JOIN "InventoryReservation" r ON r."orderItemId"=i."id" WHERE i."orderId"=target AND (r."id" IS NULL OR r."sourceNamespace"<>'ORDER' OR r."sourceReference"<>i."id" OR r."productId"<>i."productId" OR r."quantity"<>i."quantity" OR r."status"::text<>CASE WHEN order_row."status"='FULFILLED' THEN 'CONSUMED' WHEN order_row."status"='CANCELLED' THEN 'RELEASED' ELSE 'ACTIVE' END)) INTO bad;
  IF bad THEN RAISE EXCEPTION 'Every confirmed item requires its own matching reservation'; END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM "ReservationAllocation" a JOIN "InventoryReservation" r ON r."id"=a."reservationId" JOIN "OrderItem" i ON i."id"=r."orderItemId" WHERE i."orderId"=target AND a."consumed"<>(SELECT COALESCE(SUM(m."quantity"),0) FROM "InventoryMovement" m WHERE m."reservationId"=r."id" AND m."batchId"=a."batchId" AND m."type"='CONSUMPTION')) INTO bad;
 IF bad THEN RAISE EXCEPTION 'Order consumption must equal each allocation'; END IF;
 SELECT EXISTS(SELECT 1 FROM "InventoryMovement" m JOIN "InventoryReservation" r ON r."id"=m."reservationId" JOIN "OrderItem" i ON i."id"=r."orderItemId" JOIN "InventoryOperation" op ON op."id"=m."operationId" LEFT JOIN "ReservationAllocation" a ON a."reservationId"=r."id" AND a."batchId"=m."batchId" WHERE i."orderId"=target AND (m."type"<>'CONSUMPTION' OR a."id" IS NULL OR op."kind" NOT IN ('SALE_CHECKOUT','ORDER_HANDOVER') OR op."result"->>'targetId' IS DISTINCT FROM target::text)) INTO bad;
 IF bad THEN RAISE EXCEPTION 'Consumption cannot use another order source'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Order_accounting" AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "OrderItem_accounting" AFTER INSERT OR DELETE ON "OrderItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "Payment_accounting" AFTER INSERT ON "Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "Refund_accounting" AFTER INSERT ON "Refund" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "OrderReservation_accounting" AFTER INSERT OR UPDATE ON "InventoryReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "OrderAllocation_accounting" AFTER INSERT OR UPDATE ON "ReservationAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
CREATE CONSTRAINT TRIGGER "OrderMovement_accounting" AFTER INSERT ON "InventoryMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_integrity();
