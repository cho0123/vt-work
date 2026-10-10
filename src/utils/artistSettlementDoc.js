// 아티스트 정산서 — 브라우저 인쇄(PDF 저장)용.
//
// 저장 방식은 수강 내역서(studentRecordDoc.js)와 같다: 숨긴 iframe 에 그려서 print().
// window.open 은 팝업 차단에 걸리고, 현재 창 인쇄는 앱 화면을 건드린다.
// 파일명은 최상위 document.title 로 넘긴다.
//
// ⚠️ 계좌번호는 뒤 4자리만 찍는다.

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

const esc = (s) =>
    String(s === null || s === undefined ? '' : s)
        .split('&').join('&amp;')
        .split('<').join('&lt;')
        .split('>').join('&gt;');

const pct = (n) => (Math.round(Number(n || 0) * 100) / 100) + '%';

// 뒤 4자리만. 저장된 값 자체는 건드리지 않는다.
const maskAccount = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (s.length <= 4) return s;
    return '****' + s.slice(-4);
};

function buildHtml(p) {
    const catRows = (p.rows || [])
        .map((r) => `
      <tr>
        <td>${esc(r.name)}</td>
        <td class="r">${r.income ? won(Math.round(r.income)) : '-'}</td>
        <td class="r">${r.expense ? won(Math.round(r.expense)) : '-'}</td>
        <td class="r">${r.income > 0 ? pct(r.artistPercent) : '-'}</td>
      </tr>`)
        .join('');

    const songRows = (p.songs || []).length
        ? (p.songs || [])
            .map((s) => `
      <tr>
        <td>${esc(s.projectName)}</td>
        <td class="r">${pct(s.sharePercent)}</td>
        <td class="r">${won(Math.round(s.rawIncome))}</td>
        <td class="r">${won(Math.round(s.income))}</td>
        <td class="r">${won(Math.round(s.expense))}</td>
      </tr>`)
            .join('')
        : '<tr><td colspan="5" class="c muted">연결된 곡 없음</td></tr>';

    const collabRows = (p.collabs || []).length
        ? (p.collabs || [])
            .map((c) => `
      <tr>
        <td>${esc(c.projectName)}</td>
        <td class="r">${won(c.recoupAmount)}</td>
        <td class="r">${won(Math.round(c.recoveredAmount))}</td>
        <td class="r">${won(Math.round(c.remainingRecoup))}</td>
        <td class="r">${pct(c.sharePercent)}</td>
        <td class="r">${won(c.artistShare)}</td>
      </tr>`)
            .join('')
        : '';

    const collabBlock = (p.collabs || []).length
        ? `
    <h2>콜라보 곡 (제작비 회수 후 공유)</h2>
    <table>
      <thead><tr><th>곡</th><th class="r">제작비</th><th class="r">회수액</th><th class="r">남은 제작비</th><th class="r">공유율</th><th class="r">공유액</th></tr></thead>
      <tbody>${collabRows}</tbody>
    </table>
    <p class="muted small">콜라보는 곡 수익만 봅니다(지출 미반영). 일반 정산의 이월과 섞지 않습니다.</p>`
        : '';

    // 아티스트 몫 뒤의 지급 단계(세금). 4단계 이전 확정분에는 payout 이 없다.
    const pay = p.payout;
    const payRows = !pay
        ? '<tr><td colspan="2" class="muted">세무 정보 없음(4단계 이전 확정) — 다시 계산하지 않습니다.</td></tr>'
        : pay.taxType === 'invoice'
            ? `
      <tr><th>세금계산서 공급가 (지급액 ÷ 1.1)</th><td class="r">${won(pay.supplyAmount)}</td></tr>
      <tr><th>부가세</th><td class="r">${won(pay.vat)}</td></tr>`
            : `
      <tr><th>소득세 (3%)</th><td class="r neg">-${won(pay.incomeTax)}</td></tr>
      <tr><th>지방소득세 (소득세의 10%)</th><td class="r neg">-${won(pay.localTax)}</td></tr>`;

    const payTypeLine = !pay
        ? ''
        : `<p class="muted small">세무 유형: ${pay.taxType === 'invoice' ? '세금계산서 (사업자)' : '원천징수 (개인)'}` +
          `${pay.needsInvoice ? ' · <b>세금계산서 수취 필요</b>' : ''}` +
          `${pay.needsInvoice && p.bizNo ? ' · 사업자등록번호 ' + esc(p.bizNo) : ''}</p>`;

    const payBlock = `
    <h2>지급</h2>
    ${payTypeLine}
    <table class="sum">
      <tr><th>아티스트 몫</th><td class="r">${won(p.artistShare)}</td></tr>
      ${payRows}
      <tr class="total"><th>${pay && pay.taxType === 'invoice' ? '지급액 (부가세 포함)' : '실지급액'}</th><td class="r">${won(pay ? pay.netPayout : p.artistShare)} 원</td></tr>
    </table>`;

    const carryBlock = p.carryIn
        ? `<tr><th>직전 이월</th><td class="r neg">${won(Math.round(p.carryIn))}</td></tr>`
        : '';
    const carryOutBlock = p.carryOut
        ? `<tr><th>다음 정산으로 이월</th><td class="r neg">${won(Math.round(p.carryOut))}</td></tr>`
        : '';

    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(p.fileName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.5px; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1.5px solid #222; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .muted { color: #777; }
  .small { font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; }
  thead th { background: #f3f4f6; font-size: 11px; }
  .r { text-align: right; }
  .c { text-align: center; }
  .neg { color: #b91c1c; }
  .sum th { background: #f9fafb; text-align: left; width: 60%; }
  .total th, .total td { background: #111; color: #fff; font-size: 14px; font-weight: bold; }
  .info td { border: none; padding: 2px 0; }
  .info th { border: none; padding: 2px 10px 2px 0; text-align: left; color: #777; font-weight: normal; width: 90px; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>아티스트 정산서</h1>
      <div class="muted">${esc(p.artistName)} · ${esc(p.periodLabel)}</div>
    </div>
    <div class="muted small">
      금액 기준: ${esc(p.basisLabel)}<br>
      발행일: ${esc(p.issueDate)}
    </div>
  </div>

  <table class="info">
    <tr><th>아티스트</th><td>${esc(p.artistName)}${p.realName ? ' (' + esc(p.realName) + ')' : ''}</td></tr>
    <tr><th>정산 기간</th><td>${esc(p.periodLabel)}${p.months ? ' · ' + esc(p.months) : ''}</td></tr>
    <tr><th>입금 계좌</th><td>${esc(p.bank)} ${maskAccount(p.accountNumber)}${p.accountHolder ? ' (' + esc(p.accountHolder) + ')' : ''}</td></tr>
  </table>

  <h2>항목별 내역</h2>
  <table>
    <thead><tr><th>항목</th><th class="r">수익</th><th class="r">지출</th><th class="r">아티스트 비율</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="4" class="c muted">내역 없음</td></tr>'}</tbody>
  </table>

  <h2>정산</h2>
  <table class="sum">
    <tr><th>총수익</th><td class="r">${won(Math.round(p.totalIncome))}</td></tr>
    <tr><th>총지출</th><td class="r">${won(Math.round(p.totalExpense))}</td></tr>
    <tr><th>기간 순수익</th><td class="r">${won(Math.round(p.netBefore))}</td></tr>
    ${carryBlock}
    <tr><th>정산 대상 순수익</th><td class="r">${won(Math.round(p.netAfter))}</td></tr>
    <tr><th>아티스트 비율 (수익 가중)</th><td class="r">${pct(p.artistRatePercent)}</td></tr>
    ${carryOutBlock}
    <tr><th>아티스트 몫</th><td class="r">${won(p.artistShare)}</td></tr>
  </table>

  ${payBlock}

  <h2>연결된 곡 (소속 지분 반영)</h2>
  <table>
    <thead><tr><th>곡</th><th class="r">지분</th><th class="r">곡 수익 전체</th><th class="r">지분 수익</th><th class="r">지분 지출</th></tr></thead>
    <tbody>${songRows}</tbody>
  </table>

  ${collabBlock}

  <p class="muted small" style="margin-top:14px">
    · 아티스트 비율은 수익항목별 비율을 수익 금액으로 가중해 구합니다(단순 평균 아님).<br>
    · 순수익이 0 이하이면 지급액은 0원이고, 그 금액은 다음 정산으로 이월됩니다.<br>
    · 금액 기준: ${esc(p.basisLabel)}. 원 단위는 반올림했습니다.<br>
    · 원천징수는 소득세 3% + 지방소득세(소득세의 10%)이며 각 세액은 10원 미만을 버립니다.<br>
    · 세금계산서 유형은 아티스트 몫이 부가세 포함 금액이며, 공급가는 지급액 ÷ 1.1 입니다.
  </p>
</body></html>`;
}

export function printArtistSettlement(p) {
    const fileName = `아티스트 정산서_${p.artistName}_${p.periodLabel}`;
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
            setTimeout(cleanup, 60000);
        } catch (e) {
            console.error('정산서 인쇄 실패:', e);
            alert('인쇄 창을 열지 못했습니다.');
            cleanup();
        }
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}
