CREATE TABLE IF NOT EXISTS `app_meta` (
  `id` integer PRIMARY KEY,
  `schema_version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
