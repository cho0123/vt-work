// 요일별 '일괄완료' 대상 판정 — 한 벌만 두고 화면·처리 양쪽이 같이 쓴다.
//
// 버튼 비활성화 조건(ScheduleTab)과 실제 완료 처리 대상(App 의 handleBulkCompleteDay)이
// 어긋나면, 눌러지는데 "완료할 게 없습니다"가 뜨거나 그 반대가 된다. 그래서 여기 한 곳에서만 정한다.
//
// 대상에서 빼는 것:
//   - 이미 처리된 수업(완료·결석·보강)  → status 가 있으면 제외
//   - 개인일정                          → studentId 가 없으면 제외
//   - 예정(유령) 칸                     → 아직 실제 문서가 아님
//   - 고정 스케쥴                       → 원본 문서를 건드릴 위험이 있어 제외
export function bulkCompleteTargets(schedules, dateStr) {
    return schedules.filter((s) => s.date === dateStr && s.studentId && !s.status && !s.isGhost && !s.isFixed);
}
