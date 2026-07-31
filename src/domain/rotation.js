// 로테이션(수강 회차) 계산.
//
// 학생마다 4주 사이클의 주차별 수업 횟수(master / vocal / vocal30)가 정해져 있고,
// 완료된 수업을 시간순으로 누적해 "몇 번째 사이클인지"를 구한다.
// 이 값이 출석부의 R1, R2... 라벨과 배지 색상, 그리고 재등록 시점 판정에 쓰인다.
//
// ── 가중치 규칙 ──────────────────────────────────────────────
//   master 60분        1.0
//   master 30분        0.5
//   vocal  60분        1.0
//   vocal  30분('30')  1.0   ← 독립된 30분 수업이므로 온전한 1회
//   vocal  half        0.5   ← 1시간을 둘로 쪼갠 것이므로 0.5회
//
// 이 파일이 만들어지기 전에는 같은 계산이 App.jsx 안에 5벌 복붙돼 있었고,
// 그중 저장 시점 사본만 vocal을 무조건 1로 계산해 표시 로직과 어긋나 있었다.
// (그 사본은 필요한 Firestore 복합 색인이 없어 한 번도 성공한 적이 없었고,
//  사용자 결정에 따라 제거했다.)

const CONSULT_CATEGORY = '상담';

/** 4주 설정 배열에서 사이클당 필요 횟수를 합산한다. vocal30 은 vocal 쪽에 포함. */
export function computeRequirementOf(schedule) {
    let reqM = 0;
    let reqV = 0;
    (schedule || []).forEach((w) => {
        reqM += Number(w.master || 0);
        reqV += Number(w.vocal || 0) + Number(w.vocal30 || 0);
    });
    return { reqM, reqV };
}

/** 학생의 '현재' 4주 설정에서 사이클당 필요 횟수. (기존 호출부 호환 — 항상 최신 설정) */
export function computeRequirement(student) {
    return computeRequirementOf(student?.schedule);
}

// ── 시점별 설정 이력(scheduleHistory) ─────────────────────────────
// student.scheduleHistory = [{ from: 'YYYY-MM-DD', schedule: [4주] }, ...] (from 오름차순).
// 예: [{from:'2025-01-03', schedule:M2+V4}, {from:'2026-07-10', schedule:V4}]
// 없거나 1구간이면 기존과 동일하게 student.schedule 하나로 본다(기존 학생 100% 동일).

/** 시점별 이력이 실제로 있는지(2구간 이상). 이게 false면 로테이션 계산은 기존 코드 경로를 탄다. */
export function hasScheduleTimeline(student) {
    return Array.isArray(student?.scheduleHistory) && student.scheduleHistory.length >= 2;
}

/** 특정 날짜에 적용되는 4주 설정. from <= 날짜 중 가장 늦은 구간. 이력 없으면 현재 설정. */
export function scheduleForDate(student, dateStr) {
    const hist = student?.scheduleHistory;
    if (!Array.isArray(hist) || hist.length === 0) return student?.schedule || [];
    let chosen = hist[0];
    for (const h of hist) {
        if (h.from && h.from <= dateStr) chosen = h;
        else break; // from 오름차순이라 한 번 넘어가면 이후는 다 뒤 날짜
    }
    return chosen.schedule || [];
}

/** (dateStr) → 그 날짜 사이클의 요구 횟수(마스터 또는 보컬). */
function reqAtFactory(student, isMaster) {
    return (dateStr) => {
        const { reqM, reqV } = computeRequirementOf(scheduleForDate(student, dateStr));
        return isMaster ? reqM : reqV;
    };
}

/**
 * 한 종류(M or V)의 수업들을 사이클로 나눈다. reqAt(dateStr) 로 사이클마다 요구치를 읽는다.
 * 요구치가 일정하면 기존 상수 공식(floor(누적/req))과 결과가 동일하도록 나머지를 이월(carry)한다.
 * @returns { perLesson: Map(id -> {cycleIndex, posInCycle}), cycleStart: string[] }
 */
