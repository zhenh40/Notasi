// Bandingkan per birama: kunci jawaban vs hasil OMR. node diff_piece.js EVAL_JSON PIECE VARIANT GT_XML [maxMeasures]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [evalPath, piece, variant, gtPath, maxM = '40'] = process.argv.slice(2);
  const res = JSON.parse(fs.readFileSync(evalPath, 'utf8')).find(r => r.piece === piece && r.variant === variant);
  const gt = fs.readFileSync(gtPath, 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const out = await p.evaluate(({ data, gt }) => {
    const toks = (sc) => {
      const M = [];
      sc.parts[0].measures.forEach((m, mi) => {
        const st = { 1: [], 2: [] };
        const byStart = {};
        m.events.forEach(ev => {
          const k = ev.staff + '|' + ev.voice + '|' + ev.start.toString();
          if (!byStart[k]) { byStart[k] = { staff: ev.staff, voice: ev.voice, start: ev.start, dur: ev.dur, ps: [], rest: ev.rest }; }
          ev.pitches.forEach(q => byStart[k].ps.push(q.step + (q.alter > 0 ? '#'.repeat(q.alter) : 'b'.repeat(-q.alter)) + q.octave + (q.tieStart ? '~' : '')));
        });
        Object.values(byStart).sort((a, b) => a.voice.localeCompare(b.voice) || a.start.cmp(b.start)).forEach(e => {
          st[e.staff].push((e.rest ? 'r' : e.ps.sort().join('+')) + ':' + e.dur.toString() + (e.voice !== '1' && e.voice !== '5' ? '[v' + e.voice + ']' : ''));
        });
        M.push(st);
      });
      return M;
    };
    const A = toks(NotasiMusicXML.parse(gt));
    const B = toks(NotasiMusicXML.parse(NotasiVision.buildPianoXML(data).xml));
    return { A, B, warn: data.measures.map(m => m.warn || null) };
  }, { data: res.data, gt });
  for (let i = 0; i < Math.min(Number(maxM), Math.max(out.A.length, out.B.length)); i++) {
    for (const s of [1, 2]) {
      const a = (out.A[i] || { 1: [], 2: [] })[s].join(' '), bb = (out.B[i] || { 1: [], 2: [] })[s].join(' ');
      const mark = a === bb ? '  ' : '✗ ';
      console.log(`${mark}m${i + 1} ${s === 1 ? 'RH' : 'LH'}  GT : ${a}`);
      if (a !== bb) console.log(`         OMR: ${bb}`);
    }
  }
  await b.close();
})();
