import { useMemo, useState } from 'react';
import {
    FaPlus,
    FaChevronLeft,
    FaChevronRight,
    FaCheckCircle,
    FaTimesCircle,
    FaStickyNote,
    FaRedoAlt,
    FaClock,
} from 'react-icons/fa';
import { MemoInput } from './MemoInput.jsx';
import { formatDateLocal, getStartOfWeek } from '../utils/date.js';
import { getBadgeStyle } from '../utils/badgeStyle.js';
import { fixedScheduleOccursOn } from '../domain/fixedRecurrence.js';
import { bulkCompleteTargets } from '../domain/bulkComplete.js';

/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
export function ScheduleTab({
    scheduleDate,
    setScheduleDate,
    handleScheduleYearChange,
    handleScheduleMonthChange,
    handleScheduleWeekChange,
    weekDays,
    weeksInMonth,
    hours,
    schedules,
    fixedSchedules,
    scheduleCancellations,
    getGhostSchedules,
    handleSlotClick,
    handleBulkCompleteDay,
    todosByDate,
    weeklyMemo,
    handleWeeklyMemoSave,
}) {
    // 취소 내역을 매 칸마다 전체 훑지 않도록, 렌더당 한 번만 조회용 Set 으로 만든다.
    // 키: `날짜|시간|학생ID|그리드종류` — 아래 필터의 비교 조건과 동일하다.
    // [FIX] gridType 추가: 개인일정(쌤·짱구)은 studentId 가 없어, 같은 시간대의 마스터·보컬이
    //       구분되지 않아 하나를 취소하면 둘 다 숨던 버그를 막는다. (옛 기록엔 gridType 이 없어 매칭 안 됨 → 재취소 필요)
    const cancelledKeys = useMemo(
        () => new Set(scheduleCancellations.map((c) => `${c.date}|${c.time}|${c.studentId}|${c.gridType || ''}`)),
        [scheduleCancellations]
    );

    // 짱구 ToDo 팝업으로 볼 날짜 (null = 닫힘)
    const [todoPopupDate, setTodoPopupDate] = useState(null);
    const todoMap = todosByDate || {};

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 gap-4">
            {/* 날짜 선택 및 메모 영역 (고정) */}
            <div className="flex-none flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    {/* [수정됨] 날짜 선택 컨트롤 영역 */}
                    <div className="flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-100">
                        {/* 년도: 작고 옅은 회색 pill (드롭다운 배경이 비치지 않도록 불투명 bg) */}
                        <select
                            className="cursor-pointer rounded-lg bg-gray-50 py-1.5 pl-2.5 pr-1 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200"
                            value={scheduleDate.getFullYear()}
                            onChange={handleScheduleYearChange}
                        >
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                                <option key={y} value={y} style={{ backgroundColor: '#ffffff', color: '#374151' }}>
                                    {y}년
                                </option>
                            ))}
                        </select>

                        {/* 월: 색깔 배지 버튼 (화살표 없는 깔끔한 pill) */}
                        <select
                            className="cursor-pointer appearance-none rounded-full bg-orange-500 px-4 py-1.5 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-200"
                            value={scheduleDate.getMonth() + 1}
                            onChange={handleScheduleMonthChange}
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <option key={m} value={m} style={{ backgroundColor: '#ffffff', color: '#374151' }}>
                                    {m}월
                                </option>
                            ))}
                        </select>

                        <div className="mx-1 h-5 w-px bg-gray-200"></div>

                        {/* 주차: 화살표로 감싼 깔끔한 라벨 */}
                        <button
                            className="grid h-8 w-8 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            aria-label="이전 주"
                            onClick={() => {
                                const d = new Date(scheduleDate);
                                d.setDate(d.getDate() - 7);
                                setScheduleDate(d);
                            }}
                        >
                            <FaChevronLeft className="text-xs" />
                        </button>

                        <select
                            className="cursor-pointer appearance-none rounded-lg bg-gray-50 px-3 py-1.5 text-center text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200"
                            onChange={handleScheduleWeekChange}
                            value={formatDateLocal(getStartOfWeek(scheduleDate))}
                        >
                            {weeksInMonth.map((w, i) => (
                                <option
                                    key={i}
                                    value={formatDateLocal(w.start)}
                                    style={{ backgroundColor: '#ffffff', color: '#374151' }}
                                >
                                    {i + 1}주차 · {w.start.getMonth() + 1}.{w.start.getDate()}–{w.end.getMonth() + 1}.
                                    {w.end.getDate()}
                                </option>
                            ))}
                        </select>

                        <button
                            className="grid h-8 w-8 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            aria-label="다음 주"
                            onClick={() => {
                                const d = new Date(scheduleDate);
                                d.setDate(d.getDate() + 7);
                                setScheduleDate(d);
                            }}
                        >
                            <FaChevronRight className="text-xs" />
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setScheduleDate(new Date())}
                            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-700 active:scale-95"
                        >
                            오늘
                        </button>
                    </div>
                </div>

                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                    {/* ... (메모 영역은 그대로 유지) ... */}

                    <MemoInput
                        value={weeklyMemo}
                        onSave={handleWeeklyMemoSave}
                        placeholder="이번 주 특이사항..."
                        label="주간 메모"
                        icon={<FaStickyNote className="text-blue-500 text-base" />}
                    />
                </div>
            </div>

            {/* 스케쥴 표 영역 (헤더 고정 + 바디 스크롤) */}
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                {/* 스크롤 가능 영역 */}
                <div className="flex-1 overflow-y-auto">
                    {/* 1. 요일 헤더 (sticky로 고정) */}
                    <div className="sticky top-0 grid grid-cols-8 border-b border-gray-100 bg-gray-50 z-10">
                        <div className="p-4 text-center text-xs font-bold text-gray-400 border-r border-gray-100">
                            Time
                        </div>
                        {weekDays.map((d, i) => {
                            const dateStr = formatDateLocal(d);
                            const isToday = dateStr === formatDateLocal(new Date());
                            // 오늘 이전(지난 요일)에만 일괄 완료 버튼을 띄운다.
                            const isPastDay = dateStr < formatDateLocal(new Date());
                            // 미처리 수업이 하나도 없으면 버튼을 비활성화한다.
                            // 판정은 실제 완료 처리와 같은 함수를 쓴다(조건이 어긋나지 않도록).
                            const pendingCount = isPastDay ? bulkCompleteTargets(schedules, dateStr).length : 0;
                            const dayTodos = todoMap[dateStr] || []; // 짱구 ToDo 그 날 할일
                            const dayColor =
                                d.getDay() === 0
                                    ? 'text-red-500'
                                    : d.getDay() === 6
                                      ? 'text-blue-500'
                                      : 'text-gray-700';

                            return (
                                <div
                                    key={i}
                                    className={`text-center py-3 px-2 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-orange-50 rounded-lg shadow-md' : dayTodos.length ? 'bg-indigo-50/50' : ''}`}
                                >
                                    <div className="text-xs text-gray-400">
                                        {['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}
                                    </div>
                                    <div className={`text-lg font-extrabold ${dayColor}`}>{d.getDate()}</div>
                                    {dayTodos.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTodoPopupDate(dateStr);
                                            }}
                                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600 transition-colors hover:bg-indigo-200"
                                            title="이 날 짱구 ToDo 할일 보기"
                                        >
                                            📋 {dayTodos.length}
                                        </button>
                                    )}
                                    {isPastDay && handleBulkCompleteDay && (
                                        <button
                                            type="button"
                                            disabled={pendingCount === 0}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleBulkCompleteDay(dateStr);
                                            }}
                                            className={`mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold shadow-sm transition-all ${
                                                pendingCount === 0
                                                    ? 'cursor-not-allowed bg-gray-100 text-gray-300 shadow-none'
                                                    : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
                                            }`}
                                            title={
                                                pendingCount === 0
                                                    ? '이 날은 미처리 수업이 없습니다'
                                                    : `이 날의 미처리 학생 수업 ${pendingCount}건을 한꺼번에 완료 처리`
                                            }
                                        >
                                            <FaCheckCircle className="text-[9px]" />
                                            <span>일괄완료</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 2. 시간표 바디 */}
                    {(() => {
                        const ghostsMaster = getGhostSchedules('master');
                        const ghostsVocal = getGhostSchedules('vocal');

                        return hours.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-gray-100 min-h-[80px]">
                                <div className="p-2 text-center text-xs font-bold text-gray-400 border-r border-gray-100 flex flex-col justify-between items-center py-2">
                                    <span>{`PM ${hour > 12 ? hour - 12 : hour}`}</span>
                                </div>
                                {weekDays.map((day, i) => {
                                    const dateStr = formatDateLocal(day);
                                    const dayOfWeek = day.getDay();

                                    const getScheduleItems = (gType) => {
                                        const ghosts = gType === 'master' ? ghostsMaster : ghostsVocal;

                                        // 실제 스케줄 가져오기 (Helper)
                                        const getRealItems = (tStr) => {
                                            const matchStr = `${tStr}`;
                                            const normal = schedules.filter(
                                                (s) =>
                                                    s.date === dateStr &&
                                                    s.time === matchStr &&
                                                    (s.gridType || 'master') === gType
                                            );
                                            const fixed = fixedSchedules.filter(
                                                (s) =>
                                                    fixedScheduleOccursOn(s, day) &&
                                                    s.time === matchStr &&
                                                    (s.gridType || 'master') === gType &&
                                                    (!s.fixedStartDate || s.fixedStartDate <= dateStr) &&
                                                    (!s.fixedEndDate || s.fixedEndDate >= dateStr) &&
                                                    // [NEW] 취소 내역 확인 (날짜 + 시간 + 학생ID + 그리드종류)
                                                    !cancelledKeys.has(
                                                        `${dateStr}|${matchStr}|${s.studentId}|${s.gridType || 'master'}`
                                                    )
                                            );
                                            const merged = [...normal];
                                            fixed.forEach((f) => {
                                                if (!merged.some((n) => n.time === f.time)) merged.push(f);
                                            });
                                            return merged;
                                        };

                                        // [NEW] 정시/30분이 아닌 세밀한 시간(개인일정 등)도 이 시간대(hour) 칸에 함께 표시
                                        const getExtraItems = () => {
                                            const inHour = (t) => {
                                                const [h, m] = (t || '').split(':');
                                                return Number(h) === hour && m !== '00' && m !== '30';
                                            };
                                            const normal = schedules.filter(
                                                (s) =>
                                                    s.date === dateStr &&
                                                    (s.gridType || 'master') === gType &&
                                                    inHour(s.time)
                                            );
                                            const fixed = fixedSchedules.filter(
                                                (s) =>
                                                    fixedScheduleOccursOn(s, day) &&
                                                    (s.gridType || 'master') === gType &&
                                                    inHour(s.time) &&
                                                    (!s.fixedStartDate || s.fixedStartDate <= dateStr) &&
                                                    (!s.fixedEndDate || s.fixedEndDate >= dateStr) &&
                                                    // 취소 내역 확인 (날짜 + 시간 + 학생ID + 그리드종류) — 위 getRealItems 와 같은 키
                                                    !cancelledKeys.has(
                                                        `${dateStr}|${s.time}|${s.studentId}|${s.gridType || 'master'}`
                                                    )
                                            );
                                            const merged = [...normal];
                                            fixed.forEach((f) => {
                                                if (!merged.some((n) => n.time === f.time)) merged.push(f);
                                            });
                                            return merged;
                                        };

                                        const real00 = getRealItems(`${hour}:00`);
                                        const real30 = getRealItems(`${hour}:30`);
                                        const realExtra = getExtraItems();
                                        const hasReal = real00.length > 0 || real30.length > 0 || realExtra.length > 0;

                                        // 시간순 정렬 (예: 5:00 → 5:20 → 5:30)
                                        let items = [...real00, ...real30, ...realExtra].sort((a, b) =>
                                            (a.time || '').localeCompare(b.time || '')
                                        );

                                        // [수정] 해당 시간대(Hour)에 실제 스케줄이 하나라도 있으면 예정(Ghost)은 표시하지 않음
                                        if (!hasReal) {
                                            const now = new Date();
                                            const filterValidGhost = (g) => {
                                                const gTime = new Date(`${g.date}T${g.time}:00`);
                                                return gTime > now;
                                            };

                                            const ghost00 = ghosts
                                                .filter((g) => g.date === dateStr && g.time === `${hour}:00`)
                                                .filter(filterValidGhost);
                                            const ghost30 = ghosts
                                                .filter((g) => g.date === dateStr && g.time === `${hour}:30`)
                                                .filter(filterValidGhost);
                                            items.push(...ghost00, ...ghost30);
                                        }

                                        return items;
                                    };

                                    const masterItems = getScheduleItems('master');
                                    const vocalItems = getScheduleItems('vocal');

                                    const renderItems = (items, gType) =>
                                        items.length > 0 ? (
                                            items.map((item, idx) => {
                                                let statusStyle = '';
                                                let statusIcon = null;
                                                const isVocal = gType === 'vocal';

                                                const [itemHour, itemMinute] = item.time.split(':');
                                                const targetDateTime = new Date(
                                                    `${item.date}T${itemHour.padStart(2, '0')}:${itemMinute}:00`
                                                );
                                                const isPast = new Date() > targetDateTime;

                                                // [NEW] Class Type 식별 (vocalType or masterType)
                                                const classType = isVocal ? item.vocalType : item.masterType;
                                                const strType = String(classType);
                                                // [NEW] Split Class 여부 (Master 30 or Vocal Half) -> 배지 스타일 적용 대상
                                                // Vocal 30(단독)도 배지 스타일을 쓰지만 Solid. 여기서는 "2톤/배지 로직이 필요한 특수" 케이스 판단용으로 쓰임?
                                                // 원래 코드 로직: is30m이면 getBadgeStyle 사용.
                                                // 이제 Vocal Half도 getBadgeStyle을 사용해야 함.
                                                // 하지만 Standard Class(60m)는 getBadgeStyle을 안 쓰고 hardcoded color를 썼음 (Completed의 경우).
                                                // Fixed logic: Special handling for 30/Half.
                                                const isSplitOr30 = strType === '30' || strType === 'half';

                                                if (item.isGhost) {
                                                    statusStyle =
                                                        'bg-gray-100 text-gray-400 border-dashed border-gray-200 opacity-60';
                                                } else if (item.status === 'completed') {
                                                    // 완료: 쌤(어두운 회색), 짱구(중간 회색) - 농도 상향
                                                    if (isSplitOr30) {
                                                        // 30m(단독) or Half(반갈죽) -> BadgeStyle 호출 (Two-Tone or Badge Color)
                                                        // Vocal 30 -> Solid Badge. Vocal Half -> Two-Tone. Master 30 -> Two-Tone.
                                                        const badgeClass = getBadgeStyle(
                                                            isVocal ? 'vocal' : 'master',
                                                            strType,
                                                            -1,
                                                            item.status
                                                        );
                                                        statusStyle = `${badgeClass} border-solid`;
                                                    } else {
                                                        statusStyle = isVocal
                                                            ? 'bg-gray-300 text-gray-700 border-gray-400'
                                                            : 'bg-gray-800 text-white border-black';
                                                    }
                                                    statusIcon = (
                                                        <FaCheckCircle className="text-[9px] text-green-400" />
                                                    );
                                                } else if (
                                                    item.status === 'reschedule' ||
                                                    item.status === 'reschedule_assigned'
                                                ) {
                                                    // 보강: 농도를 50에서 100으로 상향
                                                    statusStyle =
                                                        'bg-gray-100 text-gray-600 border-dashed border-gray-300';
                                                    statusIcon = <FaClock className="text-[9px] text-gray-400" />;
                                                } else if (item.status === 'absent') {
                                                    statusStyle = isVocal
                                                        ? 'bg-red-100 text-red-700 border-red-200'
                                                        : 'bg-red-200 text-red-900 border-red-400 ring-1 ring-red-300';
                                                    statusIcon = <FaTimesCircle className="text-[9px]" />;
                                                } else {
                                                    // 일반 상태 (레슨, 상담 등) - 짱구 스케쥴 농도 전체 상향
                                                    if (item.isFixed) {
                                                        statusStyle = isVocal
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : 'bg-purple-100 text-purple-950 border-purple-400';
                                                    } else if (item.category === '상담') {
                                                        statusStyle = isVocal
                                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                            : 'bg-emerald-200 text-emerald-950 border-emerald-400';
                                                    } else if (item.category === '레슨') {
                                                        // 로테이션 회차는 넘기지 않는다.
                                                        // getBadgeStyle 은 ctx 가 'history'/'dashboard' 일 때만
                                                        // 회차 색을 쓰고, 여기(스케쥴 화면)는 기본값 'calendar' 라
                                                        // 회차 값을 받아도 쓰지 않는다. 예전에는 수업 하나를 그릴
                                                        // 때마다 전체 스케쥴을 훑어 회차를 구한 뒤 그대로 버렸다.
                                                        // (배정 시 남은 횟수 계산은 별개 함수라 영향 없음)
                                                        const badgeClass = getBadgeStyle(
                                                            isVocal ? 'vocal' : 'master',
                                                            strType,
                                                            undefined,
                                                            item.status
                                                        );

                                                        statusStyle = `${badgeClass} border-solid font-black`;
                                                    } else {
                                                        statusStyle = isVocal
                                                            ? 'bg-gray-100 text-gray-700 border-blue-300'
                                                            : 'bg-gray-100 text-gray-700 border-orange-400';
                                                    }
                                                }

                                                return (
                                                    <div
                                                        key={idx}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSlotClick(
                                                                dateStr,
                                                                String(itemHour),
                                                                item.dayOfWeek,
                                                                item,
                                                                gType
                                                            );
                                                        }}
                                                        className={`w-full rounded-md p-1 text-[12px] flex items-center gap-1 shadow-sm border overflow-hidden shrink-0 transition-all ${statusStyle}`}
                                                    >
                                                        {itemMinute !== '00' && (
                                                            <span
                                                                className={`px-1 rounded text-[10px] font-bold shrink-0 ${
                                                                    item.status === 'completed'
                                                                        ? 'bg-black/10'
                                                                        : 'bg-pink-100 text-pink-600'
                                                                }`}
                                                            >
                                                                {itemMinute}
                                                            </span>
                                                        )}

                                                        {item.isFixed && (
                                                            <FaRedoAlt className="text-[7px] min-w-fit opacity-70" />
                                                        )}
                                                        {statusIcon}

                                                        <span className="truncate font-bold">
                                                            {item.category === '기타' && item.memo ? (
                                                                item.memo
                                                            ) : (
                                                                <>
                                                                    {item.studentName || item.category}
                                                                    {item.isVocalProgress && (
                                                                        <span
                                                                            className={`${item.vocalType === '30' ? 'text-green-600' : 'text-pink-600'} ml-1 font-extrabold`}
                                                                        >
                                                                            V
                                                                        </span>
                                                                    )}
                                                                    {/* [NEW] V30 수업 아이콘 표시 */}
                                                                    {isVocal && String(item.vocalType) === '30' && (
                                                                        <FaClock className="text-blue-600 ml-1 inline text-[10px]" />
                                                                    )}
                                                                    {!item.isGhost &&
                                                                        item.memo &&
                                                                        (item.memo === '추가수업' ? (
                                                                            <FaPlus className="text-gray-600 ml-1 inline text-[10px]" />
                                                                        ) : (
                                                                            <span className="font-normal opacity-70 ml-1">
                                                                                ({item.memo})
                                                                            </span>
                                                                        ))}
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <FaPlus className="text-gray-300 text-xs" />
                                            </div>
                                        );
                                    return (
                                        <div
                                            key={i}
                                            className="border-r border-gray-100 last:border-none p-0 flex flex-col h-full"
                                        >
                                            {/* Master 영역 (흰색 유지) */}
                                            <div
                                                className="flex-auto min-h-[40px] bg-white p-1 flex flex-col gap-1 cursor-pointer relative group hover:bg-gray-50 transition-colors border-b border-gray-100"
                                                onClick={() =>
                                                    handleSlotClick(dateStr, String(hour), dayOfWeek, null, 'master')
                                                }
                                            >
                                                {renderItems(masterItems, 'master')}
                                            </div>

                                            {/* Vocal 영역 (수정됨: 회색 -> 연초록색) */}
                                            {/* 기존: bg-gray-50 ... hover:bg-gray-200 */}
                                            {/* 변경: bg-green-50 ... hover:bg-green-100 */}
                                            <div
                                                className="flex-auto min-h-[40px] bg-green-50 p-1 flex flex-col gap-1 cursor-pointer relative group hover:bg-green-100 transition-colors"
                                                onClick={() =>
                                                    handleSlotClick(dateStr, String(hour), dayOfWeek, null, 'vocal')
                                                }
                                            >
                                                {renderItems(vocalItems, 'vocal')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ));
                    })()}
                </div>
            </div>

            {/* 짱구 ToDo — 그 날 할일 팝업 (읽기 전용) */}
            {todoPopupDate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setTodoPopupDate(null)}
                >
                    <div
                        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-extrabold text-gray-800">📋 {todoPopupDate} 할일</h3>
                            <button
                                onClick={() => setTodoPopupDate(null)}
                                className="grid h-7 w-7 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        <ul className="space-y-2">
                            {(todoMap[todoPopupDate] || []).map((t, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="mt-0.5 text-indigo-400">•</span>
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4 text-[11px] text-gray-400">짱구 ToDo에서 가져온 내용 (보기 전용)</div>
                    </div>
                </div>
            )}
        </div>
    );
}
