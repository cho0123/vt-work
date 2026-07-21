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
//
// 'monthlyDate' 의 말일 당김 규칙 때문에 "매월 31일"은 결과적으로 "매월 말일"과
// 같아지지만, 의도를 분명히 하려고 옵션은 따로 둔다.

// 해당 날짜가 속한 달의 마지막 날(28~31)을 구한다.
export function daysInMonth(dateObj) {
    return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
}

// 고정 스케쥴 s 가 dateObj(Date) 날짜에 걸리는가?
// (시간대/gridType/취소/기간 범위는 각 호출부가 따로 확인하고, 여기서는 '반복 규칙'만 본다)
export function fixedScheduleOccursOn(s, dateObj) {
    const rec = s.recurrence || 'weekly';

    if (rec === 'monthlyLast') {
        return dateObj.getDate() === daysInMonth(dateObj);
    }

    if (rec === 'monthlyDate') {
        // 지정일이 그 달에 없으면 말일로 당긴다.
        const target = Math.min(Number(s.dayOfMonth), daysInMonth(dateObj));
        return dateObj.getDate() === target;
    }

    // weekly (기본값): 옛 문서는 recurrence 필드가 없으므로 여기로 온다.
    return s.dayOfWeek === dateObj.getDay();
}
