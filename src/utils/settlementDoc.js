// 월정산 레슨 정산서(회사 청구용) — 워드로 바로 열리는 .doc 파일로 내려받는다.
//
// Firebase Storage(유료) 없이, 백업(backup.js)과 같은 Blob 다운로드 방식.
// .doc 은 HTML 기반이라 별도 라이브러리 없이 워드에서 열려 편집·인쇄된다.
// 서식은 학원에서 쓰던 '보이스튜닝 레슨 정산서'(황민현 샘플)를 따르되 조금 더 정돈했다.

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 'YYYY-MM-DD' → '6월 4일(수)'
function fmtLessonDate(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAYS[d.getDay()]})`;
}

// 'YYYY-MM-DD' → 'YYYY.MM.DD'
const dot = (dateStr) => (dateStr || '').replace(/-/g, '.');

const esc = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

/**
 * 정산서 .doc 다운로드.
 * @param {Object} p
 *   studentName  아티스트/학생명
 *   clientName   거래처(회사)명
 *   clientBizNo  사업자등록번호
 *   periodStart  'YYYY-MM-DD' (그 달 1일)
 *   periodEnd    'YYYY-MM-DD' (그 달 말일)
 *   monthLabel   '2026-06' (파일명용)
 *   lessons      [{ date:'YYYY-MM-DD', type:'마스터'|'보컬'|'보컬(30)' }]
 *   breakdown    [{ label, unit, count, amount }]  단가별 내역
 *   total        총 요청금액(숫자)
 *   issueDate    'YYYY-MM-DD' 발행일
 */
export function downloadSettlementDoc(p) {
    const lessonRows = (p.lessons || [])
        .map(
            (l, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="text-align:center;">${esc(fmtLessonDate(l.date))}</td>
        <td style="text-align:center;">${esc(l.type)}</td>
      </tr>`
        )
        .join('');

    const breakdownRows = (p.breakdown || [])
        .map(
            (b) => `
      <tr>
        <td style="text-align:center;">${esc(b.label)}</td>
        <td style="text-align:right;">${won(b.unit)}원</td>
        <td style="text-align:center;">${b.count}회</td>
        <td style="text-align:right;">${won(b.amount)}원</td>
      </tr>`
        )
        .join('');

    const totalCount = (p.lessons || []).length;

    // 워드가 한글을 깨지 않도록 charset=utf-8 + 본문은 UTF-8 Blob.
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>보이스튜닝 레슨 정산서</title>
<style>
  body { font-family: '맑은 고딕','Malgun Gothic',sans-serif; color:#222; font-size:11pt; }
  h1 { text-align:center; font-size:20pt; letter-spacing:6px; margin:0 0 6px; }
  .sub { text-align:center; color:#555; font-size:14pt; font-weight:bold; letter-spacing:2px; margin-bottom:24px; }
  table { border-collapse:collapse; width:100%; }
  .info td { padding:6px 8px; font-size:11pt; border:none; }
  .info .k { color:#666; width:110px; font-weight:bold; }
  .grid th, .grid td { border:1px solid #bbb; padding:7px 8px; font-size:10.5pt; }
  .grid th { background:#f2f2f2; }
  .total { margin-top:18px; text-align:right; font-size:14pt; font-weight:bold; }
  .total .amt { font-size:18pt; color:#1a56db; }
  .foot { margin-top:36px; text-align:center; color:#333; font-size:13pt; font-weight:bold; }
  h3 { font-size:11pt; margin:22px 0 6px; border-left:4px solid #1a56db; padding-left:8px; }
</style>
</head>
<body>
  <h1>레슨 정산서</h1>
  <div class="sub">보이스튜닝</div>

  <table class="info">
    <tr><td class="k">거래처</td><td>${esc(p.clientName) || '-'}${p.clientBizNo ? ` (${esc(p.clientBizNo)})` : ''}</td></tr>
    <tr><td class="k">아티스트</td><td>${esc(p.studentName)}</td></tr>
    <tr><td class="k">레슨기간</td><td>${dot(p.periodStart)} ~ ${dot(p.periodEnd)}</td></tr>
    <tr><td class="k">총 레슨횟수</td><td>${totalCount}회</td></tr>
  </table>

  <h3>레슨 내역</h3>
  <table class="grid">
    <thead><tr><th style="width:60px;">No</th><th>레슨일</th><th style="width:120px;">수업</th></tr></thead>
    <tbody>${lessonRows}</tbody>
  </table>

  <h3>요청 금액</h3>
  <table class="grid">
    <thead><tr><th>구분</th><th style="width:130px;">단가</th><th style="width:90px;">횟수</th><th style="width:140px;">금액</th></tr></thead>
    <tbody>${breakdownRows}</tbody>
  </table>

  <div class="total">요청금액 : <span class="amt">${won(p.total)}원</span></div>

  <div class="foot">발행일 : ${dot(p.issueDate)}</div>
</body>
</html>`;

    const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `보이스튜닝 레슨 정산서_${p.studentName} (${p.monthLabel}).doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
