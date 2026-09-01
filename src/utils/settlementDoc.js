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
function buildSettlementHtml(p) {
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

    return html;
}

/** 파일명(확장자 제외). 워드·PDF 모두 같은 이름을 쓴다. */
const settlementFileName = (p) => `보이스튜닝 레슨 정산서_${p.studentName} (${p.monthLabel})`;

export function downloadSettlementDoc(p) {
    const html = buildSettlementHtml(p);

    const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settlementFileName(p)}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 정산서 PDF 저장 — 브라우저 인쇄 창을 띄운다(대상 선택에서 'PDF로 저장').
 *
 * .doc 은 확장자만 워드이고 내용은 HTML 이라, 받는 쪽 환경(최신 워드 보안설정,
 * 회사 PC, 한글/구글독스, 모바일, 메일 필터)에 따라 열리지 않는 일이 있었다.
 * PDF 는 어디서든 열리고 서식도 안 깨진다. 거래처는 정산서를 편집하지 않으므로
 * PDF 가 맞다고 판단. (워드 버튼은 그대로 남겨둠 — 필요할 때 쓸 수 있게)
 *
 * 라이브러리 없이 브라우저 인쇄를 쓰는 이유: PDF 생성 라이브러리는 한글 폰트를
 * 따로 넣어야 해서 번들이 크게 무거워진다. 인쇄 경로는 서식·한글이 그대로 나온다.
 *
 * 화면 전환 없이 처리하려고 보이지 않는 iframe 안에서 인쇄한다.
 * (window.open 은 팝업 차단에 걸리고, 현재 창 인쇄는 앱 화면을 건드린다)
 */
export function printSettlementPdf(p) {
    const html = buildSettlementHtml(p).replace(
        '</head>',
        // 인쇄 시 여백과 파일명(브라우저가 <title>을 기본 파일명으로 쓴다)
        `<style>@page { size: A4; margin: 15mm; }</style>
<title>${esc(settlementFileName(p))}</title></head>`
    );

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    // 저장 파일명은 브라우저가 '최상위 문서'의 제목에서 가져간다(iframe 안의 <title> 이 아님).
    // PDF 프린터 드라이버(한PDF 등)도 마찬가지라, 인쇄하는 동안만 탭 제목을 정산서 이름으로 바꾼다.
    const prevTitle = document.title;
    document.title = settlementFileName(p);

    let done = false;
    const cleanup = () => {
        if (done) return;
        done = true;
        document.title = prevTitle;
        // 인쇄 창이 닫힌 뒤에 지운다. 바로 지우면 인쇄가 취소되는 브라우저가 있다.
        setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
        try {
            const win = iframe.contentWindow;
            win.focus();
            win.onafterprint = cleanup;
            win.print();
            // onafterprint 를 안 주는 브라우저 대비 (이때는 시간으로 정리)
            setTimeout(cleanup, 60_000);
        } catch (e) {
            console.error('정산서 인쇄 실패:', e);
            alert('인쇄 창을 열지 못했습니다. 워드(.doc)로 내려받아 사용해 주세요.');
            cleanup();
        }
    };

    // srcdoc 은 같은 출처로 취급돼 contentWindow 접근이 막히지 않는다.
    iframe.srcdoc = html;
}
