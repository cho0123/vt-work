/**
 * 개발 DB 문서 수를 백업과 대조한다.
 *
 * count() 집계 쿼리를 쓰므로 문서를 실제로 읽지 않는다.
 * (1000건당 읽기 1건으로 과금 — 전체 스캔 대비 1000분의 1 수준)
 * 일일 읽기 할당량을 화면 테스트에 쓰기 위해 만든 경량 검증.
 *
 * 실행: npm run verify-dev-cheap
 */
import fs from 'fs';
import path from 'path';
import { initDb, BACKUP_DIR, PROD_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'verify-cheap');
if (projectId === PROD_PROJECT_ID) {
    console.error('🛑 운영 프로젝트입니다.');
    process.exit(1);
}

const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
    .sort();
const backup = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[files.length - 1]), 'utf8'));

// 백업 기준 루트 컬렉션별 문서 수
const expected = {};
for (const d of backup.docs) {
    const parts = d.path.split('/');
    if (parts.length === 2) expected[parts[0]] = (expected[parts[0]] || 0) + 1;
}
const expectedPayments = backup.docs.filter((d) => d.path.includes('/payments/')).length;

console.log(`\n대상: ${projectId}`);
console.log(`백업: ${path.basename(files[files.length - 1])}\n`);
console.log('컬렉션'.padEnd(26) + '백업'.padStart(7) + '현재'.padStart(8) + '   결과');
console.log('-'.repeat(52));

let ok = true;
for (const [col, exp] of Object.entries(expected).sort()) {
    const snap = await db.collection(col).count().get();
    const actual = snap.data().count;
    const match = actual === exp;
    if (!match) ok = false;
    console.log(col.padEnd(26) + String(exp).padStart(7) + String(actual).padStart(8) + (match ? '   ✅' : '   ✖'));
}

// payments 는 컬렉션 그룹으로 한 번에
const paySnap = await db.collectionGroup('payments').count().get();
const payActual = paySnap.data().count;
const payMatch = payActual === expectedPayments;
if (!payMatch) ok = false;
console.log(
    'students/*/payments'.padEnd(26) +
        String(expectedPayments).padStart(7) +
        String(payActual).padStart(8) +
        (payMatch ? '   ✅' : '   ✖')
);

console.log(ok ? '\n✅ 문서 수가 백업과 모두 일치합니다.\n' : '\n⚠ 문서 수가 다릅니다.\n');
process.exit(ok ? 0 : 1);
