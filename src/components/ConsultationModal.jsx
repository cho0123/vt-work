// 상담일지 창 — 보기 / 작성 / 수정.
//
// 스케쥴의 상담 일정 팝업에서 열거나(일정 1건 ↔ 상담일지 1건), 상담일지 목록에서 연다.
// 저장 위치는 `consultations` 컬렉션이고, 스케쥴 문서에는 아무것도 쓰지 않는다.
// 사진은 다른 사진과 같은 방식(consultations/{id}/photos 에 한 장씩, 문서에는 장수만).
//
// ⚠️ 새로 쓸 때는 문서가 아직 없으므로, 저장이 끝난 뒤에 사진을 올린다.
import React, { useState, useRef } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PhotoPicker, PhotoBadge, PhotoModal } from './PhotoAttach.jsx';
import { addPhotos, deleteAllPhotos } from '../utils/photos.js';

const inputClass = "w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-300 outline-none transition text-sm";
const pill = "rounded-full px-4 py-2 text-sm font-bold shadow-sm transition active:scale-95";

/**
 * @param date        상담 일정 날짜 'YYYY-MM-DD'
 * @param scheduleId  연결된 일정 id (목록에서 열었고 일정이 지워졌으면 '')
 * @param consult     기존 상담일지(없으면 null → 작성 모드로 시작)
 * @param startEdit   처음부터 수정 상태로 열지
 * @param onSaved     저장/삭제 뒤 호출(목록·스케쥴 갱신용). (consult|null) 을 넘긴다
 */
