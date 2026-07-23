/**
 * App.jsx 에서 그대로 옮긴 블록.
 * 본문 JSX 를 손대지 않기 위해 prop 이름도 원래 변수명을 유지한다.
 */
import { useState } from 'react';

export function StudentFormModal({
    isModalOpen,
    editingId,
    formData,
    setFormData,
    closeModal,
    handleChange,
    handlePhoneChange,
    handleRateChange,
    handleSubmit,
    calculateTotalAmount,
}) {
    const [changeDate, setChangeDate] = useState('');
    if (!isModalOpen) return null;

    // 로테이션 이력(구간). 없으면 현재 설정 하나. 그리드는 항상 '마지막(현재)' 구간을 편집한다.
    const history =
        Array.isArray(formData.scheduleHistory) && formData.scheduleHistory.length
            ? formData.scheduleHistory
            : [{ from: formData.firstDate || '', schedule: formData.schedule }];
    const curIdx = history.length - 1;
    const currentSchedule = history[curIdx].schedule || formData.schedule;

    const syncHistory = (h) => setFormData({ ...formData, scheduleHistory: h, schedule: h[h.length - 1].schedule });
    const editCell = (i, field, v) => {
        const val = v.replace(/[^0-9.]/g, '');
        syncHistory(
            history.map((p, idx) =>
                idx === curIdx
                    ? { ...p, schedule: p.schedule.map((w, j) => (j === i ? { ...w, [field]: val } : w)) }
                    : p
            )
        );
    };
    const applyRotationChange = () => {
        if (!changeDate) return alert('변경 적용일을 먼저 선택하세요.');
        const base = history.map((p, idx) => (idx === 0 && !p.from ? { ...p, from: formData.firstDate || '' } : p));
        syncHistory([...base, { from: changeDate, schedule: base[base.length - 1].schedule.map((w) => ({ ...w })) }]);
        setChangeDate('');
    };
    const removeRotationChange = (i) => syncHistory(history.filter((_, idx) => idx !== i));

    const cfgLabel = (sch) => {
        let m = 0;
        let v = 0;
        let v30 = 0;
        (sch || []).forEach((w) => {
            m += Number(w.master || 0);
            v += Number(w.vocal || 0);
            v30 += Number(w.vocal30 || 0);
        });
        return `M${m}V${v}${v30 ? `V30·${v30}` : ''}`;
    };
    const cfgAmt = (sch) => {
        const a = calculateTotalAmount ? calculateTotalAmount({ ...formData, schedule: sch }) : 0;
        return Math.round(a / 10000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 md:p-10 transform transition-all">
                {/* 헤더 */}
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                        {editingId ? '수강생 정보 수정' : '신규 수강생 등록'}
                    </h2>
                    <button
                        onClick={closeModal}
                        className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:bg-gray-100"
                    >
                        ✕
                    </button>
                </div>

                <div className="space-y-6">
                    {/* 1. 이름 / 연락처 / 상태 (1열 배치) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-4">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">이름</label>
                            <input
                                type="text"
                                name="name"
                                className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                                placeholder="이름"
                                value={formData.name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="md:col-span-4">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">연락처</label>
                            <input
                                type="text"
                                name="phone"
                                className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                                placeholder="010-0000-0000"
                                value={formData.phone}
                                onChange={handlePhoneChange}
                                maxLength="13"
                            />
                        </div>
                        <div className="md:col-span-4 flex gap-2">
                            <label
                                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-12 rounded-2xl border-2 transition-all ${formData.isMonthly ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}
                            >
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-primary rounded-md"
                                    checked={formData.isMonthly}
                                    onChange={(e) => setFormData({ ...formData, isMonthly: e.target.checked })}
                                />
                                <span className="text-xs font-bold">월정산</span>
                            </label>
                            <label
                                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-12 rounded-2xl border-2 transition-all ${formData.isArtist ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}
                            >
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-secondary rounded-md"
                                    checked={formData.isArtist}
                                    onChange={(e) => setFormData({ ...formData, isArtist: e.target.checked })}
                                />
                                <span className="text-xs font-bold">아티스트</span>
                            </label>
                        </div>
                    </div>

                    {/* 2. 최초등록일 / 회차 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">
                                최초 등록일{' '}
                                <span className="text-[10px] font-normal text-blue-400 ml-1">(수정 가능)</span>
                            </label>
                            <input
                                type="date"
                                name="firstDate"
                                className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                                value={formData.firstDate}
                                onChange={handleChange}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">등록 회차</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    name="count"
                                    className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-bold text-lg text-gray-900 h-12 px-5"
                                    value={formData.count}
                                    onChange={handleChange}
                                />
                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                                    회차
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 3. 수업 회차 설정 (표 형태) + 로테이션 변경 */}
                    <div>
                        <div className="flex items-center gap-2 mb-2 mt-2 px-1">
                            <h3 className="text-sm font-bold text-gray-900 ml-1 whitespace-nowrap">주차별 수업 설정</h3>
                            <div className="h-[1px] flex-1 bg-gray-100"></div>
                            {/* 이 날짜부터 아래 표 설정으로 바뀌었다고 기록 */}
                            <input
                                type="date"
                                value={changeDate}
                                onChange={(e) => setChangeDate(e.target.value)}
                                title="변경 적용일"
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-100"
                            />
                            <button
                                type="button"
                                onClick={applyRotationChange}
                                className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-gray-700 active:scale-95 whitespace-nowrap"
                            >
                                로테이션 변경
                            </button>
                        </div>

                        <div className="bg-gray-50 p-5 rounded-[2rem] border border-gray-100">
                            {/* 테이블 헤더 */}
                            <div className="grid grid-cols-7 gap-3 mb-2 text-center">
                                <div className="col-span-1 text-[10px] font-extrabold text-gray-400 uppercase">
                                    Week
                                </div>
                                <div className="col-span-2 text-[10px] font-extrabold text-orange-400 uppercase">
                                    Master
                                </div>
                                <div className="col-span-2 text-[10px] font-extrabold text-blue-400 uppercase">
                                    Vocal
                                </div>
                                <div className="col-span-2 text-[10px] font-extrabold text-cyan-400 uppercase">
                                    Vocal(30)
                                </div>
                            </div>

                            {/* 테이블 바디 — 현재(마지막) 구간 설정을 편집 */}
                            <div className="space-y-2">
                                {currentSchedule.map((week, idx) => (
                                    <div key={idx} className="grid grid-cols-7 gap-3 items-center">
                                        <div className="col-span-1 flex justify-center">
                                            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-500">
                                                {idx + 1}
                                            </span>
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="number"
                                                placeholder="-"
                                                className="input input-sm w-full text-center bg-white border-transparent focus:border-orange-400 focus:ring-2 focus:ring-orange-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                                                value={week.master}
                                                onChange={(e) => editCell(idx, 'master', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="number"
                                                placeholder="-"
                                                className="input input-sm w-full text-center bg-white border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                                                value={week.vocal}
                                                onChange={(e) => editCell(idx, 'vocal', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="number"
                                                placeholder="-"
                                                className="input input-sm w-full text-center bg-white border-transparent focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 rounded-xl font-bold text-gray-800 shadow-sm h-9"
                                                value={week.vocal30}
                                                onChange={(e) => editCell(idx, 'vocal30', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 로테이션 변경 이력 표기 (예: M2V4(90) → V4(50) (2026-07-10)) */}
                        {history.length >= 2 && (
                            <div className="mt-3 flex flex-col gap-1.5 px-1">
                                <span className="text-[11px] font-bold text-gray-400">변경 이력</span>
                                {history.slice(1).map((p, k) => {
                                    const i = k + 1;
                                    const prev = history[i - 1];
                                    return (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            <span className="font-semibold text-gray-600">
                                                {cfgLabel(prev.schedule)}
                                                <span className="text-gray-400">({cfgAmt(prev.schedule)})</span> →{' '}
                                                {cfgLabel(p.schedule)}
                                                <span className="text-gray-400">({cfgAmt(p.schedule)})</span>{' '}
                                                <span className="font-bold text-orange-500">({p.from})</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeRotationChange(i)}
                                                className="text-red-300 hover:text-red-500"
                                                title="이 변경 기록 삭제"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 4. 마스터 / 보컬 단가 (0 비활성화 처리) */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1.5 ml-2 block">
                                Master 회당 단가
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className="input w-full bg-gray-50 border-none rounded-2xl font-bold text-gray-800 pr-8 text-right h-12 focus:bg-white focus:ring-2 focus:ring-orange-100"
                                    placeholder="0"
                                    /* [수정] 값이 0이면 빈 문자열로 처리하여 입력 시 0이 사라지게 함 */
                                    value={
                                        Number(formData.rates.master) === 0
                                            ? ''
                                            : Number(formData.rates.master).toLocaleString()
                                    }
                                    onChange={(e) => handleRateChange('master', e.target.value)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                                    원
                                </span>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1.5 ml-2 block">Vocal 회당 단가</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className="input w-full bg-gray-50 border-none rounded-2xl font-bold text-gray-800 pr-8 text-right h-12 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                    placeholder="0"
                                    /* [수정] 값이 0이면 빈 문자열로 처리 */
                                    value={
                                        Number(formData.rates.vocal) === 0
                                            ? ''
                                            : Number(formData.rates.vocal).toLocaleString()
                                    }
                                    onChange={(e) => handleRateChange('vocal', e.target.value)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                                    원
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 5. 메모 / 현금영수증 메모 */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">메모</label>
                            <input
                                type="text"
                                name="memo"
                                className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-medium text-gray-800 h-12 px-5"
                                placeholder="특이사항 입력"
                                value={formData.memo}
                                onChange={handleChange}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1.5 ml-2 block">현금영수증 메모</label>
                            <input
                                type="text"
                                name="cashReceiptMemo"
                                className="input w-full bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-black/5 rounded-2xl font-medium text-gray-800 h-12 px-5"
                                placeholder="현금영수증 관련 메모"
                                value={formData.cashReceiptMemo || ''}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>

                {/* 6. 버튼 */}
                <div className="mt-8 flex gap-4">
                    <button
                        onClick={closeModal}
                        className="btn btn-lg h-14 min-h-[3.5rem] flex-1 bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-gray-300 rounded-2xl font-bold text-base shadow-sm transition-all"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn btn-lg h-14 min-h-[3.5rem] flex-[2] bg-gray-900 border-none text-white hover:bg-black hover:scale-[1.01] active:scale-[0.99] rounded-2xl font-bold text-base shadow-xl shadow-gray-300 transition-all"
                    >
                        {editingId ? '저장하기' : '등록하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
