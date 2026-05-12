ALTER TABLE `conversations` ADD COLUMN `working_root` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `conversations`
SET `working_root` = 'conversations/' || `id`
WHERE `working_root` = '';
--> statement-breakpoint
ALTER TABLE `conversation_turns` ADD COLUMN `artifact_refs` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `conversation_turns` ADD COLUMN `changed_files` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `work_requests` ADD COLUMN `working_root` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `work_requests`
SET `working_root` = CASE
  WHEN `artifact_root` IS NOT NULL AND `artifact_root` <> '' THEN `artifact_root`
  ELSE 'workboard/' || `id`
END
WHERE `working_root` = '';
--> statement-breakpoint
ALTER TABLE `work_runs` ADD COLUMN `working_root` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `work_runs`
SET `working_root` = COALESCE(
  (
    SELECT `work_requests`.`working_root`
    FROM `work_requests`
    WHERE `work_requests`.`id` = `work_runs`.`source_id`
      AND `work_runs`.`source_type` = 'work_request'
  ),
  'workboard/' || `work_runs`.`id`
)
WHERE `working_root` = '';
--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `workspace_root`;
--> statement-breakpoint
ALTER TABLE `work_requests` DROP COLUMN `workspace_root`;
--> statement-breakpoint
ALTER TABLE `work_requests` DROP COLUMN `artifact_root`;
--> statement-breakpoint
ALTER TABLE `work_runs` DROP COLUMN `workspace_root`;
