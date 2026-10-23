// 추가결제 ↔ 누적 입금(부분결제 임시 보관) 맞추기 검증. DB 를 안 쓰는 순수 함수라 마음껏 돌려도 된다.
//   npm run verify-deposit
import { reconcileExtraDeposit, linkedDeposits, depositTotal } from '../src/domain/deposit.js';

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass += 1;
    else fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        기대 ${JSON.stringify(want)}\n        실제 ${JSON.stringify(got)}`}`);
};

const PID = 'pay1';
const D = '2026-10-23';
const linkedRow = (amount, id = 'd1') => ({ id, amount, date: D, memo: '추가결제', sourcePaymentId: PID });
const manual = { id: 'm1', amount: 50000, date: '2026-10-01', memo: '현금 일부' };
const run = (list, extra, prevExtra) => reconcileExtraDeposit(list, { paymentId: PID, extra, prevExtra, date: D, newId: 'new1' });
const summary = (r) => ({ action: r.action, delta: r.delta, shortfall: r.shortfall, 합계: depositTotal(r.list) });

// 1. 신규 결제에 추가결제 → 적립 (기존 동작 그대로)
eq('신규 결제 + 추가결제 20만', summary(run([], 200000, 0)), { action: 'add', delta: 200000, shortfall: 0, 합계: 200000 });
eq('신규 — 저장 모양', run([], 200000, 0).list, [
    { id: 'new1', amount: 200000, date: D, memo: '추가결제', sourcePaymentId: PID },
]);

// 2~5. 수정 경로
eq('수정 — 없다가 새로 10만', summary(run([manual], 100000, 0)), { action: 'add', delta: 100000, shortfall: 0, 합계: 150000 });
eq('수정 — 20만 → 30만(늘림)', summary(run([manual, linkedRow(200000)], 300000, 200000)), { action: 'update', delta: 100000, shortfall: 0, 합계: 350000 });
eq('수정 — 20만 → 5만(줄임)', summary(run([manual, linkedRow(200000)], 50000, 200000)), { action: 'update', delta: -150000, shortfall: 0, 합계: 100000 });
eq('수정 — 20만 → 0(지움)', summary(run([manual, linkedRow(200000)], 0, 200000)), { action: 'remove', delta: -200000, shortfall: 0, 합계: 50000 });

// 6. 같은 값으로 여러 번 저장해도 중복으로 쌓이지 않는다
{
    let list = run([], 200000, 0).list;
    for (let i = 0; i < 3; i++) {
        const r = run(list, 200000, 200000);
        list = r.list;
        eq(`재저장 ${i + 1}회 — 변화 없음`, { action: r.action, 합계: depositTotal(list) }, { action: 'none', 합계: 200000 });
    }
}

// 7~8. 적립 줄이 이미 정리된(쓰고 지운) 경우
eq('적립 줄 없음 + 줄이려 함 → 막고 알림', summary(run([manual], 50000, 200000)), { action: 'blocked', delta: 0, shortfall: 150000, 합계: 50000 });
eq('적립 줄 없음 + 늘림 → 늘어난 만큼만', summary(run([manual], 300000, 200000)), { action: 'readd', delta: 100000, shortfall: 0, 합계: 150000 });
eq('적립 줄 없음 + 그대로 → 변화 없음', summary(run([manual], 200000, 200000)), { action: 'none', delta: 0, shortfall: 0, 합계: 50000 });

// 9. 손으로 넣은 줄은 건드리지 않는다
eq('손입력 줄은 그대로', run([manual, linkedRow(200000)], 0, 200000).list, [manual]);

// 10. 옛 데이터에 짝이 여러 줄이면 한 줄로 정리된다
eq('짝이 두 줄이면 한 줄로', summary(run([linkedRow(100000, 'a'), linkedRow(100000, 'b')], 300000, 200000)), { action: 'update', delta: 100000, shortfall: 0, 합계: 300000 });
eq('짝이 두 줄 — 줄 수', run([linkedRow(100000, 'a'), linkedRow(100000, 'b')], 300000, 200000).list.length, 1);

// 11. 짝 찾기
eq('linkedDeposits — 짝만 고른다', linkedDeposits([manual, linkedRow(200000)], PID).map((d) => d.id), ['d1']);
eq('새로 넣으면 변화가 생긴다', run([manual], 100000, 0).changed, true);
eq('paymentId 없음 → 변화 없음', reconcileExtraDeposit([manual], { paymentId: null, extra: 100000, prevExtra: 0, date: D, newId: 'n' }).action, 'none');

console.log(`\n${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
