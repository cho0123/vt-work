// 곡 판매 정보 — 곡 종류가 '곡 판매' 일 때만 곡 상세에 나온다.
//
// 저장 위치는 곡 문서(acc_projects) 안의 `sale` 한 덩어리다. 새 컬렉션을 만들지 않았으므로
// 보티즈 묶음 백업(backup.js 의 VOTIZ_COLLECTIONS)에 자동으로 함께 들어간다.
//
//   sale = {
//     buyerName, contactName, phone, bizNo, contractDate,
//     amount,                        // 판매금액(원)
//     rights, memo,                  // 권리 범위는 직접 입력
//     schedule: [{ id, label, dueDate, amount }]   // 대금 일정(계약금/잔금 …)
//   }
//
// ⚠️ 대금 일정은 **참고용**이다. 수입 내역을 자동으로 만들지 않는다
//    (돈이 실제로 들어오면 원장이 평소대로 '곡 판매' 분류로 수입을 등록한다).
// ⚠️ 입금 합계는 이 곡의 보티즈 **수입 내역 중 분류가 '곡 판매'** 인 것만 더한다.
//    금액 기준은 보티즈와 같은 totalAmount(없으면 amount).
// ⚠️ 판매 대금은 아티스트에게 분배하지 않는다 — 매니지먼트 정산 계산은 건드리지 않았다.
//
// 계약서 사진은 다른 사진과 같은 방식이다(곡 문서 아래 photos, 문서에는 장수만).
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PhotoPicker, PhotoBadge, PhotoModal } from './PhotoAttach.jsx';
import { addPhotos } from '../utils/photos.js';
import { EMPTY_SALE, parseSaleMoney as parseMoney, salePaidAmount } from '../domain/songSale.js';

const inputClass = "w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-300 outline-none transition text-sm";
const pill = "rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95";

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

