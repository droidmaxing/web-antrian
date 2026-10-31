-- SaaS multi-tenant: platform admin role, plans, subscriptions, and payments.
-- Purely additive: no existing table, column, or row is modified or dropped.

ALTER TABLE `User`
  ADD COLUMN `platformRole` ENUM('USER', 'MASTER_ADMIN') NOT NULL DEFAULT 'USER';

CREATE TABLE `Plan` (
  `id`           VARCHAR(191) NOT NULL,
  `code`         VARCHAR(191) NOT NULL,
  `name`         VARCHAR(191) NOT NULL,
  `description`  VARCHAR(200) NULL,
  `monthlyPrice` INTEGER NOT NULL DEFAULT 0,
  `yearlyPrice`  INTEGER NOT NULL DEFAULT 0,
  `active`       BOOLEAN NOT NULL DEFAULT true,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,
  UNIQUE INDEX `Plan_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Subscription` (
  `id`               VARCHAR(191) NOT NULL,
  `businessId`       VARCHAR(191) NOT NULL,
  `planId`           VARCHAR(191) NULL,
  `status`           ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') NOT NULL DEFAULT 'TRIAL',
  `cycle`            ENUM('MONTHLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
  `trialEndsAt`      DATETIME(3) NULL,
  `currentPeriodEnd` DATETIME(3) NULL,
  `startedAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,
  UNIQUE INDEX `Subscription_businessId_key`(`businessId`),
  INDEX `Subscription_status_currentPeriodEnd_idx`(`status`, `currentPeriodEnd`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payment` (
  `id`             VARCHAR(191) NOT NULL,
  `businessId`     VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NULL,
  `planId`         VARCHAR(191) NULL,
  `orderId`        VARCHAR(191) NOT NULL,
  `cycle`          ENUM('MONTHLY', 'YEARLY') NOT NULL,
  `amount`         INTEGER NOT NULL,
  `status`         ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `provider`       VARCHAR(191) NOT NULL DEFAULT 'midtrans',
  `providerRef`    VARCHAR(191) NULL,
  `paidAt`         DATETIME(3) NULL,
  `payload`        JSON NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,
  UNIQUE INDEX `Payment_orderId_key`(`orderId`),
  INDEX `Payment_businessId_createdAt_idx`(`businessId`, `createdAt`),
  INDEX `Payment_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Subscription`
  ADD CONSTRAINT `Subscription_businessId_fkey`
    FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `Subscription_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Payment_subscriptionId_fkey`
    FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Payment_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
