BEGIN;
-- 006 is already applied in isolated verification; add, never rewrite it.
-- Legacy metadata is assigned only to pre-existing rows by migration 006.
CREATE FUNCTION guard_new_cash_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."legacyClosed" OR NEW."closedAt" IS NOT NULL OR NEW."activityVersion"<>1 OR NEW."reviewVersion"<>0 THEN
  RAISE EXCEPTION 'New sessions must start open, without fabricated legacy closing or activity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CashSession_new_entry" BEFORE INSERT ON "CashSession" FOR EACH ROW EXECUTE FUNCTION guard_new_cash_session();
COMMIT;
