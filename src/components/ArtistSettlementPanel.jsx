// 아티스트 정산 — 계산 / 확정 / 확정 취소 / 지급 처리 / 정산서.
//
// 계산은 전부 src/domain/artistSettlement.js 의 순수 함수가 한다. 여기는 화면만.
//
// 읽기 한도: 기간 장부는 uid·artistId·ym('in') 전부 '같음' 조건이라 복합 색인이 필요 없다.
//            곡 금액은 보티즈 탭이 이미 받아둔 데이터를 그대로 써서 추가 조회가 없다.
import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
    AMOUNT_BASIS, AMOUNT_BASIS_LABEL,
    computeGeneralSettlement, computeCaseSettlement, computeCollab,
    buildSongRows, songSummaryOf, diffSongSummary, membersMissingCategory,
    monthsOfPeriod, periodLabel, periodKey, periodCount, linkTypeOf,
} from '../domain/artistSettlement.js';
import { printArtistSettlement } from '../utils/artistSettlementDoc.js';
import { computePayout, payoutSnapshot, payoutOfSettlement, taxTypeOf, TAX_TYPE_LABEL } from '../domain/artistPayout.js';

const inputClass = "w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 outline-none transition text-sm";
const selectClass = inputClass + " appearance-none";
const pill = "rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95";

const won = (n) => Number(Math.round(Number(n) || 0)).toLocaleString('ko-KR');
const pctText = (n) => (Math.round(Number(n || 0) * 100) / 100) + '%';
const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const CYCLE_LABEL = { month: '월', quarter: '분기', half: '반기', year: '연' };

