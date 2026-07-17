-- AlterTable
ALTER TABLE "users" ADD COLUMN     "quiet_hours_end" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "quiet_hours_start" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "reminder_days_before" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "reminder_email_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminders_enabled" BOOLEAN NOT NULL DEFAULT true;
