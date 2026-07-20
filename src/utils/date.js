// 날짜 관련 순수 함수 모음.
// 이 앱은 모든 날짜 키를 로컬 시간 기준 'YYYY-MM-DD' 문자열로 다루고,
// 한 주의 시작을 월요일로 본다.

/** 로컬 시간 기준 날짜 포맷터 (YYYY-MM-DD) */
export const formatDateLocal = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** 'YYYY-MM-DD' -> 'MM.DD' */
export const formatMonthDay = (dateStr) => {
    if (!dateStr) return '';
    return dateStr.substring(5).replace('-', '.');
};

/** Date -> 'yy.mm.dd' (주차 라벨 표기용) */
export const formatYyMmDd = (d) => {
    const yy = d.getFullYear().toString().slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}.${mm}.${dd}`;
};

/** 해당 날짜가 속한 주의 월요일 00:00 */
export const getStartOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

/** 최초 등록일 기준 4주 로테이션의 몇 주차인지 (1~4). 월요일 기준. */
export const getRotationWeek = (firstDate, targetDate) => {
    if (!firstDate) return 1;
    // [FIX] 주차 계산을 월요일 기준(달력 주차)으로 고정
    const start = getStartOfWeek(new Date(firstDate));
    const current = new Date(targetDate);
    // 시간 성분 제거 (getStartOfWeek에서 이미 처리되지만, targetDate 안전장치)
    current.setHours(0, 0, 0, 0);

    const diffTime = current.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 1;
    return (Math.floor(diffDays / 7) % 4) + 1;
};

/** 기준일이 속한 주의 월~일 7개 Date */
export const getWeekDays = (baseDate) => {
    const start = getStartOfWeek(baseDate);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });
};

/** 기준일부터 12주치 주간 정보 (출석부 12주 보기용) */
export const get12Weeks = (baseDate) => {
    const start = new Date(baseDate);
    return Array.from({ length: 12 }, (_, i) => {
        const s = new Date(start);
        s.setDate(start.getDate() + i * 7);
        const e = new Date(s);
        e.setDate(s.getDate() + 6);

        return {
            weekNum: i + 1,
            start: s,
            end: e,
            startStr: formatDateLocal(s),
            endStr: formatDateLocal(e),
            label: formatYyMmDd(s),
            rangeLabel: `${formatYyMmDd(s)} ~ ${formatYyMmDd(e)}`,
        };
    });
};

/** 해당 월에 걸쳐 있는 주들의 {start, end} 목록 */
export const getWeeksInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const weeks = [];
    let current = new Date(firstDay);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
    while (current <= lastDay || (current.getMonth() === month && current.getDate() <= lastDay.getDate())) {
        const start = new Date(current);
        const end = new Date(current);
        end.setDate(end.getDate() + 6);
        const startInMonth = start.getMonth() === month;
        const endInMonth = end.getMonth() === month;
        if (startInMonth || endInMonth) {
            weeks.push({ start, end });
        }
        current.setDate(current.getDate() + 7);
        if (weeks.length > 6) break;
    }
    return weeks;
};

/** getWeeksInMonth 결과를 get12Weeks 와 같은 형태로 (출석부 월별 보기용) */
export const getMonthWeeksForView = (date) => {
    const weeks = getWeeksInMonth(date);
    return weeks.map((w, i) => ({
        weekNum: i + 1,
        start: w.start,
        end: w.end,
        startStr: formatDateLocal(w.start),
        endStr: formatDateLocal(w.end),
        label: formatYyMmDd(w.start),
        rangeLabel: `${formatYyMmDd(w.start)} ~ ${formatYyMmDd(w.end)}`,
    }));
};

/** 해당 날짜로부터 오늘까지 며칠 지났는지 */
export const getDaysPassed = (d) => {
    if (!d) return 0;
    return Math.floor((new Date() - new Date(d)) / (1000 * 60 * 60 * 24));
};

/**
 * 월 이동. 원본 Date 를 변경하지 않고 새 Date 를 돌려준다.
 *
 * 날짜를 1일로 맞춘 뒤 월을 옮긴다. 그냥 setMonth 를 쓰면 1월 31일에서
 * 다음 달로 갈 때 2월 31일 -> 3월 3일이 되어 한 달을 건너뛴다.
 * 이 값은 '몇 년 몇 월'로만 쓰이므로 1일 고정이 안전하다.
 */
export const shiftMonth = (date, delta) => {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    d.setHours(0, 0, 0, 0);
    return d;
};
