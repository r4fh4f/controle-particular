/* ============================================================
   E-mail de comemoração da meta conjunta (HTML para Gmail)
   Tabelas + estilos inline: é o que os clientes de e-mail entendem
   ============================================================ */
'use strict';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl = v => BRL.format(Math.round(v || 0)).replace(/ /g, ' ');
const INT = new Intl.NumberFormat('pt-BR');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';

// junta os números dos dois sites
function consolidar(s) {
  const exames = {}, meses = {};
  let primeiro = null, nEx = 0, nAt = 0;
  for (const p of s.partes) {
    nEx += p.exames || 0; nAt += p.atendimentos || 0;
    if (p.primeiro && (!primeiro || p.primeiro < primeiro)) primeiro = p.primeiro;
    for (const [k, v] of Object.entries(p.porExame || {})) exames[k] = (exames[k] || 0) + v;
    for (const [k, v] of Object.entries(p.porMes || {})) meses[k] = (meses[k] || 0) + v;
  }
  const topEx = Object.entries(exames).sort((a, b) => b[1] - a[1])[0];
  const topMes = Object.entries(meses).sort((a, b) => b[1] - a[1])[0];
  const dias = primeiro ? Math.max(1, Math.round((Date.now() - new Date(primeiro + 'T12:00:00').getTime()) / 864e5)) : 0;
  return { nEx, nAt, primeiro, dias, topEx, topMes };
}
function nomes(partes) {
  const n = partes.map(p => p.dono).filter(Boolean);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : (n[0] || 'Vocês');
}

