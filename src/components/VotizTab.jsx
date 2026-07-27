// 짱구 어카운트(보티즈-정산) — 스케쥴 앱에 통합한 버전.
// 자체 로그인/App 래퍼는 걷어내고, 스케쥴 앱의 공유 db·로그인(user)을 그대로 쓴다.
// 컬렉션은 스케쥴 데이터와 분리하기 위해 acc_projects / acc_transactions 사용.
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// ──[ 1. 유틸리티 함수 ]──
const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const parseNumber = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    return Number(str.replace(/,/g, ''));
};

// ──[ 메인: 보티즈-정산 탭 ]──
// 스케쥴 앱에서 로그인한 user 를 그대로 받는다. (자체 로그인 화면 제거)
export function VotizTab({ user }) {
  const [activeTab, setActiveTab] = useState('voicetuning');
  const [transactions, setTransactions] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');

  const handleMonthClick = (year, month) => {
      setSelectedYear(year);
      setSelectedMonth(Number(month).toString());
  };
  
  const resetPeriod = () => {
      setSelectedYear('all');
      setSelectedMonth('all');
  };

  // [보안 추가] 모든 데이터 로드시 내 UID인 것만 가져오도록 쿼리를 적용했습니다.
  const fetchData = async () => {
    const projQuery = query(collection(db, "acc_projects"), where("uid", "==", user.uid));
    const projSnapshot = await getDocs(projQuery);
    const sortedProjects = projSnapshot.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => b.name.localeCompare(a.name)); 
    setProjects(sortedProjects);

    const transQuery = query(collection(db, "acc_transactions"), where("uid", "==", user.uid));
    const transSnapshot = await getDocs(transQuery);
    setTransactions(transSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
  };

  useEffect(() => { fetchData(); }, []);

  const filteredTransactions = transactions.filter(t => {
      if (selectedYear === 'all') return true;
      if (selectedMonth === 'all') return t.date.startsWith(selectedYear);
      const formattedMonth = selectedMonth.padStart(2, '0');
      return t.date.startsWith(`${selectedYear}-${formattedMonth}`);
  });

  const votizCategories = {
    income: { source: '음원수익', performance: '공연수익', other: '기타수익' }, 
    expense: { production: '제작비', marketing: '마케팅비' }
  };
  
  const productionSub = {
    songFee: ['작곡', '작사', '편곡', '기타'],
    recording: ['녹음실', '세션비', '보컬', '악기세팅', '녹음진행비'],
    post: ['믹싱', '마스터링', '튠', '에디팅'],
    video: ['뮤직비디오', '쇼케이스', '컨텐츠', '영상진행비'],
    other: ['기타 진행비']
  };

  const getPeriodText = () => {
      if(selectedYear === 'all') return "전체 기간";
      if(selectedMonth === 'all') return `${selectedYear}년 전체`;
      return `${selectedYear}년 ${selectedMonth}월`;
  };

  // 상단 총정산 요약: 분야별 총수입·총지출·순수익. 유튜브는 달러라 총정산에서 뺀다.
  const sumBy = (filterFn) => {
      const income = filteredTransactions.filter(t => t.type === 'income' && filterFn(t)).reduce((a, c) => a + Number(c.totalAmount || c.amount || 0), 0);
      const expense = filteredTransactions.filter(t => t.type === 'expense' && filterFn(t)).reduce((a, c) => a + Number(c.totalAmount || c.amount || 0), 0);
      return { income, expense, profit: income - expense };
  };
  const summary = {
      total: sumBy(t => t.division !== 'youtube'),
      vt: sumBy(t => t.division === 'voicetuning'),
      vz: sumBy(t => t.division === 'votiz' || t.division === 'copyright'),
      yt: sumBy(t => t.division === 'youtube'),
  };
  const DIVISION_TABS = [
      { key: 'voicetuning', label: '보이스튜닝' },
      { key: 'votiz', label: '보티즈' },
      { key: 'copyright', label: '저작권' },
      { key: 'youtube', label: '유튜브' },
  ];

  return (
    <div className="flex flex-col h-full w-full gap-6 p-4 md:p-8 lg:px-12 pb-20 overflow-y-auto font-sans">
        {/* 기간 선택 */}
        <div className="shrink-0 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-sm font-bold text-gray-400">📅</span>
                <select value={selectedYear} onChange={(e) => {setSelectedYear(e.target.value); if(e.target.value==='all') setSelectedMonth('all');}} className="bg-gray-50 font-bold text-gray-700 p-2 rounded-lg outline-none cursor-pointer">
                    <option value="all">전체 년도</option>
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                {selectedYear !== 'all' && (
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={`font-bold p-2 rounded-lg outline-none cursor-pointer transition-colors ${selectedMonth === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-50 text-gray-700'}`}>
                        <option value="all">1년 전체</option>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                )}
                <button onClick={resetPeriod} className="text-xs font-bold bg-gray-800 text-white px-3 py-2 rounded-lg hover:bg-gray-700">전체 기간</button>
            </div>
            <span className="text-xs font-medium text-gray-400">현재 조회: {getPeriodText()}</span>
        </div>

        {/* 상단 총정산 요약 카드 (총수입·총지출·순수익) */}
        <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 text-white p-4 rounded-2xl shadow-sm">
                <div className="text-xs font-bold text-gray-400">총정산 순수익</div>
                <div className={`text-xl md:text-2xl font-extrabold mt-1 ${summary.total.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatNumber(summary.total.profit)}원</div>
                <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between text-[11px] font-medium">
                    <span className="text-blue-300">수입 +{formatNumber(summary.total.income)}</span>
                    <span className="text-red-300">지출 -{formatNumber(summary.total.expense)}</span>
                </div>
            </div>
            {[
                { key: 'vt', label: '보이스튜닝', color: 'text-blue-600' },
                { key: 'vz', label: '보티즈 (저작권 포함)', color: 'text-blue-600' },
                { key: 'yt', label: '유튜브 (USD)', color: 'text-purple-600' },
            ].map(({ key, label, color }) => (
                <div key={key} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-gray-400">{label}</span>
                        {key === 'yt' && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">총정산 포함X</span>
                        )}
                    </div>
                    <div className={`text-lg md:text-xl font-extrabold mt-1 ${summary[key].profit >= 0 ? color : 'text-red-500'}`}>
                        {formatNumber(summary[key].profit)}{key === 'yt' ? '' : '원'}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[11px] font-medium">
                        <span className="text-blue-500">수입 +{formatNumber(summary[key].income)}</span>
                        <span className="text-red-400">지출 -{formatNumber(summary[key].expense)}</span>
                    </div>
                </div>
            ))}
        </div>

        {/* 분야 탭 (4개) */}
        <div className="shrink-0 bg-gray-200/70 p-1 rounded-2xl flex gap-1 w-full md:w-fit">
          {DIVISION_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 md:flex-none py-2 px-5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* 선택 분야 상세 */}
        <div>
          {activeTab === 'voicetuning' && <VoiceTuning user={user} transactions={filteredTransactions} refresh={fetchData} isSummaryMode={selectedYear === 'all'} categoryMap={votizCategories} />}
          {activeTab === 'votiz' && <Votiz user={user} projects={projects} filteredTransactions={filteredTransactions} allTransactions={transactions} refresh={fetchData} categories={votizCategories} subCats={productionSub} isSummaryMode={selectedMonth === 'all' || selectedYear === 'all'} onMonthClick={handleMonthClick} resetPeriod={resetPeriod} />}
          {activeTab === 'copyright' && <CopyrightSection user={user} transactions={filteredTransactions} refresh={fetchData} isSummaryMode={selectedYear === 'all'} />}
          {activeTab === 'youtube' && <YoutubeSection user={user} transactions={filteredTransactions} refresh={fetchData} isSummaryMode={selectedYear === 'all'} />}
        </div>
    </div>
  );
}

const inputClass = "w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 outline-none transition text-sm";
const selectClass = "w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 outline-none transition text-sm appearance-none";

// ──[ 4. 대시보드 ]──
function Dashboard({ transactions, periodText }) {
  const calculateTotal = (filterFn) => {
    const incomeKRW = transactions.filter(t => t.type === 'income' && t.division !== 'youtube' && filterFn(t)).reduce((acc, cur) => acc + Number(cur.totalAmount || cur.amount), 0);
    const incomeUSD = transactions.filter(t => t.type === 'income' && t.division === 'youtube' && filterFn(t)).reduce((acc, cur) => acc + Number(cur.totalAmount || cur.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense' && filterFn(t)).reduce((acc, cur) => acc + Number(cur.totalAmount || cur.amount), 0);
    return { incomeKRW, incomeUSD, expense, profitKRW: incomeKRW - expense };
  };
  
  const total = calculateTotal(() => true);
  const vt = calculateTotal(t => t.division === 'voicetuning');
  const vz = calculateTotal(t => t.division === 'votiz' || t.division === 'copyright');
  const cpOnly = calculateTotal(t => t.division === 'copyright');
  const yt = calculateTotal(t => t.division === 'youtube');

  return (
    <div className="space-y-4">
      <SummaryCard title={`${periodText} 합계`} data={total} theme="dark" />
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard title="보이스튜닝" data={vt} ytData={yt} theme="purple" />
        <SummaryCard title="보티즈 (저작권 포함)" data={vz} subData={cpOnly} theme="blue" />
      </div>
    </div>
  );
}

function SummaryCard({ title, data, subData, ytData, theme }) {
  const themes = { dark: "bg-gray-900 text-white", purple: "bg-white text-gray-800 border-purple-100 border-2", blue: "bg-white text-gray-800 border-blue-100 border-2" };
  return (
    <div className={`p-5 rounded-2xl shadow-sm flex flex-col h-full ${themes[theme]}`}>
      <h3 className="font-bold text-sm mb-4 opacity-80">{title}</h3>
      <div className="space-y-1 text-xs opacity-70 flex-1">
        <div className="flex justify-between"><span>수입</span> <span>{data.incomeKRW >= 0 ? '+' : ''}{formatNumber(data.incomeKRW)}</span></div>
        <div className="flex justify-between"><span>지출</span> <span>-{formatNumber(data.expense)}</span></div>
        {subData && (
            <div className="flex justify-between mt-1 pt-1 border-t border-dashed border-gray-300 text-blue-600 font-bold">
                <span>↳ 저작권</span> <span>+{formatNumber(subData.incomeKRW)}</span>
            </div>
        )}
        <div className="border-t border-white/10 my-2 pt-2 flex flex-col gap-1">
            <div className="flex justify-between items-end">
                <span className="font-bold">순수익</span><span className="text-xl font-extrabold">{formatNumber(data.profitKRW)}원</span>
            </div>
            {data.incomeUSD > 0 && (
                <div className="flex justify-between items-end text-blue-400 mt-1">
                    <span className="font-bold">↳ 유튜브 달러</span><span className="text-lg font-extrabold">+${data.incomeUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
            )}
        </div>
      </div>
      {ytData && (
          <div className="mt-3 pt-2 border-t border-dashed border-purple-200 space-y-1 text-xs opacity-80">
              <div className="flex justify-between font-bold text-blue-500">
                  <span>↳ 유튜브 수입</span> 
                  <span>+${ytData.incomeUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between font-bold text-red-400">
                  <span>↳ 유튜브 지출</span> 
                  <span>-₩{formatNumber(ytData.expense)}</span>
              </div>
          </div>
      )}
    </div>
  );
}

// ──[ 5. 저작권 (Copyright) 탭 ]──
function CopyrightSection({ user, transactions, refresh, isSummaryMode }) {
    const [form, setForm] = useState({ date: '', amount: '', mainCat: 'copyright', subCat: 'master', memo: '' });
    const [editingId, setEditingId] = useState(null);

    const handleMoneyChange = (value) => {
        const num = value.replace(/[^0-9-]/g, '');
        setForm({ ...form, amount: formatNumber(num) });
    };

    const currentCategoryLabel = form.mainCat === 'producer' 
        ? '제작자' 
        : `${form.mainCat === 'copyright' ? '저작권' : '실연자'}-${form.subCat === 'master' ? '마스터' : '짱구'}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(!form.date || !form.amount) return alert("필수 정보를 입력해주세요.");
        const baseAmount = parseNumber(form.amount);
        const vat = 0; 
        const data = {
            uid: user.uid, // [보안 추가] 데이터 주인 표시
            division: 'copyright', type: 'income', date: form.date, amount: baseAmount,
            vat: vat, totalAmount: baseAmount, 
            category: form.mainCat, subDetail: form.subCat,
            memo: form.memo, displayCategory: currentCategoryLabel, createdAt: new Date()
        };
        if (editingId) { await updateDoc(doc(db, "acc_transactions", editingId), data); setEditingId(null); } 
        else { await addDoc(collection(db, "acc_transactions"), data); }
        setForm({ ...form, amount: '', memo: '' }); refresh();
    };

    const handleEdit = (item) => {
        setForm({
            date: item.date, amount: formatNumber(item.amount), mainCat: item.category,
            subCat: item.subDetail || 'master', memo: item.memo || ''
        });
        setEditingId(item.id); window.scrollTo(0, 0);
    };

    const handleDelete = async (id) => { if(window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "acc_transactions", id)); refresh(); } };

    const list = transactions.filter(t => t.division === 'copyright').sort((a,b) => b.date.localeCompare(a.date));
    const latestMonth = list[0]?.date; // 'YYYY-MM' (내림차순 첫 항목이 최신)
    const fmtMonth = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월` : '');

    const stats = list.reduce((acc, cur) => {
        const amt = cur.totalAmount || cur.amount;
        let key = '';
        if(cur.category === 'producer') key = '제작자';
        else {
            const main = cur.category === 'copyright' ? '저작권' : '실연자';
            const sub = cur.subDetail === 'master' ? '(마)' : '(짱)';
            key = main + sub;
        }
        if(!acc[key]) acc[key] = 0; acc[key] += amt; return acc;
    }, {});

    const groupedByYear = list.reduce((acc, cur) => {
        const year = cur.date.slice(0, 4);
        if(!acc[year]) acc[year] = [];
        acc[year].push(cur);
        return acc;
    }, {});
    const sortedYears = Object.keys(groupedByYear).sort((a,b) => b.localeCompare(a));
    const [expandedYear, setExpandedYear] = useState(null);
    const toggleYear = (year) => setExpandedYear(expandedYear === year ? null : year);
    const totalIncome = list.reduce((acc,cur)=>acc+(cur.totalAmount||cur.amount), 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <form onSubmit={handleSubmit} className={`p-5 rounded-2xl shadow-sm border space-y-3 transition-colors ${editingId ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                <h3 className={`font-bold mb-2 ${editingId ? 'text-green-700' : 'text-gray-800'}`}>{editingId ? '✏️ 저작권 내역 수정' : 'ⓒ 저작권 수익 등록'}</h3>
                <div className="grid grid-cols-3 gap-2 mb-2">
                    {['copyright', 'performer', 'producer'].map(cat => (
                        <button key={cat} type="button" onClick={() => setForm({...form, mainCat: cat})}
                            className={`py-2 rounded-lg text-xs font-bold border transition ${form.mainCat === cat ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                            {cat === 'copyright' ? '저작권' : cat === 'performer' ? '실연자' : '제작자'}
                        </button>
                    ))}
                </div>
                {form.mainCat !== 'producer' && (
                    <div className="flex gap-2 mb-2 bg-gray-50 p-2 rounded-lg">
                        <span className="text-xs font-bold text-gray-400 self-center mr-1">구분:</span>
                        {['master', 'jjanggu'].map(sub => (
                            <label key={sub} className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" name="subCat" checked={form.subCat === sub} onChange={() => setForm({...form, subCat: sub})} className="text-green-600 focus:ring-green-500" />
                                <span className="text-sm text-gray-700">{sub === 'master' ? '마스터' : '짱구'}</span>
                            </label>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input type="month" required className={`${inputClass} flex-1`} value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                    <div className="relative flex-[2]">
                        <input type="text" placeholder="금액 (VAT포함)" className={`${inputClass} pr-4 font-bold text-gray-900`} value={form.amount} onChange={e => handleMoneyChange(e.target.value)} />
                        <div className="absolute right-3 top-0 bottom-0 flex items-center pointer-events-none">
                            <span className="text-[10px] font-extrabold text-green-600 bg-green-50 px-2 py-1 rounded">{currentCategoryLabel}</span>
                        </div>
                    </div>
                </div>
                <input type="text" placeholder="메모" className={inputClass} value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} />
                <div className="flex gap-2">
                    <button className={`flex-1 text-white py-3.5 rounded-xl font-bold transition ${editingId ? 'bg-green-600' : 'bg-gray-800 shadow-md'}`}>{editingId ? '수정 완료' : '등록하기'}</button>
                    {editingId && <button type="button" onClick={() => {setEditingId(null); setForm({...form, amount: '', memo: ''});}} className="px-4 bg-gray-200 rounded-xl font-bold text-gray-600">취소</button>}
                </div>
            </form>

            <div className="mt-6">
                <div className="flex items-center gap-2 mb-3 ml-1">
                    <h3 className="text-sm font-bold text-gray-500">저작권 내역 리스트</h3>
                    {latestMonth && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                            {fmtMonth(latestMonth)}까지 입력됨
                        </span>
                    )}
                </div>
                {/* 카테고리별 소계 (예전 하단 검은 카드에 있던 내역) */}
                <div className="mb-4 rounded-2xl border border-green-100 bg-green-50/60 p-4">
                    <div className="flex justify-between items-center border-b border-green-100 pb-2 mb-2">
                        <span className="text-xs font-bold text-gray-500">총 합계</span>
                        <span className="text-lg font-extrabold text-green-700">{formatNumber(totalIncome)}원</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {['저작권(마)', '저작권(짱)', '실연자(마)', '실연자(짱)', '제작자'].map(key => {
                            const val = stats[key] || 0;
                            if (val < 1) return null;
                            return (
                                <div key={key} className="flex justify-between">
                                    <span className="text-gray-500">{key}</span>
                                    <span className="font-bold text-gray-700">{formatNumber(val)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {isSummaryMode ? (
                     <div className="space-y-2">
                     {sortedYears.map(year => {
                         const yearList = groupedByYear[year];
                         const yTotal = yearList.reduce((acc,cur)=>acc+(cur.totalAmount||cur.amount), 0);
                         const isOpen = expandedYear === year;
                         return (
                             <div key={year} className={`bg-white rounded-xl border transition-all overflow-hidden ${isOpen ? 'border-green-300 shadow-md' : 'border-gray-200 shadow-sm'}`}>
                                 <div onClick={() => toggleYear(year)} className="px-4 py-3 cursor-pointer flex justify-between items-center hover:bg-gray-50">
                                     <div className="flex items-center gap-2">
                                         <h4 className="text-base font-extrabold text-gray-800">{year}년</h4>
                                         <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{yearList.length}건</span>
                                     </div>
                                     <div className={`text-base font-bold ${yTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatNumber(yTotal)}원</div>
                                 </div>
                                 {isOpen && (
                                     <div className="bg-gray-50 p-2 border-t border-gray-100">
                                         <MonthGroupSection yearList={yearList} refresh={refresh} allowDelete={true} onDelete={handleDelete} />
                                     </div>
                                 )}
                             </div>
                         )
                     })}
                 </div>
                ) : (
                    <TransactionList list={list} onEdit={handleEdit} onDelete={handleDelete} isSummaryMode={false} />
                )}
            </div>
        </div>
    );
}

