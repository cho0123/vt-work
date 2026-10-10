// 매니지먼트 탭 — 아티스트 등록·관리, 공통 수익/지출 항목, 아티스트별 정산비율.
//
// 1단계(이 파일)는 '등록과 설정'까지다. 수입·지출 장부와 정산 계산
// (artistLedger / artistSettlements)은 다음 단계에서 만든다.
//
// 쓰는 컬렉션 — 전부 새로 만든 것이라 기존 데이터와 겹치지 않는다.
//   artists/{id}        일반정보 + 정산비율
//   artistPrivate/{id}  민감정보(생년월일·주소·계좌). 문서 ID 는 artists 와 같다.
//   mgmtCategories/{id} 공통 수익·지출 항목
//
// 보티즈-정산 탭의 하위 탭으로 들어간다 — 바깥 여백과 스크롤은 부모(VotizTab)가 맡는다.
//
// 읽기 한도(하루 5만)를 아끼려고:
//   - 목록·항목은 탭을 열 때 한 번만 읽고, 저장 뒤에는 메모리 상태만 갱신한다.
//   - artistPrivate 는 상세를 열 때 그 아티스트 1건만 읽는다(목록에는 안 쓴다).
import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ArtistWorkspace } from './ArtistWorkspace.jsx';
import { TAX_TYPES, taxTypeOf } from '../domain/artistPayout.js';

const inputClass = "w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 outline-none transition text-sm";
const selectClass = inputClass + " appearance-none";
const pill = "rounded-full px-4 py-2 text-sm font-bold shadow-sm transition active:scale-95";

const CYCLES = [
    { key: 'month', label: '월' },
    { key: 'quarter', label: '분기' },
    { key: 'half', label: '반기' },
    { key: 'year', label: '연' },
];

const EMPTY_ARTIST = {
    realName: '', stageName: '', phone: '', email: '',
    contractStart: '', contractEnd: '', settlementCycle: 'month',
    status: 'active', memo: '',
    taxType: 'withholding',   // 없으면 원천징수로 본다(옛 문서는 고치지 않는다)
    ratioUniform: true,
    uniformRatio: { company: 50, artist: 50 },
    ratios: {},
};
const EMPTY_PRIVATE = { birth: '', address: '', bank: '', accountNumber: '', accountHolder: '', bizNo: '' };

