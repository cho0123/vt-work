// 아티스트 몫 → 실제로 통장에 넣는 금액. 순수 함수만.
//
// 3단계(artistSettlement.js)가 구한 '아티스트 몫' 은 여기서 건드리지 않는다.
// 이 파일은 그 뒤의 지급 단계(세금)만 다룬다.
//
//   withholding(원천징수) — 개인·면세 인적용역
//     소득세     = 몫 × 3%          (10원 미만 절사)
//     지방소득세 = 소득세 × 10%      (10원 미만 절사)
//     실지급액   = 몫 − 소득세 − 지방소득세
//
//   invoice(세금계산서) — 과세사업자
//     아티스트 몫 자체가 '부가세 포함 금액' 이다. 몫 위에 부가세를 더하지 않는다.
//     지급액   = 몫
//     공급가   = 몫 ÷ 1.1            (원 단위 반올림)
//     부가세   = 몫 − 공급가          (나머지로 잡아 합이 항상 몫과 맞는다)
//     → 정산서에 '세금계산서 수취 필요' 를 적는다.
//
// 세율은 전부 아래 상수 한 곳에서 바꾼다.
import { toWon } from './artistSettlement.js';

export const WITHHOLDING_RATE = 0.03;   // 소득세율 (인적용역 3%)
export const LOCAL_TAX_RATE = 0.10;     // 지방소득세 = 소득세의 10%
export const VAT_RATE = 0.10;           // 부가세율

export const TAX_TYPES = [
    { key: 'withholding', label: '원천징수 (개인)' },
    { key: 'invoice', label: '세금계산서 (사업자)' },
];

export const TAX_TYPE_LABEL = {
    withholding: '원천징수 (개인)',
    invoice: '세금계산서 (사업자)',
};

// 세무 유형이 없는 옛 아티스트 문서는 원천징수로 본다(데이터는 고치지 않는다).
export const taxTypeOf = (artist) => (artist && artist.taxType) || 'withholding';

// 세액은 10원 미만을 버린다.
export const floor10 = (n) => Math.floor((Number(n) || 0) / 10) * 10;

/**
 * @param artistShare 3단계에서 구한 아티스트 몫(원)
 * @param taxType     'withholding' | 'invoice'
 * @returns {{
 *   taxType, artistShare, supplyAmount,
 *   incomeTax, localTax, totalTax, vat,
 *   netPayout, needsInvoice
 * }}
 */
export const computePayout = ({ artistShare, taxType }) => {
    const share = Math.max(0, Number(artistShare) || 0);
    const type = taxType === 'invoice' ? 'invoice' : 'withholding';

    if (share === 0) {
        return {
            taxType: type, artistShare: 0, supplyAmount: 0,
            incomeTax: 0, localTax: 0, totalTax: 0, vat: 0,
            netPayout: 0, needsInvoice: type === 'invoice',
        };
    }

    if (type === 'invoice') {
        // 몫이 부가세 포함 금액이므로 거꾸로 공급가를 뽑는다.
        const supplyAmount = toWon(share / (1 + VAT_RATE));
        return {
            taxType: type, artistShare: share, supplyAmount,
            incomeTax: 0, localTax: 0, totalTax: 0,
            vat: share - supplyAmount,
            netPayout: share, needsInvoice: true,
        };
    }

    const incomeTax = floor10(share * WITHHOLDING_RATE);
    const localTax = floor10(incomeTax * LOCAL_TAX_RATE);
    return {
        taxType: type, artistShare: share, supplyAmount: share,
        incomeTax, localTax, totalTax: incomeTax + localTax, vat: 0,
        netPayout: share - incomeTax - localTax, needsInvoice: false,
    };
};

// 확정 문서에 함께 저장할 스냅샷. 나중에 세무 유형을 바꿔도 확정분은 이 값을 쓴다.
export const payoutSnapshot = (payout) => ({
    taxType: payout.taxType,
    supplyAmount: payout.supplyAmount,   // 세금계산서 공급가(몫 ÷ 1.1). 몫과 다르므로 꼭 저장한다
    incomeTax: payout.incomeTax,
    localTax: payout.localTax,
    vat: payout.vat,
    netPayout: payout.netPayout,
});

// 확정 문서에서 지급 정보를 읽는다.
// 4단계 이전에 확정된 건에는 taxType 이 없다 — 다시 계산하지 않고 '없음' 으로 알린다.
export const payoutOfSettlement = (s) => {
    if (!s || !s.taxType) return null;
    const share = Number(s.artistShare || 0);
    return {
        taxType: s.taxType,
        artistShare: share,
        // supplyAmount 를 안 담고 확정한 건(계산 방식 변경 전)은 몫 − 부가세 로 되돌린다.
        supplyAmount: s.supplyAmount === undefined || s.supplyAmount === null
            ? share - Number(s.vat || 0)
            : Number(s.supplyAmount),
        incomeTax: Number(s.incomeTax || 0),
        localTax: Number(s.localTax || 0),
        totalTax: Number(s.incomeTax || 0) + Number(s.localTax || 0),
        vat: Number(s.vat || 0),
        netPayout: Number(s.netPayout || 0),
        needsInvoice: s.taxType === 'invoice',
    };
};