export function ArtistSettlementPanel({
    user, artist, priv, categories, projects, allTransactions,
    cases, setCases, caseRowsMap, settlements, setSettlements, ledgerVersion,
}) {
    const cycle = artist.settlementCycle || 'month';
    const now = new Date();
    const defaultIndex = () => {
        const m = now.getMonth() + 1;
        if (cycle === 'month') return m;
        if (cycle === 'quarter') return Math.ceil(m / 3);
        if (cycle === 'half') return m <= 6 ? 1 : 2;
        return 1;
    };

    const [year, setYear] = useState(now.getFullYear());
    const [index, setIndex] = useState(defaultIndex());
    const [periodRows, setPeriodRows] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [payFor, setPayFor] = useState(null);     // 지급 처리 중인 정산 id
    const [payDate, setPayDate] = useState(todayStr());
    const [openDoc, setOpenDoc] = useState(null);   // 정산서 미리보기로 펼친 정산 id

    const artistId = artist.id;
    const months = useMemo(() => monthsOfPeriod(cycle, year, index), [cycle, year, index]);
    const label = periodLabel(cycle, year, index);
    const key = periodKey(cycle, year, index);

    // 기간 장부
    useEffect(() => {
        let alive = true;
        const load = async () => {
            setLoaded(false);
            try {
                const snap = await getDocs(query(
                    collection(db, 'artistLedger'),
                    where('uid', '==', user.uid),
                    where('artistId', '==', artistId),
                    where('ym', 'in', months)
                ));
                if (!alive) return;
                setPeriodRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoaded(true);
            } catch (e) {
                if (!alive) return;
                setErr('기간 장부를 못 불러왔습니다: ' + (e && e.message ? e.message : ''));
                setLoaded(true);
            }
        };
        load();
        return () => { alive = false; };
    }, [user, artistId, months, ledgerVersion]);

    const generalLedger = useMemo(() => periodRows.filter((r) => !r.caseId), [periodRows]);
    const songRows = useMemo(
        () => buildSongRows({ projects, transactions: allTransactions, artistId, months }),
        [projects, allTransactions, artistId, months]
    );

    const confirmedHere = useMemo(
        () => settlements.find((s) => s.kind === 'general' && s.periodKey === key) || null,
        [settlements, key]
    );

    // 직전 확정에서 넘어온 이월 — 이 기간보다 앞에서 끝난 일반 정산 중 가장 최근 것.
    const carryIn = useMemo(() => {
        const prev = settlements
            .filter((s) => s.kind === 'general' && String(s.periodEnd || '') < months[0])
            .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)))
            .pop();
        return prev ? Number(prev.carryOut || 0) : 0;
    }, [settlements, months]);

    const result = useMemo(
        () => computeGeneralSettlement({ artist, categories, ledgerRows: generalLedger, songRows, carryIn }),
        [artist, categories, generalLedger, songRows, carryIn]
    );

    const missingCats = useMemo(() => membersMissingCategory(projects, artistId), [projects, artistId]);

    // 아티스트 몫 이후 단계(세금). 몫 계산은 3단계 그대로 두고 여기서 받아서만 쓴다.
    const taxType = taxTypeOf(artist);
    const payout = useMemo(() => computePayout({ artistShare: result.artistShare, taxType }), [result.artistShare, taxType]);

    // 콜라보 곡 — 기간과 무관한 전체 진행 + 이 기간에 생긴 공유액
    const collabs = useMemo(() => {
        const monthSet = new Set(months);
        return (projects || [])
            .map((p) => {
                const link = (Array.isArray(p.artists) ? p.artists : []).find((a) => a.artistId === artistId);
                if (!link || linkTypeOf(link) !== 'collab_recoup') return null;
                const c = computeCollab({ transactions: allTransactions, projectId: p.id, link });
                const inPeriod = c.months.filter((m) => monthSet.has(m.ym));
                return {
                    projectId: p.id, projectName: p.name, ...c,
                    periodShare: inPeriod.reduce((a, m) => a + m.share, 0),
                    periodShareable: inPeriod.reduce((a, m) => a + m.shareable, 0),
                };
            })
            .filter(Boolean);
    }, [projects, allTransactions, artistId, months]);

    const collabPeriodTotal = collabs.reduce((a, c) => a + c.periodShare, 0);
    const confirmedCollab = useMemo(
        () => settlements.find((s) => s.kind === 'collab' && s.periodKey === key) || null,
        [settlements, key]
    );

    // 확정 뒤 곡 금액이 달라졌는지
    const driftOf = (s) => {
        if (!s || s.kind !== 'general') return [];
        const nowRows = buildSongRows({ projects, transactions: allTransactions, artistId, months: s.months || [] });
        return diffSongSummary(s.songs || [], songSummaryOf(nowRows));
    };

    const save = async (data) => {
        const ref = await addDoc(collection(db, 'artistSettlements'), { ...data, createdAt: new Date() });
        setSettlements((prev) => [...prev, { id: ref.id, ...data }]);
    };

    const confirmGeneral = async () => {
        if (confirmedHere) return;
        if (!window.confirm(label + ' 정산을 확정합니다. 이 기간 장부는 수정할 수 없게 됩니다.')) return;
        setBusy(true); setErr('');
        try {
            await save({
                uid: user.uid, artistId, kind: 'general',
                cycle, periodKey: key, periodLabel: label,
                periodStart: months[0], periodEnd: months[months.length - 1], months,
                basis: AMOUNT_BASIS,
                rows: result.rows,
                songs: songSummaryOf(songRows),
                ratioSnapshot: {
                    ratioUniform: !!artist.ratioUniform,
                    uniformRatio: artist.uniformRatio || {},
                    ratios: artist.ratios || {},
                },
                totalIncome: result.totalIncome, totalExpense: result.totalExpense,
                netBefore: result.netBefore, carryIn: result.carryIn, netAfter: result.netAfter,
                artistRatePercent: result.artistRatePercent,
                artistShare: result.artistShare, carryOut: result.carryOut,
                ...payoutSnapshot(payout),
                status: 'confirmed', paidAt: '', confirmedAt: new Date(),
            });
        } catch (e) {
            setErr('확정 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const confirmCollab = async () => {
        if (confirmedCollab || collabs.length === 0) return;
        if (!window.confirm(label + ' 콜라보 공유액을 확정합니다.')) return;
        setBusy(true); setErr('');
        try {
            await save({
                uid: user.uid, artistId, kind: 'collab',
                cycle, periodKey: key, periodLabel: label,
                periodStart: months[0], periodEnd: months[months.length - 1], months,
                basis: AMOUNT_BASIS,
                collabs: collabs.map((c) => ({
                    projectId: c.projectId, projectName: c.projectName,
                    recoupAmount: c.recoupAmount, sharePercent: c.sharePercent,
                    startMonth: c.startMonth, endMonth: c.endMonth,
                    recoveredAmount: c.recoveredAmount, remainingRecoup: c.remainingRecoup,
                    periodShareable: c.periodShareable, periodShare: c.periodShare,
                })),
                artistShare: collabPeriodTotal,
                ...payoutSnapshot(computePayout({ artistShare: collabPeriodTotal, taxType })),
                status: 'confirmed', paidAt: '', confirmedAt: new Date(),
            });
        } catch (e) {
            setErr('확정 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const confirmCase = async (c, calc) => {
        if (!window.confirm("'" + c.name + "' 건을 정산 확정합니다. 이 건의 내역은 수정할 수 없게 됩니다.")) return;
        setBusy(true); setErr('');
        try {
            await save({
                uid: user.uid, artistId, kind: 'case',
                caseId: c.id, caseName: c.name, periodLabel: '별도정산 건 · ' + c.name,
                periodKey: 'CASE-' + c.id, months: [],
                basis: AMOUNT_BASIS,
                rows: calc.rows, songs: [],
                ratioSnapshot: {
                    ratioUniform: !!artist.ratioUniform,
                    uniformRatio: artist.uniformRatio || {},
                    ratios: artist.ratios || {},
                },
                totalIncome: calc.totalIncome, totalExpense: calc.totalExpense,
                netBefore: calc.netBefore, carryIn: 0, netAfter: calc.netAfter,
                artistRatePercent: calc.artistRatePercent,
                artistShare: calc.artistShare, carryOut: 0,
                ...payoutSnapshot(computePayout({ artistShare: calc.artistShare, taxType })),
                status: 'confirmed', paidAt: '', confirmedAt: new Date(),
            });
            await updateDoc(doc(db, 'artistCases', c.id), { status: 'done' });
            setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'done' } : x)));
        } catch (e) {
            setErr('확정 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    // 가장 최근 확정 1건만 취소할 수 있다.
    const sortedByConfirm = useMemo(
        () => settlements.slice().sort((a, b) => {
            const av = a.confirmedAt && a.confirmedAt.seconds ? a.confirmedAt.seconds : 0;
            const bv = b.confirmedAt && b.confirmedAt.seconds ? b.confirmedAt.seconds : 0;
            return av - bv;
        }),
        [settlements]
    );
    const newest = sortedByConfirm.length ? sortedByConfirm[sortedByConfirm.length - 1] : null;

    const cancelConfirm = async (s) => {
        if (!newest || s.id !== newest.id) return;
        if (!window.confirm(s.periodLabel + ' 확정을 취소합니다. 저장된 정산 결과가 지워지고 장부 잠금이 풀립니다.')) return;
        setBusy(true); setErr('');
        try {
            await deleteDoc(doc(db, 'artistSettlements', s.id));
            setSettlements((prev) => prev.filter((x) => x.id !== s.id));
            if (s.kind === 'case' && s.caseId) {
                await updateDoc(doc(db, 'artistCases', s.caseId), { status: 'open' });
                setCases((prev) => prev.map((x) => (x.id === s.caseId ? { ...x, status: 'open' } : x)));
            }
        } catch (e) {
            setErr('확정 취소 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const markPaid = async (s) => {
        if (!payDate) { setErr('지급일을 넣어 주세요.'); return; }
        setBusy(true); setErr('');
        try {
            await updateDoc(doc(db, 'artistSettlements', s.id), { status: 'paid', paidAt: payDate });
            setSettlements((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'paid', paidAt: payDate } : x)));
            setPayFor(null);
        } catch (e) {
            setErr('지급 처리 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const printDoc = (s) => {
        printArtistSettlement({
            artistName: artist.stageName || '(이름없음)',
            realName: artist.realName || '',
            periodLabel: s.periodLabel,
            months: (s.months || []).length ? s.months[0] + ' ~ ' + s.months[s.months.length - 1] : '',
            basisLabel: AMOUNT_BASIS_LABEL[s.basis || AMOUNT_BASIS],
            issueDate: todayStr(),
            bank: (priv && priv.bank) || '',
            accountNumber: (priv && priv.accountNumber) || '',
            accountHolder: (priv && priv.accountHolder) || '',
            rows: s.rows || [],
            songs: s.songs || [],
            collabs: s.collabs || [],
            totalIncome: s.totalIncome || 0,
            totalExpense: s.totalExpense || 0,
            netBefore: s.netBefore || 0,
            carryIn: s.carryIn || 0,
            netAfter: s.netAfter || 0,
            artistRatePercent: s.artistRatePercent || 0,
            carryOut: s.carryOut || 0,
            artistShare: s.artistShare || 0,
            payout: payoutOfSettlement(s),
            bizNo: (priv && priv.bizNo) || '',
        });
    };

    const years = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) years.push(y);

    return (
        <section className="rounded-2xl border-2 border-amber-100 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-800 text-sm">정산</h4>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        {CYCLE_LABEL[cycle]} 단위 · {AMOUNT_BASIS_LABEL[AMOUNT_BASIS]} · {TAX_TYPE_LABEL[taxType]}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <select className={selectClass + ' w-28'} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                    </select>
                    {periodCount(cycle) > 1 && (
                        <select className={selectClass + ' w-28'} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                            {Array.from({ length: periodCount(cycle) }, (_, i) => i + 1).map((i) => (
                                <option key={i} value={i}>{periodLabel(cycle, year, i).replace(year + '년 ', '')}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {err && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{err}</div>}

            {missingCats.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800">
                    넣을 항목을 안 고른 곡이 있어 그 금액은 정산에 안 들어갑니다 —{' '}
                    {missingCats.map((m) => m.projectName + '(' + m.missing.join('·') + ')').join(', ')}
                </div>
            )}

            {/* 일반 정산 */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-500">{label} · 일반 정산</span>
                    {confirmedHere ? (
                        <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-bold text-white">
                            확정됨{confirmedHere.status === 'paid' ? ' · 지급완료' : ''}
                        </span>
                    ) : (
                        <button disabled={busy || !loaded} onClick={confirmGeneral} className={`${pill} bg-amber-600 text-white hover:bg-amber-700`}>
                            정산 확정
                        </button>
                    )}
                </div>

                {!loaded ? (
                    <div className="text-xs text-gray-400">불러오는 중...</div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] font-bold text-gray-400">
                                        <th className="text-left py-1">항목</th>
                                        <th className="text-right">장부</th>
                                        <th className="text-right">곡(지분)</th>
                                        <th className="text-right">수익</th>
                                        <th className="text-right">지출</th>
                                        <th className="text-right">아티스트%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.length === 0 && (
                                        <tr><td colSpan="6" className="py-3 text-center text-xs text-gray-400">이 기간 내역이 없습니다.</td></tr>
                                    )}
                                    {result.rows.map((r) => (
                                        <tr key={r.categoryId} className="border-t border-gray-100">
                                            <td className="py-1.5 font-bold text-gray-700">{r.name}</td>
                                            <td className="text-right text-xs text-gray-500">{won(r.ledgerIncome - r.ledgerExpense)}</td>
                                            <td className="text-right text-xs text-gray-500">{won(r.songIncome - r.songExpense)}</td>
                                            <td className="text-right font-bold text-blue-600">{r.income ? '+' + won(r.income) : '-'}</td>
                                            <td className="text-right font-bold text-red-500">{r.expense ? '-' + won(r.expense) : '-'}</td>
                                            <td className="text-right text-xs font-bold text-gray-500">{r.income > 0 ? pctText(r.artistPercent) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Box label="총수익" value={'+' + won(result.totalIncome)} tone="blue" />
                            <Box label="총지출" value={'-' + won(result.totalExpense)} tone="red" />
                            <Box label={'순수익' + (result.carryIn ? ' (이월 ' + won(result.carryIn) + ')' : '')}
                                value={won(result.netAfter)} tone={result.netAfter >= 0 ? 'gray' : 'red'} />
                            <Box label={'아티스트 몫 · 비율 ' + pctText(result.artistRatePercent)}
                                value={won(result.artistShare)} tone="amber" />
                        </div>
                        <PayoutLine payout={payout} />
                        {result.carryOut < 0 && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs font-bold text-red-700">
                                순수익이 0 이하라 지급액은 0원이고, {won(result.carryOut)} 이 다음 정산으로 이월됩니다.
                            </div>
                        )}

                        {songRows.length > 0 && (
                            <div className="rounded-xl bg-blue-50/50 p-3 space-y-1">
                                <div className="text-[10px] font-bold text-blue-500">곡 내역 (소속 지분 반영) — 장부와 따로 집계</div>
                                {songSummaryOf(songRows).map((s) => (
                                    <div key={s.projectId} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                                        <span className="font-bold text-gray-700">{s.projectName} <span className="text-gray-400">{pctText(s.sharePercent)}</span></span>
                                        <span className="text-gray-500">
                                            곡 전체 +{won(s.rawIncome)} / 지분 <b className="text-blue-600">+{won(s.income)}</b>
                                            {s.expense ? <> · 지분지출 <b className="text-red-500">-{won(s.expense)}</b></> : null}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 콜라보 */}
            {collabs.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-500">콜라보 곡 — 제작비 회수 후 공유 (일반 정산·이월과 섞지 않음)</span>
                        {confirmedCollab ? (
                            <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-bold text-white">
                                확정됨{confirmedCollab.status === 'paid' ? ' · 지급완료' : ''}
                            </span>
                        ) : (
                            <button disabled={busy} onClick={confirmCollab} className={`${pill} bg-indigo-600 text-white hover:bg-indigo-700`}>
                                콜라보 확정 (실지급 {won(computePayout({ artistShare: collabPeriodTotal, taxType }).netPayout)})
                            </button>
                        )}
                    </div>
                    {collabs.map((c) => (
                        <div key={c.projectId} className="rounded-xl bg-indigo-50/50 p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-bold text-gray-800 text-sm">{c.projectName}</span>
                                <span className="text-xs font-bold text-indigo-700">{label} 공유액 {won(c.periodShare)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white overflow-hidden ring-1 ring-indigo-100">
                                <div className="h-full bg-indigo-500" style={{ width: Math.round(c.recoupProgress * 100) + '%' }} />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-600">
                                <span>회수 {won(c.recoveredAmount)} / {won(c.recoupAmount)} ({Math.round(c.recoupProgress * 100)}%)</span>
                                <span>남은 제작비 <b>{won(c.remainingRecoup)}</b></span>
                                <span>공유율 {pctText(c.sharePercent)}</span>
                                <span>기간 {c.startMonth} ~ {c.endMonth}</span>
                                <span>누적 공유액 {won(c.artistShare)}</span>
                            </div>
                            {c.incomeBeforeStartCount > 0 && (
                                <div className="text-[11px] font-bold text-amber-700">
                                    ⚠️ 공유 시작월({c.startMonth}) 이전 수익이 {c.incomeBeforeStartCount}건 {won(c.incomeBeforeStart)} 있습니다 — 공유 대상이 아닙니다.
                                </div>
                            )}
                            {c.incomeAfterEndCount > 0 && (
                                <div className="text-[11px] font-bold text-gray-500">
                                    기간 종료({c.endMonth}) 이후 수익 {c.incomeAfterEndCount}건 {won(c.incomeAfterEnd)} — 공유 대상이 아닙니다.
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 별도정산 건 */}
            {cases.length > 0 && (
                <div className="space-y-2">
                    <span className="text-xs font-bold text-gray-500">별도정산 건 — 이월 없이 그 건만 계산</span>
                    {cases.map((c) => {
                        const rows = (caseRowsMap[c.id] || []);
                        const calc = computeCaseSettlement({ artist, categories, ledgerRows: rows });
                        const done = c.status === 'done';
                        return (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 flex-wrap">
                                <span className="font-bold text-gray-800 text-sm">{c.name}</span>
                                <span className="text-xs text-gray-500">
                                    수익 +{won(calc.totalIncome)} · 지출 -{won(calc.totalExpense)} · 순수익 {won(calc.netAfter)} ·
                                    비율 {pctText(calc.artistRatePercent)} · <b className="text-amber-700">몫 {won(calc.artistShare)}</b> ·
                                    실지급 <b className="text-gray-900">{won(computePayout({ artistShare: calc.artistShare, taxType }).netPayout)}</b>
                                </span>
                                {done ? (
                                    <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-bold text-white">정산완료</span>
                                ) : (
                                    <button disabled={busy} onClick={() => confirmCase(c, calc)} className={`${pill} bg-amber-600 text-white hover:bg-amber-700`}>
                                        건 정산 확정
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 확정 목록 */}
            <div className="space-y-2">
                <span className="text-xs font-bold text-gray-500">확정된 정산</span>
                {settlements.length === 0 ? (
                    <div className="text-xs text-gray-400">확정된 정산이 없습니다.</div>
                ) : (
                    sortedByConfirm.slice().reverse().map((s) => {
                        const drift = driftOf(s);
                        return (
                            <div key={s.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                                            {s.kind === 'general' ? '일반' : s.kind === 'collab' ? '콜라보' : '별도정산 건'}
                                        </span>
                                        <span className="font-bold text-gray-800 text-sm truncate">{s.periodLabel}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${s.status === 'paid' ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                                            {s.status === 'paid' ? '지급완료 ' + (s.paidAt || '') : '확정'}
                                        </span>
                                    </div>
                                    <span className="text-right">
                                        <span className="font-extrabold text-gray-900">{won(s.artistShare)}원</span>
                                        {payoutOfSettlement(s) ? (
                                            <span className="block text-[11px] font-bold text-gray-500">
                                                실지급 {won(payoutOfSettlement(s).netPayout)} · {TAX_TYPE_LABEL[payoutOfSettlement(s).taxType]}
                                            </span>
                                        ) : (
                                            <span className="block text-[11px] font-bold text-gray-400">세무 정보 없음(4단계 이전 확정)</span>
                                        )}
                                    </span>
                                </div>

                                {drift.length > 0 && (
                                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] font-bold text-amber-800">
                                        ⚠️ 확정 뒤 곡 금액이 달라졌습니다(곡 내역은 잠글 수 없습니다) —{' '}
                                        {drift.map((d) => d.projectName + ' ' + d.reason).join(', ')}. 정산서는 확정 당시 값으로 나갑니다.
                                    </div>
                                )}

                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => setOpenDoc(openDoc === s.id ? null : s.id)} className={`${pill} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>
                                        {openDoc === s.id ? '접기' : '정산서 보기'}
                                    </button>
                                    <button onClick={() => printDoc(s)} className={`${pill} bg-gray-800 text-white hover:bg-gray-700`}>
                                        정산서 인쇄 · PDF
                                    </button>
                                    {s.status !== 'paid' && (
                                        payFor === s.id ? (
                                            <span className="flex items-center gap-1 flex-wrap">
                                                <span className="text-xs font-bold text-green-700">
                                                    실지급 {payoutOfSettlement(s) ? won(payoutOfSettlement(s).netPayout) : won(s.artistShare)}원
                                                </span>
                                                <input type="date" className={inputClass + ' w-40'} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                                                <button disabled={busy} onClick={() => markPaid(s)} className={`${pill} bg-green-600 text-white hover:bg-green-700`}>지급 확인</button>
                                                <button onClick={() => setPayFor(null)} className={`${pill} bg-gray-200 text-gray-600`}>취소</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => { setPayFor(s.id); setPayDate(todayStr()); }} className={`${pill} bg-white text-green-700 ring-1 ring-green-200 hover:bg-green-50`}>
                                                지급 처리
                                            </button>
                                        )
                                    )}
                                    {newest && s.id === newest.id && (
                                        <button disabled={busy} onClick={() => cancelConfirm(s)} className={`${pill} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}>
                                            확정 취소
                                        </button>
                                    )}
                                </div>

                                {openDoc === s.id && <DocPreview s={s} priv={priv} artist={artist} />}
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}

// 아티스트 몫 → 실지급액. 계산은 domain/artistPayout.js 가 한다.
function PayoutLine({ payout }) {
    if (!payout) return null;
    const invoice = payout.taxType === 'invoice';
    return (
        <div className="rounded-xl bg-gray-900 text-white px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-300">
                {TAX_TYPE_LABEL[payout.taxType]}
                {invoice
                    ? ` · 세금계산서 공급가 ${won(payout.supplyAmount)} / 부가세 ${won(payout.vat)}`
                    : ` · 몫 ${won(payout.artistShare)} − 소득세 ${won(payout.incomeTax)} − 지방소득세 ${won(payout.localTax)}`}
                {invoice ? ' · 세금계산서 수취 필요' : ''}
            </span>
            <span className="text-sm font-extrabold">
                {invoice ? '지급액(부가세 포함) ' : '실지급액 '}{won(payout.netPayout)}원
            </span>
        </div>
    );
}

function Box({ label, value, tone }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-600',
        red: 'bg-red-50 text-red-500',
        gray: 'bg-gray-100 text-gray-900',
        amber: 'bg-amber-50 text-amber-700',
    };
    return (
        <div className={`rounded-xl px-3 py-2 ${tones[tone] || tones.gray}`}>
            <div className="text-[10px] font-bold opacity-70">{label}</div>
            <div className="text-base font-extrabold">{value}</div>
        </div>
    );
}

// 화면에서 바로 보는 정산서(인쇄본과 같은 내용).
function DocPreview({ s, priv, artist }) {
    const mask = (v) => {
        const t = String(v || '').trim();
        if (!t) return '';
        return t.length <= 4 ? t : '****' + t.slice(-4);
    };
    return (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-4 text-sm space-y-3">
            <div className="flex justify-between items-end border-b-2 border-gray-900 pb-2">
                <div>
                    <div className="text-lg font-extrabold">아티스트 정산서</div>
                    <div className="text-xs text-gray-500">{artist.stageName} · {s.periodLabel}</div>
                </div>
                <div className="text-[10px] text-gray-400 text-right">
                    금액 기준: {AMOUNT_BASIS_LABEL[s.basis || AMOUNT_BASIS]}<br />
                    입금 계좌: {(priv && priv.bank) || '-'} {mask(priv && priv.accountNumber)}
                </div>
            </div>

            {(s.rows || []).length > 0 && (
                <table className="w-full text-xs">
                    <thead><tr className="text-gray-400"><th className="text-left">항목</th><th className="text-right">수익</th><th className="text-right">지출</th><th className="text-right">비율</th></tr></thead>
                    <tbody>
                        {(s.rows || []).map((r) => (
                            <tr key={r.categoryId} className="border-t border-gray-100">
                                <td className="py-1">{r.name}</td>
                                <td className="text-right">{r.income ? won(r.income) : '-'}</td>
                                <td className="text-right">{r.expense ? won(r.expense) : '-'}</td>
                                <td className="text-right">{r.income > 0 ? pctText(r.artistPercent) : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {(s.collabs || []).length > 0 && (
                <table className="w-full text-xs">
                    <thead><tr className="text-gray-400"><th className="text-left">콜라보 곡</th><th className="text-right">남은 제작비</th><th className="text-right">공유율</th><th className="text-right">공유액</th></tr></thead>
                    <tbody>
                        {s.collabs.map((c) => (
                            <tr key={c.projectId} className="border-t border-gray-100">
                                <td className="py-1">{c.projectName}</td>
                                <td className="text-right">{won(c.remainingRecoup)}</td>
                                <td className="text-right">{pctText(c.sharePercent)}</td>
                                <td className="text-right">{won(c.periodShare)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {s.kind !== 'collab' && (
                <div className="space-y-0.5 text-xs">
                    <Line k="총수익" v={won(s.totalIncome)} />
                    <Line k="총지출" v={won(s.totalExpense)} />
                    <Line k="기간 순수익" v={won(s.netBefore)} />
                    {!!s.carryIn && <Line k="직전 이월" v={won(s.carryIn)} red />}
                    <Line k="정산 대상 순수익" v={won(s.netAfter)} />
                    <Line k="아티스트 비율 (수익 가중)" v={pctText(s.artistRatePercent)} />
                    {!!s.carryOut && <Line k="다음 정산으로 이월" v={won(s.carryOut)} red />}
                </div>
            )}

            <div className="flex justify-between items-center bg-gray-900 text-white rounded-lg px-3 py-2">
                <span className="font-bold text-xs">아티스트 몫</span>
                <span className="font-extrabold">{won(s.artistShare)}원</span>
            </div>

            {payoutOfSettlement(s) ? (
                <div className="space-y-0.5 text-xs rounded-lg bg-gray-50 p-3">
                    <div className="text-[10px] font-bold text-gray-400">
                        {TAX_TYPE_LABEL[payoutOfSettlement(s).taxType]}
                        {payoutOfSettlement(s).needsInvoice ? ' · 세금계산서 수취 필요' : ''}
                    </div>
                    {payoutOfSettlement(s).taxType === 'invoice' ? (
                        <>
                            <Line k="세금계산서 공급가 (지급액 ÷ 1.1)" v={won(payoutOfSettlement(s).supplyAmount)} />
                            <Line k="부가세" v={won(payoutOfSettlement(s).vat)} />
                        </>
                    ) : (
                        <>
                            <Line k="소득세 (3%)" v={'-' + won(payoutOfSettlement(s).incomeTax)} red />
                            <Line k="지방소득세 (소득세의 10%)" v={'-' + won(payoutOfSettlement(s).localTax)} red />
                        </>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                        <span className="font-bold text-gray-700">
                            {payoutOfSettlement(s).taxType === 'invoice' ? '지급액 (부가세 포함)' : '실지급액'}
                        </span>
                        <span className="font-extrabold text-gray-900">{won(payoutOfSettlement(s).netPayout)}원</span>
                    </div>
                </div>
            ) : (
                <div className="rounded-lg bg-gray-50 p-3 text-[11px] font-bold text-gray-400">
                    세무 정보 없음(4단계 이전 확정) — 다시 계산하지 않습니다.
                </div>
            )}
        </div>
    );
}

function Line({ k, v, red }) {
    return (
        <div className="flex justify-between">
            <span className="text-gray-500">{k}</span>
            <span className={red ? 'font-bold text-red-600' : 'font-bold text-gray-800'}>{v}</span>
        </div>
    );
}
