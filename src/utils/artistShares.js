// 보티즈 곡(acc_projects)에 붙는 아티스트 연결의 규칙.
//
// 저장 형태: artists: [{ artistId, type, ... }]
//
//   type 'member'         소속. share(지분 %) 로 곡 수익·지출을 나눈다.
//                         곡 수익을 넣을 수익항목, 지출을 넣을 지출항목을 하나씩 고른다.
//                         share 가 null 이면 '균등' — 그 곡의 소속 인원수로 나눈다.
//   type 'collab_recoup'  콜라보. 제작비(recoupAmount)를 회수한 뒤부터
//                         sharePercent 만큼 수익을 공유한다. 지출은 안 본다.
//                         startMonth 부터 periodMonths 개월까지만 대상.
//   type 'collab_none'    연결 표시만. 정산하지 않는다.
//
// 지분 합 100 검사는 소속(member)끼리만 한다.
// 이 값들은 곡 문서에 필드를 더하기만 한다. 곡별 수입·지출 계산에는 쓰이지 않는다.

export const LINK_TYPES = [
    { key: 'member', label: '소속' },
    { key: 'collab_recoup', label: '콜라보 (제작비 회수 후 공유)' },
    { key: 'collab_none', label: '콜라보 (공유 없음)' },
];

export const linkTypeLabel = (t) => {
    const found = LINK_TYPES.find((x) => x.key === (t || 'member'));
    return found ? found.label : t;
};

// 2단계 데이터에는 type 이 없다 — 그때는 전부 소속이었다.
export const typeOf = (v) => (v && v.type) || 'member';

// 콜라보 공유 기간 기본값. 화면·검사·저장이 같은 값을 써야 한다
// (화면에만 36 을 보여주고 상태는 비어 있으면 저장이 막힌다 — 실제로 겪었다).
export const DEFAULT_PERIOD_MONTHS = 36;

// 빈 문자열/없음이면 '안 넣음'으로 본다.
const filled = (v) => !(v === '' || v === null || v === undefined);
export const isShareFilled = filled;

// 저장 직전 형태 정리. 종류에 맞는 필드만 남긴다.
export const normalizeShares = (value) =>
    (value || []).map((v) => {
        const type = typeOf(v);
        if (type === 'collab_recoup') {
            return {
                artistId: v.artistId,
                type,
                recoupAmount: Number(v.recoupAmount || 0),
                sharePercent: Number(v.sharePercent || 0),
                startMonth: v.startMonth || '',
                periodMonths: Number(v.periodMonths || DEFAULT_PERIOD_MONTHS),
            };
        }
        if (type === 'collab_none') {
            return { artistId: v.artistId, type };
        }
        return {
            artistId: v.artistId,
            type: 'member',
            share: filled(v.share) ? Number(v.share) : null,
            incomeCategoryId: v.incomeCategoryId || '',
            expenseCategoryId: v.expenseCategoryId || '',
        };
    });

export const validateShares = (value) => {
    const list = value || [];
    if (list.length === 0) return '';

    const members = list.filter((v) => typeOf(v) === 'member');
    if (members.length > 0) {
        const withShare = members.filter((v) => filled(v.share));
        if (withShare.length > 0) {
            if (withShare.length !== members.length)
                return '소속 아티스트의 지분을 일부만 입력했습니다. 전부 비우면 균등 분배, 입력하려면 모두 입력해 주세요.';
            const sum = withShare.reduce((a, c) => a + Number(c.share), 0);
            if (sum !== 100) return '소속 아티스트 지분 합이 100% 가 아닙니다. 지금 ' + sum + '% 입니다.';
        }
    }

    for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (typeOf(v) !== 'collab_recoup') continue;
        if (!v.startMonth) return '콜라보 곡은 공유 시작월(유통사 첫 정산월)을 넣어야 합니다.';
        const sp = Number(v.sharePercent || 0);
        if (!(sp > 0 && sp <= 100)) return '콜라보 공유 비율은 1~100% 사이여야 합니다. 지금 ' + sp + '% 입니다.';
        if (Number(v.periodMonths || DEFAULT_PERIOD_MONTHS) <= 0) return '콜라보 공유 기간(개월)은 1 이상이어야 합니다.';
        if (Number(v.recoupAmount || 0) < 0) return '콜라보 제작비는 0 이상이어야 합니다.';
    }
    return '';
};

// 곡 카드에 붙일 아티스트 이름(최대 2명 + 나머지 개수).
export const artistNamesOf = (project, artistList) => {
    const list = Array.isArray(project.artists) ? project.artists : [];
    if (list.length === 0) return '';
    const names = list.map((a) => {
        const found = (artistList || []).find((x) => x.id === a.artistId);
        const nm = found ? found.stageName || '(이름없음)' : '(삭제됨)';
        return typeOf(a) === 'member' ? nm : nm + '(콜라보)';
    });
    if (names.length <= 2) return names.join(', ');
    return names.slice(0, 2).join(', ') + ' 외 ' + (names.length - 2);
};
