CREATE TABLE `ordinus_conversation_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`turn_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ordinus_conversation_turns_conversation_created_idx` ON `ordinus_conversation_turns` (`conversation_id`,`created_at`);