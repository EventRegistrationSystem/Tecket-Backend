/*
  Warnings:

  - You are about to drop the column `quantity` on the `purchases` table. All the data in the column will be lost.
  - You are about to drop the column `ticket_id` on the `purchases` table. All the data in the column will be lost.
  - You are about to drop the column `unit_price` on the `purchases` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `purchases` DROP FOREIGN KEY `purchases_ticket_id_fkey`;

-- DropIndex
DROP INDEX `purchases_ticket_id_key` ON `purchases`;

-- AlterTable
ALTER TABLE `purchases` DROP COLUMN `quantity`,
    DROP COLUMN `ticket_id`,
    DROP COLUMN `unit_price`;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_id` INTEGER NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
