// 아티스트 한 명의 작업 공간 — 별도정산 건 / 수입·지출 장부 / 연결된 보티즈 곡.
// ManagementTab 의 아티스트 상세 아래에 붙는다.
//
// 쓰는 컬렉션
//   artistLedger/{id}  { uid, artistId, date, ym, type, categoryId, amount, vat, totalAmount, memo, caseId }
//   artistCases/{id}   { uid, artistId, name, date, memo, status }
//
// 읽기 한도(하루 5만) 때문에 지키는 것:
//   - 장부는 '이 아티스트 + 고른 달' 로만 조회한다(uid·artistId·ym 전부 '같음' 조건이라
//     복합 색인이 필요 없다. 범위 조건을 쓰면 색인을 따로 만들어야 한다).
//   - '전체 기간' 을 고르면 ym 조건만 빼서 이 아티스트 것만 가져온다.
//   - 연결된 곡 금액은 추가 조회 없이 보티즈 탭이 이미 받아둔 데이터를 그대로 쓴다.
//
// VAT 는 보티즈 탭과 같은 방식으로 저장한다.
//   amount = 공급가, vat = VAT별도면 공급가의 10%, totalAmount = amount + vat
//   (정산에 어느 쪽을 쓸지는 3단계에서 정하므로 지금은 둘 다 저장만 한다)
import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ArtistSettlementPanel } from './ArtistSettlementPanel.jsx';
import { isDateLocked, linkTypeOf } from '../domain/artistSettlement.js';
import { linkTypeLabel } from '../utils/artistShares.js';

const inputClass = "w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 outline-none transition text-sm";
const selectClass = inputClass + " appearance-none";
const pill = "rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95";

const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const parseMoney = (s) => {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    return Number(String(s).split(',').join('')) || 0;
};
const ymOf = (date) => (date || '').slice(0, 7);
const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const EMPTY_ROW = { date: '', type: 'income', categoryId: '', amount: '', vatIncluded: false, memo: '', caseId: '' };
const EMPTY_CASE = { name: '', date: '', memo: '' };

// 보티즈 탭 '프로젝트 목록' 카드와 같은 계산 — 그 곡의 votiz 내역만 모아 수입·지출을 더한다.
const songTotals = (allTransactions, projectId) => {
    const rows = (allTransactions || []).filter((t) => t.projectId === projectId && t.division === 'votiz');
    const income = rows.filter((t) => t.type === 'income').reduce((a, c) => a + Number(c.totalAmount || c.amount || 0), 0);
    const expense = rows.filter((t) => t.type === 'expense').reduce((a, c) => a + Number(c.totalAmount || c.amount || 0), 0);
    return { income, expense };
};

