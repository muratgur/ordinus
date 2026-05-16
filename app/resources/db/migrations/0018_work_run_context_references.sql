CREATE TABLE `work_run_context_references` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `kind` text NOT NULL,
  `ref_id` text NOT NULL,
  `label` text NOT NULL,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_run_context_references_run_id_idx`
ON `work_run_context_references` (`run_id`);
--> statement-breakpoint
CREATE INDEX `work_run_context_references_kind_ref_idx`
ON `work_run_context_references` (`kind`, `ref_id`);
