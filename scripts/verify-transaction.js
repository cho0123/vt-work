/**
 * 동시 쓰기 유실 방지 검증.
 *
 * 개발 DB에 임시 학생 문서를 만들고, 미수금 5건을 "동시에" 추가한다.
 *  - 기존 방식(getDoc -> 메모리 수정 -> updateDoc): 서로 덮어써서 일부가 사라져야 함
 *  - 새 방식(runTransaction): 5건이 모두 남아야 함
 * 끝나면 임시 문서를 지운다.
 *
 * 실행: npm run verify-transaction
 */
import { initDb, PROD_PROJECT_ID } from './lib/common.js';

const { db, projectId } = initDb('key-B.json', 'verify-tx');
if (projectId !== 'vt-work-dev-3aec5' || projectId === PROD_PROJECT_ID) {
    console.error(`🛑 개발 프로젝트가 아닙니다: ${projectId}`);
    process.exit(1);
}

const TEST_ID = 'zzz-tx-test-temp';
const ref = db.collection('students').doc(TEST_ID);
const N = 5;

const mkItem = (i) => ({ id: `item-${i}`, targetDate: `2026-01-0${i + 1}`, amount: 1000 * (i + 1) });

async function reset() {
    await ref.set({ name: '__트랜잭션 테스트__', unpaidList: [], count: '0', isPaid: true });
}

// 기존 방식
async function legacyAdd(i) {
    const snap = await ref.get();
    const list = [...(snap.data().unpaidList || []), mkItem(i)];
    await ref.update({ unpaidList: list, isPaid: false });
}

// 새 방식
async function txAdd(i) {
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const list = [...(snap.data().unpaidList || []), mkItem(i)];
        tx.update(ref, { unpaidList: list, isPaid: false });
    });
}

async function run(label, fn) {
    await reset();
    await Promise.all(Array.from({ length: N }, (_, i) => fn(i)));
    const after = (await ref.get()).data().unpaidList.length;
    console.log(`${label.padEnd(26)} ${N}건 동시 추가 -> 실제 남은 건수: ${after}${after < N ? `  ✖ ${N - after}건 유실` : '  ✅ 전부 보존'}`);
    return after;
}

try {
    console.log(`\n대상: ${projectId} (임시 문서 ${TEST_ID})\n`);
    const legacyResult = await run('기존 방식(getDoc+update)', legacyAdd);
    const txResult = await run('새 방식(runTransaction)', txAdd);

    console.log();
    if (txResult === N && legacyResult < N) {
        console.log('✅ 트랜잭션이 동시 쓰기 유실을 막는 것이 확인되었습니다.\n');
    } else if (txResult === N) {
        console.log('✅ 트랜잭션 방식은 전부 보존됨. (이번 실행에서는 기존 방식도 우연히 살아남음)\n');
    } else {
        console.log('⚠ 트랜잭션 방식에서도 유실이 발생했습니다. 확인이 필요합니다.\n');
        process.exitCode = 1;
    }
} finally {
    await ref.delete();
    console.log(`임시 문서 ${TEST_ID} 삭제 완료.`);
}
