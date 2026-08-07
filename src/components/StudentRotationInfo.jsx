import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateLocal } from '../utils/date.js';
import { ROTATION_COLORS } from '../constants/theme.js';
import {
    computeRequirement,
    sortByDateTime,
    splitByType,
    isMasterSched,
    isVocalSched,
    rotationBufferDate,
    resolveAnchorDate,
    findRotationStarts,
    cycleCells,
    hasScheduleTimeline,
    assignCyclesTimeline,
} from '../domain/rotation.js';

/**
 * 스케쥴 팝업 상단에 뜨는 학생 요약 박스.
 *
 * - 일반 학생: 마스터/보컬 각각 '현재 진행 중인 사이클'을 칸으로 시각화 +
 *   최종 결제일 + 이 수업 날짜가 재등록(결제) 시점인지.
 * - 월정산 학생: 이번 달 진행 횟수만.
 * - 아티스트 학생: 누적 횟수(count)만.
 *
 * 로테이션 회차 계산에는 학생의 '전체 완료 이력'이 필요한데 스케쥴 탭에는
 * 그 데이터가 없다. 그래서 팝업이 열릴 때 이 학생의 스케쥴만 한 번 조회한다.
 * (studentId 단일 필드 쿼리 → 색인 자동 생성. 로컬 캐시로 재방문은 저렴)
 *
 * @param student   학생 객체 (students 에서 찾아 넘김). 없으면 아무것도 안 그림
 * @param slotDate  클릭한 수업의 날짜 'YYYY-MM-DD' — 재등록 시점 판단 기준
 * @param slotId    클릭한 수업의 문서 id (기존 수업이면 있음, 신규 슬롯이면 없음)
 * @param onNameClick  학생 이름 클릭 시 호출 (sid, sname) — 학생관리로 이동용
 */