function assignCycles(typeScheds, reqAt) {
    const perLesson = new Map();
    const cycleStart = [];
    let cycleIndex = 0;
    let filled = 0;
    let cycleReq = null;
    for (const s of typeScheds) {
        if (filled === 0) {
            cycleReq = reqAt(s.date);
            cycleStart[cycleIndex] = s.date;
        }
        perLesson.set(s.id, { cycleIndex, posInCycle: filled });
        filled += s._weight;
        if (cycleReq > 0 && filled >= cycleReq) {
            filled -= cycleReq;
            cycleIndex++;
            // 이월분(half 등)이 있으면 이 수업이 다음 사이클에도 걸치므로 이 날짜가 시작.
            // 딱 떨어지게 끝났으면 다음 사이클 시작은 '실제 다음 수업'이 와야 정해진다.
            // (예전엔 이 날짜를 임시로 넣고 다음 수업이 덮어쓰게 했는데, 다음 수업이 아직
            //  등록 전이면 임시값이 남아 사이클 '마지막' 수업에 재등록이 잘못 떴다 — 전영림 사례)
            if (filled > 0) cycleStart[cycleIndex] = s.date;
            cycleReq = reqAt(s.date);
        }
    }
    return { perLesson, cycleStart };
}

/**
 * 마스터 수업인지 판정.
 * gridType 이 없는 옛 문서는 vocalType 유무로 갈라본다.
 * @param excludeConsult 개인 일정 '상담'을 제외할지 (개인 전체기록 화면에서만 true)
 */
export function isMasterSched(s, excludeConsult = false) {
    const isM = s.gridType === 'master' || (!s.gridType && !s.vocalType);
    return excludeConsult ? isM && s.category !== CONSULT_CATEGORY : isM;
}

/** 보컬 수업인지 판정. */
export function isVocalSched(s) {
    return s.gridType === 'vocal' || (!s.gridType && s.vocalType);
}

/** 수업 한 건의 가중치. 상단 표 참고. */
export function weightOf(s, isMaster) {
    if (isMaster) return s.masterType === '30' ? 0.5 : 1;
    return s.vocalType === 'half' ? 0.5 : 1;
}

/**
 * 시간순 정렬된 수업 목록을 M/V 로 나누고 각각에 _weight 를 붙인다.
 * ※ scheds 는 이미 date+time 오름차순으로 정렬돼 있어야 한다.
 */
export function splitByType(scheds, { excludeConsult = false } = {}) {
    const mScheds = [];
    const vScheds = [];
    for (const s of scheds) {
        if (isMasterSched(s, excludeConsult)) {
            mScheds.push({ ...s, _weight: weightOf(s, true) });
        } else if (isVocalSched(s)) {
            vScheds.push({ ...s, _weight: weightOf(s, false) });
        }
    }
    return { mScheds, vScheds };
}

/**
 * 특정 수업이 몇 번째 로테이션에 속하는지 구한다.
 *
 * @param scheds          시간순 정렬된 해당 학생의 수업 목록 (완료/결석 + 대상 본인)
 * @param targetSchedId   찾을 수업의 id
 * @param student         학생 객체 (사이클당 필요 횟수 산출용)
 * @param excludeConsult  '상담' 제외 여부
 * @param withSubIndex    라벨을 'R2-3' 처럼 사이클 내 순번까지 표기할지
 * @returns { index, label }  못 찾으면 { index: -1, label: '' }
 */
