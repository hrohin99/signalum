CREATE TABLE "product_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"description" text,
	"target_customer" text,
	"strengths" text,
	"weaknesses" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_type_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type_key" text NOT NULL,
	"display_name" text NOT NULL,
	"icon" text NOT NULL,
	"description" text NOT NULL,
	"ai_prompt_hint" text NOT NULL,
	"widget_config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