export function StudentRotationInfo({ student, slotDate, slotId, onNameClick }) {
    const [scheds, setScheds] = useState(null); // null=로딩중, []=없음
    const [lastPaymentDate, setLastPaymentDate] = useState(null); // 실제 결제일(카드 긁은 날)

    useEffect(() => {
        if (!student?.id) {
            setScheds(null);
            setLastPaymentDate(null);
            return;
        }
        let alive = true;
        setScheds(null);
        setLastPaymentDate(null);
        (async () => {
            try {
                // 스케쥴(로테이션용)과 결제내역(실제 결제일용)을 함께 가져온다.
                const [schedSnap, paySnap] = await Promise.all([
                    getDocs(query(collection(db, 'schedules'), where('studentId', '==', student.id))),
                    getDocs(collection(db, 'students', student.id, 'payments')),
                ]);
                if (!alive) return;
                setScheds(schedSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

                // 실제 카드 긁은 날 = 결제내역의 paymentDate 중 가장 늦은 날
                const dates = paySnap.docs
                    .map((d) => d.data().paymentDate)
                    .filter(Boolean)
                    .sort();
                setLastPaymentDate(dates.length ? dates[dates.length - 1] : null);
            } catch (e) {
                console.error('로테이션 정보 로딩 실패:', e);
                if (alive) setScheds([]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [student?.id]);

    if (!student) return null;

    // ── 월정산: 이번 달(=클릭한 수업의 달) 진행 횟수만 ──────────────
    if (student.isMonthly) {
        const ym = (slotDate || '').slice(0, 7);
        const cnt =
            scheds === null
                ? null
                : scheds.filter(
                      (s) =>
                          (s.date || '').startsWith(ym) &&
                          (s.status === 'completed' || s.status === 'absent') &&
                          s.category !== '상담'
                  ).length;
        return (
            <Box>
                <div className="flex items-center justify-between">
                    <NameButton student={student} onNameClick={onNameClick} />
                    <span className="text-xs font-bold text-blue-600">월정산</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                    이번 달 진행 <b className="text-gray-900">{cnt === null ? '…' : cnt}회</b>
                </div>
            </Box>
        );
    }

    // ── 아티스트: 누적 횟수(count)만 ──────────────────────────────
    if (student.isArtist) {
        return (
            <Box>
                <div className="flex items-center justify-between">
                    <NameButton student={student} onNameClick={onNameClick} />
                    <span className="text-xs font-bold text-purple-600">아티스트</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                    누적 <b className="text-gray-900">{parseInt(student.count || '0', 10)}회</b>
                </div>
            </Box>
        );
    }

    // ── 일반 학생: 사이클 시각화 ──────────────────────────────────
    const { reqM, reqV } = computeRequirement(student);

    if (scheds === null) {
        return (
            <Box>
                <span className="text-sm text-gray-400">로테이션 정보 불러오는 중…</span>
            </Box>
        );
    }

    // 클릭한 수업이 어느 사이클/칸인지 보여주려면 '완료 + 클릭한 본인'을
    // 시간순으로 세워야 한다. 클릭한 수업은 아직 예정(pending)일 수 있으므로
    // 완료 목록에 없으면 여기서 합쳐 넣는다.
    const clicked = slotId ? scheds.find((s) => s.id === slotId) : null;
    const doneBase = scheds.filter((s) => s.status === 'completed' || s.status === 'absent');
    const withClicked = clicked && !doneBase.some((s) => s.id === clicked.id) ? [...doneBase, clicked] : doneBase;
    const timeline = sortByDateTime(withClicked);
    const { mScheds, vScheds } = splitByType(timeline);

    // 클릭한 수업이 마스터인지 보컬인지에 따라 그 줄의 '이 수업' 칸이 정해진다.
    // 클릭한 수업이 없으면(신규 슬롯 등) 각 종류의 마지막 수업을 기준으로 잡는다.
    const masterAnchorId = clicked && isMasterSched(clicked) ? clicked.id : mScheds[mScheds.length - 1]?.id;
    const vocalAnchorId = clicked && isVocalSched(clicked) ? clicked.id : vScheds[vScheds.length - 1]?.id;

    // 로테이션 중간 변경 학생은 마·보 동기화 배정표로 회차를 매긴다 (구간 경계 반영).
    const timelineAssign = hasScheduleTimeline(student) ? assignCyclesTimeline(mScheds, vScheds, student) : null;
    const masterCycle = cycleCells(mScheds, masterAnchorId, reqM, timelineAssign?.mPerLesson);
    const vocalCycle = cycleCells(vScheds, vocalAnchorId, reqV, timelineAssign?.vPerLesson);

    // 이 수업 날짜가 재등록(결제) 시점인지 — 출석부 재등록 버튼과 같은 기준(B)
    const isNewNoPayment =
        student.hasPayment === false || (student.hasPayment === undefined && student.lastDate <= student.firstDate);
    const anchorDate = resolveAnchorDate(student, isNewNoPayment, formatDateLocal);
    const bufferDateStr = rotationBufferDate(student.firstDate, formatDateLocal);
    const rotationScheds = sortByDateTime(
        scheds.filter(
            (s) =>
                s.date >= bufferDateStr &&
                (s.status === 'completed' || s.status === 'absent' || s.status === 'pending' || !s.status)
        )
    );
    const startDates = findRotationStarts(rotationScheds, { reqM, reqV, anchorDate, student });
    const isPaymentDay = !!slotDate && startDates.has(slotDate);

    const unpaidCount = (student.unpaidList || []).length;

    return (
        <Box>
            <div className="flex items-center justify-between">
                <NameButton student={student} onNameClick={onNameClick} />
                <span className="text-[11px] text-gray-400">
                    4주 기준 {reqM > 0 && `마스터 ${reqM}회`}
                    {reqM > 0 && reqV > 0 && ' · '}
                    {reqV > 0 && `보컬 ${reqV}회`}
                </span>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
                {masterCycle && <CycleRow label="마스터" cycle={masterCycle} />}
                {vocalCycle && <CycleRow label="보컬" cycle={vocalCycle} />}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                <span className="text-xs text-gray-500">
                    최종결제일 <b className="text-gray-700">{student.lastDate || '-'}</b>
                    {(lastPaymentDate || unpaidCount > 0) && (
                        <span className="text-gray-400">
                            {' ('}
                            {lastPaymentDate && `${lastPaymentDate} 결제`}
                            {lastPaymentDate && unpaidCount > 0 && ' · '}
                            {unpaidCount > 0 && <span className="font-bold text-red-500">{unpaidCount}건 미결제</span>}
                            {')'}
                        </span>
                    )}
                </span>
                {isPaymentDay && (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                        💰 재등록 시점
                    </span>
                )}
            </div>
        </Box>
    );
}

/**
 * 한 종류의 사이클을 칸으로 그린다.
 *   done    : 로테이션 색으로 채움
 *   current : 진한 테두리 + 빈 속 (지금 클릭한 이 수업, 아직 예정)
 *   future  : 회색 점선 빈칸
 */
function CycleRow({ label, cycle }) {
    // 회차별 색. Tailwind 동적 클래스는 못 잡히므로 hex 를 인라인 스타일로 쓴다.
    const colors = ROTATION_COLORS[cycle.cycleIndex % ROTATION_COLORS.length];
    const doneCount = cycle.cells.filter((c) => c === 'done').length;
    return (
        <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-bold text-gray-500">{label}</span>
            <span className="w-8 shrink-0 text-[11px] font-bold text-gray-400">{cycle.label}</span>
            <div className="flex gap-1">
                {cycle.cells.map((state, i) => {
                    const base = 'h-5 w-5 rounded-[6px]';
                    if (state === 'done') {
                        return (
                            <div
                                key={i}
                                className={base}
                                style={{ backgroundColor: colors.m_hex, border: `1px solid ${colors.m_hex}` }}
                                title="완료"
                            />
                        );
                    }
                    if (state === 'current') {
                        // 지금 클릭한 이 수업: 진한 테두리 + 빈 속
                        return (
                            <div
                                key={i}
                                className={`${base} bg-white`}
                                style={{ border: `2.5px solid ${colors.m_hex}` }}
                                title="이 수업"
                            />
                        );
                    }
                    return (
                        <div
                            key={i}
                            className={`${base} border border-dashed border-gray-300 bg-gray-50`}
                            title="예정"
                        />
                    );
                })}
            </div>
            <span className="text-[11px] text-gray-400">
                {doneCount}/{cycle.req}
            </span>
        </div>
    );
}

function Box({ children }) {
    return <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">{children}</div>;
}

/** 학생 이름. onClick 이 있으면 클릭 가능한 링크처럼 보인다. */
function NameButton({ student, onNameClick }) {
    if (!onNameClick) {
        return <NameButton student={student} onNameClick={onNameClick} />;
    }
    return (
        <button
            type="button"
            onClick={() => onNameClick(student.id, student.name)}
            className="font-bold text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-black hover:decoration-gray-500"
            title="학생관리에서 열기"
        >
            {student.name}
        </button>
    );
}
