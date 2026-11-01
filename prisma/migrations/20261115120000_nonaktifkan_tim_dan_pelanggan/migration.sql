-- AlterTable
ALTER TABLE `BusinessMembership` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX `Customer_businessId_active_idx` ON `Customer`(`businessId`, `active`);