export function SongSaleInfo({ project, allTransactions, user, onSaved }) {
    const saved = project.sale || {};
    const [form, setForm] = useState({ ...EMPTY_SALE, ...saved, schedule: saved.schedule || [] });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [photoFiles, setPhotoFiles] = useState([]);
    const [photoOpen, setPhotoOpen] = useState(false);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const addRow = () =>
        setForm((f) => ({
            ...f,
            schedule: [...(f.schedule || []), { id: String(Date.now()), label: '', dueDate: '', amount: '' }],
        }));
    const setRow = (id, k, v) =>
        setForm((f) => ({ ...f, schedule: f.schedule.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
    const removeRow = (id) =>
        setForm((f) => ({ ...f, schedule: f.schedule.filter((r) => r.id !== id) }));

    const total = parseMoney(form.amount);
    const paid = salePaidAmount(allTransactions, project.id);
    const left = total - paid;
    const planned = (form.schedule || []).reduce((a, r) => a + parseMoney(r.amount), 0);

    const save = async () => {
        setBusy(true); setMsg('');
        try {
            const sale = {
                buyerName: (form.buyerName || '').trim(),
                contactName: (form.contactName || '').trim(),
                phone: (form.phone || '').trim(),
                bizNo: (form.bizNo || '').trim(),
                contractDate: form.contractDate || '',
                amount: parseMoney(form.amount),
                rights: (form.rights || '').trim(),
                memo: (form.memo || '').trim(),
                schedule: (form.schedule || []).map((r) => ({
                    id: r.id,
                    label: (r.label || '').trim(),
                    dueDate: r.dueDate || '',
                    amount: parseMoney(r.amount),
                })),
            };
            await updateDoc(doc(db, 'acc_projects', project.id), { sale });

            // 고른 계약서 사진은 저장이 끝난 뒤 올린다(다른 사진과 같은 방식).
            if (photoFiles.length > 0) {
                const { errors } = await addPhotos(db, 'acc_projects', project.id, photoFiles, user.uid);
                if (errors.length) setMsg('일부 사진을 올리지 못했습니다 — ' + errors.join(' / '));
                setPhotoFiles([]);
            }
            if (onSaved) onSaved();
            setMsg((m) => m || '저장했습니다.');
        } catch (e) {
            setMsg('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    return (
        <section className="rounded-2xl border-2 border-amber-100 bg-amber-50/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800 text-sm">곡 판매 정보</h3>
                <div className="flex items-center gap-2">
                    <PhotoBadge count={project.photoCount} onClick={() => setPhotoOpen(true)} title="계약서 사진 보기" />
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                        판매 대금은 아티스트에게 분배하지 않습니다
                    </span>
                </div>
            </div>

            {/* 판매 현황 */}
            <div className="grid grid-cols-3 gap-2">
                <Box label="판매금액" value={won(total)} tone="gray" />
                <Box label="입금 합계 (수입 '곡 판매')" value={won(paid)} tone="blue" />
                <Box label="미수금" value={won(left)} tone={left > 0 ? 'red' : 'green'} />
            </div>

            {/* 기본 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Field label="구매자명 (회사)"><input className={inputClass} value={form.buyerName} onChange={(e) => set('buyerName', e.target.value)} /></Field>
                <Field label="담당자명"><input className={inputClass} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
                <Field label="연락처"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="010-0000-0000" /></Field>
                <Field label="사업자등록번호"><input className={inputClass} value={form.bizNo} onChange={(e) => set('bizNo', e.target.value)} placeholder="000-00-00000" /></Field>
                <Field label="계약일"><input type="date" className={inputClass} value={form.contractDate} onChange={(e) => set('contractDate', e.target.value)} /></Field>
                <Field label="판매금액">
                    <input className={inputClass} value={form.amount === '' ? '' : won(parseMoney(form.amount))}
                        onChange={(e) => set('amount', parseMoney(e.target.value))} placeholder="0" />
                </Field>
                <Field label="권리 범위" wide>
                    <input className={inputClass} value={form.rights} onChange={(e) => set('rights', e.target.value)}
                        placeholder="예: 저작인접권 전부 양도 / 국내 한정 5년" />
                </Field>
                <Field label="메모" wide><input className={inputClass} value={form.memo} onChange={(e) => set('memo', e.target.value)} /></Field>
            </div>

            {/* 대금 일정 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-500">대금 일정</span>
                    <span className="text-[11px] text-gray-400">참고용 — 수입 내역은 따로 등록합니다</span>
                    {planned > 0 && (
                        <span className={`text-[11px] font-bold ${planned === total ? 'text-gray-400' : 'text-amber-700'}`}>
                            일정 합 {won(planned)}{planned !== total ? ' (판매금액과 다름)' : ''}
                        </span>
                    )}
                    <button type="button" onClick={addRow} className={`${pill} ml-auto bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`}>+ 줄 추가</button>
                </div>
                {(form.schedule || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 px-3 py-4 text-center text-xs text-gray-400">
                        등록한 일정이 없습니다. (예: 계약금 / 잔금)
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {form.schedule.map((r) => (
                            <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                                <input className={inputClass} placeholder="구분 (예: 계약금)" value={r.label} onChange={(e) => setRow(r.id, 'label', e.target.value)} />
                                <input type="date" className={inputClass + ' w-40'} value={r.dueDate} onChange={(e) => setRow(r.id, 'dueDate', e.target.value)} />
                                <input className={inputClass + ' w-32 text-right'} placeholder="금액"
                                    value={r.amount === '' ? '' : won(parseMoney(r.amount))}
                                    onChange={(e) => setRow(r.id, 'amount', parseMoney(e.target.value))} />
                                <button type="button" onClick={() => removeRow(r.id)}
                                    className="w-7 h-7 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 font-bold" title="줄 삭제">×</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 계약서 사진 */}
            <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">계약서 사진</span>
                <PhotoPicker files={photoFiles} onChange={setPhotoFiles} disabled={busy} label="계약서 사진 첨부" />
            </div>

            {msg && <div className="rounded-xl bg-white border border-amber-200 p-2.5 text-xs font-bold text-amber-800">{msg}</div>}

            <button type="button" disabled={busy} onClick={save}
                className={`w-full rounded-xl py-2.5 font-bold text-white transition ${busy ? 'bg-gray-300' : 'bg-amber-600 hover:bg-amber-700 shadow-md'}`}>
                {busy ? '저장 중...' : '판매 정보 저장'}
            </button>

            {photoOpen && (
                <PhotoModal
                    title={'계약서 사진 — ' + project.name}
                    parentPath="acc_projects" parentId={project.id} uid={user.uid}
                    onCountChange={() => { if (onSaved) onSaved(); }}
                    onClose={() => setPhotoOpen(false)}
                />
            )}
        </section>
    );
}

function Field({ label, wide, children }) {
    return (
        <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
            <span className="text-[11px] font-bold text-gray-500">{label}</span>
            {children}
        </label>
    );
}

function Box({ label, value, tone }) {
    const tones = {
        gray: 'bg-white text-gray-900 ring-gray-200',
        blue: 'bg-blue-50 text-blue-700 ring-blue-200',
        red: 'bg-red-50 text-red-600 ring-red-200',
        green: 'bg-green-50 text-green-700 ring-green-200',
    };
    return (
        <div className={`rounded-xl px-3 py-2 ring-1 ${tones[tone] || tones.gray}`}>
            <div className="text-[10px] font-bold opacity-70">{label}</div>
            <div className="text-base font-extrabold">{value}원</div>
        </div>
    );
}
