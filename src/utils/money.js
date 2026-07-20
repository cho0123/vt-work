// 금액 계산.
//
// 주의: 이 앱에는 보컬 30분(vocal30)의 단가 처리가 서로 다른 계산식이 여러 벌
// 존재한다. 여기 있는 것이 학생 등록/예상금액 기준이며, 정산·월정산 청구 쪽에
// 다른 규칙이 남아 있다. 통합은 도메인 로직 정리 단계에서 다룬다.

/** 학생의 4주 로테이션 설정과 단가로 4주치 예상 금액을 계산한다. */
export const calculateTotalAmount = (s) => {
    let tm = 0,
        tv = 0,
        tv30 = 0;
    if (s.schedule && Array.isArray(s.schedule))
        s.schedule.forEach((w) => {
            tm += Number(w.master || 0);
            tv += Number(w.vocal || 0);
            tv30 += Number(w.vocal30 || 0);
        });
    return (
        tm * Number(s.rates?.master || 0) + tv * Number(s.rates?.vocal || 0) + tv30 * (Number(s.rates?.vocal || 0) * 0.5)
    );
};

/** 숫자를 천단위 구분 문자열로. 빈 값은 '0'. */
export const formatCurrency = (val) => (val ? Number(val).toLocaleString() : '0');
