ALTER TABLE `observed_runs` ADD `cached_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `delta_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `delta_cached_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `delta_output_tokens` integer;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `delta_total_tokens` integer;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `usage_semantics` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `observed_runs` ADD `provider_session_ref` text DEFAULT '' NOT NULL;