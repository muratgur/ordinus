ALTER TABLE `agents` ADD `avatar` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `last_used_at` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `use_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `archived_at` text;
