CREATE TABLE `dashboard_slicers` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`field` text NOT NULL,
	`title` text,
	`limit` integer DEFAULT 50 NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `dashboard_slicers_dashboard_id_position_idx` ON `dashboard_slicers` (`dashboard_id`,`position`);
