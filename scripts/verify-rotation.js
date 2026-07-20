/**
 * 로테이션 계산 통합 검증.
 *
 * 리팩터링 전 App.jsx 에 있던 원본 알고리즘(아래 legacy* 함수)과
 * 새 domain/rotation.js 모듈의 결과를 개발 DB 전체 데이터로 대조한다.
 * 하나라도 다르면 실패로 끝난다.
 *
 * 실행: npm run verify-rotation
 */
import { initDb, PROD_PROJECT_ID } from './lib/common.js';
import {
    computeRequirement,
    getRotationInfo,
    findRotationStarts,
    resolveAnchorDate,
    rotationBufferDate,
    sortByDateTime,
} from '../src/domain/rotation.js';

const { db, projectId } = initDb('key-B.json', 'verify-rot');
if (projectId === PROD_PROJECT_ID) {
    console.error('🛑 운영 프로젝트입니다.');
    process.exit(1);
}

const formatDateLocal = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 리팩터링 전 원본 알고리즘 (App.jsx 에서 그대로 옮김) ──────────────

function legacyRotationStarts(student, attSchedules) {
    let reqM = 0;
    let reqV = 0;
    (student.schedule || []).forEach((w) => {
        reqM += Number(w.master || 0);
        reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });
    if (reqM === 0 && reqV === 0) return new Set();

    let anchorDate = student.firstDate;
    if (student.lastDate && student.lastDate > anchorDate) anchorDate = student.lastDate;
    if (student.unpaidList && student.unpaidList.length > 0) {
        const sortedUnpaid = [...student.unpaidList].sort((a, b) => new Date(b.targetDate) - new Date(a.targetDate));
        if (sortedUnpaid[0].targetDate > anchorDate) anchorDate = sortedUnpaid[0].targetDate;
    }
    const isNewNoPaymentSync =
        student.hasPayment === false || (student.hasPayment === undefined && student.lastDate <= student.firstDate);
    if (isNewNoPaymentSync && (!student.unpaidList || student.unpaidList.length === 0)) {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() - 1);
        anchorDate = formatDateLocal(d);
    }

    const bufferDate = new Date(student.firstDate);
    bufferDate.setDate(bufferDate.getDate() - 7);
    const bufferDateStr = formatDateLocal(bufferDate);

    const allScheds = attSchedules
        .filter(
            (s) =>
                s.studentId === student.id &&
                s.date >= bufferDateStr &&
                (s.status === 'completed' || s.status === 'absent')
        )
        .sort(
            (a, b) =>
                new Date((a.date || '') + 'T' + (a.time || '00:00')) -
                new Date((b.date || '') + 'T' + (b.time || '00:00'))
        );

    const mScheds = [];
    const vScheds = [];
    for (const s of allScheds) {
        if (s.gridType === 'master' || (!s.gridType && !s.vocalType)) {
            mScheds.push({ ...s, _weight: s.masterType === '30' ? 0.5 : 1 });
        } else if (s.gridType === 'vocal' || (!s.gridType && s.vocalType)) {
            vScheds.push({ ...s, _weight: s.vocalType === 'half' ? 0.5 : 1 });
        }
    }

    const startDates = new Set();
    for (let i = 0; i <= 100; i++) {
        let mStartDate = null;
        let vStartDate = null;
        if (reqM > 0) {
            let c = 0;
            let idx = -1;
            for (let j = 0; j < mScheds.length; j++) {
                if (c >= i * reqM) {
                    idx = j;
                    break;
                }
                c += mScheds[j]._weight;
            }
            if (idx !== -1) mStartDate = mScheds[idx].date;
        }
        if (reqV > 0) {
            let c = 0;
            let idx = -1;
            for (let j = 0; j < vScheds.length; j++) {
                if (c >= i * reqV) {
                    idx = j;
                    break;
                }
                c += vScheds[j]._weight;
            }
            if (idx !== -1) vStartDate = vScheds[idx].date;
        }
        let trigger = null;
        if (mStartDate && vStartDate) trigger = mStartDate < vStartDate ? mStartDate : vStartDate;
        else if (mStartDate) trigger = mStartDate;
        else if (vStartDate) trigger = vStartDate;
        if (trigger && trigger > anchorDate) startDates.add(trigger);
    }
    return startDates;
}

