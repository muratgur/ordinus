ALTER TABLE `work_requests` ADD COLUMN `workspace_root` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `work_requests` ADD COLUMN `artifact_root` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `work_runs` ADD COLUMN `artifact_refs` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `work_runs` ADD COLUMN `changed_files` text NOT NULL DEFAULT '[]';
