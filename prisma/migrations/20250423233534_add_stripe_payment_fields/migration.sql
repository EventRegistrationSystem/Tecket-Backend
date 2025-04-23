/*
  Warnings:

  - A unique constraint covering the columns `[stripe_payment_intent_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `currency` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripe_payment_intent_id` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `payments` ADD COLUMN `currency` VARCHAR(191) NOT NULL,
    ADD COLUMN `stripe_payment_intent_id` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `payments_stripe_payment_intent_id_key` ON `payments`(`stripe_payment_intent_id`);
