// 내역 사진(영수증) 공용 화면 — 보티즈 수입·지출, 매니지먼트 장부가 같이 쓴다.
//
// 저장 방식과 한도는 src/utils/photos.js 에 있다(학생 결제와 같은 base64 방식).
// 학생 결제 쪽 화면 코드는 건드리지 않았다 — 거기는 한 장짜리라 구조가 다르고,
// 공통으로 묶으려면 그쪽을 크게 고쳐야 해서 방식만 그대로 따랐다.
//
// 세 조각:
//   PhotoPicker  입력 폼에서 쓴다. 아직 문서가 없을 수도 있어 파일만 담아 두고,
//                저장이 끝난 뒤 호출부가 addPhotos 로 올린다.
//   PhotoBadge   목록 줄의 📎 장수 배지.
//   PhotoModal   📎 를 눌렀을 때 뜨는 창. 크게 보기 · 추가 · 한 장씩 삭제.
//                잠긴 줄(정산 확정)은 readOnly 로 넘기면 보기만 된다.
import React, { useState, useEffect } from 'react';
import { FaCamera, FaPaperclip } from 'react-icons/fa';
import { db } from '../firebase';
import { listPhotos, addPhotos, deletePhoto } from '../utils/photos.js';

const pill = "rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95";

// 입력 폼용 — 고른 파일을 들고만 있는다(저장은 호출부가 한다).
// accept="image/*" 라 휴대폰에서는 '카메라 촬영'과 '앨범'이 같이 뜬다(학생 결제와 같다).
export function PhotoPicker({ files, onChange, label = '사진 첨부', disabled }) {
    const list = files || [];
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${disabled ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' : 'cursor-pointer border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                <FaCamera className={disabled ? 'text-gray-300' : 'text-gray-400'} />
                <span>{list.length > 0 ? `사진 ${list.length}장 선택됨` : label}</span>
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={disabled}
                    className="hidden"
                    onClick={(e) => { e.target.value = null; }}
                    onChange={(e) => onChange([...list, ...Array.from(e.target.files || [])])}
                />
            </label>
            {list.length > 0 && (
                <button type="button" onClick={() => onChange([])}
                    className="rounded-full px-2 py-1 text-[11px] font-bold text-gray-400 ring-1 ring-gray-200 hover:bg-gray-50">
                    선택 지우기
                </button>
            )}
            {list.length > 0 && (
                <span className="text-[11px] font-bold text-gray-400">저장하면 함께 올라갑니다</span>
            )}
        </div>
    );
}

export function PhotoBadge({ count, onClick, title = '사진 보기' }) {
    if (!count) return null;
    return (
        <button type="button" onClick={onClick} title={title}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-200">
            <FaPaperclip className="text-[9px]" />{count}
        </button>
    );
}

/**
 * 사진 창.
 * @param parentPath 'acc_transactions' | 'artistLedger'
 * @param parentId   그 문서 id
 * @param readOnly   true 면 추가·삭제 버튼을 안 그린다(정산 확정으로 잠긴 줄)
 * @param onCountChange 장수가 바뀌면 호출 — 목록 배지를 맞추는 데 쓴다
 */
export function PhotoModal({ title, parentPath, parentId, uid, readOnly, onCountChange, onClose }) {
    const [photos, setPhotos] = useState(null);   // null = 불러오는 중
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [zoom, setZoom] = useState(null);

    useEffect(() => {
        let alive = true;
        listPhotos(db, parentPath, parentId)
            .then((list) => { if (alive) setPhotos(list); })
            .catch((e) => { if (alive) { setPhotos([]); setErr('사진을 불러오지 못했습니다: ' + (e && e.message ? e.message : '')); } });
        return () => { alive = false; };
    }, [parentPath, parentId]);

    const pickAndAdd = async (fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        setBusy(true); setErr('');
        try {
            const { added, errors } = await addPhotos(db, parentPath, parentId, files, uid);
            const now = await listPhotos(db, parentPath, parentId);
            setPhotos(now);
            if (onCountChange) onCountChange(now.length);
            if (errors.length) setErr('올리지 못한 사진: ' + errors.join(' / '));
            else if (added === 0) setErr('올린 사진이 없습니다.');
        } catch (e) {
            setErr('사진 추가 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    const remove = async (p) => {
        if (!window.confirm('이 사진을 삭제합니다. 되돌릴 수 없습니다.')) return;
        setBusy(true); setErr('');
        try {
            const now = await deletePhoto(db, parentPath, parentId, p.id);
            setPhotos(now);
            if (onCountChange) onCountChange(now.length);
            if (zoom && zoom.id === p.id) setZoom(null);
        } catch (e) {
            setErr('삭제 실패: ' + (e && e.message ? e.message : ''));
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-start md:items-center justify-center bg-black/60 p-3 overflow-y-auto"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl space-y-3 my-6">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-800 text-sm truncate">{title || '사진'}</h3>
                    <div className="flex items-center gap-2">
                        {!readOnly && (
                            <label className={`${pill} cursor-pointer bg-gray-800 text-white hover:bg-gray-700 inline-flex items-center gap-1`}>
                                <FaCamera /> 사진 추가
                                <input type="file" accept="image/*" multiple className="hidden" disabled={busy}
                                    onClick={(e) => { e.target.value = null; }}
                                    onChange={(e) => pickAndAdd(e.target.files)} />
                            </label>
                        )}
                        <button type="button" onClick={onClose} className={`${pill} bg-gray-100 text-gray-600 hover:bg-gray-200`}>닫기</button>
                    </div>
                </div>

                {readOnly && (
                    <div className="rounded-xl bg-gray-100 p-2.5 text-[11px] font-bold text-gray-500">
                        정산이 확정된 내역이라 사진은 보기만 됩니다.
                    </div>
                )}
                {busy && <div className="text-xs font-bold text-gray-400">처리 중...</div>}
                {err && <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs font-bold text-red-700">{err}</div>}

                {photos === null ? (
                    <div className="py-10 text-center text-xs text-gray-400">불러오는 중...</div>
                ) : photos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center text-xs text-gray-400">
                        붙은 사진이 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {photos.map((p) => (
                            <div key={p.id} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                                <button type="button" onClick={() => setZoom(p)} className="block w-full">
                                    <img src={p.dataUrl} alt={p.name || '사진'} className="w-full h-36 object-cover hover:opacity-90 transition" />
                                </button>
                                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                                    <span className="truncate text-[10px] text-gray-400">{p.name || '사진'}</span>
                                    {!readOnly && (
                                        <button type="button" disabled={busy} onClick={() => remove(p)}
                                            className="shrink-0 text-[11px] font-bold text-red-400 hover:text-red-600">삭제</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {zoom && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setZoom(null)}>
                    <img src={zoom.dataUrl} alt={zoom.name || '사진'} className="max-h-[90vh] max-w-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    );
}