function legacyScheduleRotationInfo(student, targetSchedId, attSchedules) {
    if (!student) return { index: -1, label: '' };
    let reqM = 0;
    let reqV = 0;
    (student.schedule || []).forEach((w) => {
        reqM += Number(w.master || 0);
        reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });

    const bufferDate = new Date(student.firstDate);
    bufferDate.setDate(bufferDate.getDate() - 7);
    const bufferDateStr = formatDateLocal(bufferDate);

    const allScheds = attSchedules
        .filter(
            (s) =>
                s.studentId === student.id &&
                s.date >= bufferDateStr &&
                (s.status === 'completed' || s.status === 'absent' || s.id === targetSchedId)
        )
        .sort(
            (a, b) =>
                new Date((a.date || '') + 'T' + (a.time || '00:00')) -
                new Date((b.date || '') + 'T' + (b.time || '00:00'))
        );

    const target = allScheds.find((s) => s.id === targetSchedId);
    if (!target) return { index: -1, label: '' };
    if (target.rotationLabel) return { index: target.rotationIndex ?? -1, label: target.rotationLabel };

    const isTargetMaster = target.gridType === 'master' || (!target.gridType && !target.vocalType);
    let typeScheds = [];
    let limit = 0;
    let currentWeightedCount = 0;

    if (isTargetMaster) {
        if (reqM === 0) return { index: 0, label: 'R1' };
        limit = reqM;
        for (const s of allScheds) {
            if (s.gridType === 'master' || (!s.gridType && !s.vocalType)) {
                typeScheds.push({ ...s, _weight: s.masterType === '30' ? 0.5 : 1 });
            }
        }
    } else {
        if (reqV === 0) return { index: 0, label: 'R1' };
        limit = reqV;
        for (const s of allScheds) {
            if (s.gridType === 'vocal' || (!s.gridType && s.vocalType)) {
                typeScheds.push({ ...s, _weight: s.vocalType === 'half' ? 0.5 : 1 });
            }
        }
    }

    let myWeightedIndex = -1;
    for (let i = 0; i < typeScheds.length; i++) {
        if (typeScheds[i].id === targetSchedId) {
            myWeightedIndex = currentWeightedCount;
            break;
        }
        currentWeightedCount += typeScheds[i]._weight;
    }
    if (myWeightedIndex === -1) return { index: -1, label: '' };
    const rotationIndex = Math.floor(myWeightedIndex / limit);
    return { index: rotationIndex, label: `R${rotationIndex + 1}` };
}

// ── 새 모듈 기반 (App.jsx 에 들어간 것과 동일한 호출 형태) ──────────────

function newRotationStarts(student, attSchedules) {
    const { reqM, reqV } = computeRequirement(student);
    if (reqM === 0 && reqV === 0) return new Set();
    const isNewNoPayment =
        student.hasPayment === false || (student.hasPayment === undefined && student.lastDate <= student.firstDate);
    const anchorDate = resolveAnchorDate(student, isNewNoPayment, formatDateLocal);
    const bufferDateStr = rotationBufferDate(student.firstDate, formatDateLocal);
    const scheds = sortByDateTime(
        attSchedules.filter(
            (s) =>
                s.studentId === student.id &&
                s.date >= bufferDateStr &&
                (s.status === 'completed' || s.status === 'absent')
        )
    );
    return findRotationStarts(scheds, { reqM, reqV, anchorDate });
}

function newScheduleRotationInfo(student, targetSchedId, attSchedules) {
    if (!student) return { index: -1, label: '' };
    const bufferDateStr = rotationBufferDate(student.firstDate, formatDateLocal);
    const scheds = sortByDateTime(
        attSchedules.filter(
            (s) =>
                s.studentId === student.id &&
                s.date >= bufferDateStr &&
                (s.status === 'completed' || s.status === 'absent' || s.id === targetSchedId)
        )
    );
    return getRotationInfo(scheds, targetSchedId, student);
}

// ── 대조 ──────────────────────────────────────────────────────────

const [schedSnap, stuSnap] = await Promise.all([
    db.collection('schedules').get(),
    db.collection('students').get(),
]);
const attSchedules = schedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const students = stuSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`\n대조 대상: 학생 ${students.length}명 / 스케쥴 ${attSchedules.length}건\n`);

let startsChecked = 0;
let startsDiff = 0;
for (const st of students) {
    const a = [...legacyRotationStarts(st, attSchedules)].sort();
    const b = [...newRotationStarts(st, attSchedules)].sort();
    startsChecked++;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        startsDiff++;
        console.log(`  ✖ 재등록 시작일 불일치 — 학생 ${st.id}`);
        console.log(`     기존: ${a.join(', ')}`);
        console.log(`     신규: ${b.join(', ')}`);
    }
}
console.log(`재등록 시작일: ${startsChecked}명 대조, 불일치 ${startsDiff}건`);

