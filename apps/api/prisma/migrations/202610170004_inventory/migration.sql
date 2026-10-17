-- CreateEnum
CREATE TYPE "BatchSource" AS ENUM ('OPENING', 'PRODUCTION', 'PURCHASED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'PRODUCTION_RECEIPT', 'PURCHASED_RECEIPT', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateTable
CREATE TABLE "InventoryOperation" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "requestDigest" CHAR(64) NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InventoryOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "productId" UUID NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "referenceKey" VARCHAR(160) NOT NULL,
    "source" "BatchSource" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" DATE,
    "expiryUnknownReason" VARCHAR(32),
    "actorId" UUID NOT NULL,
    "notes" VARCHAR(500),
    "physical" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRecord" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER,
    "plannedDate" DATE NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(32),
    "version" INTEGER NOT NULL DEFAULT 1,
    "batchId" UUID,

    CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasedProductReceipt" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierReference" VARCHAR(120) NOT NULL,
    "supplierBatch" VARCHAR(80),
    "unitCostCents" INTEGER,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "actorId" UUID NOT NULL,
    "notes" VARCHAR(500),

    CONSTRAINT "PurchasedProductReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sourceNamespace" VARCHAR(24) NOT NULL,
    "sourceReference" UUID NOT NULL,
    "eligibilityThrough" DATE NOT NULL,
    "actorId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationAllocation" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "allocated" INTEGER NOT NULL,
    "released" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReservationAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "correctsMovementId" UUID,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryOperation_createdAt_idx" ON "InventoryOperation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOperation_actorId_key_key" ON "InventoryOperation"("actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_number_key" ON "Batch"("number");

-- CreateIndex
CREATE INDEX "Batch_productId_expiresAt_recordedAt_id_idx" ON "Batch"("productId", "expiresAt", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_id_productId_key" ON "Batch"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_productId_referenceKey_key" ON "Batch"("productId", "referenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecord_batchId_key" ON "ProductionRecord"("batchId");

-- CreateIndex
CREATE INDEX "ProductionRecord_status_plannedDate_id_idx" ON "ProductionRecord"("status", "plannedDate", "id");

-- CreateIndex
CREATE INDEX "ProductionRecord_productId_plannedDate_idx" ON "ProductionRecord"("productId", "plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecord_batchId_productId_key" ON "ProductionRecord"("batchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasedProductReceipt_batchId_key" ON "PurchasedProductReceipt"("batchId");

-- CreateIndex
CREATE INDEX "PurchasedProductReceipt_productId_recordedAt_idx" ON "PurchasedProductReceipt"("productId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasedProductReceipt_batchId_productId_key" ON "PurchasedProductReceipt"("batchId", "productId");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_productId_idx" ON "InventoryReservation"("status", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_id_productId_key" ON "InventoryReservation"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_sourceNamespace_sourceReference_produc_key" ON "InventoryReservation"("sourceNamespace", "sourceReference", "productId");

-- CreateIndex
CREATE INDEX "ReservationAllocation_batchId_idx" ON "ReservationAllocation"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationAllocation_reservationId_batchId_key" ON "ReservationAllocation"("reservationId", "batchId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_id_idx" ON "InventoryMovement"("productId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InventoryMovement_batchId_createdAt_id_idx" ON "InventoryMovement"("batchId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_operationId_batchId_type_key" ON "InventoryMovement"("operationId", "batchId", "type");

-- AddForeignKey
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_batchId_productId_fkey" FOREIGN KEY ("batchId", "productId") REFERENCES "Batch"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchasedProductReceipt" ADD CONSTRAINT "PurchasedProductReceipt_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchasedProductReceipt" ADD CONSTRAINT "PurchasedProductReceipt_batchId_productId_fkey" FOREIGN KEY ("batchId", "productId") REFERENCES "Batch"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchasedProductReceipt" ADD CONSTRAINT "PurchasedProductReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservationAllocation" ADD CONSTRAINT "ReservationAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservationAllocation" ADD CONSTRAINT "ReservationAllocation_reservationId_productId_fkey" FOREIGN KEY ("reservationId", "productId") REFERENCES "InventoryReservation"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservationAllocation" ADD CONSTRAINT "ReservationAllocation_batchId_productId_fkey" FOREIGN KEY ("batchId", "productId") REFERENCES "Batch"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_productId_fkey" FOREIGN KEY ("batchId", "productId") REFERENCES "Batch"("id", "productId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_correctsMovementId_fkey" FOREIGN KEY ("correctsMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Constraints/triggers beyond Prisma. Aggregates use numeric, never int32 totals.
ALTER TABLE "Batch"
 ADD CONSTRAINT "Batch_bounds" CHECK ("number">0 AND "version">0 AND "physical" BETWEEN 0 AND 1000000000000 AND "reserved" BETWEEN 0 AND "physical"),
 ADD CONSTRAINT "Batch_reference" CHECK (length(btrim("reference")) BETWEEN 2 AND 80 AND length("referenceKey") BETWEEN 1 AND 160),
 ADD CONSTRAINT "Batch_expiry" CHECK (("expiresAt" IS NOT NULL AND "expiryUnknownReason" IS NULL AND "expiresAt" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31') OR ("expiresAt" IS NULL AND "expiryUnknownReason" IS NOT NULL AND "expiryUnknownReason" IN ('NOT_PROVIDED','LEGACY_COUNT')));
ALTER TABLE "ProductionRecord"
 ADD CONSTRAINT "Production_quantities" CHECK ("plannedQuantity" BETWEEN 1 AND 100000 AND ("actualQuantity" IS NULL OR "actualQuantity" BETWEEN 1 AND 100000) AND "version">0 AND "plannedDate" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'),
 ADD CONSTRAINT "Production_state_fields" CHECK (
  ("status"='PLANNED' AND "startedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "batchId" IS NULL AND "actualQuantity" IS NULL) OR
  ("status"='IN_PROGRESS' AND "startedAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "batchId" IS NULL AND "actualQuantity" IS NULL) OR
  ("status"='COMPLETED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "batchId" IS NOT NULL AND "actualQuantity" IS NOT NULL AND "cancelledAt" IS NULL) OR
  ("status"='CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND "cancelReason" IN ('PLAN_CHANGE','FAILED_BEFORE_FINISH','PRODUCT_UNAVAILABLE') AND "completedAt" IS NULL AND "batchId" IS NULL AND "actualQuantity" IS NULL));
ALTER TABLE "PurchasedProductReceipt" ADD CONSTRAINT "Receipt_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND length(btrim("supplierReference")) BETWEEN 2 AND 120 AND ("unitCostCents" IS NULL OR "unitCostCents" BETWEEN 0 AND 99999999));
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "Movement_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND length(btrim("reason")) BETWEEN 2 AND 32 AND ("correctsMovementId" IS NULL OR "correctsMovementId"<>"id"));
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_result" CHECK ("kind" IN ('OPENING','RECEIPT','PLAN','START','CANCEL','COMPLETE','WASTE','ADJUST','RESERVE','RESERVE_MULTI','RELEASE','CONSUME') AND "requestDigest" ~ '^[a-f0-9]{64}$' AND (("result" IS NULL AND "completedAt" IS NULL) OR ("result" IS NOT NULL AND jsonb_typeof("result")='object' AND "completedAt" IS NOT NULL)));
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "Reservation_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND "version">0 AND "sourceNamespace"='INTERNAL' AND "eligibilityThrough" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31' AND (("status"='ACTIVE' AND "closedAt" IS NULL) OR ("status"<>'ACTIVE' AND "closedAt" IS NOT NULL)));
ALTER TABLE "ReservationAllocation" ADD CONSTRAINT "Allocation_bounds" CHECK ("allocated" BETWEEN 1 AND 100000 AND "released">=0 AND "consumed">=0 AND "released"::bigint+"consumed"<="allocated");

CREATE FUNCTION protect_inventory_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory history is append-only'; END $$;
CREATE TRIGGER "Movement_append_only" BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE FUNCTION require_open_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation_row "InventoryOperation"%ROWTYPE;
BEGIN
 SELECT * INTO operation_row FROM "InventoryOperation" WHERE "id"=NEW."operationId";
 IF operation_row."id" IS NULL OR operation_row."completedAt" IS NOT NULL OR operation_row."actorId"<>NEW."actorId" OR NOT ((operation_row."kind"='OPENING' AND NEW."type"='OPENING') OR (operation_row."kind"='RECEIPT' AND NEW."type"='PURCHASED_RECEIPT') OR (operation_row."kind"='COMPLETE' AND NEW."type"='PRODUCTION_RECEIPT') OR (operation_row."kind"='WASTE' AND NEW."type"='WASTE') OR (operation_row."kind"='ADJUST' AND NEW."type" IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT')) OR (operation_row."kind"='CONSUME' AND NEW."type"='CONSUMPTION')) THEN RAISE EXCEPTION 'Movement requires its pending authorized operation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Movement_operation" BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION require_open_inventory_operation();
CREATE TRIGGER "Receipt_append_only" BEFORE UPDATE OR DELETE ON "PurchasedProductReceipt" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE FUNCTION protect_batch_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Batch history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['physical','reserved','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['physical','reserved','version']) THEN RAISE EXCEPTION 'Batch identity and expiry are immutable'; END IF;
 IF (NEW."physical",NEW."reserved") IS DISTINCT FROM (OLD."physical",OLD."reserved") AND NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Batch projection changes require a fresh version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Batch_metadata_immutable" BEFORE UPDATE OR DELETE ON "Batch" FOR EACH ROW EXECUTE FUNCTION protect_batch_metadata();
CREATE FUNCTION protect_production_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Production history cannot be deleted'; END IF;
 IF NEW."productId"<>OLD."productId" OR NEW."actorId"<>OLD."actorId" OR NEW."plannedQuantity"<>OLD."plannedQuantity" OR NEW."plannedDate"<>OLD."plannedDate" OR NEW."createdAt"<>OLD."createdAt" THEN RAISE EXCEPTION 'Original production plan is immutable'; END IF;
 IF OLD."status" IN ('COMPLETED','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Terminal production requires compensating inventory entries'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Production_history" BEFORE UPDATE OR DELETE ON "ProductionRecord" FOR EACH ROW EXECUTE FUNCTION protect_production_history();
CREATE FUNCTION protect_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory operation records are retained'; END IF;
 IF OLD."completedAt" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['result','completedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['result','completedAt']) THEN RAISE EXCEPTION 'Inventory operation identity/result is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "InventoryOperation_immutable" BEFORE UPDATE OR DELETE ON "InventoryOperation" FOR EACH ROW EXECUTE FUNCTION protect_inventory_operation();
CREATE FUNCTION require_inventory_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "InventoryOperation" WHERE "id"=NEW."id" AND ("result" IS NULL OR "completedAt" IS NULL)) THEN RAISE EXCEPTION 'Inventory operation must commit its result atomically'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "InventoryOperation_complete" AFTER INSERT OR UPDATE ON "InventoryOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_result();
CREATE FUNCTION protect_allocation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocation history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['released','consumed']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['released','consumed']) OR NEW."released"<OLD."released" OR NEW."consumed"<OLD."consumed" THEN RAISE EXCEPTION 'Allocation history is monotonic'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Allocation_history" BEFORE UPDATE OR DELETE ON "ReservationAllocation" FOR EACH ROW EXECUTE FUNCTION protect_allocation_history();

-- Deferred constraint triggers validate aggregates against final transaction state.
-- Ordinary CHECK constraints above do not claim to validate cross-table sums.
CREATE FUNCTION check_batch_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_id UUID; cached_physical BIGINT; cached_reserved BIGINT; ledger_physical NUMERIC; allocated_reserved NUMERIC;
BEGIN
 IF TG_TABLE_NAME='Batch' THEN batch_id:=NEW."id"; ELSE batch_id:=NEW."batchId"; END IF;
 SELECT "physical","reserved" INTO cached_physical,cached_reserved FROM "Batch" WHERE "id"=batch_id;
 SELECT COALESCE(SUM(CASE WHEN "type" IN ('CONSUMPTION','WASTE','ADJUSTMENT_OUT') THEN -"quantity"::bigint ELSE "quantity"::bigint END),0) INTO ledger_physical FROM "InventoryMovement" WHERE "batchId"=batch_id;
 SELECT COALESCE(SUM("allocated"::bigint-"released"-"consumed"),0) INTO allocated_reserved FROM "ReservationAllocation" WHERE "batchId"=batch_id;
 IF cached_physical IS DISTINCT FROM ledger_physical OR cached_reserved IS DISTINCT FROM allocated_reserved OR ledger_physical<0 OR allocated_reserved<0 OR allocated_reserved>ledger_physical THEN RAISE EXCEPTION 'Inventory projections must match ledger and outstanding allocations'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Batch_projection_consistency" AFTER INSERT OR UPDATE ON "Batch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_batch_projection();
CREATE CONSTRAINT TRIGGER "Movement_projection_consistency" AFTER INSERT ON "InventoryMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_batch_projection();
CREATE CONSTRAINT TRIGGER "Allocation_projection_consistency" AFTER INSERT OR UPDATE ON "ReservationAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_batch_projection();
CREATE FUNCTION check_reservation_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reservation_id UUID; total NUMERIC; released_total NUMERIC; consumed_total NUMERIC; reservation_row "InventoryReservation"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='InventoryReservation' THEN reservation_id:=NEW."id"; ELSE reservation_id:=NEW."reservationId"; END IF;
 SELECT * INTO reservation_row FROM "InventoryReservation" WHERE "id"=reservation_id;
 SELECT COALESCE(SUM("allocated"::bigint),0),COALESCE(SUM("released"::bigint),0),COALESCE(SUM("consumed"::bigint),0) INTO total,released_total,consumed_total FROM "ReservationAllocation" WHERE "reservationId"=reservation_id;
 IF total<>reservation_row."quantity" OR (reservation_row."status"='ACTIVE' AND (released_total<>0 OR consumed_total<>0)) OR (reservation_row."status"='RELEASED' AND (released_total<>total OR consumed_total<>0)) OR (reservation_row."status"='CONSUMED' AND (consumed_total<>total OR released_total<>0)) THEN RAISE EXCEPTION 'Reservation status and allocations must agree'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Reservation_allocation_consistency" AFTER INSERT OR UPDATE ON "InventoryReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_allocation();
CREATE CONSTRAINT TRIGGER "Allocation_reservation_consistency" AFTER INSERT OR UPDATE ON "ReservationAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_allocation();
