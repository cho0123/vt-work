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

/** 한 종류의 '진행 중인 사이클' 을 다른 종류가 그대로 이어받는다. (아래 설명 참고) */
function handoverCycle(from, to) {
    to.cycleIndex = from.cycleIndex;
    to.filled = from.filled;
    to.size = from.size;
    from.filled = 0;
    from.size = 0;
}

/**
 * 한 종류를 한 구간 범위에서 배정한다. 진행 상태(st)는 구간을 넘어 이어진다.
 * st = { cycleIndex, filled, size } — size 는 그 사이클이 '시작될 때' 의 요구 횟수다.
 */
function runSegment(list, from, to, req, perLesson, cycleStart, st) {
    let i = from;
    while (i < list.length && (to === null || list[i].date < to)) {
        const s = list[i];
        if (st.filled === 0) {
            st.size = req; // 사이클 크기는 시작 시점 설정으로 고정한다
            cycleStart[st.cycleIndex] = s.date;
        }
        perLesson.set(s.id, { cycleIndex: st.cycleIndex, posInCycle: st.filled, size: st.size });
        st.filled += s._weight;
        if (st.size > 0 && st.filled >= st.size) {
            st.filled -= st.size;
            st.cycleIndex++;
            // 이월분(half 등)이 있으면 이 수업이 다음 사이클에도 걸치므로 이 날짜가 시작.
            // 딱 떨어지게 끝났으면 다음 사이클 시작은 '실제 다음 수업'이 와야 정해진다.
            // (임시값을 남기면 다음 수업 등록 전에 마지막 수업에 재등록이 잘못 뜬다 — 전영림 사례)
            if (st.filled > 0) {
                st.size = req;
                cycleStart[st.cycleIndex] = s.date;
            } else {
                st.size = 0;
            }
        }
        i++;
    }
    return i;
}

/**
 * 시점별 이력(scheduleHistory) 학생의 사이클 배정 — 마스터·보컬을 함께 배정한다.
 *
 * 구간(from ~ 다음 from 전)마다 그 구간의 설정으로 각 타입을 배정하되, 경계에서 이렇게 한다.
 *
 * 1) **진행 중이던 사이클은 닫지 않는다.** 정해진 횟수(시작 시점 설정)를 채운 뒤에 끝난다.
 *    설정을 사이클 한가운데에서 바꾸면 그 사이클이 거기서 끝나 **4회짜리가 3회 만에 청구**됐다
 *    (이종민 2026-09/10 사례). 사이클은 번호도 횟수도 그대로 이어간다.
 * 2) 더 이상 안 하는 종류에 진행 중인 사이클이 남아 있으면 **이제 하는 종류가 이어받는다**
 *    (마스터 3회 하다 보컬로 바꾸면 → 보컬 1회로 그 사이클을 채운다 = 마스터3+보컬1 = 한 사이클).
 * 3) 진행 중이 아닌(filled 0) 종류만 '둘 중 더 많이 진행된 번호' 로 맞춘다.
 *    안 그러면 한 타입만 쉬는 구간에서 번호가 어긋난다 — 전영림: 보컬만 하는 구간(R15)이
 *    끝나고 마스터가 재개되자, 마스터는 자기 기준 15번째라 이미 지난 R15를 또 썼다.
 *
 * @returns { mPerLesson, vPerLesson: Map(id -> {cycleIndex, posInCycle, size}), mCycleStart, vCycleStart: string[] }
 */
