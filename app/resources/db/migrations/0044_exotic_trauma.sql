CREATE TABLE `local_connector_state` (
	`connector_id` text PRIMARY KEY NOT NULL,
	`installed_version` text,
	`tool_catalog` text DEFAULT '[]' NOT NULL,
	`enabled_tools` text DEFAULT '[]' NOT NULL,
	`last_health` text DEFAULT 'ok' NOT NULL,
	`updated_at` text NOT NULL
);
