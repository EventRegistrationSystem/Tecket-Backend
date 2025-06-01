/*
  Warnings:

  - Added the required column `ticket_id` to the `attendees` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `attendees` ADD COLUMN `ticket_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `attendees` ADD CONSTRAINT `attendees_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
