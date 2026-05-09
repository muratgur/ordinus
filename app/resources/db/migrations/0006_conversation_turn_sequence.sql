ALTER TABLE `conversation_turns` ADD COLUMN `sequence` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
WITH ordered_turns AS (
  SELECT
    `id`,
    row_number() OVER (
      PARTITION BY `conversation_id`
      ORDER BY `created_at`, rowid
    ) AS `next_sequence`
  FROM `conversation_turns`
)
UPDATE `conversation_turns`
SET `sequence` = (
  SELECT `next_sequence`
  FROM `ordered_turns`
  WHERE `ordered_turns`.`id` = `conversation_turns`.`id`
);
--> statement-breakpoint
CREATE INDEX `conversation_turns_conversation_sequence_idx`
ON `conversation_turns` (`conversation_id`, `sequence`);
