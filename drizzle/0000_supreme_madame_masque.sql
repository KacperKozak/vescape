CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`ble_id` text,
	`is_starred` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
