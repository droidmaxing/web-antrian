-- Operator access to specific counters, and TV displays scoped to specific
-- counters. Both are additive: an empty table means "no restriction", so every
-- existing account and display keeps working exactly as before.

CREATE TABLE `CounterMember` (
    `counterId` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CounterMember_membershipId_idx`(`membershipId`),
    PRIMARY KEY (`counterId`, `membershipId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DisplayCounter` (
    `displayId` VARCHAR(191) NOT NULL,
    `counterId` VARCHAR(191) NOT NULL,

    INDEX `DisplayCounter_counterId_idx`(`counterId`),
    PRIMARY KEY (`displayId`, `counterId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CounterMember`
    ADD CONSTRAINT `CounterMember_counterId_fkey` FOREIGN KEY (`counterId`) REFERENCES `Counter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CounterMember`
    ADD CONSTRAINT `CounterMember_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `BusinessMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DisplayCounter`
    ADD CONSTRAINT `DisplayCounter_displayId_fkey` FOREIGN KEY (`displayId`) REFERENCES `Display`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DisplayCounter`
    ADD CONSTRAINT `DisplayCounter_counterId_fkey` FOREIGN KEY (`counterId`) REFERENCES `Counter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
