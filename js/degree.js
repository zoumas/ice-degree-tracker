// Λογική υπολογισμού: αντιστοίχιση καρτέλας με το πρόγραμμα, έλεγχος προϋποθέσεων, βαθμός πτυχίου.
// Δεν αγγίζει το DOM, ώστε να τρέχει και στα tests (node --test).
(function (root) {
  "use strict";

  // Οι καρτέλες ανακατεύουν λατινικά γράμματα που μοιάζουν με ελληνικά (π.χ. "ΣYNTAΞΗ").
  const LATIN = { A: "Α", B: "Β", E: "Ε", Z: "Ζ", H: "Η", I: "Ι", K: "Κ", M: "Μ", N: "Ν", O: "Ο", P: "Ρ", T: "Τ", Y: "Υ", X: "Χ" };
  const STOP = new Set(["ΤΟ", "ΤΗ", "ΤΗΣ", "ΤΩΝ", "ΤΟΝ", "ΚΑΙ", "ΑΠΟ", "ΣΤΗΝ", "ΣΤΟΝ", "ΣΤΗ", "ΣΤΟ"]);

  function norm(s) {
    const up = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[A-Z]/g, c => LATIN[c] || c);
    return up.replace(/[^Α-ΩA-Z0-9]+/g, " ").trim().split(" ").filter(w => w && !STOP.has(w)).join(" ");
  }

  // Η εξαγωγή του φοιτητολογίου χάνει την υποδιαστολή: 53 σημαίνει 5,3 και 10 σημαίνει 10.
  function parseGrade(v, passedFlag) {
    if (v === null || v === undefined || v === "" || v === "-") return null;
    let n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (!isFinite(n)) return null;
    if (n > 10) n = n / 10;
    if (n === 10 && passedFlag === "Όχι") n = 1;
    return Math.round(n * 100) / 100;
  }

  // Κατάλογος: key -> { name, ects, sem, cat: Y|BR|EY|GP|DEPT|THESIS|INTERNSHIP, stream }
  function buildCatalog(cur) {
    const catalog = new Map();
    const add = (name, o) => catalog.set(norm(name), { name, ects: 5, sem: null, stream: null, ...o });
    cur.mandatory.forEach(([n, e, s]) => add(n, { ects: e, sem: s, cat: "Y" }));
    for (const st of Object.keys(cur.streams).map(Number)) {
      cur.basic[st].forEach(([n, s]) => add(n, { sem: s, cat: "BR", stream: st }));
      cur.electives[st].forEach(n => add(n, { cat: "EY", stream: st }));
    }
    cur.general.forEach(n => add(n, { cat: "GP" }));
    cur.otherDepartments.forEach(n => add(n, { cat: "DEPT" }));
    add(cur.thesis.name, { ects: cur.thesis.ects, sem: cur.thesis.semester, cat: "THESIS" });
    add(cur.internship.name, { ects: cur.internship.ects, cat: "INTERNSHIP" });
    return catalog;
  }

  // Ενώνει τις γραμμές της καρτέλας με τον κατάλογο. Κάθε μάθημα παίρνει status: passed | failed | registered | none.
  function buildRecords(catalog, rows) {
    const recs = new Map();
    for (const [key, c] of catalog) recs.set(key, { key, ...c, grade: null, status: "none", period: null, failed: [] });
    for (const r of rows) {
      const key = norm(r.name);
      let rec = recs.get(key);
      if (!rec) {
        rec = { key, name: r.name, ects: r.ects || 5, sem: null, stream: null, grade: null, status: "none", period: null, failed: [],
                cat: /^Υποχρεωτικό$/.test(r.kind || "") ? "Y" : "DEPT", unknown: true };
        recs.set(key, rec);
      }
      if (r.ects) rec.ects = r.ects;
      const g = parseGrade(r.grade, r.bp);
      if (g !== null && g >= 5) { rec.grade = g; rec.status = "passed"; rec.period = r.period; }
      else if (rec.status !== "passed") {
        if (g !== null) { rec.status = "failed"; rec.failed.push(g); rec.period = r.period; }
        else if (rec.status === "none") rec.status = "registered";
      }
    }
    return recs;
  }

  // Η ροή με τα περισσότερα περασμένα ή δηλωμένα μαθήματα ροής.
  function guessStream(recs, cur) {
    let best = Number(Object.keys(cur.streams)[0]), bestScore = 0;
    for (const st of Object.keys(cur.streams).map(Number)) {
      let score = 0;
      for (const r of recs.values()) if (r.stream === st && r.status !== "none") score += r.cat === "BR" ? 2 : 1;
      if (score > bestScore) { best = st; bestScore = score; }
    }
    return best;
  }

  // opts: { stream, internship, proj: {key: grade}, useProj }
  function evaluate(recs, cur, opts) {
    const R = cur.rules, st = Number(opts.stream), intern = !!opts.internship;
    const E = intern ? R.electivesWithInternship : R.electives;
    const otherCap = intern ? R.otherElectivesMaxWithInternship : R.otherElectivesMax;
    const eff = rec => {
      if (rec.status === "passed") return { g: rec.grade, proj: false };
      const p = opts.proj && opts.proj[rec.key];
      if (opts.useProj && typeof p === "number" && p >= 5) return { g: p, proj: true };
      return null;
    };
    const all = [...recs.values()];
    const Y = all.filter(r => r.cat === "Y");
    const BR = all.filter(r => r.cat === "BR" && r.stream === st);
    const counted = [];
    for (const r of [...Y, ...BR]) { const e = eff(r); if (e) counted.push({ r, ...e, role: r.cat }); }

    const pool = [];
    for (const r of all) {
      if (r.cat === "Y" || r.cat === "THESIS" || r.cat === "INTERNSHIP" || (r.cat === "BR" && r.stream === st)) continue;
      const e = eff(r);
      if (e) pool.push({ r, ...e, group: r.stream === st ? "stream" : r.cat === "GP" ? "gp" : "other" });
    }
    // Άπληστη επιλογή κατά βαθμό μέσα στα όρια: κρατάει τα καλύτερα ΕΥ, άρα μεγιστοποιεί τον μέσο όρο.
    pool.sort((a, b) => b.g - a.g || (a.proj - b.proj));
    let total = 0, nonStream = 0, gp = 0, streamTaken = 0;
    const excess = [];
    for (const c of pool) {
      const isStream = c.group === "stream";
      const ok = total < E && (isStream || (nonStream < otherCap && (c.group !== "gp" || gp < R.generalMax)));
      if (!ok) { excess.push(c); continue; }
      total++;
      if (isStream) streamTaken++; else { nonStream++; if (c.group === "gp") gp++; }
      counted.push({ ...c, role: isStream ? "EYS" : c.group === "gp" ? "GP" : "EYO" });
    }
    const thesis = recs.get(norm(cur.thesis.name)), te = eff(thesis);
    if (te) counted.push({ r: thesis, ...te, role: "THESIS" });

    let sum = 0, ects = 0;
    for (const c of counted) { sum += c.g * c.r.ects; ects += c.r.ects; }
    const streamNeed = Math.max(0, R.streamElectivesMin - streamTaken);
    const freeNeed = Math.max(0, E - total - streamNeed);
    const missingY = Y.filter(r => !eff(r)), missingBR = BR.filter(r => !eff(r));
    const remainingEcts = missingY.reduce((a, r) => a + r.ects, 0) + missingBR.reduce((a, r) => a + r.ects, 0)
      + (streamNeed + freeNeed) * 5 + (te ? 0 : cur.thesis.ects);
    return {
      stream: st, E, otherCap, counted, excess, sum, ects, avg: ects ? sum / ects : null,
      Y, BR, missingY, missingBR, yDone: Y.length - missingY.length, brDone: BR.length - missingBR.length,
      total, streamTaken, nonStream, gp, streamNeed, freeNeed, thesis, thesisDone: !!te,
      courses: counted.filter(c => c.role !== "THESIS").length, coursesNeeded: R.mandatory + R.basic + E,
      remainingEcts,
    };
  }

  // Μέσος όρος που χρειάζεται στα υπόλοιπα ECTS για να βγει ο στόχος.
  function requiredAverage(result, goal) {
    const rem = result.remainingEcts;
    if (!rem) return null;
    return {
      need: (goal * (result.ects + rem) - result.sum) / rem,
      best: (result.sum + 10 * rem) / (result.ects + rem),
      worst: (result.sum + 5 * rem) / (result.ects + rem),
      rem,
    };
  }

  // Μετατρέπει το φύλλο της καρτέλας (πίνακας γραμμών) σε γραμμές μαθημάτων.
  function parseTranscriptSheet(rows) {
    const hi = rows.findIndex(r => r && r.some(c => String(c || "").includes("Κωδ. μαθήματος")));
    if (hi < 0) throw new Error("Δεν βρέθηκε η στήλη «Κωδ. μαθήματος».");
    const h = rows[hi].map(c => String(c || "").trim());
    const col = n => h.indexOf(n);
    const need = ["Κωδ. μαθήματος", "Μάθημα", "Βαθμός"];
    for (const n of need) if (col(n) < 0) throw new Error(`Λείπει η στήλη «${n}».`);
    const at = (r, n) => (col(n) < 0 ? null : r[col(n)]);
    const out = rows.slice(hi + 1).filter(r => r && at(r, "Κωδ. μαθήματος")).map(r => ({
      code: at(r, "Κωδ. μαθήματος"),
      name: String(at(r, "Μάθημα") || "").replace(/<[\s\S]*/, "").trim(),
      grade: at(r, "Βαθμός"),
      period: at(r, "Εξ. περίοδος"),
      bp: at(r, "Β.Π."),
      ects: Number(at(r, "ECTS")) || null,
      kind: at(r, "Τύπος μαθήματος"),
    }));
    if (!out.length) throw new Error("Το αρχείο δεν έχει μαθήματα.");
    return out;
  }

  root.Degree = { norm, parseGrade, buildCatalog, buildRecords, guessStream, evaluate, requiredAverage, parseTranscriptSheet };
})(typeof window !== "undefined" ? window : globalThis);
