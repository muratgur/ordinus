CREATE TABLE `ordinus_input_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`questions` text NOT NULL,
	`answers` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ordinus_input_requests_conversation_status_idx` ON `ordinus_input_requests` (`conversation_id`,`status`);