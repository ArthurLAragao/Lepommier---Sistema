-- CreateEnum
CREATE TYPE "MarketingState" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "ProductOrigin" AS ENUM ('PRODUCED', 'PURCHASED', 'BOTH');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "registrationNumber" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(240) NOT NULL,
    "phone" VARCHAR(14),
    "email" VARCHAR(254),
    "birthday" DATE,
    "cpf" VARCHAR(11),
    "address" VARCHAR(300),
    "notes" VARCHAR(1000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "anonymizedAt" TIMESTAMPTZ(3),
    "marketingState" "MarketingState" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPreferenceEvent" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "previousState" "MarketingState" NOT NULL,
    "state" "MarketingState" NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "evidence" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingPreferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(240) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(240) NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" VARCHAR(1000),
    "origin" "ProductOrigin" NOT NULL,
    "sellingPriceCents" INTEGER NOT NULL,
    "estimatedCostCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storageInstructions" VARCHAR(500),
    "shelfLifeReference" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER NOT NULL,
    "decisionDigest" CHAR(64),
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_registrationNumber_key" ON "Customer"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_cpf_key" ON "Customer"("cpf");

-- CreateIndex
CREATE INDEX "Customer_nameKey_id_idx" ON "Customer"("nameKey", "id");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_active_registrationNumber_idx" ON "Customer"("active", "registrationNumber");

-- CreateIndex
CREATE INDEX "MarketingPreferenceEvent_customerId_createdAt_idx" ON "MarketingPreferenceEvent"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_nameKey_key" ON "Category"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_categoryId_active_idx" ON "Product"("categoryId", "active");

-- CreateIndex
CREATE INDEX "Product_nameKey_id_idx" ON "Product"("nameKey", "id");

-- CreateIndex
CREATE INDEX "Product_active_origin_idx" ON "Product"("active", "origin");

-- CreateIndex
CREATE INDEX "ImportJob_status_expiresAt_idx" ON "ImportJob"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ImportJob_actorId_createdAt_idx" ON "ImportJob"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketingPreferenceEvent" ADD CONSTRAINT "MarketingPreferenceEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MarketingPreferenceEvent" ADD CONSTRAINT "MarketingPreferenceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Custom checks/triggers are deliberately retained in SQL (not represented by Prisma).
CREATE FUNCTION valid_customer_cpf(value TEXT) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE size INTEGER; pos INTEGER; total INTEGER; digit INTEGER;
BEGIN
  IF value !~ '^[0-9]{11}$' OR value ~ '^([0-9])\1{10}$' THEN RETURN FALSE; END IF;
  FOREACH size IN ARRAY ARRAY[9,10] LOOP
    total := 0;
    FOR pos IN 1..size LOOP total := total + substring(value,pos,1)::INTEGER * (size + 2 - pos); END LOOP;
    digit := ((total * 10) % 11) % 10;
    IF digit <> substring(value,size+1,1)::INTEGER THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END $$;
ALTER TABLE "Customer"
 ADD CONSTRAINT "Customer_name_valid" CHECK (length(btrim("name")) BETWEEN 2 AND 120 AND length("nameKey") BETWEEN 1 AND 240),
 ADD CONSTRAINT "Customer_version_positive" CHECK ("version" > 0),
 ADD CONSTRAINT "Customer_registration_positive" CHECK ("registrationNumber" > 0),
 ADD CONSTRAINT "Customer_phone_normalized" CHECK ("phone" IS NULL OR "phone" ~ '^\+55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$'),
 ADD CONSTRAINT "Customer_email_normalized" CHECK ("email" IS NULL OR ("email" = lower(btrim("email")) AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 ADD CONSTRAINT "Customer_cpf_valid" CHECK ("cpf" IS NULL OR valid_customer_cpf("cpf")),
 ADD CONSTRAINT "Customer_birthday_valid" CHECK ("birthday" IS NULL OR ("birthday" >= DATE '1900-01-01' AND "birthday" <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Fortaleza')::DATE)),
 ADD CONSTRAINT "Customer_anonymized_fields" CHECK ("anonymizedAt" IS NULL OR ("name" = 'Cliente anonimizado' AND "nameKey" = 'cliente anonimizado' AND "phone" IS NULL AND "email" IS NULL AND "birthday" IS NULL AND "cpf" IS NULL AND "address" IS NULL AND "notes" IS NULL AND NOT "active" AND "marketingState" = 'OPTED_OUT'));
ALTER TABLE "Category" ADD CONSTRAINT "Category_valid" CHECK (length(btrim("name")) BETWEEN 2 AND 120 AND length("nameKey") BETWEEN 1 AND 240 AND "version" > 0);
ALTER TABLE "Product"
 ADD CONSTRAINT "Product_valid" CHECK (length(btrim("name")) BETWEEN 2 AND 120 AND length("nameKey") BETWEEN 1 AND 240 AND "version" > 0),
 ADD CONSTRAINT "Product_code_normalized" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
 ADD CONSTRAINT "Product_money_valid" CHECK ("sellingPriceCents" BETWEEN 0 AND 99999999 AND ("estimatedCostCents" IS NULL OR "estimatedCostCents" BETWEEN 0 AND 99999999));
ALTER TABLE "MarketingPreferenceEvent" ADD CONSTRAINT "Marketing_event_codes" CHECK ("source" IN ('IN_PERSON','CUSTOMER_REQUEST','RECORD_REVIEW','ANONYMIZATION') AND "reason" IN ('CUSTOMER_REQUEST','CORRECTION','NO_EVIDENCE','RETENTION_REVIEW','DATA_MINIMIZATION'));
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_bounds" CHECK ("rowCount" BETWEEN 0 AND 100 AND "expiresAt" > "createdAt" AND "tokenDigest" ~ '^[a-f0-9]{64}$' AND ("decisionDigest" IS NULL OR "decisionDigest" ~ '^[a-f0-9]{64}$'));
CREATE FUNCTION protect_customer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Customer references must be retained'; END IF;
  IF NEW."id" <> OLD."id" OR NEW."registrationNumber" <> OLD."registrationNumber" THEN RAISE EXCEPTION 'Customer registration is immutable'; END IF;
  IF OLD."anonymizedAt" IS NOT NULL AND NEW."anonymizedAt" IS DISTINCT FROM OLD."anonymizedAt" THEN RAISE EXCEPTION 'Anonymization cannot be reversed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Customer_identity_protected" BEFORE UPDATE OR DELETE ON "Customer" FOR EACH ROW EXECUTE FUNCTION protect_customer_identity();