export function ArtistWorkspace({ user, artist, priv, categories, projects, allTransactions }) {
    const [cases, setCases] = useState([]);
    const [ledger, setLedger] = useState([]);
    // 건별 내역은 기간과 무관하게 '그 건 전체' 를 봐야 하므로 따로 담는다.
    const [caseRowsMap, setCaseRowsMap] = useState({});
    // 확정된 정산. 이 기간 장부를 잠그는 기준이 된다.
    const [settlements, setSettlements] = useState([]);
    // 장부를 고치면 정산 화면도 다시 읽게 한다(정산은 기간별로 따로 조회하므로).
    const [ledgerVersion, setLedgerVersion] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [err, setErr] = useState('');

    const [periodMode, setPeriodMode] = useState('month');  // 'month' | 'all'
    const [ym, setYm] = useState(todayStr().slice(0, 7));
    const [catFilter, setCatFilter] = useState('');

    const [row, setRow] = useState({ ...EMPTY_ROW, date: todayStr() });
    const [editingId, setEditingId] = useState(null);
    const [rowErr, setRowErr] = useState('');
    const [busy, setBusy] = useState(false);

    const [showCaseForm, setShowCaseForm] = useState(false);
    const [caseForm, setCaseForm] = useState(EMPTY_CASE);
    const [openCaseId, setOpenCaseId] = useState(null);

    const artistId = artist.id;

    // 별도정산 건 — 아티스트당 몇 건이라 한 번만 읽는다.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'artistCases'),
                    where('uid', '==', user.uid),
                    where('artistId', '==', artistId)
                ));
                if (alive) setCases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            } catch (e) {
                if (alive) setErr('별도정산 건을 못 불러왔습니다: ' + (e && e.message ? e.message : ''));
            }
        };
        load();
        return () => { alive = false; };
    }, [user, artistId]);

    // 확정된 정산 — 아티스트당 몇 건이라 한 번만 읽는다.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'artistSettlements'),
                    where('uid', '==', user.uid),
                    where('artistId', '==', artistId)
                ));
                if (alive) setSettlements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            } catch (e) {
                if (alive) setErr('확정된 정산을 못 불러왔습니다: ' + (e && e.message ? e.message : ''));
            }
        };
        load();
        return () => { alive = false; };
    }, [user, artistId]);

    // 건별 내역 — 건마다 한 번씩. uid·artistId·caseId 전부 '같음' 조건이라 색인이 필요 없다.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            if (cases.length === 0) { if (alive) setCaseRowsMap({}); return; }
            try {
                const results = await Promise.all(cases.map(async (c) => {
                    const snap = await getDocs(query(
                        collection(db, 'artistLedger'),
                        where('uid', '==', user.uid),
                        where('artistId', '==', artistId),
                        where('caseId', '==', c.id)
                    ));
                    return [c.id, snap.docs.map((d) => ({ id: d.id, ...d.data() }))];
                }));
                if (!alive) return;
                const map = {};
                results.forEach(([k, v]) => { map[k] = v; });
                setCaseRowsMap(map);
            } catch (e) {
                if (alive) setErr('건 내역을 못 불러왔습니다: ' + (e && e.message ? e.message : ''));
            }
        };
        load();
        return () => { alive = false; };
    }, [user, artistId, cases]);

    // 장부 — 아티스트 + 기간으로만 조회한다.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            setLoaded(false);
            try {
                const coll = collection(db, 'artistLedger');
                const q = periodMode === 'month'
                    ? query(coll, where('uid', '==', user.uid), where('artistId', '==', artistId), where('ym', '==', ym))
                    : query(coll, where('uid', '==', user.uid), where('artistId', '==', artistId));
                const snap = await getDocs(q);
                if (!alive) return;
                setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoaded(true);
            } catch (e) {
                if (!alive) return;
                setErr('장부를 못 불러왔습니다: ' + (e && e.message ? e.message : ''));
                setLoaded(true);
            }
        };
        load();
        return () => { alive = false; };
    }, [user, artistId, periodMode, ym]);

    const catById = useMemo(() => {
        const m = {};
        (categories || []).forEach((c) => { m[c.id] = c; });
        return m;
    }, [categories]);

    const catsForType = useMemo(
        () => (categories || []).filter((c) => c.kind === row.type && !c.hidden)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
        [categories, row.type]
    );

    // 일반 장부(별도정산 건에 안 묶인 것)와 건별 내역을 나눈다.
    const generalRows = useMemo(() => {
        const base = ledger.filter((r) => !r.caseId);
        const filtered = catFilter ? base.filter((r) => r.categoryId === catFilter) : base;
        return filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }, [ledger, catFilter]);

    const sumOfRows = (rows) => {
        const pick = (t, field) => rows.filter((r) => r.type === t).reduce((a, c) => a + Number(c[field] || 0), 0);
        return {
            incomeTotal: pick('income', 'totalAmount'),
            expenseTotal: pick('expense', 'totalAmount'),
            incomeNet: pick('income', 'amount'),
            expenseNet: pick('expense', 'amount'),
        };
    };
    const generalSum = useMemo(() => sumOfRows(generalRows), [generalRows]);

    // 저장·삭제 뒤 화면 상태를 맞춘다(다시 읽지 않는다).
    const upsertLocal = (rowObj) => {
        setLedgerVersion((v) => v + 1);
        const inPeriod = periodMode === 'all' || rowObj.ym === ym;
        setLedger((prev) => {
            const without = prev.filter((r) => r.id !== rowObj.id);
            return inPeriod ? [...without, rowObj] : without;
        });
        setCaseRowsMap((prev) => {
            const next = {};
            Object.keys(prev).forEach((k) => { next[k] = prev[k].filter((r) => r.id !== rowObj.id); });
            if (rowObj.caseId) next[rowObj.caseId] = [...(next[rowObj.caseId] || []), rowObj];
            return next;
        });
    };
    const removeLocal = (id) => {
        setLedgerVersion((v) => v + 1);
        setLedger((prev) => prev.filter((r) => r.id !== id));
        setCaseRowsMap((prev) => {
            const next = {};
            Object.keys(prev).forEach((k) => { next[k] = prev[k].filter((r) => r.id !== id); });
            return next;
        });
    };

    // 확정된 기간의 장부는 못 고친다. 건은 정산완료되면 못 고친다.
    const isRowLocked = (r) => {
        if (r.caseId) {
            const c = cases.find((x) => x.id === r.caseId);
            return !!(c && c.status === 'done');
        }
        return isDateLocked(r.date, settlements);
    };

    const resetRow = () => {
        setRow({ ...EMPTY_ROW, date: todayStr(), type: row.type });
        setEditingId(null);
        setRowErr('');
    };

    const saveRow = async () => {
        if (!row.date) { setRowErr('날짜를 넣어 주세요.'); return; }
        if (!row.caseId && isDateLocked(row.date, settlements)) {
            setRowErr('그 날짜가 든 기간은 정산이 확정돼 있어 장부를 바꿀 수 없습니다. 확정을 취소한 뒤 고쳐 주세요.');
            return;
        }
        if (row.caseId) {
            const c = cases.find((x) => x.id === row.caseId);
            if (c && c.status === 'done') { setRowErr("'" + c.name + "' 건은 정산완료라 내역을 바꿀 수 없습니다."); return; }
        }
        if (!row.categoryId) { setRowErr('항목을 골라 주세요.'); return; }
        const amount = parseMoney(row.amount);
        if (!amount) { setRowErr('금액을 넣어 주세요.'); return; }
        setBusy(true); setRowErr('');
        try {
            const vat = row.vatIncluded ? Math.round(amount * 0.1) : 0;
            const data = {
                uid: user.uid,
                artistId,
                date: row.date,
                ym: ymOf(row.date),          // 달 조회용. date 를 고치면 여기도 같이 바뀐다.
                type: row.type,
                categoryId: row.categoryId,
                amount,                       // 공급가
                vat,
                totalAmount: amount + vat,    // 합계
                memo: row.memo || '',
                caseId: row.caseId || '',     // 빈 문자열이면 일반 장부
                updatedAt: new Date(),
            };
            if (editingId) {
                await updateDoc(doc(db, 'artistLedger', editingId), data);
                upsertLocal({ id: editingId, ...data });
            } else {
                const ref = await addDoc(collection(db, 'artistLedger'), { ...data, createdAt: new Date() });
                upsertLocal({ id: ref.id, ...data });
            }
            resetRow();
        } catch (e) {
            setRowErr('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const editRow = (r) => {
        if (isRowLocked(r)) { setRowErr('정산이 확정된 내역이라 수정할 수 없습니다.'); return; }
        setEditingId(r.id);
        setRowErr('');
        setRow({
            date: r.date || '',
            type: r.type || 'income',
            categoryId: r.categoryId || '',
            amount: won(r.amount),
            vatIncluded: Number(r.vat || 0) > 0,
            memo: r.memo || '',
            caseId: r.caseId || '',
        });
    };

    const deleteRow = async (r) => {
        if (isRowLocked(r)) { setRowErr('정산이 확정된 내역이라 삭제할 수 없습니다.'); return; }
        const label = (catById[r.categoryId] ? catById[r.categoryId].name : '내역') + ' ' + won(r.totalAmount) + '원';
        if (!window.confirm(r.date + ' ' + label + ' 을(를) 삭제합니다. 되돌릴 수 없습니다.')) return;
        try {
            await deleteDoc(doc(db, 'artistLedger', r.id));
            removeLocal(r.id);
            if (editingId === r.id) resetRow();
        } catch (e) {
            alert('삭제 실패: ' + (e && e.message ? e.message : ''));
        }
    };

    const addCase = async () => {
        const name = (caseForm.name || '').trim();
        if (!name) { setErr('건 이름을 넣어 주세요.'); return; }
        setBusy(true); setErr('');
        try {
            const data = {
                uid: user.uid, artistId, name,
                date: caseForm.date || '', memo: caseForm.memo || '',
                status: 'open', createdAt: new Date(),
            };
            const ref = await addDoc(collection(db, 'artistCases'), data);
            setCases((prev) => [...prev, { id: ref.id, ...data }]);
            setCaseForm(EMPTY_CASE);
            setShowCaseForm(false);
        } catch (e) {
            setErr('건 추가 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const toggleCaseStatus = async (c) => {
        const status = c.status === 'done' ? 'open' : 'done';
        try {
            await updateDoc(doc(db, 'artistCases', c.id), { status });
            setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)));
        } catch (e) {
            alert('변경 실패: ' + (e && e.message ? e.message : ''));
        }
    };

    // 연결된 보티즈 곡 — 추가 조회 없이 보티즈 탭이 가진 데이터로 계산한다.
    const linkedSongs = useMemo(() => {
        return (projects || [])
            .map((p) => {
                const list = Array.isArray(p.artists) ? p.artists : [];
                const mine = list.find((a) => a && a.artistId === artistId);
                if (!mine) return null;
                const type = linkTypeOf(mine);
                const even = mine.share === null || mine.share === undefined || mine.share === '';
                return {
                    project: p, type,
                    // 지분은 소속(member)에만 있다. 콜라보는 지분이 아니라 공유율로 계산한다.
                    share: type === 'member' ? (even ? null : Number(mine.share)) : null,
                    ...songTotals(allTransactions, p.id),
                };
            })
            .filter(Boolean);
    }, [projects, allTransactions, artistId]);

    const cycleMonth = (step) => {
        const [y, m] = ym.split('-').map(Number);
        const d = new Date(y, m - 1 + step, 1);
        setYm(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    };

    return (
        <div className="mt-2 space-y-3">
            {err && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{err}</div>}

            {/* ── 별도정산 건 ── */}
            <section className="rounded-2xl border-2 border-indigo-100 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-800 text-sm">별도정산 건</h4>
                    <button onClick={() => setShowCaseForm((v) => !v)} className={`${pill} bg-indigo-600 text-white hover:bg-indigo-700`}>
                        {showCaseForm ? '닫기' : '+ 건 만들기'}
                    </button>
                </div>

                {showCaseForm && (
                    <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1.5fr_auto] gap-2 rounded-xl bg-indigo-50/60 p-3">
                        <input className={inputClass} placeholder="건 이름 (예: 2026 봄 단독공연)" value={caseForm.name}
                            onChange={(e) => setCaseForm({ ...caseForm, name: e.target.value })} />
                        <input type="date" className={inputClass} value={caseForm.date}
                            onChange={(e) => setCaseForm({ ...caseForm, date: e.target.value })} />
                        <input className={inputClass} placeholder="메모" value={caseForm.memo}
                            onChange={(e) => setCaseForm({ ...caseForm, memo: e.target.value })} />
                        <button disabled={busy} onClick={addCase} className={`${pill} bg-gray-800 text-white hover:bg-gray-700`}>추가</button>
                    </div>
                )}

                {cases.length === 0 ? (
                    <div className="text-xs text-gray-400">만든 건이 없습니다. 건을 만들면 장부 입력에서 고를 수 있습니다.</div>
                ) : (
                    <div className="space-y-2">
                        {cases.map((c) => {
                            const rows = caseRowsMap[c.id] || [];
                            const s = sumOfRows(rows);
                            const diff = s.incomeTotal - s.expenseTotal;
                            const open = openCaseId === c.id;
                            return (
                                <div key={c.id} className="rounded-xl border border-indigo-100 bg-indigo-50/40">
                                    <div className="flex items-center justify-between gap-2 p-3 flex-wrap cursor-pointer"
                                        onClick={() => setOpenCaseId(open ? null : c.id)}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-gray-800 truncate">{c.name}</span>
                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${c.status === 'done' ? 'bg-gray-100 text-gray-500 ring-gray-200' : 'bg-indigo-100 text-indigo-700 ring-indigo-200'}`}>
                                                {c.status === 'done' ? '정산완료' : '진행중'}
                                            </span>
                                            {c.date && <span className="shrink-0 text-[11px] text-gray-400">{c.date}</span>}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-bold shrink-0">
                                            <span className="text-blue-600">수익 +{won(s.incomeTotal)}</span>
                                            <span className="text-red-500">지출 -{won(s.expenseTotal)}</span>
                                            <span className={diff >= 0 ? 'text-gray-900' : 'text-red-600'}>차액 {won(diff)}</span>
                                        </div>
                                    </div>
                                    {open && (
                                        <div className="border-t border-indigo-100 p-3 space-y-2">
                                            {c.memo && <div className="text-xs text-gray-500">메모: {c.memo}</div>}
                                            <div className="text-[11px] text-gray-400">
                                                공급가 기준 — 수익 {won(s.incomeNet)} / 지출 {won(s.expenseNet)}
                                            </div>
                                            {rows.length === 0 ? (
                                                <div className="text-xs text-gray-400">이 건에 묶인 내역이 없습니다. 아래 장부에서 '별도정산 건'을 이 건으로 고르고 저장하세요.</div>
                                            ) : (
                                                <LedgerRows rows={rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))}
                                                    catById={catById} onEdit={editRow} onDelete={deleteRow} isLocked={isRowLocked} />
                                            )}
                                            <button onClick={() => toggleCaseStatus(c)} className={`${pill} bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50`}>
                                                {c.status === 'done' ? '진행중으로 되돌리기' : '정산완료로 표시'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="text-[11px] text-gray-400">
                    건에 묶인 내역은 아래 '일반 장부' 합계에 들어가지 않습니다. 건 합계는 기간 선택과 무관하게 그 건 전체입니다.
                    비율은 건마다 따로 두지 않고 아티스트 비율을 씁니다.
                </p>
            </section>

            {/* ── 장부 ── */}
            <section className="rounded-2xl border-2 border-gray-100 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-800 text-sm">장부 (수입 · 지출)</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 bg-gray-200/70 p-1 rounded-xl">
                            {[{ k: 'month', l: '월별' }, { k: 'all', l: '전체 기간' }].map(({ k, l }) => (
                                <button key={k} onClick={() => setPeriodMode(k)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${periodMode === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        {periodMode === 'month' && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => cycleMonth(-1)} className="w-7 h-7 rounded-full hover:bg-gray-100 font-bold text-gray-500">‹</button>
                                <input type="month" className={inputClass + ' w-36'} value={ym} onChange={(e) => setYm(e.target.value)} />
                                <button onClick={() => cycleMonth(1)} className="w-7 h-7 rounded-full hover:bg-gray-100 font-bold text-gray-500">›</button>
                            </div>
                        )}
                        <select className={selectClass + ' w-36'} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                            <option value="">항목 전체</option>
                            {(categories || []).filter((c) => !c.hidden).map((c) => (
                                <option key={c.id} value={c.id}>{c.kind === 'income' ? '수익' : '지출'} · {c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 입력 */}
                <div className="grid grid-cols-1 md:grid-cols-[0.9fr_0.6fr_1fr_0.9fr_1.1fr_1fr_auto] gap-2 rounded-xl bg-gray-50 p-3">
                    <input type="date" className={inputClass} value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} />
                    <select className={selectClass} value={row.type}
                        onChange={(e) => setRow({ ...row, type: e.target.value, categoryId: '' })}>
                        <option value="income">수익</option>
                        <option value="expense">지출</option>
                    </select>
                    <select className={selectClass} value={row.categoryId} onChange={(e) => setRow({ ...row, categoryId: e.target.value })}>
                        <option value="">항목 선택</option>
                        {catsForType.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="relative">
                        <input className={inputClass} placeholder="공급가" value={row.amount}
                            onChange={(e) => setRow({ ...row, amount: won(parseMoney(e.target.value)) })} />
                    </div>
                    <label className="flex items-center gap-2 px-2 rounded-xl bg-white border border-gray-200 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 rounded" checked={row.vatIncluded}
                            onChange={(e) => setRow({ ...row, vatIncluded: e.target.checked })} />
                        <span className="text-xs font-bold text-gray-600">VAT 별도</span>
                    </label>
                    <input className={inputClass} placeholder="메모" value={row.memo} onChange={(e) => setRow({ ...row, memo: e.target.value })} />
                    <select className={selectClass + ' md:col-span-1'} value={row.caseId} onChange={(e) => setRow({ ...row, caseId: e.target.value })}>
                        <option value="">일반 장부</option>
                        {cases.map((c) => <option key={c.id} value={c.id}>건 · {c.name}</option>)}
                    </select>
                    <div className="md:col-span-7 flex gap-2">
                        <button disabled={busy} onClick={saveRow} className={`${pill} bg-emerald-600 text-white hover:bg-emerald-700`}>
                            {editingId ? '수정 완료' : '추가'}
                        </button>
                        {editingId && (
                            <button onClick={resetRow} className={`${pill} bg-gray-200 text-gray-600 hover:bg-gray-300`}>취소</button>
                        )}
                        {row.vatIncluded && parseMoney(row.amount) > 0 && (
                            <span className="self-center text-[11px] text-gray-400">
                                VAT {won(Math.round(parseMoney(row.amount) * 0.1))} · 합계 {won(parseMoney(row.amount) + Math.round(parseMoney(row.amount) * 0.1))}
                            </span>
                        )}
                    </div>
                </div>
                {rowErr && <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs font-bold text-red-700">{rowErr}</div>}

                {/* 합계 — 일반 장부만 */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-blue-50 px-3 py-2">
                        <div className="text-[10px] font-bold text-blue-400">수익 합 (합계)</div>
                        <div className="text-base font-extrabold text-blue-600">+{won(generalSum.incomeTotal)}</div>
                        <div className="text-[10px] text-gray-400">공급가 {won(generalSum.incomeNet)}</div>
                    </div>
                    <div className="rounded-xl bg-red-50 px-3 py-2">
                        <div className="text-[10px] font-bold text-red-400">지출 합 (합계)</div>
                        <div className="text-base font-extrabold text-red-500">-{won(generalSum.expenseTotal)}</div>
                        <div className="text-[10px] text-gray-400">공급가 {won(generalSum.expenseNet)}</div>
                    </div>
                    <div className="rounded-xl bg-gray-100 px-3 py-2">
                        <div className="text-[10px] font-bold text-gray-400">차액</div>
                        <div className={`text-base font-extrabold ${generalSum.incomeTotal - generalSum.expenseTotal >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {won(generalSum.incomeTotal - generalSum.expenseTotal)}
                        </div>
                        <div className="text-[10px] text-gray-400">별도정산 건 제외</div>
                    </div>
                </div>

                {!loaded ? (
                    <div className="text-xs text-gray-400">불러오는 중...</div>
                ) : generalRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-400">
                        {periodMode === 'month' ? ym + ' 에 일반 장부 내역이 없습니다.' : '일반 장부 내역이 없습니다.'}
                    </div>
                ) : (
                    <LedgerRows rows={generalRows} catById={catById} onEdit={editRow} onDelete={deleteRow} isLocked={isRowLocked} />
                )}
            </section>

            {/* ── 정산 ── */}
            <ArtistSettlementPanel
                user={user} artist={artist} priv={priv} categories={categories}
                projects={projects} allTransactions={allTransactions}
                cases={cases} setCases={setCases} caseRowsMap={caseRowsMap}
                settlements={settlements} setSettlements={setSettlements}
                ledgerVersion={ledgerVersion}
            />

            {/* ── 연결된 보티즈 곡 (보기만) ── */}
            <section className="rounded-2xl border-2 border-blue-100 bg-white p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-800 text-sm">연결된 보티즈 곡</h4>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">보기만 · 장부/정산에 안 들어감</span>
                </div>
                {linkedSongs.length === 0 ? (
                    <div className="text-xs text-gray-400">연결된 곡이 없습니다. 보티즈 탭에서 곡에 아티스트를 연결하세요.</div>
                ) : (
                    <div className="space-y-2">
                        {linkedSongs.map(({ project, type, share, income, expense }) => (
                            <div key={project.id} className="flex items-center justify-between gap-2 rounded-xl bg-blue-50/50 px-3 py-2 flex-wrap">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-gray-800 truncate">{project.name}</span>
                                    <span className={`shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold ring-1 ${type === 'member' ? 'text-blue-600 ring-blue-200' : 'text-indigo-600 ring-indigo-200'}`}>
                                        {type === 'member' ? (share === null ? '소속 균등' : '소속 ' + share + '%') : linkTypeLabel(type)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-bold shrink-0">
                                    <span className="text-blue-600">수입 +{won(income)}</span>
                                    <span className="text-red-500">지출 -{won(expense)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

// ──[ 장부 줄 목록 ]──
function LedgerRows({ rows, catById, onEdit, onDelete, isLocked }) {
    return (
        <div className="space-y-1">
            {rows.map((r) => {
                const cat = catById[r.categoryId];
                const income = r.type === 'income';
                return (
                    <div key={r.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 flex-wrap text-sm">
                        <span className="w-24 shrink-0 text-xs font-medium text-gray-500">{r.date}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${income ? 'bg-blue-50 text-blue-600 ring-blue-200' : 'bg-red-50 text-red-500 ring-red-200'}`}>
                            {income ? '수익' : '지출'}
                        </span>
                        <span className="w-28 shrink-0 truncate font-bold text-gray-700">{cat ? cat.name : '(삭제된 항목)'}</span>
                        <span className={`shrink-0 font-extrabold ${income ? 'text-blue-600' : 'text-red-500'}`}>
                            {income ? '+' : '-'}{won(r.totalAmount)}
                        </span>
                        {Number(r.vat || 0) > 0 && (
                            <span className="shrink-0 text-[10px] text-gray-400">공급가 {won(r.amount)} + VAT {won(r.vat)}</span>
                        )}
                        <span className="flex-1 min-w-0 truncate text-xs text-gray-500">{r.memo}</span>
                        {isLocked && isLocked(r) ? (
                            <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500" title="정산 확정됨">🔒 정산확정</span>
                        ) : (
                            <>
                                <button onClick={() => onEdit(r)} className="shrink-0 text-xs font-bold text-gray-400 hover:text-gray-700">수정</button>
                                <button onClick={() => onDelete(r)} className="shrink-0 text-xs font-bold text-red-400 hover:text-red-600">삭제</button>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
