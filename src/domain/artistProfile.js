// 아티스트의 '구분'(소속/콜라보)과 '지급처'(본인/소속사). 순수 함수만.
//
// 몫·세액 계산은 건드리지 않는다. 이 파일이 정하는 것은 두 가지다.
//   1) 화면에서 어떤 칸을 보여줄지 (구분)
//   2) 돈을 누구에게·어떤 세무 유형으로 주는지 (지급처)
//
// 필드는 더하기만 한다 — 옛 문서에는 category·payee 가 없다.
//   category 없음 → 'member'(소속)   payee 없음 → 'self'(본인)
// 그래서 지금까지 등록한 아티스트는 아무것도 고치지 않아도 전과 똑같이 동작한다.
//
// 지급처가 소속사면 세무 유형은 세금계산서로 고정한다. 소속사가 받는 돈은
// 사업자 간 거래라 원천징수 대상이 아니다. 단, 아티스트 문서에 저장된
// taxType 값 자체는 덮지 않는다(지급처를 본인으로 되돌리면 그대로 살아나야 한다).
import { taxTypeOf } from './artistPayout.js';

export const ARTIST_CATEGORIES = [
    { key: 'member', label: '소속' },
    { key: 'collab', label: '콜라보' },
];

export const CATEGORY_LABEL = { member: '소속', collab: '콜라보' };

export const PAYEES = [
    { key: 'self', label: '본인' },
    { key: 'agency', label: '소속사' },
];

export const PAYEE_LABEL = { self: '본인', agency: '소속사' };

// 구분이 없는 옛 문서는 소속으로 본다(데이터는 고치지 않는다).
export const categoryOf = (artist) => ((artist && artist.category) === 'collab' ? 'collab' : 'member');
export const isCollab = (artist) => categoryOf(artist) === 'collab';

// 지급처가 없는 옛 문서는 본인으로 본다.
export const payeeOf = (artist) => ((artist && artist.payee) === 'agency' ? 'agency' : 'self');
export const paysAgency = (artist) => payeeOf(artist) === 'agency';

// 실제 계산에 쓰는 세무 유형. 소속사 지급이면 세금계산서로 고정한다.
export const effectiveTaxType = (artist) => (paysAgency(artist) ? 'invoice' : taxTypeOf(artist));

// 계좌는 뒤 4자리만 남긴다. 저장된 값 자체는 건드리지 않는다.
export const maskTail4 = (v) => {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    return s.length <= 4 ? s : '****' + s.slice(-4);
};

/**
 * 정산서·지급 화면에 쓸 '돈 받는 쪽' 정보.
 * 지급처가 소속사면 소속사 이름·사업자번호·계좌를, 본인이면 아티스트 것을 쓴다.
 * 계좌는 마스킹한 값만 담는다(전체 번호는 정보수정 화면에서만 본다).
 */
export const payeeInfo = (artist, priv) => {
    const p = priv || {};
    const a = artist || {};
    if (paysAgency(a)) {
        return {
            payee: 'agency',
            payeeLabel: PAYEE_LABEL.agency,
            name: (a.agencyName || '').trim(),
            bizNo: (p.agencyBizNo || '').trim(),
            bank: (p.agencyBank || '').trim(),
            accountMasked: maskTail4(p.agencyAccount),
            holder: (p.agencyHolder || '').trim(),
        };
    }
    return {
        payee: 'self',
        payeeLabel: PAYEE_LABEL.self,
        name: (a.stageName || '').trim(),
        bizNo: (p.bizNo || '').trim(),
        bank: (p.bank || '').trim(),
        accountMasked: maskTail4(p.accountNumber),
        holder: (p.accountHolder || '').trim(),
    };
};

// 정산 확정 문서에 함께 저장한다. 확정 뒤 소속사 정보를 바꿔도 확정분은 이 값을 쓴다.
export const payeeSnapshot = (artist, priv) => {
    const info = payeeInfo(artist, priv);
    return {
        payee: info.payee,
        payeeName: info.name,
        payeeBizNo: info.bizNo,
        payeeBank: info.bank,
        payeeAccountMasked: info.accountMasked,
        payeeHolder: info.holder,
    };
};

// 확정 문서에서 지급처 정보를 읽는다.
// 이 기능 이전에 확정된 건에는 payee 가 없다 — 그때는 지금 정보로 보여준다(null 반환).
export const payeeOfSettlement = (s) => {
    if (!s || !s.payee) return null;
    return {
        payee: s.payee,
        payeeLabel: PAYEE_LABEL[s.payee] || s.payee,
        name: s.payeeName || '',
        bizNo: s.payeeBizNo || '',
        bank: s.payeeBank || '',
        accountMasked: s.payeeAccountMasked || '',
        holder: s.payeeHolder || '',
    };
};
