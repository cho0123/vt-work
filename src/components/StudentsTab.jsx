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
    activeTab,
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
    searchTerm,
    setSearchTerm,
    studentMemo,
    handleStudentMemoSave,
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
    if (!activeTab) return null;

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-8 lg:px-12 pb-20 gap-6 overflow-y-auto">
            {/* [NEW] 학생관리 탭 상단 메모 */}
            <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                <MemoInput
                    value={studentMemo}
                    onSave={handleStudentMemoSave}
                    placeholder="학생 관리 관련 메모를 입력하세요... (예: 대기자 명단 확인, 신규 문의 연락 등)"
                    label="학생관리 메모"
                    compact
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
                <div className="flex gap-2 w-full md:w-auto">
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
                                                        className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:text-blue-600 hover:bg-blue-50 -ml-2"
                                                        title="전체 출석부 보기"
                                                    >
                                                        <FaCalendarAlt className="text-lg" />
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
                                                {/* 상태 뱃지들 (아래쪽) */}
                                                {/* 상태 뱃지들 (아래쪽) - 디자인 통일 */}
                                                <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none ${student.isActive ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                                                    >
                                                        {student.isActive ? '수강' : '종료'}
                                                    </span>
                                                    {student.isMonthly && (
                                                        <span className="px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none bg-indigo-50 text-indigo-600 border-indigo-100">
                                                            월정산
                                                        </span>
                                                    )}
                                                    {!student.isMonthly &&
                                                        !student.isArtist &&
                                                        rotationStarts.size > 0 && (
                                                            <span className="px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none bg-red-50 text-red-500 border-red-100 flex items-center gap-1">
                                                                <FaExclamationCircle /> 재등록 요망
                                                            </span>
                                                        )}
                                                    {isUnpaid && (
                                                        <span className="px-2 py-0.5 rounded-[4px] border text-[10px] font-bold leading-none bg-red-50 text-red-600 border-red-100">
                                                            {unpaidItems.length}건 미결제
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell">
                                                <div className="flex gap-2">
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
                                                                {Number(w.master) > 0 && (
                                                                    <span className="text-[10px] text-orange-600 font-bold">
                                                                        M({w.master})
                                                                    </span>
                                                                )}
                                                                {Number(w.vocal) > 0 && (
                                                                    <span className="text-[10px] text-blue-600 font-bold">
                                                                        V({w.vocal})
                                                                    </span>
                                                                )}
                                                                {Number(w.vocal30) > 0 && (
                                                                    <span className="text-[10px] text-cyan-600 font-bold">
                                                                        V30({w.vocal30})
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
                                                        className="btn btn-xs btn-square bg-black text-white"
                                                    >
                                                        <FaPlus />
                                                    </button>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        title={student.isActive ? '비활성 전환' : '활성 전환'}
                                                        onClick={() => toggleStatus(student)}
                                                        className="btn btn-sm btn-square border-none bg-gray-100 text-gray-400"
                                                    >
                                                        {student.isActive ? <FaUserSlash /> : <FaUserCheck />}
                                                    </button>
                                                    <button
                                                        title="정보 수정"
                                                        onClick={() => handleEditClick(student)}
                                                        className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-orange-500"
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                    <button
                                                        title="삭제"
                                                        onClick={() => handleDelete(student.id, student.name)}
                                                        className="btn btn-sm btn-square bg-gray-100 border-none text-gray-400 hover:text-red-500"
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
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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
                                                                            className="btn btn-sm btn-ghost text-gray-500"
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
                                                                        className={`btn btn-sm px-6 h-10 border-none text-white ${paymentForm.id ? 'bg-blue-600' : 'bg-black'}`}
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
                                                                                className="btn btn-xs btn-circle btn-ghost"
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
                                                                                className="btn btn-xs btn-circle btn-ghost"
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
                                                                                        : pay.paymentMethod;
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
                                                                                        <span className="font-bold text-black">
                                                                                            {formatCurrency(pay.amount)}
                                                                                            원
                                                                                        </span>
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
                                                                                                className="btn btn-xs btn-square btn-ghost text-blue-500"
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
                        className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"
                    >
                        <FaChevronLeft />
                    </button>
                    <span className="font-bold text-gray-600 text-sm">Page {currentPage}</span>
                    <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="btn btn-circle btn-sm bg-white border-none shadow-sm disabled:text-gray-300"
                    >
                        <FaChevronRight />
                    </button>
                </div>
            </div>
        </div>
    );
}
