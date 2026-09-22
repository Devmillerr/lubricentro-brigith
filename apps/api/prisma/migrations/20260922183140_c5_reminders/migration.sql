-- CreateEnum
CREATE TYPE "ReminderContactChannel" AS ENUM ('WHATSAPP_LINK');

-- CreateTable
CREATE TABLE "reminder_contacts" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "ReminderContactChannel" NOT NULL DEFAULT 'WHATSAPP_LINK',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageSnapshot" TEXT NOT NULL,

    CONSTRAINT "reminder_contacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reminder_contacts" ADD CONSTRAINT "reminder_contacts_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "reminders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_contacts" ADD CONSTRAINT "reminder_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
