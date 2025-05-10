/*
  Warnings:

  - You are about to drop the column `registration_id` on the `responses` table. All the data in the column will be lost.
  - Added the required column `attendee_id` to the `responses` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `responses` DROP FOREIGN KEY `responses_registration_id_fkey`;

-- DropIndex
DROP INDEX `responses_registration_id_fkey` ON `responses`;

-- AlterTable
ALTER TABLE `responses` DROP COLUMN `registration_id`,
    ADD COLUMN `attendee_id` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `attendees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registration_id` INTEGER NOT NULL,
    `participant_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `responses` ADD CONSTRAINT `responses_attendee_id_fkey` FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendees` ADD CONSTRAINT `attendees_registration_id_fkey` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendees` ADD CONSTRAINT `attendees_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
