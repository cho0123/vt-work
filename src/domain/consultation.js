// 상담일지 — 스케쥴의 '개인일정 → 상담'(짱구/보컬) 일정에 1:1 로 붙는 기록.
//
// ⚠️ 어떤 일정이 '상담' 인지 판정하는 규칙은 여기 한 곳에만 둔다.
//
//   category === '상담'  +  gridType === 'vocal'  +  studentId 없음
//
// 왜 세 개를 다 보나:
//   - 개인일정 항목 '상담' 은 짱구(보컬) 기본 항목이라 저장될 때 category 에 '상담' 이 들어간다.
//     (개발DB 실측 2026-10-18: category '상담' 23건 전부 gridType 'vocal' · studentId 없음)
//   - 그런데 App.jsx 는 category '상담' 을 **수업처럼** 다루는 곳이 있다
//     (이동 가드, 팝업 탭 판정). 나중에 학생이 붙은 '상담' 수업이 생겨도
//     상담일지가 거기 붙지 않도록 studentId 가 없는 것만 본다.
//
// 저장 구조 — 새 컬렉션 `consultations` (스케쥴 문서에는 아무것도 안 붙인다):
//   { uid, scheduleId, date, name, memo, photoCount, createdAt, updatedAt }
//   사진은 consultations/{id}/photos 에 한 장씩(다른 사진과 같은 방식).

export const CONSULT_CATEGORY = '상담';

/** 이 일정에 상담일지를 붙일 수 있는가(짱구 개인일정 '상담'). */
export const isConsultSchedule = (sched) =>
    !!sched &&
    sched.category === CONSULT_CATEGORY &&
    (sched.gridType || 'master') === 'vocal' &&
    !sched.studentId;

export const EMPTY_CONSULT = { name: '', memo: '' };

/** 목록에 보여줄 메모 첫 줄(길면 자른다). */
// 저장 시각(초). Firestore Timestamp / Date / 없음 전부 받는다.
const createdSec = (v) => {
    if (!v) return 0;
    if (typeof v.seconds === 'number') return v.seconds;
    if (v instanceof Date) return v.getTime() / 1000;
    if (typeof v.toDate === 'function') { try { return v.toDate().getTime() / 1000; } catch { return 0; } }
    return 0;
};

/**
 * 목록 정렬 — **최근 날짜가 맨 위**, 같은 날짜면 **최근에 작성한 것**이 위.
 * 날짜는 'YYYY-MM-DD' 문자열이라 글자 비교로 충분하다.
 */
export const consultationSort = (a, b) => {
    const d = String((b || {}).date || '').localeCompare(String((a || {}).date || ''));
    if (d !== 0) return d;
    return createdSec((b || {}).createdAt) - createdSec((a || {}).createdAt);
};

export const memoFirstLine = (memo, max = 40) => {
    const first = String(memo || '').split('\n').find((l) => l.trim()) || '';
    return first.length > max ? first.slice(0, max) + '…' : first;
};
