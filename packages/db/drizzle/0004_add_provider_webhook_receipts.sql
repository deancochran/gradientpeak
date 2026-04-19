CREATE TABLE IF NOT EXISTS "provider_webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"provider" "integration_provider" NOT NULL,
	"integration_id" uuid,
	"provider_account_id" text,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"payload" jsonb NOT NULL,
	"payload_hash" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"job_id" uuid,
	"last_error" text,
	CONSTRAINT "provider_webhook_receipts_idx_key" UNIQUE("idx"),
	CONSTRAINT "provider_webhook_receipts_event_unique" UNIQUE("provider","provider_account_id","provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_job_id_provider_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provider_sync_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_webhook_receipts_provider_status" ON "provider_webhook_receipts" USING btree ("provider","processing_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_webhook_receipts_job_id" ON "provider_webhook_receipts" USING btree ("job_id");
