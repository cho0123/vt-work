// 보티즈 곡(acc_projects)에 아티스트를 연결하는 입력칸.
// 연결 규칙(종류·균등·합 100 검사)은 src/utils/artistShares.js 에 있다.
import React from 'react';
import { isShareFilled, typeOf, LINK_TYPES, DEFAULT_PERIOD_MONTHS } from '../utils/artistShares.js';

const boxClass = "w-24 p-2 bg-white border border-gray-200 rounded-lg outline-none text-sm text-right";
const selClass = "p-2 bg-white border border-gray-200 rounded-lg outline-none text-xs";

export function ArtistShareEditor({ title, artistList, categories, value, onChange }) {
    const list = value || [];
    const entryOf = (id) => list.find((v) => v.artistId === id);
    const selected = (id) => !!entryOf(id);

    const incomeCats = (categories || []).filter((c) => c.kind === 'income' && !c.hidden);
    const expenseCats = (categories || []).filter((c) => c.kind === 'expense' && !c.hidden);

    const members = list.filter((v) => typeOf(v) === 'member');
    const allBlank = members.length > 0 && members.every((v) => !isShareFilled(v.share));
    const sum = members.filter((v) => isShareFilled(v.share)).reduce((a, c) => a + Number(c.share), 0);

    const toggle = (id) => {
        if (selected(id)) onChange(list.filter((v) => v.artistId !== id));
        else onChange([...list, { artistId: id, type: 'member', share: '', incomeCategoryId: '', expenseCategoryId: '' }]);
    };

    const patch = (id, fields) => onChange(list.map((x) => (x.artistId === id ? { ...x, ...fields } : x)));

    const setShare = (id, raw) => {
        const v = raw === '' ? '' : Math.max(0, Math.min(100, Number(raw) || 0));
        patch(id, { share: v });
    };

    if (!artistList || artistList.length === 0) {
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

            <div className="space-y-2">
                {artistList.map((a) => {
                    const e = entryOf(a.id);
                    const t = e ? typeOf(e) : 'member';
                    return (
                        <div key={a.id} className="rounded-lg bg-white/70 px-2 py-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                                    <input type="checkbox" className="w-4 h-4 rounded shrink-0" checked={selected(a.id)} onChange={() => toggle(a.id)} />
                                    <span className="text-sm font-bold text-gray-700 truncate">{a.stageName || '(이름없음)'}</span>
                                    {(a.status || 'active') !== 'active' && (
                                        <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">종료</span>
                                    )}
                                </label>
                                {e && (
                                    <select className={selClass} value={t} onChange={(ev) => patch(a.id, ev.target.value === 'collab_recoup'
                                        ? { type: ev.target.value, periodMonths: e.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : e.periodMonths }
                                        : { type: ev.target.value })}>
                                        {LINK_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                                    </select>
                                )}
                            </div>

                            {e && t === 'member' && (
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap pl-6">
                                    <div className="flex items-center gap-1">
                                        <input type="number" min="0" max="100" className={boxClass} placeholder="균등"
                                            value={isShareFilled(e.share) ? e.share : ''} onChange={(ev) => setShare(a.id, ev.target.value)} />
                                        <span className="text-xs font-bold text-gray-400">%</span>
                                    </div>
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">수익→</span>
                                        <select className={selClass} value={e.incomeCategoryId || ''} onChange={(ev) => patch(a.id, { incomeCategoryId: ev.target.value })}>
                                            <option value="">항목 선택</option>
                                            {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">지출→</span>
                                        <select className={selClass} value={e.expenseCategoryId || ''} onChange={(ev) => patch(a.id, { expenseCategoryId: ev.target.value })}>
                                            <option value="">항목 선택</option>
                                            {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </label>
                                    {(!e.incomeCategoryId || !e.expenseCategoryId) && (
                                        <span className="text-[10px] font-bold text-amber-600">항목을 안 고르면 그 쪽은 정산에 안 들어갑니다</span>
                                    )}
                                </div>
                            )}

                            {e && t === 'collab_recoup' && (
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap pl-6">
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">제작비</span>
                                        <input type="number" min="0" className={boxClass + ' w-32'} placeholder="0"
                                            value={e.recoupAmount === undefined ? '' : e.recoupAmount}
                                            onChange={(ev) => patch(a.id, { recoupAmount: ev.target.value })} />
                                    </label>
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">공유</span>
                                        <input type="number" min="0" max="100" className={boxClass + ' w-16'} placeholder="%"
                                            value={e.sharePercent === undefined ? '' : e.sharePercent}
                                            onChange={(ev) => patch(a.id, { sharePercent: ev.target.value })} />
                                        <span className="text-xs font-bold text-gray-400">%</span>
                                    </label>
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">시작월</span>
                                        <input type="month" className={selClass} value={e.startMonth || ''}
                                            onChange={(ev) => patch(a.id, { startMonth: ev.target.value })} />
                                    </label>
                                    <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400">기간</span>
                                        <input type="number" min="1" className={boxClass + ' w-16'} placeholder="36"
                                            value={e.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : e.periodMonths}
                                            onChange={(ev) => patch(a.id, { periodMonths: ev.target.value })} />
                                        <span className="text-xs font-bold text-gray-400">개월</span>
                                    </label>
                                </div>
                            )}

                            {e && t === 'collab_none' && (
                                <div className="mt-1 pl-6 text-[10px] font-bold text-gray-400">연결 표시만 합니다. 정산하지 않습니다.</div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="text-[11px] text-gray-400">
                소속 지분을 비워두면 균등 분배로 봅니다. 입력하면 소속끼리 합이 100% 여야 저장됩니다. 콜라보는 지분 계산에서 빠집니다.
            </p>
        </div>
    );
}
