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
    computeCollab,
    buildSongRows,
    memberSharePercent,
    monthRange,
} from '../src/domain/artistSettlement.js';
import {
    computePayout, payoutSnapshot, payoutOfSettlement, taxTypeOf,
    WITHHOLDING_RATE, LOCAL_TAX_RATE, VAT_RATE,
} from '../src/domain/artistPayout.js';

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

// ──[ 결과 ]──────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} 통과` + (fail ? ` — 실패 ${fail}건` : ''));
process.exit(fail ? 1 : 0);
