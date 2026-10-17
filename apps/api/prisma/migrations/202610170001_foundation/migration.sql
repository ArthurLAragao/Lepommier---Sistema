-- Foundation only. No owner credentials or operational fixtures are seeded.
CREATE TABLE "StoreSettings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "businessTimezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreSettings_singleton" CHECK ("id" = 1),
  CONSTRAINT "StoreSettings_timezone" CHECK ("businessTimezone" = 'America/Fortaleza')
);
