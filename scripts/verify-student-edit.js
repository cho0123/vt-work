/**
 * 학생 수정 저장이 미수금·회차를 되살리지 않는지 검증. (개발 프로젝트 전용)
 *
 * 시나리오:
 *   1) 학생 수정 모달을 연다        -> 그 시점의 학생 문서가 폼 상태로 복사됨
 *   2) 그 사이 결제가 처리된다      -> 미수금 0건, 회차 +1
 *   3) 모달에서 전화번호만 고치고 저장
 *   기대: 결제 결과가 유지되어야 한다 (미수금 0건, 회차 그대로)
 *
 * 실행: npm run verify-student-edit
 */
import { initDb, PROD_PROJECT_ID, DEV_PROJECT_ID, DEV_KEY } from './lib/common.js';

const { db, projectId } = initDb(DEV_KEY, 'verify-edit');
if (projectId === PROD_PROJECT_ID || projectId !== DEV_PROJECT_ID) {
    console.error(`🛑 등록된 개발 프로젝트가 아닙니다: ${projectId}`);
    process.exit(1);
}

const ID = 'zzz-edit-test-temp';
const ref = db.collection('students').doc(ID);

const BASE = {
    name: '__수정 테스트__',
    phone: '010-0000-0000',
    isMonthly: false,
    isArtist: false,
    firstDate: '2026-01-01',
    count: '3',
    schedule: [{ week: 1, master: '1', vocal: '1', vocal30: '' }],
    rates: { master: '100000', vocal: '100000' },
    memo: '',
    cashReceiptMemo: '',
    unpaidList: [{ id: 'u1', targetDate: '2026-01-01', amount: 200000, memo: '최초 등록금' }],
    isPaid: false,
    lastDate: '2026-01-01',
    hasPayment: false,
};

// 결제 처리로 바뀌는 값
const AFTER_PAYMENT = { unpaidList: [], isPaid: true, count: '4', lastDate: '2026-02-01', hasPayment: true };

async function run(label, saveFn) {
    await ref.set(BASE);
    // 1) 모달 열기 — 학생 문서 전체를 폼 상태로 복사
    const original = { ...(await ref.get()).data() }; // 모달을 열 때의 원본
    const formSnapshot = { ...original };
    // 2) 그 사이 결제 처리
    await ref.update(AFTER_PAYMENT);
    // 3) 전화번호만 고쳐 저장
    formSnapshot.phone = '010-9999-9999';
    await saveFn(formSnapshot, original);

    const after = (await ref.get()).data();
    const ok = (after.unpaidList || []).length === 0 && after.count === '4' && after.phone === '010-9999-9999';
    console.log(
        `${label.padEnd(24)} 미수금 ${(after.unpaidList || []).length}건, 회차 ${after.count}, 전화 ${after.phone}` +
            (ok ? '   ✅ 결제 결과 유지됨' : '   ✖ 결제 결과가 덮어써짐')
    );
    return ok;
}

// 기존 방식: 폼 상태를 통째로 씀
const legacySave = (form) => ref.update(form);

// 새 방식: 편집 대상 필드 중에서도 '실제로 바뀐 것'만 씀
const EDITABLE = [
    'name',
    'phone',
    'isMonthly',
    'isArtist',
    'firstDate',
    'count',
    'schedule',
    'rates',
    'memo',
    'cashReceiptMemo',
];
const newSave = (form, original) => {
    const patch = {};
    for (const k of EDITABLE) {
        if (JSON.stringify(form[k]) !== JSON.stringify(original[k])) patch[k] = form[k];
    }
    if (Object.keys(patch).length === 0) return Promise.resolve();
    return ref.update(patch);
};

try {
    console.log(`\n대상: ${projectId} (임시 문서 ${ID})\n`);
    const legacyOk = await run('기존 방식(전체 덮어쓰기)', legacySave);
    const newOk = await run('새 방식(편집 필드만)', newSave);

    console.log();
    if (newOk && !legacyOk) {
        console.log('✅ 수정 저장이 결제 결과를 되돌리지 않는 것이 확인되었습니다.\n');
    } else if (newOk) {
        console.log('✅ 새 방식은 정상. (이번 실행에서는 기존 방식도 우연히 통과)\n');
    } else {
        console.log('⚠ 새 방식에서도 결제 결과가 덮어써집니다. 확인이 필요합니다.\n');
        process.exitCode = 1;
    }
} finally {
    await ref.delete();
    console.log(`임시 문서 ${ID} 삭제 완료.`);
}
