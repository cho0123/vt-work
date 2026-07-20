// 금액 계산.
//
// ── 단가 규칙 ────────────────────────────────────────────────
//   마스터            정가
//   보컬 60분         정가
//   보컬 30분('30')   반값   ← 독립된 30분 수업
//   보컬 half         반값   ← 60분을 둘로 쪼갠 것. 항상 2개가 짝을 이뤄
//                            1회 수업이 되므로, 반값 2개 = 정가 1회가 된다.
//
// 주의: 로테이션 가중치와 단가 배수는 규칙이 다르다.
//   로테이션에서 보컬 30분은 '온전한 1회'(가중치 1.0)로 세지만,
//   금액은 반값이다. half 만 양쪽 모두 0.5 다.
//   (domain/rotation.js 상단 표 참고)

/** 보컬 수업 종류에 따른 단가 배수. vocalType 이 있을 때만 쓴다. */
export const vocalRateFactor = (vocalType) => (vocalType === '30' || vocalType === 'half' ? 0.5 : 1);

/** 학생의 4주 계획이 30분 위주인지. vocalType 이 없는 옛 수업의 단가를 추정할 때 쓴다. */
export const planIsVocal30 = (student) => {
    let planV = 0,
        planV30 = 0;
    (student?.schedule || []).forEach((w) => {
        planV += Number(w.vocal || 0);
        planV30 += Number(w.vocal30 || 0);
    });
    return planV30 > planV;
};

/**
 * 보컬 수업 한 건의 단가 배수를 정한다.
 *
 * 수업 문서에 vocalType 이 적혀 있으면 그걸 따르고, 없으면 학생의 계획으로 추정한다.
 *
 * 추정이 필요한 이유: vocalType 을 저장하기 시작한 건 나중이라, 그 전에
 * 만들어진 보컬 수업에는 종류가 없다. 실제로 한 학생은 보컬 63건 중 56건에
 * 종류가 없다. 이런 문서를 60분으로 간주하면 30분 학생에게 두 배로 청구된다.
 * (예전 코드가 학생 계획만 보고 단가를 정했던 것도 이 때문이다)
 */
export const vocalRateFactorFor = (lesson, student) => {
    const t = lesson?.vocalType;
    if (t) return vocalRateFactor(t);
    return planIsVocal30(student) ? 0.5 : 1;
};

/**
 * 학생의 4주 로테이션 '계획'과 단가로 4주치 예상 금액을 계산한다.
 * (학생관리 화면의 예상 금액, 신규 등록 시 미수금 금액)
 */
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
    const rateM = Number(s.rates?.master || 0);
    const rateV = Number(s.rates?.vocal || 0);
    // 계획에는 half 개념이 없다. vocal=60분, vocal30=30분.
    return tm * rateM + tv * rateV + tv30 * rateV * vocalRateFactor('30');
};

/**
 * 실제로 진행된 수업 목록으로 청구 금액을 계산한다. (월정산 청구)
 *
 * 예전에는 학생의 '계획'만 보고 (planV30 > planV) 단가를 하나 정한 뒤
 * 그 달의 모든 보컬 수업에 똑같이 적용했다. 그래서 한 달에 60분 수업과
 * 30분 수업이 섞이면 어느 쪽이든 금액이 틀어졌다.
 * 이제는 수업마다 자기 종류대로 단가를 매기되, 종류가 없는 옛 수업은
 * 예전처럼 학생 계획으로 추정한다. (vocalRateFactorFor 참고)
 *
 * @param masterCount   그 달의 마스터 수업 횟수
 * @param vocalLessons  그 달의 보컬 수업 목록
 * @param student       단가(rates)와 계획(schedule)을 가진 학생 객체
 */
export const calculateBilledAmount = (masterCount, vocalLessons, student) => {
    const rateM = Number(student?.rates?.master || 0);
    const rateV = Number(student?.rates?.vocal || 0);
    const amountV = (vocalLessons || []).reduce((acc, s) => acc + rateV * vocalRateFactorFor(s, student), 0);
    return masterCount * rateM + amountV;
};

/** 숫자를 천단위 구분 문자열로. 빈 값은 '0'. */
export const formatCurrency = (val) => (val ? Number(val).toLocaleString() : '0');
