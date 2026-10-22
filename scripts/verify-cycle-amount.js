// 사이클 묶기 + 사이클 금액 회귀 검증. DB 를 쓰지 않는 순수 함수 검증이라 마음껏 돌려도 된다.
//   npm run verify-cycle-amount
//
// 확인하는 것
//   1) 사이클 도중에 수업 종류가 바뀌어도 사이클은 닫히지 않는다(마스터3 + 보컬1 = 한 사이클).
//   2) 사이클 도중 변경이 없는 학생은 예전 계산과 똑같다.
//   3) 사이클 금액 = 그 사이클 수업들의 단가 합. 아직 안 잡힌 횟수는 종류별 1회분으로 메운다.
import {
    getRotationInfo, findRotationStarts, computeRequirement, sortByDateTime,
} from '../src/domain/rotation.js';
import { cycleAmountsOf } from '../src/domain/cycleAmount.js';

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass += 1;
    else fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        기대 ${JSON.stringify(want)}\n        실제 ${JSON.stringify(got)}`}`);
};

const weeks = (m, v, v30 = 0) => [1, 2, 3, 4].map(() => ({ master: String(m), vocal: String(v), vocal30: String(v30) }));
const L = (id, date, grid, extra = {}) => ({
    id, date, time: '20:00', studentId: 'S', category: '레슨', status: 'completed',
    gridType: grid, ...extra,
});
const labels = (list, st) => list.map((s) => `${s.date} ${getRotationInfo(list, s.id, st, { withSubIndex: true }).label}`);
const amounts = (list, st) => [...cycleAmountsOf(list, st)].sort().map(([d, v]) => `${d}:${v.amount}`);

// ── 1. 사이클 도중에 마스터 → 보컬로 바뀐 학생 (이종민 사례) ─────────────────
{
    const st = {
        id: 'S', name: '중간변경', firstDate: '2026-01-01', rates: { master: '125000', vocal: '125000' },
        // 주 1회 × 4주 = 사이클당 4회. 마스터만 → 보컬만 → 다시 마스터만.
        schedule: weeks(1, 0),
        scheduleHistory: [
            { from: '2026-01-01', schedule: weeks(1, 0) },
            { from: '2026-09-28', schedule: weeks(0, 1) },
            { from: '2026-10-16', schedule: weeks(1, 0) },
        ],
    };
    const list = sortByDateTime([
        L('a1', '2026-09-10', 'master'), L('a2', '2026-09-19', 'master'), L('a3', '2026-09-24', 'master'),
        L('b1', '2026-10-02', 'vocal'), L('b2', '2026-10-15', 'vocal'),
        L('c1', '2026-10-16', 'master'), L('c2', '2026-10-23', 'master'),
    ]);
    eq('중간변경 — 마스터3 + 보컬1 이 한 사이클', labels(list, st), [
        '2026-09-10 R1-1', '2026-09-19 R1-2', '2026-09-24 R1-3', '2026-10-02 R1-4',
        '2026-10-15 R2-1', '2026-10-16 R2-2', '2026-10-23 R2-3',
    ]);
    const { reqM, reqV } = computeRequirement(st);
    eq('중간변경 — 재등록은 10-15 한 번만', [...findRotationStarts(list, { reqM, reqV, anchorDate: '2026-09-09', student: st })].sort(),
        ['2026-09-10', '2026-10-15']);
    eq('중간변경 — 사이클 금액은 단가 합', amounts(list, st), ['2026-09-10:500000', '2026-10-15:500000']);
}

// ── 2. 변경이 없는 학생은 예전 그대로 ────────────────────────────────────────
{
    const st = {
        id: 'S', name: '변경없음', firstDate: '2026-01-01', rates: { master: '200000', vocal: '100000' },
        schedule: weeks(1, 1),
    };
    const list = sortByDateTime([
        L('m1', '2026-09-01', 'master'), L('v1', '2026-09-03', 'vocal'),
        L('m2', '2026-09-08', 'master'), L('v2', '2026-09-10', 'vocal'),
        L('m3', '2026-09-15', 'master'), L('v3', '2026-09-17', 'vocal'),
        L('m4', '2026-09-22', 'master'), L('v4', '2026-09-24', 'vocal'),
        L('m5', '2026-09-29', 'master'),
    ]);
    eq('변경없음 — 마스터/보컬 각각 4회에 한 사이클', labels(list, st), [
        '2026-09-01 R1-1', '2026-09-03 R1-1', '2026-09-08 R1-2', '2026-09-10 R1-2',
        '2026-09-15 R1-3', '2026-09-17 R1-3', '2026-09-22 R1-4', '2026-09-24 R1-4',
        '2026-09-29 R2-1',
    ]);
    eq('변경없음 — 한 바퀴 금액 = 정가(4×20만 + 4×10만)', amounts(list, st).slice(0, 1), ['2026-09-01:1200000']);
}

// ── 3. 하프·30분이 섞여도 금액이 정가와 맞는다 ───────────────────────────────
{
    const st = {
        id: 'S', name: '하프', firstDate: '2026-01-01', rates: { master: '275000', vocal: '125000' },
        schedule: weeks(1, 1),
    };
    // 보컬 하프 8개 = 보컬 4회. 금액은 8 × 62,500 = 50만 = 보컬 정가 4회분.
    const list = sortByDateTime([
        ...[1, 2, 3, 4].map((i) => L(`m${i}`, `2026-09-0${i}`, 'master')),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => L(`h${i}`, `2026-09-1${i - 1}`, 'vocal', { vocalType: 'half' })),
    ]);
    eq('하프 — 한 바퀴 금액 = 정가(4×27.5만 + 4×12.5만)', amounts(list, st).slice(0, 1), ['2026-09-01:1600000']);
}

// ── 4. 아직 안 잡힌 횟수는 그 시점 정가 1회분으로 메운다 ─────────────────────
{
    const st = {
        id: 'S', name: '진행중', firstDate: '2026-01-01', rates: { master: '275000', vocal: '125000' },
        schedule: weeks(1, 1),
    };
    const list = sortByDateTime([L('m1', '2026-09-01', 'master'), L('v1', '2026-09-02', 'vocal')]);
    // 마스터 1 + 보컬 1 만 잡혀 있다 → 남은 마스터3·보컬3 은 정가 1회분으로.
    eq('진행중 — 남은 횟수는 정가 1회분', amounts(list, st), ['2026-09-01:1600000']);
}

console.log(`\n${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
