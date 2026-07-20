import { initDb } from './scripts/lib/common.js';
const { db } = initDb('key-B.json', 'q2');
try {
  const s = await db.collection('settlement_memos').doc('2026-07').get();
  console.log('읽기: 정상');
} catch (e) { console.log('읽기: 실패 —', (e.details||e.message).split('\n')[0]); }
try {
  await db.runTransaction(async tx => {
    const r = db.collection('students').doc('zzz-probe');
    await tx.get(r);
  });
  console.log('트랜잭션(읽기 포함): 정상');
} catch (e) { console.log('트랜잭션: 실패 —', (e.details||e.message).split('\n')[0]); }
