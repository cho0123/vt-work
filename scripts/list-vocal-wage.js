/**
 * 개발 DB의 보컬 임금 지출 내역을 보여준다. (읽기 소량)
 * 이 문서가 있으면 해당 월의 '보컬진행' 스케쥴 수정이 차단된다.
 *
 * 실행: node scripts/list-vocal-wage.js
 *   삭제: node scripts/list-vocal-wage.js --delete <문서ID>
 */
import { initDb, PROD_PROJECT_ID, DEV_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'vocal-wage');
if (projectId === PROD_PROJECT_ID || projectId !== DEV_PROJECT_ID) {
    console.error(`🛑 등록된 개발 프로젝트가 아닙니다: ${projectId}`);
    process.exit(1);
}

const delFlag = process.argv.indexOf('--delete');
const delId = delFlag !== -1 ? process.argv[delFlag + 1] : null;

if (delId) {
    await db.collection('expenses').doc(delId).delete();
    console.log(`\n삭제 완료: expenses/${delId}\n`);
    process.exit(0);
}

const snap = await db.collection('expenses').where('isVocalWage', '==', true).get();

console.log(`\n대상: ${projectId}`);
console.log(`보컬 임금 지출: ${snap.size}건\n`);
for (const d of snap.docs) {
    const x = d.data();
    console.log(`  ${d.id}`);
    console.log(`     대상월: ${x.targetMonth}  금액: ${x.amount}  지급일: ${x.paidDate ?? '(미지급)'}`);
    console.log(`     메모: ${x.memo || '(없음)'}`);
}
console.log();
