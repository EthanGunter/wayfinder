import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily at midnight UTC to clean up deleted users
/* crons.daily(
  "hard-delete-deleted-users",
  { hourUTC: 0, minuteUTC: 0 },
  internal.users.permanentlyWipeDeletedUsers,
); */

export default crons;

