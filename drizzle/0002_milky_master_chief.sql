CREATE TABLE `bot_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`messageType` enum('text','gif') NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`botName` varchar(100) NOT NULL,
	`identityPrompt` text NOT NULL,
	`inviteCode` varchar(32) NOT NULL,
	`partnerUserId` int,
	`firstMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `bot_profiles_ownerUserId_unique` UNIQUE(`ownerUserId`),
	CONSTRAINT `bot_profiles_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `owner_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`ownerUserId` int NOT NULL,
	`partnerUserId` int NOT NULL,
	`type` enum('cat_ping') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `owner_notifications_id` PRIMARY KEY(`id`)
);
