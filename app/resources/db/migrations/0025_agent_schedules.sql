CREATE TABLE `agent_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`cron` text,
	`run_at` text,
	`timezone` text NOT NULL,
	`linked_work_request_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`last_run_id` text,
	`last_run_status` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`disable_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_schedules_agent_idx` ON `agent_schedules` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_schedules_linked_request_idx` ON `agent_schedules` (`linked_work_request_id`);--> statement-breakpoint
CREATE INDEX `agent_schedules_enabled_next_run_idx` ON `agent_schedules` (`enabled`,`next_run_at`);