export function getRotationInfo(scheds, targetSchedId, student, { excludeConsult = false, withSubIndex = false } = {}) {
    if (!student) return { index: -1, label: '' };

    const target = scheds.find((s) => s.id === targetSchedId);
    if (!target) return { index: -1, label: '' };

    // 문서에 로테이션 값이 저장돼 있으면 그것을 우선 사용한다.
    // 현재는 저장하는 경로가 없어 항상 건너뛰지만, 나중에 '박제' 기능을
    // 다시 넣을 때 이 분기만 살아나면 되도록 남겨둔다.
    if (target.rotationLabel) {
        let idx = target.rotationIndex;
        if (idx === undefined || idx === null || idx === -1) {
            const match = target.rotationLabel.match(/R(\d+)/);
            if (match) idx = parseInt(match[1]) - 1;
        }
        return { index: idx ?? -1, label: target.rotationLabel };
    }

    const isTargetMaster = isMasterSched(target);

    // 시점별 설정 이력이 있으면 각 수업 날짜의 요구치로 사이클을 센다.
    if (hasScheduleTimeline(student)) {
        const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });
        const typeScheds = isTargetMaster ? mScheds : vScheds;
        const reqAt = reqAtFactory(student, isTargetMaster);
        const { perLesson } = assignCycles(typeScheds, reqAt);
        const info = perLesson.get(targetSchedId);
        if (!info) return { index: 0, label: 'R1' };
        const cycleReq = reqAt(target.date);
        const sub = cycleReq > 0 ? Math.floor(info.posInCycle % cycleReq) + 1 : Math.floor(info.posInCycle) + 1;
        const label = withSubIndex ? `R${info.cycleIndex + 1}-${sub}` : `R${info.cycleIndex + 1}`;
        return { index: info.cycleIndex, label };
    }

    // === 이력 없는 기존 학생: 기존 로직 그대로 (현재 설정 하나로 상수 req) ===
    const { reqM, reqV } = computeRequirement(student);
    const limit = isTargetMaster ? reqM : reqV;

    // 해당 종류의 수업이 설정상 0회면 비교 기준이 없으므로 첫 사이클로 본다.
    if (limit === 0) return { index: 0, label: 'R1' };

    const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });
    const typeScheds = isTargetMaster ? mScheds : vScheds;

    let weighted = 0;
    let myWeightedIndex = -1;
    for (const s of typeScheds) {
        if (s.id === targetSchedId) {
            myWeightedIndex = weighted;
            break;
        }
        weighted += s._weight;
    }
    if (myWeightedIndex === -1) return { index: -1, label: '' };

    const index = Math.floor(myWeightedIndex / limit);
    const label = withSubIndex ? `R${index + 1}-${Math.floor(myWeightedIndex % limit) + 1}` : `R${index + 1}`;

    return { index, label };
}

/**
 * 각 로테이션 사이클이 시작되는 날짜들을 구한다. (재등록 버튼 표시 시점)
 * M 과 V 중 '먼저' 시작하는 쪽을 그 사이클의 시작으로 본다.
 *
 * @param scheds         시간순 정렬된 수업 목록
 * @param reqM, reqV     사이클당 필요 횟수
 * @param anchorDate     이 날짜보다 뒤인 시작일만 채택 (마지막 결제/청구 기준일)
 * @returns Set<'YYYY-MM-DD'>
 */
export function findRotationStarts(scheds, { reqM, reqV, anchorDate, excludeConsult = false, student = null }) {
    const startDates = new Set();

    // 시점별 이력이 있으면 날짜별 요구치로 사이클 시작일을 구한다.
    if (student && hasScheduleTimeline(student)) {
        const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });
        const { cycleStart: mStarts } = assignCycles(mScheds, reqAtFactory(student, true));
        const { cycleStart: vStarts } = assignCycles(vScheds, reqAtFactory(student, false));
        const n = Math.max(mStarts.length, vStarts.length);
        for (let i = 0; i <= n; i++) {
            const mS = mStarts[i];
            const vS = vStarts[i];
            let trigger = null;
            if (mS && vS) trigger = mS < vS ? mS : vS;
            else if (mS) trigger = mS;
            else if (vS) trigger = vS;
            if (trigger && trigger > anchorDate) startDates.add(trigger);
        }
        return startDates;
    }

    // === 이력 없는 기존 학생: 기존 로직 그대로 ===
    if (reqM === 0 && reqV === 0) return startDates;

    const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });

    // 사이클 i 의 시작 수업을 찾는다. 가중 누적이 i*req 에 도달하는 첫 수업.
    const nthCycleStart = (list, req, i) => {
        if (req <= 0) return null;
        let weighted = 0;
        for (const s of list) {
            if (weighted >= i * req) return s.date;
            weighted += s._weight;
        }
        return null;
    };

    // 100 사이클이면 현실적인 상한을 충분히 넘는다.
    for (let i = 0; i <= 100; i++) {
        const mStart = nthCycleStart(mScheds, reqM, i);
        const vStart = nthCycleStart(vScheds, reqV, i);

        let trigger = null;
        if (mStart && vStart) trigger = mStart < vStart ? mStart : vStart;
        else if (mStart) trigger = mStart;
        else if (vStart) trigger = vStart;

        if (trigger && trigger > anchorDate) startDates.add(trigger);
    }

    return startDates;
}

