ALTER TABLE `conversations` ADD `kind` text DEFAULT 'group' NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_kind_idx` ON `conversations` (`kind`);--> statement-breakpoint
--> ADR-027 clean split: agent home rooms replace 1:1 conversations. Surviving
--> multi-agent conversations are 'group' (column default). Legacy single-agent
--> ('direct') conversations are removed (pre-release); their workspace folders on
--> disk are harmless orphans and are not touched by this migration.
DELETE FROM `conversation_input_requests` WHERE `conversation_id` IN (SELECT `id` FROM `conversations` WHERE `mode` = 'direct');--> statement-breakpoint
DELETE FROM `conversation_turns` WHERE `conversation_id` IN (SELECT `id` FROM `conversations` WHERE `mode` = 'direct');--> statement-breakpoint
DELETE FROM `conversation_participants` WHERE `conversation_id` IN (SELECT `id` FROM `conversations` WHERE `mode` = 'direct');--> statement-breakpoint
DELETE FROM `conversations` WHERE `mode` = 'direct';
