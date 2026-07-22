import { useState, useEffect, memo } from 'react';
import { FaSave } from 'react-icons/fa';

/**
 * 한 줄짜리 메모 입력 + 저장 버튼.
 *
 * 입력 중에는 이 컴포넌트의 로컬 상태만 바뀐다.
 * 예전에는 글자를 칠 때마다 App 의 state 를 갱신해서 6,600줄짜리 트리 전체가
 * 다시 그려졌고, 그때마다 로테이션·유령스케줄 계산이 통째로 재실행됐다.
 *
 * @param value        저장돼 있는 값 (서버에서 로드된 값)
 * @param onSave       저장 버튼/엔터 시 호출. 현재 입력값을 인자로 받는다.
 * @param placeholder  안내 문구
 * @param icon         왼쪽 아이콘 노드
 * @param label        아이콘 옆 라벨
 *
 * 저장 버튼은 앱 공통 pill 스타일 한 가지만 쓴다(스케쥴·학생관리 동일).
 */
function MemoInputInner({ value, onSave, placeholder, icon, label }) {
    const [draft, setDraft] = useState(value ?? '');
    const [saving, setSaving] = useState(false);

    // 서버에서 값이 새로 로드되면(주차 이동, 월 이동 등) 입력창도 따라간다.
    useEffect(() => {
        setDraft(value ?? '');
    }, [value]);

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await onSave(draft);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="flex items-center gap-2 min-w-fit">
                {icon}
                <span className="text-xs font-bold text-gray-500">{label}</span>
            </div>
            <input
                type="text"
                className="input input-sm border-none bg-transparent flex-1 text-sm focus:outline-none placeholder-gray-300 font-medium"
                placeholder={placeholder}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                }}
            />
            <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-gray-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100"
            >
                <FaSave className="text-[11px]" />
                <span>저장</span>
            </button>
        </>
    );
}

export const MemoInput = memo(MemoInputInner);