const stuById = new Map(students.map((s) => [s.id, s]));
let infoChecked = 0;
let infoDiff = 0;
for (const sch of attSchedules) {
    const st = stuById.get(sch.studentId);
    if (!st) continue;
    const a = legacyScheduleRotationInfo(st, sch.id, attSchedules);
    const b = newScheduleRotationInfo(st, sch.id, attSchedules);
    infoChecked++;
    if (a.index !== b.index || a.label !== b.label) {
        infoDiff++;
        if (infoDiff <= 10) {
            console.log(`  ✖ 로테이션 정보 불일치 — 스케쥴 ${sch.id} (${sch.date} ${sch.time})`);
            console.log(`     기존: ${JSON.stringify(a)}  신규: ${JSON.stringify(b)}`);
        }
    }
}
console.log(`로테이션 라벨: ${infoChecked}건 대조, 불일치 ${infoDiff}건`);

// ── 개인 전체 출석부(로컬) 사본 대조 ────────────────────────────────

function legacyLocalRotationInfo(student, targetSchedId, fullHistory) {
    let reqM = 0,
        reqV = 0;
    (student.schedule || []).forEach((w) => {
        reqM += Number(w.master || 0);
        reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });
    const allCompleted = fullHistory.filter(
        (s) => s.status === 'completed' || s.status === 'absent' || s.id === targetSchedId
    );
    const target = allCompleted.find((s) => s.id === targetSchedId);
    if (!target) return { index: -1, label: '' };
    if (target.rotationLabel) {
        let idx = target.rotationIndex;
        if (idx === undefined || idx === null || idx === -1) {
            const m = target.rotationLabel.match(/R(\d+)/);
            if (m) idx = parseInt(m[1]) - 1;
        }
        return { index: idx ?? -1, label: target.rotationLabel };
    }
    const isTargetMaster = target.gridType === 'master' || (!target.gridType && !target.vocalType);
    let limit = 0;
    if (isTargetMaster) {
        if (reqM === 0) return { index: 0, label: 'R1' };
        limit = reqM;
    } else {
        if (reqV === 0) return { index: 0, label: 'R1' };
        limit = reqV;
    }
    const typeScheds = [];
    for (const s of allCompleted) {
        const isV = s.gridType === 'vocal' || (!s.gridType && s.vocalType);
        const isM = (s.gridType === 'master' || (!s.gridType && !s.vocalType)) && s.category !== '상담';
        if (isTargetMaster && isM) typeScheds.push({ ...s, _weight: s.masterType === '30' ? 0.5 : 1 });
        else if (!isTargetMaster && isV) typeScheds.push({ ...s, _weight: s.vocalType === 'half' ? 0.5 : 1 });
    }
    let c = 0;
    let myIdx = -1;
    for (const s of typeScheds) {
        if (s.id === targetSchedId) {
            myIdx = c;
            break;
        }
        c += s._weight;
    }
    if (myIdx === -1) return { index: -1, label: '' };
    const index = Math.floor(myIdx / limit);
    return { index, label: `R${index + 1}-${Math.floor(myIdx % limit) + 1}` };
}

function legacyLocalStarts(s, fullHistory, hasPayment) {
    if (s.isMonthly || s.isArtist) return new Set();
    let reqM = 0,
        reqV = 0;
    (s.schedule || []).forEach((w) => {
        reqM += Number(w.master || 0);
        reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });
    if (reqM === 0 && reqV === 0) return new Set();

    let anchorDate = s.firstDate;
    if (s.lastDate && s.lastDate > anchorDate) anchorDate = s.lastDate;
    if (s.unpaidList && s.unpaidList.length > 0) {
        const su = [...s.unpaidList].sort((a, b) => new Date(b.targetDate) - new Date(a.targetDate));
        if (su[0].targetDate > anchorDate) anchorDate = su[0].targetDate;
    }
    if (hasPayment === false && (!s.unpaidList || s.unpaidList.length === 0) && s.lastDate <= s.firstDate) {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() - 1);
        anchorDate = formatDateLocal(d);
    }

    const bufferDate = new Date(s.firstDate);
    bufferDate.setDate(bufferDate.getDate() - 7);
    const bufferDateStr = formatDateLocal(bufferDate);

    const validScheds = fullHistory.filter(
        (sch) =>
            sch.date >= bufferDateStr &&
            (sch.status === 'completed' || sch.status === 'absent' || sch.status === 'pending' || !sch.status)
    );

    const mScheds = [];
    const vScheds = [];
    for (const sch of validScheds) {
        if (sch.gridType === 'master' || !sch.gridType) mScheds.push({ ...sch, _weight: sch.masterType === '30' ? 0.5 : 1 });
        else if (sch.gridType === 'vocal') vScheds.push({ ...sch, _weight: sch.vocalType === 'half' ? 0.5 : 1 });
    }

    const starts = new Set();
    for (let i = 0; i <= 100; i++) {
        let mDate = null,
            vDate = null;
        if (reqM > 0) {
            let c = 0,
                idx = -1;
            for (let j = 0; j < mScheds.length; j++) {
                if (c >= i * reqM) {
                    idx = j;
                    break;
                }
                c += mScheds[j]._weight;
            }
            if (idx !== -1) mDate = mScheds[idx].date;
        }
        if (reqV > 0) {
            let c = 0,
                idx = -1;
            for (let j = 0; j < vScheds.length; j++) {
                if (c >= i * reqV) {
                    idx = j;
                    break;
                }
                c += vScheds[j]._weight;
            }
            if (idx !== -1) vDate = vScheds[idx].date;
        }
        let trigger = null;
        if (mDate && vDate) trigger = mDate < vDate ? mDate : vDate;
        else if (mDate) trigger = mDate;
        else if (vDate) trigger = vDate;
        if (trigger && trigger > anchorDate) starts.add(trigger);
    }
    return starts;
}