/**
 * 재등록 판정의 기준일.
 * 최초 등록일 / 마지막 결제일 / 최신 미수금 예정일 중 가장 늦은 날.
 * 결제 이력이 전혀 없는 신규 학생은 하루 앞당겨, 첫 수업에 재등록 버튼이 뜨게 한다.
 *
 * @param isNewNoPayment 진성 신규(결제·청구 모두 없음) 여부
 * @param formatDate     Date -> 'YYYY-MM-DD' 변환 함수
 */
export function resolveAnchorDate(student, isNewNoPayment, formatDate) {
    let anchorDate = student.firstDate;
    if (student.lastDate && student.lastDate > anchorDate) anchorDate = student.lastDate;

    if (student.unpaidList && student.unpaidList.length > 0) {
        const sortedUnpaid = [...student.unpaidList].sort((a, b) => new Date(b.targetDate) - new Date(a.targetDate));
        if (sortedUnpaid[0].targetDate > anchorDate) anchorDate = sortedUnpaid[0].targetDate;
    }

    if (isNewNoPayment && (!student.unpaidList || student.unpaidList.length === 0)) {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() - 1);
        anchorDate = formatDate(d);
    }

    return anchorDate;
}

/** 최초 등록일 7일 전. 등록일보다 조금 일찍 시작한 수업도 로테이션에 포함하기 위한 여유분. */
export function rotationBufferDate(firstDate, formatDate, days = 7) {
    const d = new Date(firstDate);
    d.setDate(d.getDate() - days);
    return formatDate(d);
}

/** date + time 오름차순 정렬 (원본 배열을 바꾸지 않는다) */
export function sortByDateTime(scheds) {
    return [...scheds].sort(
        (a, b) =>
            new Date((a.date || '') + 'T' + (a.time || '00:00')) - new Date((b.date || '') + 'T' + (b.time || '00:00'))
    );
}

/**
 * 클릭한 수업이 속한 사이클을, 칸 단위로 상태를 매겨 돌려준다.
 *
 * 스케쥴 팝업의 로테이션 시각화에 쓴다. 클릭한 수업을 기준으로,
 * 그 수업이 속한 사이클(req칸)의 각 칸이 어떤 상태인지 알려준다.
 *   - 'done'    : 완료(+결석)된 수업
 *   - 'current' : 지금 클릭한 이 수업 (아직 예정이면 강조만, 완료면 done)
 *   - 'future'  : 아직 안 온 예정 수업
 *
 * 계산: 그 종류의 수업(완료 + 클릭한 본인)을 시간순으로 세워 클릭한 수업의
 * 전역 순번(globalIndex)을 구하고, req 로 나눠 사이클과 칸 위치를 얻는다.
 *
 * @param typeScheds     그 종류(마스터 or 보컬)의 수업 목록. 시간순 정렬,
 *                       완료·결석 + 클릭한 수업(pending 이어도)이 포함돼 있어야 함.
 * @param currentId      클릭한 수업의 id
 * @param req            사이클당 요구 횟수
 * @returns { req, cycleIndex, label, cells: string[] }  또는 null
 *          cells[i] ∈ 'done' | 'current' | 'future'
 */
export function cycleCells(typeScheds, currentId, req) {
    if (!req || req <= 0) return null;

    const globalIndex = typeScheds.findIndex((s) => s.id === currentId);
    if (globalIndex === -1) return null;

    const cycleIndex = Math.floor(globalIndex / req);
    const posInCycle = globalIndex % req; // 이 사이클 안에서 클릭한 수업의 칸 위치

    const cells = [];
    for (let i = 0; i < req; i++) {
        const sched = typeScheds[cycleIndex * req + i];
        if (i === posInCycle) {
            // 클릭한 수업 칸: 이미 완료됐으면 done, 아니면 current(강조)
            const st = sched?.status;
            cells.push(st === 'completed' || st === 'absent' ? 'done' : 'current');
        } else if (sched && (sched.status === 'completed' || sched.status === 'absent')) {
            cells.push('done');
        } else {
            cells.push('future');
        }
    }

    return { req, cycleIndex, label: `R${cycleIndex + 1}`, cells };
}