function emailMarco(s, teste) {
  const c = consolidar(s);
  const quem = nomes(s.partes);
  const pct = Math.min(100, s.total / s.valor * 100);
  const meta = brl(s.valor);
  const assunto = (teste ? '[TESTE] ' : '') + `🎉 ${meta} em particulares! ${quem}, vocês bateram a meta!`;

  const fato = (emoji, txt) => `<tr><td style="padding:10px 0;border-bottom:1px solid #1d242b;font-size:16px;line-height:1.5;color:#dfe5ea">
    <span style="display:inline-block;width:34px;font-size:20px">${emoji}</span>${txt}</td></tr>`;
  const fatos = [
    c.primeiro ? fato('📅', `Desde <b style="color:#fff">${dataBR(c.primeiro)}</b> — ${INT.format(c.dias)} dias de trabalho`) : '',
    fato('🩺', `<b style="color:#fff">${INT.format(c.nEx)} exames</b> em ${INT.format(c.nAt)} atendimentos`),
    c.topEx ? fato('🏆', `Exame campeão: <b style="color:#fff">${esc(c.topEx[0])}</b> (${INT.format(c.topEx[1])}×)`) : '',
    c.topMes ? fato('📈', `Mês recorde: <b style="color:#fff">${MESES[+c.topMes[0].slice(5) - 1]} de ${c.topMes[0].slice(0, 4)}</b> (${brl(c.topMes[1])})`) : '',
  ].join('');
  const cards = s.partes.map(p => `<td width="${Math.floor(100 / s.partes.length)}%" style="padding:6px" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141a20;border:1px solid #27303a;border-radius:14px">
        <tr><td style="padding:18px 18px 16px">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8d979f">${esc(p.dono)}</div>
          <div style="font-size:26px;font-weight:800;color:#ffd36b;margin-top:6px;font-family:Menlo,Consolas,monospace">${brl(p.bruto)}</div>
          <div style="font-size:13px;color:#8d979f;margin-top:4px">${INT.format(p.exames)} exames</div>
        </td></tr></table></td>`).join('');

  const bannerTeste = teste ? `<tr><td style="padding:14px 28px;background:#2a2112;color:#ffd36b;font-size:14px;text-align:center;border-bottom:1px solid #3a2e17">
      🧪 <b>E-mail de teste.</b> A meta ainda ${s.total >= s.valor ? 'foi batida, mas este envio é só de teste' : `não foi batida: ${brl(s.total)} de ${meta} (${pct.toFixed(1).replace('.', ',')}%)`}.</td></tr>` : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#050607">
<div style="display:none;max-height:0;overflow:hidden;color:#050607">Somando os dois consultórios, vocês passaram de ${meta} em exames particulares. Hoje é dia de comemorar!</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050607"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0b0e12;border-radius:22px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;border:1px solid #1d242b">
  ${bannerTeste}
  <tr><td align="center" style="background:#f4b53f;background-image:linear-gradient(135deg,#ffe29a 0%,#f4b53f 45%,#e8932a 100%);padding:40px 28px 34px">
    <div style="font-size:40px;line-height:1.2;letter-spacing:6px">🎉🥂🎊</div>
    <div style="font-size:15px;font-weight:800;letter-spacing:5px;text-transform:uppercase;color:#4a2c05;margin-top:14px">Meta batida!</div>
    <div style="font-size:60px;font-weight:900;color:#1a1003;letter-spacing:-2px;line-height:1.05;margin-top:8px;font-family:Menlo,Consolas,monospace">${meta}</div>
    <div style="font-size:17px;color:#4a2c05;margin-top:8px;font-weight:600">em exames particulares, juntos 💛</div>
  </td></tr>
  <tr><td style="padding:34px 30px 8px">
    <div style="font-size:26px;font-weight:800;color:#ffffff;line-height:1.25">${esc(quem)}, que dia! 🥳</div>
    <div style="font-size:17px;line-height:1.6;color:#c9d1d8;margin-top:14px">
      Somando os dois consultórios, vocês acabam de passar de <b style="color:#ffd36b">${meta}</b> em exames particulares.
      Cada ultrassom, cada mamografia, cada Doppler entrou nessa conta. Total até agora: <b style="color:#fff">${brl(s.total)}</b>.
    </div>
  </td></tr>
  <tr><td style="padding:22px 30px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a2028;border-radius:8px"><tr>
      <td width="${pct.toFixed(1)}%" style="background:#f4b53f;background-image:linear-gradient(90deg,#e8932a,#ffd36b);height:12px;border-radius:8px;font-size:0;line-height:0">&nbsp;</td>
      ${pct < 100 ? '<td style="font-size:0;line-height:0">&nbsp;</td>' : ''}
    </tr></table>
    <div style="font-size:12px;color:#8d979f;margin-top:8px;text-align:right;font-family:Menlo,Consolas,monospace">${pct.toFixed(0)}% da meta ${pct >= 100 ? '✓' : ''}</div>
  </td></tr>
  <tr><td style="padding:14px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards}</tr></table></td></tr>
  <tr><td style="padding:22px 30px 6px">
    <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8d979f;margin-bottom:6px">Os números da conquista</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fatos}</table>
  </td></tr>
  <tr><td style="padding:26px 30px 10px">
    <div style="background:#141a20;border:1px solid #27303a;border-radius:16px;padding:22px 22px;text-align:center">
      <div style="font-size:34px">🍾</div>
      <div style="font-size:19px;font-weight:800;color:#fff;margin-top:6px">Hoje a comemoração é obrigatória.</div>
      <div style="font-size:16px;color:#c9d1d8;margin-top:8px;line-height:1.55">Abram um vinho, peçam aquele jantar, brindem a vocês dois. Vocês merecem cada centavo.</div>
      <div style="font-size:15px;color:#ffd36b;margin-top:14px;font-weight:700">Próxima parada: ${brl(s.valor * 2)} 🚀</div>
    </div>
  </td></tr>
  <tr><td align="center" style="padding:22px 30px 30px;font-size:12px;color:#5f6970;line-height:1.6">
    Enviado pelo Controle de Ganhos Particulares · com muito orgulho 💛<br>
    Este e-mail é enviado uma única vez, quando a meta é atingida.
  </td></tr>
</table></td></tr></table></body></html>`;

  const texto = [
    teste ? `[E-MAIL DE TESTE] Progresso: ${brl(s.total)} de ${meta}.\n` : '',
    `🎉 META BATIDA: ${meta} em exames particulares!`,
    ``,
    `${quem}, que dia! Somando os dois consultórios, vocês passaram de ${meta}. Total: ${brl(s.total)}.`,
    ``,
    ...s.partes.map(p => `• ${p.dono}: ${brl(p.bruto)} (${INT.format(p.exames)} exames)`),
    ``,
    c.primeiro ? `Desde ${dataBR(c.primeiro)} — ${INT.format(c.dias)} dias de trabalho` : '',
    `${INT.format(c.nEx)} exames em ${INT.format(c.nAt)} atendimentos`,
    c.topEx ? `Exame campeão: ${c.topEx[0]} (${c.topEx[1]}×)` : '',
    ``,
    `Hoje a comemoração é obrigatória. Próxima parada: ${brl(s.valor * 2)} 🚀`,
  ].filter(l => l !== null).join('\n');

  return { assunto, html, texto };
}

module.exports = { emailMarco };
