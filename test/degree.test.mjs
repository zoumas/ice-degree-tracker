import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
for (const f of ["curriculum.js", "degree.js", "sample.js"]) {
  vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8"), ctx, { filename: f });
}
const { CURRICULUM: CUR, Degree: D, SAMPLE_TRANSCRIPT } = ctx;
const CATALOG = D.buildCatalog(CUR);
const row = (name, grade, bp = grade === null ? null : grade >= 5 || grade > 10 ? "Ναι" : "Όχι") => ({ name, grade, bp, period: "-", ects: null, kind: null });

test("norm matches names across accents, Latin look-alikes and stop words", () => {
  const cases = [
    ["ΣYNTAΞΗ ΤΕΧΝΙΚΩΝ ΚΕΙΜΕΝΩΝ", "Σύνταξη Τεχνικών Κειμένων"],
    ["ΜΑΘΗΜΑΤΙΚΗ ΑΝΑΛΥΣΗ I", "Μαθηματική Ανάλυση Ι"],
    ["ΔΙΚΤΥΩΣΗ ΟΡΙΖΟMΕΝΗ ΑΠΟ ΤΟ ΛΟΓΙΣΜΙΚΟ", "Δικτύωση Οριζόμενη από Λογισμικό"],
    ["ΑΛΛΗΛΕΠΙΔΡΑΣΗ ΑΝΘΡΩΠΟΥ - ΥΠΟΛΟΓΙΣΤΗ", "Αλληλεπίδραση Ανθρώπου – Υπολογιστή"],
  ];
  for (const [a, b] of cases) assert.equal(D.norm(a), D.norm(b), a);
});

test("parseGrade restores the dropped decimal point", () => {
  const cases = [[53, "Ναι", 5.3], [10, "Ναι", 10], [10, "Όχι", 1], [5, "Ναι", 5], ["7,5", "Ναι", 7.5], [null, null, null], ["-", null, null]];
  for (const [v, bp, want] of cases) assert.equal(D.parseGrade(v, bp), want, `${v}/${bp}`);
});

test("every sample course matches the catalog", () => {
  for (const r of SAMPLE_TRANSCRIPT) assert.ok(CATALOG.has(D.norm(r.name)), r.name);
});

test("records keep the passing attempt over earlier failures", () => {
  const recs = D.buildRecords(CATALOG, [row("Φυσική", 3), row("Φυσική", 65), row("Ηλεκτρονική", 4), row("Μικροηλεκτρονική", null)]);
  const get = n => recs.get(D.norm(n));
  assert.equal(get("Φυσική").status, "passed");
  assert.equal(get("Φυσική").grade, 6.5);
  assert.equal(get("Ηλεκτρονική").status, "failed");
  assert.deepEqual([...get("Ηλεκτρονική").failed], [4]);
  assert.equal(get("Μικροηλεκτρονική").status, "registered");
});

test("evaluate counts mandatory courses and the ECTS-weighted average", () => {
  const recs = D.buildRecords(CATALOG, [row("Γραμμική Άλγεβρα", 10), row("Προγραμματισμός Υπολογιστών", 5)]);
  const r = D.evaluate(recs, CUR, { stream: 3 });
  assert.equal(r.yDone, 2);
  assert.equal(r.ects, 10);
  assert.equal(r.avg, (10 * 4 + 5 * 6) / 10);
});

test("electives respect the caps and drop the weakest extras", () => {
  // 8 non-stream electives (cap 7) plus 3 general education (cap 2), stream 3.
  const nonStream = ["Διαχείριση Γνώσης", "Εξόρυξη Δεδομένων", "Θεωρία Παιγνίων", "Νευρωνικά Δίκτυα", "Ρομποτική", "Μηχατρονική", "Ρομποτική", "Ενσωματωμένα Συστήματα", "Παράλληλα Συστήματα"];
  const rows = nonStream.map((n, i) => row(n, 9 - i * 0.5))
    .concat([row("Διαχείριση Έργου", 10), row("Ιστορία της Τεχνολογίας", 10), row("Δίκαιο και Κυβερνοηθική", 10)]);
  const r = D.evaluate(D.buildRecords(CATALOG, rows), CUR, { stream: 3 });
  assert.equal(r.gp, 2);
  assert.equal(r.nonStream, 7);
  assert.equal(r.streamNeed, 5);
  assert.equal(r.total, 7);
  assert.ok(r.excess.length > 0);
  const keptMin = Math.min(...r.counted.filter(c => c.role === "EYO" || c.role === "GP").map(c => c.g));
  const droppedMax = Math.max(...r.excess.filter(c => c.group === "other").map(c => c.g));
  assert.ok(keptMin >= droppedMax);
});

test("internship lowers the elective total and the non-stream cap", () => {
  const r = D.evaluate(D.buildRecords(CATALOG, []), CUR, { stream: 1, internship: true });
  assert.equal(r.E, 11);
  assert.equal(r.otherCap, 6);
  assert.equal(r.coursesNeeded, 54);
});

test("projections only count with useProj and a passing grade", () => {
  const recs = D.buildRecords(CATALOG, []);
  const key = D.norm(CUR.thesis.name);
  assert.equal(D.evaluate(recs, CUR, { stream: 1, proj: { [key]: 9 } }).thesisDone, false);
  assert.equal(D.evaluate(recs, CUR, { stream: 1, proj: { [key]: 9 }, useProj: true }).thesisDone, true);
  assert.equal(D.evaluate(recs, CUR, { stream: 1, proj: { [key]: 4 }, useProj: true }).thesisDone, false);
});

test("an empty transcript leaves the full 300 ECTS to go", () => {
  const r = D.evaluate(D.buildRecords(CATALOG, []), CUR, { stream: 2 });
  assert.equal(r.remainingEcts, CUR.rules.totalEcts);
});

test("requiredAverage solves for the goal", () => {
  const res = { sum: 7 * 100, ects: 100, remainingEcts: 100 };
  const g = D.requiredAverage(res, 8);
  assert.equal(g.need, 9);
  assert.equal(g.best, 8.5);
  assert.equal(g.worst, 6);
  assert.equal(D.requiredAverage({ ...res, remainingEcts: 0 }, 8), null);
});

test("guessStream picks the stream with the most activity", () => {
  const recs = D.buildRecords(CATALOG, [row("Κρυπτογραφία", 8), row("Υπολογιστική Νέφους και Υπηρεσίες", 7), row("Ρομποτική", 6)]);
  assert.equal(D.guessStream(recs, CUR), 3);
});

test("parseTranscriptSheet reads the portal export layout", () => {
  const sheet = [
    ["Η Καρτέλα μου"],
    ["Κωδ. μαθήματος", "Μάθημα", "Βαθμός", "Εξ. περίοδος", "Β.Π.", "ECTS", "Τύπος μαθήματος"],
    ["ICE1-1006", 'ΦΥΣΙΚΗ <a id="x" class="btn"><span></span></a>', 72, "ΕΞΕΤΑΣΤΙΚΗ", "Ναι", 5, "Υποχρεωτικό"],
    [null, null, null],
  ];
  const rows = D.parseTranscriptSheet(sheet);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "ΦΥΣΙΚΗ");
  assert.equal(rows[0].ects, 5);
  assert.throws(() => D.parseTranscriptSheet([["κάτι άλλο"]]), /Κωδ\. μαθήματος/);
});
