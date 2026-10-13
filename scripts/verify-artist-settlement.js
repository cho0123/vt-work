/**
 * 아티스트 정산 계산 검증 — Firestore 접근 없음(순수 함수만).
 *
 * 실행: npm run verify-artist-settlement
 *
 * 지시서에 적힌 사례를 그대로 넣고 기대값과 대조한다.
 * 로직을 여기에 다시 타이핑하지 않는다 — src/domain/artistSettlement.js 를 그대로 부른다.
 */
import {
    AMOUNT_BASIS,
    computeGeneralSettlement,
    computeCaseSettlement,
    unmappedVotizCategories,
    computeCollab,
    buildSongRows,
    memberSharePercent,
    monthRange,
} from '../src/domain/artistSettlement.js';
import {
    computePayout, payoutSnapshot, payoutOfSettlement, taxTypeOf,
    WITHHOLDING_RATE, LOCAL_TAX_RATE, VAT_RATE,
} from '../src/domain/artistPayout.js';
import {
    allocationForIncome, payoutAmounts, payoutMemo, findPayoutExpense,
    isAutoPayout, collabLinksOf, isWithinShareWindow, sourceIncomeOnly, PAYOUT_CATEGORY,
    SKIP_FIELD, skipIdsOf, isPayoutSkipped, mergeSkipIds, shareRoundOf, groupPayoutsUnderSource,
    paginateGrouped,
} from '../src/domain/collabPayout.js';
import {
    categoryOf, payeeOf, effectiveTaxType,
    payeeInfo, payeeSnapshot, payeeOfSettlement,
} from '../src/domain/artistProfile.js';
import {
    rootIdOf, kindOf, isHidden, topLevelCats, childrenOf, hasChildren,
    catPath, isCategoryInUse, votizMapKey, mappedCategoryId, normalizeVotizMap,
    chainOf, depthOf, rowMatchesCategory, MAX_DEPTH,
} from '../src/domain/mgmtCategories.js';

let pass = 0;
let fail = 0;

const eq = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? 'PASS  ' : 'FAIL  '}${label}` + (ok ? '' : `\n        받음 ${JSON.stringify(actual)} / 기대 ${JSON.stringify(expected)}`));
};

const near = (label, actual, expected, tol = 1e-9) => {
    const ok = Math.abs(Number(actual) - Number(expected)) <= tol;
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? 'PASS  ' : 'FAIL  '}${label}` + (ok ? '' : `\n        받음 ${actual} / 기대 ${expected}`));
};

// 장부 한 줄 만들기. 부가세 없는 단순 금액(공급가=합계)으로 둔다.
const row = (type, categoryId, amount, date = '2026-01-10') => ({
    type, categoryId, amount, vat: 0, totalAmount: amount, date, ym: date.slice(0, 7), caseId: '',
});

const CATS = [
    { id: 'ev', name: '행사', kind: 'income', order: 1 },
    { id: 'mu', name: '음원', kind: 'income', order: 2 },
    { id: 'ex', name: '제작비', kind: 'expense', order: 3 },
];

console.log(`금액 기준: ${AMOUNT_BASIS}\n`);

// ──[ 1. 가중 비율 ]──────────────────────────────────────────────────────
// 행사 1,500(아티스트 30%) / 음원 500(아티스트 50%) / 지출 400 → 몫 560, 비율 35%
console.log('── 1. 가중 비율 (단순 평균이면 40% 가 나와 틀린다)');
const artistWeighted = {
    ratioUniform: false,
    uniformRatio: { company: 50, artist: 50 },
    ratios: { ev: { company: 70, artist: 30 }, mu: { company: 50, artist: 50 } },
};
const r1 = computeGeneralSettlement({
    artist: artistWeighted,
    categories: CATS,
    ledgerRows: [row('income', 'ev', 1500), row('income', 'mu', 500), row('expense', 'ex', 400)],
});
eq('총수익 2,000', r1.totalIncome, 2000);
eq('총지출 400', r1.totalExpense, 400);
eq('순수익 1,600', r1.netAfter, 1600);
near('아티스트 비율 35%', r1.artistRatePercent, 35);
eq('아티스트 몫 560', r1.artistShare, 560);
eq('이월 0', r1.carryOut, 0);
console.log('       (단순 평균이었다면 (30+50)/2 = 40% → 640 이 나온다)');

// ──[ 2. 이월 ]───────────────────────────────────────────────────────────
console.log('\n── 2. 이월');
const artist30 = {
    ratioUniform: false,
    uniformRatio: { company: 70, artist: 30 },
    ratios: { ev: { company: 70, artist: 30 }, mu: { company: 70, artist: 30 } },
};
// 1기: 수익 100, 지출 400 → 순수익 -300
const p1 = computeGeneralSettlement({
    artist: artist30, categories: CATS,
    ledgerRows: [row('income', 'ev', 100), row('expense', 'ex', 400)],
});
eq('1기 순수익 -300', p1.netAfter, -300);
eq('1기 몫 0', p1.artistShare, 0);
eq('1기 이월 -300', p1.carryOut, -300);

// 2기: 수익 1,000, 지출 500 → 기간 순수익 500, 이월 -300 반영 → 200 기준
const p2 = computeGeneralSettlement({
    artist: artist30, categories: CATS,
    ledgerRows: [row('income', 'ev', 1000), row('expense', 'ex', 500)],
    carryIn: p1.carryOut,
});
eq('2기 기간 순수익 500', p2.netBefore, 500);
eq('2기 이월 적용 -300', p2.carryIn, -300);
eq('2기 이월 반영 순수익 200', p2.netAfter, 200);
eq('2기 몫 60 (200 × 30%)', p2.artistShare, 60);
eq('2기 이월 0', p2.carryOut, 0);

// 수익이 0인 기간: 비율 계산 없이 몫 0, 이월만
const p0 = computeGeneralSettlement({
    artist: artist30, categories: CATS,
    ledgerRows: [row('expense', 'ex', 250)],
});
eq('수익 0: 비율 0', p0.artistRatePercent, 0);
eq('수익 0: 몫 0', p0.artistShare, 0);
eq('수익 0: 이월 -250', p0.carryOut, -250);

// ──[ 3. 콜라보 ]─────────────────────────────────────────────────────────
console.log('\n── 3. 콜라보 (제작비 1,000 회수 후 20% 공유, 36개월)');
const link = { type: 'collab_recoup', recoupAmount: 1000, sharePercent: 20, startMonth: '2026-01', periodMonths: 36 };
const ms = monthRange('2026-01', 38);
const collabTx = [];
// 1~10개월차 누적 900 (매달 90)
for (let i = 0; i < 10; i++) collabTx.push({ projectId: 'P', division: 'votiz', type: 'income', date: ms[i] + '-15', amount: 90, totalAmount: 90 });
// 11개월차 300 → 누적 1,200 → 공유 대상 200
collabTx.push({ projectId: 'P', division: 'votiz', type: 'income', date: ms[10] + '-15', amount: 300, totalAmount: 300 });
// 12개월차 200 → 전액 공유 대상
collabTx.push({ projectId: 'P', division: 'votiz', type: 'income', date: ms[11] + '-15', amount: 200, totalAmount: 200 });
// 37개월차 500 → 기간 밖
collabTx.push({ projectId: 'P', division: 'votiz', type: 'income', date: ms[36] + '-15', amount: 500, totalAmount: 500 });
// 지출은 반영하지 않는다
collabTx.push({ projectId: 'P', division: 'votiz', type: 'expense', date: ms[0] + '-15', amount: 9999, totalAmount: 9999 });

