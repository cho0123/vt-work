// 매니지먼트 탭 — 아티스트 등록·관리, 공통 수익/지출 항목, 아티스트별 정산비율.
//
// 화면은 보티즈 탭과 같은 좌우 구조다.
//   왼쪽  등록 버튼 · 항목 관리 · 구분/상태 필터 · 이름 검색 · 아티스트 목록
//   오른쪽 고른 아티스트의 상세(정보 · 정산비율 · 장부 · 정산)
// 휴대폰 폭에서는 위아래로 쌓이고, 상세 위의 '목록으로' 버튼으로 목록에 돌아간다.
//
// 쓰는 컬렉션 — 전부 새로 만든 것이라 기존 데이터와 겹치지 않는다.
//   artists/{id}        일반정보 + 정산비율 + 구분(category)·지급처(payee)·소속사명
//   artistPrivate/{id}  민감정보(생년월일·주소·계좌·사업자번호 + 소속사 계좌).
//                       문서 ID 는 artists 와 같다.
//   mgmtCategories/{id} 공통 수익·지출 항목
//
// 구분(소속/콜라보)과 지급처(본인/소속사) 규칙은 src/domain/artistProfile.js 한 곳에 있다.
// 옛 문서에는 두 필드가 없다 — 없으면 소속·본인으로 보고, 데이터는 고치지 않는다.
//
// 보티즈-정산 탭의 하위 탭으로 들어간다 — 바깥 여백과 스크롤은 부모(VotizTab)가 맡는다.
//
// 읽기 한도(하루 5만)를 아끼려고:
//   - 목록·항목은 탭을 열 때 한 번만 읽고, 저장 뒤에는 메모리 상태만 갱신한다.
//   - artistPrivate 는 상세를 열 때 그 아티스트 1건만 읽는다(목록에는 안 쓴다).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, addDoc, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { ArtistWorkspace } from './ArtistWorkspace.jsx';
import { TAX_TYPES, TAX_TYPE_LABEL, taxTypeOf } from '../domain/artistPayout.js';
import {
    ARTIST_CATEGORIES, CATEGORY_LABEL, PAYEES,
    categoryOf, payeeOf, effectiveTaxType,
} from '../domain/artistProfile.js';
import {
    MGMT_SETTINGS_COLLECTION, VOTIZ_MAP_DOC, votizMapKey, normalizeVotizMap,
    topLevelCats, childrenOf, hasChildren, isCategoryInUse, catFullPath,
} from '../domain/mgmtCategories.js';

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
    category: 'member',       // 없으면 소속으로 본다(옛 문서는 고치지 않는다)
    payee: 'self',            // 없으면 본인으로 본다
    agencyName: '', agencyMemo: '',
    taxType: 'withholding',   // 없으면 원천징수로 본다
    ratioUniform: true,
    uniformRatio: { company: 50, artist: 50 },
    ratios: {},
};
const EMPTY_PRIVATE = {
    birth: '', address: '', bank: '', accountNumber: '', accountHolder: '', bizNo: '',
    agencyBizNo: '', agencyBank: '', agencyAccount: '', agencyHolder: '',
};

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
export function ManagementTab({ user, projects, allTransactions, onArtistsChange, votizCategories, votizSubCats }) {
    const [artists, setArtists] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');

    const [statusFilter, setStatusFilter] = useState('active');   // 처음 열면 진행중만 본다
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [keyword, setKeyword] = useState('');
    const [openId, setOpenId] = useState(null);   // 상세가 열린 아티스트 id
    const [isNew, setIsNew] = useState(false);    // 신규 등록 폼이 열렸는지
    const [form, setForm] = useState(EMPTY_ARTIST);
    const [priv, setPriv] = useState(EMPTY_PRIVATE);
    const [showAccount, setShowAccount] = useState(false);
    const [showAgencyAccount, setShowAgencyAccount] = useState(false);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [showCats, setShowCats] = useState(false);
    // 보티즈 분류 → 매니지먼트 항목 연결표. mgmtSettings/votiz_category_map 문서 1건.
    const [votizMap, setVotizMap] = useState({});
    // 아티스트 정보(입력 폼)는 기본으로 접는다. 접어도 값은 form/priv 에 그대로 있다.
    const [infoOpen, setInfoOpen] = useState(false);

    // 휴대폰 폭에서 목록·상세가 위아래로 쌓일 때 서로 오가기 위한 기준점.
    const listRef = useRef(null);
    const detailRef = useRef(null);
    const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 1024;
    const scrollTo = (ref) => {
        if (!isNarrow() || !ref.current) return;
        // 렌더가 끝난 뒤에 옮긴다.
        setTimeout(() => {
            if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    };

    // 탭을 열 때 한 번만 읽는다.
    useEffect(() => {
        if (!user) return;
        let alive = true;
        const load = async () => {
            try {
                const [aSnap, cSnap, mSnap] = await Promise.all([
                    getDocs(query(collection(db, 'artists'), where('uid', '==', user.uid))),
                    getDocs(query(collection(db, 'mgmtCategories'), where('uid', '==', user.uid))),
                    getDoc(doc(db, MGMT_SETTINGS_COLLECTION, VOTIZ_MAP_DOC)),   // 연결표 1건
                ]);
                if (!alive) return;
                setArtists(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setCategories(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setVotizMap(mSnap.exists() ? ((mSnap.data() || {}).map || {}) : {});
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

    // 목록이 바뀌면 보티즈 탭의 곡 연결 드롭다운도 같은 목록을 쓰게 올려 보낸다.
    // (같은 데이터라 다시 읽지 않는다.)
    useEffect(() => {
        if (!loaded || !onArtistsChange) return;
        onArtistsChange(artists);
    }, [artists, loaded, onArtistsChange]);

    // 정산비율은 **최상위 수익 항목** 에만 둔다. 세부항목은 부모 비율을 따른다.
    const incomeCats = useMemo(() => topLevelCats(categories, 'income'), [categories]);

    // 연결표는 지워진 항목·세부항목을 걸러 쓴다(계산에 바로 넘기는 값).
    const cleanVotizMap = useMemo(() => normalizeVotizMap(votizMap, categories), [votizMap, categories]);

    // 검색어까지만 걸러둔 목록. 탭 건수는 여기서 나머지 한 조건만 더 걸어 센다
    // (구분 탭 = 지금 상태 필터 기준 / 상태 탭 = 지금 구분 필터 기준).
    const searched = useMemo(() => {
        const k = keyword.trim().toLowerCase();
        if (!k) return artists;
        return artists.filter((a) =>
            (a.stageName || '').toLowerCase().includes(k)
            || (a.realName || '').toLowerCase().includes(k)
            || (a.agencyName || '').toLowerCase().includes(k));
    }, [artists, keyword]);

    const matchStatus = (a, f) => f === 'all' || (a.status || 'active') === f;
    const matchCategory = (a, f) => f === 'all' || categoryOf(a) === f;

    const categoryCounts = useMemo(() => {
        const c = { all: 0, member: 0, collab: 0 };
        searched.filter((a) => matchStatus(a, statusFilter)).forEach((a) => {
            c.all += 1;
            c[categoryOf(a)] += 1;
        });
        return c;
    }, [searched, statusFilter]);

    const statusCounts = useMemo(() => {
        const c = { all: 0, active: 0, ended: 0 };
        searched.filter((a) => matchCategory(a, categoryFilter)).forEach((a) => {
            c.all += 1;
            c[(a.status || 'active') === 'active' ? 'active' : 'ended'] += 1;
        });
        return c;
    }, [searched, categoryFilter]);

    const visibleArtists = useMemo(() => {
        const list = searched
            .filter((a) => matchStatus(a, statusFilter))
            .filter((a) => matchCategory(a, categoryFilter));
        return list.sort((a, b) => {
            const sa = (a.status || 'active') === 'active' ? 0 : 1;
            const sb = (b.status || 'active') === 'active' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.stageName || '').localeCompare(b.stageName || '');
        });
    }, [searched, statusFilter, categoryFilter]);

    // 아티스트별 연결된 곡 이름 — 보티즈 탭이 이미 받아둔 projects 를 그대로 쓴다(추가 조회 0회).
    const songsByArtist = useMemo(() => {
        const map = {};
        (projects || []).forEach((p) => {
            (Array.isArray(p.artists) ? p.artists : []).forEach((link) => {
                if (!link || !link.artistId) return;
                (map[link.artistId] = map[link.artistId] || []).push(p.name || '(이름없음)');
            });
        });
        return map;
    }, [projects]);

    const openArtist = async (a) => {
        setInfoOpen(false);   // 다른 아티스트를 고르면 다시 접힌 상태로 시작
        setIsNew(false);
        setOpenId(a.id);
        setFormError('');
        // 비어 있는 계좌칸은 바로 입력할 수 있게 열어 둔다. 값이 있으면 가린 채로 시작한다
        // (불러오기 전에는 비어 있으므로 일단 연다 — 불러온 뒤 아래에서 다시 정한다).
        setShowAccount(true);
        setShowAgencyAccount(true);
        setForm({
            ...EMPTY_ARTIST,
            ...a,
            category: categoryOf(a),
            payee: payeeOf(a),
            taxType: taxTypeOf(a),
            uniformRatio: { ...EMPTY_ARTIST.uniformRatio, ...(a.uniformRatio || {}) },
            ratios: { ...(a.ratios || {}) },
        });
        setPriv(EMPTY_PRIVATE);
        scrollTo(detailRef);
        try {
            const snap = await getDoc(doc(db, 'artistPrivate', a.id));
            const loaded = snap.exists() ? { ...EMPTY_PRIVATE, ...snap.data() } : EMPTY_PRIVATE;
            setPriv(loaded);
            setShowAccount(!(loaded.accountNumber || '').trim());
            setShowAgencyAccount(!(loaded.agencyAccount || '').trim());
        } catch (e) {
            setFormError('민감정보를 불러오지 못했습니다: ' + (e && e.message ? e.message : ''));
        }
    };

    const startNew = () => {
        setInfoOpen(true);    // 새로 만들 때는 처음부터 펼친다
        setIsNew(true);
        setOpenId(null);
        setForm(EMPTY_ARTIST);
        setPriv(EMPTY_PRIVATE);
        setShowAccount(true);        // 새로 넣는 계좌는 가릴 게 없다
        setShowAgencyAccount(true);
        setFormError('');
        scrollTo(detailRef);
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

    // 콜라보는 계약·정산비율 칸을 안 보여주므로 그 검사도 하지 않는다.
    // (값은 그대로 두고 숨기기만 하므로, 저장해도 기존 값은 지워지지 않는다.)
    const validate = () => {
        if (!(form.stageName || '').trim()) return '활동명을 입력해 주세요.';
        if (form.category === 'collab') return '';
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
                category: form.category === 'collab' ? 'collab' : 'member',
                payee: form.payee === 'agency' ? 'agency' : 'self',
                agencyName: (form.agencyName || '').trim(),
                agencyMemo: (form.agencyMemo || '').trim(),
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
                agencyBizNo: (priv.agencyBizNo || '').trim(),
                agencyBank: (priv.agencyBank || '').trim(),
                agencyAccount: (priv.agencyAccount || '').trim(),
                agencyHolder: (priv.agencyHolder || '').trim(),
                updatedAt: new Date(),
            };

            if (isNew) {
                const ref = await addDoc(collection(db, 'artists'), { ...base, createdAt: new Date() });
                await setDoc(doc(db, 'artistPrivate', ref.id), privData);
                setArtists((prev) => [...prev, { id: ref.id, ...base }]);
                setIsNew(false);
                setOpenId(ref.id);
                setShowAccount(!privData.accountNumber);
                setShowAgencyAccount(!privData.agencyAccount);
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

    const current = openId ? artists.find((a) => a.id === openId) : null;
    const backToList = () => scrollTo(listRef);

    const artistForm = (
        <ArtistForm
            isNew={isNew} form={form} priv={priv} setField={setField} setPrivField={setPrivField}
            showAccount={showAccount} setShowAccount={setShowAccount}
            showAgencyAccount={showAgencyAccount} setShowAgencyAccount={setShowAgencyAccount}
            incomeCats={incomeCats} setUniform={setUniform} setRatio={setRatio} toggleUniform={toggleUniform}
            formError={formError} saving={saving} onSave={handleSave} onClose={closeForm}
            onEnd={!isNew && current ? () => handleEnd(current) : null}
            onDelete={!isNew && current ? () => handleDelete(current) : null}
            onBackToList={backToList}
            infoOpen={infoOpen} setInfoOpen={setInfoOpen}
        />
    );

    return (
        <div className="w-full space-y-5">
            {showCats && (
                <CategoryManager
                    user={user} categories={categories} setCategories={setCategories}
                    artists={artists} votizCategories={votizCategories} votizSubCats={votizSubCats}
                    votizMap={votizMap} setVotizMap={setVotizMap}
                    onClose={() => setShowCats(false)}
                />
            )}

            {loadError && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-bold text-red-700">
                    불러오기 실패: {loadError}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_1.7fr] gap-6 items-start">
                {/* 왼쪽: 등록 · 필터 · 목록 */}
                <div className="space-y-3" ref={listRef}>
                    <div className="flex gap-2">
                        <button onClick={startNew} className={`${pill} flex-1 bg-emerald-600 text-white hover:bg-emerald-700`}>
                            + 아티스트 등록
                        </button>
                        <button onClick={() => setShowCats((v) => !v)} className={`${pill} shrink-0 bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>
                            항목 관리
                        </button>
                    </div>

                    <div className="space-y-2">
                        <Toggle
                            value={categoryFilter} onChange={setCategoryFilter}
                            options={[
                                { key: 'all', label: '전체', count: categoryCounts.all },
                                { key: 'member', label: '소속', count: categoryCounts.member },
                                { key: 'collab', label: '콜라보', count: categoryCounts.collab },
                            ]}
                        />
                        <Toggle
                            value={statusFilter} onChange={setStatusFilter}
                            options={[
                                { key: 'all', label: '전체', count: statusCounts.all },
                                { key: 'active', label: '진행중', count: statusCounts.active },
                                { key: 'ended', label: '종료', count: statusCounts.ended },
                            ]}
                        />
                        <input className={inputClass + ' bg-white'} placeholder="이름 검색 (활동명 · 본명 · 소속사)"
                            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-gray-500 text-sm ml-1">🎤 아티스트 ({visibleArtists.length})</h3>
                        {!loaded && <div className="text-sm text-gray-400 px-1">불러오는 중...</div>}
                        {loaded && visibleArtists.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-medium text-gray-400">
                                {artists.length === 0 ? "등록된 아티스트가 없습니다. '+ 아티스트 등록'으로 추가하세요." : '조건에 맞는 아티스트가 없습니다.'}
                            </div>
                        )}
                        {visibleArtists.map((a) => (
                            <ArtistCard key={a.id} artist={a} songs={songsByArtist[a.id]}
                                active={openId === a.id && !isNew} onClick={() => openArtist(a)} />
                        ))}
                    </div>
                </div>

                {/* 오른쪽: 상세 */}
                <div ref={detailRef}>
                    {isNew ? artistForm : current ? (
                        <div className="space-y-3">
                            {artistForm}
                            <ArtistWorkspace
                                user={user} artist={current} categories={categories}
                                projects={projects} allTransactions={allTransactions}
                                priv={priv} votizMap={cleanVotizMap} votizCategories={votizCategories}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center min-h-[320px] rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-400">
                            아티스트를 선택하세요
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// 공통 pill 토글(필터).
function Toggle({ value, onChange, options }) {
    return (
        <div className="flex gap-1 bg-gray-200/70 p-1 rounded-2xl">
            {options.map(({ key, label, count }) => (
                <button key={key} onClick={() => onChange(key)}
                    className={`flex-1 px-3 py-1.5 rounded-xl text-sm font-bold transition ${value === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {label}
                    {count !== undefined && (
                        <span className={`ml-1 text-xs font-bold ${value === key ? 'text-gray-400' : 'text-gray-400'}`}>{count}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

// ──[ 목록 카드 ]──
// 소속은 계약기간·만료 배지를, 콜라보는 소속사명을 보여준다(계약 만료 개념이 없다).
function ArtistCard({ artist, songs, active, onClick }) {
    const a = artist;
    const alive = (a.status || 'active') === 'active';
    const collab = categoryOf(a) === 'collab';
    const left = daysUntil(a.contractEnd);
    // 연결된 보티즈 곡 — 첫 곡 + 외 n곡. 없으면 아무것도 안 쓴다.
    const songText = songs && songs.length
        ? songs.length === 1 ? songs[0] : songs[0] + ' 외 ' + (songs.length - 1) + '곡'
        : '';
    return (
        <div onClick={onClick}
            className={`cursor-pointer rounded-xl border p-3 transition ${active ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-200' : 'border-gray-100 bg-white hover:border-emerald-300 hover:shadow-sm'}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                    {/* 상태는 점으로 — 진행중 초록, 종료 회색 */}
                    <span className={`shrink-0 self-center w-1.5 h-1.5 rounded-full ${alive ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={alive ? '진행중' : '종료'} />
                    <span className={`font-bold truncate ${active ? 'text-emerald-800' : 'text-gray-800'}`}>{a.stageName || '(활동명 없음)'}</span>
                    {/* 구분은 작은 회색 글씨 */}
                    <span className="shrink-0 text-[11px] text-gray-400">{CATEGORY_LABEL[categoryOf(a)]}</span>
                    {songText && (
                        <span className="truncate text-[11px] text-gray-400" title={(songs || []).join(', ')}>· {songText}</span>
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    {/* 계약 만료는 소속만 */}
                    {!collab && alive && left !== null && left < 0 && (
                        <span className="text-[11px] font-bold text-red-500">만료 {0 - left}일 지남</span>
                    )}
                    {!collab && alive && left !== null && left >= 0 && left <= 30 && (
                        <span className="text-[11px] font-bold text-amber-600">만료 D-{left}</span>
                    )}
                    {collab
                        ? (a.agencyName ? <span className="text-xs font-medium text-gray-500 truncate">🏢 {a.agencyName}</span> : null)
                        : <span className="text-xs font-medium text-gray-400">{a.contractStart || '?'} ~ {a.contractEnd || '?'}</span>}
                </div>
            </div>
        </div>
    );
}

// ──[ 아티스트 상세/등록 폼 ]──
function ArtistForm({ isNew, form, priv, setField, setPrivField, showAccount, setShowAccount,
    showAgencyAccount, setShowAgencyAccount,
    incomeCats, setUniform, setRatio, toggleUniform, formError, saving, onSave, onClose, onEnd, onDelete, onBackToList,
    infoOpen, setInfoOpen }) {

    const collab = form.category === 'collab';
    const agency = form.payee === 'agency';
    // 소속사가 받으면 세금계산서로 고정한다. 저장된 taxType 값 자체는 덮지 않는다.
    const taxType = effectiveTaxType(form);
    // 열림/가림은 불러올 때 한 번 정한다 — 입력 중에 가려지면 글자를 못 친다.
    const hasAccount = (priv.accountNumber || '').length > 0;
    const accountVisible = showAccount;
    const hasAgencyAccount = (priv.agencyAccount || '').length > 0;
    const agencyAccountVisible = showAgencyAccount;
    const uniSum = sumOf(form.uniformRatio);

    return (
        <div className="rounded-2xl border-2 border-emerald-100 bg-white p-5 shadow-sm space-y-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800">{isNew ? '아티스트 등록' : '아티스트 정보'}</h3>
                <div className="flex items-center gap-2">
                    {!isNew && (
                        <button type="button" onClick={() => setInfoOpen(!infoOpen)}
                            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition">
                            {infoOpen ? '정보 접기' : '정보 펼치기'}
                        </button>
                    )}
                    <button type="button" onClick={onBackToList} className="lg:hidden text-xs font-bold text-gray-500 hover:text-gray-800">
                        ↑ 목록으로
                    </button>
                </div>
            </div>

            {/* 접었을 때 한 줄 요약 */}
            {!infoOpen && (
                <div className="flex items-center gap-2 flex-wrap rounded-xl bg-gray-50 px-3 py-2 text-xs">
                    <span className="font-bold text-gray-800">{form.stageName || '(활동명 없음)'}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 font-bold text-gray-500 ring-1 ring-gray-200">
                        {collab ? '콜라보' : '소속'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${form.status === 'ended' ? 'bg-gray-100 text-gray-500 ring-gray-200' : 'bg-green-50 text-green-700 ring-green-200'}`}>
                        {form.status === 'ended' ? '종료' : '진행중'}
                    </span>
                    <span className="text-gray-500">
                        지급처 {agency ? (form.agencyName || '소속사') : '본인'}
                    </span>
                    {!collab && (
                        <span className="text-gray-400">
                            {(form.contractStart || '?') + ' ~ ' + (form.contractEnd || '?')}
                        </span>
                    )}
                </div>
            )}

            {infoOpen && (<>
            {/* 구분 · 지급처 */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl bg-emerald-50/50 p-4">
                <label className="block">
                    <span className="text-xs font-bold text-gray-500">구분</span>
                    <select className={selectClass} value={form.category} onChange={(e) => setField('category', e.target.value)}>
                        {ARTIST_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs font-bold text-gray-500">지급처</span>
                    <select className={selectClass} value={form.payee} onChange={(e) => setField('payee', e.target.value)}>
                        {PAYEES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                </label>
                <p className="md:col-span-2 text-[11px] font-medium text-gray-500">
                    {collab
                        ? '콜라보는 계약·정산비율을 쓰지 않습니다. 곡 단위 조건은 보티즈 탭의 곡 상세에서 정합니다.'
                        : '소속은 계약기간과 정산비율로 정기 정산합니다.'}
                </p>
            </section>

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
                    {!collab && (
                        <>
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
                        </>
                    )}
                    <label className="block">
                        <span className="text-xs font-bold text-gray-500">세무 유형</span>
                        {agency ? (
                            <div className={inputClass + ' font-bold text-gray-700 select-none'}>
                                {TAX_TYPE_LABEL.invoice} <span className="text-[10px] font-bold text-gray-400">· 지급처가 소속사라 고정</span>
                            </div>
                        ) : (
                            <select className={selectClass} value={form.taxType || 'withholding'} onChange={(e) => setField('taxType', e.target.value)}>
                                {TAX_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                        )}
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

            {/* 소속사 정보 — 콜라보이거나 지급처가 소속사일 때만 */}
            {(collab || agency) && (
                <section className="space-y-3 rounded-xl bg-violet-50/60 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-500">소속사 정보</span>
                        {agency && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">
                                세금계산서 발행처
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">소속사명</span>
                            <input className={inputClass} value={form.agencyName || ''} onChange={(e) => setField('agencyName', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">사업자등록번호</span>
                            <input className={inputClass} value={priv.agencyBizNo || ''} onChange={(e) => setPrivField('agencyBizNo', e.target.value)} placeholder="000-00-00000" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">은행</span>
                            <input className={inputClass} value={priv.agencyBank || ''} onChange={(e) => setPrivField('agencyBank', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">예금주</span>
                            <input className={inputClass} value={priv.agencyHolder || ''} onChange={(e) => setPrivField('agencyHolder', e.target.value)} />
                        </label>
                        <label className="block md:col-span-2">
                            <span className="text-xs font-bold text-gray-500">소속사 계좌</span>
                            <div className="flex gap-2">
                                {agencyAccountVisible ? (
                                    <input className={inputClass} value={priv.agencyAccount || ''} onChange={(e) => setPrivField('agencyAccount', e.target.value)} placeholder="숫자만 또는 하이픈 포함" />
                                ) : (
                                    <div className={inputClass + ' font-bold text-gray-700 select-none'}>{maskAccount(priv.agencyAccount)}</div>
                                )}
                                {hasAgencyAccount && (
                                    <button type="button" onClick={() => setShowAgencyAccount(!showAgencyAccount)}
                                        className={`${pill} shrink-0 bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>
                                        {showAgencyAccount ? '가리기' : '보기'}
                                    </button>
                                )}
                            </div>
                        </label>
                        <label className="block md:col-span-2">
                            <span className="text-xs font-bold text-gray-500">소속사 메모</span>
                            <input className={inputClass} value={form.agencyMemo || ''} onChange={(e) => setField('agencyMemo', e.target.value)} />
                        </label>
                    </div>
                    {agency && (
                        <p className="text-[11px] font-bold text-violet-700">
                            정산금은 소속사 계좌로 지급하고, 세금계산서는 소속사
                            {form.agencyName ? ' ' + form.agencyName : ''}
                            {priv.agencyBizNo ? ' (' + priv.agencyBizNo + ')' : ''} 에서 받습니다.
                        </p>
                    )}
                </section>
            )}

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
                    {taxType === 'invoice' && !agency && (
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
            </>)}

            {/* 정산비율 — 소속만 */}
            {!collab && (
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
                            수익 항목이 없습니다. 왼쪽 '항목 관리'에서 수익 항목을 먼저 추가하세요.
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
            )}

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
//
// 화면: 왼쪽 '수입' · 오른쪽 '지출'. 각 쪽은 [항목 열] → [세부항목 열] 로 펼친다.
//   · 위에 현재 위치 표시 (수입 > 음원수익)
//   · 각 열 맨 아래에 한 줄 입력 + 추가
//   · 한 줄 = 이름(칸에서 빠져나올 때 자동 저장) · ▲▼ 순서 · 숨기기
//   · 숨긴 항목은 '숨긴 항목 보기' 를 켜야 보인다
// 휴대폰 폭에서는 수입·지출이 위아래로 쌓이고, 항목을 누르면 세부항목 열로 넘어간다('← 항목').
//
// 삭제는 '아무 데서도 안 쓰는' 항목만 할 수 있다. 쓰고 있으면 숨기기만 한다 —
// 비율·장부가 항목 ID 로 저장돼 있어서 지우면 고아가 된다.
function CategoryManager({ user, categories, setCategories, artists, votizCategories, votizSubCats, votizMap, setVotizMap, onClose }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [showHidden, setShowHidden] = useState(false);
    // 수입·지출 영역 접기. 기본은 둘 다 펼침.
    const [open, setOpen] = useState({ income: true, expense: true });
    // 쪽(수입/지출)마다 단계별로 고른 항목(1=항목, 2=세부)과, 휴대폰 폭에서 보고 있는 열 번호.
    const [picked, setPicked] = useState({ income: [null, null], expense: [null, null] });
    const [mobileCol, setMobileCol] = useState({ income: 0, expense: 0 });
    // 이름 입력 중인 값. 칸에서 빠져나올 때 저장한다.
    const [names, setNames] = useState({});
    const [adding, setAdding] = useState({});   // 열마다 새 이름 입력칸

    // level 0 = 항목 열에서 고름 → 세부 열이 열린다. level 1 = 세부 열에서 고름 → 세부2 열.
    const pickCat = (kind, level, id) => {
        setPicked((p) => {
            const cur = p[kind].slice();
            if (cur[level] === id) { cur[level] = null; }      // 다시 누르면 접는다
            else cur[level] = id;
            for (let i = level + 1; i < cur.length; i++) cur[i] = null;   // 아래 단계는 초기화
            return { ...p, [kind]: cur };
        });
        setMobileCol((m) => ({ ...m, [kind]: level + 1 }));
    };

    const addCat = async (kind, parentId, colKey) => {
        const n = String(adding[colKey] || '').trim();
        if (!n) { setErr('이름을 입력해 주세요.'); return; }
        setBusy(true); setErr('');
        try {
            const siblings = parentId ? childrenOf(categories, parentId, true) : topLevelCats(categories, kind, true);
            const maxOrder = siblings.reduce((m, c) => Math.max(m, Number(c.order || 0)), 0);
            const data = {
                uid: user.uid, name: n, kind, order: maxOrder + 1, hidden: false,
                parentId: parentId || null, createdAt: new Date(),
            };
            const ref = await addDoc(collection(db, 'mgmtCategories'), data);
            setCategories((prev) => [...prev, { id: ref.id, ...data }]);
            setAdding((prev) => ({ ...prev, [colKey]: '' }));
        } catch (e) {
            setErr('추가 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    // 이름은 칸에서 빠져나올 때만 저장한다(줄마다 저장 버튼을 두지 않는다).
    // ⚠️ 입력칸의 **지금 값**을 받아서 저장한다. 예전엔 draft state 만 봤는데, 타이핑 직후
    //    바로 칸을 빠져나가면 state 갱신이 아직 안 닿아 draft 가 undefined 라 **조용히 안 저장**됐다
    //    (칸에는 고친 이름이 그대로 보여서 저장된 것처럼 보였다).
    const commitName = async (c, typed) => {
        const draft = typed !== undefined ? typed : names[c.id];
        if (draft === undefined) return;
        const next = String(draft).trim();
        setNames((prev) => { const o = { ...prev }; delete o[c.id]; return o; });
        if (!next || next === c.name) return;        // 비우면 원래 이름을 지킨다
        try {
            await updateDoc(doc(db, 'mgmtCategories', c.id), { name: next });
            setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: next } : x)));
        } catch (e) {
            setErr('이름 저장 실패: ' + (e && e.message ? e.message : ''));
        }
    };

    // 같은 열(형제)끼리만 순서를 바꾼다. 바뀐 줄만 쓴다.
    const move = async (c, siblings, dir) => {
        const idx = siblings.findIndex((x) => x.id === c.id);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= siblings.length) return;
        const next = siblings.slice();
        next.splice(to, 0, next.splice(idx, 1)[0]);
        const changed = next
            .map((x, i) => ({ x, order: i + 1 }))
            .filter(({ x, order }) => Number(x.order || 0) !== order);
        if (changed.length === 0) return;
        setBusy(true); setErr('');
        try {
            await Promise.all(changed.map(({ x, order }) => updateDoc(doc(db, 'mgmtCategories', x.id), { order })));
            setCategories((prev) => prev.map((x) => {
                const hit = changed.find((ch) => ch.x.id === x.id);
                return hit ? { ...x, order: hit.order } : x;
            }));
        } catch (e) {
            setErr('순서 변경 실패: ' + (e && e.message ? e.message : ''));
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

    // 쓰는 데가 하나라도 있으면 지우지 않는다. 장부는 '같음' 조건 1건만 찾아본다(색인 불필요).
    const removeCat = async (c) => {
        if (hasChildren(categories, c.id)) { setErr("세부항목이 있어 지울 수 없습니다. 세부항목부터 정리하거나 '숨기기'를 쓰세요."); return; }
        if (isCategoryInUse(c.id, { artists })) { setErr("아티스트 정산비율에 쓰고 있는 항목입니다. '숨기기'를 쓰세요."); return; }
        setBusy(true); setErr('');
        try {
            const [a, b] = await Promise.all([
                getDocs(query(collection(db, 'artistLedger'), where('categoryId', '==', c.id), limit(1))),
                getDocs(query(collection(db, 'artistLedger'), where('subCategoryId', '==', c.id), limit(1))),
            ]);
            if (!a.empty || !b.empty) { setErr("장부에 쓰고 있는 항목입니다. '숨기기'를 쓰세요."); return; }
            if (Object.values(votizMap || {}).includes(c.id)) { setErr("보티즈 분류 연결에 쓰고 있습니다. 연결을 먼저 푸세요."); return; }
            if (!window.confirm("'" + c.name + "' 을(를) 지웁니다. 되돌릴 수 없습니다.")) return;
            await deleteDoc(doc(db, 'mgmtCategories', c.id));
            setCategories((prev) => prev.filter((x) => x.id !== c.id));
            setPicked((p) => ({
                income: p.income.map((x) => (x === c.id ? null : x)),
                expense: p.expense.map((x) => (x === c.id ? null : x)),
            }));
        } catch (e) {
            setErr('삭제 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    // ── 한 줄 ──
    // ⚠️ 컴포넌트로 만들지 않고 '그리는 함수' 로 둔다. 안에 컴포넌트를 정의하면
    //    렌더마다 새 타입이 되어 이름을 한 글자 칠 때마다 입력칸 포커스가 날아간다.
    const renderRow = (c, siblings, active, onPick, showArrow) => {
        const idx = siblings.findIndex((x) => x.id === c.id);
        return (
            <div key={c.id} className={`flex items-center gap-1 flex-wrap rounded-xl px-2 py-1.5 ${c.hidden ? 'bg-gray-100 opacity-60' : active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <input
                    title={c.name || ''}
                    className="min-w-0 w-full sm:w-auto sm:flex-1 sm:basis-40 truncate rounded-lg bg-transparent px-2 py-1 text-sm font-bold text-gray-700 outline-none focus:bg-white focus:ring-1 focus:ring-gray-300"
                    value={names[c.id] !== undefined ? names[c.id] : (c.name || '')}
                    onChange={(e) => setNames((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    onBlur={(e) => commitName(c, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                />
                {c.hidden && <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">숨김</span>}
                <button type="button" disabled={busy || idx <= 0} onClick={() => move(c, siblings, -1)}
                    className="shrink-0 w-6 h-6 rounded-full text-xs text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-30" title="위로">▲</button>
                <button type="button" disabled={busy || idx < 0 || idx >= siblings.length - 1} onClick={() => move(c, siblings, 1)}
                    className="shrink-0 w-6 h-6 rounded-full text-xs text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-30" title="아래로">▼</button>
                <button type="button" disabled={busy} onClick={() => toggleHidden(c)}
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-gray-500 hover:bg-white">
                    {c.hidden ? '보이기' : '숨기기'}
                </button>
                <button type="button" disabled={busy} onClick={() => removeCat(c)}
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-gray-300 hover:bg-white hover:text-red-500" title="안 쓰는 항목만 지울 수 있습니다">삭제</button>
                {onPick && (
                    <button type="button" onClick={() => onPick(c.id)}
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${active ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50'}`}>
                        세부{showArrow ? ' ›' : ''}
                    </button>
                )}
            </div>
        );
    };

    // ── 한 열 ──
    const renderColumn = ({ title, rows, siblings, colKey, placeholder, onAdd, onPick, pickedId, showArrow }) => (
        <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-gray-400">{title}</div>
            {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">없음</div>
            ) : rows.map((c) => renderRow(c, siblings, pickedId === c.id, onPick, showArrow))}
            <div className="flex gap-1 pt-1">
                <input className={inputClass + ' flex-1 py-2 text-sm'} placeholder={placeholder}
                    value={adding[colKey] || ''}
                    onChange={(e) => setAdding((prev) => ({ ...prev, [colKey]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
                <button type="button" disabled={busy} onClick={onAdd}
                    className={`${pill} shrink-0 bg-gray-800 text-white hover:bg-gray-700 px-3 py-2 text-xs`}>추가</button>
            </div>
        </div>
    );

    // ── 한 쪽(수입/지출) ── 열 3개: 항목 → 세부 → 세부2
    const COL_TITLES = ['항목', '세부', '세부2'];
    const renderPane = (kind, title, tone) => {
        const tops = topLevelCats(categories, kind, showHidden);
        const lv1 = tops.find((c) => c.id === picked[kind][0]) || null;
        const subs = lv1 ? childrenOf(categories, lv1.id, showHidden) : [];
        const lv2 = subs.find((c) => c.id === picked[kind][1]) || null;
        const subs2 = lv2 ? childrenOf(categories, lv2.id, showHidden) : [];
        const col = mobileCol[kind];                       // 휴대폰 폭에서 보고 있는 열
        const only = (i) => (col === i ? '' : 'hidden md:block');
        const crumbs = [title, lv1 && lv1.name, lv2 && lv2.name].filter(Boolean).join(' > ');
        const isOpen = !!open[kind];
        return (
            <div key={kind} className={`rounded-2xl border p-4 space-y-3 ${tone}`}>
                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [kind]: !o[kind] }))}
                        className="flex items-center gap-1.5 font-bold text-gray-800 hover:text-gray-600">
                        <span className="text-xs text-gray-400">{isOpen ? '▾' : '▸'}</span>
                        {title}
                        {!isOpen && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200">
                                {tops.length}개
                            </span>
                        )}
                    </button>
                    {isOpen && (lv1 || lv2) && <span className="text-xs font-bold text-gray-400">{crumbs}</span>}
                    {isOpen && col > 0 && (
                        <button type="button" onClick={() => setMobileCol((m) => ({ ...m, [kind]: col - 1 }))}
                            className="md:hidden ml-auto text-xs font-bold text-gray-500 hover:text-gray-800">
                            ← {COL_TITLES[col - 1]}
                        </button>
                    )}
                </div>

                {/* 고른 단계까지만 열을 그린다 — 열이 적을수록 이름칸이 넓어져 안 잘린다. */}
                <div className={`grid grid-cols-1 gap-3 ${isOpen ? '' : 'hidden'} ${lv2 ? 'md:grid-cols-3' : lv1 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                    <div className={only(0)}>
                        {renderColumn({
                            title: COL_TITLES[0], rows: tops, siblings: tops, colKey: kind + '-l0',
                            placeholder: '새 항목',
                            onAdd: () => addCat(kind, null, kind + '-l0'),
                            onPick: (id) => pickCat(kind, 0, id), pickedId: picked[kind][0], showArrow: true,
                        })}
                    </div>
                    {lv1 && (
                        <div className={only(1)}>
                            {renderColumn({
                                title: COL_TITLES[1] + ' — ' + lv1.name, rows: subs, siblings: subs,
                                colKey: kind + '-l1-' + lv1.id,
                                placeholder: '새 세부항목',
                                onAdd: () => addCat(kind, lv1.id, kind + '-l1-' + lv1.id),
                                onPick: (id) => pickCat(kind, 1, id), pickedId: picked[kind][1], showArrow: true,
                            })}
                        </div>
                    )}
                    {lv2 && (
                        <div className={only(2)}>
                            {renderColumn({
                                title: COL_TITLES[2] + ' — ' + lv2.name, rows: subs2, siblings: subs2,
                                colKey: kind + '-l2-' + lv2.id,
                                placeholder: '새 세부2',
                                onAdd: () => addCat(kind, lv2.id, kind + '-l2-' + lv2.id),
                                onPick: null, pickedId: null, showArrow: false,
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800">수익 · 지출 항목</h3>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 rounded" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
                        <span className="text-xs font-bold text-gray-500">숨긴 항목 보기</span>
                    </label>
                    <button onClick={onClose} className="text-xs font-bold text-gray-400 hover:text-gray-600">닫기</button>
                </div>
            </div>

            {err && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{err}</div>}

            {/* 위 수익 / 아래 지출 — 전체 폭을 써서 이름이 잘리지 않게 한다. */}
            <div className="space-y-4">
                {renderPane('income', '수입', 'border-blue-100 bg-blue-50/30')}
                {renderPane('expense', '지출', 'border-red-100 bg-red-50/30')}
            </div>

            <p className="text-xs text-gray-400">
                이름은 칸에서 빠져나오면 자동 저장됩니다. 세부항목의 수입·지출 구분은 항목을 따라갑니다.
                정산비율은 항목(최상위)에만 있고 세부항목은 그 비율을 따릅니다. 쓰고 있는 항목은 '숨기기'만 됩니다.
            </p>

            <VotizCategoryMap
                user={user} categories={categories} votizCategories={votizCategories}
                votizSubCats={votizSubCats}
                votizMap={votizMap} setVotizMap={setVotizMap}
            />
        </div>
    );
}

// ──[ 보티즈 분류 연결표 ]──
// 보티즈 분류를 **트리**로 펼쳐(최상위 → 그룹 → 항목) 줄마다 매니지먼트 항목을 고른다.
// 매니지먼트 쪽은 항목·세부·세부2 **아무 단계나** 고를 수 있다(비율은 집계할 때 최상위 것을 쓴다).
//
// 보티즈 하위 구조: 지출 '제작비'(production) 만 `subDetail` 에 '그룹-항목' 으로 들어간다
// (예 '곡비-작사'). 수입과 마케팅비는 하위가 없다. — src/domain/mgmtCategories.js 주석 참고
//
// 저장 키: 'expense:production'(최상위, 예전 그대로) / '…|곡비'(그룹) / '…|곡비-작사'(가장 깊은 것).
// 집계는 깊은 것부터 찾아 쓴다(mappedCategoryId).
function VotizCategoryMap({ user, categories, votizCategories, votizSubCats, votizMap, setVotizMap }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [open, setOpen] = useState(false);
    const [openNode, setOpenNode] = useState({});     // 트리에서 펼친 최상위 분류

    const vc = votizCategories || { income: {}, expense: {} };

    // 매니지먼트 항목을 단계별로 펼친 선택지(항목 / 세부 / 세부2 전부 고를 수 있다).
    const opts = useMemo(() => {
        const build = (kind) => {
            const out = [];
            topLevelCats(categories, kind).forEach((top) => {
                out.push({ id: top.id, label: top.name });
                childrenOf(categories, top.id).forEach((mid) => {
                    out.push({ id: mid.id, label: '— ' + mid.name });
                    childrenOf(categories, mid.id).forEach((leaf) => {
                        out.push({ id: leaf.id, label: '—— ' + leaf.name });
                    });
                });
            });
            return out;
        };
        return { income: build('income'), expense: build('expense') };
    }, [categories]);

    // 보티즈 제작비의 하위 목록 → [{ group, items: [{ key:'곡비-작사', name:'작사' }] }]
    const productionTree = useMemo(() => {
        const sub = votizSubCats || {};
        const label = { songFee: '곡비', recording: '녹음비', post: '후반', video: '영상' };
        const groups = [];
        Object.keys(label).forEach((k) => {
            if (!Array.isArray(sub[k])) return;
            groups.push({
                group: label[k],
                items: sub[k].map((x) => ({ key: label[k] + '-' + x, name: x })),
            });
        });
        // '기타 진행비' 는 그룹 없이 subDetail 이 '기타진행비' 하나로 들어간다(실측).
        groups.push({ group: '', items: [{ key: '기타진행비', name: '기타 진행비' }] });
        return groups;
    }, [votizSubCats]);

    const setOne = (key, value) =>
        setVotizMap((prev) => {
            const next = { ...(prev || {}) };
            if (value) next[key] = value; else delete next[key];
            return next;
        });

    const save = async () => {
        setBusy(true); setMsg('');
        try {
            await setDoc(doc(db, MGMT_SETTINGS_COLLECTION, VOTIZ_MAP_DOC), {
                uid: user.uid, map: votizMap || {}, updatedAt: new Date(),
            });
            setMsg('저장했습니다.');
        } catch (e) {
            setMsg('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    // 한 줄 = 보티즈 분류 하나 + 매니지먼트 항목 고르기
    const renderPick = (mapKey, name, choices, indent, tone) => {
        const picked = (votizMap || {})[mapKey] || '';
        return (
            <div key={mapKey} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-1.5" style={{ marginLeft: indent * 16 }}>
                {indent > 0 && <span className="shrink-0 text-xs text-gray-300">└</span>}
                <span className={`min-w-0 flex-1 truncate text-sm ${indent === 0 ? 'font-bold text-gray-700' : 'text-gray-600'}`} title={name}>{name}</span>
                <span className="shrink-0 text-xs text-gray-300">→</span>
                <select className={selectClass + ' w-[55%] max-w-[18rem] py-1.5 text-sm'}
                    value={picked} onChange={(e) => setOne(mapKey, e.target.value)}>
                    <option value="">연결 안 함</option>
                    {choices.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {picked && (
                    <span className="hidden md:inline shrink-0 text-[10px] font-bold text-emerald-600" title="집계되는 매니지먼트 항목">
                        {catFullPath(categories, picked)}
                    </span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone}`}>
                    {indent === 0 ? '분류' : indent === 1 ? '그룹' : '세부'}
                </span>
            </div>
        );
    };

    const renderType = (type) => {
        const choices = opts[type] || [];
        const tone = type === 'income' ? 'bg-blue-50 text-blue-600 ring-blue-200' : 'bg-red-50 text-red-500 ring-red-200';
        return (
            <div className="space-y-1.5">
                <div className={`text-[10px] font-bold ${type === 'income' ? 'text-blue-400' : 'text-red-400'}`}>
                    {type === 'income' ? '수입' : '지출'}
                </div>
                {Object.keys(vc[type] || {}).map((key) => {
                    const hasTree = type === 'expense' && key === 'production';
                    const nodeOpen = !!openNode[type + ':' + key];
                    return (
                        <div key={type + ':' + key} className="space-y-1.5">
                            <div className="flex items-center gap-1">
                                {hasTree ? (
                                    <button type="button" onClick={() => setOpenNode((o) => ({ ...o, [type + ':' + key]: !nodeOpen }))}
                                        className="shrink-0 w-5 h-5 rounded text-xs font-bold text-gray-400 hover:bg-gray-100" title="하위 단계">
                                        {nodeOpen ? '▾' : '▸'}
                                    </button>
                                ) : <span className="shrink-0 w-5" />}
                                <div className="min-w-0 flex-1">
                                    {renderPick(votizMapKey(type, key), vc[type][key], choices, 0, tone)}
                                </div>
                            </div>
                            {hasTree && nodeOpen && productionTree.map((g) => (
                                <div key={g.group || '(기타)'} className="space-y-1.5 pl-6">
                                    {g.group && renderPick(votizMapKey(type, key, g.group), g.group, choices, 1, tone)}
                                    {g.items.map((it) => renderPick(votizMapKey(type, key, it.key), it.name, choices, g.group ? 2 : 1, tone))}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                    <span className="font-bold text-gray-800">보티즈 분류 연결</span>
                    <span className="ml-2 text-xs text-gray-400">곡 내역을 어느 항목으로 집계할지</span>
                </div>
                <button type="button" onClick={() => setOpen((v) => !v)}
                    className={`${pill} bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50`}>
                    {open ? '접기' : '펼치기'}
                </button>
            </div>

            {open && (
                <>
                    <div className="space-y-4">
                        {renderType('income')}
                        {renderType('expense')}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" disabled={busy} onClick={save}
                            className={`${pill} bg-gray-800 text-white hover:bg-gray-700`}>연결 저장</button>
                        {msg && <span className="text-xs font-bold text-gray-500">{msg}</span>}
                    </div>
                    <p className="text-xs text-gray-400">
                        깊은 단계 연결이 먼저입니다 — 세부 연결이 없으면 그룹, 그것도 없으면 분류 연결을 씁니다.
                        끝까지 없으면 예전처럼 곡-아티스트 연결에서 고른 '수익항목/지출항목' 으로 들어갑니다.
                        매니지먼트 쪽은 항목·세부·세부2 아무 단계나 고를 수 있고, 정산비율은 그 항목의 최상위 비율을 씁니다.
                    </p>
                </>
            )}
        </div>
    );
}
