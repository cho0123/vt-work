// 학생 수강 내역서 — 결제·미결제 확인용 PDF.
//
// 용도가 "이 수업들에 대한 금액이 미납"을 학생과 같이 확인하는 것이라,
// 결제(payments)와 미결제(unpaidList)를 **재등록일 기준 한 줄기**로 합치고,
// 각 재등록일부터 다음 재등록일 전까지 진행된 수업을 같은 줄 오른쪽에 붙인다.
// 서로 다 아는 내용을 확인하는 문서라 한 사이클을 한 줄로 쓴다(공간 절약).
//
// 저장 방식은 정산서(settlementDoc.js)와 같다 — 안 보이는 iframe 에서 인쇄 창을 띄운다.
// (.doc 은 확장자만 워드라 받는 쪽에서 안 열리는 일이 있었다. PDF 는 어디서나 열린다)

const METHOD_LABEL = { card: '카드', transfer: '이체', cash: '현금', deposit: '누적금' };

/** 90만 / 52.5만 — 만원 단위로 안 떨어지면 원 단위로 쓴다. */
function money(n) {
    const v = Number(n || 0);
    if (v % 1000 === 0) {
        const man = v / 10000;
        return (Number.isInteger(man) ? man : man.toFixed(1)) + '만';
    }
    return v.toLocaleString('ko-KR') + '원';
}

const esc = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

/** 결제일·수단. 미결제는 수단 자리에 표시한다. */
function tailOf(c) {
    if (c.isUnpaid) return '<b class="unpaid">★ 미결제</b>';
    const method = METHOD_LABEL[c.paymentMethod] || c.paymentMethod || '-';
    return `결제 ${esc(c.paymentDate || '-')} ${esc(method)}`;
}

function buildHtml(p) {
    const blocks = (p.cycles || [])
        .map((c) => {
            const lessons =
                (c.lessons || [])
                    .map((l) => `${esc(l.date.slice(5))}(${esc(l.type)}${l.absent ? '결' : ''})`)
                    .join(' ') || '-';
            return `
    <div class="cyc"><span class="head">■ ${esc(c.targetDate)} · ${esc(c.cls)} · ${money(c.amount)} / ${tailOf(c)}</span> <span class="les">(${(c.lessons || []).length}회) ${lessons}</span></div>`;
        })
        .join('');

    const unpaidLine = p.unpaidCount
        ? `<div class="sum">※ 미결제 ${p.unpaidCount}건 합계 <b class="unpaid">${money(p.unpaidSum)}</b></div>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(p.fileName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: '맑은 고딕','Malgun Gothic',sans-serif; color:#222; font-size:10pt; line-height:1.5; }
  h1 { font-size:15pt; margin:0 0 2px; }
  .sub { color:#555; font-size:10pt; border-bottom:1px solid #ddd; padding-bottom:6px; margin-bottom:8px; }
  .cyc { break-inside: avoid; margin-bottom:4px; }
  .head { font-weight:bold; }
  .les { color:#555; font-size:9pt; }
  .unpaid { color:#c0392b; }
  .sum { margin-top:10px; padding-top:6px; border-top:1px solid #ddd; font-size:11pt; font-weight:bold; }
  .foot { margin-top:14px; color:#999; font-size:8.5pt; text-align:right; }
</style>
</head>
<body>
  <h1>수강 내역서</h1>
  <div class="sub">${esc(p.studentName)} · 최초 등록일 ${esc(p.firstDate || '-')}</div>
  ${blocks}
  ${unpaidLine}
  <div class="foot">발행일 ${esc(p.issueDate)} · 보이스튜닝</div>
</body>
</html>`;
}

/**
 * 수강 내역서 PDF 저장 — 브라우저 인쇄 창을 띄운다(대상에서 'PDF로 저장').
 *
 * 파일명은 브라우저가 '최상위 문서'의 제목에서 가져가므로(iframe 의 title 이 아님),
 * 인쇄하는 동안만 탭 제목을 바꾸고 되돌린다. — settlementDoc.js 와 같은 이유.
 */
export function printStudentRecordPdf(p) {
    const fileName = `수강 내역서_${p.studentName}`;
    const html = buildHtml({ ...p, fileName });

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const prevTitle = document.title;
    document.title = fileName;

    let done = false;
    const cleanup = () => {
        if (done) return;
        done = true;
        document.title = prevTitle;
        setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
        try {
            const win = iframe.contentWindow;
            win.focus();
            win.onafterprint = cleanup;
            win.print();
            setTimeout(cleanup, 60_000);
        } catch (e) {
            console.error('수강 내역서 인쇄 실패:', e);
            alert('인쇄 창을 열지 못했습니다.');
            cleanup();
        }
    };

    iframe.srcdoc = html;
}
