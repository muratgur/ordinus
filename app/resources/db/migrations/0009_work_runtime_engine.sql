CREATE TABLE `work_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `root_run_id` text NOT NULL,
  `parent_run_id` text,
  `assigned_agent_id` text NOT NULL,
  `created_by_type` text NOT NULL,
  `created_by_agent_id` text,
  `source_type` text,
  `source_id` text,
  `source_item_id` text,
  `title` text NOT NULL,
  `instruction` text NOT NULL,
  `status` text NOT NULL,
  `priority` integer NOT NULL DEFAULT 0,
  `provider_id` text NOT NULL,
  `model` text NOT NULL,
  `provider_session_ref` text,
  `workspace_root` text NOT NULL,
  `sandbox` text NOT NULL,
  `result_summary` text NOT NULL DEFAULT '',
  `error` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text
);
--> statement-breakpoint
CREATE TABLE `work_run_dependencies` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `depends_on_run_id` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `work_run_events` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `kind` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_runs_assigned_agent_status_idx`
ON `work_runs` (`assigned_agent_id`, `status`);
--> statement-breakpoint
CREATE INDEX `work_runs_status_priority_created_idx`
ON `work_runs` (`status`, `priority`, `created_at`);
--> statement-breakpoint
CREATE INDEX `work_runs_root_run_id_idx`
ON `work_runs` (`root_run_id`);
--> statement-breakpoint
CREATE INDEX `work_run_dependencies_run_id_idx`
ON `work_run_dependencies` (`run_id`);
--> statement-breakpoint
CREATE INDEX `work_run_dependencies_depends_on_status_idx`
ON `work_run_dependencies` (`depends_on_run_id`, `status`);
--> statement-breakpoint
CREATE INDEX `work_run_events_run_sequence_idx`
ON `work_run_events` (`run_id`, `sequence`);