export function ConsultationModal({ date, scheduleId, consult, uid, startEdit, onSaved, onClose }) {
    const [editing, setEditing] = useState(!consult || !!startEdit);
    const [name, setName] = useState((consult && consult.name) || '');
    const [memo, setMemo] = useState((consult && consult.memo) || '');
    const [photoFiles, setPhotoFiles] = useState([]);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [current, setCurrent] = useState(consult || null);

    const save = async () => {
        if (!name.trim()) { setErr('상담자 이름을 넣어 주세요.'); return; }
        setBusy(true); setErr('');
        try {
            const base = {
                uid,
                scheduleId: scheduleId || '',
                date: date || '',
                name: name.trim(),
                memo: memo || '',
                updatedAt: new Date(),
            };
            let id = current && current.id;
            let photoCount = (current && current.photoCount) || 0;

            if (id) {
                await updateDoc(doc(db, 'consultations', id), base);
            } else {
                const ref = await addDoc(collection(db, 'consultations'), { ...base, photoCount: 0, createdAt: new Date() });
                id = ref.id;
            }

            // 사진은 문서가 생긴 뒤에 올린다.
            if (photoFiles.length > 0) {
                const { added, errors } = await addPhotos(db, 'consultations', id, photoFiles, uid);
                photoCount += added;
                if (errors.length) setErr('일부 사진을 올리지 못했습니다 — ' + errors.join(' / '));
                setPhotoFiles([]);
            }

            const saved = { id, ...base, photoCount };
            setCurrent(saved);
            setEditing(false);
            if (onSaved) onSaved(saved);
        } catch (e) {
            setErr('저장 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const remove = async () => {
        if (!current || !current.id) return;
        if (!window.confirm('이 상담일지를 삭제합니다. 붙은 사진도 함께 지워지고 되돌릴 수 없습니다.')) return;
        setBusy(true); setErr('');
        try {
            // 하위 컬렉션은 부모를 지워도 같이 안 지워진다 — 사진부터 지운다.
            try { await deleteAllPhotos(db, 'consultations', current.id); }
            catch (e2) { console.warn('사진 삭제 실패(상담일지는 계속 삭제):', e2 && e2.message); }
            await deleteDoc(doc(db, 'consultations', current.id));
            if (onSaved) onSaved(null);
            onClose();
        } catch (e) {
            setErr('삭제 실패: ' + (e && e.message ? e.message : ''));
            setBusy(false);
        }
    };

    // ⚠️ 배경(바깥)을 눌러 닫을 때는 **누른 곳과 뗀 곳이 둘 다 배경**이어야 한다.
    //    예전엔 뗀 곳만 봐서, 입력칸 안에서 글자를 드래그하다 손이 배경에서 떨어지면
    //    '바깥 클릭' 으로 처리돼 **쓰던 내용이 그대로 날아갔다.**
    const backdropDown = useRef(false);

    return (
        <div className="fixed inset-0 z-[55] flex items-start md:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-3 overflow-y-auto"
            onMouseDown={(e) => { backdropDown.current = e.target === e.currentTarget; }}
            onClick={(e) => {
                const onBackdrop = e.target === e.currentTarget && backdropDown.current;
                backdropDown.current = false;
                if (onBackdrop) onClose();
            }}>
            <div className="w-full max-w-lg my-6 rounded-2xl bg-white p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">상담일지</span>
                        <span className="text-sm font-bold text-gray-700">{date}</span>
                        {!scheduleId && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">일정 없음</span>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
                </div>

                {editing ? (
                    <>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">상담자 이름</span>
                            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="필수" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500">메모</span>
                            <textarea className={inputClass + ' h-40 resize-y'} value={memo} onChange={(e) => setMemo(e.target.value)}
                                placeholder="상담 내용을 적습니다." />
                        </label>
                        <div className="space-y-1.5">
                            <span className="text-xs font-bold text-gray-500">상담지 사진</span>
                            <PhotoPicker files={photoFiles} onChange={setPhotoFiles} disabled={busy} label="상담지 사진 첨부" />
                            {current && current.photoCount > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400">이미 붙은 사진 {current.photoCount}장</span>
                                    <PhotoBadge count={current.photoCount} onClick={() => setPhotoOpen(true)} />
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-[11px] font-bold text-gray-400">상담자</div>
                            <div className="text-base font-extrabold text-gray-800">{current ? current.name : ''}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-[11px] font-bold text-gray-400">메모</div>
                            <div className="whitespace-pre-wrap text-sm text-gray-700">
                                {current && current.memo ? current.memo : <span className="text-gray-400">(메모 없음)</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500">상담지 사진</span>
                            {current && current.photoCount > 0 ? (
                                <PhotoBadge count={current.photoCount} onClick={() => setPhotoOpen(true)} />
                            ) : (
                                <span className="text-[11px] text-gray-400">없음</span>
                            )}
                        </div>
                    </>
                )}

                {err && <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs font-bold text-red-700">{err}</div>}

                <div className="flex gap-2">
                    {editing ? (
                        <>
                            <button type="button" disabled={busy} onClick={save}
                                className={`${pill} flex-1 ${busy ? 'bg-gray-300 text-white' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                {busy ? '저장 중...' : '저장'}
                            </button>
                            <button type="button" onClick={() => (current ? setEditing(false) : onClose())}
                                className={`${pill} bg-gray-100 text-gray-600 hover:bg-gray-200`}>취소</button>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={() => setEditing(true)}
                                className={`${pill} flex-1 bg-green-600 text-white hover:bg-green-700`}>수정</button>
                            <button type="button" disabled={busy} onClick={remove}
                                className={`${pill} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}>삭제</button>
                            <button type="button" onClick={onClose}
                                className={`${pill} bg-gray-100 text-gray-600 hover:bg-gray-200`}>닫기</button>
                        </>
                    )}
                </div>
            </div>

            {photoOpen && current && current.id && (
                <PhotoModal
                    title={'상담지 사진 — ' + (current.name || '') + ' ' + (date || '')}
                    parentPath="consultations" parentId={current.id} uid={uid}
                    onCountChange={(n) => {
                        const next = { ...current, photoCount: n };
                        setCurrent(next);
                        if (onSaved) onSaved(next);
                    }}
                    onClose={() => setPhotoOpen(false)}
                />
            )}
        </div>
    );
}
