BEGIN;
-- CreateEnum
CREATE TYPE "CashMovementKind" AS ENUM ('CASH_ADDITION', 'CASH_WITHDRAWAL', 'CASH_EXPENSE', 'CASH_REVERSAL');

-- CreateEnum
CREATE TYPE "CashReviewDecision" AS ENUM ('APPROVED', 'NEEDS_ATTENTION');

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "activityVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "legacyClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" "CashMovementKind" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "direction" INTEGER NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "category" VARCHAR(24),
    "reference" VARCHAR(64),
    "actorId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "operationId" UUID NOT NULL,
    "reversesId" UUID,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosing" (
    "sessionId" UUID NOT NULL,
    "activityVersion" INTEGER NOT NULL,
    "expectedCents" BIGINT NOT NULL,
    "countedCents" BIGINT NOT NULL,
    "differenceCents" BIGINT NOT NULL,
    "explanation" VARCHAR(500),
    "totals" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "operationId" UUID NOT NULL,

    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "CashReview" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "decision" "CashReviewDecision" NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "operationId" UUID NOT NULL,

    CONSTRAINT "CashReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_operationId_key" ON "CashMovement"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_reversesId_key" ON "CashMovement"("reversesId");

-- CreateIndex
CREATE INDEX "CashMovement_sessionId_recordedAt_id_idx" ON "CashMovement"("sessionId", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_operationId_key" ON "CashClosing"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashReview_operationId_key" ON "CashReview"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashReview_sessionId_version_key" ON "CashReview"("sessionId", "version");

-- CreateIndex
CREATE INDEX "CashSession_openedAt_id_idx" ON "CashSession"("openedAt", "id");

-- CreateIndex
CREATE INDEX "CashSession_closedAt_id_idx" ON "CashSession"("closedAt", "id");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashReview" ADD CONSTRAINT "CashReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashReview" ADD CONSTRAINT "CashReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CashReview" ADD CONSTRAINT "CashReview_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Totals are derived from immutable sources; no mutable balance projection.
CREATE FUNCTION cash_source_count(sid UUID) RETURNS INTEGER LANGUAGE SQL STABLE AS $$
 SELECT (1+(SELECT COUNT(*) FROM "Payment" WHERE "cashSessionId"=sid)+(SELECT COUNT(*) FROM "Refund" WHERE "cashSessionId"=sid)+(SELECT COUNT(*) FROM "CashMovement" WHERE "sessionId"=sid))::integer
$$;
-- Column transforms preserve legacy records without invoking ordinary DML guards.
ALTER TABLE "CashSession" ALTER COLUMN "activityVersion" TYPE INTEGER USING cash_source_count("id");
ALTER TABLE "CashSession" ALTER COLUMN "legacyClosed" TYPE BOOLEAN USING ("closedAt" IS NOT NULL);
ALTER TABLE "CashSession" DROP CONSTRAINT "CashSession_bounds";
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_bounds" CHECK ("openingFloatCents" BETWEEN 0 AND 99999999 AND ("closedAt" IS NULL OR "closedAt">="openedAt") AND "activityVersion">0 AND "reviewVersion">=0 AND (NOT "legacyClosed" OR "closedAt" IS NOT NULL));
ALTER TABLE "InventoryOperation" DROP CONSTRAINT "InventoryOperation_result";
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_result" CHECK ("kind" IN ('OPENING','RECEIPT','PLAN','START','CANCEL','COMPLETE','WASTE','ADJUST','RESERVE','RESERVE_MULTI','RELEASE','CONSUME','SALE_CHECKOUT','ORDER_CREATE','ORDER_EDIT','ORDER_CONFIRM','ORDER_PREPARE','ORDER_READY','ORDER_PAY','ORDER_HANDOVER','ORDER_CANCEL','ORDER_REFUND','CASH_OPEN','CASH_MOVEMENT','CASH_CLOSE','CASH_REVIEW','CASH_REVERSE') AND "requestDigest" ~ '^[a-f0-9]{64}$' AND (("result" IS NULL AND "completedAt" IS NULL) OR ("result" IS NOT NULL AND jsonb_typeof("result")='object' AND "completedAt" IS NOT NULL)));
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shape" CHECK ("amountCents" BETWEEN 1 AND 99999999 AND "direction" IN (-1,1) AND length(btrim("reason")) BETWEEN 5 AND 240 AND ("reference" IS NULL OR "reference" ~ '^[A-Za-z0-9._/-]{1,64}$') AND (("kind"='CASH_ADDITION' AND "direction"=1 AND "category" IS NULL AND "reversesId" IS NULL) OR ("kind"='CASH_WITHDRAWAL' AND "direction"=-1 AND "category" IS NULL AND "reversesId" IS NULL) OR ("kind"='CASH_EXPENSE' AND "direction"=-1 AND "category" IS NOT NULL AND "category" IN ('SUPPLIES','MAINTENANCE','TRANSPORT','OTHER') AND "reversesId" IS NULL) OR ("kind"='CASH_REVERSAL' AND "category" IS NULL AND "reversesId" IS NOT NULL)));
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_figures" CHECK ("activityVersion">0 AND "expectedCents" BETWEEN 0 AND 999999999999 AND "countedCents" BETWEEN 0 AND 999999999999 AND "differenceCents"="countedCents"-"expectedCents" AND ("explanation" IS NULL OR length(btrim("explanation")) BETWEEN 5 AND 500) AND ("differenceCents"=0 OR "explanation" IS NOT NULL));
ALTER TABLE "CashReview" ADD CONSTRAINT "CashReview_shape" CHECK ("version">0 AND length(btrim("note")) BETWEEN 5 AND 500);
CREATE FUNCTION cash_session_totals(sid UUID) RETURNS JSONB LANGUAGE SQL STABLE AS $$
 WITH method_rows AS (
  SELECT method, COALESCE(SUM(gross),0) AS gross,COALESCE(SUM(refunded),0) AS refunded,COALESCE(SUM(pc),0) AS pc,COALESCE(SUM(rc),0) AS rc FROM (
   SELECT unnest(enum_range(NULL::"PaymentMethod")) AS method,0::numeric AS gross,0::numeric AS refunded,0::bigint AS pc,0::bigint AS rc
   UNION ALL SELECT "method",SUM("amountCents"),0,COUNT(*),0 FROM "Payment" WHERE "cashSessionId"=sid GROUP BY "method"
   UNION ALL SELECT "method",0,SUM("amountCents"),0,COUNT(*) FROM "Refund" WHERE "cashSessionId"=sid GROUP BY "method"
  ) x GROUP BY method
 ), methods AS (SELECT jsonb_object_agg(method,jsonb_build_object('grossCents',gross::text,'refundCents',refunded::text,'netCents',(gross-refunded)::text,'paymentCount',pc::text,'refundCount',rc::text)) AS value FROM method_rows), moves AS (
 SELECT COALESCE(SUM("amountCents") FILTER(WHERE kind='CASH_ADDITION'),0) AS additions,COALESCE(SUM("amountCents") FILTER(WHERE kind='CASH_WITHDRAWAL'),0) AS withdrawals,COALESCE(SUM("amountCents") FILTER(WHERE kind='CASH_EXPENSE'),0) AS expenses,COALESCE(SUM("amountCents"*direction) FILTER(WHERE kind='CASH_REVERSAL'),0) AS corrections,COUNT(*) AS count FROM "CashMovement" WHERE "sessionId"=sid
 ) SELECT jsonb_build_object('openingFloatCents',s."openingFloatCents"::text,'methods',m.value,'additionsCents',a.additions::text,'withdrawalsCents',a.withdrawals::text,'expensesCents',a.expenses::text,'correctionsCents',a.corrections::text,'expectedCents',(s."openingFloatCents"+(m.value->'CASH'->>'netCents')::numeric+a.additions-a.withdrawals-a.expenses+a.corrections)::text,'sourceCount',(cash_source_count(s.id)-1)::text) FROM "CashSession" s CROSS JOIN methods m CROSS JOIN moves a WHERE s.id=sid
$$;
CREATE OR REPLACE FUNCTION protect_cash_opening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cash references must be retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['closedAt','activityVersion','reviewVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['closedAt','activityVersion','reviewVersion']) THEN RAISE EXCEPTION 'Opening cash history is immutable'; END IF;
 IF NEW."activityVersion"<>cash_source_count(OLD.id) OR NEW."activityVersion"<OLD."activityVersion" OR (NEW."activityVersion"<>OLD."activityVersion" AND OLD."closedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Cash activity version must follow immutable sources'; END IF;
 IF NEW."reviewVersion"<>(SELECT COUNT(*) FROM "CashReview" WHERE "sessionId"=OLD.id) OR NEW."reviewVersion"<OLD."reviewVersion" THEN RAISE EXCEPTION 'Review version must follow append-only history'; END IF;
 IF OLD."closedAt" IS NOT NULL AND NEW."closedAt" IS DISTINCT FROM OLD."closedAt" THEN RAISE EXCEPTION 'Closed sessions cannot reopen or change time'; END IF;
 IF NEW."closedAt" IS DISTINCT FROM OLD."closedAt" AND NOT EXISTS(SELECT 1 FROM "CashClosing" c WHERE c."sessionId"=OLD.id AND c."recordedAt"=NEW."closedAt") THEN RAISE EXCEPTION 'Closing requires its immutable snapshot'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION guard_cash_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid UUID; s "CashSession"%ROWTYPE; op "InventoryOperation"%ROWTYPE; original "CashMovement"%ROWTYPE; available NUMERIC;
BEGIN
 IF TG_TABLE_NAME='CashMovement' THEN sid:=NEW."sessionId"; ELSE sid:=NEW."cashSessionId"; END IF;
 SELECT * INTO s FROM "CashSession" WHERE id=sid FOR UPDATE;
 IF s.id IS NULL OR s."closedAt" IS NOT NULL OR NEW."recordedAt"<s."openedAt" THEN RAISE EXCEPTION 'Posting requires current open session'; END IF;
 available:=(cash_session_totals(sid)->>'expectedCents')::numeric;
 IF TG_TABLE_NAME='CashMovement' THEN
  SELECT * INTO op FROM "InventoryOperation" WHERE id=NEW."operationId";
  IF op.id IS NULL OR op."actorId"<>NEW."actorId" OR op."completedAt" IS NOT NULL OR op.kind<>(CASE WHEN NEW.kind='CASH_REVERSAL' THEN 'CASH_REVERSE' ELSE 'CASH_MOVEMENT' END) THEN RAISE EXCEPTION 'Cash movement requires its pending actor operation'; END IF;
  IF NEW.kind='CASH_REVERSAL' THEN
   SELECT * INTO original FROM "CashMovement" WHERE id=NEW."reversesId";
   IF original.id IS NULL OR original.kind='CASH_REVERSAL' OR NEW."amountCents"<>original."amountCents" OR NEW.direction<>-original.direction OR NEW."recordedAt"<original."recordedAt" THEN RAISE EXCEPTION 'Only exact single original movement reversals are allowed'; END IF;
  END IF;
  IF NEW.direction=-1 AND available<NEW."amountCents" THEN RAISE EXCEPTION 'Insufficient expected physical cash'; END IF;
 ELSIF TG_TABLE_NAME='Refund' AND NEW.method='CASH' AND available<NEW."amountCents" THEN RAISE EXCEPTION 'Insufficient expected physical cash for refund';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION bump_cash_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid UUID; t JSONB; method JSONB; gross NUMERIC:=0; refunded NUMERIC:=0;
BEGIN
 IF TG_TABLE_NAME='CashMovement' THEN sid:=NEW."sessionId"; ELSE sid:=NEW."cashSessionId"; END IF;
 UPDATE "CashSession" SET "activityVersion"="activityVersion"+1 WHERE id=sid;
 t:=cash_session_totals(sid);
 FOR method IN SELECT value FROM jsonb_each(t->'methods') LOOP gross:=gross+(method->>'grossCents')::numeric;refunded:=refunded+(method->>'refundCents')::numeric;END LOOP;
 IF gross>999999999999 OR refunded>999999999999 OR abs((t->>'expectedCents')::numeric)>999999999999 OR (t->>'additionsCents')::numeric>999999999999 OR (t->>'withdrawalsCents')::numeric>999999999999 OR (t->>'expensesCents')::numeric>999999999999 OR abs((t->>'correctionsCents')::numeric)>999999999999 THEN RAISE EXCEPTION 'Cash session aggregate limit exceeded'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Payment_cash_guard" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION guard_cash_posting();
CREATE TRIGGER "Refund_cash_guard" BEFORE INSERT ON "Refund" FOR EACH ROW EXECUTE FUNCTION guard_cash_posting();
CREATE TRIGGER "CashMovement_guard" BEFORE INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION guard_cash_posting();
CREATE TRIGGER "Payment_cash_activity" AFTER INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION bump_cash_activity();
CREATE TRIGGER "Refund_cash_activity" AFTER INSERT ON "Refund" FOR EACH ROW EXECUTE FUNCTION bump_cash_activity();
CREATE TRIGGER "CashMovement_activity" AFTER INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION bump_cash_activity();
CREATE TRIGGER "CashMovement_append_only" BEFORE UPDATE OR DELETE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE TRIGGER "CashClosing_append_only" BEFORE UPDATE OR DELETE ON "CashClosing" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE TRIGGER "CashReview_append_only" BEFORE UPDATE OR DELETE ON "CashReview" FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE FUNCTION guard_cash_closing_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "CashSession"%ROWTYPE; op "InventoryOperation"%ROWTYPE;
BEGIN
 SELECT * INTO s FROM "CashSession" WHERE id=NEW."sessionId" FOR UPDATE;
 SELECT * INTO op FROM "InventoryOperation" WHERE id=NEW."operationId";
 IF s.id IS NULL OR op.id IS NULL OR op."completedAt" IS NOT NULL OR op."actorId"<>NEW."actorId" THEN RAISE EXCEPTION 'Cash action requires pending actor operation'; END IF;
 IF TG_TABLE_NAME='CashClosing' THEN
  IF s."closedAt" IS NOT NULL OR op.kind<>'CASH_CLOSE' OR s."activityVersion"<>NEW."activityVersion" OR NEW."recordedAt"<s."openedAt" OR NEW.totals IS DISTINCT FROM cash_session_totals(s.id) OR (NEW.totals->>'expectedCents')::numeric<>NEW."expectedCents" THEN RAISE EXCEPTION 'Closing must snapshot current reconciled sources'; END IF;
 ELSE
  IF s."closedAt" IS NULL OR s."legacyClosed" OR NOT EXISTS(SELECT 1 FROM "CashClosing" WHERE "sessionId"=s.id) OR op.kind<>'CASH_REVIEW' OR NEW.version<>s."reviewVersion"+1 OR NEW."recordedAt"<s."closedAt" THEN RAISE EXCEPTION 'Review requires closed session, latest version and original closing'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CashClosing_guard" BEFORE INSERT ON "CashClosing" FOR EACH ROW EXECUTE FUNCTION guard_cash_closing_review();
CREATE TRIGGER "CashReview_guard" BEFORE INSERT ON "CashReview" FOR EACH ROW EXECUTE FUNCTION guard_cash_closing_review();
CREATE FUNCTION bump_cash_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE "CashSession" SET "reviewVersion"="reviewVersion"+1 WHERE id=NEW."sessionId";RETURN NEW;END $$;
CREATE TRIGGER "CashReview_version" AFTER INSERT ON "CashReview" FOR EACH ROW EXECUTE FUNCTION bump_cash_review();
CREATE FUNCTION check_cash_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid UUID; s "CashSession"%ROWTYPE; c "CashClosing"%ROWTYPE; op "InventoryOperation"%ROWTYPE; expected_target TEXT;
BEGIN
 IF TG_TABLE_NAME='CashSession' THEN sid:=NEW.id; ELSE sid:=NEW."sessionId"; END IF;
 SELECT * INTO s FROM "CashSession" WHERE id=sid;SELECT * INTO c FROM "CashClosing" WHERE "sessionId"=sid;
 IF s."activityVersion"<>cash_source_count(sid) OR s."reviewVersion"<>(SELECT COUNT(*) FROM "CashReview" WHERE "sessionId"=sid) THEN RAISE EXCEPTION 'Cash source counters must reconcile'; END IF;
 IF NOT s."legacyClosed" AND ((s."closedAt" IS NULL)<>(c."sessionId" IS NULL)) THEN RAISE EXCEPTION 'Closure and snapshot must commit together'; END IF;
 IF c."sessionId" IS NOT NULL AND (c."recordedAt" IS DISTINCT FROM s."closedAt" OR c.totals IS DISTINCT FROM cash_session_totals(sid) OR c."activityVersion"<>s."activityVersion") THEN RAISE EXCEPTION 'Closed financial snapshot cannot drift'; END IF;
 IF TG_TABLE_NAME IN ('CashMovement','CashClosing','CashReview') THEN
  IF TG_TABLE_NAME='CashMovement' THEN expected_target:=NEW.id::text; ELSE expected_target:=sid::text; END IF;
  SELECT * INTO op FROM "InventoryOperation" WHERE id=NEW."operationId";
  IF op."completedAt" IS NULL OR op.result->>'targetId' IS DISTINCT FROM expected_target THEN RAISE EXCEPTION 'Cash result must bind to committed effect'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "CashSession_integrity" AFTER INSERT OR UPDATE ON "CashSession" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cash_commit();
CREATE CONSTRAINT TRIGGER "CashMovement_integrity" AFTER INSERT ON "CashMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cash_commit();
CREATE CONSTRAINT TRIGGER "CashClosing_integrity" AFTER INSERT ON "CashClosing" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cash_commit();
CREATE CONSTRAINT TRIGGER "CashReview_integrity" AFTER INSERT ON "CashReview" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cash_commit();

COMMIT;