// 'YYYY-MM-DD' 까지 남은 일수. 한국에서만 쓰므로 로컬 자정 기준으로 센다.
const daysUntil = (ymd) => {
    if (!ymd) return null;
    const end = new Date(ymd + 'T00:00:00');
    if (Number.isNaN(end.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((end - today) / 86400000);
};

// 계좌번호는 뒤 4자리만 남기고 가린다.
const maskAccount = (v) => {
    const s = (v || '').trim();
    if (!s) return '';
    if (s.length <= 4) return s;
    return '•'.repeat(s.length - 4) + s.slice(-4);
};

const byOrder = (a, b) => {
    const d = Number(a.order || 0) - Number(b.order || 0);
    if (d !== 0) return d;
    return (a.name || '').localeCompare(b.name || '');
};

// 비율 한 쌍의 합. 한쪽이라도 비어 있으면 null(미입력).
const sumOf = (p) => {
    if (!p) return null;
    if (p.company === '' || p.company === undefined || p.company === null) return null;
    if (p.artist === '' || p.artist === undefined || p.artist === null) return null;
    return Number(p.company) + Number(p.artist);
};

const clampPercent = (raw) => {
    if (raw === '') return '';
    return Math.max(0, Math.min(100, Number(raw) || 0));
};

// projects / allTransactions 는 보티즈 탭이 이미 받아둔 것을 그대로 받는다(추가 조회 0회).
export function ManagementTab({ user, projects, allTransactions }) {
    const [artists, setArtists] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');

    const [statusFilter, setStatusFilter] = useState('all');
    const [openId, setOpenId] = useState(null);   // 상세가 열린 아티스트 id
    const [isNew, setIsNew] = useState(false);    // 신규 등록 폼이 열렸는지
    const [form, setForm] = useState(EMPTY_ARTIST);
    const [priv, setPriv] = useState(EMPTY_PRIVATE);
    const [showAccount, setShowAccount] = useState(false);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [showCats, setShowCats] = useState(false);

    // 탭을 열 때 한 번만 읽는다.
    useEffect(() => {
        if (!user) return;
        let alive = true;
        const load = async () => {
            try {
                const [aSnap, cSnap] = await Promise.all([
                    getDocs(query(collection(db, 'artists'), where('uid', '==', user.uid))),
                    getDocs(query(collection(db, 'mgmtCategories'), where('uid', '==', user.uid))),
                ]);
                if (!alive) return;
                setArtists(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setCategories(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoaded(true);
            } catch (e) {
                if (!alive) return;
                setLoadError(e && e.message ? e.message : '불러오지 못했습니다.');
                setLoaded(true);
            }
        };
        load();
        return () => { alive = false; };
    }, [user]);

    const incomeCats = useMemo(
        () => categories.filter((c) => c.kind === 'income' && !c.hidden).sort(byOrder),
        [categories]
    );

    const visibleArtists = useMemo(() => {
        const list = artists.filter((a) => statusFilter === 'all' || (a.status || 'active') === statusFilter);
        return list.sort((a, b) => {
            const sa = (a.status || 'active') === 'active' ? 0 : 1;
            const sb = (b.status || 'active') === 'active' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.stageName || '').localeCompare(b.stageName || '');
        });
    }, [artists, statusFilter]);

    const openArtist = async (a) => {
        if (openId === a.id && !isNew) { setOpenId(null); return; }  // 같은 줄을 다시 누르면 접힌다
        setIsNew(false);
        setOpenId(a.id);
        setFormError('');
        setShowAccount(false);
        setForm({
            ...EMPTY_ARTIST,
            ...a,
            taxType: taxTypeOf(a),
            uniformRatio: { ...EMPTY_ARTIST.uniformRatio, ...(a.uniformRatio || {}) },
            ratios: { ...(a.ratios || {}) },
        });
        setPriv(EMPTY_PRIVATE);
        try {
            const snap = await getDoc(doc(db, 'artistPrivate', a.id));
            setPriv(snap.exists() ? { ...EMPTY_PRIVATE, ...snap.data() } : EMPTY_PRIVATE);
        } catch (e) {
            setFormError('민감정보를 불러오지 못했습니다: ' + (e && e.message ? e.message : ''));
        }
    };

    const startNew = () => {
        setIsNew(true);
        setOpenId(null);
        setForm(EMPTY_ARTIST);
        setPriv(EMPTY_PRIVATE);
        setShowAccount(true);  // 새로 넣는 계좌는 가릴 게 없다
        setFormError('');
    };

    const closeForm = () => { setIsNew(false); setOpenId(null); setFormError(''); };

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const setPrivField = (k, v) => setPriv((p) => ({ ...p, [k]: v }));

    const setUniform = (side, raw) =>
        setForm((f) => ({ ...f, uniformRatio: { ...f.uniformRatio, [side]: clampPercent(raw) } }));

    const setRatio = (catId, side, raw) =>
        setForm((f) => ({
            ...f,
            ratios: {
                ...f.ratios,
                [catId]: { company: '', artist: '', ...(f.ratios[catId] || {}), [side]: clampPercent(raw) },
            },
        }));

    // 개별로 바꿀 때, 아직 비어 있는 항목은 일괄 비율로 채워 둔다(처음부터 다시 안 쓰게).
    const toggleUniform = (on) =>
        setForm((f) => {
            if (on) return { ...f, ratioUniform: true };
            const next = { ...f.ratios };
            incomeCats.forEach((c) => {
                if (sumOf(next[c.id]) === null) {
                    next[c.id] = { company: f.uniformRatio.company, artist: f.uniformRatio.artist };
                }
            });
            return { ...f, ratioUniform: false, ratios: next };
        });

    const validate = () => {
        if (!(form.stageName || '').trim()) return '활동명을 입력해 주세요.';
        if (form.contractStart && form.contractEnd && form.contractEnd < form.contractStart)
            return '계약 종료일이 계약일보다 앞섭니다.';
        if (form.ratioUniform) {
            const s = sumOf(form.uniformRatio);
            if (s === null) return '정산비율(회사·아티스트)을 모두 입력해 주세요.';
            if (s !== 100) return '정산비율 합이 100% 가 아닙니다. 지금 ' + s + '% 입니다.';
        } else {
            for (let i = 0; i < incomeCats.length; i++) {
                const c = incomeCats[i];
                const s = sumOf(form.ratios[c.id]);
                if (s === null) return "'" + c.name + "' 항목의 비율을 입력해 주세요.";
                if (s !== 100) return "'" + c.name + "' 항목의 비율 합이 100% 가 아닙니다. 지금 " + s + '% 입니다.';
            }
        }
        return '';
    };

    const handleSave = async () => {
        const msg = validate();
        if (msg) { setFormError(msg); return; }
        setSaving(true);
        setFormError('');
        try {
            const ratios = {};
            if (!form.ratioUniform) {
                incomeCats.forEach((c) => {
                    const p = form.ratios[c.id];
                    if (sumOf(p) !== null) ratios[c.id] = { company: Number(p.company), artist: Number(p.artist) };
                });
            }
            const base = {
                uid: user.uid,
                realName: (form.realName || '').trim(),
                stageName: (form.stageName || '').trim(),
                phone: (form.phone || '').trim(),
                email: (form.email || '').trim(),
                contractStart: form.contractStart || '',
                contractEnd: form.contractEnd || '',
                settlementCycle: form.settlementCycle || 'month',
                status: form.status || 'active',
                taxType: form.taxType || 'withholding',
                memo: form.memo || '',
                ratioUniform: !!form.ratioUniform,
                uniformRatio: {
                    company: Number(form.uniformRatio.company),
                    artist: Number(form.uniformRatio.artist),
                },
                ratios,
                updatedAt: new Date(),
            };
            const privData = {
                uid: user.uid,
                birth: priv.birth || '',
                address: priv.address || '',
                bank: priv.bank || '',
                accountNumber: (priv.accountNumber || '').trim(),
                accountHolder: (priv.accountHolder || '').trim(),
                bizNo: (priv.bizNo || '').trim(),
                updatedAt: new Date(),
            };

            if (isNew) {
                const ref = await addDoc(collection(db, 'artists'), { ...base, createdAt: new Date() });
                await setDoc(doc(db, 'artistPrivate', ref.id), privData);
                setArtists((prev) => [...prev, { id: ref.id, ...base }]);
                setIsNew(false);
                setOpenId(ref.id);
                setShowAccount(false);
            } else {
                await updateDoc(doc(db, 'artists', openId), base);
                await setDoc(doc(db, 'artistPrivate', openId), privData, { merge: true });
                setArtists((prev) => prev.map((a) => (a.id === openId ? { ...a, ...base, id: openId } : a)));
            }
            alert('저장했습니다.');
        } catch (e) {
            setFormError('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally {
            setSaving(false);
        }
    };

    const handleEnd = async (a) => {
        if (!window.confirm((a.stageName || '이 아티스트') + ' 을(를) 종료 상태로 바꿉니다. 데이터는 그대로 남습니다.')) return;
        try {
            await updateDoc(doc(db, 'artists', a.id), { status: 'ended', updatedAt: new Date() });
            setArtists((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'ended' } : x)));
            if (openId === a.id) setField('status', 'ended');
        } catch (e) {
            alert('변경 실패: ' + (e && e.message ? e.message : ''));
        }
    };

    // 삭제는 되돌릴 수 없어서 두 번 확인한다. 평소에는 '종료 처리'를 쓰게 안내한다.
    const handleDelete = async (a) => {
        const name = a.stageName || '이 아티스트';
        if (!window.confirm('정말 삭제할까요? ' + name + ' 의 일반정보와 민감정보가 모두 지워지고 되돌릴 수 없습니다. 보통은 삭제보다 종료 처리를 권합니다.')) return;
        if (!window.confirm('한 번 더 확인합니다. ' + name + ' 을(를) 삭제합니다.')) return;
        try {
            await deleteDoc(doc(db, 'artistPrivate', a.id));
            await deleteDoc(doc(db, 'artists', a.id));
            setArtists((prev) => prev.filter((x) => x.id !== a.id));
            if (openId === a.id) closeForm();
        } catch (e) {
            alert('삭제 실패: ' + (e && e.message ? e.message : ''));
        }
    };

    const formOpen = isNew || !!openId;
    const current = openId ? artists.find((a) => a.id === openId) : null;

    return (
        <div className="flex flex-col w-full gap-5">
            {/* 상단 */}
            <div className="shrink-0 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-extrabold text-gray-800">아티스트</h2>
                <div className="flex gap-1 bg-gray-200/70 p-1 rounded-2xl">
                    {[
                        { key: 'all', label: '전체' },
                        { key: 'active', label: '진행중' },
                        { key: 'ended', label: '종료' },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setStatusFilter(key)}
                            className={`px-4 py-1.5 rounded-xl text-sm font-bold transition ${statusFilter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex gap-2">
                    <button onClick={() => setShowCats((v) => !v)} className={`${pill} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>
                        항목 관리
                    </button>
                    <button onClick={startNew} className={`${pill} bg-emerald-600 text-white hover:bg-emerald-700`}>
                        + 아티스트 등록
                    </button>
                </div>
            </div>

            {showCats && (
                <CategoryManager user={user} categories={categories} setCategories={setCategories} onClose={() => setShowCats(false)} />
            )}

            {loadError && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-bold text-red-700">
                    불러오기 실패: {loadError}
                </div>
            )}

            {/* 목록 — 활동명·계약기간·상태만 */}
            <div className="space-y-2">
                {!loaded && <div className="text-sm text-gray-400 px-1">불러오는 중...</div>}
                {loaded && visibleArtists.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-400">
                        등록된 아티스트가 없습니다. 오른쪽 위 '+ 아티스트 등록'으로 추가하세요.
                    </div>
                )}
                {visibleArtists.map((a) => {
                    const active = (a.status || 'active') === 'active';
                    const left = daysUntil(a.contractEnd);
                    const isOpen = openId === a.id && !isNew;
                    return (
                        <div key={a.id}>
                            <div onClick={() => openArtist(a)}
                                className={`cursor-pointer rounded-xl border p-3 transition ${isOpen ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-200' : 'border-gray-100 bg-white hover:border-emerald-300 hover:shadow-sm'}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`font-bold truncate ${isOpen ? 'text-emerald-800' : 'text-gray-800'}`}>{a.stageName || '(활동명 없음)'}</span>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${active ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
                                            {active ? '진행중' : '종료'}
                                        </span>
                                        {active && left !== null && left < 0 && (
                                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                                                계약 만료 ({0 - left}일 지남)
                                            </span>
                                        )}
                                        {active && left !== null && left >= 0 && left <= 30 && (
                                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                                                계약 만료 D-{left}
                                            </span>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-xs font-medium text-gray-500">
                                        {a.contractStart || '?'} ~ {a.contractEnd || '?'}
                                    </span>
                                </div>
                            </div>
                            {isOpen && (
                                <>
                                    <ArtistForm
                                        isNew={false} form={form} priv={priv} setField={setField} setPrivField={setPrivField}
                                        showAccount={showAccount} setShowAccount={setShowAccount}
                                        incomeCats={incomeCats} setUniform={setUniform} setRatio={setRatio} toggleUniform={toggleUniform}
                                        formError={formError} saving={saving} onSave={handleSave} onClose={closeForm}
                                        onEnd={current ? () => handleEnd(current) : null}
                                        onDelete={current ? () => handleDelete(current) : null}
                                    />
                                    {current && (
                                        <ArtistWorkspace
                                            user={user} artist={current} categories={categories}
                                            projects={projects} allTransactions={allTransactions}
                                            priv={priv}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 신규 등록 폼 */}
            {isNew && (
                <ArtistForm
                    isNew form={form} priv={priv} setField={setField} setPrivField={setPrivField}
                    showAccount={showAccount} setShowAccount={setShowAccount}
                    incomeCats={incomeCats} setUniform={setUniform} setRatio={setRatio} toggleUniform={toggleUniform}
                    formError={formError} saving={saving} onSave={handleSave} onClose={closeForm}
                    onEnd={null} onDelete={null}
                />
            )}

            {!formOpen && loaded && visibleArtists.length > 0 && (
                <div className="text-xs text-gray-400 px-1">아티스트를 누르면 상세가 열립니다. 한 번 더 누르면 접힙니다.</div>
            )}
        </div>
    );
}

// ──[ 아티스트 상세/등록 폼 ]──
function ArtistForm({ isNew, form, priv, setField, setPrivField, showAccount, setShowAccount,
    incomeCats, setUniform, setRatio, toggleUniform, formError, saving, onSave, onClose, onEnd, onDelete }) {

    const hasAccount = (priv.accountNumber || '').length > 0;
    const accountVisible = showAccount || !hasAccount;
    const uniSum = sumOf(form.uniformRatio);

    return (
        <div className="mt-2 rounded-2xl border-2 border-emerald-100 bg-white p-5 shadow-sm space-y-6">
            <h3 className="font-bold text-gray-800">{isNew ? '아티스트 등록' : '아티스트 정보'}</h3>

            {/* 일반정보 */}
            <section className="space-y-3">
                <div className="text-xs font-bold text-gray-400">일반정보</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">활동명</span>
                        <input className={inputClass} value={form.stageName} onChange={(e) => setField('stageName', e.target.value)} placeholder="필수" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">본명</span>
                        <input className={inputClass} value={form.realName} onChange={(e) => setField('realName', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">연락처</span>
                        <input className={inputClass} value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="010-0000-0000" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">이메일</span>
                        <input className={inputClass} value={form.email} onChange={(e) => setField('email', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">계약일</span>
                        <input type="date" className={inputClass} value={form.contractStart} onChange={(e) => setField('contractStart', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">종료일</span>
                        <input type="date" className={inputClass} value={form.contractEnd} onChange={(e) => setField('contractEnd', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">정산주기</span>
                        <select className={selectClass} value={form.settlementCycle} onChange={(e) => setField('settlementCycle', e.target.value)}>
                            {CYCLES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">세무 유형</span>
                        <select className={selectClass} value={form.taxType || 'withholding'} onChange={(e) => setField('taxType', e.target.value)}>
                            {TAX_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">상태</span>
                        <select className={selectClass} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                            <option value="active">진행중</option>
                            <option value="ended">종료</option>
                        </select>
                    </label>
                </div>
                <label className="block">
                    <span className="text-xs font-bold text-gray-500">메모</span>
                    <input className={inputClass} value={form.memo} onChange={(e) => setField('memo', e.target.value)} />
                </label>
            </section>

            {/* 민감정보 */}
            <section className="space-y-3 rounded-xl bg-gray-50 p-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-500">민감정보</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-400 ring-1 ring-gray-200">
                        artistPrivate 에 따로 저장
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">생년월일</span>
                        <input type="date" className={inputClass} value={priv.birth} onChange={(e) => setPrivField('birth', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">주소</span>
                        <input className={inputClass} value={priv.address} onChange={(e) => setPrivField('address', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">은행</span>
                        <input className={inputClass} value={priv.bank} onChange={(e) => setPrivField('bank', e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">예금주</span>
                        <input className={inputClass} value={priv.accountHolder} onChange={(e) => setPrivField('accountHolder', e.target.value)} />
                    </label>
                    {form.taxType === 'invoice' && (
                        <label className="block md:col-span-2">
                            <span className="text-xs font-bold text-gray-500">사업자등록번호</span>
                            <input className={inputClass} value={priv.bizNo || ''} onChange={(e) => setPrivField('bizNo', e.target.value)} placeholder="000-00-00000" />
                        </label>
                    )}
                    <label className="block md:col-span-2">
                        <span className="text-xs font-bold text-gray-500">계좌번호</span>
                        <div className="flex gap-2">
                            {accountVisible ? (
                                <input className={inputClass} value={priv.accountNumber} onChange={(e) => setPrivField('accountNumber', e.target.value)} placeholder="숫자만 또는 하이픈 포함" />
                            ) : (
                                <div className={inputClass + ' font-bold text-gray-700 select-none'}>{maskAccount(priv.accountNumber)}</div>
                            )}
                            {hasAccount && (
                                <button type="button" onClick={() => setShowAccount(!showAccount)}
                                    className={`${pill} shrink-0 bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>
                                    {showAccount ? '가리기' : '보기'}
                                </button>
                            )}
                        </div>
                    </label>
                </div>
            </section>

            {/* 정산비율 */}
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400">정산비율 (회사 : 아티스트)</span>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 rounded" checked={!!form.ratioUniform} onChange={(e) => toggleUniform(e.target.checked)} />
                        <span className="text-xs font-bold text-gray-600">모든 수익항목에 같은 비율 적용</span>
                    </label>
                </div>

                {form.ratioUniform ? (
                    <div className="flex items-end gap-2 rounded-xl bg-emerald-50/60 p-4 flex-wrap">
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">회사 %</span>
                            <input type="number" min="0" max="100" className={inputClass + ' w-28'} value={form.uniformRatio.company} onChange={(e) => setUniform('company', e.target.value)} />
                        </label>
                        <span className="pb-3 font-bold text-gray-400">:</span>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">아티스트 %</span>
                            <input type="number" min="0" max="100" className={inputClass + ' w-28'} value={form.uniformRatio.artist} onChange={(e) => setUniform('artist', e.target.value)} />
                        </label>
                        <span className={`pb-3 text-sm font-bold ${uniSum === 100 ? 'text-gray-400' : 'text-red-500'}`}>
                            합 {uniSum === null ? '-' : uniSum + '%'}
                        </span>
                    </div>
                ) : incomeCats.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-sm text-gray-400">
                        수익 항목이 없습니다. 위 '항목 관리'에서 수익 항목을 먼저 추가하세요.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {incomeCats.map((c) => {
                            const p = form.ratios[c.id];
                            const s = sumOf(p);
                            return (
                                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 flex-wrap">
                                    <span className="w-32 shrink-0 text-sm font-bold text-gray-700 truncate">{c.name}</span>
                                    <input type="number" min="0" max="100" className={inputClass + ' w-24'} placeholder="회사"
                                        value={p && p.company !== undefined ? p.company : ''} onChange={(e) => setRatio(c.id, 'company', e.target.value)} />
                                    <span className="font-bold text-gray-400">:</span>
                                    <input type="number" min="0" max="100" className={inputClass + ' w-24'} placeholder="아티스트"
                                        value={p && p.artist !== undefined ? p.artist : ''} onChange={(e) => setRatio(c.id, 'artist', e.target.value)} />
                                    <span className={`text-sm font-bold ${s === 100 ? 'text-gray-400' : 'text-red-500'}`}>
                                        합 {s === null ? '-' : s + '%'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {formError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{formError}</div>
            )}

            {/* 버튼 */}
            <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                    {onEnd && form.status === 'active' && (
                        <button type="button" onClick={onEnd} className={`${pill} bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50`}>
                            종료 처리
                        </button>
                    )}
                    {onDelete && (
                        <button type="button" onClick={onDelete} className={`${pill} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}>
                            삭제
                        </button>
                    )}
                    <button type="button" onClick={onClose} className={`${pill} bg-gray-100 text-gray-600 hover:bg-gray-200`}>
                        닫기
                    </button>
                </div>
                <button type="button" disabled={saving} onClick={onSave}
                    className={`w-full rounded-xl py-3 font-bold text-white transition ${saving ? 'bg-gray-300' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md'}`}>
                    {saving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    );
}

// ──[ 공통 수익/지출 항목 관리 ]──
// 추가·수정(항목명·구분·정렬순서)·숨김. 삭제는 두지 않았다 — 이미 쓴 항목을 지우면
// 아티스트 비율에 남은 항목 ID 가 고아가 되므로 '숨김'이 안전하다.
function CategoryManager({ user, categories, setCategories, onClose }) {
    const [name, setName] = useState('');
    const [kind, setKind] = useState('income');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [draft, setDraft] = useState({});

    const list = useMemo(() => [...categories].sort(byOrder), [categories]);

    const add = async () => {
        const n = name.trim();
        if (!n) { setErr('항목명을 입력해 주세요.'); return; }
        setBusy(true); setErr('');
        try {
            const maxOrder = categories.reduce((m, c) => Math.max(m, Number(c.order || 0)), 0);
            const data = { uid: user.uid, name: n, kind, order: maxOrder + 1, hidden: false, createdAt: new Date() };
            const ref = await addDoc(collection(db, 'mgmtCategories'), data);
            setCategories((prev) => [...prev, { id: ref.id, ...data }]);
            setName('');
        } catch (e) {
            setErr('추가 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const valueOf = (c, key) => {
        const d = draft[c.id];
        if (d && d[key] !== undefined) return d[key];
        return key === 'order' ? Number(c.order || 0) : c[key];
    };
    const setDraftField = (id, key, v) =>
        setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: v } }));

    const saveRow = async (c) => {
        const next = {
            name: String(valueOf(c, 'name') || '').trim(),
            kind: valueOf(c, 'kind'),
            order: Number(valueOf(c, 'order')) || 0,
        };
        if (!next.name) { setErr('항목명은 비울 수 없습니다.'); return; }
        setBusy(true); setErr('');
        try {
            await updateDoc(doc(db, 'mgmtCategories', c.id), next);
            setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...next } : x)));
            setDraft((prev) => ({ ...prev, [c.id]: undefined }));
        } catch (e) {
            setErr('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const toggleHidden = async (c) => {
        setBusy(true); setErr('');
        try {
            const hidden = !c.hidden;
            await updateDoc(doc(db, 'mgmtCategories', c.id), { hidden });
            setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, hidden } : x)));
        } catch (e) {
            setErr('변경 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    return (
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">수익 · 지출 항목</h3>
                <button onClick={onClose} className="text-xs font-bold text-gray-400 hover:text-gray-600">닫기</button>
            </div>

            <div className="flex gap-2 flex-wrap">
                <select className={selectClass + ' w-28'} value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="income">수익</option>
                    <option value="expense">지출</option>
                </select>
                <input className={inputClass + ' flex-1 min-w-[160px]'} placeholder="새 항목명 (예: 음원수익)" value={name} onChange={(e) => setName(e.target.value)} />
                <button disabled={busy} onClick={add} className={`${pill} bg-gray-800 text-white hover:bg-gray-700 shrink-0`}>추가</button>
            </div>

            {err && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{err}</div>}

            {list.length === 0 ? (
                <div className="text-sm text-gray-400">항목이 없습니다. 위에서 추가하세요.</div>
            ) : (
                <div className="space-y-2">
                    {list.map((c) => (
                        <div key={c.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 flex-wrap ${c.hidden ? 'bg-gray-100 opacity-60' : 'bg-gray-50'}`}>
                            <select className={selectClass + ' w-24'} value={valueOf(c, 'kind')} onChange={(e) => setDraftField(c.id, 'kind', e.target.value)}>
                                <option value="income">수익</option>
                                <option value="expense">지출</option>
                            </select>
                            <input className={inputClass + ' flex-1 min-w-[140px]'} value={valueOf(c, 'name') || ''} onChange={(e) => setDraftField(c.id, 'name', e.target.value)} />
                            <label className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-gray-400">순서</span>
                                <input type="number" className={inputClass + ' w-20'} value={valueOf(c, 'order')} onChange={(e) => setDraftField(c.id, 'order', e.target.value)} />
                            </label>
                            {c.hidden && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">숨김</span>}
                            <button disabled={busy} onClick={() => saveRow(c)} className={`${pill} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>저장</button>
                            <button disabled={busy} onClick={() => toggleHidden(c)} className={`${pill} bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50`}>
                                {c.hidden ? '보이기' : '숨기기'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <p className="text-xs text-gray-400">
                아티스트 비율은 항목 ID 로 저장되므로, 쓰던 항목은 지우지 말고 '숨기기'를 쓰세요.
            </p>
        </div>
    );
}