export function assignCyclesTimeline(mScheds, vScheds, student) {
    const hist = student.scheduleHistory;
    const mPerLesson = new Map();
    const vPerLesson = new Map();
    const mCycleStart = [];
    const vCycleStart = [];
    const M = { cycleIndex: 0, filled: 0, size: 0 };
    const V = { cycleIndex: 0, filled: 0, size: 0 };
    let mi = 0;
    let vi = 0;

    for (let seg = 0; seg < hist.length; seg++) {
        const to = seg + 1 < hist.length ? hist[seg + 1].from : null; // null = 끝까지
        const { reqM, reqV } = computeRequirementOf(hist[seg].schedule);

        // (2) 안 하는 종류의 진행 중 사이클을 하는 종류가 이어받는다.
        if (reqM === 0 && M.filled > 0 && reqV > 0 && V.filled === 0) handoverCycle(M, V);
        else if (reqV === 0 && V.filled > 0 && reqM > 0 && M.filled === 0) handoverCycle(V, M);
        // (3) 쉬고 있던(진행 중이 아닌) 종류만 번호를 맞춘다.
        const sync = Math.max(M.cycleIndex, V.cycleIndex);
        if (M.filled === 0) M.cycleIndex = sync;
        if (V.filled === 0) V.cycleIndex = sync;

        mi = runSegment(mScheds, mi, to, reqM, mPerLesson, mCycleStart, M);
        vi = runSegment(vScheds, vi, to, reqV, vPerLesson, vCycleStart, V);
    }
    return { mPerLesson, vPerLesson, mCycleStart, vCycleStart };
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

    // 시점별 설정 이력이 있으면 구간별 요구치 + 마·보 동기화 번호로 사이클을 센다.
    if (hasScheduleTimeline(student)) {
        const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });
        const { mPerLesson, vPerLesson } = assignCyclesTimeline(mScheds, vScheds, student);
        const info = (isTargetMaster ? mPerLesson : vPerLesson).get(targetSchedId);
        if (!info) return { index: 0, label: 'R1' };
        const reqAt = reqAtFactory(student, isTargetMaster);
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

    // 시점별 이력이 있으면 구간별 요구치 + 마·보 동기화 번호로 사이클 시작일을 구한다.
    if (student && hasScheduleTimeline(student)) {
        const { mScheds, vScheds } = splitByType(scheds, { excludeConsult });
        const { mCycleStart: mStarts, vCycleStart: vStarts } = assignCyclesTimeline(mScheds, vScheds, student);
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
 * 이력 없는(설정이 한 벌인) 학생의 사이클 배정표 — **표시 전용**.
 * 규칙은 `getRotationInfo` 의 기존 경로와 같다: 가중치를 누적해 `req` 로 나눈다
 * (하프 0.5 · 보컬30 1.0 · 마스터30 0.5 — 상단 표 참고).
 *
 * ⚠️ 회차 계산 자체는 `getRotationInfo` 가 한다. 이 함수는 **칸 그림**을 그리려고
 *    '사이클 안에서 어디쯤인지(posInCycle)' 까지 필요해서 따로 둔 것이고,
 *    두 결과가 어긋나지 않는지는 `npm run verify-cycle-cells` 로 전수 대조한다.
 *
 * @returns Map(id -> { cycleIndex, posInCycle })
 */
export function assignCyclesConstant(typeScheds, req) {
    const map = new Map();
    if (!req || req <= 0) return map;
    let weighted = 0;
    for (const s of typeScheds) {
        map.set(s.id, { cycleIndex: Math.floor(weighted / req), posInCycle: weighted % req });
        weighted += s._weight;
    }
    return map;
}

/**
 * 팝업의 사이클 진행 칸 — **표시 전용**.
 *
 * 칸 하나 = 수업 1회. **하프는 반 칸**이다(하프 2개 = 1회 — 상단 표).
 * ⚠️ 예전에는 수업을 '개수' 로 세어 하프도 한 칸을 차지했다. 그래서 하프가 섞인 학생은
 *    회차 번호(R)와 n/4 가 둘 다 실제 회차보다 앞서 갔다(백대현 보컬: 팝업 R4, 실제 R3).
 *    이제 `getRotationInfo` 와 **같은 가중치 기준**으로 센다.
 *
 * @returns { req, cycleIndex, label, done, current, cells }
 *   cells[i] = { done, current } — 그 칸에서 완료·결석이 채운 비율 / 지금 누른 수업이 채운 비율(0~1)
 *   done    = 그 사이클에서 완료·결석이 채운 횟수(소수 가능)
 */
export function cycleCells(typeScheds, currentId, req, perLesson = null) {
    if (!req || req <= 0) return null;

    const assign = perLesson && perLesson.has(currentId) ? perLesson : assignCyclesConstant(typeScheds, req);
    const me = assign.get(currentId);
    if (!me) return null;
    const { cycleIndex } = me;

    const cells = Array.from({ length: req }, () => ({ done: 0, current: 0 }));
    let done = 0;
    for (const s of typeScheds) {
        const info = assign.get(s.id);
        if (!info || info.cycleIndex !== cycleIndex) continue;
        const isDone = s.status === 'completed' || s.status === 'absent';
        const isCurrent = s.id === currentId && !isDone;
        if (!isDone && !isCurrent) continue; // 아직 안 한 다른 수업은 빈칸으로 둔다

        // 이 수업이 차지하는 구간 [시작, 끝) 을 칸에 나눠 담는다.
        // (하프 뒤에 60분이 오면 한 수업이 두 칸에 걸칠 수 있다)
        const start = info.posInCycle;
        const end = Math.min(req, start + (s._weight ?? 1));
        for (let i = 0; i < req; i++) {
            const overlap = Math.min(end, i + 1) - Math.max(start, i);
            if (overlap > 0) cells[i][isDone ? 'done' : 'current'] += overlap;
        }
        if (isDone) done += Math.min(s._weight ?? 1, req - start);
    }

    return {
        req,
        cycleIndex,
        label: `R${cycleIndex + 1}`,
        done: Math.round(done * 10) / 10,
        current: Math.round(cells.reduce((a, c) => a + c.current, 0) * 10) / 10,
        cells,
    };
}
