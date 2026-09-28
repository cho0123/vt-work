// 고정 스케쥴의 반복 규칙 판정.
//
// 고정 스케쥴은 문서 한 개를 매 자리에 "펼쳐서" 보여주는 구조라, 어떤 날짜에
// 그 스케쥴이 실제로 걸리는지를 한 곳에서 판정한다. 화면 표시(ScheduleTab)와
// 등록 시 사용량 계산(generateAvailableStudents) 두 곳이 이 함수를 함께 쓴다.
//
// ── 반복 방식(recurrence) ────────────────────────────────────
//   'weekly'      매주 같은 요일 (기존 방식. 필드가 없는 옛 문서도 이걸로 취급)
//   'monthlyDate' 매월 dayOfMonth 일. 그 날짜가 없는 달이면 그 달 말일로 당김
//                 (예: 31일 지정 → 30일까지인 달은 30일, 2월은 28/29일)
//   'monthlyLast' 매월 말일
//   'yearlyDate'  매년 monthOfYear 월 dayOfMonth 일 (예: 생일). 2월 29일 지정은
//                 평년이면 그 달 말일(28일)로 당김
//
// 'monthlyDate' 의 말일 당김 규칙 때문에 "매월 31일"은 결과적으로 "매월 말일"과
// 같아지지만, 의도를 분명히 하려고 옵션은 따로 둔다.

// 해당 날짜가 속한 달의 마지막 날(28~31)을 구한다.
export function daysInMonth(dateObj) {
    return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
}

// 토·일이면 다음 월요일로 민 날짜. 평일은 그대로.
// 카드결제·자동이체 같은 금융업무는 지정일이 주말이면 실제로는 다음 영업일에 처리된다.
function shiftWeekendToMonday(dateObj) {
    const day = dateObj.getDay();
    if (day !== 0 && day !== 6) return dateObj;
    const shifted = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    shifted.setDate(shifted.getDate() + (day === 6 ? 2 : 1));
    return shifted;
}

// 그 달에 이 고정 스케쥴이 걸리는 '원래 지정일'. 안 걸리는 달이면 null.
// (주말 밀기를 계산하려면 "이 날짜가 지정일인가"가 아니라 "그 달의 지정일이 언제인가"가 필요하다)
function targetDateInMonth(s, year, monthIndex) {
    const rec = s.recurrence || 'weekly';
    const probe = new Date(year, monthIndex, 1);
    const last = daysInMonth(probe);

    if (rec === 'monthlyLast') return new Date(year, monthIndex, last);
    if (rec === 'monthlyDate') return new Date(year, monthIndex, Math.min(Number(s.dayOfMonth), last));
    if (rec === 'yearlyDate') {
        if (Number(s.monthOfYear) !== monthIndex + 1) return null;
        return new Date(year, monthIndex, Math.min(Number(s.dayOfMonth), last));
    }
    return null; // weekly 는 주말 밀기 대상이 아니다
}

const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// 고정 스케쥴 s 가 dateObj(Date) 날짜에 걸리는가?
// (시간대/gridType/취소/기간 범위는 각 호출부가 따로 확인하고, 여기서는 '반복 규칙'만 본다)
export function fixedScheduleOccursOn(s, dateObj) {
    const rec = s.recurrence || 'weekly';

    // 주말 밀기(shiftWeekend)를 켠 스케쥴은 지정일이 토·일이면 다음 월요일에 걸린다.
    // 말일이 토요일이면 다음 달로 넘어가므로, 이번 달과 지난 달의 지정일을 각각 밀어보고 맞춰본다.
    // 필드가 없는 기존 스케쥴은 이 분기를 타지 않아 동작이 그대로다.
    if (s.shiftWeekend && rec !== 'weekly') {
        return [0, -1].some((offset) => {
            const target = targetDateInMonth(s, dateObj.getFullYear(), dateObj.getMonth() + offset);
            return target ? sameDay(shiftWeekendToMonday(target), dateObj) : false;
        });
    }

    if (rec === 'monthlyLast') {
        return dateObj.getDate() === daysInMonth(dateObj);
    }

    if (rec === 'monthlyDate') {
        // 지정일이 그 달에 없으면 말일로 당긴다.
        const target = Math.min(Number(s.dayOfMonth), daysInMonth(dateObj));
        return dateObj.getDate() === target;
    }

    if (rec === 'yearlyDate') {
        // 지정한 '월'이 아니면 걸리지 않는다. (monthOfYear 는 1~12)
        if (Number(s.monthOfYear) !== dateObj.getMonth() + 1) return false;
        // 2월 29일 지정을 평년에 볼 때처럼, 그 달에 없는 날짜는 말일로 당긴다.
        const target = Math.min(Number(s.dayOfMonth), daysInMonth(dateObj));
        return dateObj.getDate() === target;
    }

    // weekly (기본값): 옛 문서는 recurrence 필드가 없으므로 여기로 온다.
    return s.dayOfWeek === dateObj.getDay();
}

// 이 날짜에 걸린 고정 스케쥴의 '원래 지정일'. 주말 밀기로 옮겨온 것이면 밀리기 전 날짜를 준다.
// 같은 날·같은 시간에 여러 개가 몰렸을 때 누가 제자리를 갖는지 정하는 기준으로 쓴다
// (26일 토요일 것과 27일 일요일 것이 같은 월요일로 오면, 26일 것이 먼저).
// 그 날짜에 안 걸리면 null.
export function fixedOriginalDateOn(s, dateObj) {
    if (!fixedScheduleOccursOn(s, dateObj)) return null;
    const rec = s.recurrence || 'weekly';
    if (s.shiftWeekend && rec !== 'weekly') {
        for (const offset of [0, -1]) {
            const target = targetDateInMonth(s, dateObj.getFullYear(), dateObj.getMonth() + offset);
            if (target && sameDay(shiftWeekendToMonday(target), dateObj)) return target;
        }
    }
    return dateObj;
}
