ALTER TABLE `work_runs` ADD COLUMN `assigned_agent_name` text NOT NULL DEFAULT 'Former agent';
--> statement-breakpoint
ALTER TABLE `work_runs` ADD COLUMN `assigned_agent_role` text NOT NULL DEFAULT '';
