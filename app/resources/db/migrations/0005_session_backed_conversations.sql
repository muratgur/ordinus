CREATE TABLE `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `mode` text NOT NULL,
  `status` text NOT NULL,
  `summary` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_participants` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `model` text NOT NULL,
  `provider_session_ref` text,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_turns` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `speaker` text NOT NULL,
  `content` text NOT NULL,
  `preview` text NOT NULL,
  `status` text NOT NULL,
  `error` text NOT NULL,
  `log_ref` text NOT NULL,
  `truncated` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_participants_conversation_id_idx` ON `conversation_participants` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `conversation_turns_conversation_id_idx` ON `conversation_turns` (`conversation_id`);
