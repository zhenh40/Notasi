// Golongkan kesalahan OMR per peristiwa. node error_kinds.js EVAL_JSON XML_DIR [variant]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [evalPath, xmlDir, variant = 'bersih'] = process.argv.slice(2);
  const res = JSON.parse(fs.readFileSync(evalPath, 'utf8')).filter(r => r.variant === variant && !r.error);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const tally = {};
  const pairs = {};
  const pairEx = {};
  const examples = {};
  for (const r of res) {
    const gt = fs.readFileSync(`${xmlDir}/${r.piece}.musicxml`, 'utf8');
    const out = await p.evaluate(({ data, gt }) => {
      const evs = (sc) => {
        const M = [];
        sc.parts[0].measures.forEach((m, mi) => {
          const by = {};
          m.events.forEach(ev => {
            const k = ev.staff + '|' + ev.start.toString();
            if (!by[k]) by[k] = { m: mi, st: ev.staff, on: ev.start.num(), d: ev.dur.num(), ps: new Set(), rest: ev.rest };
            ev.pitches.forEach(q => by[k].ps.add(NotasiTheory.midiOf(q)));
            if (!ev.rest) by[k].rest = false;
            by[k].d = Math.min(by[k].d, ev.dur.num());
          });
          Object.values(by).forEach(e => { e.ps = [...e.ps].sort((a, b) => a - b); M.push(e); });
        });
        return M;
      };
      return { A: evs(NotasiMusicXML.parse(gt)), B: evs(NotasiMusicXML.parse(NotasiVision.buildPianoXML(data).xml)) };
    }, { data: r.data, gt });
    // pasangkan peristiwa per (birama, paranada) urut onset
    const key = e => e.m + '|' + e.st;
    const groups = {};
    out.A.forEach(e => { (groups[key(e)] = groups[key(e)] || { A: [], B: [] }).A.push(e); });
    out.B.forEach(e => { (groups[key(e)] = groups[key(e)] || { A: [], B: [] }).B.push(e); });
    for (const [k, g] of Object.entries(groups)) {
      g.A.sort((a, b) => a.on - b.on); g.B.sort((a, b) => a.on - b.on);
      const sumA = g.A.reduce((s, e) => s + e.d, 0), sumB = g.B.reduce((s, e) => s + e.d, 0);
      const add = (kind, ex) => { tally[kind] = (tally[kind] || 0) + 1; (examples[kind] = examples[kind] || []).length < 4 && examples[kind].push(r.piece + ' m' + (Number(k.split('|')[0]) + 1) + ' st' + k.split('|')[1] + ': ' + ex); };
      if (g.A.length === g.B.length) {
        g.A.forEach((a, i) => {
          const bb = g.B[i];
          if (a.rest !== bb.rest) add('diam↔not', `${a.rest ? 'r' : a.ps}→${bb.rest ? 'r' : bb.ps}`);
          else if (a.d !== bb.d) { add('durasi salah (jumlah peristiwa sama)', `${a.d}→${bb.d}`); const pk = (a.rest ? 'diam ' : 'not ') + a.d + '→' + bb.d; pairs[pk] = (pairs[pk] || 0) + 1; (pairEx[pk] = pairEx[pk] || []).length < 6 && pairEx[pk].push(r.piece + ' m' + (Number(k.split('|')[0]) + 1) + ' st' + k.split('|')[1] + ' on' + a.on + ' midi' + a.ps.join(',')); }
          else if (!a.rest && a.ps.sort().join() !== bb.ps.sort().join()) {
            const sa = a.ps, sb = bb.ps;
            if (sb.length < sa.length) add('nada akor hilang', `${sa}→${sb}`);
            else if (sb.length > sa.length) add('nada akor tambahan', `${sa}→${sb}`);
            else add('nada salah', `${sa}→${sb}`);
          }
        });
      } else if (g.B.length < g.A.length) add(sumB < sumA ? 'peristiwa hilang' : 'peristiwa hilang (durasi lain naik)', `${g.A.length}→${g.B.length}  ${g.A.map(e => (e.rest ? 'r' : 'n') + e.d).join(' ')} | ${g.B.map(e => (e.rest ? 'r' : 'n') + e.d).join(' ')}`);
      else add(sumB > sumA ? 'peristiwa tambahan' : 'peristiwa tambahan (durasi lain turun)', `${g.A.length}→${g.B.length}  ${g.A.map(e => (e.rest ? 'r' : 'n') + e.d).join(' ')} | ${g.B.map(e => (e.rest ? 'r' : 'n') + e.d).join(' ')}`);
    }
  }
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { console.log(String(v).padStart(4), k); examples[k].forEach(e => console.log('       ', e)); });
  console.log('\nPASANGAN DURASI (kunci→hasil):');
  Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => { console.log(String(v).padStart(4), k); (pairEx[k] || []).forEach(e => console.log('         ', e)); });
  await b.close();
})();
