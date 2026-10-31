// The morning "Question of the day", every day at 7 am Sudan time.
//
// It used to be only a GitHub Actions cron (scripts/daily-question.mjs), but
// GitHub starts scheduled jobs on this repository hours late (the 02:30 UTC job
// runs around 08:40), so the 7 am question came at lunchtime or not at all.
// Cloud Scheduler fires on time. The GitHub job stays as a backup: both check
// dailyquizz first, so whichever runs second does nothing.
//
// When no daily question was posted today it posts one picked from the bank
// (dailyCore.js: the same pick as src/lib/dailyPick.js, checked by its test);
// either way today's question is pushed to every phone once (`notified`),
// through push_outbox and deliverPush.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';
import { runDaily } from './dailyCore.js';

export const dailyQuestion = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Africa/Khartoum',
    memory: '1GiB', // the whole bank (13,000+ questions) is read once
    timeoutSeconds: 300,
    retryCount: 2,
  },
  async () => {
    logger.info(await runDaily(getDatabase()));
  },
);
