CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`requested_work` text NOT NULL,
	`instructions` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`sandbox` text NOT NULL,
	`workspace_root` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
