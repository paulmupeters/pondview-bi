CREATE TABLE `chart_slicers` (
	`id` text PRIMARY KEY NOT NULL,
	`chart_id` text NOT NULL,
	`field` text NOT NULL,
	`title` text,
	`limit` integer DEFAULT 50 NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chart_id`) REFERENCES `dashboard_charts`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `chart_slicers_chart_id_position_idx` ON `chart_slicers` (`chart_id`,`position`);
