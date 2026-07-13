DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "activity_plans"
		WHERE "template_visibility" NOT IN ('private', 'public')
	) OR EXISTS (
		SELECT 1 FROM "training_plans"
		WHERE "template_visibility" NOT IN ('private', 'public')
	) THEN
		RAISE EXCEPTION 'Plan template_visibility contains unsupported values';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "activity_plans"
		WHERE "is_public" = true AND "template_visibility" <> 'public'
	) OR EXISTS (
		SELECT 1 FROM "training_plans"
		WHERE "is_public" = true AND "template_visibility" <> 'public'
	) THEN
		RAISE EXCEPTION 'Cannot drop plan is_public while it grants access not represented by template_visibility';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "activity_plans" DROP COLUMN "is_public";--> statement-breakpoint
ALTER TABLE "training_plans" DROP COLUMN "is_public";
