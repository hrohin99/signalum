CREATE TABLE "battlecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"what_they_do" text,
	"strengths" jsonb DEFAULT '[]'::jsonb,
	"weaknesses" jsonb DEFAULT '[]'::jsonb,
	"how_to_beat" jsonb DEFAULT '[]'::jsonb,
	"last_ai_generated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "battlecards_tenant_entity" UNIQUE("tenant_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "topic_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"date_type" text NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "topic_dates_entity_id_idx" ON "topic_dates" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "topic_dates_date_idx" ON "topic_dates" USING btree ("date");