const c = computeCollab({ transactions: collabTx, projectId: 'P', link });
eq('10개월차까지 공유 0', c.months.slice(0, 10).map((m) => m.share), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
eq('10개월차 누적 900', c.months[9].cumulative, 900);
eq('11개월차 공유 대상 200', c.months[10].shareable, 200);
eq('11개월차 몫 40', c.months[10].share, 40);
eq('12개월차 공유 대상 200', c.months[11].shareable, 200);
eq('12개월차 몫 40', c.months[11].share, 40);
eq('기간 36개월 (37개월차 없음)', c.months.length, 36);
eq('37개월차 수익은 기간 밖 500', c.incomeAfterEnd, 500);
eq('공유 합계 400 → 몫 80', [c.shareableTotal, c.artistShare], [400, 80]);
eq('남은 제작비 0', c.remainingRecoup, 0);
eq('지출은 반영 안 함 (수익만 1,400)', c.totalIncome, 1400);

// 시작월 이전 수익
const c2 = computeCollab({
    transactions: [{ projectId: 'P', division: 'votiz', type: 'income', date: '2025-11-15', amount: 777, totalAmount: 777 }],
    projectId: 'P', link,
});
eq('시작월 이전 수익 777 은 공유 대상 아님', [c2.incomeBeforeStart, c2.shareableTotal], [777, 0]);

// ──[ 4. 별도정산 건 ]────────────────────────────────────────────────────
console.log('\n── 4. 별도정산 건 (이월 없음)');
const artist50 = { ratioUniform: true, uniformRatio: { company: 50, artist: 50 }, ratios: {} };
const caseOk = computeCaseSettlement({
    artist: artist50, categories: CATS,
    ledgerRows: [row('income', 'ev', 1000), row('expense', 'ex', 200)],
});
eq('흑자 건 순수익 800', caseOk.netAfter, 800);
eq('흑자 건 몫 400', caseOk.artistShare, 400);
eq('흑자 건 이월 0', caseOk.carryOut, 0);

const caseBad = computeCaseSettlement({
    artist: artist50, categories: CATS,
    ledgerRows: [row('income', 'ev', 100), row('expense', 'ex', 500)],
});
eq('적자 건 순수익 -400', caseBad.netAfter, -400);
eq('적자 건 몫 0', caseBad.artistShare, 0);
eq('적자 건은 이월하지 않는다 (0)', caseBad.carryOut, 0);

// 건에 이월을 넣어도 무시되는지(건은 carryIn 을 받지 않는다)
const caseIgnoresCarry = computeCaseSettlement({
    artist: artist50, categories: CATS, ledgerRows: [row('income', 'ev', 1000)],
});
eq('건은 직전 이월의 영향을 받지 않는다', caseIgnoresCarry.carryIn, 0);

// ──[ 5. 지분 스냅샷 ]────────────────────────────────────────────────────
console.log('\n── 5. 확정 뒤 지분·비율을 바꿔도 확정 결과는 그대로');
const projects = [{
    id: 'SONG1', name: '테스트곡',
    artists: [
        { artistId: 'A', type: 'member', share: 70, incomeCategoryId: 'mu', expenseCategoryId: 'ex' },
        { artistId: 'B', type: 'member', share: 30, incomeCategoryId: 'mu', expenseCategoryId: 'ex' },
    ],
}];
const songTx = [
    { projectId: 'SONG1', division: 'votiz', type: 'income', date: '2026-01-20', amount: 1000, totalAmount: 1000 },
    { projectId: 'SONG1', division: 'votiz', type: 'expense', date: '2026-01-21', amount: 200, totalAmount: 200 },
];
const months = ['2026-01'];
const songRowsA = buildSongRows({ projects, transactions: songTx, artistId: 'A', months });
eq('A 지분 70% → 곡 수익 700', songRowsA.filter((r) => r.type === 'income').reduce((a, b) => a + b.amount, 0), 700);

const artistA = { ratioUniform: true, uniformRatio: { company: 50, artist: 50 }, ratios: {} };
const confirmed = computeGeneralSettlement({ artist: artistA, categories: CATS, ledgerRows: [], songRows: songRowsA });
// 확정했다고 치고 스냅샷으로 굳힌다.
const snapshot = JSON.parse(JSON.stringify({
    artistRatePercent: confirmed.artistRatePercent,
    artistShare: confirmed.artistShare,
    totalIncome: confirmed.totalIncome,
    totalExpense: confirmed.totalExpense,
}));
eq('확정 시점 몫 ((700-140) × 50% = 280)', confirmed.artistShare, 280);

// 이제 지분과 비율을 바꾼다.
projects[0].artists[0].share = 10;
projects[0].artists[1].share = 90;
artistA.uniformRatio = { company: 90, artist: 10 };
const songRowsAfter = buildSongRows({ projects, transactions: songTx, artistId: 'A', months });
const recomputed = computeGeneralSettlement({ artist: artistA, categories: CATS, ledgerRows: [], songRows: songRowsAfter });

eq('지분 변경 후 다시 계산하면 값이 달라진다', recomputed.artistShare !== confirmed.artistShare, true);
eq('확정 스냅샷의 몫은 그대로 280', snapshot.artistShare, 280);
near('확정 스냅샷의 비율은 그대로 50%', snapshot.artistRatePercent, 50);

// 균등 분배(지분 비움) — 그 곡의 소속 인원수로 나눈다.
const evenProjects = [{
    id: 'SONG2', name: '균등곡',
    artists: [
        { artistId: 'A', type: 'member', share: '', incomeCategoryId: 'mu', expenseCategoryId: 'ex' },
        { artistId: 'B', type: 'member', share: null, incomeCategoryId: 'mu', expenseCategoryId: 'ex' },
        { artistId: 'C', type: 'collab_none' },
    ],
}];
eq('균등: 소속 2명이면 50%씩 (collab 은 인원수에서 빠짐)', memberSharePercent(evenProjects[0], 'A'), 50);
eq('콜라보-공유없음 은 지분 0', memberSharePercent(evenProjects[0], 'C'), 0);

// 콜라보 연결은 일반 정산의 곡 집계에 들어가지 않는다.
const collabProjects = [{
    id: 'SONG3', name: '콜라보곡',
    artists: [{ artistId: 'A', type: 'collab_recoup', recoupAmount: 100, sharePercent: 20, startMonth: '2026-01', periodMonths: 36 }],
}];
eq('콜라보 곡은 일반 정산 곡 집계에서 빠진다',
    buildSongRows({ projects: collabProjects, transactions: songTx.map((t) => ({ ...t, projectId: 'SONG3' })), artistId: 'A', months }).length, 0);

// ──[ 6. 지급 단계 (세무 유형별) ]────────────────────────────────────────
console.log('\n── 6. 지급 단계 — 원천징수 / 세금계산서');
console.log(`       세율: 소득세 ${WITHHOLDING_RATE * 100}% · 지방소득세 ${LOCAL_TAX_RATE * 100}% · 부가세 ${VAT_RATE * 100}%`);

// 원천징수: 851,321 × 3% = 25,539.63 → 10원 절사 25,530 / 25,530 × 10% = 2,553 → 2,550
const w = computePayout({ artistShare: 851321, taxType: 'withholding' });
eq('원천징수 소득세 25,530 (10원 절사)', w.incomeTax, 25530);
eq('원천징수 지방소득세 2,550 (10원 절사)', w.localTax, 2550);
eq('원천징수 실지급액 823,241', w.netPayout, 823241);
eq('원천징수는 부가세 없음', w.vat, 0);
eq('원천징수는 세금계산서 불필요', w.needsInvoice, false);

// 세금계산서: 아티스트 몫이 '부가세 포함' 금액이다. 몫 위에 더하지 않는다.
const inv1 = computePayout({ artistShare: 1000000, taxType: 'invoice' });
eq('세금계산서 지급액 = 몫 1,000,000', inv1.netPayout, 1000000);
eq('세금계산서 공급가 909,091 (몫 ÷ 1.1)', inv1.supplyAmount, 909091);
eq('세금계산서 부가세 90,909 (몫 − 공급가)', inv1.vat, 90909);
eq('공급가 + 부가세 = 몫', inv1.supplyAmount + inv1.vat, 1000000);

const inv = computePayout({ artistShare: 600000, taxType: 'invoice' });
eq('세금계산서 지급액 = 몫 600,000', inv.netPayout, 600000);
eq('세금계산서 공급가 545,455', inv.supplyAmount, 545455);
eq('세금계산서 부가세 54,545', inv.vat, 54545);
eq('공급가 + 부가세 = 몫 (600,000)', inv.supplyAmount + inv.vat, 600000);
eq('세금계산서는 원천세 없음', [inv.incomeTax, inv.localTax], [0, 0]);
eq('세금계산서 수취 필요 표시', inv.needsInvoice, true);

// 몫 0
const z1 = computePayout({ artistShare: 0, taxType: 'withholding' });
const z2 = computePayout({ artistShare: 0, taxType: 'invoice' });
eq('몫 0 (원천징수): 전부 0', [z1.incomeTax, z1.localTax, z1.netPayout], [0, 0, 0]);
eq('몫 0 (세금계산서): 전부 0', [z2.vat, z2.netPayout], [0, 0]);

// 세무 유형이 없는 옛 아티스트는 원천징수로 본다
eq('taxType 없으면 원천징수', taxTypeOf({ stageName: '옛데이터' }), 'withholding');

// 확정 후 세무 유형을 바꿔도 확정분은 그대로
const artistTax = { stageName: '테스트', taxType: 'withholding' };
const confirmedPayout = computePayout({ artistShare: 851321, taxType: taxTypeOf(artistTax) });
const settlementDoc = { artistShare: 851321, ...payoutSnapshot(confirmedPayout) };
const frozen = JSON.parse(JSON.stringify(settlementDoc));
artistTax.taxType = 'invoice';                      // 나중에 세무 유형 변경
const recomputedPayout = computePayout({ artistShare: 851321, taxType: taxTypeOf(artistTax) });
eq('유형 변경 후 다시 계산하면 값이 달라진다', recomputedPayout.netPayout !== confirmedPayout.netPayout, true);
eq('확정 스냅샷의 실지급액은 그대로 823,241', payoutOfSettlement(frozen).netPayout, 823241);
eq('확정 스냅샷의 유형도 그대로 withholding', payoutOfSettlement(frozen).taxType, 'withholding');

// 4단계 이전에 확정된 건은 세무 정보가 없다 — 다시 계산하지 않는다
eq('옛 확정 건은 지급 정보 없음(null)', payoutOfSettlement({ artistShare: 500000 }), null);

// 확정 스냅샷이 공급가까지 담는지 (세금계산서는 몫 != 공급가 라 꼭 필요)
const invSnap = { artistShare: 1000000, ...payoutSnapshot(inv1) };
eq('스냅샷 공급가 909,091', payoutOfSettlement(invSnap).supplyAmount, 909091);
eq('스냅샷 부가세 90,909', payoutOfSettlement(invSnap).vat, 90909);
eq('스냅샷 지급액 1,000,000', payoutOfSettlement(invSnap).netPayout, 1000000);
// 공급가를 안 담고 확정했던 옛 문서는 몫 - 부가세 로 되돌린다
eq('공급가 없는 옛 확정분은 몫-부가세로 복원',
    payoutOfSettlement({ taxType: 'invoice', artistShare: 851321, vat: 77393, netPayout: 851321 }).supplyAmount, 773928);

// ──[ 7. 구분(소속/콜라보) · 지급처(본인/소속사) ]───────────────────────
console.log('\n── 7. 구분 · 지급처 — 옛 문서 호환과 확정 스냅샷');

// 필드가 없는 옛 아티스트 문서는 소속·본인으로 본다(데이터는 고치지 않는다).
eq('category 없으면 소속(member)', categoryOf({ stageName: '옛데이터' }), 'member');
eq('category 빈 문자열도 소속', categoryOf({ category: '' }), 'member');
eq("category 'collab' 은 콜라보", categoryOf({ category: 'collab' }), 'collab');
eq('payee 없으면 본인(self)', payeeOf({ stageName: '옛데이터' }), 'self');
eq("payee 'agency' 는 소속사", payeeOf({ payee: 'agency' }), 'agency');

// 옛 문서는 세무 유형도 전과 똑같이 나와야 한다.
eq('옛 문서 세무 유형 그대로 원천징수', effectiveTaxType({ stageName: '옛데이터' }), 'withholding');
eq('본인 지급 + 세금계산서 설정이면 세금계산서',
    effectiveTaxType({ payee: 'self', taxType: 'invoice' }), 'invoice');
// 소속사가 받으면 저장된 taxType 과 무관하게 세금계산서로 고정한다.
eq('소속사 지급이면 세금계산서로 고정',
    effectiveTaxType({ payee: 'agency', taxType: 'withholding' }), 'invoice');
eq('소속사 지급이어도 저장된 taxType 값 자체는 그대로',
    taxTypeOf({ payee: 'agency', taxType: 'withholding' }), 'withholding');

// 지급처 정보 — 소속사면 소속사 쪽, 본인이면 아티스트 쪽. 계좌는 뒤 4자리만.
const selfArtist = { stageName: '테스트가수', payee: 'self' };
const selfPriv = { bank: '국민', accountNumber: '123456789012', accountHolder: '김본명', bizNo: '111-11-11111' };
const selfInfo = payeeInfo(selfArtist, selfPriv);
eq('본인 지급: 받는 쪽 이름 = 활동명', selfInfo.name, '테스트가수');
eq('본인 지급: 계좌는 뒤 4자리만', selfInfo.accountMasked, '****9012');

const agencyArtist = { stageName: '테스트가수', payee: 'agency', agencyName: '테스트기획', taxType: 'withholding' };
const agencyPriv = {
    bank: '국민', accountNumber: '123456789012', accountHolder: '김본명', bizNo: '111-11-11111',
    agencyBank: '신한', agencyAccount: '987654321098', agencyHolder: '(주)테스트기획', agencyBizNo: '222-22-22222',
};
const agencyInfo = payeeInfo(agencyArtist, agencyPriv);
eq('소속사 지급: 받는 쪽 이름 = 소속사명', agencyInfo.name, '테스트기획');
eq('소속사 지급: 사업자번호는 소속사 것', agencyInfo.bizNo, '222-22-22222');
eq('소속사 지급: 은행·계좌도 소속사 것', [agencyInfo.bank, agencyInfo.accountMasked], ['신한', '****1098']);

// 소속사 지급은 세금계산서 규칙으로 계산된다(몫 = 부가세 포함 지급액).
const agencyPayout = computePayout({ artistShare: 1000000, taxType: effectiveTaxType(agencyArtist) });
eq('소속사 지급: 지급액 = 몫 1,000,000', agencyPayout.netPayout, 1000000);
eq('소속사 지급: 공급가 909,091', agencyPayout.supplyAmount, 909091);
eq('소속사 지급: 원천세 없음', [agencyPayout.incomeTax, agencyPayout.localTax], [0, 0]);

// 확정 스냅샷 — 확정 뒤 소속사 정보를 바꿔도 확정분은 그대로여야 한다.
const agencyConfirmed = {
    artistShare: 1000000,
    ...payoutSnapshot(agencyPayout),
    ...payeeSnapshot(agencyArtist, agencyPriv),
};
const frozenPayee = JSON.parse(JSON.stringify(agencyConfirmed));
// 확정 후 소속사를 바꾸고 계좌도 교체
agencyArtist.agencyName = '바뀐기획';
agencyPriv.agencyAccount = '555555555555';
agencyPriv.agencyBizNo = '333-33-33333';
const changedInfo = payeeInfo(agencyArtist, agencyPriv);
eq('지금 정보는 바뀐다', [changedInfo.name, changedInfo.accountMasked, changedInfo.bizNo],
    ['바뀐기획', '****5555', '333-33-33333']);
eq('확정분 지급처 이름은 그대로 테스트기획', payeeOfSettlement(frozenPayee).name, '테스트기획');
eq('확정분 계좌도 그대로 ****1098', payeeOfSettlement(frozenPayee).accountMasked, '****1098');
eq('확정분 사업자번호도 그대로', payeeOfSettlement(frozenPayee).bizNo, '222-22-22222');
eq('확정분 지급처 구분은 소속사', payeeOfSettlement(frozenPayee).payee, 'agency');
eq('확정 스냅샷에는 전체 계좌번호를 담지 않는다',
    JSON.stringify(frozenPayee).includes('987654321098'), false);

// 본인 지급 확정분
const selfSnap = { artistShare: 500000, ...payeeSnapshot(selfArtist, selfPriv) };
eq('본인 지급 확정분 라벨', payeeOfSettlement(selfSnap).payeeLabel, '본인');

// 이 기능 이전에 확정된 건에는 payee 가 없다 — 화면이 지금 정보로 보여주도록 null 을 준다.
eq('옛 확정분은 지급처 정보 없음(null)', payeeOfSettlement({ artistShare: 500000 }), null);

// 구분·지급처는 몫 계산에 영향을 주지 않는다(1번 사례와 같은 값이 나와야 한다).
const asCollabPayee = computeGeneralSettlement({
    artist: { ...artistWeighted, category: 'collab', payee: 'agency' },
    categories: CATS,
    ledgerRows: [row('income', 'ev', 1500), row('income', 'mu', 500), row('expense', 'ex', 400)],
    songRows: [],
    carryIn: 0,
});
eq('구분·지급처를 붙여도 몫은 그대로 560', asCollabPayee.artistShare, 560);

// ──[ 7. 콜라보 음원수익 자동 배분 ]──────────────────────────────────────
console.log('\n── 7. 콜라보 자동 배분 (제작비 1,000 / 30% / 36개월)');

const payLink = { type: 'collab_recoup', recoupAmount: 1000, sharePercent: 30, startMonth: '2026-01', periodMonths: 36 };
const pm = monthRange('2026-01', 38);
// 음원수익만 누적 대상이다(category 'source').
const src = (id, ym, amt) => ({ id, projectId: 'P', division: 'votiz', type: 'income', category: 'source', date: ym + '-10', amount: amt, totalAmount: amt });

// 1~9개월차 누적 900
const hist = [];
for (let i = 0; i < 9; i++) hist.push(src('h' + i, pm[i], 100));

// 누적 900 까지는 배분 0
const before900 = allocationForIncome({ transactions: hist, projectId: 'P', link: payLink, income: hist[8] });
eq('누적 900 안에서는 배분 0', [before900.shareable, before900.amount], [0, 0]);

// 다음 수익 300 → 넘친 200 × 30% = 60
const rowA = src('a', pm[9], 300);
const allocA = allocationForIncome({ transactions: hist.concat([rowA]), projectId: 'P', link: payLink, income: rowA });
eq('제작비를 넘기는 건: 공유 대상 200', allocA.shareable, 200);
eq('제작비를 넘기는 건: 배분 60', allocA.amount, 60);

// 그다음 수익 200 → 전액 공유 대상 → 60
const rowB = src('b', pm[10], 200);
const allocB = allocationForIncome({ transactions: hist.concat([rowA, rowB]), projectId: 'P', link: payLink, income: rowB });
eq('회수 뒤 건: 공유 대상 200', allocB.shareable, 200);
eq('회수 뒤 건: 배분 60', allocB.amount, 60);

// 기간 밖 수익 → 영역 미표시(inWindow false)
const rowOut = src('c', pm[36], 500);
const allocOut = allocationForIncome({ transactions: hist.concat([rowA, rowB, rowOut]), projectId: 'P', link: payLink, income: rowOut });
eq('기간 밖 수익은 배분 영역 미표시', [allocOut.inWindow, allocOut.amount], [false, 0]);
eq('기간 판정: 1개월차 안', isWithinShareWindow(payLink, pm[0] + '-10'), true);
eq('기간 판정: 37개월차 밖', isWithinShareWindow(payLink, pm[36] + '-10'), false);

// 배분한 건들의 합은 콜라보 정산의 누적 공유액과 같아야 한다(쪼개 쓴 것이니까)
const allRows = hist.concat([rowA, rowB]);
const sumAlloc = allRows.reduce((acc, r) => acc + allocationForIncome({ transactions: allRows, projectId: 'P', link: payLink, income: r }).amount, 0);
eq('건별 배분 합 = 콜라보 누적 공유액', sumAlloc, computeCollab({ transactions: allRows, projectId: 'P', link: payLink }).artistShare);

// 공급가·부가세
// 배분 줄은 '마이너스 수익' 이라 금액이 전부 음수다.
eq('원천징수: 마이너스 수익 -60, 부가세 없음', payoutAmounts(60, 'withholding'), { amount: -60, vat: 0, totalAmount: -60 });
eq('세금계산서: 1,000,000 → 공급가 -909,091 / 부가세 -90,909',
    payoutAmounts(1000000, 'invoice'), { amount: -909091, vat: -90909, totalAmount: -1000000 });
eq('세금계산서: 공급가 + 부가세 = -배분 금액',
    payoutAmounts(60, 'invoice').amount + payoutAmounts(60, 'invoice').vat, -60);

// 배분 줄('수익배분' 분류)은 자동 배분 계산의 누적에 안 들어간다 — 음원수익만 센다.
const withPayoutRow = hist.concat([rowA, {
    id: 'pay1', projectId: 'P', division: 'votiz', type: 'income', category: PAYOUT_CATEGORY,
    date: pm[9] + '-11', amount: -60, totalAmount: -60,
    payoutSourceId: 'a', payoutArtistId: 'C',
}, rowB]);
const allocBWithPayout = allocationForIncome({ transactions: withPayoutRow, projectId: 'P', link: payLink, income: rowB });
eq('수익배분 줄이 있어도 배분 계산은 그대로 60', allocBWithPayout.amount, 60);
eq('수익배분 줄은 누적에서 빠진다 (누적 1,400)', allocBWithPayout.cumulativeAfter, 1400);

// 콜라보 연결만 골라낸다
const proj = { id: 'P', artists: [
    { artistId: 'M', type: 'member', share: 100 },
    { artistId: 'C', type: 'collab_recoup', recoupAmount: 1000, sharePercent: 30, startMonth: '2026-01', periodMonths: 36 },
    { artistId: 'N', type: 'collab_none' },
] };
eq('콜라보(회수형)만 자동 배분 대상', collabLinksOf(proj).map((a) => a.artistId), ['C']);

// 수익 1건 × 아티스트 1명 = 배분 지출 1건
const expenses = [
    { id: 'e1', payoutSourceId: 'a', payoutArtistId: 'C', totalAmount: 60 },
    { id: 'e2', payoutSourceId: 'b', payoutArtistId: 'C', totalAmount: 60 },
];
eq('원본+아티스트로 배분 줄 1건을 찾는다', findPayoutExpense(expenses, 'a', 'C').id, 'e1');
eq('없으면 null', findPayoutExpense(expenses, 'zzz', 'C'), null);
eq('배분 줄 판별', [isAutoPayout(expenses[0]), isAutoPayout({ id: 'x' })], [true, false]);
eq('지출 분류 키', PAYOUT_CATEGORY, 'payout');
eq('메모 형식(회차 없이 — 기존 호출 그대로)',
    payoutMemo({ artistName: '테스트가수', sharePercent: 30, incomeDate: '2026-10-10' }),
    '자동배분 · 테스트가수 30% · 2026-10-10 음원수익');
eq('메모 형식(회차 포함 — 새로 만드는 줄)',
    payoutMemo({ artistName: '백현', sharePercent: 30, incomeDate: '2021-08-25', round: '2/36' }),
    '자동배분 · 백현 30% · 2/36 · 2021-08-25 음원수익');

// ──[ 8. '수익배분' 지출이 매니지먼트 정산에 주는 영향 ]──────────────────
console.log('\n── 8. 수익배분 지출이 정산에 들어가는지');

// 같은 곡에 소속(지분 50%)과 콜라보가 함께 걸린 경우
const mixProject = {
    id: 'MIX', name: '섞인곡',
    artists: [
        { artistId: 'MEM', type: 'member', share: 50, incomeCategoryId: 'mu', expenseCategoryId: 'ex' },
        { artistId: 'COL', type: 'collab_recoup', recoupAmount: 0, sharePercent: 30, startMonth: '2026-01', periodMonths: 36 },
    ],
};
const mixTx = [
    { id: 'i1', projectId: 'MIX', division: 'votiz', type: 'income', category: 'source', date: '2026-01-10', amount: 1000, totalAmount: 1000 },
    // 자동배분으로 생긴 '마이너스 수익' (category: payout)
    { id: 'p1', projectId: 'MIX', division: 'votiz', type: 'income', category: PAYOUT_CATEGORY, date: '2026-01-10', amount: -300, totalAmount: -300,
      payoutSourceId: 'i1', payoutArtistId: 'COL' },
];
const mixRows = buildSongRows({ projects: [mixProject], transactions: mixTx, artistId: 'MEM', months: ['2026-01'] });
const mixIncome = mixRows.filter((r) => r.type === 'income').reduce((a, b) => a + b.amount, 0);
const mixExpense = mixRows.filter((r) => r.type === 'expense').reduce((a, b) => a + b.amount, 0);
eq('소속 정산: 수익 (1,000 − 300) × 50% = 350 ⚠️ 마이너스 수익이 섞인다', mixIncome, 350);
eq('소속 정산: 지출은 없다', mixExpense, 0);

// 콜라보 정산은 수익만 보므로 영향 없음
const colBefore = computeCollab({ transactions: [mixTx[0]], projectId: 'MIX', link: mixProject.artists[1] });
const colAfter = computeCollab({ transactions: mixTx, projectId: 'MIX', link: mixProject.artists[1] });
// 콜라보 정산도 '음원수익만' 기준으로 통일했다 — 부르는 쪽에서 sourceIncomeOnly 로 거른다.
const colBasis = computeCollab({ transactions: sourceIncomeOnly(mixTx), projectId: 'MIX', link: mixProject.artists[1] });
eq('콜라보 정산 누적: 수익배분을 빼고 1,000', colBasis.totalIncome, 1000);
eq('콜라보 정산 공유액: 300 (수익배분 영향 없음)', colBasis.artistShare, 300);
eq('거르지 않으면 700 으로 줄어든다(기준을 통일한 이유)', colAfter.totalIncome, 700);
eq('거르기 전후 공유액 비교', [colAfter.artistShare, colBasis.artistShare], [210, 300]);

// 공연수익·곡 판매·기타수익도 공유 대상이 아니다
const otherTx = [
    { id: 'o1', projectId: 'MIX', division: 'votiz', type: 'income', category: 'source', date: '2026-01-10', amount: 1000, totalAmount: 1000 },
    { id: 'o2', projectId: 'MIX', division: 'votiz', type: 'income', category: 'performance', date: '2026-01-11', amount: 500, totalAmount: 500 },
    { id: 'o3', projectId: 'MIX', division: 'votiz', type: 'income', category: 'sale', date: '2026-01-12', amount: 300, totalAmount: 300 },
    { id: 'o4', projectId: 'MIX', division: 'votiz', type: 'income', category: 'other', date: '2026-01-13', amount: 200, totalAmount: 200 },
];
const colOther = computeCollab({ transactions: sourceIncomeOnly(otherTx), projectId: 'MIX', link: mixProject.artists[1] });
eq('공연수익 500 은 공유 대상 아님 — 누적 1,000', colOther.totalIncome, 1000);
eq('곡 판매·기타수익도 제외 — 공유액 300', colOther.artistShare, 300);

// 자동 배분 건별 합 = 콜라보 정산 누적 공유액 (기준이 같으니 계속 일치)
const basisRows = [
    { id: 'b1', projectId: 'B', division: 'votiz', type: 'income', category: 'source', date: '2026-01-10', amount: 600, totalAmount: 600 },
    { id: 'b2', projectId: 'B', division: 'votiz', type: 'income', category: 'source', date: '2026-02-10', amount: 900, totalAmount: 900 },
    { id: 'b3', projectId: 'B', division: 'votiz', type: 'income', category: PAYOUT_CATEGORY, date: '2026-02-11', amount: -150, totalAmount: -150, payoutSourceId: 'b2', payoutArtistId: 'X' },
    { id: 'b4', projectId: 'B', division: 'votiz', type: 'income', category: 'performance', date: '2026-03-10', amount: 400, totalAmount: 400 },
];
const basisLink = { recoupAmount: 1000, sharePercent: 30, startMonth: '2026-01', periodMonths: 36 };
const perRow = basisRows.reduce((a, r) => a + allocationForIncome({ transactions: basisRows, projectId: 'B', link: basisLink, income: r }).amount, 0);
const asSettlement = computeCollab({ transactions: sourceIncomeOnly(basisRows), projectId: 'B', link: basisLink }).artistShare;
eq('건별 배분 합 = 콜라보 정산 누적 공유액 (수익배분·공연수익 섞여도)', perRow, asSettlement);
eq('그 값은 150 ((600+900-1,000) × 30%)', asSettlement, 150);

// ──[ 9. '배분 안 함' 기억 ]──────────────────────────────────────────────
console.log('');
console.log("── 9. '배분 안 함' 을 원본 수익 문서에 기억");

eq('필드 이름', SKIP_FIELD, 'payoutSkipArtistIds');
eq('필드가 없는 옛 수익은 빈 목록', skipIdsOf({ id: 'i1' }), []);
eq('배열이 아니면 빈 목록', skipIdsOf({ id: 'i1', payoutSkipArtistIds: 'C' }), []);
eq('적혀 있으면 그 아티스트만 배분 안 함',
    [isPayoutSkipped({ payoutSkipArtistIds: ['C'] }, 'C'), isPayoutSkipped({ payoutSkipArtistIds: ['C'] }, 'D')],
    [true, false]);

// 화면에서 저장할 때 만드는 목록. (prev, 화면에 보이는 아티스트, 체크된 아티스트)
eq('체크하고 저장 → id 기록', mergeSkipIds([], ['C', 'D'], ['C']), ['C']);
eq('체크를 풀고 저장 → id 삭제', mergeSkipIds(['C'], ['C', 'D'], []), []);
eq('둘 다 체크', mergeSkipIds([], ['C', 'D'], ['C', 'D']), ['C', 'D']);
eq('중복은 한 번만', mergeSkipIds(['C'], ['C'], ['C']), ['C']);
// 날짜를 공유 기간 밖으로 옮기면 그 줄이 화면에서 사라진다 — 그때 표시가 지워지면 안 된다.
eq('화면에 안 보이는 아티스트의 기록은 남긴다', mergeSkipIds(['C', 'Z'], ['C'], ['C']), ['Z', 'C']);
eq('음원수익이 아니라 줄이 아예 없을 때는 호출하지 않는다(기록 보존)',
    skipIdsOf({ payoutSkipArtistIds: ['C'] }), ['C']);

// ── 화면 흐름 그대로: 체크 → 저장 → 다시 열기 → 메모만 고쳐 저장 → 체크 해제 저장
// (VotizTab 의 syncPayouts 와 같은 판정: '배분 안 함' 이면 만들지 않는다)
const skipFlowLink = { type: 'collab_recoup', recoupAmount: 0, sharePercent: 30, startMonth: '2026-01', periodMonths: 36 };
const skipIncomeBase = { id: 'si1', projectId: 'S', division: 'votiz', type: 'income', category: 'source', date: '2026-02-10', amount: 1000, totalAmount: 1000 };

// 저장 1회차 — '배분 안 함' 체크
let skipDoc = { ...skipIncomeBase, [SKIP_FIELD]: mergeSkipIds([], ['C'], ['C']) };
const wouldCreate = (incomeDoc, artistId) => {
    if (isPayoutSkipped(incomeDoc, artistId)) return 0;   // 체크돼 있으면 안 만든다
    return allocationForIncome({ transactions: [incomeDoc], projectId: 'S', link: skipFlowLink, income: incomeDoc }).amount;
};
eq('배분 안 함으로 저장하면 배분 0', wouldCreate(skipDoc, 'C'), 0);
eq('저장된 문서에 id 가 남는다', skipDoc[SKIP_FIELD], ['C']);

// 다시 열기 — 체크가 유지된다
eq('다시 열면 체크 유지', isPayoutSkipped(skipDoc, 'C'), true);

// 메모만 고쳐 재저장 — 체크 상태 그대로 저장되므로 배분이 되살아나지 않는다
skipDoc = { ...skipDoc, memo: '메모만 고침', [SKIP_FIELD]: mergeSkipIds(skipIdsOf(skipDoc), ['C'], ['C']) };
eq('메모만 고쳐 재저장해도 배분 미생성', wouldCreate(skipDoc, 'C'), 0);
eq('재저장 뒤에도 기록 유지', skipDoc[SKIP_FIELD], ['C']);

// 체크 해제 저장 — 배분이 생긴다
skipDoc = { ...skipDoc, [SKIP_FIELD]: mergeSkipIds(skipIdsOf(skipDoc), ['C'], []) };
eq('체크 해제 저장 → 기록 삭제', skipDoc[SKIP_FIELD], []);
eq('체크 해제 저장 → 배분 300 생성', wouldCreate(skipDoc, 'C'), 300);

// 표시는 화면 동작 전용 — 계산에 아무 영향이 없다
const skipForCalc = { ...skipIncomeBase, [SKIP_FIELD]: ['C'] };
eq('배분 안 함 표시는 자동 배분 계산값을 바꾸지 않는다',
    allocationForIncome({ transactions: [skipForCalc], projectId: 'S', link: skipFlowLink, income: skipForCalc }).amount,
    allocationForIncome({ transactions: [skipIncomeBase], projectId: 'S', link: skipFlowLink, income: skipIncomeBase }).amount);
eq('콜라보 정산 누적에도 영향 없음',
    computeCollab({ transactions: sourceIncomeOnly([skipForCalc]), projectId: 'S', link: skipFlowLink }).totalIncome, 1000);
eq('소속 정산(곡 내역)에도 영향 없음',
    buildSongRows({
        projects: [{ id: 'S', name: '곡S', artists: [{ artistId: 'MEM', type: 'member', share: 50, incomeCategoryId: 'mu', expenseCategoryId: 'ex' }] }],
        transactions: [skipForCalc], artistId: 'MEM', months: ['2026-02'],
    }).filter((r) => r.type === 'income').reduce((a, b) => a + b.amount, 0), 500);

// -- [ 10. 항목/세부항목 구조 + 보티즈 분류 연결표 ] --
console.log('');
console.log('-- 10. 항목/세부항목 + 보티즈 분류 연결표');

// 기존 항목(parentId 없음)과 세부항목이 섞인 목록
const CATS2 = [
    { id: 'A', name: '음원', kind: 'income', order: 1 },                     // 옛 문서 - parentId 없음
    { id: 'B', name: '행사', kind: 'income', order: 2 },
    { id: 'E', name: '제작비', kind: 'expense', order: 1 },
    { id: 'E1', name: '믹스', parentId: 'E', order: 1 },                     // 세부항목 - kind 없음
    { id: 'A1', name: '유통사A', parentId: 'A', order: 1 },
    { id: 'H', name: '안쓰는항목', kind: 'income', order: 9, hidden: true },
    { id: 'H1', name: '숨은부모의자식', parentId: 'H', order: 1 },
];

eq('parentId 없는 기존 항목은 최상위', rootIdOf(CATS2, 'A'), 'A');
eq('세부항목의 최상위는 부모', rootIdOf(CATS2, 'E1'), 'E');
eq('없는 항목은 그대로 둔다', rootIdOf(CATS2, 'ZZZ'), 'ZZZ');
eq('세부항목의 구분은 부모를 따른다', kindOf(CATS2, CATS2.find((c) => c.id === 'E1')), 'expense');
eq('부모가 숨겨지면 세부항목도 숨은 것으로 본다', isHidden(CATS2, CATS2.find((c) => c.id === 'H1')), true);
eq('최상위 수익 항목(숨김 제외)', topLevelCats(CATS2, 'income').map((c) => c.id), ['A', 'B']);
eq('숨김 포함하면 H 도 나온다', topLevelCats(CATS2, 'income', true).map((c) => c.id), ['A', 'B', 'H']);
eq('세부항목 목록', childrenOf(CATS2, 'E').map((c) => c.id), ['E1']);
eq('세부항목 있는지', [hasChildren(CATS2, 'E'), hasChildren(CATS2, 'B')], [true, false]);
eq('표기는 항목 > 세부항목', catPath(CATS2, 'E', 'E1'), '제작비 > 믹스');
eq('세부항목 없으면 항목만', catPath(CATS2, 'E', ''), '제작비');
eq('쓰는 항목은 삭제 금지 - 장부', isCategoryInUse('E1', { ledgerRows: [{ categoryId: 'E', subCategoryId: 'E1' }] }), true);
eq('쓰는 항목은 삭제 금지 - 비율', isCategoryInUse('A', { artists: [{ ratios: { A: { artist: 50 } } }] }), true);
eq('아무 데서도 안 쓰면 false', isCategoryInUse('B', { ledgerRows: [{ categoryId: 'A' }], artists: [{ ratios: {} }] }), false);

// 세부항목 장부 금액은 부모 항목 합계에 들어간다
const subArtist = { ratioUniform: false, ratios: { E: { company: 50, artist: 50 }, A: { company: 60, artist: 40 } } };
const subCalc = computeGeneralSettlement({
    artist: subArtist, categories: CATS2,
    ledgerRows: [
        { type: 'expense', categoryId: 'E', totalAmount: 100 },
        { type: 'expense', categoryId: 'E', subCategoryId: 'E1', totalAmount: 200 },
        // 혹시 세부항목 id 가 categoryId 에 들어가도 부모로 올려 센다
        { type: 'expense', categoryId: 'E1', totalAmount: 300 },
    ],
    songRows: [], carryIn: 0,
});
eq('세부항목 금액이 부모 항목 한 줄로 합쳐진다', subCalc.rows.map((r) => [r.categoryId, r.expense]), [['E', 600]]);
eq('항목 이름은 최상위 이름', subCalc.rows[0].name, '제작비');

// -- 보티즈 분류 연결표
const vMap = { [votizMapKey('income', 'source')]: 'A', [votizMapKey('income', 'performance')]: 'B' };
eq('연결표 키 모양', votizMapKey('income', 'source'), 'income:source');
eq('연결된 분류는 그 항목', mappedCategoryId(vMap, { type: 'income', category: 'source' }), 'A');
eq('연결 안 된 분류는 null', mappedCategoryId(vMap, { type: 'income', category: 'sale' }), null);
eq('연결표 정리 - 없는 항목은 버리고 세부항목은 최상위로',
    normalizeVotizMap({ 'income:source': 'A1', 'income:sale': 'ZZZ' }, CATS2), { 'income:source': 'A' });

// 음원수익 1,000(A 40%) + 공연수익 500(B 60%), 지분 100%
const mapProject = {
    id: 'MP', name: '연결곡',
    artists: [{ artistId: 'M1', type: 'member', share: 100, incomeCategoryId: 'B', expenseCategoryId: 'E' }],
};
const mapTx = [
    { id: 'm1', projectId: 'MP', division: 'votiz', type: 'income', category: 'source', date: '2026-03-10', amount: 1000, totalAmount: 1000 },
    { id: 'm2', projectId: 'MP', division: 'votiz', type: 'income', category: 'performance', date: '2026-03-11', amount: 500, totalAmount: 500 },
];
const mapRows = buildSongRows({ projects: [mapProject], transactions: mapTx, artistId: 'M1', months: ['2026-03'], votizMap: vMap });
eq('연결표대로 항목이 갈린다', mapRows.map((r) => [r.votizCategory, r.categoryId]), [['source', 'A'], ['performance', 'B']]);

const mapArtist = { ratioUniform: false, ratios: { A: { company: 60, artist: 40 }, B: { company: 40, artist: 60 } } };
const mapCalc = computeGeneralSettlement({ artist: mapArtist, categories: CATS2, ledgerRows: [], songRows: mapRows, carryIn: 0 });
// 수익 가중 비율 = (1,000 x 40% + 500 x 60%) / 1,500 = 700/1,500
eq('수익 가중 비율 = 700/1,500', mapCalc.artistRatePercent, (700 / 1500) * 100);
eq('아티스트 몫 = 1,500 x 그 비율 = 700', mapCalc.artistShare, 700);

// 연결표가 없으면 예전처럼 곡 연결에서 고른 항목(B)으로 전부 들어간다
const noMapRows = buildSongRows({ projects: [mapProject], transactions: mapTx, artistId: 'M1', months: ['2026-03'] });
eq('연결표 없으면 기본 항목으로', noMapRows.map((r) => r.categoryId), ['B', 'B']);
eq('연결표 없으면 전부 미연결로 표시',
    unmappedVotizCategories(noMapRows).map((u) => u.category), ['source', 'performance']);

// 연결표에 일부만 있으면 나머지는 기본 항목 + 안내 대상
const halfMap = { [votizMapKey('income', 'source')]: 'A' };
const halfRows = buildSongRows({ projects: [mapProject], transactions: mapTx, artistId: 'M1', months: ['2026-03'], votizMap: halfMap });
eq('연결된 것만 A, 나머지는 기본 항목 B', halfRows.map((r) => r.categoryId), ['A', 'B']);
eq('미연결 안내 대상은 공연수익뿐',
    unmappedVotizCategories(halfRows).map((u) => u.type + ':' + u.category), ['income:performance']);

// 수익배분(마이너스 수익)도 연결표를 따른다. 연결이 없으면 기본 항목으로.
const payTx = mapTx.concat([
    { id: 'm3', projectId: 'MP', division: 'votiz', type: 'income', category: PAYOUT_CATEGORY, date: '2026-03-12', amount: -300, totalAmount: -300 },
]);
const payMapped = buildSongRows({
    projects: [mapProject], transactions: payTx, artistId: 'M1', months: ['2026-03'],
    votizMap: { ...vMap, [votizMapKey('income', PAYOUT_CATEGORY)]: 'A' },
});
eq('수익배분도 연결표대로', payMapped.find((r) => r.votizCategory === PAYOUT_CATEGORY).categoryId, 'A');
const payFallback = buildSongRows({ projects: [mapProject], transactions: payTx, artistId: 'M1', months: ['2026-03'], votizMap: vMap });
eq('연결 없으면 수익배분은 기본 수익항목(B)', payFallback.find((r) => r.votizCategory === PAYOUT_CATEGORY).categoryId, 'B');
eq('수익배분 마이너스는 지분만큼 깎인다(소속도 같이 부담)',
    payFallback.find((r) => r.votizCategory === PAYOUT_CATEGORY).amount, -300);

// -- [ 11. 항목 3단계 (항목 > 세부 > 세부2) ] --
console.log('');
console.log('-- 11. 항목 3단계');

// 2단계까지만 쓰던 기존 데이터 + 3단계를 섞은 목록
const CATS3 = [
    { id: 'T', name: '제작비', kind: 'expense', order: 1 },
    { id: 'T1', name: '곡비', parentId: 'T', order: 1 },
    { id: 'T1a', name: '작사비', parentId: 'T1', order: 1 },
    { id: 'T1b', name: '작곡비', parentId: 'T1', order: 2 },
    { id: 'T2', name: '믹스', parentId: 'T', order: 2 },        // 2단계만 (기존 모양)
    { id: 'I', name: '음원', kind: 'income', order: 1 },
    { id: 'HX', name: '숨은항목', kind: 'expense', order: 9, hidden: true },
    { id: 'HX1', name: '숨은자식', parentId: 'HX', order: 1 },
    { id: 'HX1a', name: '숨은손자', parentId: 'HX1', order: 1 },
];

eq('최대 단계', MAX_DEPTH, 3);
eq('줄기 [최상위..자기]', chainOf(CATS3, 'T1a').map((c) => c.id), ['T', 'T1', 'T1a']);
eq('2단계 줄기', chainOf(CATS3, 'T2').map((c) => c.id), ['T', 'T2']);
eq('없는 id 는 빈 줄기', chainOf(CATS3, 'ZZZ'), []);
eq('단계 수', [depthOf(CATS3, 'T'), depthOf(CATS3, 'T2'), depthOf(CATS3, 'T1a')], [1, 2, 3]);
eq('3단계도 최상위는 T', rootIdOf(CATS3, 'T1a'), 'T');
eq('3단계 구분도 최상위를 따른다', kindOf(CATS3, CATS3.find((c) => c.id === 'T1a')), 'expense');
eq('할아버지가 숨으면 손자도 숨는다', isHidden(CATS3, CATS3.find((c) => c.id === 'HX1a')), true);
eq('전체 경로 표기', catPath(CATS3, 'T', 'T1a'), '제작비 > 곡비 > 작사비');
eq('2단계 표기는 그대로', catPath(CATS3, 'T', 'T2'), '제작비 > 믹스');
eq('세부 없으면 항목만', catPath(CATS3, 'T', ''), '제작비');
eq('지워진 세부는 표시만 바뀐다', catPath(CATS3, 'T', 'GONE'), '제작비 > (삭제된 세부항목)');

// 저장 방식: categoryId = 최상위, subCategoryId = 가장 깊이 고른 것 하나
const row3 = { type: 'expense', categoryId: 'T', subCategoryId: 'T1a', totalAmount: 300 };
const row2 = { type: 'expense', categoryId: 'T', subCategoryId: 'T2', totalAmount: 200 };   // 기존 모양
const row1 = { type: 'expense', categoryId: 'T', totalAmount: 100 };                        // 세부 없음

eq('필터: 최상위를 고르면 3단계 줄까지 걸린다',
    [row1, row2, row3].map((r) => rowMatchesCategory(CATS3, r, 'T')), [true, true, true]);
eq('필터: 2단계(곡비)를 고르면 그 아래 3단계만',
    [row1, row2, row3].map((r) => rowMatchesCategory(CATS3, r, 'T1')), [false, false, true]);
eq('필터: 3단계(작사비)를 고르면 그 줄만',
    [row1, row2, row3].map((r) => rowMatchesCategory(CATS3, r, 'T1a')), [false, false, true]);
eq('필터: 2단계(믹스)는 기존 줄만', [row1, row2, row3].map((r) => rowMatchesCategory(CATS3, r, 'T2')),
    [false, true, false]);
eq('필터 없으면 전부', [row1, row2, row3].map((r) => rowMatchesCategory(CATS3, r, '')), [true, true, true]);

// 3단계 금액도 최상위 합계에 들어간다 (2단계 기존 줄과 함께)
const d3Calc = computeGeneralSettlement({
    artist: { ratioUniform: false, ratios: { T: { company: 50, artist: 50 } } },
    categories: CATS3,
    ledgerRows: [row1, row2, row3],
    songRows: [], carryIn: 0,
});
eq('1+2+3단계 금액이 최상위 한 줄(600)로 합쳐진다',
    d3Calc.rows.map((r) => [r.categoryId, r.expense]), [['T', 600]]);
eq('줄 이름은 최상위 이름', d3Calc.rows[0].name, '제작비');

// 기존 2단계 데이터만 있을 때도 결과가 같아야 한다
const onlyOld = computeGeneralSettlement({
    artist: { ratioUniform: false, ratios: { T: { company: 50, artist: 50 } } },
    categories: CATS3, ledgerRows: [row1, row2], songRows: [], carryIn: 0,
});
eq('기존 2단계 데이터만 있을 때 300', onlyOld.rows.map((r) => [r.categoryId, r.expense]), [['T', 300]]);

// 화면 목록(열)에서 쓰는 함수들
eq('2단계 목록', childrenOf(CATS3, 'T').map((c) => c.id), ['T1', 'T2']);
eq('3단계 목록', childrenOf(CATS3, 'T1').map((c) => c.id), ['T1a', 'T1b']);
eq('3단계 아래는 없다', hasChildren(CATS3, 'T1a'), false);
eq('숨긴 2단계는 기본으로 안 보인다', childrenOf(CATS3, 'HX').map((c) => c.id), ['HX1']);

// -- [ 12. 공유 회차 표시 ] --
console.log('');
console.log('-- 12. 공유 회차 (표시 전용)');

const rLink = { recoupAmount: 0, sharePercent: 30, startMonth: '2021-07', periodMonths: 36 };
eq('시작월이 1회차', shareRoundOf(rLink, '2021-07-25').label, '1/36');
eq('다음 달은 2회차', shareRoundOf(rLink, '2021-08-25').label, '2/36');
eq('마지막 달은 36회차', shareRoundOf(rLink, '2024-06-25').label, '36/36');
eq('기간 밖(다음 달)은 없음', shareRoundOf(rLink, '2024-07-25'), null);
eq('기간 밖(시작 전)은 없음', shareRoundOf(rLink, '2021-06-25'), null);
eq('회차·분모 숫자', [shareRoundOf(rLink, '2021-08-25').round, shareRoundOf(rLink, '2021-08-25').total], [2, 36]);
eq('기간이 12개월이면 분모도 12', shareRoundOf({ ...rLink, periodMonths: 12 }, '2021-07-01').label, '1/12');
eq('연결 정보가 없으면 없음', [shareRoundOf(null, '2021-07-25'), shareRoundOf(rLink, '')], [null, null]);
eq('기간 판정과 같은 결과를 낸다',
    [isWithinShareWindow(rLink, '2024-06-25'), !!shareRoundOf(rLink, '2024-06-25')], [true, true]);

// VAT 배지 판정 — 자동배분 줄은 부가세가 음수다(절댓값으로 본다). 저장값은 그대로.
const invoiceMoney = payoutAmounts(1000000, 'invoice');
const withholdMoney = payoutAmounts(1000000, 'withholding');
eq('세금계산서 배분 줄의 부가세는 음수', invoiceMoney.vat < 0, true);
eq('절댓값으로 보면 VAT 배지 대상', Math.abs(invoiceMoney.vat) > 0, true);
eq('원천징수 배분 줄은 부가세 0 → 배지 없음', Math.abs(withholdMoney.vat) > 0, false);
eq('저장 금액·부호는 그대로', [invoiceMoney.amount, invoiceMoney.vat, invoiceMoney.totalAmount],
    [-909091, -90909, -1000000]);

// -- [ 13. 내역 목록에서 자동배분 줄을 원본 아래로 묶기 (표시 전용) ] --
console.log('');
console.log('-- 13. 자동배분 줄 묶어 보여주기');

const inc = (id, date) => ({ id, type: 'income', category: 'source', date, totalAmount: 1000 });
const pay = (id, srcId, artistId, sec) => ({
    id, type: 'income', category: PAYOUT_CATEGORY, date: '2026-01-15', totalAmount: -300,
    payoutSourceId: srcId, payoutArtistId: artistId, createdAt: { seconds: sec },
});
const seq = (g) => g.map((e) => e.row.id + ':' + e.kind);

// 저장 순서가 섞여 있어도 원본 바로 아래로 간다
const mixed = [inc('S2', '2026-02-10'), pay('P1', 'S1', 'A', 10), inc('S1', '2026-01-15'), pay('P2', 'S2', 'A', 20)];
eq('섞여 있어도 원본 바로 아래',
    seq(groupPayoutsUnderSource(mixed)), ['S2:normal', 'P2:child', 'S1:normal', 'P1:child']);

// 나머지 줄 순서는 들어온 그대로(날짜 정렬 등 기존 규칙 유지)
eq('원본끼리의 순서는 안 바뀐다',
    groupPayoutsUnderSource(mixed).filter((e) => e.kind === 'normal').map((e) => e.row.id), ['S2', 'S1']);

// 한 수익에 여러 명 — 만든 순서(= 아티스트 연결 순서)대로
const many = [inc('S1', '2026-01-15'), pay('Pb', 'S1', 'B', 20), pay('Pa', 'S1', 'A', 10), pay('Pc', 'S1', 'C', 30)];
eq('여러 명이면 만든 순서대로 줄줄이',
    seq(groupPayoutsUnderSource(many)), ['S1:normal', 'Pa:child', 'Pb:child', 'Pc:child']);

// createdAt 이 없는 옛 줄은 들어온 순서를 지킨다
const noTs = [inc('S1', '2026-01-15'),
    { id: 'Px', type: 'income', category: PAYOUT_CATEGORY, date: '2026-01-15', totalAmount: -100, payoutSourceId: 'S1', payoutArtistId: 'X' },
    { id: 'Py', type: 'income', category: PAYOUT_CATEGORY, date: '2026-01-15', totalAmount: -100, payoutSourceId: 'S1', payoutArtistId: 'Y' }];
eq('시각 없는 옛 줄은 들어온 순서 유지', seq(groupPayoutsUnderSource(noTs)), ['S1:normal', 'Px:child', 'Py:child']);

// 원본이 목록에 없으면 제자리 + orphan
const orphan = [inc('S1', '2026-01-15'), pay('P9', 'GONE', 'A', 10)];
eq('원본 없는 배분 줄은 제자리에 orphan', seq(groupPayoutsUnderSource(orphan)), ['S1:normal', 'P9:orphan']);

// 자동배분이 하나도 없으면 순서가 그대로다
const plain = [inc('S1', '2026-02-10'), inc('S2', '2026-01-15')];
eq('자동배분 없으면 그대로', seq(groupPayoutsUnderSource(plain)), ['S1:normal', 'S2:normal']);
eq('빈 목록', groupPayoutsUnderSource([]), []);
eq('목록이 없어도 터지지 않는다', groupPayoutsUnderSource(null), []);

// 줄 개수는 늘지도 줄지도 않는다(표시 순서만 바꾼다)
eq('줄 개수 보존', [mixed.length, many.length, orphan.length].join(',') + ' / ' +
    [groupPayoutsUnderSource(mixed).length, groupPayoutsUnderSource(many).length, groupPayoutsUnderSource(orphan).length].join(','),
    '4,4,2 / 4,4,2');
// 원본 데이터를 건드리지 않는다(임시 필드가 남지 않아야 한다)
groupPayoutsUnderSource(many);
eq('원본 줄에 임시 필드가 안 남는다', many.some((r) => '__i' in r), false);

// -- [ 14. 페이지 경계에서 묶음이 갈라지지 않게 ] --
console.log('');
console.log('-- 14. 페이지 나누기 (묶음 유지)');

// 원본 1 + 배분 2 짜리 묶음을 줄줄이 만든다 (한 묶음 = 3줄)
const mkGroup = (k) => [
    { id: 'S' + k }, { id: 'P' + k + 'a' }, { id: 'P' + k + 'b' },
];
const rows14 = [];
const kinds14 = {};
for (let k = 0; k < 10; k++) {
    const g = mkGroup(k);
    g.forEach((r, i) => { rows14.push(r); kinds14[r.id] = i === 0 ? 'normal' : 'child'; });
}
eq('줄 30개 준비', rows14.length, 30);

// perPage 4 → 묶음(3줄)이 경계에 걸려도 통째로 들어간다
const pg = paginateGrouped(rows14, kinds14, 4);
const splitGroup = pg.some((page) => {
    // 한 페이지 안에서 'child' 가 자기 원본 없이 시작하면 갈라진 것
    return page.length > 0 && kinds14[page[0].id] === 'child';
});
eq('경계에 걸린 묶음이 갈라지지 않는다', splitGroup, false);
eq('모든 페이지가 원본으로 시작한다', pg.every((page) => kinds14[page[0].id] === 'normal'), true);
eq('묶음은 항상 3줄씩 붙어 있다',
    pg.every((page) => page.length % 3 === 0), true);

// 줄 수는 보존된다 (더하지도 빼지도 않는다)
eq('전체 줄 수 보존', pg.reduce((a, c) => a + c.length, 0), rows14.length);
eq('순서도 그대로', pg.flat().map((r) => r.id).join(','), rows14.map((r) => r.id).join(','));

// perPage 를 조금 넘을 수 있다(묶음을 지키려고)
eq('페이지가 perPage 를 넘을 수 있다', pg.some((page) => page.length > 4), true);
eq('그래도 perPage + 묶음길이 보다는 작다', pg.every((page) => page.length <= 4 + 2), true);

// 25건 기준 실제 사례 — 앞에 단독 줄 24개 + 묶음(3줄)
const rows25 = [];
const kinds25 = {};
for (let k = 0; k < 24; k++) { const id = 'X' + k; rows25.push({ id }); kinds25[id] = 'normal'; }
mkGroup(99).forEach((r, i) => { rows25.push(r); kinds25[r.id] = i === 0 ? 'normal' : 'child'; });
const pg25 = paginateGrouped(rows25, kinds25, 25);
eq('경계에 걸친 묶음 3줄이 한 페이지에', pg25[0].slice(-3).map((r) => r.id), ['S99', 'P99a', 'P99b']);
eq('한 페이지로 끝난다(27줄)', [pg25.length, pg25[0].length], [1, 27]);
eq('25건 사례도 줄 수 보존', pg25.reduce((a, c) => a + c.length, 0), 27);

// kinds 를 안 넘기면(다른 탭) 예전처럼 perPage 씩 자른다
const plain25 = paginateGrouped(rows25, null, 25);
eq('kinds 없으면 25건씩', plain25.map((p) => p.length), [25, 2]);

// 가장자리
eq('빈 목록', paginateGrouped([], {}, 25), []);
eq('목록이 없어도 터지지 않는다', paginateGrouped(null, null, 25), []);
eq('perPage 를 안 주거나 0 이면 기본 25', paginateGrouped([{ id: 'A' }, { id: 'B' }], {}, 0).length, 1);

// -- [ 결과 ] --
console.log(`\n${pass}/${pass + fail} 통과` + (fail ? ` — 실패 ${fail}건` : ''));
process.exit(fail ? 1 : 0);
