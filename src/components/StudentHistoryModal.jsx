import { FaPlus, FaChevronLeft, FaCheckCircle, FaTimesCircle, FaCheck, FaClock } from 'react-icons/fa';
import { formatDateLocal, formatMonthDay, getStartOfWeek } from '../utils/date.js';
import { getBadgeStyle } from '../utils/badgeStyle.js';
import {
    computeRequirement,
    getRotationInfo,
    findRotationStarts,
    resolveAnchorDate,
    rotationBufferDate,
} from '../domain/rotation.js';

/**
 * 학생 한 명의 전체 수업 기록 (풀스크린 오버레이).
 *
 * App.jsx 안에 있던 JSX 를 그대로 옮긴 것이라 본문은 손대지 않았고,
 * 따라서 prop 이름도 원래 변수명을 그대로 쓴다.
 */
export function StudentHistoryModal({
    viewingStudentAtt,
    studentFullHistory,
    viewingStudentHasPayment,
    closeStudentAttView,
    handleRegisterRotation,
    getWeightRemainderSuffix,
}) {
    if (!viewingStudentAtt) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col overflow-hidden animate-fade-in-up">
            {/* 상단 헤더 */}
            <div className="flex-none flex items-center justify-between p-4 md:p-6 border-b border-gray-100 bg-white shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={closeStudentAttView} className="btn btn-circle btn-ghost text-gray-500">
                        <FaChevronLeft className="text-xl" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                            {viewingStudentAtt.name}
                            {getWeightRemainderSuffix(viewingStudentAtt)}{' '}
                            <span className="text-lg font-normal text-gray-400">전체 히스토리 (20주 보기)</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1 flex gap-2">
                            <span>등록일: {viewingStudentAtt.firstDate}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-blue-600">
                                첫 수업일: {studentFullHistory.length > 0 ? studentFullHistory[0].date : '-'}
                            </span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={closeStudentAttView}
                    className="btn btn-sm bg-gray-900 text-white border-none rounded-xl"
                >
                    닫기
                </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
                {(() => {
                    // 1. 데이터 준비
                    let startDateStr = viewingStudentAtt.firstDate || formatDateLocal(new Date());
                    if (studentFullHistory.length > 0) startDateStr = studentFullHistory[0].date;
                    const startMonday = getStartOfWeek(startDateStr);

                    const lastSched = studentFullHistory[studentFullHistory.length - 1];
                    let endDate = new Date();
                    if (lastSched && new Date(lastSched.date) > endDate) endDate = new Date(lastSched.date);
                    endDate.setDate(endDate.getDate() + 28);

                    // 2. 주차 생성
                    const allWeeks = [];
                    let current = new Date(startMonday);
                    let weekCount = 1;
                    while (current <= endDate) {
                        const wStart = new Date(current);
                        const wEnd = new Date(current);
                        wEnd.setDate(wEnd.getDate() + 6);
                        allWeeks.push({
                            id: weekCount,
                            start: wStart,
                            end: wEnd,
                            startStr: formatDateLocal(wStart),
                            endStr: formatDateLocal(wEnd),
                            label: `${wStart.getFullYear().toString().slice(2)}.${String(wStart.getMonth() + 1).padStart(2, '0')}.${String(wStart.getDate()).padStart(2, '0')}`,
                        });
                        current.setDate(current.getDate() + 7);
                        weekCount++;
                    }

                    // 3. 20주 청크
                    const chunkedWeeks = [];
                    for (let i = 0; i < allWeeks.length; i += 20) {
                        chunkedWeeks.push(allWeeks.slice(i, i + 20));
                    }

                    // 4. [로컬 전용] 로테이션 정보 계산 (History 데이터 사용)
                    // studentFullHistory 는 로딩 시점에 date+time 순으로 이미 정렬돼 있다.
                    const getLocalRotationInfo = (targetSchedId) => {
                        const scheds = studentFullHistory.filter(
                            (s) => s.status === 'completed' || s.status === 'absent' || s.id === targetSchedId
                        );
                        return getRotationInfo(scheds, targetSchedId, viewingStudentAtt, {
                            excludeConsult: true,
                            withSubIndex: true,
                        });
                    };

                    // 5. 재등록 버튼 날짜 계산 (로컬 데이터 사용)
                    const calculateLocalStarts = () => {
                        const s = viewingStudentAtt;
                        // 월정산, 아티스트 학생은 재등록 버튼 노출 제외
                        if (s.isMonthly || s.isArtist) return new Set();

                        const { reqM, reqV } = computeRequirement(s);
                        if (reqM === 0 && reqV === 0) return new Set();

                        // 진성 신규 학생(결제·청구 모두 없음)은 첫 수업에 '결제요청' 버튼이 뜨도록
                        // 기준일을 하루 앞당긴다.
                        const isNewNoPayment = viewingStudentHasPayment === false && s.lastDate <= s.firstDate;
                        const anchorDate = resolveAnchorDate(s, isNewNoPayment, formatDateLocal);

                        const bufferDateStr = rotationBufferDate(s.firstDate, formatDateLocal);
                        const scheds = studentFullHistory.filter(
                            (sch) =>
                                sch.date >= bufferDateStr &&
                                (sch.status === 'completed' ||
                                    sch.status === 'absent' ||
                                    sch.status === 'pending' ||
                                    !sch.status)
                        );

                        return findRotationStarts(scheds, { reqM, reqV, anchorDate, student: s });
                    };

                    const localRotationStarts = calculateLocalStarts();

                    return (
                        <div className="flex flex-col gap-6 pb-20">
                            {chunkedWeeks.map((chunk, rowIdx) => (
                                <div
                                    key={rowIdx}
                                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 overflow-x-auto"
                                >
                                    <div className="min-w-max">
                                        {/* 헤더 */}
                                        <div className="flex border-b border-gray-100 pb-3 mb-3">
                                            <div className="w-24 shrink-0 flex items-center justify-center font-extrabold text-gray-300 text-xs border-r border-gray-100 mr-3">
                                                {chunk[0].id}주 ~ {chunk[chunk.length - 1].id}주
                                            </div>
                                            {chunk.map((w) => (
                                                <div key={w.id} className="w-16 md:w-20 shrink-0 text-center">
                                                    <div className="text-[10px] text-gray-400 font-bold mb-0.5">
                                                        {w.id}주차
                                                    </div>
                                                    <div className="text-[11px] text-gray-800 font-extrabold">
                                                        {w.label}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 내용 */}
                                        <div className="flex items-start">
                                            <div className="w-24 shrink-0 border-r border-gray-100 mr-3 flex items-center justify-center self-stretch">
                                                <span className="text-xs font-bold text-gray-400">History</span>
                                            </div>

                                            {chunk.map((w) => {
                                                const weekScheds = studentFullHistory.filter(
                                                    (s) => s.date >= w.startStr && s.date <= w.endStr
                                                );

                                                // [SMART LINK] 이미 보강이 완료된 수업인지 확인하여 원본 날짜의 상태를 보정
                                                // 전체 히스토리에서 "보강" 관련 메모가 있고 완료된 수업을 찾아 원본 날짜 추출
                                                const makeupSourceDates = new Set();
                                                studentFullHistory.forEach((historyItem) => {
                                                    if (
                                                        historyItem.status === 'completed' &&
                                                        historyItem.memo &&
                                                        historyItem.memo.includes('보강')
                                                    ) {
                                                        // 날짜 형식 유연하게 매칭 (2025-12-27, 2025. 12. 27, 띄어쓰기 포함 허용)
                                                        // \d{4} : 연도
                                                        // [-./] : 구분자
                                                        // \s* : 공백 허용
                                                        const match = historyItem.memo.match(
                                                            /(\d{4})\s*[-./]\s*(\d{2})\s*[-./]\s*(\d{2})/
                                                        );
                                                        if (match) {
                                                            // 포맷 정규화 (YYYY-MM-DD)
                                                            const normalizedDate = `${match[1]}-${match[2]}-${match[3]}`;
                                                            makeupSourceDates.add(normalizedDate);
                                                        }
                                                    }
                                                });

                                                const completedM = weekScheds.filter(
                                                    (s) =>
                                                        (s.gridType === 'master' || (!s.gridType && !s.vocalType)) &&
                                                        s.category !== '상담'
                                                );
                                                const completedV = weekScheds.filter(
                                                    (s) => s.gridType === 'vocal' || (!s.gridType && s.vocalType)
                                                );

                                                let uiState = null;
                                                let targetUiDate = '';

                                                for (
                                                    let d = new Date(w.start);
                                                    d <= w.end;
                                                    d.setDate(d.getDate() + 1)
                                                ) {
                                                    const dStr = formatDateLocal(d);
                                                    const isUnpaid = (viewingStudentAtt.unpaidList || []).some(
                                                        (u) => u.targetDate === dStr
                                                    );
                                                    if (isUnpaid) {
                                                        uiState = 'billed';
                                                        targetUiDate = dStr;
                                                        break;
                                                    }
                                                    if (
                                                        viewingStudentAtt.lastDate === dStr &&
                                                        viewingStudentHasPayment !== false
                                                    ) {
                                                        uiState = 'paid';
                                                        targetUiDate = dStr;
                                                        break;
                                                    }
                                                    if (localRotationStarts.has(dStr)) {
                                                        uiState = 'register';
                                                        targetUiDate = dStr;
                                                        break;
                                                    }
                                                }

                                                return (
                                                    <div
                                                        key={w.id}
                                                        className="w-16 md:w-20 shrink-0 flex flex-col items-center min-h-[60px] relative pt-2"
                                                    >
                                                        {uiState === 'paid' && (
                                                            <div className="absolute top-[-9px] z-10">
                                                                <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold border border-green-200 flex items-center gap-0.5">
                                                                    <FaCheckCircle className="text-[7px]" /> 결제
                                                                </span>
                                                            </div>
                                                        )}
                                                        {uiState === 'billed' && (
                                                            <div className="absolute top-[-9px] z-10">
                                                                <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-bold border border-red-200 animate-pulse">
                                                                    청구중
                                                                </span>
                                                            </div>
                                                        )}
                                                        {uiState === 'register' && (
                                                            <div className="absolute top-[-9px] z-10">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRegisterRotation(
                                                                            viewingStudentAtt,
                                                                            targetUiDate
                                                                        );
                                                                    }}
                                                                    className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-md hover:bg-blue-700 flex items-center gap-1"
                                                                >
                                                                    <FaPlus className="text-[7px]" /> 재등록
                                                                </button>
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col gap-1.5 w-full items-center mt-2">
                                                            <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                                                {completedM.length > 0 ? (
                                                                    completedM.map((s, idx) => {
                                                                        const rotationInfo = getLocalRotationInfo(s.id);
                                                                        const dateShort = formatMonthDay(s.date);

                                                                        // [FIX] Smart Link Logic
                                                                        // 1. 이미 다른 날짜에 보강 완료된 경우
                                                                        // 2. 미래 날짜 -> 그대로 두어 회색 유지
                                                                        const isMakeupCompletedElsewhere =
                                                                            makeupSourceDates.has(s.date);

                                                                        // 보강 완료된 날짜이거나, 보강 메모가 있는 Pending이면 'reschedule' 상태로 시각화
                                                                        const showAsReschedule =
                                                                            isMakeupCompletedElsewhere ||
                                                                            (s.status === 'pending' &&
                                                                                s.memo &&
                                                                                s.memo.includes('보강'));
                                                                        const effectiveStatus = showAsReschedule
                                                                            ? 'reschedule'
                                                                            : s.status;

                                                                        let boxClass = getBadgeStyle(
                                                                            'master',
                                                                            s.masterType,
                                                                            rotationInfo.index,
                                                                            effectiveStatus,
                                                                            'history'
                                                                        );

                                                                        let icon = null;
                                                                        let statusColor = 'text-gray-400';

                                                                        if (effectiveStatus === 'completed') {
                                                                            icon = <FaCheck className="text-[9px]" />;
                                                                            statusColor = 'text-green-700';
                                                                        } else if (effectiveStatus === 'absent') {
                                                                            icon = (
                                                                                <FaTimesCircle className="text-[9px]" />
                                                                            );
                                                                            statusColor = 'text-red-600';
                                                                        } else if (effectiveStatus === 'reschedule') {
                                                                            icon = <FaClock className="text-[9px]" />;
                                                                            statusColor = 'text-yellow-700';
                                                                        }

                                                                        // [NEW] 보강 배정됨(reschedule_assigned) 또는 보강 수업(pending)인 경우 회색 점선 처리
                                                                        const isPendingMakeup =
                                                                            s.memo &&
                                                                            s.memo.includes('보강') &&
                                                                            (!s.status || s.status === 'pending');
                                                                        // [NEW] 완료된 보강 수업인 경우 (초록색 점선)
                                                                        const isCompletedMakeup =
                                                                            s.status === 'completed' &&
                                                                            s.memo &&
                                                                            s.memo.includes('보강');
                                                                        // [FIX] Smart Link가 적용된 경우(effectiveStatus === 'reschedule')에는 assigned(회색) 덮어쓰기 방지
                                                                        // [FIX] Smart Link가 적용된 경우(effectiveStatus === 'reschedule')에는 assigned(회색) 덮어쓰기 방지
                                                                        const isAssigned =
                                                                            s.status === 'reschedule_assigned' &&
                                                                            effectiveStatus !== 'reschedule';

                                                                        if (isCompletedMakeup) {
                                                                            boxClass = boxClass
                                                                                .replace(/border-\[?[a-z0-9.]+\]?/g, '')
                                                                                .replace(/border-[a-z]+-\d+/g, '')
                                                                                .replace('border-solid', '');
                                                                            // [FIX] 보강 완료 시 초록 점선 -> 노란 점선으로 변경 (아이콘 색상과 통일)
                                                                            boxClass +=
                                                                                ' border-dashed border-yellow-500 border-[2px] !font-bold';
                                                                        }

                                                                        /*
                                          if (isPendingMakeup) {
                                            // 배정된 보강 (미래/Pending) -> 회색 점선
                                            boxClass = "bg-gray-100 border-dashed border-gray-300 text-gray-400 font-bold opacity-80 shadow-none";
                                            icon = <FaClock className="text-[9px]" />;
                                            statusColor = "text-gray-400";
                                          }
                                          */

                                                                        if (isAssigned) {
                                                                            // 보강 크레딧 (아직 일정 미배정) -> 회색 실선 (구분됨)
                                                                            boxClass =
                                                                                'bg-gray-100 border-solid border-gray-300 text-gray-400 font-bold opacity-80 shadow-none';
                                                                            icon = <FaClock className="text-[9px]" />;
                                                                            statusColor = 'text-gray-400';
                                                                        }

                                                                        return (
                                                                            <div
                                                                                key={idx}
                                                                                className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden shadow-sm ${boxClass}`}
                                                                            >
                                                                                {rotationInfo.label && (
                                                                                    <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">
                                                                                        {rotationInfo.label}
                                                                                    </span>
                                                                                )}
                                                                                <span className={statusColor}>
                                                                                    {icon}
                                                                                </span>
                                                                                <span>{dateShort}</span>
                                                                            </div>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <div className="h-7 w-10"></div>
                                                                )}
                                                            </div>
                                                            <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                                                {completedV.length > 0 ? (
                                                                    completedV.map((s, idx) => {
                                                                        const rotationInfo = getLocalRotationInfo(s.id);
                                                                        const dateShort = formatMonthDay(s.date);

                                                                        // [FIX] Smart Link Logic (Vocal 동일 적용)
                                                                        const isMakeupCompletedElsewhere =
                                                                            makeupSourceDates.has(s.date);

                                                                        const showAsReschedule =
                                                                            isMakeupCompletedElsewhere ||
                                                                            (s.status === 'pending' &&
                                                                                s.memo &&
                                                                                s.memo.includes('보강'));
                                                                        const effectiveStatus = showAsReschedule
                                                                            ? 'reschedule'
                                                                            : s.status;

                                                                        let boxClass = getBadgeStyle(
                                                                            'vocal',
                                                                            s.vocalType,
                                                                            rotationInfo.index,
                                                                            effectiveStatus,
                                                                            'history'
                                                                        );
                                                                        let icon = null;
                                                                        let statusColor = 'text-gray-400';

                                                                        if (effectiveStatus === 'completed') {
                                                                            icon = <FaCheck className="text-[9px]" />;
                                                                            statusColor = 'text-green-600';
                                                                        } else if (effectiveStatus === 'absent') {
                                                                            icon = (
                                                                                <FaTimesCircle className="text-[9px]" />
                                                                            );
                                                                            statusColor = 'text-red-500';
                                                                        } else if (
                                                                            effectiveStatus === 'reschedule' ||
                                                                            effectiveStatus === 'reschedule_assigned'
                                                                        ) {
                                                                            icon = <FaClock className="text-[9px]" />;
                                                                            statusColor = 'text-yellow-600';
                                                                        }

                                                                        // [NEW] 완료된 보강 수업 처리
                                                                        if (
                                                                            s.status === 'completed' &&
                                                                            s.memo &&
                                                                            s.memo.includes('보강')
                                                                        ) {
                                                                            boxClass = boxClass
                                                                                .replace(/border-\[?[a-z0-9.]+\]?/g, '')
                                                                                .replace(/border-[a-z]+-\d+/g, '')
                                                                                .replace('border-solid', '');
                                                                            // [FIX] 보강 완료 시 초록 점선 -> 노란 점선으로 변경 (아이콘 색상과 통일)
                                                                            boxClass +=
                                                                                ' border-dashed border-yellow-500 border-[2px] !font-bold';
                                                                        }

                                                                        return (
                                                                            <div
                                                                                key={idx}
                                                                                className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden shadow-sm ${boxClass}`}
                                                                            >
                                                                                {rotationInfo.label && (
                                                                                    <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">
                                                                                        {rotationInfo.label}
                                                                                    </span>
                                                                                )}
                                                                                <span className={statusColor}>
                                                                                    {icon}
                                                                                </span>
                                                                                <span>{dateShort}</span>
                                                                            </div>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <div className="h-7 w-10"></div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
