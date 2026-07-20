import {
    FaPlus,
    FaChevronLeft,
    FaChevronRight,
    FaExclamationCircle,
    FaCheckCircle,
    FaTimesCircle,
    FaFileInvoiceDollar,
    FaCheck,
    FaClock,
    FaLock,
    FaLockOpen,
} from 'react-icons/fa';
import {
    formatDateLocal,
    formatMonthDay,
    getStartOfWeek,
    getRotationWeek,
    get12Weeks,
    getMonthWeeksForView,
    shiftMonth,
} from '../utils/date.js';
import { formatCurrency } from '../utils/money.js';
import { getBadgeStyle } from '../utils/badgeStyle.js';

/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
export function AttendanceTab({
    activeTab,
    attViewMode,
    setAttViewMode,
    attCategory,
    setAttCategory,
    attBaseDate,
    setAttBaseDate,
    attMonth,
    setAttMonth,
    handleAttYearChange,
    attSchedules,
    periodAttendance,
    isAttendanceLocked,
    setIsAttendanceLocked,
    students,
    settlementIncome,
    calculateRotationStarts,
    getScheduleRotationInfo,
    getWeightRemainderSuffix,
    handlePeriodAttendanceToggle,
    handleRegisterRotation,
    handleMonthlySettlementRequest,
}) {
    if (!activeTab) return null;

    return (
        // [수정] pb-20 추가
        <div className="flex flex-col gap-4 h-full p-4 md:p-8 lg:px-12 pb-20 overflow-y-auto">
            {/* 상단 컨트롤 */}
            <div className="flex-none flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                {/* 보기 모드 토글 + 초기화 로직 추가 */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => {
                            setAttViewMode('12weeks');
                            setAttCategory('basic'); // 12주 보기 기본값
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold ${attViewMode === '12weeks' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                    >
                        12주 보기
                    </button>
                    <button
                        onClick={() => {
                            setAttViewMode('month');
                            setAttCategory('all'); // 월별 보기 기본값 (모든수강생)
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold ${attViewMode === 'month' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                    >
                        월별 보기
                    </button>
                </div>

                {/* 모드에 따른 탭 구성 변경 */}
                {attViewMode === '12weeks' ? (
                    <div className="tabs tabs-boxed bg-gray-100 p-1 rounded-full">
                        <a
                            className={`tab rounded-full ${attCategory === 'basic' ? 'tab-active bg-black text-white' : ''}`}
                            onClick={() => setAttCategory('basic')}
                        >
                            기본 수강생
                        </a>
                        <a
                            className={`tab rounded-full ${attCategory === 'monthly' ? 'tab-active bg-blue-600 text-white' : ''}`}
                            onClick={() => setAttCategory('monthly')}
                        >
                            월정산
                        </a>
                        <a
                            className={`tab rounded-full ${attCategory === 'artist' ? 'tab-active bg-purple-600 text-white' : ''}`}
                            onClick={() => setAttCategory('artist')}
                        >
                            아티스트
                        </a>
                        <a
                            className={`tab rounded-full ${attCategory === 'inactive' ? 'tab-active bg-gray-500 text-white' : ''}`}
                            onClick={() => setAttCategory('inactive')}
                        >
                            비활성
                        </a>
                    </div>
                ) : (
                    /* 월별 보기일 때: 날짜 네비게이션 + [모든수강생/월정산] 탭 */
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl">
                            <button
                                onClick={() => setAttMonth(shiftMonth(attMonth, -1))}
                                className="btn btn-xs btn-circle btn-ghost"
                            >
                                <FaChevronLeft />
                            </button>
                            <span className="text-sm font-bold text-gray-700 min-w-[80px] text-center">
                                {attMonth.getFullYear()}.{String(attMonth.getMonth() + 1).padStart(2, '0')}
                            </span>
                            <button
                                onClick={() => setAttMonth(shiftMonth(attMonth, 1))}
                                className="btn btn-xs btn-circle btn-ghost"
                            >
                                <FaChevronRight />
                            </button>
                        </div>

                        {/* 월별 보기용 탭 */}
                        <div className="tabs tabs-boxed bg-gray-100 p-1 rounded-full">
                            <a
                                className={`tab rounded-full px-4 ${attCategory === 'all' ? 'tab-active bg-black text-white' : ''}`}
                                onClick={() => setAttCategory('all')}
                            >
                                모든수강생
                            </a>
                            <a
                                className={`tab rounded-full px-4 ${attCategory === 'monthly' ? 'tab-active bg-blue-600 text-white' : ''}`}
                                onClick={() => setAttCategory('monthly')}
                            >
                                월정산
                            </a>
                        </div>
                    </div>
                )}

                {/* 잠금 버튼 및 12주 이동 버튼 */}
                <div className="flex items-center gap-4">
                    {/* [NEW] 12주 보기일 때 년도 선택 추가 */}
                    {attViewMode === '12weeks' && (
                        <select
                            className="select select-sm bg-transparent border-none font-extrabold text-lg focus:outline-none min-w-[100px]"
                            value={attBaseDate.getFullYear()}
                            onChange={handleAttYearChange}
                        >
                            {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                                <option key={y} value={y}>
                                    {y}년
                                </option>
                            ))}
                        </select>
                    )}

                    <button
                        className={`btn btn-sm gap-2 ${isAttendanceLocked ? 'btn-ghost text-gray-400' : 'bg-red-100 text-red-500 border-none'}`}
                        onClick={() => setIsAttendanceLocked(!isAttendanceLocked)}
                    >
                        {isAttendanceLocked ? (
                            <>
                                <FaLock /> 잠금
                            </>
                        ) : (
                            <>
                                <FaLockOpen /> 수정가능
                            </>
                        )}
                    </button>

                    {attViewMode === '12weeks' && (
                        <>
                            <div className="w-[1px] h-6 bg-gray-200 mx-2"></div>
                            <button
                                className="btn btn-sm btn-circle btn-ghost"
                                onClick={() => {
                                    const d = new Date(attBaseDate);
                                    d.setDate(d.getDate() - 7 * 12);
                                    setAttBaseDate(d);
                                }}
                            >
                                <FaChevronLeft />
                            </button>

                            <div className="text-center flex flex-col items-center justify-center min-w-[140px]">
                                {(() => {
                                    const weeks = get12Weeks(attBaseDate);
                                    return (
                                        <>
                                            <span className="font-extrabold text-gray-800 text-sm whitespace-nowrap leading-none mb-1">
                                                {weeks[0].label} ~ {weeks[11].end.getFullYear().toString().slice(2)}.
                                                {String(weeks[11].end.getMonth() + 1).padStart(2, '0')}.
                                                {String(weeks[11].end.getDate()).padStart(2, '0')}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-bold leading-none">
                                                총 12주 코스
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>

                            <button
                                className="btn btn-sm btn-circle btn-ghost"
                                onClick={() => {
                                    const d = new Date(attBaseDate);
                                    d.setDate(d.getDate() + 7 * 12);
                                    setAttBaseDate(d);
                                }}
                            >
                                <FaChevronRight />
                            </button>

                            <button
                                className="btn btn-sm btn-ghost text-xs"
                                onClick={() => setAttBaseDate(getStartOfWeek(new Date()))}
                            >
                                오늘
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 메인 그리드 */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 px-6 pb-6 pt-0 flex-1 overflow-auto min-h-0 relative">
                <table className="table w-full border-separate border-spacing-y-4">
                    <thead className="sticky top-0 bg-white z-20 shadow-sm">
                        <tr className="text-center text-gray-500 text-xs font-bold">
                            <th className="sticky left-0 bg-white z-30 min-w-[150px] border-r border-gray-100 pl-6 text-left py-3">
                                이름
                            </th>
                            {/* [추가됨] 출석부 컬럼 */}

                            {attViewMode === '12weeks'
                                ? get12Weeks(attBaseDate).map((w, i) => (
                                      <th
                                          key={i}
                                          className="min-w-[80px] border-r border-gray-50 last:border-none py-3 bg-white"
                                      >
                                          <div className="flex flex-col items-center">
                                              <span className="text-[10px] text-gray-400 mb-1">{w.weekNum}주차</span>
                                              <span className="text-xs text-gray-800 font-bold">{w.label}</span>
                                          </div>
                                      </th>
                                  ))
                                : getMonthWeeksForView(attMonth).map((w, i) => (
                                      <th
                                          key={i}
                                          className="min-w-[80px] border-r border-gray-50 last:border-none py-3 bg-white"
                                      >
                                          <div className="flex flex-col items-center">
                                              <span className="text-[10px] text-gray-400 mb-1">{w.weekNum}주차</span>
                                              <span className="text-xs text-gray-800 font-bold">{w.rangeLabel}</span>
                                          </div>
                                      </th>
                                  ))}
                        </tr>
                    </thead>
                    <tbody>
                        {students
                            .filter((s) => {
                                if (attViewMode === 'month') {
                                    // 월별 보기 필터링 로직
                                    if (attCategory === 'monthly') {
                                        if (!s.isMonthly) return false;
                                    }

                                    const monthWeeks = getMonthWeeksForView(attMonth);
                                    if (monthWeeks.length === 0) return false;

                                    const viewStart = monthWeeks[0].startStr;
                                    const viewEnd = monthWeeks[monthWeeks.length - 1].endStr;

                                    const hasScheduleInView = attSchedules.some(
                                        (sch) => sch.studentId === s.id && sch.date >= viewStart && sch.date <= viewEnd
                                    );
                                    return hasScheduleInView;
                                } else {
                                    // 12주 보기: 카테고리 필터 적용
                                    // [FIX] 비활성(Inactive) 상태여도, 현재 뷰 범위 내에 스케줄이 있다면 '활성'으로 간주하여 표시
                                    const weeks12 = get12Weeks(attBaseDate);
                                    const start12 = weeks12[0].startStr;
                                    const end12 = weeks12[weeks12.length - 1].endStr;

                                    const hasScheduleInView = attSchedules.some(
                                        (sch) => sch.studentId === s.id && sch.date >= start12 && sch.date <= end12
                                    );

                                    const isEffectivelyActive = s.isActive || hasScheduleInView;

                                    if (attCategory === 'basic')
                                        return isEffectivelyActive && !s.isMonthly && !s.isArtist;
                                    if (attCategory === 'monthly') return isEffectivelyActive && s.isMonthly;
                                    if (attCategory === 'artist') return isEffectivelyActive && s.isArtist;
                                    if (attCategory === 'inactive') return !isEffectivelyActive;
                                    return false;
                                }
                            })
                            .sort((a, b) => new Date(a.firstDate || 0) - new Date(b.firstDate || 0))
                            .map((student, idx) => {
                                const weeks =
                                    attViewMode === '12weeks'
                                        ? get12Weeks(attBaseDate)
                                        : getMonthWeeksForView(attMonth);

                                // [NEW] 기본 수강생 로테이션 시작일 계산 (완료된 수업 기준)
                                const rotationStarts =
                                    attCategory === 'basic' ? calculateRotationStarts(student) : new Set();

                                return (
                                    <tr key={student.id} className="text-center hover:bg-gray-50 group">
                                        <td className="sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100 text-left pl-6 py-3 font-bold text-gray-800 align-middle border-b-[2px] border-gray-300">
                                            <span className="text-gray-400 text-xs mr-2">{idx + 1}</span>
                                            {student.name}
                                            {getWeightRemainderSuffix(student)}
                                            {/* [NEW] 아티스트 카운트 표시 */}
                                            {/* 1. 수강 상태 (Active/Inactive) */}
                                            <span
                                                className={`px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none ${student.isActive ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                                            >
                                                {student.isActive ? '수강' : '종료'}
                                            </span>

                                            {/* 2. 월정산 배지 */}
                                            {student.isMonthly && (
                                                <span className="px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none bg-indigo-50 text-indigo-600 border-indigo-100">
                                                    월정산
                                                </span>
                                            )}

                                            {/* 3. 재등록 요망 배지 (월정산/아티스트 제외) */}
                                            {!student.isMonthly && !student.isArtist && rotationStarts.size > 0 && (
                                                <div className="px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none bg-red-50 text-red-500 border-red-100 flex items-center gap-1">
                                                    <FaExclamationCircle /> 재등록 요망
                                                </div>
                                            )}

                                            {/* [월별보기 > 월정산 탭 정산 계산 로직 & 청구 버튼] */}
                                            {attViewMode === 'month' &&
                                                attCategory === 'monthly' &&
                                                (() => {
                                                    const weeks = getMonthWeeksForView(attMonth);
                                                    if (weeks.length === 0) return null;
                                                    const mStart = weeks[0].startStr;
                                                    const mEnd = weeks[weeks.length - 1].endStr;
                                                    const targetYearMonth = `${attMonth.getFullYear()}.${attMonth.getMonth() + 1}`; // 현재 보고 있는 월

                                                    const monthScheds = attSchedules.filter((s) => {
                                                        const sDate = new Date(s.date);
                                                        return (
                                                            s.studentId === student.id &&
                                                            s.date >= mStart &&
                                                            s.date <= mEnd &&
                                                            s.status !== 'reschedule' &&
                                                            // [핵심 추가] 스케줄 날짜의 '월'이 현재 보고있는 '월'과 일치해야 함
                                                            sDate.getMonth() === attMonth.getMonth() &&
                                                            sDate.getFullYear() === attMonth.getFullYear()
                                                        );
                                                    });

                                                    const cntM = monthScheds.filter(
                                                        (s) =>
                                                            (s.gridType === 'master' || !s.gridType) &&
                                                            s.category !== '상담'
                                                    ).length;
                                                    const cntV_All = monthScheds.filter(
                                                        (s) => s.gridType === 'vocal'
                                                    ).length;

                                                    if (cntM === 0 && cntV_All === 0) return null;

                                                    const hasPending = monthScheds.some(
                                                        (s) => !s.status || s.status === 'pending'
                                                    );
                                                    const statusLabel = hasPending ? '(진행중)' : '(완료)';
                                                    const statusColor = hasPending ? 'text-gray-400' : 'text-blue-600';

                                                    let planV = 0,
                                                        planV30 = 0;
                                                    (student.schedule || []).forEach((w) => {
                                                        planV += Number(w.vocal || 0);
                                                        planV30 += Number(w.vocal30 || 0);
                                                    });
                                                    const isV30 = planV30 > planV;

                                                    const rateM = Number(student.rates?.master || 0);
                                                    const rateV_Base = Number(student.rates?.vocal || 0);
                                                    const rateV_Final = isV30 ? rateV_Base * 0.5 : rateV_Base;

                                                    const amountM = cntM * rateM;
                                                    const amountV = cntV_All * rateV_Final;
                                                    const totalAmount = amountM + amountV;

                                                    return (
                                                        <div className="mt-1.5 flex flex-col items-start gap-1 p-2 bg-blue-50/80 rounded-lg border border-blue-100 shadow-sm w-full">
                                                            <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500 font-medium">
                                                                {cntM > 0 && (
                                                                    <span className="whitespace-nowrap">
                                                                        M
                                                                        <span className="text-gray-400">
                                                                            ({formatCurrency(rateM)})
                                                                        </span>
                                                                        ×{cntM}
                                                                    </span>
                                                                )}
                                                                {cntV_All > 0 && (
                                                                    <span className="whitespace-nowrap">
                                                                        {isV30 ? 'V30' : 'V'}
                                                                        <span className="text-gray-400">
                                                                            ({formatCurrency(rateV_Final)})
                                                                        </span>
                                                                        ×{cntV_All}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between w-full pt-1 mt-0.5 border-t border-blue-200">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-xs font-extrabold text-blue-600">
                                                                        = {formatCurrency(totalAmount)}원
                                                                    </span>
                                                                    <span
                                                                        className={`text-[10px] font-bold ${statusColor}`}
                                                                    >
                                                                        {statusLabel}
                                                                    </span>
                                                                </div>

                                                                {/* [추가됨] 청구하기 버튼 */}
                                                                {/* [수정됨] 이미 청구된 내역인지 확인 */}
                                                                {(() => {
                                                                    const isAlreadyBilled = (
                                                                        student.unpaidList || []
                                                                    ).some(
                                                                        (unpaid) =>
                                                                            unpaid.memo ===
                                                                            `${targetYearMonth}월 월정산 청구`
                                                                    );

                                                                    // [FIX] 결제 여부 확인 (최종 개선버전: 타입/포맷 무관하게 비교)
                                                                    const isPaidCompleted = settlementIncome.some(
                                                                        (pay) => {
                                                                            // 1. 학생 ID 비교 (문자열 변환)
                                                                            if (
                                                                                String(pay.studentId) !==
                                                                                String(student.id)
                                                                            )
                                                                                return false;

                                                                            // 2. 날짜 비교 완화 ([FIX] 년월 일치 여부, 구분자/자릿수 무관)
                                                                            // targetYearMonth(2025.3 or 2025.03) -> "2025-03"으로 엄격하게 정규화
                                                                            const [tYear, tMonth] =
                                                                                targetYearMonth.split(/[.-]/);
                                                                            const normTargetMonth = `${tYear}-${String(tMonth).padStart(2, '0')}`;

                                                                            const payDateStr = pay.targetDate || '';
                                                                            // pay.targetDate가 "2025.3.1"일 수도 있고 "2025-03-01"일 수도 있음 -> 정규화
                                                                            const [pYear, pMonth] =
                                                                                payDateStr.split(/[.-]/);
                                                                            const normPayMonth = `${pYear}-${String(pMonth).padStart(2, '0')}`;

                                                                            if (normPayMonth !== normTargetMonth)
                                                                                return false;

                                                                            // 3. 금액 비교 (모든 특수문자 제거 후 정수 변환)
                                                                            // 1000원 단위 차이 무시하고 정확히 일치하는지
                                                                            const payAmt = Number(
                                                                                String(pay.amount || '0').replace(
                                                                                    /[^0-9]/g,
                                                                                    ''
                                                                                )
                                                                            );
                                                                            const reqAmt = Number(
                                                                                String(totalAmount || '0').replace(
                                                                                    /[^0-9]/g,
                                                                                    ''
                                                                                )
                                                                            );
                                                                            return payAmt === reqAmt;
                                                                        }
                                                                    );

                                                                    if (isPaidCompleted) {
                                                                        return (
                                                                            <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-600 text-[10px] font-bold rounded shadow-sm border border-orange-200">
                                                                                <FaCheckCircle className="text-[10px]" />{' '}
                                                                                결제완료
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return isAlreadyBilled ? (
                                                                        /* 이미 청구된 경우: 비활성화 버튼 표시 */
                                                                        <div className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-500 text-[10px] font-bold rounded shadow-sm">
                                                                            <FaCheckCircle className="text-[10px]" />{' '}
                                                                            청구됨
                                                                        </div>
                                                                    ) : (
                                                                        /* 아직 청구 전인 경우: 활성화 버튼 표시 */
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleMonthlySettlementRequest(
                                                                                    student,
                                                                                    totalAmount,
                                                                                    targetYearMonth
                                                                                );
                                                                            }}
                                                                            className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
                                                                        >
                                                                            <FaFileInvoiceDollar className="text-[10px]" />{' '}
                                                                            청구하기
                                                                        </button>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                        </td>
                                        {weeks.map((w, i) => {
                                            const rotationWeek = getRotationWeek(student.firstDate, w.startStr);
                                            const weekConfig = student.schedule && student.schedule[rotationWeek - 1];

                                            // --- [FIX] 상태 표시 우선순위 로직 수정 ---
                                            const isBasicStudent = attCategory === 'basic';
                                            let uiState = null; // 'paid', 'billed', 'register' 중 하나
                                            let targetUiDate = '';

                                            if (isBasicStudent) {
                                                // 이번 주차(w.start ~ w.end)의 날짜들을 하루씩 확인
                                                for (
                                                    let d = new Date(w.start);
                                                    d <= w.end;
                                                    d.setDate(d.getDate() + 1)
                                                ) {
                                                    const dStr = formatDateLocal(d);

                                                    // 1순위: 결제 완료 확인 (student.lastDate와 일치하는지)
                                                    if (student.lastDate === dStr) {
                                                        uiState = 'paid';
                                                        targetUiDate = dStr;
                                                        break; // 우선순위 가장 높으므로 루프 종료
                                                    }

                                                    // 2순위: 청구 중(미결제) 확인 (unpaidList에 있는지)
                                                    const isUnpaid = (student.unpaidList || []).some(
                                                        (u) => u.targetDate === dStr
                                                    );
                                                    if (isUnpaid) {
                                                        uiState = 'billed';
                                                        targetUiDate = dStr;
                                                        break;
                                                    }

                                                    // 3순위: 재등록 버튼 (계산된 로테이션 시작일인지)
                                                    if (rotationStarts.has(dStr)) {
                                                        uiState = 'register';
                                                        targetUiDate = dStr;
                                                        // 주의: 같은 주에 '결제완료'나 '청구중'이 이미 있다면 버튼을 덮어쓰지 않도록
                                                        // 루프를 계속 돌지 않고 여기서 break 할 수도 있지만,
                                                        // 날짜가 겹치지 않는다면 버튼이 떠야 하므로 break.
                                                        // 하지만 보통 한 주에 로테이션 시작이 두 번일 수는 없으므로 break.
                                                        break;
                                                    }
                                                }
                                            }
                                            // ------------------------------------------------

                                            const mCountBasic = Number(weekConfig?.master || 0);
                                            const vCountBasic =
                                                Number(weekConfig?.vocal || 0) + Number(weekConfig?.vocal30 || 0);

                                            /* 수정 후 (월 검증 추가) */
                                            const weekSchedules = attSchedules.filter((s) => {
                                                const sDate = new Date(s.date);
                                                return (
                                                    s.studentId === student.id &&
                                                    s.date >= w.startStr &&
                                                    s.date <= w.endStr &&
                                                    (!s.memo ||
                                                        !s.memo.includes('보강(') ||
                                                        s.status === 'completed' ||
                                                        s.status === 'reschedule' ||
                                                        s.status === 'reschedule_assigned') &&
                                                    // [핵심 추가] 월별 보기 모드일 때만 날짜 엄격 검증
                                                    (attViewMode === 'month'
                                                        ? sDate.getMonth() === attMonth.getMonth() &&
                                                          sDate.getFullYear() === attMonth.getFullYear()
                                                        : true)
                                                );
                                            });

                                            const extraMCount = weekSchedules
                                                .filter(
                                                    (s) =>
                                                        (s.gridType === 'master' || !s.gridType) &&
                                                        s.category !== '상담' &&
                                                        s.memo &&
                                                        s.memo.includes('추가')
                                                )
                                                .reduce((acc, s) => acc + (s.masterType === '30' ? 0.5 : 1), 0);
                                            const extraVCount = weekSchedules
                                                .filter(
                                                    (s) => s.gridType === 'vocal' && s.memo && s.memo.includes('추가')
                                                )
                                                // [FIX] vocalType '30'은 1로 계산, 'half'만 0.5로 계산
                                                .reduce((acc, s) => acc + (s.vocalType === 'half' ? 0.5 : 1), 0);

                                            const mTotal = mCountBasic + extraMCount;
                                            const vTotal = vCountBasic + extraVCount;

                                            const completedM = weekSchedules
                                                .filter(
                                                    (s) =>
                                                        (s.gridType === 'master' || (!s.gridType && !s.vocalType)) &&
                                                        s.category !== '상담'
                                                )
                                                .sort(
                                                    (a, b) =>
                                                        new Date(a.date + 'T' + a.time) -
                                                        new Date(b.date + 'T' + b.time)
                                                );

                                            const completedV = weekSchedules
                                                .filter((s) => s.gridType === 'vocal' || (!s.gridType && s.vocalType))
                                                .sort(
                                                    (a, b) =>
                                                        new Date(a.date + 'T' + a.time) -
                                                        new Date(b.date + 'T' + b.time)
                                                );

                                            // ... existing code inside map((student, idx) => { ...
                                            const renderSlot = (type, index, actualScheds) => {
                                                const sched = actualScheds[index];

                                                // [핵심 추가] 데이터가 들어있는 경우, 현재 달의 데이터인지 확인
                                                if (attViewMode === 'month' && sched) {
                                                    const sDate = new Date(sched.date);
                                                    if (
                                                        sDate.getMonth() !== attMonth.getMonth() ||
                                                        sDate.getFullYear() !== attMonth.getFullYear()
                                                    ) {
                                                        return null; // 다른 달 데이터면 그리지 않음
                                                    }
                                                }

                                                const isMaster = type === 'M';

                                                // [추가] 현재 선택된 월(attMonth) 정보
                                                const currentYear = attMonth.getFullYear();
                                                const currentMonth = attMonth.getMonth();

                                                // [수정] 스케줄이 존재하더라도, 월별 보기 모드일 때는 해당 월의 날짜인지 한 번 더 검증
                                                const isValidMonth = sched
                                                    ? new Date(sched.date).getMonth() === currentMonth &&
                                                      new Date(sched.date).getFullYear() === currentYear
                                                    : true;

                                                // 만약 월별 보기인데 다른 달의 날짜라면 렌더링하지 않음 (또는 null 반환)
                                                if (attViewMode === 'month' && sched && !isValidMonth) {
                                                    return null;
                                                }

                                                // ... (기존 로테이션 및 스타일 로직 동일)
                                                let rotationInfo = { index: -1, label: '' };
                                                if (sched) {
                                                    rotationInfo = getScheduleRotationInfo(student, sched.id);
                                                }
                                                // ... (이하 동일)
                                                const manualKey = `${student.id}_${w.startStr}_${type}_${index}`;
                                                const manualRecord = periodAttendance[manualKey];
                                                const manualStatus = manualRecord ? manualRecord.status : 'none';

                                                // 기본 스타일 (스케줄 없을 때)
                                                let boxClass = 'bg-white border-dashed border-gray-200 text-gray-300';
                                                let content = type + (index + 1);
                                                let icon = null;
                                                let statusColor = 'text-gray-400';

                                                if (sched) {
                                                    const dateShort = formatMonthDay(sched.date);
                                                    content = dateShort;

                                                    // --- [VISUALIZATION] 로테이션 배경색 적용 (진하기 구분) ---
                                                    // (전략: 기존 boxClass 결정 로직 대체)
                                                    const isM =
                                                        (sched.gridType === 'master' ||
                                                            (!sched.gridType && !sched.vocalType)) &&
                                                        sched.category !== '상담';
                                                    const isV =
                                                        sched.gridType === 'vocal' ||
                                                        (!sched.gridType && sched.vocalType);
                                                    const classT = isV ? sched.vocalType : sched.masterType;

                                                    // [NEW] 미래/보류 일정 비활성 처리
                                                    // 오늘 날짜 구하기
                                                    const todayStr = formatDateLocal(new Date());
                                                    const isFutureOrToday = sched.date >= todayStr;
                                                    const isPending = !sched.status || sched.status === 'pending';

                                                    if (isFutureOrToday && isPending) {
                                                        // [MODIFY] 미래 대기 상태: History View와 동일한 연한 회색 스타일 적용
                                                        const is30 = String(classT) === '30';
                                                        const isHalf = String(classT) === 'half';
                                                        const isSplitClass = (isM && is30) || (isV && isHalf);

                                                        if (isSplitClass) {
                                                            boxClass =
                                                                'bg-[linear-gradient(135deg,#e5e7eb_50%,#f9fafb_50%)] border-gray-300 text-gray-400 font-bold opacity-80 shadow-none';
                                                        } else {
                                                            boxClass =
                                                                'bg-gray-100 border-gray-200 text-gray-400 font-bold opacity-80 shadow-none';
                                                        }
                                                    } else {
                                                        // 그 외(과거거나 완료된) 일정은 기존 로테이션 스타일 적용
                                                        const bStyle = getBadgeStyle(
                                                            isV ? 'vocal' : 'master',
                                                            classT,
                                                            rotationInfo.index,
                                                            sched.status,
                                                            'dashboard'
                                                        );
                                                        boxClass = `${bStyle} border-solid`;
                                                    }

                                                    // [FIX] 결제/청구 관련 날짜 슬롯 강조 (링 효과)
                                                    if (sched.date === targetUiDate) {
                                                        if (uiState === 'paid') {
                                                            boxClass += ' ring-2 ring-green-500 ring-offset-1 z-10';
                                                        } else if (uiState === 'billed') {
                                                            boxClass +=
                                                                ' ring-2 ring-red-400 ring-offset-1 z-10 animate-pulse';
                                                        }
                                                    }

                                                    // [NEW] 완료된 보강 수업인 경우 (강제 스타일 적용)
                                                    // [NEW] 완료된 보강 수업인 경우 (강제 스타일 적용)
                                                    if (
                                                        sched.status === 'completed' &&
                                                        sched.memo &&
                                                        sched.memo.includes('보강')
                                                    ) {
                                                        // 정규식 제거가 불안정할 수 있으므로 !important 클래스로 덮어쓰기 전략 사용
                                                        // [FIX] 배경색은 로테이션 색상을 그대로 사용하기 위해 !bg-white 제거
                                                        boxClass +=
                                                            ' !border-dashed !border-yellow-500 !border-[2px] !text-yellow-700 !font-bold';
                                                        // 아이콘도 노란색으로 변경 (Reschedule 색상)
                                                        statusColor = ' !text-yellow-700';
                                                    }
                                                    // ----------------------------------------

                                                    // 상태별 아이콘 및 텍스트 색상 처리 (기존 로직 유지)
                                                    if (sched.status === 'completed') {
                                                        icon = <FaCheck className="text-[9px]" />;
                                                        statusColor = 'text-green-600';
                                                    } else if (sched.status === 'absent') {
                                                        icon = <FaTimesCircle className="text-[9px]" />;
                                                        statusColor = 'text-red-500';
                                                        boxClass += ' text-red-600';
                                                    } else if (
                                                        sched.status === 'reschedule' ||
                                                        sched.status === 'reschedule_assigned'
                                                    ) {
                                                        content = dateShort;
                                                        icon = <FaClock className="text-[9px]" />;
                                                        statusColor = 'text-yellow-600';
                                                        // [MOD] 중앙화된 getBadgeStyle 사용 (통일된 스타일 적용)
                                                        boxClass = getBadgeStyle(
                                                            isV ? 'vocal' : 'master',
                                                            classT,
                                                            rotationInfo.index,
                                                            sched.status,
                                                            'history'
                                                        );
                                                        icon = <FaClock className="text-[9px]" />;
                                                        statusColor = 'text-yellow-600';
                                                    }
                                                } else {
                                                    // 수동 체크 처리
                                                    if (manualStatus === 'present') {
                                                        boxClass = isMaster
                                                            ? 'bg-green-100 text-green-900'
                                                            : 'bg-green-50 text-green-700';
                                                        icon = <FaCheck className="text-[9px]" />;
                                                    } else if (manualStatus === 'late') {
                                                        boxClass = isMaster
                                                            ? 'bg-yellow-100 text-yellow-900'
                                                            : 'bg-yellow-50 text-yellow-700';
                                                        icon = <FaClock className="text-[9px]" />;
                                                    } else if (manualStatus === 'absent') {
                                                        boxClass = isMaster
                                                            ? 'bg-red-100 text-red-900'
                                                            : 'bg-red-50 text-red-700';
                                                        icon = <FaTimesCircle className="text-[9px]" />;
                                                    }
                                                }

                                                return (
                                                    <div
                                                        key={`${type}-${index}`}
                                                        className={`h-7 w-10 rounded-md text-[9px] flex flex-col items-center justify-center border cursor-pointer leading-none gap-0.5 relative overflow-hidden ${boxClass}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePeriodAttendanceToggle(
                                                                student.id,
                                                                w.startStr,
                                                                type,
                                                                index
                                                            );
                                                        }}
                                                    >
                                                        {rotationInfo.label && (
                                                            <span className="absolute top-0 right-0 bg-black/10 text-[6px] px-0.5 rounded-bl-sm font-extrabold text-gray-700 opacity-50">
                                                                {rotationInfo.label}
                                                            </span>
                                                        )}

                                                        <span className={statusColor}>{icon}</span>
                                                        <span>{content}</span>
                                                    </div>
                                                );
                                            };

                                            // [FIX] 셀 스타일링 동적 적용 (결제/청구 상태 강조)
                                            const isPaidState = uiState === 'paid';
                                            const isBilledState = uiState === 'billed';
                                            const cellBaseClass =
                                                'border-r p-1 align-top min-h-[60px] relative transition-all';
                                            const cellStateClass = isPaidState
                                                ? 'border-green-200 border-b-[4px] border-b-green-500 bg-green-50/50'
                                                : isBilledState
                                                  ? 'border-red-200 border-b-[4px] border-b-red-400 bg-red-50/30'
                                                  : 'border-gray-50 border-b-[2px] border-b-gray-300';

                                            return (
                                                <td key={i} className={`${cellBaseClass} ${cellStateClass}`}>
                                                    {/* [FIX] 상태에 따른 UI 렌더링 (결제완료 > 청구중 > 재등록버튼) */}
                                                    {uiState === 'paid' && (
                                                        <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                                            <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold border border-green-200 flex items-center gap-0.5">
                                                                <FaCheckCircle className="text-[7px]" />{' '}
                                                                {targetUiDate.substring(5).replace('-', '.')} 결제완료
                                                            </span>
                                                        </div>
                                                    )}

                                                    {uiState === 'billed' && (
                                                        <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                                            <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-bold border border-red-200 animate-pulse">
                                                                {targetUiDate.substring(5).replace('-', '.')} 청구중
                                                            </span>
                                                        </div>
                                                    )}

                                                    {uiState === 'register' && (
                                                        <div className="absolute top-0 right-0 left-0 -mt-3 flex justify-center z-10">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRegisterRotation(student, targetUiDate);
                                                                }}
                                                                className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-md hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-1"
                                                            >
                                                                <FaPlus className="text-[7px]" /> 재등록
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-col gap-1.5 h-full justify-center py-1 mt-1">
                                                        {mTotal > 0 || vTotal > 0 ? (
                                                            <>
                                                                {/* 1. Master 라인 (윗줄 고정) */}
                                                                {/* min-h-[24px]로 설정하여 M 수업이 0개여도 높이를 확보해 V가 위로 올라오는 것을 방지합니다. */}
                                                                <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                                                    {Array.from({
                                                                        length: Math.max(
                                                                            Math.ceil(mTotal),
                                                                            completedM.length
                                                                        ),
                                                                    }).map((_, idx) =>
                                                                        renderSlot('M', idx, completedM)
                                                                    )}
                                                                </div>

                                                                {/* 2. Vocal 라인 (아랫줄 고정) */}
                                                                <div className="flex gap-1 justify-center flex-wrap min-h-[24px]">
                                                                    {Array.from({
                                                                        length: Math.max(
                                                                            Math.ceil(vTotal),
                                                                            completedV.length
                                                                        ),
                                                                    }).map((_, idx) =>
                                                                        renderSlot('V', idx, completedV)
                                                                    )}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            /* 수업이 아예 없는 주차는 기존처럼 '-' 표시 */
                                                            <div className="text-center text-gray-200 text-xs">-</div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
