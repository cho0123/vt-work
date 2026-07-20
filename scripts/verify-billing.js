/**
 * 월정산 청구 금액 계산식 통일 검증. (Firestore 읽기 없음 — 로컬 백업 사용)
 *
 * 리팩터링 전 공식(학생 '계획'으로 단가 하나를 정해 그 달 모든 보컬에 적용)과
 * 새 공식(수업마다 자기 종류대로 단가)을 실제 데이터로 대조한다.
 *
 * 실행: npm run verify-billing
 */
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR } from './lib/common.js';
import { calculateBilledAmount, calculateTotalAmount } from '../src/utils/money.js';

const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('prod-') && f.endsWith('.json'))
    .sort();
const j = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[files.length - 1]), 'utf8'));

const students = j.docs
    .filter((d) => /^students\/[^/]+$/.test(d.path))
    .map((d) => ({ id: d.path.split('/')[1], ...d.data }));
const scheds = j.docs.filter((d) => /^schedules\/[^/]+$/.test(d.path)).map((d) => d.data);

const mask = (n) => (n ? n[0] + '*'.repeat(Math.max(0, n.length - 1)) : '?');
const won = (n) => n.toLocaleString() + '원';

// ── 리팩터링 전 공식 (AttendanceTab 에 있던 것) ──────────────
function legacyBilled(student, monthScheds) {
    const cntM = monthScheds.filter((s) => (s.gridType === 'master' || !s.gridType) && s.category !== '상담').length;
    const cntV = monthScheds.filter((s) => s.gridType === 'vocal').length;
    let planV = 0,
        planV30 = 0;
    (student.schedule || []).forEach((w) => {
        planV += Number(w.vocal || 0);
        planV30 += Number(w.vocal30 || 0);
    });
    const isV30 = planV30 > planV;
    const rateM = Number(student.rates?.master || 0);
    const rateV = Number(student.rates?.vocal || 0);
    return cntM * rateM + cntV * (isV30 ? rateV * 0.5 : rateV);
}

// 데이터에 존재하는 모든 월을 대상으로 한다
const allMonths = [
    ...new Set(scheds.map((s) => (s.date || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))),
].sort();

console.log(
    `\n대조 대상: 학생 ${students.length}명 × ${allMonths.length}개월 (${allMonths[0]} ~ ${allMonths[allMonths.length - 1]})\n`
);

// 월정산 청구 계산은 화면에서 isMonthly 학생에게만 표시된다(AttendanceTab 의
// attCategory==='monthly' 필터). 그래서 실제 청구에 영향을 주는 것은 그들뿐이다.
// 나머지 학생은 참고용으로만 집계한다.
let checked = 0;
let diff = 0;
let diffMonthly = 0;
for (const s of students) {
    for (const ym of allMonths) {
        const monthScheds = scheds.filter(
            (x) => x.studentId === s.id && (x.date || '').startsWith(ym) && x.status !== 'reschedule'
        );
        if (monthScheds.length === 0) continue;
        checked++;

        const cntM = monthScheds.filter(
            (x) => (x.gridType === 'master' || !x.gridType) && x.category !== '상담'
        ).length;
        const vocalScheds = monthScheds.filter((x) => x.gridType === 'vocal');

        const before = legacyBilled(s, monthScheds);
        const after = calculateBilledAmount(cntM, vocalScheds, s);

        if (before !== after) {
            diff++;
            if (s.isMonthly) diffMonthly++;
            if (diff <= 15) {
                const types = {};
                for (const x of vocalScheds)
                    types[x.vocalType || '(종류없음)'] = (types[x.vocalType || '(종류없음)'] || 0) + 1;
                const tag = s.isMonthly ? '⚠ 월정산 대상' : '(월정산 아님 — 화면에 표시되지 않는 계산)';
                console.log(`  차이 — ${mask(s.name)} ${ym}  보컬 ${JSON.stringify(types)} 마스터 ${cntM}회  ${tag}`);
                console.log(`     기존 ${won(before)}  ->  신규 ${won(after)}   (${won(after - before)})`);
            }
        }
    }
}

console.log(`월정산 청구식: ${checked}건 대조`);
console.log(`   전체 차이            : ${diff}건`);
console.log(`   월정산 학생 차이     : ${diffMonthly}건  ← 실제 청구에 영향을 주는 것`);

// 예상 금액(계획 기반) 공식도 회귀 확인
let expDiff = 0;
for (const s of students) {
    let tm = 0,
        tv = 0,
        tv30 = 0;
    (s.schedule || []).forEach((w) => {
        tm += Number(w.master || 0);
        tv += Number(w.vocal || 0);
        tv30 += Number(w.vocal30 || 0);
    });
    const legacy =
        tm * Number(s.rates?.master || 0) +
        tv * Number(s.rates?.vocal || 0) +
        tv30 * (Number(s.rates?.vocal || 0) * 0.5);
    if (legacy !== calculateTotalAmount(s)) {
        expDiff++;
        console.log(`  예상금액 차이 — ${mask(s.name)}: ${won(legacy)} -> ${won(calculateTotalAmount(s))}`);
    }
}
console.log(`예상 금액식  : ${students.length}명 대조, 금액 차이 ${expDiff}건`);

const ok = diffMonthly === 0 && expDiff === 0;
console.log(
    ok
        ? '\n✅ 실제 청구되는 금액(월정산 학생)은 통일 전후가 동일합니다.\n'
        : '\n⚠ 월정산 학생의 청구 금액이 달라집니다. 위 목록을 확인하세요.\n'
);
process.exit(ok ? 0 : 1);
