CREATE TABLE `pending_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`request` text NOT NULL,
	`target` text NOT NULL,
	`plan` text NOT NULL,
	`target_run_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
