/**
 * 지출 카테고리별 기본 금액.
 * 지출 등록 폼에서 카테고리를 고르면 이 값이 자동으로 채워진다.
 * (임대료는 최근 등록된 임대료 금액으로 덮어써지므로 여기 값은 초기 기준선)
 */
export const expenseDefaults = {
    임대료: 5005000,
    임금: 0,
    전기료: 0,
    통신료: 55000,
    세콤: 60500,
    단말기: 5500,
    정수기: 10000,
    기타: 0,
};

/** 지출 카테고리 목록 (등록 폼 셀렉트 순서) */
export const EXPENSE_CATEGORIES = Object.keys(expenseDefaults);
