import {
    FaEdit,
    FaTrash,
    FaChevronLeft,
    FaChevronRight,
    FaExclamationCircle,
    FaTimesCircle,
    FaUndo,
    FaMoneyBillWave,
    FaFileInvoiceDollar,
    FaCalculator,
    FaStickyNote,
    FaExternalLinkAlt,
    FaLock,
    FaLockOpen,
} from 'react-icons/fa';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MemoInput } from './MemoInput.jsx';
import { formatDateLocal } from '../utils/date.js';
import { formatCurrency } from '../utils/money.js';
import { expenseDefaults } from '../constants/expenses.js';

/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
export function SettlementTab({
    currentDate,
    handleYearChange,
    handleMonthChange,
    changeMonth,
    fetchSettlementData,
    settlementStatus,
    handleToggleSettlementStatus,
    settlementMemo,
    handleSettlementMemoSave,
    settlementIncome,
    settlementUnpaid,
    totalUnpaid,
    monthlySchedules,
    currentMonthExpenses,
    currentMonthTotalExpense,
    currentMonthTotalRevenue,
    currentMonthNetProfit,
    currentMonthRevenueBreakdown,
    currentMonthPrefix,
    expenses,
    expenseForm,
    editingExpenseId,
    handleExpenseChange,
    handleExpenseSubmit,
    handleExpenseDelete,
    handleEditExpenseClick,
    cancelExpenseEdit,
    handleGoToStudent,
    handleDeletePayment,
    students,
}) {
    return (
        <div className="flex flex-col gap-6 p-4 md:p-8 lg:px-12 pb-20 overflow-y-auto">
            {/* 상단 컨트롤러 */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
                        <button onClick={() => changeMonth(-1)} className="btn btn-circle btn-sm btn-ghost">
                            <FaChevronLeft />
                        </button>
                        <div className="flex items-center mx-2">
                            <select
                                className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-24 focus:outline-none"
                                value={currentDate.getFullYear()}
                                onChange={handleYearChange}
                            >
                                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                                    <option key={y} value={y}>
                                        {y}년
                                    </option>
                                ))}
                            </select>
                            <select
                                className="select select-sm bg-transparent border-none font-extrabold text-lg text-center w-20 focus:outline-none"
                                value={currentDate.getMonth() + 1}
                                onChange={handleMonthChange}
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <option key={m} value={m}>
                                        {m}월
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button onClick={() => changeMonth(1)} className="btn btn-circle btn-sm btn-ghost">
                            <FaChevronRight />
                        </button>
                    </div>
                    {/* [NEW] 정산 마감 토글 버튼 */}
                    <button
                        onClick={handleToggleSettlementStatus}
                        className={`btn btn-sm px-4 rounded-xl border-none shadow-sm transition-all font-bold ${
                            settlementStatus === 'completed'
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200'
                                : 'bg-green-50 text-green-600 hover:bg-green-100 ring-1 ring-green-200'
                        }`}
                    >
                        {settlementStatus === 'completed' ? (
                            <>
                                <FaLock className="mr-1" /> 정산완료
                            </>
                        ) : (
                            <>
                                <FaLockOpen className="mr-1" /> 정산예정
                            </>
                        )}
                    </button>
                    <div className="flex-1"></div> {/* Spacer */}
                    <button onClick={fetchSettlementData} className="btn btn-sm btn-ghost text-gray-400">
                        <FaUndo className="mr-1" /> 새로고침
                    </button>
                </div>

                {/* 월별 메모 */}
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                    <MemoInput
                        value={settlementMemo}
                        onSave={handleSettlementMemoSave}
                        placeholder="이달의 정산 특이사항 입력..."
                        label="메모"
                        icon={<FaStickyNote className="text-yellow-500 text-base" />}
                    />
                </div>
            </div>

            {/* 요약 카드 (슬림형) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* 1. 총 매출 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-1">
                        <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                            <FaMoneyBillWave className="text-green-500" /> 총 매출
                        </div>
                        <div className="text-[11px] text-gray-400">
                            (완료 {settlementIncome.length} / 미납 {settlementUnpaid.length})
                        </div>
                    </div>
                    <div className="text-xl font-extrabold text-gray-800 tracking-tight">
                        {formatCurrency(currentMonthTotalRevenue)}원
                    </div>
                    {/* [NEW] 상세 내역 표시 */}
                    <div className="flex gap-2 mt-2 text-[10px] font-bold text-gray-400 bg-gray-50 rounded-lg px-2 py-1">
                        <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                            M: {formatCurrency(currentMonthRevenueBreakdown.master)}
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            V: {formatCurrency(currentMonthRevenueBreakdown.vocal)}
                        </span>
                    </div>
                </div>

                {/* 2. 총 지출 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-1">
                        <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                            <FaFileInvoiceDollar className="text-red-500" /> 총 지출
                        </div>
                        <div className="text-[11px] text-gray-400">({currentMonthExpenses.length}건)</div>
                    </div>
                    <div className="text-xl font-extrabold text-gray-800 tracking-tight">
                        {formatCurrency(currentMonthTotalExpense)}원
                    </div>
                </div>

                {/* 3. 순수익 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 bg-blue-50/50">
                    <div className="flex justify-between items-start mb-1">
                        <div className="text-xs font-bold text-blue-500 flex items-center gap-2">
                            <FaCalculator /> 순수익 (예상)
                        </div>
                    </div>
                    <div className="text-xl font-extrabold text-blue-600 tracking-tight">
                        {formatCurrency(currentMonthNetProfit)}원
                    </div>
                </div>

                {/* 4. 미수금 */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-1">
                        <div className="text-xs font-bold text-gray-400 flex items-center gap-2">
                            <FaExclamationCircle className="text-orange-500" /> 미수금
                        </div>
                        <div className="text-[11px] text-orange-400 font-bold">
                            ({settlementUnpaid.length}건 미결제)
                        </div>
                    </div>
                    <div className="text-xl font-extrabold text-gray-400 tracking-tight">
                        {formatCurrency(totalUnpaid)}원
                    </div>
                </div>
            </div>

            {/* 하단 상세 내역 (수익 내역 / 지출 관리) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. 수익 내역 */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800">수익 내역</h3>
                        <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                            입금완료
                        </span>
                    </div>
                    <div className="p-4">
                        <table className="table table-sm w-full">
                            <thead>
                                <tr className="text-gray-400">
                                    <th>재등록일</th>
                                    <th>이름</th>
                                    <th>금액</th>
                                    <th>결제일(수단)</th>
                                    <th className="text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {settlementIncome.map((item, i) => (
                                    <tr
                                        key={i}
                                        className="border-b border-gray-50 last:border-none cursor-pointer hover:bg-gray-50"
                                        onClick={() => handleGoToStudent(item.studentId, item.studentName)}
                                    >
                                        <td className="font-bold text-gray-600">{item.targetDate}</td>
                                        <td className="font-bold flex items-center gap-1">
                                            {item.studentName}
                                            <FaExternalLinkAlt className="text-[10px] text-gray-300" />
                                        </td>
                                        <td className="font-bold text-blue-600">{formatCurrency(item.amount)}</td>
                                        <td className="text-xs text-gray-400 flex items-center gap-1">
                                            <span className="font-bold text-gray-600">{item.paymentDate}</span>
                                            <span>
                                                (
                                                {item.paymentMethod === 'card'
                                                    ? '카드'
                                                    : item.paymentMethod === 'transfer'
                                                      ? '이체'
                                                      : '현금'}
                                                )
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePayment(item.studentId, item.id);
                                                }}
                                                className="text-gray-300 hover:text-red-500"
                                            >
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {settlementIncome.length === 0 && (
                            <div className="text-center text-gray-300 py-10">내역이 없습니다.</div>
                        )}
                    </div>

                    {/* 미수금 예정 리스트 */}
                    <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <h4 className="text-xs font-bold text-gray-500 mb-2">미수금 예정 리스트</h4>
                        <div className="">
                            <table className="table table-xs w-full">
                                <tbody>
                                    {settlementUnpaid.map((item, i) => (
                                        <tr
                                            key={i}
                                            className="border-none cursor-pointer hover:bg-gray-50"
                                            onClick={() => handleGoToStudent(item.studentId, item.studentName)}
                                        >
                                            <td className="text-gray-400">{item.targetDate}</td>
                                            <td className="text-gray-600 font-bold flex items-center gap-1">
                                                {item.studentName}
                                                <FaExternalLinkAlt className="text-[10px] text-gray-300" />
                                            </td>
                                            <td className="text-gray-400">{formatCurrency(item.amount)}원</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 2. 지출 관리 */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[600px]">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800">지출 관리</h3>
                        <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">지출등록</span>
                    </div>

                    {/* 지출 입력 폼 */}
                    <div className="p-4 bg-gray-50 m-4 rounded-2xl border border-gray-200">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                                type="date"
                                name="date"
                                className="input input-sm bg-white border-gray-200"
                                value={expenseForm.date}
                                onChange={handleExpenseChange}
                            />
                            <select
                                name="category"
                                className="select select-sm bg-white border-gray-200"
                                value={expenseForm.category}
                                onChange={handleExpenseChange}
                            >
                                {/* 동적 카테고리 필터링: 이미 등록된 항목 제외 */}
                                {(() => {
                                    const registeredCats = new Set(
                                        currentMonthExpenses.filter((e) => e.category !== '기타').map((e) => e.category)
                                    );
                                    // 현재 수정중인 항목의 카테고리는 선택 가능해야 함
                                    if (editingExpenseId) {
                                        const editingItem = expenses.find((e) => e.id === editingExpenseId);
                                        if (editingItem) registeredCats.delete(editingItem.category);
                                    }

                                    return Object.keys(expenseDefaults)
                                        .filter((k) => k === '기타' || !registeredCats.has(k))
                                        .map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ));
                                })()}
                            </select>
                        </div>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="number"
                                name="amount"
                                placeholder="금액"
                                className="input input-sm bg-white border-gray-200 w-1/3 font-bold"
                                value={expenseForm.amount}
                                onChange={handleExpenseChange}
                            />
                            <input
                                type="text"
                                name="memo"
                                placeholder="메모"
                                className="input input-sm bg-white border-gray-200 flex-1"
                                value={expenseForm.memo}
                                onChange={handleExpenseChange}
                            />
                        </div>
                        <div className="flex gap-2">
                            {editingExpenseId && (
                                <button onClick={cancelExpenseEdit} className="btn btn-sm btn-ghost flex-1">
                                    취소
                                </button>
                            )}
                            <button
                                onClick={handleExpenseSubmit}
                                className={`btn btn-sm ${editingExpenseId ? 'bg-blue-600' : 'bg-black'} text-white flex-1 border-none shadow-md hover:shadow-lg transition-all rounded-xl`}
                            >
                                {editingExpenseId ? '수정 완료' : '지출 추가'}
                            </button>
                        </div>
                    </div>

                    {/* 지출 리스트 */}
                    <div className="flex-1 p-4 pt-0">
                        <table className="table table-sm w-full">
                            <thead>
                                <tr className="text-gray-400">
                                    <th>날짜</th>
                                    <th>항목</th>
                                    <th>금액</th>
                                    <th>메모</th>
                                    <th className="text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentMonthExpenses.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-50 last:border-none">
                                        <td className="text-gray-500">{item.date}</td>
                                        <td className="font-bold text-gray-700">{item.category}</td>
                                        <td className="font-bold text-red-500">-{formatCurrency(item.amount)}</td>
                                        <td className="text-xs text-gray-400">{item.memo}</td>
                                        <td className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => handleEditExpenseClick(item)}
                                                    className="text-gray-300 hover:text-blue-500"
                                                >
                                                    <FaEdit />
                                                </button>
                                                <button
                                                    onClick={() => handleExpenseDelete(item.id)}
                                                    className={`text-gray-300 ${item.paidDate ? 'cursor-not-allowed opacity-30' : 'hover:text-red-500'}`}
                                                    disabled={!!item.paidDate}
                                                >
                                                    <FaTimesCircle />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {currentMonthExpenses.length === 0 && (
                            <div className="text-center text-gray-300 py-10">지출 내역이 없습니다.</div>
                        )}

                        {/* 보컬 진행 지출 관리 영역 */}
                        {(() => {
                            const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

                            const vocalCompletedEvents = monthlySchedules
                                .filter(
                                    (s) =>
                                        s.gridType === 'vocal' &&
                                        s.status === 'completed' &&
                                        s.isVocalProgress &&
                                        s.date.startsWith(currentMonthPrefix)
                                )
                                .sort((a, b) => a.date.localeCompare(b.date));

                            const totalVocalWage = vocalCompletedEvents.reduce((acc, curr) => {
                                const cost = curr.vocalType === '30' ? 15000 : 30000;
                                return acc + cost;
                            }, 0);

                            const existingWageExpense = expenses.find(
                                (e) => e.category === '임금' && e.isVocalWage && e.targetMonth === currentMonthPrefix
                            );

                            return (
                                <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50 rounded-xl p-4 mb-4">
                                    <h4 className="text-sm font-bold text-gray-700 mb-2 flex justify-between items-center">
                                        <span>{currentDate.getMonth() + 1}월 보컬 추가 수업</span>
                                        <span className="text-blue-600">
                                            {formatCurrency(totalVocalWage)}원{' '}
                                            <span className="text-xs text-gray-400">
                                                ({vocalCompletedEvents.length}건)
                                            </span>
                                        </span>
                                    </h4>
                                    <div className="text-xs text-gray-500 mb-2">
                                        {currentDate.getMonth() + 1}월 보컬추가 : {formatCurrency(totalVocalWage)}원
                                        (1H: 30,000 / 30m: 15,000)
                                    </div>

                                    <div className="bg-white rounded-lg border border-gray-200 mb-3 max-h-32 overflow-y-auto">
                                        {vocalCompletedEvents.length === 0 ? (
                                            <div className="text-center text-gray-300 py-3 text-xs">해당 내역 없음</div>
                                        ) : (
                                            <table className="table table-xs w-full">
                                                <tbody>
                                                    {vocalCompletedEvents.map((ev, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className="border-b border-gray-50 last:border-none"
                                                        >
                                                            <td className="text-gray-500 w-24 pl-4">
                                                                {ev.date.substring(5).replace('-', '월') + '일'}
                                                            </td>
                                                            <td className="font-bold text-gray-700">
                                                                {ev.studentName} (
                                                                {ev.vocalType === '30' ? '30분' : '1시간'})
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    {vocalCompletedEvents.length > 0 &&
                                        (existingWageExpense ? (
                                            existingWageExpense.paidDate ? (
                                                <button
                                                    disabled
                                                    className="btn btn-sm w-full bg-green-100 text-green-600 border-none rounded-xl font-bold"
                                                >
                                                    지급 완료 ({existingWageExpense.paidDate})
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={async () => {
                                                        if (
                                                            !window.confirm(
                                                                `${formatCurrency(totalVocalWage)}원을 지급 처리하시겠습니까?`
                                                            )
                                                        )
                                                            return;
                                                        try {
                                                            await updateDoc(
                                                                doc(db, 'expenses', existingWageExpense.id),
                                                                {
                                                                    paidDate: formatDateLocal(new Date()),
                                                                    memo: existingWageExpense.memo + ' [지급완료]',
                                                                }
                                                            );
                                                            fetchSettlementData();
                                                        } catch (e) {
                                                            console.error(e);
                                                            alert('처리 실패');
                                                        }
                                                    }}
                                                    className="btn btn-sm w-full bg-blue-600 text-white border-none hover:bg-blue-700 shadow-md rounded-xl"
                                                >
                                                    지급 하기
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    if (
                                                        !window.confirm(
                                                            `${currentDate.getMonth() + 1}월 보컬 수업료 ${formatCurrency(totalVocalWage)}원을 지출로 등록하시겠습니까?`
                                                        )
                                                    )
                                                        return;
                                                    try {
                                                        await addDoc(collection(db, 'expenses'), {
                                                            date: formatDateLocal(currentDate), // [FIX] 현재 보고 있는 월의 날짜로 등록
                                                            category: '임금',
                                                            amount: totalVocalWage,
                                                            memo: `${currentDate.getMonth() + 1}월 보컬 수업료 (${vocalCompletedEvents.length}건)`,
                                                            isVocalWage: true,
                                                            targetMonth: currentMonthPrefix,
                                                            paidDate: null,
                                                        });
                                                        fetchSettlementData();
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert('등록 실패');
                                                    }
                                                }}
                                                className="btn btn-sm w-full bg-black text-white border-none hover:bg-gray-800 shadow-md rounded-xl"
                                            >
                                                지출 등록
                                            </button>
                                        ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
}
