CREATE TABLE `receipt_locks` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`locked_at` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`payee` text NOT NULL,
	`category` text NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receipts_amount_check" CHECK(amount BETWEEN 1 AND 9999999),
	CONSTRAINT "receipts_category_check" CHECK(category IN ('transportation', 'lodging', 'meeting', 'entertainment', 'supplies', 'communication', 'other'))
);
--> statement-breakpoint
CREATE INDEX `receipts_owner_date_created_idx` ON `receipts` (`owner_id`,`date`,`created_at`);