import { QueryDocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { verifyTabBalanceProjection, verifyTabMembershipProjection } from './projection-verifier';

export const verifyBalanceProjections = onSchedule({
  schedule: '15 3 * * *',
  timeZone: 'America/Los_Angeles',
  region: 'us-west1',
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
}, async () => {
  const firestore = getFirestore();
  let cursor: QueryDocumentSnapshot | undefined;
  let checked = 0;
  let repaired = 0;
  do {
    let query = firestore.collection('tabs').orderBy('__name__').limit(50);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const tab of page.docs) {
      const membershipResult = await verifyTabMembershipProjection(firestore, tab.id, true);
      if (membershipResult.mismatchCount > 0) {
        logger.error('Membership projection mismatch detected', {
          tabId: tab.id,
          mismatchCount: membershipResult.mismatchCount,
          repaired: membershipResult.repaired,
        });
      }
      const result = await verifyTabBalanceProjection(firestore, tab.id, tab.data().currency, true);
      checked += 1;
      if (result.repaired) {
        repaired += 1;
        logger.error('Balance projection mismatch repaired', {
          tabId: tab.id,
          mismatchCount: result.mismatchCount,
        });
      }
    }
    cursor = page.docs.at(-1);
    if (page.size < 50) break;
  } while (cursor);
  logger.info('Balance projection verification completed', { checked, repaired });
});
