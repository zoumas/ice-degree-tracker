// Διεπαφή: διαβάζει την καρτέλα, κρατάει τις προβλέψεις στον browser και ζωγραφίζει τη σελίδα.
(function () {
  "use strict";

  const CUR = window.CURRICULUM, D = window.Degree;
  const CATALOG = D.buildCatalog(CUR);
  const SEM = ["", "Α'", "Β'", "Γ'", "Δ'", "Ε'", "ΣΤ'", "Ζ'", "Η'", "Θ'", "Ι'"];
  const ROLE = { Y: "Υποχρεωτικά", BR: "Βασικά Ροής", EYS: "ΕΥ της ροής", EYO: "ΕΥ εκτός ροής", GP: "Γενικής Παιδείας", THESIS: "Διπλωματική" };
  const $ = id => document.getElementById(id);

  // localStorage μπορεί να λείπει (ιδιωτικό παράθυρο), οπότε κάθε πρόσβαση είναι σε try.
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ice-degree:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ice-degree:" + k, JSON.stringify(v)); } catch { /* no storage */ } },
    del(k) { try { localStorage.removeItem("ice-degree:" + k); } catch { /* no storage */ } },
  };

  const SAMPLE = { rows: window.SAMPLE_TRANSCRIPT, label: null, sample: true };
  let transcript = window.EMBEDDED_TRANSCRIPT || store.get("transcript", null) || SAMPLE;
  let state = {
    stream: store.get("stream", null),
    internship: store.get("internship", false),
    proj: store.get("proj", {}),
    goal: store.get("goal", 7.5),
    error: null,
  };
  if (state.stream === null) state.stream = D.guessStream(D.buildRecords(CATALOG, transcript.rows), CUR);

  const fmt = (n, d = 2) => (n === null || n === undefined ? "–" : n.toLocaleString("el-GR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fg = g => g.toLocaleString("el-GR", { maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const STATUS = {
    registered: () => ` <span class="pill info">Δηλωμένο</span>`,
    failed: r => ` <span class="pill bad">Κόπηκες: ${r.failed.map(fg).join(", ")}</span>`,
    none: () => "",
  };

  function inputRow(r) {
    const p = state.proj[r.key], has = typeof p === "number";
    const meta = [r.sem ? SEM[r.sem] + " εξάμηνο" : null, r.stream && r.cat !== "Y" ? "ΡΕ-" + r.stream : null, r.cat === "GP" ? "Γενικής Παιδείας" : null]
      .filter(Boolean).join(" · ");
    return `<div class="row ${r.status === "failed" ? "failed" : ""}"><div class="nm"><span>${esc(r.name)}${STATUS[r.status](r)}</span>${meta ? `<span class="meta">${meta}</span>` : ""}</div>
      <span class="ects num">${r.ects} ECTS</span>
      <input type="number" min="0" max="10" step="0.1" placeholder="βαθμός" aria-label="Πρόβλεψη βαθμού για ${esc(r.name)}"
        id="p-${esc(r.key).replace(/ /g, "_")}" data-key="${esc(r.key)}" class="${has ? "has" : ""}" value="${has ? p : ""}"></div>`;
  }

  function reqCard(title, done, need, projDone, body, extra = "") {
    const pill = done >= need ? `<span class="pill ok">Ολοκληρώθηκε</span>`
      : projDone >= need ? `<span class="pill proj">Ολοκληρώνεται με τις προβλέψεις</span>`
      : `<span class="pill bad">Λείπουν ${need - Math.max(done, projDone)}</span>`;
    return `<div class="req"><div class="req-head"><h3>${title}</h3><span><span class="count">${done}/${need}</span> ${pill}</span></div>${extra}${body ? `<div class="rows">${body}</div>` : ""}</div>`;
  }

  function renderBanner() {
    const b = $("banner");
    b.className = "banner" + (state.error ? " error" : "");
    if (state.error) b.textContent = state.error;
    else if (transcript.sample) b.innerHTML = "Βλέπεις <b>παράδειγμα</b> με φανταστικούς βαθμούς. Κατέβασε από το φοιτητολόγιο την καρτέλα «Όλα τα μαθήματα» σε Excel και φόρτωσέ την.";
    else b.textContent = "Δεδομένα: " + transcript.label;
    $("reset").hidden = !!transcript.sample || !!window.EMBEDDED_TRANSCRIPT;
  }

  function render() {
    const recs = D.buildRecords(CATALOG, transcript.rows);
    const opts = { stream: state.stream, internship: state.internship, proj: state.proj };
    const now = D.evaluate(recs, CUR, { ...opts, useProj: false });
    const pr = D.evaluate(recs, CUR, { ...opts, useProj: true });
    const hasProj = pr.counted.some(c => c.proj);
    const st = now.stream;
    renderBanner();

    const totalNeed = now.coursesNeeded;
    const nowPct = Math.min(100, (now.courses / totalNeed) * 100);
    const prPct = Math.max(0, Math.min(100, (pr.courses / totalNeed) * 100) - nowPct);
    const thesisProj = state.proj[now.thesis.key];
    $("summary").innerHTML = `
      <div class="tile"><span class="eyebrow">Μ.Ο. σήμερα</span><span class="big num">${fmt(now.avg)}</span><span class="sub">σε ${now.ects} ECTS που μετράνε</span></div>
      <div class="tile"><span class="eyebrow">Μ.Ο. με προβλέψεις</span><span class="big num ${hasProj ? "proj" : ""}">${hasProj ? fmt(pr.avg) : "–"}</span><span class="sub">${hasProj ? `σε ${pr.ects} ECTS` : "γράψε βαθμούς παρακάτω"}</span></div>
      <div class="tile"><span class="eyebrow">Μαθήματα</span><span class="big num">${now.courses}<small>/${totalNeed}</small></span>
        <div class="bar" role="img" aria-label="${now.courses} από ${totalNeed} μαθήματα"><i style="width:${nowPct}%"></i><i class="p" style="width:${prPct}%"></i></div></div>
      <div class="tile"><span class="eyebrow">Διπλωματική</span><span class="big num">${now.thesisDone ? fg(now.thesis.grade) : pr.thesisDone ? `<span class="proj-text">${fg(thesisProj)}</span>` : "–"}</span>
        <span class="sub">${now.thesisDone ? "περασμένη" : now.thesis.status === "registered" ? `δηλωμένη, ${CUR.thesis.ects} ECTS` : `${CUR.thesis.ects} ECTS`}</span></div>`;

    // Requirements
    const all = [...recs.values()];
    const order = r => (r.status === "registered" ? 0 : r.status === "failed" ? 1 : 2);
    const byStatus = (a, b) => order(a) - order(b) || a.name.localeCompare(b.name, "el");
    const missY = now.missingY.slice().sort((a, b) => a.sem - b.sem);
    const streamOpts = all.filter(r => r.status !== "passed" && r.stream === st && r.cat === "EY").sort(byStatus);
    const otherOpts = all.filter(r => r.status !== "passed" && r.stream !== st && ["EY", "GP", "DEPT", "BR"].includes(r.cat)).sort(byStatus);
    const R = CUR.rules;
    const eyNote = `<p class="note">Ροής ${CUR.streams[st]}: <b class="num">${now.streamTaken}/${R.streamElectivesMin}</b> ελάχιστο${pr.streamTaken > now.streamTaken ? ` (<span class="proj-text">${pr.streamTaken} με προβλέψεις</span>)` : ""}.
      Εκτός ροής: <b class="num">${now.nonStream}/${now.otherCap}</b> μέγιστο${now.nonStream >= now.otherCap ? ", γεμάτο: όσα λείπουν πρέπει να είναι της ροής σου" : ""}.
      Γενικής Παιδείας: <b class="num">${now.gp}/${R.generalMax}</b> μέγιστο.${now.excess.length ? `<br>${now.excess.length} περασμένα ΕΥ περισσεύουν και μένουν εκτός Μ.Ο.` : ""}</p>`;
    const eyBody = streamOpts.map(inputRow).join("") + `<details><summary>Μαθήματα εκτός ροής (${otherOpts.length})</summary>${otherOpts.map(inputRow).join("")}</details>`;
    $("reqs").innerHTML =
      reqCard("Υποχρεωτικά", now.yDone, R.mandatory, pr.yDone, missY.map(inputRow).join("")) +
      reqCard(`Βασικά Ροής · ΡΕ-${st}`, now.brDone, R.basic, pr.brDone, now.missingBR.map(inputRow).join("")) +
      reqCard("Επιλογής Υποχρεωτικά (ΕΥ)", now.total, now.E, pr.total, eyBody, eyNote) +
      reqCard("Διπλωματική Εργασία", now.thesisDone ? 1 : 0, 1, pr.thesisDone ? 1 : 0, now.thesisDone ? "" : inputRow(now.thesis));

    // Goal
    const g = D.requiredAverage(now, state.goal);
    $("goalOut").innerHTML = !g ? "Δεν μένουν μαθήματα."
      : g.need > 10 ? `Δεν γίνεται: με 10 παντού φτάνεις <b class="num">${fmt(g.best)}</b>. Δες αν μπορείς να πάρεις παραπάνω ΕΥ της ροής σου για να βγουν εκτός Μ.Ο. τα χαμηλότερα.`
      : g.need <= 5 ? `Το έχεις: ακόμα και με 5 παντού βγαίνεις <b class="num">${fmt(g.worst)}</b>.`
      : `Χρειάζεσαι μέσο όρο <b class="num proj-text">${fmt(g.need)}</b> στα ${g.rem} ECTS που μένουν (μαζί με τη Διπλωματική αν λείπει). Εύρος πτυχίου: ${fmt(g.worst)} έως ${fmt(g.best)}.`;

    // Ledger
    const groups = Object.keys(ROLE).map(role => [role, now.counted.filter(c => c.role === role)]).filter(([, l]) => l.length);
    const line = (c, cls = "") => `<tr class="${cls}"><td>${esc(c.r.name)}</td><td>${c.r.sem ? SEM[c.r.sem] : "–"}</td><td>${esc(c.r.period || "")}</td><td class="n">${c.r.ects}</td><td class="n">${fg(c.g)}</td></tr>`;
    let html = `<thead><tr><th>Μάθημα</th><th>Εξάμηνο</th><th>Εξεταστική</th><th class="n">ECTS</th><th class="n">Βαθμός</th></tr></thead><tbody>`;
    for (const [role, list] of groups) {
      list.sort((a, b) => (a.r.sem || 99) - (b.r.sem || 99) || a.r.name.localeCompare(b.r.name, "el"));
      const s = list.reduce((a, c) => a + c.g * c.r.ects, 0), e = list.reduce((a, c) => a + c.r.ects, 0);
      html += `<tr class="group"><td colspan="3">${ROLE[role]} · ${list.length}</td><td class="n">${e}</td><td class="n">${fmt(s / e)}</td></tr>` + list.map(c => line(c)).join("");
    }
    if (now.excess.length) html += `<tr class="group"><td colspan="5">Εκτός Μ.Ο. (περισσεύουν) · ${now.excess.length}</td></tr>` + now.excess.map(c => line(c, "excess")).join("");
    if (!groups.length) html += `<tr><td colspan="5">Δεν υπάρχουν ακόμα περασμένα μαθήματα.</td></tr>`;
    $("ledger").innerHTML = html + "</tbody>";
  }

  function renderStatic() {
    const R = CUR.rules;
    $("dept").textContent = CUR.department;
    $("stream").innerHTML = Object.entries(CUR.streams).map(([k, v]) => `<option value="${k}">ΡΕ-${k} ${esc(v)}</option>`).join("");
    $("rules").innerHTML = [
      `${R.mandatory + R.basic + R.electives} μαθήματα: ${R.mandatory} Υποχρεωτικά, ${R.basic} Βασικά Ροής, ${R.electives} Επιλογής Υποχρεωτικά (ΕΥ), και ${esc(CUR.thesis.name)} (${CUR.thesis.ects} ECTS).`,
      `Από τα ΕΥ: τουλάχιστον ${R.streamElectivesMin} της ροής σου, το πολύ ${R.otherElectivesMax} από άλλες ροές, Γενικής Παιδείας ή άλλα τμήματα, και από αυτά το πολύ ${R.generalMax} Γενικής Παιδείας.`,
      `Με Πρακτική Άσκηση: ${R.electivesWithInternship} ΕΥ, το πολύ ${R.otherElectivesMaxWithInternship} εκτός ροής. Η Πρακτική δεν έχει βαθμό και δεν μπαίνει στον μέσο όρο.`,
      "Βαθμός πτυχίου = Σ(βαθμός × ECTS) / Σ ECTS, μόνο για τα μαθήματα που μετράνε στο πτυχίο. Αν έχεις περάσει παραπάνω ΕΥ από όσα χρειάζονται, κρατιούνται αυτόματα τα καλύτερα και τα υπόλοιπα σημειώνονται «εκτός Μ.Ο.». Ποια εξαιρούνται τελικά το δηλώνεις στη Γραμματεία.",
      "Πηγές: " + CUR.sources.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join(", ") + ".",
    ].map(li => `<li>${li}</li>`).join("");
    $("checked").textContent = `Πρόγραμμα σπουδών ελεγμένο στις ${new Date(CUR.lastChecked).toLocaleDateString("el-GR")}.`;
    $("stream").value = String(state.stream);
    $("internship").checked = state.internship;
    $("goal").value = state.goal;
  }

  async function loadFile(file) {
    if (!window.XLSX) throw new Error("Δεν φόρτωσε η βιβλιοθήκη ανάγνωσης Excel. Έλεγξε τη σύνδεση και ξαναδοκίμασε.");
    const wb = window.XLSX.read(await file.arrayBuffer());
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
    return D.parseTranscriptSheet(rows);
  }

  $("stream").addEventListener("change", e => { state.stream = Number(e.target.value); store.set("stream", state.stream); render(); });
  $("internship").addEventListener("change", e => { state.internship = e.target.checked; store.set("internship", state.internship); render(); });
  $("goal").addEventListener("input", e => { const v = parseFloat(e.target.value); if (isFinite(v)) { state.goal = v; store.set("goal", v); render(); } });
  $("clear").addEventListener("click", () => { state.proj = {}; store.set("proj", {}); render(); });
  $("reset").addEventListener("click", () => {
    transcript = SAMPLE; state.proj = {}; state.error = null;
    store.del("transcript"); store.del("stream"); store.set("proj", {});
    state.stream = D.guessStream(D.buildRecords(CATALOG, transcript.rows), CUR);
    $("stream").value = String(state.stream);
    render();
  });
  $("reqs").addEventListener("change", e => {
    const key = e.target.dataset && e.target.dataset.key;
    if (!key) return;
    const v = parseFloat(String(e.target.value).replace(",", "."));
    if (isFinite(v) && v >= 0 && v <= 10) state.proj[key] = v; else delete state.proj[key];
    store.set("proj", state.proj);
    const id = e.target.id;
    render();
    const next = document.getElementById(id);
    if (next) next.focus();
  });
  $("upload").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await loadFile(file);
      transcript = { rows, label: `${file.name}, φορτώθηκε ${new Date().toLocaleDateString("el-GR")}` };
      state.error = null;
      state.proj = {};
      state.stream = D.guessStream(D.buildRecords(CATALOG, rows), CUR);
      store.set("transcript", transcript); store.set("proj", {}); store.set("stream", state.stream);
      $("stream").value = String(state.stream);
    } catch (err) {
      state.error = `Η φόρτωση απέτυχε: ${err.message} Κατέβασε την καρτέλα «Όλα τα μαθήματα» ως Excel από το φοιτητολόγιο και ξαναδοκίμασε.`;
    }
    e.target.value = "";
    render();
  });

  renderStatic();
  render();
})();
