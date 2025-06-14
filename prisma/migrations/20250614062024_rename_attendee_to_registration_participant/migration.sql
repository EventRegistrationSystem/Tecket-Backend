/*
  Warnings:

  - You are about to drop the column `attendee_id` on the `responses` table. All the data in the column will be lost.
  - You are about to drop the `attendees` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `registration_participant_id` to the `responses` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `attendees` DROP FOREIGN KEY `attendees_participant_id_fkey`;

-- DropForeignKey
ALTER TABLE `attendees` DROP FOREIGN KEY `attendees_registration_id_fkey`;

-- DropForeignKey
ALTER TABLE `attendees` DROP FOREIGN KEY `attendees_ticket_id_fkey`;

-- DropForeignKey
ALTER TABLE `responses` DROP FOREIGN KEY `responses_attendee_id_fkey`;

-- DropIndex
DROP INDEX `responses_attendee_id_fkey` ON `responses`;

-- AlterTable
ALTER TABLE `responses` DROP COLUMN `attendee_id`,
    ADD COLUMN `registration_participant_id` INTEGER NOT NULL;

-- DropTable
DROP TABLE `attendees`;

-- CreateTable
CREATE TABLE `registration_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registration_id` INTEGER NOT NULL,
    `participant_id` INTEGER NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `responses` ADD CONSTRAINT `responses_registration_participant_id_fkey` FOREIGN KEY (`registration_participant_id`) REFERENCES `registration_participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registration_participants` ADD CONSTRAINT `registration_participants_registration_id_fkey` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registration_participants` ADD CONSTRAINT `registration_participants_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registration_participants` ADD CONSTRAINT `registration_participants_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
