/*
  Warnings:

  - A unique constraint covering the columns `[payment_token]` on the table `purchases` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `payment_token` VARCHAR(191) NULL,
    ADD COLUMN `payment_token_expiry` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `purchases_payment_token_key` ON `purchases`(`payment_token`);
