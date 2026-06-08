CREATE TABLE `ordinus_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`provider_session_ref` text,
	`archived_at` text,
	`frozen_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ordinus_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ordinus_singleton` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model` text DEFAULT 'default' NOT NULL,
	`display_name` text DEFAULT 'Ordinus' NOT NULL,
	`avatar_ref` text,
	`extra_instructions` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
