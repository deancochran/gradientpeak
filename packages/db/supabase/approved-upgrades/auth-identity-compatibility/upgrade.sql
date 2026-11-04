-- Approved auth-identity compatibility upgrade only. Use the guarded runner.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
ALTER TABLE "accounts" ALTER COLUMN "issuer" DROP NOT NULL;
DROP INDEX "accounts_issuer_accountId_uidx";
CREATE UNIQUE INDEX "accounts_providerId_accountId_uidx" ON "accounts" USING btree ("provider_id","account_id");
COMMIT;
