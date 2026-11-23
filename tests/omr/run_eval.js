// Ukur akurasi OMR terhadap kunci jawaban. node run_eval.js MANIFEST [variant|all] [maxPieces] [outJson]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [manifestPath, variantArg = 'all', maxPieces = '999', outJson] = process.argv.slice(2);
  const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pieces = {};
  for (const e of man) {
    if (variantArg !== 'all' && e.variant !== variantArg) continue;
    const key = e.piece + '|' + e.variant;
    (pieces[key] = pieces[key] || { piece: e.piece, variant: e.variant, xml: e.xml, font: e.font, pages: [] }).pages.push(e);
  }
  const list = Object.values(pieces).slice(0, Number(maxPieces) * (variantArg === 'all' ? 3 : 1));
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://127.0.0.1:8790/home/user/notasi/tests/omr/harness.html');
  const results = [];
  for (const pc of list) {
    pc.pages.sort((a, b) => a.page - b.page);
    const gt = fs.readFileSync(pc.xml, 'utf8');
    const r = await p.evaluate(async ({ urls, gt }) => {
      const t0 = performance.now();
      const pages = [];
      try {
        for (const u of urls) { const { gray, w, h } = await loadGray(u); pages.push(NotasiOMR.recognizePage(gray, w, h)); }
      } catch (e) { return { error: String(e.message || e) }; }
      const merged = NotasiOMR.mergePages(pages);
      const ms = performance.now() - t0;
      const { xml, problems } = NotasiVision.buildPianoXML(merged.data);
      const notesOf = (sc) => {
        const out = [];
        sc.parts.forEach(pt => pt.measures.forEach((m, mi) => m.events.forEach(ev => {
          if (ev.rest) return;
          ev.pitches.forEach(q => out.push({ m: mi, st: ev.staff, on: ev.start.toString(), d: ev.dur.toString(), midi: NotasiTheory.midiOf(q), tie: q.tieStop ? 1 : 0 }));
        })));
        return out;
      };
      const A = notesOf(NotasiMusicXML.parse(gt)), B = notesOf(NotasiMusicXML.parse(xml));
      const key = (n, mode) => mode === 'full' ? [n.m, n.st, n.on, n.d, n.midi].join('|') : mode === 'pitch' ? [n.m, n.st, n.midi].join('|') : [n.m, n.st, n.on, n.d].join('|');
      const score = (mode) => {
        const ca = {}; A.forEach(n => { const k = key(n, mode); ca[k] = (ca[k] || 0) + 1; });
        let tp = 0; B.forEach(n => { const k = key(n, mode); if (ca[k] > 0) { ca[k]--; tp++; } });
        return { tp, p: tp / Math.max(1, B.length), r: tp / Math.max(1, A.length) };
      };
      // birama tepat
      const gtM = {}, omM = {};
      A.forEach(n => { (gtM[n.m] = gtM[n.m] || []).push(key(n, 'full')); });
      B.forEach(n => { (omM[n.m] = omM[n.m] || []).push(key(n, 'full')); });
      const nMeasGT = NotasiMusicXML.parse(gt).parts[0].measures.length;
      let exact = 0;
      for (let i = 0; i < nMeasGT; i++) { const a = (gtM[i] || []).sort().join(','), b = (omM[i] || []).sort().join(','); if (a === b) exact++; }
      const gtSc = NotasiMusicXML.parse(gt);
      const gtKey = gtSc.measureInfo[0].key.fifths, gtTime = gtSc.measureInfo[0].time;
      return { ms: Math.round(ms), full: score('full'), pitch: score('pitch'), rhythm: score('rhythm'), nA: A.length, nB: B.length, measGT: nMeasGT, measOMR: merged.data.measures.length, exact,
        key: [gtKey, merged.data.fifths], time: [gtTime.beats + '/' + gtTime.beatType, merged.data.beats + '/' + merged.data.beatType], problems: problems.length, warnings: merged.warnings, data: merged.data };
    }, { urls: pc.pages.map(e => 'http://127.0.0.1:8790' + e.img), gt });
    r.piece = pc.piece; r.variant = pc.variant; r.font = pc.font;
    results.push(r);
    if (r.error) console.log(pc.piece, pc.variant, 'ERROR', r.error);
    else console.log(`${pc.piece} ${pc.variant.padEnd(6)} ${pc.font.padEnd(9)} F1-lengkap ${(2 * r.full.p * r.full.r / Math.max(1e-9, r.full.p + r.full.r) * 100).toFixed(1).padStart(5)}  nada ${(r.pitch.r * 100).toFixed(1).padStart(5)}  ritme ${(r.rhythm.r * 100).toFixed(1).padStart(5)}  birama ${r.measOMR}/${r.measGT} tepat ${r.exact}  kunci ${r.key.join('→')} sukat ${r.time.join('→')}  ${r.ms}ms`);
  }
  const agg = {};
  for (const r of results) {
    if (r.error) continue;
    const a = agg[r.variant] = agg[r.variant] || { tp: 0, nA: 0, nB: 0, tpP: 0, tpR: 0, meas: 0, exact: 0, n: 0, keyOK: 0, timeOK: 0, measOK: 0 };
    a.tp += r.full.tp; a.nA += r.nA; a.nB += r.nB; a.tpP += r.pitch.tp; a.tpR += r.rhythm.tp; a.meas += r.measGT; a.exact += r.exact; a.n++;
    a.keyOK += r.key[0] === r.key[1] ? 1 : 0; a.timeOK += r.time[0] === r.time[1] ? 1 : 0; a.measOK += r.measGT === r.measOMR ? 1 : 0;
  }
  console.log('\nRINGKASAN');
  for (const [v, a] of Object.entries(agg)) {
    const P = a.tp / a.nB, R = a.tp / a.nA;
    console.log(`${v.padEnd(7)} not tepat(nada+waktu+durasi) presisi ${(P * 100).toFixed(1)}% recall ${(R * 100).toFixed(1)}% | nada saja ${(a.tpP / a.nA * 100).toFixed(1)}% | ritme saja ${(a.tpR / a.nA * 100).toFixed(1)}% | birama tepat ${(a.exact / a.meas * 100).toFixed(1)}% | jml birama benar ${a.measOK}/${a.n} | kunci ${a.keyOK}/${a.n} | sukat ${a.timeOK}/${a.n}`);
  }
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(results, null, 1));
  await b.close();
})();
