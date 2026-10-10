// 보티즈 곡(acc_projects)에 아티스트를 연결하는 입력칸.
//
// 전체 아티스트를 체크박스로 깔지 않는다. 드롭다운에서 골라 '추가' 하면 줄이 하나 생기고,
// 줄마다 정산 방식과 그 방식에 필요한 값만 입력한다. 드롭다운에는 아직 연결 안 된
// '진행중' 아티스트만 나온다(종료는 숨김. 이미 연결된 종료 아티스트는 줄에 그대로 남는다).
//
// 연결 규칙(종류·균등·합 100 검사)과 저장 형식은 src/utils/artistShares.js 그대로다.
import React, { useState } from 'react';
import { isShareFilled, typeOf, LINK_TYPES, DEFAULT_PERIOD_MONTHS } from '../utils/artistShares.js';

const boxClass = "w-24 p-2 bg-white border border-gray-200 rounded-lg outline-none text-sm text-right";
const selClass = "p-2 bg-white border border-gray-200 rounded-lg outline-none text-xs";
const pickClass = "p-2 bg-white border border-gray-200 rounded-lg outline-none text-sm";

export function ArtistShareEditor({ title, artistList, categories, value, onChange }) {
    const [pick, setPick] = useState('');
    const [keyword, setKeyword] = useState('');

    const list = value || [];
    const all = artistList || [];
    const byId = (id) => all.find((a) => a.id === id);

    const incomeCats = (categories || []).filter((c) => c.kind === 'income' && !c.hidden);
    const expenseCats = (categories || []).filter((c) => c.kind === 'expense' && !c.hidden);

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

    const patch = (id, fields) => onChange(list.map((x) => (x.artistId === id ? { ...x, ...fields } : x)));

    const add = () => {
        if (!pick || linked.has(pick)) return;
        onChange([...list, { artistId: pick, type: 'member', share: '', incomeCategoryId: '', expenseCategoryId: '' }]);
        setPick('');
        setKeyword('');
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
                    {selectable.map((a) => (
                        <option key={a.id} value={a.id}>{a.stageName || '(이름없음)'}</option>
                    ))}
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
                                    {a && (a.status || 'active') !== 'active' && (
                                        <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">종료</span>
                                    )}
                                    <select className={selClass} value={t} onChange={(ev) => patch(e.artistId, ev.target.value === 'collab_recoup'
                                        ? { type: ev.target.value, periodMonths: e.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : e.periodMonths }
                                        : { type: ev.target.value })}>
                                        {LINK_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                                    </select>
                                    <button type="button" onClick={() => remove(e.artistId)}
                                        className="ml-auto shrink-0 w-6 h-6 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 font-bold"
                                        title="연결 해제">×</button>
                                </div>

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
