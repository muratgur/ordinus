ALTER TABLE `work_runs` ADD COLUMN `expected_output` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE `work_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `original_request` text NOT NULL,
  `summary` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text
);
--> statement-breakpoint
CREATE TABLE `work_run_input_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `status` text NOT NULL,
  `title` text NOT NULL,
  `detail` text NOT NULL,
  `questions` text NOT NULL,
  `answers` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_requests_status_updated_idx`
ON `work_requests` (`status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `work_run_input_requests_run_status_idx`
ON `work_run_input_requests` (`run_id`, `status`);
