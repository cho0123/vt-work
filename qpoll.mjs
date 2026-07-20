import { initDb } from './scripts/lib/common.js';
const { db } = initDb('key-B.json', 'qpoll');
for (let i = 1; i <= 20; i++) {
  try {
    const s = await db.collection('students').limit(3).get();
    console.log(`[시도 ${i}] 읽기 정상 — ${s.size}건. 할당량 해제됨.`);
    process.exit(0);
  } catch (e) {
    console.log(`[시도 ${i}] 아직 막힘: ${(e.details||e.message).split('\n')[0]}`);
  }
  await new Promise(r => setTimeout(r, 30000));
}
console.log('20회 시도했으나 여전히 막혀 있습니다.');
process.exit(1);
