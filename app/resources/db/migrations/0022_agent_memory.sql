CREATE TABLE `agent_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`rule` text NOT NULL,
	`source_feedback_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_memory_agent_active_idx` ON `agent_memory` (`agent_id`,`active`);
