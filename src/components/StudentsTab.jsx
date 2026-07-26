import { Fragment } from 'react';
import {
    FaPlus,
    FaSearch,
    FaEdit,
    FaTrash,
    FaChevronLeft,
    FaChevronRight,
    FaUserSlash,
    FaUserCheck,
    FaExclamationCircle,
    FaChevronDown,
    FaChevronUp,
    FaCheckCircle,
    FaHistory,
    FaCreditCard,
    FaTimesCircle,
    FaCamera,
    FaImage,
    FaStar,
    FaUndo,
    FaStickyNote,
    FaSort,
    FaCalendarAlt,
} from 'react-icons/fa';
import { MemoInput } from './MemoInput.jsx';
import { getDaysPassed } from '../utils/date.js';
import { calculateTotalAmount, formatCurrency } from '../utils/money.js';

/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
export function StudentsTab({
    students,
    filteredStudents,
    currentItems,
    currentPage,
    setCurrentPage,
    totalPages,
    itemsPerPage,
    paginate,
    viewStatus,
    setViewStatus,
    listFilter,
    setListFilter,
    searchTerm,
    setSearchTerm,
    studentMemo,
    handleStudentMemoSave,
    paymentCheckedAt,
    paymentCheckBusy,
    handlePaymentCheckDone,
    formatWhen,
    expandedStudentId,
    setExpandedStudentId,
    setViewingStudentAtt,
    calculateRotationStarts,
    toggleStatus,
    handleDelete,
    handleEditClick,
    setIsModalOpen,
    setEditingId,
    setFormData,
    initialFormState,
    tempDates,
    setTempDates,
    handleAddUnpaid,
    handleDeleteUnpaid,
    tempDeposit,
    setTempDeposit,
    handleAddDeposit,
    handleDeleteDeposit,
    handleClearDeposits,
    handleUnpaidChipClick,
    selectedUnpaidId,
    paymentForm,
    handlePaymentFormChange,
    handlePaymentSave,
    paymentFile,
    setPaymentFile,
    resetPaymentForm,
    paymentHistory,
    historyPage,
    setHistoryPage,
    historyPerPage,
    historySort,
    setHistorySort,
    handleEditHistoryClick,
    handleDeletePayment,
    handleRetroactivePhotoUpload,
    setPreviewImage,
}) {
    return (
        <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 pb-20 gap-6 overflow-y-auto">
            {/* [NEW] 학생관리 탭 상단 메모 */}
            <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                <MemoInput
                    value={studentMemo}
                    onSave={handleStudentMemoSave}
                    placeholder="학생 관리 관련 메모를 입력하세요... (예: 대기자 명단 확인, 신규 문의 연락 등)"
                    label="학생관리 메모"
                    icon={
                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">
                            <FaStickyNote className="text-purple-500 text-sm" />
                        </div>
                    }
                />
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-extrabold mb-2">수강생 리스트</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setViewStatus('active');
                                setCurrentPage(1);
                            }}
                            className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'active' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                            수강중
                        </button>
                        <button
                            onClick={() => {
                                setViewStatus('inactive');
                                setCurrentPage(1);
                            }}
                            className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'inactive' ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                            종료/비활성
                        </button>
                        <button
                            onClick={() => {
                                setViewStatus('artist');
                                setCurrentPage(1);
                            }}
                            className={`text-sm px-3 py-1 rounded-lg ${viewStatus === 'artist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                            아티스트
                        </button>
                    </div>
                </div>
                <div className="flex w-full flex-col gap-2 md:w-auto">
                    <div className="flex gap-2">
                        <div className="relative group flex-1 md:flex-none">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="검색..."
                                className="input w-full md:w-64 bg-gray-50 border-2 border-gray-100 pl-10 rounded-2xl h-12 outline-none font-medium"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => {
                                setEditingId(null);
                                setFormData(initialFormState);
                                setIsModalOpen(true);
                            }}
                            className="btn h-12 bg-gray-900 text-white border-none px-6 rounded-2xl font-bold shadow-lg flex items-center gap-2"
                        >
                            <FaPlus /> 등록
                        </button>
                    </div>

                    {/* 빠른 필터 + 입금확인 처리 */}
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        {/* 전체 / 미결제 / 재등록 보기 */}
                        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
                            {[
                                { key: 'all', label: '전체' },
                                { key: 'unpaid', label: '미결제' },
                                { key: 'reregister', label: '재등록' },
                            ].map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => {
                                        setListFilter(f.key);
                                        setCurrentPage(1);
                                    }}
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                                        listFilter === f.key
                                            ? f.key === 'unpaid'
                                                ? 'bg-red-500 text-white shadow-sm'
                                                : f.key === 'reregister'
                                                  ? 'bg-rose-500 text-white shadow-sm'
                                                  : 'bg-gray-900 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handlePaymentCheckDone}
                            disabled={paymentCheckBusy}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
                            title="여기까지 입금을 모두 확인했다고 기록합니다 (PC 에서는 데이터도 파일로 백업)"
                        >
                            <FaCheckCircle className="text-[10px]" />
                            <span>입금확인 처리</span>
                        </button>
                        <span className="truncate text-[11px] font-medium text-gray-400">
                            {paymentCheckedAt
                                ? `마지막 확인: ${formatWhen(paymentCheckedAt)}`
                                : '아직 확인 기록이 없습니다'}
                        </span>
                    </div>
                </div>
            </div>
            <div className="bg-gray-50 rounded-[1.5rem] md:rounded-[2.5rem] p-2 min-h-[600px] flex flex-col">
                <div className="overflow-x-auto bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm flex-1">
                    <table className="table w-full">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm">
                            <tr className="text-gray-500 text-xs md:text-sm font-bold border-b-2 border-gray-100">
                                <th className="py-4 md:py-6 pl-4 md:pl-10 w-16">No.</th>
                                <th className="py-4 md:py-6">이름</th>
                                <th className="hidden md:table-cell py-4 md:py-6">클래스 상세</th>
                                <th className="hidden md:table-cell py-4 md:py-6">예상 금액 (4주)</th>
                                <th className="hidden md:table-cell py-4 md:py-6">등록일 / 재등록예정</th>
                                <th className="py-4 md:py-6 pr-4 md:pr-10 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentItems.map((student, idx) => {
                                const rotationStarts = calculateRotationStarts(student); // [NEW] 재등록 여부 계산
                                const totalAmount = calculateTotalAmount(student);
                                const daysPassed = getDaysPassed(student.lastDate);
                                const isStale = daysPassed >= 29;
                                const isExpanded = expandedStudentId === student.id;
                                const isUnpaid = student.isPaid === false;
                                const unpaidItems = student.unpaidList || [];
                                // '클래스 상세'에서 주차 칸들의 줄을 맞추기 위해, 이 학생이 4주 중
                                // 한 번이라도 쓰는 수업 종류를 미리 추린다. 안 쓰는 종류는 줄 자체를 안 만든다.
                                const classRows = {
                                    master: (student.schedule || []).some((w) => Number(w.master) > 0),
                                    vocal: (student.schedule || []).some((w) => Number(w.vocal) > 0),
                                    vocal30: (student.schedule || []).some((w) => Number(w.vocal30) > 0),
                                };
                                let displayedHistory = [];
                                let historyTotalPages = 0;
                                let totalPaidAmount = 0;
                                let totalUnpaidAmount = 0;
                                if (isExpanded) {
                                    const unpaidRows = unpaidItems.map((item) => ({
                                        id: item.id,
                                        type: 'unpaid',
                                        paymentDate: '-',
                                        amount: item.amount || totalAmount,
                                        paymentMethod: 'unpaid',
                                        targetDate: item.targetDate,
                                        isCashReceipt: false,
                                        receiptMemo: '미결제 상태',
                                    }));
                                    const combinedHistory = [...unpaidRows, ...paymentHistory];
                                    combinedHistory.sort((a, b) => {
                                        const dateA = a[historySort] || '';
                                        const dateB = b[historySort] || '';
                                        return dateB.localeCompare(dateA);
                                    });
                                    historyTotalPages = Math.ceil(combinedHistory.length / historyPerPage);
                                    combinedHistory.forEach((item, index) => {
                                        item.cycle = combinedHistory.length - index;
                                    });
                                    displayedHistory = combinedHistory.slice(
                                        (historyPage - 1) * historyPerPage,
                                        historyPage * historyPerPage
                                    );
                                    totalPaidAmount = paymentHistory.reduce(
                                        (acc, cur) => acc + Number(cur.amount || 0),
                                        0
                                    );
                                    totalUnpaidAmount = unpaidItems.reduce(
                                        (acc, cur) => acc + Number(cur.amount || 0),
                                        0
                                    );
                                }
                                return (
                                    <Fragment key={student.id}>
                                        <tr
                                            className={`hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none ${isUnpaid ? 'bg-red-50 hover:bg-red-50' : ''}`}
                                        >
                                            <td className="pl-4 md:pl-10 font-bold text-gray-400">
                                                {filteredStudents.length - ((currentPage - 1) * itemsPerPage + idx)}
                                            </td>
                                            {/* [수정됨] 이름 + 달력 아이콘 셀 */}
                                            <td
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    setExpandedStudentId(isExpanded ? null : student.id);
                                                    resetPaymentForm(totalAmount);
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {/* 달력 버튼 (왼쪽) */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingStudentAtt(student);
                                                        }}
                                                        className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition-all hover:bg-blue-50 hover:text-blue-600 active:scale-90"
                                                        title="전체 출석부 보기"
                                                    >
                                                        <FaCalendarAlt className="text-sm" />
                                                    </button>
                                                    {/* 이름 및 아이콘 */}
                                                    <span className="font-bold text-gray-800 text-base md:text-lg">
                                                        {student.name}
                                                    </span>
                                                    {student.isArtist && <FaStar className="text-purple-500 text-xs" />}
                                                    {isExpanded ? (
                                                        <FaChevronUp className="text-gray-400 text-xs" />
                                                    ) : (
                                                        <FaChevronDown className="text-gray-400 text-xs" />
                                                    )}
                                                </div>
                                                {/* 상태 뱃지 — 앱 공통 pill 스타일.
                                                    테두리 대신 ring 을 써서 글자 위치가 흔들리지 않게 한다.
                                                    가장 급한 '미결제'만 진한 색으로 눈에 띄게 둔다. */}
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ring-1 ${student.isActive ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-gray-100 text-gray-400 ring-gray-200'}`}
                                                    >
                                                        {student.isActive ? '수강' : '종료'}
                                                    </span>
                                                    {student.isMonthly && (
                                                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold leading-none text-sky-600 ring-1 ring-sky-100">
                                                            월정산
                                                        </span>
                                                    )}
                                                    {!student.isMonthly &&
                                                        !student.isArtist &&
                                                        rotationStarts.size > 0 && (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold leading-none text-rose-600 ring-1 ring-rose-100">
                                                                <FaExclamationCircle className="text-[9px]" />
                                                                재등록 요망
                                                            </span>
                                                        )}
                                                    {isUnpaid && (
                                                        <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                                                            {unpaidItems.length}건 미결제
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell">
                                                <div className="flex items-stretch gap-2">
                                                    {student.schedule?.map((w, i) => {
                                                        const hasAny =
                                                            Number(w.master) > 0 ||
                                                            Number(w.vocal) > 0 ||
                                                            Number(w.vocal30) > 0;
                                                        return (
                                                            <div
                                                                key={i}
                                                                className={`flex flex-col items-center border rounded-lg p-1 w-16 ${hasAny ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed opacity-50'}`}
                                                            >
                                                                <span className="text-[10px] text-gray-400 font-bold">
                                                                    {i + 1}주
                                                                </span>
                                                                {/* 이 학생이 쓰는 수업 종류는 주마다 같은 줄에 오도록 자리를 비워둔다.
                                                                    (예: 마스터가 2·4주에만 있어도 1·3주 칸의 보컬 줄 높이가 맞는다) */}
                                                                {classRows.master && (
                                                                    <span className="text-[10px] text-orange-600 font-bold">
                                                                        {Number(w.master) > 0 ? `M(${w.master})` : ' '}
                                                                    </span>
                                                                )}
                                                                {classRows.vocal && (
                                                                    <span className="text-[10px] text-blue-600 font-bold">
                                                                        {Number(w.vocal) > 0 ? `V(${w.vocal})` : ' '}
                                                                    </span>
                                                                )}
                                                                {classRows.vocal30 && (
                                                                    <span className="text-[10px] text-cyan-600 font-bold">
                                                                        {Number(w.vocal30) > 0
                                                                            ? `V30(${w.vocal30})`
                                                                            : ' '}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell font-bold text-gray-800 text-base">
                                                {formatCurrency(totalAmount)}원
                                            </td>
                                            <td className="hidden md:table-cell text-xs">
                                                <div className="flex items-center gap-1 mb-1">
                                                    <span className="text-gray-400 w-8">최종:</span>
                                                    <span className="font-bold text-gray-700">{student.lastDate}</span>
                                                    {isStale && (
                                                        <FaExclamationCircle className="text-red-500 text-sm animate-pulse" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-gray-400 w-8">예정:</span>
                                                    <input
                                                        type="date"
                                                        className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none"
                                                        value={tempDates[student.id] || ''}
                                                        onChange={(e) =>
                                                            setTempDates({
                                                                ...tempDates,
                                                                [student.id]: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    <button
                                                        onClick={() => handleAddUnpaid(student)}
                                                        className="btn btn-xs btn-square bg-black text-white hover:bg-gray-800 border-none rounded"
                                                    >
                                                        <FaPlus className="text-[10px]" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="pr-4 md:pr-10 text-right">
                                                <div className="md:hidden mb-2 flex justify-end items-center gap-1">
                                                    <input
                                                        type="date"
                                                        className="input input-xs border-gray-200"
                                                        value={tempDates[student.id] || ''}
                                                        onChange={(e) =>
                                                            setTempDates({
                                                                ...tempDates,
                                                                [student.id]: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    <button
                                                        onClick={() => handleAddUnpaid(student)}
                                                        className="btn btn-xs btn-square bg-black text-white hover:bg-gray-800 border-none rounded"
                                                    >
                                                        <FaPlus />
                                                    </button>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        title={student.isActive ? '비활성 전환' : '활성 전환'}
                                                        onClick={() => toggleStatus(student)}
                                                        className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-gray-400 transition-all hover:bg-gray-200 hover:text-gray-600 active:scale-95"
                                                    >
                                                        {student.isActive ? <FaUserSlash /> : <FaUserCheck />}
                                                    </button>
                                                    <button
                                                        title="정보 수정"
                                                        onClick={() => handleEditClick(student)}
                                                        className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-gray-400 transition-all hover:bg-gray-200 hover:text-orange-500 active:scale-95"
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                    <button
                                                        title="삭제"
                                                        onClick={() => handleDelete(student.id, student.name)}
                                                        className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-gray-400 transition-all hover:bg-gray-200 hover:text-red-500 active:scale-95"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-orange-50/30">
                                                <td colSpan="6" className="p-0">
                                                    <div
                                                        className="p-4 md:p-6 flex flex-col gap-6"
                                                        id="payment-form-area"
                                                    >
                                                        <div
                                                            className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border ${paymentForm.id ? 'border-blue-200 ring-2 ring-blue-100' : 'border-orange-100'}`}
                                                        >
                                                            <h4 className="text-sm font-bold text-gray-800 mb-4 flex justify-between items-center">
                                                                <div className="flex items-center gap-2">
                                                                    <FaCreditCard className="text-orange-500" />
                                                                    {paymentForm.id ? (
                                                                        <span className="text-blue-600">수정중...</span>
                                                                    ) : (
                                                                        '결제 등록'
                                                                    )}
                                                                    {selectedUnpaidId && !paymentForm.id && (
                                                                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">
                                                                            미결제 선택됨
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </h4>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
                                                                <div className="form-control">
                                                                    <label className="label-text text-xs font-bold text-gray-500 mb-1">
                                                                        재등록일
                                                                    </label>
                                                                    <input
                                                                        type="date"
                                                                        name="targetDate"
                                                                        className="input input-sm border-gray-200 bg-gray-50"
                                                                        value={paymentForm.targetDate}
                                                                        onChange={handlePaymentFormChange}
                                                                    />
                                                                </div>
                                                                <div className="form-control">
                                                                    <label className="label-text text-xs font-bold text-gray-500 mb-1">
                                                                        결제일
                                                                    </label>
                                                                    <input
                                                                        type="date"
                                                                        name="paymentDate"
                                                                        className="input input-sm border-gray-200 bg-gray-50"
                                                                        value={paymentForm.paymentDate}
                                                                        onChange={handlePaymentFormChange}
                                                                    />
                                                                </div>
                                                                <div className="form-control">
                                                                    <label className="label-text text-xs font-bold text-gray-500 mb-1">
                                                                        수단
                                                                    </label>
                                                                    <select
                                                                        name="method"
                                                                        className="select select-sm border-gray-200 bg-gray-50"
                                                                        value={paymentForm.method}
                                                                        onChange={handlePaymentFormChange}
                                                                    >
                                                                        <option value="card">카드</option>
                                                                        <option value="transfer">이체</option>
                                                                        <option value="cash">현금</option>
                                                                        <option value="deposit">누적금 사용</option>
                                                                    </select>
                                                                </div>
                                                                <div className="form-control">
                                                                    <label className="label-text text-xs font-bold text-gray-500 mb-1">
                                                                        금액
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        name="amount"
                                                                        className="input input-sm border-gray-200 bg-gray-50 font-bold"
                                                                        value={paymentForm.amount}
                                                                        onChange={handlePaymentFormChange}
                                                                    />
                                                                    {/* 추가결제(초과분) — 저장하면 누적 입금으로 자동 적립(메모: 추가결제) */}
                                                                    <input
                                                                        type="number"
                                                                        name="extraAmount"
                                                                        placeholder="+ 추가결제(선택)"
                                                                        className="input input-sm mt-1 border-sky-200 bg-sky-50 text-sky-700 font-bold placeholder:font-normal placeholder:text-sky-400"
                                                                        value={paymentForm.extraAmount}
                                                                        onChange={handlePaymentFormChange}
                                                                    />
                                                                </div>
                                                                <div className="form-control">
                                                                    <label className="label-text text-xs font-bold text-gray-500 mb-1">
                                                                        증빙
                                                                    </label>
                                                                    <label className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 h-8 hover:bg-gray-100 transition-colors">
                                                                        <FaCamera className="text-gray-400" />
                                                                        <span className="text-xs text-gray-600 truncate max-w-[80px]">
                                                                            {paymentFile ? '선택됨' : '사진 첨부'}
                                                                        </span>
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            className="hidden"
                                                                            onClick={(e) => (e.target.value = null)}
                                                                            onChange={(e) =>
                                                                                setPaymentFile(e.target.files[0])
                                                                            }
                                                                        />
                                                                    </label>
                                                                </div>
                                                            </div>
                                                            <div className="mt-4 flex flex-col gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                                                        현금영수증 :{' '}
                                                                        <span className="text-orange-600">
                                                                            {student.cashReceiptMemo || '정보 없음'}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    name="receiptMemo"
                                                                    placeholder="결제 관련 메모..."
                                                                    className="input input-sm border-gray-200 bg-gray-50 w-full"
                                                                    value={paymentForm.receiptMemo}
                                                                    onChange={handlePaymentFormChange}
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    {paymentForm.id && (
                                                                        <button
                                                                            className="btn btn-sm h-10 bg-gray-100 text-gray-500 border-none rounded-xl hover:bg-gray-200"
                                                                            onClick={() =>
                                                                                resetPaymentForm(
                                                                                    calculateTotalAmount(student)
                                                                                )
                                                                            }
                                                                        >
                                                                            <FaUndo className="mr-1" /> 취소
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        className={`btn btn-sm px-6 h-10 border-none rounded-xl text-white shadow-sm hover:shadow-md transition-all ${paymentForm.id ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black hover:bg-gray-800'}`}
                                                                        onClick={() => handlePaymentSave(student)}
                                                                    >
                                                                        <FaCheckCircle className="mr-1" />{' '}
                                                                        {paymentForm.id ? '수정 완료' : '결제 처리'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {unpaidItems.length > 0 && (
                                                            <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                                                <h4 className="text-xs font-bold text-red-500 mb-2">
                                                                    미결제 / 재등록 예정 내역 (클릭하여 처리)
                                                                </h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {unpaidItems.map((item) => (
                                                                        <div
                                                                            key={item.id}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm cursor-pointer transition-all ${selectedUnpaidId === item.id ? 'bg-red-100 border-red-300 ring-2 ring-red-200' : 'bg-white border-red-100 hover:bg-red-50'}`}
                                                                            onClick={() =>
                                                                                handleUnpaidChipClick(student, item)
                                                                            }
                                                                        >
                                                                            <div className="flex flex-col items-center leading-none">
                                                                                <span className="text-[10px] text-gray-400 mb-0.5">
                                                                                    예정일
                                                                                </span>
                                                                                <span className="text-sm font-bold text-red-600">
                                                                                    {item.targetDate}
                                                                                </span>
                                                                            </div>
                                                                            <div className="w-[1px] h-6 bg-red-100 mx-1"></div>
                                                                            <span className="text-xs font-bold text-gray-600">
                                                                                {formatCurrency(item.amount)}원
                                                                            </span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteUnpaid(
                                                                                        student,
                                                                                        item.id
                                                                                    );
                                                                                }}
                                                                                className="text-gray-300 hover:text-red-500 ml-1"
                                                                            >
                                                                                <FaTimesCircle />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* 누적 입금 — 부분결제 임시 보관. 매출·회차와 무관한 순수 메모.
                                                            모여서 한 사이클이 되면 위 '결제 처리'를 하고 '비우기'로 지운다. */}
                                                        {(() => {
                                                            const deposits = student.depositList || [];
                                                            const depositTotal = deposits.reduce(
                                                                (acc, i) => acc + Number(i.amount || 0),
                                                                0
                                                            );
                                                            const dep = tempDeposit?.[student.id] || {};
                                                            const setDep = (patch) =>
                                                                setTempDeposit((prev) => ({
                                                                    ...prev,
                                                                    [student.id]: { ...(prev[student.id] || {}), ...patch },
                                                                }));
                                                            return (
                                                                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                                                                    <div className="mb-3 flex items-center justify-between">
                                                                        <h4 className="flex items-center gap-2 text-xs font-bold text-sky-700">
                                                                            <FaCreditCard className="text-sky-500" />
                                                                            누적 입금 (부분결제 임시 보관)
                                                                        </h4>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-sky-600">
                                                                                누적{' '}
                                                                                <b className="text-sm text-sky-700">
                                                                                    {formatCurrency(depositTotal)}원
                                                                                </b>
                                                                            </span>
                                                                            {deposits.length > 0 && (
                                                                                <button
                                                                                    onClick={() =>
                                                                                        handleClearDeposits(student)
                                                                                    }
                                                                                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 transition-all hover:bg-gray-100 active:scale-95"
                                                                                >
                                                                                    비우기
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* 입력 줄: 금액 + 날짜 + 메모 + 추가 */}
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <input
                                                                            type="number"
                                                                            placeholder="금액"
                                                                            className="input input-sm w-28 border-sky-200 bg-white font-bold"
                                                                            value={dep.amount || ''}
                                                                            onChange={(e) =>
                                                                                setDep({ amount: e.target.value })
                                                                            }
                                                                        />
                                                                        <input
                                                                            type="date"
                                                                            className="input input-sm border-sky-200 bg-white"
                                                                            value={dep.date || ''}
                                                                            onChange={(e) =>
                                                                                setDep({ date: e.target.value })
                                                                            }
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="메모 (예: 현금 일부)"
                                                                            className="input input-sm min-w-[120px] flex-1 border-sky-200 bg-white"
                                                                            value={dep.memo || ''}
                                                                            onChange={(e) =>
                                                                                setDep({ memo: e.target.value })
                                                                            }
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter')
                                                                                    handleAddDeposit(student);
                                                                            }}
                                                                        />
                                                                        <button
                                                                            onClick={() => handleAddDeposit(student)}
                                                                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-sky-700 active:scale-95"
                                                                        >
                                                                            <FaPlus className="text-[10px]" /> 추가
                                                                        </button>
                                                                    </div>

                                                                    {/* 쌓인 입금 줄 목록 */}
                                                                    {deposits.length > 0 && (
                                                                        <div className="mt-3 flex flex-col gap-1.5">
                                                                            {deposits.map((d) => (
                                                                                <div
                                                                                    key={d.id}
                                                                                    className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-sky-100"
                                                                                >
                                                                                    <span className="font-bold text-sky-700">
                                                                                        {formatCurrency(d.amount)}원
                                                                                    </span>
                                                                                    <span className="text-gray-400">
                                                                                        {d.date}
                                                                                    </span>
                                                                                    {d.memo && (
                                                                                        <span className="truncate text-gray-500">
                                                                                            · {d.memo}
                                                                                        </span>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={() =>
                                                                                            handleDeleteDeposit(
                                                                                                student,
                                                                                                d.id
                                                                                            )
                                                                                        }
                                                                                        className="ml-auto text-gray-300 transition-colors hover:text-red-500"
                                                                                    >
                                                                                        <FaTimesCircle />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                                    <FaHistory className="text-orange-500" /> 전체 내역{' '}
                                                                    <span className="text-xs font-normal text-gray-400">
                                                                        (완료: {paymentHistory.length}건 /{' '}
                                                                        {formatCurrency(totalPaidAmount)}원 | 미납:{' '}
                                                                        {unpaidItems.length}건 /{' '}
                                                                        {formatCurrency(totalUnpaidAmount)}
                                                                        원)
                                                                    </span>
                                                                </h4>
                                                                <div className="flex gap-2 items-center">
                                                                    <button
                                                                        onClick={() =>
                                                                            setHistorySort(
                                                                                historySort === 'paymentDate'
                                                                                    ? 'targetDate'
                                                                                    : 'paymentDate'
                                                                            )
                                                                        }
                                                                        className="btn btn-xs bg-gray-100 text-gray-500 hover:bg-gray-200 border-none flex gap-1 items-center"
                                                                    >
                                                                        <FaSort />{' '}
                                                                        {historySort === 'paymentDate'
                                                                            ? '결제일순'
                                                                            : '재등록일순'}
                                                                    </button>
                                                                    {historyTotalPages > 1 && (
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() =>
                                                                                    setHistoryPage((p) =>
                                                                                        Math.max(1, p - 1)
                                                                                    )
                                                                                }
                                                                                disabled={historyPage === 1}
                                                                                className="grid h-7 w-7 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                                                                            >
                                                                                <FaChevronLeft />
                                                                            </button>
                                                                            <span className="text-xs pt-0.5">
                                                                                {historyPage}/{historyTotalPages}
                                                                            </span>
                                                                            <button
                                                                                onClick={() =>
                                                                                    setHistoryPage((p) =>
                                                                                        Math.min(
                                                                                            historyTotalPages,
                                                                                            p + 1
                                                                                        )
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    historyPage === historyTotalPages
                                                                                }
                                                                                className="grid h-7 w-7 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                                                                            >
                                                                                <FaChevronRight />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="w-full overflow-x-auto">
                                                                <table className="table table-xs w-full">
                                                                    <thead>
                                                                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                                                                            <th>회차</th>
                                                                            <th>재등록일</th>
                                                                            <th>결제일</th>
                                                                            <th>금액</th>
                                                                            <th>수단</th>
                                                                            <th>증빙/메모</th>
                                                                            <th className="text-center">사진</th>
                                                                            <th className="text-right">관리</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {displayedHistory.map((pay, i) => {
                                                                            const isUnpaidItem = pay.type === 'unpaid';
                                                                            const label =
                                                                                pay.paymentMethod === 'card'
                                                                                    ? '카드'
                                                                                    : pay.paymentMethod === 'transfer'
                                                                                      ? '이체'
                                                                                      : pay.paymentMethod === 'cash'
                                                                                        ? '현금'
                                                                                        : pay.paymentMethod === 'deposit'
                                                                                          ? '누적금 사용'
                                                                                          : pay.paymentMethod;
                                                                            const extra = Number(pay.extraAmount) || 0;
                                                                            return (
                                                                                <tr
                                                                                    key={
                                                                                        pay.id === 'unpaid'
                                                                                            ? `unpaid-${i}`
                                                                                            : pay.id
                                                                                    }
                                                                                    className={`border-b border-gray-50 last:border-none ${isUnpaidItem ? 'bg-red-50/50' : ''}`}
                                                                                >
                                                                                    <td className="font-bold text-gray-700">
                                                                                        {pay.cycle}
                                                                                        회차
                                                                                    </td>
                                                                                    <td
                                                                                        className={`font-bold ${isUnpaidItem ? 'text-red-500' : 'text-gray-500'}`}
                                                                                    >
                                                                                        {pay.targetDate || '-'}
                                                                                    </td>
                                                                                    <td>
                                                                                        {isUnpaidItem ? (
                                                                                            '-'
                                                                                        ) : (
                                                                                            <span className="font-bold text-gray-700">
                                                                                                {pay.paymentDate}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td>
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <span className="font-bold text-black">
                                                                                                {formatCurrency(
                                                                                                    pay.amount
                                                                                                )}
                                                                                                원
                                                                                            </span>
                                                                                            {!isUnpaidItem && extra > 0 && (
                                                                                                <span
                                                                                                    className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-sky-700"
                                                                                                    title="추가결제(누적 입금으로 적립됨)"
                                                                                                >
                                                                                                    +{formatCurrency(extra)}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                    <td>
                                                                                        {isUnpaidItem ? (
                                                                                            <span className="text-red-500 text-xs font-bold">
                                                                                                미결제
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                                                                                                {label}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td>
                                                                                        <div className="flex flex-col">
                                                                                            {pay.isCashReceipt && (
                                                                                                <span className="text-[10px] text-orange-600 font-bold">
                                                                                                    현금영수증
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="text-gray-500 text-xs truncate max-w-[100px]">
                                                                                                {pay.receiptMemo}
                                                                                            </span>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="text-center">
                                                                                        {pay.imageUrl ? (
                                                                                            <button
                                                                                                onClick={() =>
                                                                                                    setPreviewImage({
                                                                                                        url: pay.imageUrl,
                                                                                                        sid: student.id,
                                                                                                        pid: pay.id,
                                                                                                    })
                                                                                                }
                                                                                                className="grid h-6 w-6 place-items-center rounded-lg text-blue-500 transition-colors hover:bg-blue-50 active:scale-95"
                                                                                            >
                                                                                                <FaImage />
                                                                                            </button>
                                                                                        ) : (
                                                                                            !isUnpaidItem && (
                                                                                                <label className="cursor-pointer text-gray-300 hover:text-blue-500">
                                                                                                    <FaCamera />
                                                                                                    <input
                                                                                                        type="file"
                                                                                                        className="hidden"
                                                                                                        onClick={(e) =>
                                                                                                            (e.target.value =
                                                                                                                null)
                                                                                                        }
                                                                                                        onChange={(e) =>
                                                                                                            handleRetroactivePhotoUpload(
                                                                                                                student.id,
                                                                                                                pay.id,
                                                                                                                e.target
                                                                                                                    .files[0]
                                                                                                            )
                                                                                                        }
                                                                                                    />
                                                                                                </label>
                                                                                            )
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="text-right">
                                                                                        {!isUnpaidItem ? (
                                                                                            <div className="flex justify-end gap-1">
                                                                                                <button
                                                                                                    onClick={() =>
                                                                                                        handleEditHistoryClick(
                                                                                                            pay
                                                                                                        )
                                                                                                    }
                                                                                                    className="text-gray-300 hover:text-blue-500"
                                                                                                >
                                                                                                    <FaEdit className="text-xs" />
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={() =>
                                                                                                        handleDeletePayment(
                                                                                                            student.id,
                                                                                                            pay.id
                                                                                                        )
                                                                                                    }
                                                                                                    className="text-gray-300 hover:text-red-500"
                                                                                                >
                                                                                                    <FaTrash className="text-xs" />
                                                                                                </button>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <span className="text-xs text-gray-400">
                                                                                                상단에서 처리
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-center mt-6 gap-4">
                    <button
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-gray-500 shadow-sm transition-all hover:bg-gray-50 active:scale-95 disabled:text-gray-300 disabled:active:scale-100"
                    >
                        <FaChevronLeft />
                    </button>
                    <span className="font-bold text-gray-600 text-sm">Page {currentPage}</span>
                    <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-gray-500 shadow-sm transition-all hover:bg-gray-50 active:scale-95 disabled:text-gray-300 disabled:active:scale-100"
                    >
                        <FaChevronRight />
                    </button>
                </div>
            </div>
        </div>
    );
}
