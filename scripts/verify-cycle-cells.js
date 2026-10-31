// 팝업 사이클 진행 칸(cycleCells) 검증.
//   npm run verify-cycle-cells
//
// 두 가지를 본다.
//  1) 하프(0.5) 를 반 칸으로 세는가 — 순수 함수 사례
//  2) 칸의 회차 번호가 **회차 계산(getRotationInfo)과 항상 같은가** — 운영 백업으로 전수 대조
//     (cycleCells 는 칸 그림 때문에 '사이클 안 위치' 까지 따로 구하므로, 어긋나지 않는지 확인한다)
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR } from './lib/common.js';
import {
    cycleCells, getRotationInfo, computeRequirement, splitByType, sortByDateTime,
    hasScheduleTimeline, assignCyclesTimeline, rotationBufferDate,
} from '../src/domain/rotation.js';
import { formatDateLocal } from '../src/utils/date.js';

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass += 1;
    else fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        기대 ${JSON.stringify(want)}\n        실제 ${JSON.stringify(got)}`}`);
};

// ── 1. 하프 세기 ─────────────────────────────────────────────
const V = (id, date, type, status = 'completed') => ({
    id, date, time: '19:00', studentId: 'S', category: '레슨', status,
    gridType: 'vocal', vocalType: type,
});
const list = (arr) => splitByType(sortByDateTime(arr)).vScheds;
const fills = (c) => c.cells.map((x) => `${x.done}+${x.current}`);

{
    const l = list([V('a', '2026-10-01', 'half')]);
    const c = cycleCells(l, 'a', 4);
    eq('하프 1개(완료) → 0.5/4', [c.label, c.done], ['R1', 0.5]);
    eq('하프 1개 — 첫 칸만 반 채움', fills(c), ['0.5+0', '0+0', '0+0', '0+0']);
}
{
    const l = list([V('a', '2026-10-01', 'half'), V('b', '2026-10-08', 'half')]);
    const c = cycleCells(l, 'b', 4);
    eq('하프 2개 → 1/4 (한 칸)', [c.label, c.done], ['R1', 1]);
    eq('하프 2개 — 첫 칸이 꽉', fills(c), ['1+0', '0+0', '0+0', '0+0']);
}
{
    const l = list([V('a', '2026-10-01', 'half'), V('b', '2026-10-08', '60')]);
    const c = cycleCells(l, 'b', 4);
    eq('하프 + 60분 → 1.5/4', [c.label, c.done], ['R1', 1.5]);
    eq('하프+60분 — 한 수업이 두 칸에 걸친다', fills(c), ['1+0', '0.5+0', '0+0', '0+0']);
}
{
    // 3회 완료 + 4번째는 아직 예정(지금 누른 수업) — 하프 없는 학생은 예전 그림 그대로여야 한다
    const l = list([1, 2, 3].map((i) => V('m' + i, `2026-10-0${i}`, '60')).concat(V('m4', '2026-10-04', '60', '')));
    const c = cycleCells(l, 'm4', 4);
    eq('일반 4회 — 예전과 같다(3/4, 세 칸 + 이 수업)', [c.label, c.done, ...fills(c)], ['R1', 3, '1+0', '1+0', '1+0', '0+1']);
}
{
    // 사이클을 넘어간다 — 하프 8개 = 4회 → 9번째부터 R2
    const arr = [];
    for (let i = 1; i <= 9; i++) arr.push(V('h' + i, `2026-10-${String(i).padStart(2, '0')}`, 'half'));
    const l = list(arr);
    eq('하프 8개로 R1 을 채우고 9번째는 R2', [cycleCells(l, 'h8', 4).label, cycleCells(l, 'h9', 4).label], ['R1', 'R2']);
    eq('9번째(R2) 는 0.5/4', cycleCells(l, 'h9', 4).done, 0.5);
}
{
    // 지금 누른 수업(아직 예정)은 '이 수업' 으로 — 완료에는 안 센다
    const l = list([V('a', '2026-10-01', 'half'), V('b', '2026-10-08', 'half', '')]);
    const c = cycleCells(l, 'b', 4);
    eq('예정인 이 수업은 완료에 안 센다', [c.done, c.current], [0.5, 0.5]);
    eq('첫 칸 = 완료 0.5 + 이 수업 0.5', fills(c)[0], '0.5+0.5');
}

// ── 2. 회차 번호가 회차 계산과 같은가 (운영 백업 전수) ──────────────
let swept = 0;
try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^prod-.*\.json$/.test(f)).sort();
    const raw = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[files.length - 1]), 'utf8'));
    const students = raw.docs.filter((d) => /^students\/[^/]+$/.test(d.path)).map((d) => ({ id: d.path.split('/')[1], ...d.data }));
    const all = raw.docs.filter((d) => /^schedules\/[^/]+$/.test(d.path)).map((d) => ({ id: d.path.split('/')[1], ...d.data }));
    let bad = 0;
    for (const st of students) {
        const { reqM, reqV } = computeRequirement(st);
        const buffer = rotationBufferDate(st.firstDate, formatDateLocal);
        const rot = sortByDateTime(all.filter((s) => s.studentId === st.id && s.date >= buffer &&
            (s.status === 'completed' || s.status === 'absent')));
        if (!rot.length) continue;
        const { mScheds, vScheds } = splitByType(rot);
        const assign = hasScheduleTimeline(st) ? assignCyclesTimeline(mScheds, vScheds, st) : null;
        for (const [arr, req, per] of [[mScheds, reqM, assign?.mPerLesson], [vScheds, reqV, assign?.vPerLesson]]) {
            if (!req) continue;
            for (const s of arr) {
                const cc = cycleCells(arr, s.id, req, per);
                const ri = getRotationInfo(rot, s.id, st);
                swept += 1;
                if (!cc || cc.cycleIndex !== ri.index) {
                    bad += 1;
                    if (bad <= 5) console.log(`      ✖ ${st.name} ${s.date} — 칸 ${cc ? cc.label : '(없음)'} vs 회차 ${ri.label}`);
                    continue;
                }
                // 칸에 칠한 항상은 그 사이클 수업의 가중치 합과 같아야 한다(마지막 칸을 넘치면 잘린다).
                const want = Math.min(
                    arr.filter((x) => (per ? per.get(x.id)?.cycleIndex : getRotationInfo(rot, x.id, st).index) === cc.cycleIndex)
                        .reduce((a, x) => a + x._weight, 0),
                    req
                );
                if (Math.abs(cc.done - want) > 0.01) {
                    bad += 1;
                    if (bad <= 5) console.log(`      ✖ ${st.name} ${s.date} — 칸 합 ${cc.done} vs 가중치 합 ${want}`);
                }
            }
        }
    }
    eq(`운영 백업 ${swept}건 — 칸의 회차 번호 = 회차 계산, 칸 합 = 가중치 합`, bad, 0);
} catch (e) {
    console.log('SKIP  운영 백업 전수 대조 — 백업 파일이 없다:', e.message);
}

console.log(`\n${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
