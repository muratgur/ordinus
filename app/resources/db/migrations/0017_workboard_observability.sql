CREATE TABLE `observed_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `source_surface` text NOT NULL,
  `source_item_id` text NOT NULL,
  `source_item_title` text NOT NULL DEFAULT '',
  `assigned_agent_id` text NOT NULL DEFAULT '',
  `assigned_agent_name` text NOT NULL DEFAULT '',
  `assigned_agent_role` text NOT NULL DEFAULT '',
  `provider_id` text NOT NULL,
  `model` text NOT NULL,
  `lifecycle_status` text NOT NULL,
  `liveness_health` text NOT NULL,
  `current_phase` text NOT NULL,
  `latest_activity` text NOT NULL DEFAULT '',
  `latest_activity_at` text,
  `queued_at` text,
  `started_at` text,
  `first_activity_at` text,
  `last_activity_at` text,
  `completed_at` text,
  `input_tokens` integer,
  `output_tokens` integer,
  `total_tokens` integer,
  `usage_source` text NOT NULL DEFAULT 'unavailable',
  `sanitized_invocation` text NOT NULL DEFAULT '{}',
  `log_ref` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observed_runs_source_unique`
ON `observed_runs` (`source_surface`, `source_item_id`);
--> statement-breakpoint
CREATE TABLE `observed_run_events` (
  `id` text PRIMARY KEY NOT NULL,
  `observed_run_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `timestamp` text NOT NULL,
  `kind` text NOT NULL,
  `source` text NOT NULL,
  `confidence` text NOT NULL,
  `phase` text,
  `lifecycle_status` text,
  `summary` text NOT NULL DEFAULT '',
  `payload` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `observed_run_events_run_sequence_idx`
ON `observed_run_events` (`observed_run_id`, `sequence`);
