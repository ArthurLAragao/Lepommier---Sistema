CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'PRODUCTION');
CREATE TABLE "InstallationState" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "initializedAt" TIMESTAMPTZ(3)
);
INSERT INTO "InstallationState" ("id") VALUES (1);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY,
  "loginIdentifier" VARCHAR(32) NOT NULL UNIQUE,
  "displayName" VARCHAR(80) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "User_login_normalized" CHECK ("loginIdentifier" ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  CONSTRAINT "User_name_length" CHECK (length(btrim("displayName")) BETWEEN 2 AND 80),
  CONSTRAINT "User_password_hash" CHECK ("passwordHash" LIKE '$argon2id$%')
);
CREATE TABLE "Session" (
  "id" UUID PRIMARY KEY,
  "tokenDigest" CHAR(64) NOT NULL UNIQUE CHECK ("tokenDigest" ~ '^[a-f0-9]{64}$'),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session" ("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session" ("expiresAt");
CREATE TABLE "AuditEvent" (
  "id" UUID PRIMARY KEY,
  "eventType" VARCHAR(40) NOT NULL,
  "actorId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
  "targetId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correlationId" VARCHAR(64) NOT NULL,
  "metadata" JSONB NOT NULL CHECK (jsonb_typeof("metadata") = 'object')
);
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent" ("createdAt");
CREATE INDEX "AuditEvent_actorId_eventType_createdAt_idx" ON "AuditEvent" ("actorId", "eventType", "createdAt");
CREATE TABLE "LoginThrottle" (
  "key" VARCHAR(80) PRIMARY KEY,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL CHECK ("attempts" BETWEEN 1 AND 60)
);
CREATE INDEX "LoginThrottle_windowStartedAt_idx" ON "LoginThrottle" ("windowStartedAt");

-- Setup closure is permanent, even if accounts are subsequently disabled.
CREATE FUNCTION protect_installation_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Installation state cannot be deleted'; END IF;
  IF OLD."initializedAt" IS NOT NULL AND NEW."initializedAt" IS DISTINCT FROM OLD."initializedAt" THEN
    RAISE EXCEPTION 'Installation setup is permanently closed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "InstallationState_permanent" BEFORE UPDATE OR DELETE ON "InstallationState"
FOR EACH ROW EXECUTE FUNCTION protect_installation_state();

-- Audit history is append-only; ordinary account administration never deletes it.
CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Security audit events are append-only'; END $$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