// 각 학생의 결제 유무 (viewingStudentHasPayment 상태와 동일한 값)
const hasPaymentByStu = new Map();
await Promise.all(
    students.map(async (st) => {
        const snap = await db.collection('students').doc(st.id).collection('payments').limit(1).get();
        hasPaymentByStu.set(st.id, !snap.empty);
    })
);

let localInfoChecked = 0;
let localInfoDiff = 0;
let localStartsDiff = 0;

for (const st of students) {
    // studentFullHistory 와 동일하게: 해당 학생 전체 기록을 date+time 순 정렬
    const fullHistory = sortByDateTime(attSchedules.filter((s) => s.studentId === st.id));

    const a = [...legacyLocalStarts(st, fullHistory, hasPaymentByStu.get(st.id))].sort();
    const b = [
        ...(() => {
            if (st.isMonthly || st.isArtist) return new Set();
            const { reqM, reqV } = computeRequirement(st);
            if (reqM === 0 && reqV === 0) return new Set();
            const isNewNoPayment = hasPaymentByStu.get(st.id) === false && st.lastDate <= st.firstDate;
            const anchorDate = resolveAnchorDate(st, isNewNoPayment, formatDateLocal);
            const bufferDateStr = rotationBufferDate(st.firstDate, formatDateLocal);
            const scheds = fullHistory.filter(
                (sch) =>
                    sch.date >= bufferDateStr &&
                    (sch.status === 'completed' ||
                        sch.status === 'absent' ||
                        sch.status === 'pending' ||
                        !sch.status)
            );
            return findRotationStarts(scheds, { reqM, reqV, anchorDate });
        })(),
    ].sort();

    if (JSON.stringify(a) !== JSON.stringify(b)) {
        localStartsDiff++;
        console.log(`  ✖ 개인화면 재등록일 불일치 — 학생 ${st.id}`);
        console.log(`     기존: ${a.join(', ')}`);
        console.log(`     신규: ${b.join(', ')}`);
    }

    for (const sch of fullHistory) {
        const x = legacyLocalRotationInfo(st, sch.id, fullHistory);
        const scheds = fullHistory.filter(
            (s) => s.status === 'completed' || s.status === 'absent' || s.id === sch.id
        );
        const y = getRotationInfo(scheds, sch.id, st, { excludeConsult: true, withSubIndex: true });
        localInfoChecked++;
        if (x.index !== y.index || x.label !== y.label) {
            localInfoDiff++;
            if (localInfoDiff <= 10) {
                console.log(`  ✖ 개인화면 라벨 불일치 — ${sch.id} (${sch.date} ${sch.time})`);
                console.log(`     기존: ${JSON.stringify(x)}  신규: ${JSON.stringify(y)}`);
            }
        }
    }
}
console.log(`개인화면 재등록일: ${students.length}명 대조, 불일치 ${localStartsDiff}건`);
console.log(`개인화면 라벨: ${localInfoChecked}건 대조, 불일치 ${localInfoDiff}건`);

const ok = startsDiff === 0 && infoDiff === 0 && localStartsDiff === 0 && localInfoDiff === 0;
console.log(ok ? '\n✅ 통합 전후 결과가 완전히 동일합니다.\n' : '\n⚠ 차이가 발견되었습니다.\n');
process.exit(ok ? 0 : 1);
