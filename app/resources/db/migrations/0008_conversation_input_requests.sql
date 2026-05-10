CREATE TABLE `conversation_input_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `status` text NOT NULL,
  `title` text NOT NULL,
  `detail` text NOT NULL,
  `questions` text NOT NULL,
  `answers` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_input_requests_conversation_id_idx`
ON `conversation_input_requests` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `conversation_input_requests_turn_id_idx`
ON `conversation_input_requests` (`turn_id`);
--> statement-breakpoint
CREATE INDEX `conversation_input_requests_status_idx`
ON `conversation_input_requests` (`status`);
