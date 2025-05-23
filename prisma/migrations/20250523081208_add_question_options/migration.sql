/*
  Warnings:

  - The values [MULTIPLE_CHOICE,DATE,EMAIL,PHONE] on the enum `questions_question_type` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `questions` MODIFY `question_type` ENUM('TEXT', 'CHECKBOX', 'DROPDOWN') NOT NULL DEFAULT 'TEXT';

-- CreateTable
CREATE TABLE `question_options` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `question_id` INTEGER NOT NULL,
    `option_text` VARCHAR(191) NOT NULL,
    `display_order` INTEGER NULL,

    UNIQUE INDEX `question_options_question_id_option_text_key`(`question_id`, `option_text`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
