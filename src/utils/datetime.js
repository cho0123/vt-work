// 날짜·시각 표시와 '최근인가' 판정. 순수 함수만.
//
// 원래 App.jsx 안에 있던 것을 그대로 옮겼다(내용 변경 없음).
// 백업 관련 화면이 App.jsx 밖(보티즈 탭)에도 생겨서 한 벌만 두려고 꺼냈다.

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** 화면에 보여줄 날짜/시각 (예: 7월 22일(수) 오후 06:40). 값이 없으면 null. */
export function formatWhen(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_LABELS[d.getDay()]}) ${time}`;
}

/** 하루(24시간) 안에 있었던 일인지. 백업을 또 할지 말지 판단하는 공통 기준. */
export function isWithin24h(value) {
    if (!value) return false;
    const d = value instanceof Date ? value : new Date(value);
    return !isNaN(d.getTime()) && Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}
