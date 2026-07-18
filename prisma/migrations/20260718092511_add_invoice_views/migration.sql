-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewed_at" TIMESTAMP(3);