// ──[ 6. VoiceTuning 컴포넌트 ]──
function VoiceTuning({ user, transactions, refresh, isSummaryMode, categoryMap }) {
  const [form, setForm] = useState({ date: '', income: '', expense: '', memo: '' });
  const [editingId, setEditingId] = useState(null);
  const [expandedYear, setExpandedYear] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(!form.date) return alert("날짜를 입력해주세요.");
    const numIncome = parseNumber(form.income);
    const numExpense = parseNumber(form.expense);
    if(!numIncome && !numExpense) return alert("금액을 입력해주세요.");

    const baseData = { uid: user.uid, date: form.date, memo: form.memo, division: 'voicetuning', createdAt: new Date() };
    const promises = [];

    if (editingId) {
       const isIncome = !!numIncome;
       const updateData = { ...baseData, amount: isIncome ? numIncome : numExpense, type: isIncome ? 'income' : 'expense' };
       await updateDoc(doc(db, "acc_transactions", editingId), updateData);
       setEditingId(null);
    } else {
        if (numIncome) promises.push(addDoc(collection(db, "acc_transactions"), { ...baseData, amount: numIncome, type: 'income' }));
        if (numExpense) promises.push(addDoc(collection(db, "acc_transactions"), { ...baseData, amount: numExpense, type: 'expense' }));
        await Promise.all(promises);
    }
    setForm({ date: '', income: '', expense: '', memo: '' }); refresh();
  };

  const handleDelete = async (id) => { if(window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "acc_transactions", id)); refresh(); } };
  
  const handleEdit = (item) => { 
      setForm({ date: item.date, income: item.type === 'income' ? formatNumber(item.amount) : '', expense: item.type === 'expense' ? formatNumber(item.amount) : '', memo: item.memo }); 
      setEditingId(item.id); window.scrollTo(0, 0); 
  };
  
  const list = transactions.filter(t => t.division === 'voicetuning').sort((a,b) => b.date.localeCompare(a.date));
  const latestMonth = list[0]?.date; // 'YYYY-MM' (list 는 날짜 내림차순이라 첫 항목이 최신)
  const fmtMonth = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월` : '');
  const totalIncome = list.filter(t=>t.type==='income').reduce((acc,cur)=>acc+cur.amount, 0);
  const totalExpense = list.filter(t=>t.type==='expense').reduce((acc,cur)=>acc+cur.amount, 0);
  const totalProfit = totalIncome - totalExpense;

  const groupedByYear = list.reduce((acc, cur) => {
      const year = cur.date.slice(0, 4);
      if(!acc[year]) acc[year] = [];
      acc[year].push(cur);
      return acc;
  }, {});
  const sortedYears = Object.keys(groupedByYear).sort((a,b) => b.localeCompare(a));
  const toggleYear = (year) => { if(expandedYear === year) setExpandedYear(null); else setExpandedYear(year); }
  const handleMoneyChange = (field, value) => {
      const num = value.replace(/[^0-9-]/g, '');
      setForm({ ...form, [field]: formatNumber(num) });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <form onSubmit={handleSubmit} className={`p-5 rounded-2xl shadow-sm border space-y-3 transition-colors ${editingId ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100'}`}>
           <h3 className={`font-bold mb-2 ${editingId ? 'text-purple-700' : 'text-gray-800'}`}>{editingId ? '✏️ 내역 수정' : '📝 보이스튜닝 통합 등록'}</h3>
           <input type="month" required className={`${inputClass} font-bold text-gray-700`} value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
           <div className="flex gap-2">
               <div className="flex-1">
                   <label className="text-xs font-bold text-blue-600 ml-1 mb-1 block">수입</label>
                   <input type="text" placeholder="0" className={`${inputClass} border-blue-100 focus:ring-blue-200`} value={form.income} onChange={e => handleMoneyChange('income', e.target.value)} disabled={editingId && !form.income} />
               </div>
               <div className="flex-1">
                   <label className="text-xs font-bold text-red-500 ml-1 mb-1 block">지출</label>
                   <input type="text" placeholder="0" className={`${inputClass} border-red-100 focus:ring-red-200`} value={form.expense} onChange={e => handleMoneyChange('expense', e.target.value)} disabled={editingId && !form.expense} />
               </div>
           </div>
           <input type="text" placeholder="메모" className={inputClass} value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} />
           <div className="flex gap-2">
               <button className={`flex-1 text-white py-3.5 rounded-xl font-bold transition ${editingId ? 'bg-purple-600' : 'bg-gray-900 shadow-md hover:bg-gray-800'}`}>{editingId ? '수정 완료' : '등록'}</button>
               {editingId && <button type="button" onClick={() => {setEditingId(null); setForm({ date: '', income: '', expense: '', memo: '' });}} className="px-4 bg-gray-200 rounded-xl font-bold text-gray-600">취소</button>}
           </div>
      </form>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3 ml-1">
          <h3 className="text-sm font-bold text-gray-500">{isSummaryMode ? '📂 연도별 모아보기' : '내역 리스트'}</h3>
          {latestMonth && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              {fmtMonth(latestMonth)}까지 입력됨
            </span>
          )}
        </div>
        {isSummaryMode ? (
            <div className="space-y-3">
                {sortedYears.map(year => {
                    const yearList = groupedByYear[year];
                    const yProfit = yearList.filter(t=>t.type==='income').reduce((acc,cur)=>acc+cur.amount,0) - yearList.filter(t=>t.type==='expense').reduce((acc,cur)=>acc+cur.amount,0);
                    const isOpen = expandedYear === year;
                    return (
                        <div key={year} className={`bg-white rounded-xl border transition-all overflow-hidden ${isOpen ? 'border-purple-300 shadow-md' : 'border-gray-200 shadow-sm'}`}>
                            <div onClick={() => toggleYear(year)} className="px-4 py-3 cursor-pointer flex justify-between items-center hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-base font-extrabold text-gray-800">{year}년</h4>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{yearList.length}건</span>
                                </div>
                                <div className={`text-base font-bold ${yProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{formatNumber(yProfit)}원</div>
                            </div>
                            {isOpen && (
                                <div className="bg-gray-50 p-2 border-t border-gray-100">
                                    <MonthGroupSection yearList={yearList} refresh={refresh} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        ) : (
            <TransactionList list={list} onEdit={handleEdit} onDelete={handleDelete} isSummaryMode={false} categoryMap={categoryMap} />
        )}
      </div>
    </div>
  );
}

// ──[ 7. 월별 그룹화 섹션 (VoiceTuning, Copyright 공유) ]──
function MonthGroupSection({ yearList, refresh, allowDelete, onDelete }) {
    const groupedByMonth = yearList.reduce((acc, cur) => {
        const month = cur.date; 
        if (!acc[month]) acc[month] = [];
        acc[month].push(cur);
        return acc;
    }, {});
    const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

    return (
        <div className="space-y-3">
            {sortedMonths.map(monthKey => (
                <MonthItem key={monthKey} monthKey={monthKey} transactions={groupedByMonth[monthKey]} refresh={refresh} allowDelete={allowDelete} onDelete={onDelete} />
            ))}
        </div>
    );
}

function MonthItem({ monthKey, transactions, refresh, allowDelete, onDelete }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkEditing, setIsBulkEditing] = useState(false);
    const [editItems, setEditItems] = useState([]);

    const income = transactions.filter(t => t.type === 'income').reduce((acc, cur) => acc + (cur.totalAmount || cur.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, cur) => acc + (cur.totalAmount || cur.amount), 0);
    const profit = income - expense;
    const monthLabel = `${parseInt(monthKey.split('-')[1])}월`;

    const startBulkEdit = (e) => {
        e.stopPropagation(); 
        setEditItems(transactions.map(t => ({ 
            id: t.id, amount: t.amount, memo: t.memo || '', type: t.type,
            displayCategory: t.displayCategory 
        })));
        setIsBulkEditing(true); setIsOpen(true);
    };

    const handleItemChange = (id, field, value) => {
        setEditItems(prev => prev.map(item => {
            if (item.id === id) {
                if (field === 'amount') {
                    const num = Number(value.replace(/[^0-9-]/g, ''));
                    return { ...item, [field]: num };
                }
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleBulkSave = async () => {
        if (!window.confirm(`${editItems.length}건의 데이터를 일괄 수정하시겠습니까?`)) return;
        try {
            const promises = editItems.map(item => {
                return updateDoc(doc(db, "acc_transactions", item.id), { amount: item.amount, memo: item.memo });
            });
            await Promise.all(promises);
            alert("일괄 수정이 완료되었습니다."); setIsBulkEditing(false); refresh();
        } catch (error) { console.error(error); alert("수정 중 오류가 발생했습니다."); }
    };

    const handleCancel = () => { setIsBulkEditing(false); setEditItems([]); };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm font-bold">{isOpen ? '▼' : '▶'}</span>
                    <span className="text-lg font-extrabold text-gray-800">{monthLabel}</span>
                    <div className="flex gap-2 text-xs">
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">+{formatNumber(income)}</span>
                        {expense > 0 && <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded font-bold">-{formatNumber(expense)}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${profit >= 0 ? 'text-gray-700' : 'text-red-500'}`}>합계 {formatNumber(profit)}</span>
                    {!isBulkEditing && isOpen && (
                        <button onClick={startBulkEdit} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded text-xs font-bold hover:bg-indigo-100">일괄 수정</button>
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50 p-2">
                    {isBulkEditing ? (
                        <div className="space-y-2">
                            {editItems.map((item) => (
                                <div key={item.id} className="flex gap-2 items-center bg-white p-2 rounded shadow-sm border border-indigo-200">
                                    <div className={`text-[10px] font-bold w-14 text-center break-words leading-tight ${item.type === 'income' ? 'text-blue-600' : 'text-red-500'}`}>
                                        {item.displayCategory || (item.type === 'income' ? '수입' : '지출')}
                                    </div>
                                    <div className="flex-1">
                                        <input type="text" value={formatNumber(item.amount)} onChange={(e) => handleItemChange(item.id, 'amount', e.target.value)}
                                            className="w-full p-1.5 border border-gray-300 rounded text-sm text-right font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                                    </div>
                                    <div className="flex-[2]">
                                        <input type="text" value={item.memo} placeholder="메모" onChange={(e) => handleItemChange(item.id, 'memo', e.target.value)}
                                            className="w-full p-1.5 border border-gray-300 rounded text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                                    </div>
                                </div>
                            ))}
                            <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
                                <button onClick={handleBulkSave} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">전체 저장</button>
                                <button onClick={handleCancel} className="w-20 bg-gray-200 text-gray-700 py-2 rounded-lg font-bold text-sm hover:bg-gray-300">취소</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {transactions.map(item => (
                                <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.type === 'income' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>{item.type === 'income' ? '수입' : '지출'}</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-600">{item.displayCategory || item.category}</span>
                                            <span className="text-sm text-gray-700 font-medium">{item.memo || '내역 없음'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-sm font-bold ${item.type === 'income' ? 'text-blue-600' : 'text-red-500'}`}>{formatNumber(item.totalAmount || item.amount)}원</span>
                                        {allowDelete && (
                                            <button onClick={() => onDelete(item.id)} className="text-gray-300 hover:text-red-500">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ──[ 8. Votiz (수정 완료됨) ]──
function Votiz({ user, projects, filteredTransactions, allTransactions, refresh, categories, subCats, isSummaryMode, onMonthClick, resetPeriod }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [newProjectName, setNewProjectName] = useState('');
  
  const [form, setForm] = useState({ date: '', amount: '', type: 'income', category: 'source', subDetail: '', memo: '', vatIncluded: false });
  const [editingId, setEditingId] = useState(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [projectMemo, setProjectMemo] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState(null);

  const handleProjectAdd = async () => { 
    if (!newProjectName) return; 
    await addDoc(collection(db, "acc_projects"), { 
        name: newProjectName, 
        uid: user.uid, // [보안 추가] 프로젝트 생성시 주인 정보 기록
        createdAt: new Date() 
    }); 
    setNewProjectName(''); refresh(); 
  };
  
  const handleSelectProject = (project) => {
      setSelectedProjectId(project.id);
      setEditProjectName(project.name);
      setProjectMemo(project.memo || '');
      setShowStats(false);
      setFilterKeyword(null);
  };

  const handleUpdateProject = async () => {
      if(!editProjectName) return;
      await updateDoc(doc(db, "acc_projects", selectedProjectId), { name: editProjectName, memo: projectMemo });
      setIsEditingProject(false); refresh();
  };

  const handleMoneyChange = (value) => {
    const num = value.replace(/[^0-9-]/g, '');
    setForm({ ...form, amount: formatNumber(num) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount) return alert('필수 항목 입력');
    const baseAmount = parseNumber(form.amount);
    const vat = form.vatIncluded ? Math.round(baseAmount * 0.1) : 0;
    
    const data = {
        uid: user.uid, // [보안 추가] 내역 생성시 주인 정보 기록
        projectId: selectedProjectId, division: 'votiz', date: form.date, amount: baseAmount, type: form.type,
        category: form.category || '', subDetail: form.subDetail || '', memo: form.memo || '', vat: vat, totalAmount: baseAmount + vat
    };

    if(editingId) { await updateDoc(doc(db, "acc_transactions", editingId), data); setEditingId(null); } 
    else { await addDoc(collection(db, "acc_transactions"), { ...data, createdAt: new Date() }); }
    setForm({ date: '', amount: '', type: form.type, category: form.category, subDetail: '', memo: '', vatIncluded: false }); refresh();
  };

  const handleDelete = async (id) => { if(window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "acc_transactions", id)); refresh(); } };
  const handleEdit = (item) => { 
      setForm({
          date: item.date, amount: formatNumber(item.amount), type: item.type,
          category: item.category || (item.type === 'income' ? 'source' : 'production'), 
          subDetail: item.subDetail || '', memo: item.memo || '', vatIncluded: item.vat > 0
      }); 
      setEditingId(item.id); window.scrollTo(0, 0);
  };

  const handleCategoryClick = (keyword) => { setFilterKeyword(keyword); setShowStats(false); };

  // 선택된 프로젝트 상세 집계 (기간 필터 반영). 선택 전이면 빈 목록.
  const projectTrans = filteredTransactions.filter(t => t.projectId === selectedProjectId && t.division === 'votiz').sort((a,b) => b.date.localeCompare(a.date));
  const finalList = filterKeyword ? projectTrans.filter(t => {
        let key = '';
        if (t.subDetail) { if (t.subDetail.includes('-')) key = t.subDetail.split('-')[1]; else key = t.subDetail; }
        else { key = t.category === 'marketing' ? '마케팅비' : t.category; }
        if (!key || key === 'undefined') key = '미분류';
        return key === filterKeyword;
    }) : projectTrans;

  const pIncome = projectTrans.filter(t=>t.type==='income').reduce((acc,cur)=>acc + (cur.totalAmount||cur.amount), 0);
  const pTotalExpense = projectTrans.filter(t=>t.type==='expense');
  const expenseProd = pTotalExpense.filter(t=>t.category === 'production').reduce((acc,cur)=>acc + (cur.totalAmount||cur.amount), 0);
  const expenseMark = pTotalExpense.filter(t=>t.category === 'marketing').reduce((acc,cur)=>acc + (cur.totalAmount||cur.amount), 0);
  const totalExp = expenseProd + expenseMark;

  // 입력폼 — 선택한 프로젝트 카드 바로 아래에 아코디언처럼 끼워 넣는다.
  const projectForm = (
    <form onSubmit={handleSubmit} className={`mt-2 p-4 rounded-2xl shadow-sm border-2 relative overflow-hidden space-y-3 transition-colors ${editingId ? 'bg-blue-50 border-blue-300' : 'bg-white border-blue-100'}`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
        <h3 className={`font-bold text-sm ${editingId ? 'text-blue-700' : 'text-gray-800'}`}>{editingId ? '✏️ 수정 중' : '📝 내역 입력'}</h3>
        <div className="flex gap-2">
            <select className={`${selectClass} flex-1`} value={form.type} onChange={e => {
                const newType = e.target.value;
                const defaultCategory = newType === 'income' ? 'source' : 'production';
                setForm({...form, type: newType, category: defaultCategory, subDetail: ''});
            }}>
                <option value="income">수익</option><option value="expense">지출</option>
            </select>
            <input type="date" className={`${inputClass} flex-[2]`} value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
        <select className={selectClass} value={form.category} onChange={e => setForm({...form, category: e.target.value})}>{Object.entries(categories[form.type]).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}</select>
        {form.type === 'expense' && form.category === 'production' && (<select className={selectClass} value={form.subDetail} onChange={e => setForm({...form, subDetail: e.target.value})}><option value="">세부 항목 선택</option><optgroup label="곡비">{subCats.songFee.map(x=><option key={x} value={`곡비-${x}`}>{x}</option>)}</optgroup><optgroup label="녹음비">{subCats.recording.map(x=><option key={x} value={`녹음비-${x}`}>{x}</option>)}</optgroup><optgroup label="후반작업">{subCats.post.map(x=><option key={x} value={`후반-${x}`}>{x}</option>)}</optgroup><optgroup label="영상제작">{subCats.video.map(x=><option key={x} value={`영상-${x}`}>{x}</option>)}</optgroup><option value="기타진행비">기타 진행비</option></select>)}
        <div className="relative">
            <input type="text" placeholder="공급가액 (VAT 별도)" className={`${inputClass} font-bold text-gray-900 pr-32`} value={form.amount} onChange={e => handleMoneyChange(e.target.value)} />
            <label className="absolute right-2 top-2 bottom-2 flex items-center bg-gray-100 px-3 rounded-lg cursor-pointer hover:bg-gray-200 transition select-none"><input type="checkbox" className="w-4 h-4 text-blue-600 rounded mr-2" checked={form.vatIncluded} onChange={e => setForm({...form, vatIncluded: e.target.checked})} /><span className="text-xs font-bold text-gray-600">VAT 별도</span></label>
        </div>
        <input type="text" placeholder="메모" className={inputClass} value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} />
        <div className="flex gap-2"><button className={`flex-1 text-white py-3 rounded-xl font-bold transition ${editingId ? 'bg-blue-600' : 'bg-blue-500 shadow-md'}`}>{editingId ? '수정 완료' : '추가하기'}</button>{editingId && <button type="button" onClick={() => {setEditingId(null); setForm({...form, amount: '', memo: '', vatIncluded: false});}} className="px-4 bg-gray-200 rounded-xl font-bold text-gray-600">취소</button>}</div>
    </form>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_1.7fr] gap-6 items-start">
      {/* 왼쪽: 프로젝트 목록 + (선택 시) 입력폼 */}
      <div className="space-y-4">
        <div className="flex gap-2">
            <input type="text" placeholder="새 프로젝트 만들기" className={`${inputClass} bg-white`} value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
            <button onClick={handleProjectAdd} className="bg-blue-600 text-white px-4 rounded-xl font-bold shadow-md hover:bg-blue-700 shrink-0">생성</button>
        </div>
        <div className="space-y-2">
            <h3 className="font-bold text-gray-500 text-sm ml-1">📂 프로젝트 목록</h3>
            {projects.map(p => {
                const pTrans = allTransactions.filter(t => t.projectId === p.id && t.division === 'votiz');
                const income = pTrans.filter(t=>t.type==='income').reduce((acc,cur)=>acc + (cur.totalAmount||cur.amount), 0);
                const expense = pTrans.filter(t=>t.type==='expense').reduce((acc,cur)=>acc + (cur.totalAmount||cur.amount), 0);
                const profit = income - expense;
                // 이 프로젝트 수익이 언제까지 등록됐는지 (정산 진행 파악용)
                const incomeDates = pTrans.filter(t=>t.type==='income').map(t=>t.date).sort();
                const lastIncome = incomeDates.length ? incomeDates[incomeDates.length - 1] : null;
                const active = p.id === selectedProjectId;
                return (
                    <div key={p.id}>
                        <div onClick={() => handleSelectProject(p)} className={`cursor-pointer rounded-xl border p-3 transition ${active ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-200' : 'border-gray-100 bg-white hover:border-blue-300 hover:shadow-sm'}`}>
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`font-bold truncate ${active ? 'text-blue-700' : 'text-gray-800'}`}>{p.name}</span>
                                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${lastIncome ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                        {lastIncome ? `수익 ~${lastIncome.replace(/-/g, '.')}` : '수익 미등록'}
                                    </span>
                                </div>
                                <span className={`shrink-0 text-base font-extrabold ${profit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{formatNumber(profit)}원</span>
                            </div>
                            <div className="mt-2 flex gap-2">
                                <div className="flex-1 rounded-lg bg-blue-50 px-2.5 py-1.5">
                                    <div className="text-[10px] font-bold text-blue-400">수입</div>
                                    <div className="text-sm font-extrabold text-blue-600">+{formatNumber(income)}</div>
                                </div>
                                <div className="flex-1 rounded-lg bg-red-50 px-2.5 py-1.5">
                                    <div className="text-[10px] font-bold text-red-400">지출</div>
                                    <div className="text-sm font-extrabold text-red-500">-{formatNumber(expense)}</div>
                                </div>
                            </div>
                        </div>
                        {active && projectForm}
                    </div>
                );
            })}
            {projects.length === 0 && <div className="text-xs text-gray-400 px-1">프로젝트를 먼저 만들어주세요.</div>}
        </div>
      </div>

      {/* 오른쪽: 요약 + 상세 */}
      <div>
        {!selectedProjectId ? (
            <div className="flex items-center justify-center min-h-[320px] rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-400">
                왼쪽에서 프로젝트를 선택하세요
            </div>
        ) : (
        <div className="space-y-6">
          <div className="pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between gap-2">
                {isEditingProject ? (
                    <div className="flex gap-2 w-full">
                        <input type="text" className={`${inputClass} py-2`} value={editProjectName} onChange={e=>setEditProjectName(e.target.value)} />
                        <button onClick={handleUpdateProject} className="bg-blue-600 text-white px-3 rounded-lg font-bold text-sm">저장</button>
                        <button onClick={()=>setIsEditingProject(false)} className="bg-gray-200 text-gray-600 px-3 rounded-lg font-bold text-sm">취소</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="font-extrabold text-2xl text-gray-800">{editProjectName}</span>
                        <button onClick={()=>setIsEditingProject(true)} className="text-gray-400 hover:text-blue-500">✏️</button>
                    </div>
                )}
              </div>
              <div className="mt-2 relative">
                 <textarea placeholder="프로젝트 메모" className="w-full p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-yellow-400 outline-none resize-none"
                    rows="2" value={projectMemo} onChange={e => setProjectMemo(e.target.value)} onBlur={handleUpdateProject} />
                 <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 pointer-events-none">자동저장</div>
              </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100">
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div className="space-y-1">
                      <div className="text-gray-400 text-xs">총 수입</div>
                      <div className="font-bold text-blue-600 text-lg">+{formatNumber(pIncome)}</div>
                  </div>
                  <div className="space-y-1 text-right">
                      <div className="text-gray-400 text-xs">총 지출</div>
                      <div className="font-bold text-red-500 text-lg">-{formatNumber(totalExp)}</div>
                  </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl space-y-1 mb-3 text-xs">
                  <div className="flex justify-between"><span>🛠️ 제작비</span> <span>{formatNumber(expenseProd)}원</span></div>
                  <div className="flex justify-between"><span>📢 마케팅비</span> <span>{formatNumber(expenseMark)}원</span></div>
              </div>
              <div className="border-t pt-3 flex justify-between items-end">
                  <span className="font-bold text-gray-600">예상 순수익</span>
                  <span className={`text-2xl font-extrabold ${pIncome - totalExp >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{formatNumber(pIncome - totalExp)}원</span>
              </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-gray-500 ml-1">내역 리스트 ({finalList.length})</h3>
                <button onClick={()=>setShowStats(!showStats)} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100">{showStats ? '리스트 보기' : '📊 세부 통계 보기'}</button>
            </div>
            {filterKeyword && (
                <div onClick={() => setFilterKeyword(null)} className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full text-xs font-bold mb-3 cursor-pointer hover:bg-yellow-200 transition">
                    <span>🔍 '{filterKeyword}' 내역만 보는 중</span><span className="text-yellow-500 ml-1">✕ 해제</span>
                </div>
            )}
            {showStats ? ( <CategoryStats list={projectTrans} onCategoryClick={handleCategoryClick} /> ) : (
                <TransactionList list={finalList} showVat={true} onEdit={handleEdit} onDelete={handleDelete} isSummaryMode={false} onMonthClick={onMonthClick} categoryMap={categories} />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function CategoryStats({ list, onCategoryClick }) {
    const stats = list.reduce((acc, cur) => {
        if(cur.type !== 'expense') return acc;
        const amt = cur.totalAmount || cur.amount;
        let key = '';
        if (cur.subDetail) { if (cur.subDetail.includes('-')) { key = cur.subDetail.split('-')[1]; } else { key = cur.subDetail; } } 
        else { key = cur.category === 'marketing' ? '마케팅비' : cur.category; }
        if (!key || key === 'undefined') key = '미분류';
        if(!acc[key]) acc[key] = 0; acc[key] += amt; return acc;
    }, {});
    const sorted = Object.entries(stats).sort((a,b) => b[1] - a[1]);
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            <h4 className="text-xs font-bold text-gray-400 mb-2">지출 세부 분석 <span className="font-normal text-[10px]">(항목 클릭시 필터링)</span></h4>
            {sorted.length === 0 ? <p className="text-xs text-gray-400">지출 내역이 없습니다.</p> : 
             sorted.map(([name, val]) => (
                <div key={name} onClick={() => onCategoryClick(name)} className="flex justify-between text-sm border-b border-gray-50 last:border-0 pb-2 last:pb-0 cursor-pointer hover:bg-blue-50 p-1 rounded transition">
                    <span className="text-gray-600 border-b border-dashed border-gray-300">{name}</span><span className="font-bold text-gray-800">{formatNumber(val)}원</span>
                </div>
            ))}
        </div>
    )
}

function TransactionList({ list, showVat, onEdit, onDelete, isSummaryMode, onMonthClick, categoryMap }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const totalPages = Math.ceil(list.length / itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [list.length, isSummaryMode]);

  if (list.length === 0) return <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-sm">내역이 없습니다.</div>;

  if (isSummaryMode) {
      const grouped = list.reduce((acc, curr) => {
          const monthKey = curr.date.slice(0, 7); 
          if(!acc[monthKey]) acc[monthKey] = { income: 0, expense: 0, date: monthKey };
          if(curr.type === 'income') acc[monthKey].income += (curr.totalAmount || curr.amount);
          else acc[monthKey].expense += (curr.totalAmount || curr.amount);
          return acc;
      }, {});
      const sortedKeys = Object.keys(grouped).sort((a,b) => b.localeCompare(a));
      return (
          <ul className="space-y-3">
              {sortedKeys.map(key => {
                  const item = grouped[key];
                  const [year, month] = key.split('-'); const profit = item.income - item.expense;
                  return (
                      <li key={key} onClick={() => onMonthClick && onMonthClick(year, month)} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-indigo-400 hover:shadow-md transition">
                          <div className="font-extrabold text-gray-700 text-lg flex flex-col sm:flex-row sm:items-baseline sm:gap-1">
                              <span className="text-sm text-gray-400 font-normal">{year}년</span><span>{Number(month)}월</span>
                          </div>
                          <div className="text-right text-xs space-y-0.5 pointer-events-none">
                              <div className="text-blue-600">수입 {item.income >= 0 ? '+' : ''}{formatNumber(item.income)}</div>
                              <div className="text-red-500">지출 -{formatNumber(item.expense)}</div>
                              <div className={`font-bold text-sm pt-1 border-t ${profit >= 0 ? 'text-gray-800' : 'text-red-600'}`}>합계 {formatNumber(profit)}</div>
                          </div>
                      </li>
                  )
              })}
          </ul>
      );
  }

  const currentData = list.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
        <ul className="space-y-3">
        {currentData.map((item) => {
            const isIncome = item.type === 'income';
            const isVT = item.division === 'voicetuning';
            const isCR = item.division === 'copyright';
            const finalAmount = Number(item.totalAmount || item.amount);
            
            const categoryLabel = categoryMap && categoryMap[item.type] ? categoryMap[item.type][item.category] : (item.displayCategory || item.category || '');
            const subDetailLabel = item.subDetail && !item.displayCategory ? item.subDetail.split('-')[1] : '';
            
            let displayTitle = categoryLabel;
            if(subDetailLabel) displayTitle += ` > ${subDetailLabel}`;
            if(!displayTitle) displayTitle = item.memo || '내역 없음';

            return (
            <li key={item.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md tracking-wide ${isVT ? 'bg-purple-100 text-purple-600' : isCR ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                        {isVT ? 'VT' : isCR ? '저작권' : '보티즈'}
                    </span>
                    <span className="text-sm font-bold text-gray-500">{item.date}</span>
                    <span className="text-sm font-medium text-gray-600">
                        {displayTitle}
                        {(displayTitle !== item.memo && item.memo) && <span className="text-gray-400 font-normal"> ({item.memo})</span>}
                    </span>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => onEdit(item)} className="p-1 text-gray-300 hover:text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg></button>
                    <button onClick={() => onDelete(item.id)} className="p-1 text-gray-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg></button>
                </div>
            </div>
            <div className="flex justify-between items-center mt-2">
                <div className={`text-lg font-extrabold flex items-center gap-1 ${isIncome ? (finalAmount >=0 ? 'text-blue-600' : 'text-red-500') : 'text-red-500'}`}>
                    <span>{isIncome ? '수익' : '지출'}</span><span>{formatNumber(finalAmount)}원</span>
                </div>
                {showVat && item.vat > 0 && (<div className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded">VAT 포함</div>)}
            </div>
            </li>
        )})}
        </ul>
        {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-200 rounded text-sm disabled:opacity-50">이전</button>
                <span className="px-2 py-1 text-sm text-gray-500">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-200 rounded text-sm disabled:opacity-50">다음</button>
            </div>
        )}
    </>
  );
}

// ──[ 9. 유튜브 (Youtube) 컴포넌트 추가 ]──
function YoutubeSection({ user, transactions, refresh, isSummaryMode }) {
  const [form, setForm] = useState({ date: '', income: '', expense: '', memo: '' });
  const [editingId, setEditingId] = useState(null);
  const [expandedYear, setExpandedYear] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(!form.date) return alert("날짜를 입력해주세요.");
    const numIncome = Number(form.income); 
    const numExpense = parseNumber(form.expense); 
    if(!numIncome && !numExpense) return alert("금액을 입력해주세요.");

    const baseData = { uid: user.uid, date: form.date, memo: form.memo, division: 'youtube', createdAt: new Date() };
    const promises = [];

    if (editingId) {
       const isIncome = !!numIncome;
       const updateData = { ...baseData, amount: isIncome ? numIncome : numExpense, type: isIncome ? 'income' : 'expense' };
       await updateDoc(doc(db, "acc_transactions", editingId), updateData);
       setEditingId(null);
    } else {
        if (numIncome) promises.push(addDoc(collection(db, "acc_transactions"), { ...baseData, amount: numIncome, type: 'income' }));
        if (numExpense) promises.push(addDoc(collection(db, "acc_transactions"), { ...baseData, amount: numExpense, type: 'expense' }));
        await Promise.all(promises);
    }
    setForm({ date: '', income: '', expense: '', memo: '' }); refresh();
  };

  const handleDelete = async (id) => { if(window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "acc_transactions", id)); refresh(); } };
  
  const handleEdit = (item) => { 
      setForm({ date: item.date, income: item.type === 'income' ? item.amount.toString() : '', expense: item.type === 'expense' ? formatNumber(item.amount) : '', memo: item.memo }); 
      setEditingId(item.id); window.scrollTo(0, 0); 
  };
  
  const list = transactions.filter(t => t.division === 'youtube').sort((a,b) => b.date.localeCompare(a.date));
  const latestMonth = list[0]?.date; // 'YYYY-MM' (내림차순 첫 항목이 최신)
  const fmtMonth = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월` : '');
  const totalIncome = list.filter(t=>t.type==='income').reduce((acc,cur)=>acc+cur.amount, 0);
  const totalExpense = list.filter(t=>t.type==='expense').reduce((acc,cur)=>acc+cur.amount, 0);

  const groupedByYear = list.reduce((acc, cur) => {
      const year = cur.date.slice(0, 4);
      if(!acc[year]) acc[year] = [];
      acc[year].push(cur);
      return acc;
  }, {});
  const sortedYears = Object.keys(groupedByYear).sort((a,b) => b.localeCompare(a));
  const toggleYear = (year) => { if(expandedYear === year) setExpandedYear(null); else setExpandedYear(year); }
  
  const handleExpenseChange = (value) => {
      const num = value.replace(/[^0-9-]/g, '');
      setForm({ ...form, expense: formatNumber(num) });
  };
  const handleIncomeChange = (value) => {
      const num = value.replace(/[^0-9.-]/g, '');
      setForm({ ...form, income: num });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <form onSubmit={handleSubmit} className={`p-5 rounded-2xl shadow-sm border space-y-3 transition-colors ${editingId ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
           <h3 className={`font-bold mb-2 ${editingId ? 'text-red-700' : 'text-gray-800'}`}>{editingId ? '✏️ 내역 수정' : '📝 유튜브 수익/지출 등록'}</h3>
           <input type="month" required className={`${inputClass} font-bold text-gray-700`} value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
           <div className="flex gap-2">
               <div className="flex-1">
                   <label className="text-xs font-bold text-blue-600 ml-1 mb-1 block">수입 (달러 $)</label>
                   <input type="text" placeholder="예: 123.45" className={`${inputClass} border-blue-100 focus:ring-blue-200`} value={form.income} onChange={e => handleIncomeChange(e.target.value)} disabled={editingId && !form.income} />
               </div>
               <div className="flex-1">
                   <label className="text-xs font-bold text-red-500 ml-1 mb-1 block">지출 (원화 ₩)</label>
                   <input type="text" placeholder="예: 50000" className={`${inputClass} border-red-100 focus:ring-red-200`} value={form.expense} onChange={e => handleExpenseChange(e.target.value)} disabled={editingId && !form.expense} />
               </div>
           </div>
           <input type="text" placeholder="메모" className={inputClass} value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} />
           <div className="flex gap-2">
               <button className={`flex-1 text-white py-3.5 rounded-xl font-bold transition ${editingId ? 'bg-red-600' : 'bg-gray-900 shadow-md hover:bg-gray-800'}`}>{editingId ? '수정 완료' : '등록'}</button>
               {editingId && <button type="button" onClick={() => {setEditingId(null); setForm({ date: '', income: '', expense: '', memo: '' });}} className="px-4 bg-gray-200 rounded-xl font-bold text-gray-600">취소</button>}
           </div>
      </form>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3 ml-1">
          <h3 className="text-sm font-bold text-gray-500">{isSummaryMode ? '📂 연도별 모아보기' : '내역 리스트'}</h3>
          {latestMonth && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              {fmtMonth(latestMonth)}까지 입력됨
            </span>
          )}
        </div>
        {isSummaryMode ? (
            <div className="space-y-3">
                {sortedYears.map(year => {
                    const yearList = groupedByYear[year];
                    const yIncome = yearList.filter(t=>t.type==='income').reduce((acc,cur)=>acc+cur.amount,0);
                    const yExpense = yearList.filter(t=>t.type==='expense').reduce((acc,cur)=>acc+cur.amount,0);
                    const isOpen = expandedYear === year;
                    return (
                        <div key={year} className={`bg-white rounded-2xl border transition-all overflow-hidden ${isOpen ? 'border-red-300 shadow-md' : 'border-gray-200 shadow-sm'}`}>
                            <div onClick={() => toggleYear(year)} className="p-5 cursor-pointer flex justify-between items-center hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xl font-extrabold text-gray-800">{year}년</h4>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{yearList.length}건</span>
                                </div>
                                <div className="text-right text-sm font-bold flex flex-col gap-0.5">
                                    <div className="text-blue-600">${yIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                    <div className="text-red-500">₩{formatNumber(yExpense)}</div>
                                </div>
                            </div>
                            {isOpen && (
                                <div className="bg-gray-50 p-2 border-t border-gray-100">
                                    <YoutubeMonthGroup yearList={yearList} refresh={refresh} onDelete={handleDelete} onEdit={handleEdit} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        ) : (
            <YoutubeTransactionList list={list} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}

function YoutubeMonthGroup({ yearList, refresh, onDelete, onEdit }) {
    const groupedByMonth = yearList.reduce((acc, cur) => {
        const month = cur.date; 
        if (!acc[month]) acc[month] = [];
        acc[month].push(cur);
        return acc;
    }, {});
    const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

    return (
        <div className="space-y-3">
            {sortedMonths.map(monthKey => {
                const monthTransactions = groupedByMonth[monthKey];
                const income = monthTransactions.filter(t => t.type === 'income').reduce((acc, cur) => acc + (cur.totalAmount || cur.amount), 0);
                const expense = monthTransactions.filter(t => t.type === 'expense').reduce((acc, cur) => acc + (cur.totalAmount || cur.amount), 0);
                const monthLabel = `${parseInt(monthKey.split('-')[1])}월`;
                
                return (
                    <div key={monthKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-extrabold text-gray-800">{monthLabel}</span>
                            </div>
                            <div className="text-right text-xs">
                                <div className="text-blue-600 font-bold">+${income.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                <div className="text-red-500 font-bold">-₩{formatNumber(expense)}</div>
                            </div>
                        </div>
                        <div className="border-t border-gray-100 bg-gray-50 p-2">
                            <div className="space-y-2">
                                {monthTransactions.map(item => (
                                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.type === 'income' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>{item.type === 'income' ? '수입' : '지출'}</span>
                                            <span className="text-sm text-gray-700 font-medium">{item.memo || '내역 없음'}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={`text-sm font-bold ${item.type === 'income' ? 'text-blue-600' : 'text-red-500'}`}>
                                                {item.type === 'income' ? `$${Number(item.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `₩${formatNumber(item.amount)}`}
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => onEdit(item)} className="p-1 text-gray-300 hover:text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg></button>
                                                <button onClick={() => onDelete(item.id)} className="p-1 text-gray-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function YoutubeTransactionList({ list, onEdit, onDelete }) {
  if (list.length === 0) return <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-sm">내역이 없습니다.</div>;

  return (
        <ul className="space-y-3">
        {list.map((item) => {
            const isIncome = item.type === 'income';
            return (
            <li key={item.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold px-2 py-1 rounded-md tracking-wide bg-red-100 text-red-600">YT</span>
                    <span className="text-xs font-medium text-gray-400">{item.date}</span>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => onEdit(item)} className="p-1 text-gray-300 hover:text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg></button>
                    <button onClick={() => onDelete(item.id)} className="p-1 text-gray-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg></button>
                </div>
            </div>
            <div className="flex justify-between items-center mt-2">
                <div>
                    <div className={`text-lg font-extrabold flex items-center gap-1 ${isIncome ? 'text-blue-600' : 'text-red-500'}`}>
                        <span>{isIncome ? '수익' : '지출'}</span>
                        <span>{isIncome ? `$${Number(item.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `₩${formatNumber(item.amount)}`}</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1 font-medium">{item.memo || '내역 없음'}</div>
                </div>
            </div>
            </li>
        )})}
        </ul>
  );
}