// 상담일지 목록 — 스케쥴 화면 위에 전체 폭으로 열리는 전환 화면.
//
// 스케쥴 탭의 '상담일지' 버튼으로 열고, 위쪽 '← 스케쥴로' 로 돌아간다.
// 전체 상담일지를 **오래된 날짜부터** 보여주고 25건씩 끊는다.
// 연결된 일정이 지워진 상담일지도 그대로 보이고 '일정 없음' 으로 표시한다.
//
// 조회는 date 한 가지로만 정렬한다(한 필드 정렬이라 복합 색인이 필요 없다).
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { FaArrowLeft, FaPaperclip } from 'react-icons/fa';
import { memoFirstLine } from '../domain/consultation.js';
import { ConsultationModal } from './ConsultationModal.jsx';

const PER_PAGE = 25;

export function ConsultationsPage({ user, scheduleIds, onBack }) {
    const [rows, setRows] = useState(null);     // null = 불러오는 중
    const [err, setErr] = useState('');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(null);     // 상세를 연 상담일지

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'consultations'), orderBy('date')));
                if (alive) setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            } catch (e) {
                if (alive) { setRows([]); setErr('상담일지를 불러오지 못했습니다: ' + (e && e.message ? e.message : '')); }
            }
        };
        load();
        return () => { alive = false; };
    }, []);

    const list = useMemo(() => rows || [], [rows]);
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const pageRows = useMemo(
        () => list.slice((page - 1) * PER_PAGE, page * PER_PAGE),
        [list, page]
    );

    // 저장·삭제 뒤 목록을 메모리에서 맞춘다(다시 읽지 않는다).
    const applySaved = (saved) => {
        setRows((prev) => {
            const base = prev || [];
            if (!saved) return base.filter((r) => !open || r.id !== open.id);
            const without = base.filter((r) => r.id !== saved.id);
            return [...without, saved].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        });
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-8 lg:px-12">
            <div className="shrink-0 flex items-center gap-3 mb-4 flex-wrap">
                <button onClick={onBack}
                    className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 active:scale-95">
                    <FaArrowLeft className="text-xs" /> 스케쥴로
                </button>
                <h2 className="text-lg font-extrabold text-gray-800">상담일지</h2>
                <span className="text-xs font-medium text-gray-400">
                    {rows === null ? '불러오는 중...' : `전체 ${list.length}건 · 오래된 순`}
                </span>
            </div>

            {err && <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700 mb-3">{err}</div>}

            <div className="flex-1 overflow-y-auto">
                {rows !== null && list.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm font-medium text-gray-400">
                        상담일지가 없습니다. 스케쥴에서 짱구 개인일정 '상담' 을 누르면 작성할 수 있습니다.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {pageRows.map((r) => {
                            const orphan = !r.scheduleId || !scheduleIds.has(r.scheduleId);
                            return (
                                <div key={r.id} onClick={() => setOpen(r)}
                                    className="cursor-pointer rounded-xl border border-gray-100 bg-white p-3 transition hover:border-green-300 hover:shadow-sm">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="shrink-0 text-xs font-bold text-gray-500">{r.date}</span>
                                        <span className="font-bold text-gray-800 truncate">{r.name || '(이름 없음)'}</span>
                                        {orphan && (
                                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200">
                                                일정 없음
                                            </span>
                                        )}
                                        {r.photoCount > 0 && (
                                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 ring-1 ring-gray-200">
                                                <FaPaperclip className="text-[9px]" />{r.photoCount}
                                            </span>
                                        )}
                                        <span className="ml-auto truncate text-xs text-gray-500 max-w-[50%]">
                                            {memoFirstLine(r.memo)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="shrink-0 flex justify-center items-center gap-2 pt-3">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-gray-600 ring-1 ring-gray-200 disabled:opacity-40 hover:bg-gray-50">이전</button>
                    <span className="px-2 text-sm text-gray-500">{page} / {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-gray-600 ring-1 ring-gray-200 disabled:opacity-40 hover:bg-gray-50">다음</button>
                </div>
            )}

            {open && (
                <ConsultationModal
                    date={open.date}
                    scheduleId={scheduleIds.has(open.scheduleId) ? open.scheduleId : ''}
                    consult={open}
                    uid={user.uid}
                    onSaved={applySaved}
                    onClose={() => setOpen(null)}
                />
            )}
        </div>
    );
}
