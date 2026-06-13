CREATE TABLE `telegram_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`bot_username` text,
	`owner_user_id` text,
	`owner_name` text,
	`owner_chat_id` text,
	`paired_at` text,
	`ordinus_conversation_id` text,
	`last_update_offset` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
