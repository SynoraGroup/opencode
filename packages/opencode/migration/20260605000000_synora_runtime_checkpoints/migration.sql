CREATE TABLE `session_runtime_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `type` text NOT NULL,
  `message_id` text,
  `provider_id` text,
  `model_id` text,
  `checkpoint_id` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `data` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_runtime_ledger_session_time_idx` ON `session_runtime_ledger` (`session_id`,`time_created`,`id`);
--> statement-breakpoint
CREATE INDEX `session_runtime_ledger_checkpoint_idx` ON `session_runtime_ledger` (`checkpoint_id`);
--> statement-breakpoint
CREATE TABLE `session_runtime_checkpoint` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `parent_message_id` text NOT NULL,
  `summary_message_id` text NOT NULL,
  `tail_start_id` text,
  `provider_id` text NOT NULL,
  `model_id` text NOT NULL,
  `variant` text,
  `tokens_before` integer DEFAULT 0 NOT NULL,
  `tokens_after` integer DEFAULT 0 NOT NULL,
  `cache_prefix_tokens` integer DEFAULT 0 NOT NULL,
  `cache_prefix_hash` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `data` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_runtime_checkpoint_session_time_idx` ON `session_runtime_checkpoint` (`session_id`,`time_created`,`id`);
--> statement-breakpoint
CREATE INDEX `session_runtime_checkpoint_summary_idx` ON `session_runtime_checkpoint` (`summary_message_id`);
