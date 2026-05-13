CREATE TABLE `work_request_agent_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `request_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `model` text NOT NULL,
  `provider_session_ref` text,
  `status` text NOT NULL,
  `last_run_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_request_agent_sessions_request_agent_unique`
ON `work_request_agent_sessions` (`request_id`, `agent_id`);
