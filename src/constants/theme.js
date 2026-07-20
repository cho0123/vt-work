// [VISUALIZATION] 로테이션 색상 정의 (M은 진하게, V는 연하게-투명도 60%)
// 로테이션 회차(0,1,2,...)를 이 배열 길이로 나눈 나머지로 색을 고른다.
//   v / m           : Tailwind 클래스 (보컬 / 마스터)
//   v_hex / m_hex   : 위 색의 실제 hex (그라디언트 조립용)
//   two_tone        : 30분·half 수업용 반반 그라디언트
//   two_tone_vocal  : 위와 같되 보컬용으로 투명도 60% 적용
export const ROTATION_COLORS = [
    {
        v: 'bg-blue-50 border-blue-200',
        m: 'bg-blue-200 border-blue-300',
        v_hex: '#eff6ff',
        m_hex: '#bfdbfe',
        two_tone: 'bg-[linear-gradient(135deg,#bfdbfe_50%,#eff6ff_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#bfdbfe99_50%,#eff6ff99_50%)]',
    },
    {
        v: 'bg-orange-50 border-orange-200',
        m: 'bg-orange-200 border-orange-300',
        v_hex: '#fff7ed',
        m_hex: '#fed7aa',
        two_tone: 'bg-[linear-gradient(135deg,#fed7aa_50%,#fff7ed_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#fed7aa99_50%,#fff7ed99_50%)]',
    },
    {
        v: 'bg-green-50 border-green-200',
        m: 'bg-green-200 border-green-300',
        v_hex: '#f0fdf4',
        m_hex: '#bbf7d0',
        two_tone: 'bg-[linear-gradient(135deg,#bbf7d0_50%,#f0fdf4_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#bbf7d099_50%,#f0fdf499_50%)]',
    },
    {
        v: 'bg-purple-50 border-purple-200',
        m: 'bg-purple-200 border-purple-300',
        v_hex: '#faf5ff',
        m_hex: '#e9d5ff',
        two_tone: 'bg-[linear-gradient(135deg,#e9d5ff_50%,#faf5ff_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#e9d5ff99_50%,#faf5ff99_50%)]',
    },
    {
        v: 'bg-pink-50 border-pink-200',
        m: 'bg-pink-200 border-pink-300',
        v_hex: '#fdf2f8',
        m_hex: '#fbcfe8',
        two_tone: 'bg-[linear-gradient(135deg,#fbcfe8_50%,#fdf2f8_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#fbcfe899_50%,#fdf2f899_50%)]',
    },
    {
        v: 'bg-yellow-50 border-yellow-200',
        m: 'bg-yellow-200 border-yellow-300',
        v_hex: '#fefce8',
        m_hex: '#fef08a',
        two_tone: 'bg-[linear-gradient(135deg,#fef08a_50%,#fefce8_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#fef08a99_50%,#fefce899_50%)]',
    },
    {
        v: 'bg-teal-50 border-teal-200',
        m: 'bg-teal-200 border-teal-300',
        v_hex: '#f0fdfa',
        m_hex: '#99f6e4',
        two_tone: 'bg-[linear-gradient(135deg,#99f6e4_50%,#f0fdfa_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#99f6e499_50%,#f0fdfa99_50%)]',
    },
    {
        v: 'bg-indigo-50 border-indigo-200',
        m: 'bg-indigo-200 border-indigo-300',
        v_hex: '#eef2ff',
        m_hex: '#c7d2fe',
        two_tone: 'bg-[linear-gradient(135deg,#c7d2fe_50%,#eef2ff_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#c7d2fe99_50%,#eef2ff99_50%)]',
    },
    {
        v: 'bg-red-50 border-red-200',
        m: 'bg-red-200 border-red-300',
        v_hex: '#fef2f2',
        m_hex: '#fecaca',
        two_tone: 'bg-[linear-gradient(135deg,#fecaca_50%,#fef2f2_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#fecaca99_50%,#fef2f299_50%)]',
    },
    {
        v: 'bg-lime-50 border-lime-200',
        m: 'bg-lime-200 border-lime-300',
        v_hex: '#f7fee7',
        m_hex: '#d9f99d',
        two_tone: 'bg-[linear-gradient(135deg,#d9f99d_50%,#f7fee7_50%)]',
        two_tone_vocal: 'bg-[linear-gradient(135deg,#d9f99d99_50%,#f7fee799_50%)]',
    },
];

/** 스케줄 그리드/히스토리에서 '미처리·회색' 상태에 쓰는 Split(반반) 배경 */
export const GRAY_SPLIT_BG = 'bg-[linear-gradient(135deg,#e5e7eb_50%,#f9fafb_50%)]';
