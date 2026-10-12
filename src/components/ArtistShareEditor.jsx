// 보티즈 곡(acc_projects)에 아티스트를 연결하는 입력칸.
//
// 전체 아티스트를 체크박스로 깔지 않는다. 드롭다운에서 골라 '추가' 하면 줄이 하나 생기고,
// 줄마다 정산 방식과 그 방식에 필요한 값만 입력한다. 드롭다운에는 아직 연결 안 된
// '진행중' 아티스트만 나온다(종료는 숨김. 이미 연결된 종료 아티스트는 줄에 그대로 남는다).
//
// 드롭다운은 아티스트 구분(소속 / 콜라보)별로 묶어 보여주고, 고른 사람의 구분에 맞는
// 정산 방식을 기본값으로 넣는다(소속 → '소속', 콜라보 → '콜라보-제작비 회수 후 공유').
// 바꾸려면 줄에서 바로 고를 수 있다.
//
// 줄마다 '펼치기'를 누르면 그 아티스트의 구분·지급처·소속사·계좌(뒤 4자리)를 보기만 한다.
// 계좌·사업자번호는 artistPrivate 에 있어 그때 1건만 읽는다(안 펼치면 조회 0회).
//
// 연결 규칙(종류·균등·합 100 검사)과 저장 형식은 src/utils/artistShares.js 그대로다.
import React, { useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { isShareFilled, typeOf, LINK_TYPES, DEFAULT_PERIOD_MONTHS } from '../utils/artistShares.js';
import { CATEGORY_LABEL, categoryOf, payeeOf, payeeInfo } from '../domain/artistProfile.js';
import { topLevelCats } from '../domain/mgmtCategories.js';

const boxClass = "w-24 p-2 bg-white border border-gray-200 rounded-lg outline-none text-sm text-right";
const selClass = "p-2 bg-white border border-gray-200 rounded-lg outline-none text-xs";
const pickClass = "p-2 bg-white border border-gray-200 rounded-lg outline-none text-sm";

export function ArtistShareEditor({ title, artistList, categories, value, onChange }) {
    const [pick, setPick] = useState('');
    const [keyword, setKeyword] = useState('');
    const [openId, setOpenId] = useState(null);     // 정보를 펼친 줄
    const [privMap, setPrivMap] = useState({});     // artistId → 민감정보(한 번 읽으면 재사용)
    const [showFull, setShowFull] = useState({});   // artistId → 계좌 전체 보기

    const list = value || [];
    const all = artistList || [];
    const byId = (id) => all.find((a) => a.id === id);

    // 곡 연결에서 고르는 것은 **최상위 항목**이다(정산비율이 거기에만 있다).
    const incomeCats = topLevelCats(categories, 'income');
    const expenseCats = topLevelCats(categories, 'expense');

    const members = list.filter((v) => typeOf(v) === 'member');
    const allBlank = members.length > 0 && members.every((v) => !isShareFilled(v.share));
    const sum = members.filter((v) => isShareFilled(v.share)).reduce((a, c) => a + Number(c.share), 0);

    // 아직 연결 안 된 '진행중' 아티스트만 고를 수 있다.
    const linked = new Set(list.map((v) => v.artistId));
    const k = keyword.trim().toLowerCase();
    const selectable = all
        .filter((a) => !linked.has(a.id))
        .filter((a) => (a.status || 'active') === 'active')
        .filter((a) => !k || (a.stageName || '').toLowerCase().includes(k) || (a.realName || '').toLowerCase().includes(k));

    // 드롭다운 묶음 — 소속 / 콜라보
    const selectableMembers = selectable.filter((a) => categoryOf(a) === 'member');
    const selectableCollabs = selectable.filter((a) => categoryOf(a) === 'collab');

    const patch = (id, fields) => onChange(list.map((x) => (x.artistId === id ? { ...x, ...fields } : x)));

    const add = () => {
        if (!pick || linked.has(pick)) return;
        const picked = byId(pick);
        // 아티스트 구분에 맞는 정산 방식을 기본으로 넣는다. 줄에서 바꿀 수 있다.
        const row = categoryOf(picked) === 'collab'
            ? { artistId: pick, type: 'collab_recoup', recoupAmount: '', sharePercent: '', startMonth: '', periodMonths: DEFAULT_PERIOD_MONTHS }
            : { artistId: pick, type: 'member', share: '', incomeCategoryId: '', expenseCategoryId: '' };
        onChange([...list, row]);
        setPick('');
        setKeyword('');
    };

    // 펼칠 때 그 아티스트의 민감정보 1건만 읽는다.
    const toggleOpen = async (id) => {
        if (openId === id) { setOpenId(null); return; }
        setOpenId(id);
        if (privMap[id] !== undefined) return;
        try {
            const snap = await getDoc(doc(db, 'artistPrivate', id));
            setPrivMap((prev) => ({ ...prev, [id]: snap.exists() ? snap.data() : {} }));
        } catch (e) {
            console.warn('민감정보를 못 읽었습니다(표시만 영향).', e && e.message);
            setPrivMap((prev) => ({ ...prev, [id]: {} }));
        }
    };

    const remove = (id) => onChange(list.filter((v) => v.artistId !== id));

    const setShare = (id, raw) => {
        const v = raw === '' ? '' : Math.max(0, Math.min(100, Number(raw) || 0));
        patch(id, { share: v });
    };

    if (all.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-400">
                {title} — 등록된 아티스트가 없습니다. 매니지먼트에서 먼저 등록하세요.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-500">{title}</span>
                {allBlank && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">소속 균등</span>
                )}
                {!allBlank && members.length > 0 && (
                    <span className={`text-[11px] font-bold ${sum === 100 ? 'text-gray-400' : 'text-red-500'}`}>소속 지분 합 {sum}%</span>
                )}
            </div>

            {/* 고르기 → 추가 */}
            <div className="flex items-center gap-2 flex-wrap">
                <input className={pickClass + ' w-28'} placeholder="이름 검색" value={keyword}
                    onChange={(e) => { setKeyword(e.target.value); setPick(''); }} />
                <select className={pickClass + ' flex-1 min-w-[140px]'} value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">
                        {selectable.length === 0
                            ? (k ? '검색 결과 없음' : '더 추가할 아티스트 없음')
                            : '아티스트 선택'}
                    </option>
                    {selectableMembers.length > 0 && (
                        <optgroup label="소속">
                            {selectableMembers.map((a) => (
                                <option key={a.id} value={a.id}>{a.stageName || '(이름없음)'}</option>
                            ))}
                        </optgroup>
                    )}
                    {selectableCollabs.length > 0 && (
                        <optgroup label="콜라보">
                            {selectableCollabs.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {(a.stageName || '(이름없음)') + (a.agencyName ? ' · ' + a.agencyName : '')}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
                <button type="button" disabled={!pick} onClick={add}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold shadow-sm transition active:scale-95 ${pick ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-200 text-gray-400'}`}>
                    추가
                </button>
            </div>

            {/* 연결된 아티스트 줄 */}
            {list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 px-3 py-4 text-center text-xs text-gray-400">
                    연결된 아티스트 없음
                </div>
            ) : (
                <div className="space-y-2">
                    {list.map((e) => {
                        const a = byId(e.artistId);
                        const t = typeOf(e);
                        return (
                            <div key={e.artistId} className="rounded-lg bg-white/70 px-2 py-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-gray-700 truncate">
                                        {a ? (a.stageName || '(이름없음)') : '(삭제된 아티스트)'}
                                    </span>
                                    {a && (
                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${categoryOf(a) === 'collab' ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                                            {CATEGORY_LABEL[categoryOf(a)]}
                                        </span>
                                    )}
                                    {a && (a.status || 'active') !== 'active' && (
                                        <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">종료</span>
                                    )}
                                    <select className={selClass} value={t} onChange={(ev) => patch(e.artistId, ev.target.value === 'collab_recoup'
                                        ? { type: ev.target.value, periodMonths: e.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : e.periodMonths }
                                        : { type: ev.target.value })}>
                                        {LINK_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                                    </select>
                                    {a && (
                                        <button type="button" onClick={() => toggleOpen(e.artistId)}
                                            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">
                                            {openId === e.artistId ? '접기' : '정보'}
                                        </button>
                                    )}
                                    <button type="button" onClick={() => remove(e.artistId)}
                                        className={`${a ? '' : 'ml-auto '}shrink-0 w-6 h-6 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 font-bold`}
                                        title="연결 해제">×</button>
                                </div>

                                {a && openId === e.artistId && (
                                    <ArtistProfilePeek
                                        artist={a}
                                        priv={privMap[e.artistId]}
                                        showFull={!!showFull[e.artistId]}
                                        onToggleFull={() => setShowFull((prev) => ({ ...prev, [e.artistId]: !prev[e.artistId] }))}
                                    />
                                )}

                                {t === 'member' && (
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                        <div className="flex items-center gap-1">
                                            <input type="number" min="0" max="100" className={boxClass} placeholder="균등"
                                                value={isShareFilled(e.share) ? e.share : ''} onChange={(ev) => setShare(e.artistId, ev.target.value)} />
                                            <span className="text-xs font-bold text-gray-400">%</span>
                                        </div>
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">수익→</span>
                                            <select className={selClass} value={e.incomeCategoryId || ''} onChange={(ev) => patch(e.artistId, { incomeCategoryId: ev.target.value })}>
                                                <option value="">항목 선택</option>
                                                {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">지출→</span>
                                            <select className={selClass} value={e.expenseCategoryId || ''} onChange={(ev) => patch(e.artistId, { expenseCategoryId: ev.target.value })}>
                                                <option value="">항목 선택</option>
                                                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </label>
                                        {(!e.incomeCategoryId || !e.expenseCategoryId) && (
                                            <span className="text-[10px] font-bold text-amber-600">항목을 안 고르면 그 쪽은 정산에 안 들어갑니다</span>
                                        )}
                                    </div>
                                )}

                                {t === 'collab_recoup' && (
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">제작비</span>
                                            <input type="number" min="0" className={boxClass + ' w-32'} placeholder="0"
                                                value={e.recoupAmount === undefined ? '' : e.recoupAmount}
                                                onChange={(ev) => patch(e.artistId, { recoupAmount: ev.target.value })} />
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">공유</span>
                                            <input type="number" min="0" max="100" className={boxClass + ' w-16'} placeholder="%"
                                                value={e.sharePercent === undefined ? '' : e.sharePercent}
                                                onChange={(ev) => patch(e.artistId, { sharePercent: ev.target.value })} />
                                            <span className="text-xs font-bold text-gray-400">%</span>
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">시작월</span>
                                            <input type="month" className={selClass} value={e.startMonth || ''}
                                                onChange={(ev) => patch(e.artistId, { startMonth: ev.target.value })} />
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-400">기간</span>
                                            <input type="number" min="1" className={boxClass + ' w-16'} placeholder="36"
                                                value={e.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : e.periodMonths}
                                                onChange={(ev) => patch(e.artistId, { periodMonths: ev.target.value })} />
                                            <span className="text-xs font-bold text-gray-400">개월</span>
                                        </label>
                                    </div>
                                )}

                                {t === 'collab_none' && (
                                    <div className="mt-1 text-[10px] font-bold text-gray-400">연결 표시만 합니다. 정산하지 않습니다.</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="text-[11px] text-gray-400">
                소속 지분을 비워두면 균등 분배로 봅니다. 입력하면 소속끼리 합이 100% 여야 저장됩니다. 콜라보는 지분 계산에서 빠집니다.
            </p>
        </div>
    );
}

// 연결된 아티스트의 정보 — 보기만 한다(여기서는 못 고친다).
// 고치는 곳은 매니지먼트 탭의 아티스트 상세다.
// 계좌는 기본으로 뒤 4자리만 보이고 '보기'를 누르면 전체가 보인다.
function ArtistProfilePeek({ artist, priv, showFull, onToggleFull }) {
    if (priv === undefined) {
        return <div className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] font-bold text-gray-400">불러오는 중...</div>;
    }
    const info = payeeInfo(artist, priv);
    const agency = payeeOf(artist) === 'agency';
    // '보기' 로 펼칠 전체 계좌번호 — 지급처에 맞는 쪽을 쓴다.
    const fullAccount = ((agency ? priv.agencyAccount : priv.accountNumber) || '').trim();

    return (
        <div className="mt-1.5 rounded-lg bg-white ring-1 ring-gray-200 px-2.5 py-2 space-y-1 text-[11px]">
            <Row k="구분" v={CATEGORY_LABEL[categoryOf(artist)]} />
            <Row k="지급처" v={info.payeeLabel + (info.name ? ' · ' + info.name : '')} />
            {artist.agencyName ? <Row k="소속사" v={artist.agencyName} /> : null}
            <Row k="사업자등록번호" v={info.bizNo || '-'} />
            <div className="flex items-start gap-2">
                <span className="w-24 shrink-0 font-bold text-gray-400">계좌</span>
                <span className="font-bold text-gray-700 break-all">
                    {info.bank ? info.bank + ' ' : ''}
                    {fullAccount ? (showFull ? fullAccount : info.accountMasked) : '-'}
                    {info.holder ? ' (' + info.holder + ')' : ''}
                </span>
                {fullAccount && (
                    <button type="button" onClick={onToggleFull}
                        className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">
                        {showFull ? '가리기' : '보기'}
                    </button>
                )}
            </div>
            {artist.agencyMemo ? <Row k="소속사 메모" v={artist.agencyMemo} /> : null}
            {artist.memo ? <Row k="메모" v={artist.memo} /> : null}
            <p className="text-[10px] text-gray-400">고치려면 매니지먼트 탭의 아티스트 상세에서 바꿉니다.</p>
        </div>
    );
}

function Row({ k, v }) {
    return (
        <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 font-bold text-gray-400">{k}</span>
            <span className="font-bold text-gray-700 break-all">{v}</span>
        </div>
    );
}
