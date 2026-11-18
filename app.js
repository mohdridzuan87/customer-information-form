/* Customer Information Form app - UI, local storage, PDF export */
(function () {
  "use strict";
  var STORE = "custinfo.forms.v1";
  var $ = function (id) { return document.getElementById(id); };

  function num(v) {
    var n = parseFloat(String(v === undefined || v === null ? "" : v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function money(n) { return Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* ---------- storage (phone only) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function saveAll(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); return true; }
    catch (e) { toast("Could not save - phone storage is full."); return false; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var forms = load();
  var current = null;

  /* ---------- schema (same order as the Excel form) ---------- */
  var T = function (key, label, o) { return Object.assign({ key: key, label: label, type: "text" }, o || {}); };
  var SECTIONS = [
    { title: "1. Sales Advisor", open: true, fields: [
      T("sa", "SALES ADVISOR NAME", { ph: "WAN JASNI" })] },
    { title: "2. Customer", open: true, fields: [
      T("name", "NAME"), T("ic", "I.C NUMBER", { mode: "numeric", nocaps: true, ic: true }), T("address", "ADDRESS", { type: "textarea" }),
      T("tel", "PHONE NUMBER", { type: "tel", mode: "tel", nocaps: true, phone: true }),
      T("guarantor", "GUARANTOR PHONE NUMBER", { type: "tel", mode: "tel", nocaps: true, phone: true }),
      T("email", "CUSTOMER EMAIL", { type: "email", nocaps: true })] },
    { title: "3. Vehicle", open: true, fields: [
      T("model", "CAR MODEL & SPEC"), T("colour", "COLOUR"), T("plat", "CAR REGISTERED NUMBER"),
      { key: "tradein", label: "TRADE IN", type: "select", options: ["", "YES", "NO"] },
      { key: "tradein_det", label: "TRADE IN DETAILS (REQUIRED)", type: "dep", dep: "tradein", ph: "CAR MODEL / REGISTERED NUMBER" },
      T("acc", "ADDITIONAL ACCESSORIES"),
      { key: "ncd", label: "NCD", type: "select", options: ["", "0%", "25%", "30%", "38.33%", "45%", "55%"] }] },
    { title: "4. Loan, insurance & service", open: true, fields: [
      T("loan", "LOAN (%)", { pct: true }), T("dp", "DOWN PAYMENT (%)", { pct: true }),
      { key: "duration", label: "LOAN DURATION", type: "select", options: ["", "1 TAHUN", "2 TAHUN", "3 TAHUN", "4 TAHUN", "5 TAHUN", "6 TAHUN", "7 TAHUN", "8 TAHUN", "9 TAHUN"] },
      { type: "checks", label: "INSURANCE", hint: "Choose either 1 or both.", items: [["ins_ws", "WINDSCREEN"], ["ins_sp", "SPECIAL PERIL"]] },
      { key: "svc", label: "SERVICE PACKAGE", type: "select", options: ["", "YES", "NO"] },
      { key: "svc_amt", label: "SERVICE PACKAGE AMOUNT (RM)", type: "svcamt", dep: "svc" }] },
    { title: "5. Other & remark", open: true, fields: [
      T("other", "OTHER"), T("remark", "REMARK", { type: "textarea", ph: "ADDITIONAL REMARK" })] }
  ];

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { if (k) e.appendChild(k); });
    return e;
  }
  function fieldEl(f) {
    if (f.type === "checks") {
      var boxes = f.items.map(function (it) {
        var cb = el("input", { type: "checkbox", "data-k": it[0] });
        return el("label", { class: "chk" }, [cb, el("span", { text: it[1] })]);
      });
      var nodes = [el("span", { text: f.label }), el("div", { class: "chkrow" }, boxes)];
      if (f.hint) nodes.push(el("div", { class: "hint", text: f.hint }));
      return el("div", { class: "f" }, nodes);
    }
    if (f.type === "svcamt") {
      var amt = el("input", { "data-k": f.key, type: "text", inputmode: "decimal", placeholder: "0.00", class: "mny" });
      return el("label", { class: "f", "data-dep": f.dep, hidden: "" }, [el("span", { text: f.label }), amt]);
    }
    if (f.type === "dep") {
      var di = el("input", { "data-k": f.key, type: "text", placeholder: f.ph || "", autocapitalize: "characters", class: "caps" });
      return el("label", { class: "f", "data-dep": f.dep, hidden: "" }, [el("span", { text: f.label }), di]);
    }
    if (f.type === "select") {
      var sel = el("select", { "data-k": f.key });
      f.options.forEach(function (o) { sel.appendChild(el("option", { value: o, text: o || "- select -" })); });
      return el("label", { class: "f" }, [el("span", { text: f.label }), sel]);
    }
    var input = el(f.type === "textarea" ? "textarea" : "input", { "data-k": f.key });
    if (f.type !== "textarea") input.setAttribute("type", f.type);
    if (f.ph) input.setAttribute("placeholder", f.ph);
    if (f.mode) input.setAttribute("inputmode", f.mode);
    if (f.ic) { input.setAttribute("placeholder", "000000-00-0000"); input.setAttribute("maxlength", "14"); input.className = "ic"; input.setAttribute("autocapitalize", "none"); }
    else if (f.phone) { input.setAttribute("placeholder", "012-345 6789"); input.setAttribute("maxlength", "13"); input.className = "phone"; input.setAttribute("autocapitalize", "none"); }
    else if (f.pct) { input.setAttribute("inputmode", "decimal"); input.setAttribute("placeholder", "0"); input.className = "pct"; }
    else if (!f.nocaps) { input.setAttribute("autocapitalize", "characters"); input.className = "caps"; }
    else input.setAttribute("autocapitalize", "none");
    return el("label", { class: "f" }, [el("span", { text: f.label }), input]);
  }
  function buildForm() {
    var form = $("form"); form.innerHTML = "";
    SECTIONS.forEach(function (s) {
      var d = el("details", { class: "sec" }, [el("summary", { text: s.title }), el("div", { class: "sec-body" }, s.fields.map(fieldEl))]);
      if (s.open) d.open = true;
      form.appendChild(d);
    });
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
  }

  function fillForm(data) {
    document.querySelectorAll("#form [data-k]").forEach(function (i) {
      var v = data[i.getAttribute("data-k")]; v = v === undefined || v === null ? "" : v;
      if (i.type === "checkbox") { i.checked = v === "1"; return; }
      if (i.tagName === "SELECT" && v && !Array.prototype.some.call(i.options, function (o) { return o.value === v; })) i.appendChild(el("option", { value: v, text: v }));
      i.value = v;
      if (i.className === "mny" && v) i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    refreshCalc();
  }
  function onInput(e) {
    var t = e.target, k = t.getAttribute && t.getAttribute("data-k");
    if (!k || !current) return;
    if (t.type === "checkbox") { current.data[k] = t.checked ? "1" : ""; scheduleSave(); return; }
    if (t.className === "mny") {
      var pos = t.selectionStart, before = t.value.slice(0, pos).replace(/[^0-9.]/g, "").length;
      var raw = t.value.replace(/[^0-9.]/g, ""), dot = raw.indexOf(".");
      if (dot >= 0) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, "").slice(0, 2);
      var ip = dot >= 0 ? raw.slice(0, dot) : raw, fp = dot >= 0 ? raw.slice(dot) : "";
      var out = ip.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") + fp;
      if (out !== t.value) {
        t.value = out;
        var n = 0, np = 0; while (np < out.length && n < before) { if (/[0-9.]/.test(out[np])) n++; np++; }
        try { t.setSelectionRange(np, np); } catch (x) { /* ignore */ }
      }
    }
    if (t.className === "ic") {
      var id = t.value.replace(/\D/g, "").slice(0, 12), icv = id;
      if (id.length > 6) icv = id.slice(0, 6) + "-" + id.slice(6, 8) + (id.length > 8 ? "-" + id.slice(8) : "");
      if (icv !== t.value) t.value = icv;
    }
    if (t.className === "phone") {
      var dg = t.value.replace(/\D/g, "").slice(0, 11), ph = dg;
      if (dg.length > 3) ph = dg.slice(0, 3) + "-" + dg.slice(3, dg.length >= 11 ? 7 : 6) + (dg.length > (dg.length >= 11 ? 7 : 6) ? " " + dg.slice(dg.length >= 11 ? 7 : 6) : "");
      if (ph !== t.value) t.value = ph;
    }
    if (t.className === "pct") {
      var pv = t.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
      if (pv !== t.value) t.value = pv;
    }
    if (t.className === "caps") {
      var up = t.value.toUpperCase();
      if (up !== t.value) { var p = t.selectionStart; t.value = up; try { t.setSelectionRange(p, p); } catch (x) { /* ignore */ } }
    }
    current.data[k] = t.value; refreshCalc(); scheduleSave();
  }
  function refreshCalc() {
    if (!current) return;
    var d = current.data;
    document.querySelectorAll("[data-dep]").forEach(function (w) { w.hidden = d[w.getAttribute("data-dep")] !== "YES"; });
    $("dueVal").textContent = d.name || "-";
  }
  var saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 300); }
  function saveCurrent() {
    if (!current) return;
    current.updated = Date.now();
    var i = forms.findIndex(function (o) { return o.id === current.id; });
    if (i < 0) forms.unshift(current); else forms[i] = current;
    saveAll(forms);
  }

  /* ---------- views ---------- */
  function showList() {
    saveCurrent(); current = null;
    $("listView").hidden = false; $("editView").hidden = true; $("editBar").hidden = true;
    $("backBtn").hidden = true;
    renderList(); window.scrollTo(0, 0);
  }
  function renderList() {
    forms.sort(function (a, b) { return b.updated - a.updated; });
    var box = $("orderList"); box.innerHTML = ""; $("emptyMsg").hidden = forms.length > 0;
    forms.forEach(function (o) {
      var d = o.data;
      var info = el("div", { class: "info" }, [
        el("div", { class: "name", text: d.name || "(no customer yet)" }),
        el("div", { class: "meta", text: [d.model, d.colour, d.plat].filter(Boolean).join(" | ") || "Draft" }),
        el("div", { class: "amt", text: d.tel || d.email || "" })]);
      var dup = el("button", { class: "small", text: "Copy" });
      var del = el("button", { class: "small danger", text: "Delete" });
      var card = el("div", { class: "order" }, [info, el("div", { class: "acts" }, [dup, del])]);
      info.addEventListener("click", function () { openForm(o.id); });
      dup.addEventListener("click", function () {
        var cp = { id: uid(), updated: Date.now(), data: JSON.parse(JSON.stringify(o.data)) };
        forms.unshift(cp); saveAll(forms); renderList(); toast("Copied");
      });
      del.addEventListener("click", function () {
        if (!confirm("Delete the form for " + (d.name || "this customer") + "? This cannot be undone.")) return;
        forms = forms.filter(function (x) { return x.id !== o.id; }); saveAll(forms); renderList();
      });
      box.appendChild(card);
    });
  }
  function openForm(id) {
    var o = forms.find(function (x) { return x.id === id; }); if (!o) return;
    current = o;
    $("listView").hidden = true; $("editView").hidden = false; $("editBar").hidden = false;
    $("backBtn").hidden = false;
    fillForm(o.data); window.scrollTo(0, 0); location.hash = "#edit";
  }
  function newForm() {
    var o = { id: uid(), updated: Date.now(), data: {} };
    forms.unshift(o); saveAll(forms); openForm(o.id);
  }

  /* ---------- PDF (A4 portrait, laid out like the paper form) ---------- */
  function buildPdf(d) {
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var L = 20, R = 190, LX = 74;
    function lab(t, x, y) { doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(t, x, y); }
    function line(x1, x2, y, val) {
      if (typeof val === "string") val = val.toUpperCase();
      doc.setDrawColor(90); doc.setLineWidth(0.2); doc.line(x1, y + 1.2, x2, y + 1.2);
      if (val) {
        var fs = 12; doc.setFont("helvetica", "bold"); doc.setFontSize(fs);
        while (fs > 7 && doc.getTextWidth(String(val)) > x2 - x1 - 2) { fs -= 0.5; doc.setFontSize(fs); }
        doc.text(String(val), x1 + 1, y);
      }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("CUSTOMER INFORMATION FORM", 105, 18, { align: "center" });
    doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.text("FOR SALES ADVISOR REFERENCE", 105, 24, { align: "center" });
    doc.setDrawColor(200, 16, 46); doc.setLineWidth(0.8); doc.line(L, 27, R, 27);

    var ins = [d.ins_ws === "1" ? "WINDSCREEN" : "", d.ins_sp === "1" ? "SPECIAL PERIL" : ""].filter(Boolean).join(" + ");
    var svc = d.svc === "YES" ? ("YES" + (d.svc_amt ? " - RM " + money(num(d.svc_amt)).replace(/\.00$/, "") : "")) : (d.svc || "");
    var pc = function (v) { return v ? v + " %" : ""; };
    var trade = d.tradein === "YES" ? ("YES" + (d.tradein_det ? " - " + d.tradein_det : "")) : (d.tradein || "");
    var y = 37;
    var rows = [["SALES ADVISOR NAME", d.sa], ["NAME", d.name], ["I.C NUMBER", d.ic], ["ADDRESS", "@addr"], ["PHONE NUMBER", d.tel], ["GUARANTOR PHONE NUMBER", d.guarantor],
      ["CUSTOMER EMAIL", d.email], ["CAR MODEL & SPEC", d.model], ["COLOUR", d.colour], ["NCD", d.ncd], ["ADDITIONAL ACCESSORIES", d.acc],
      ["LOAN (%)", pc(d.loan)], ["DOWN PAYMENT (%)", pc(d.dp)], ["LOAN DURATION", d.duration], ["INSURANCE", ins],
      ["SERVICE PACKAGE", svc], ["CAR REGISTERED NUMBER", d.plat], ["TRADE IN", trade], ["OTHER", d.other]];
    rows.forEach(function (r) {
      lab(r[0], L, y); lab(":", LX - 3, y);
      if (r[1] === "@addr") {
        var parts = doc.splitTextToSize(String(d.address || "").toUpperCase().replace(/\s+/g, " "), R - LX - 2);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        line(LX, R, y, parts[0] || ""); y += 9.4;
        line(LX, R, y, parts.slice(1).join(" "));
      } else line(LX, R, y, r[1]);
      y += 9.4;
    });
    lab("REMARK", L, y); lab(":", LX - 3, y);
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(LX, y - 5, R - LX, 40, "S");
    if (d.remark) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
      doc.text(doc.splitTextToSize(String(d.remark).toUpperCase(), R - LX - 4).slice(0, 8), LX + 2, y);
    }
    return doc;
  }
  function fileName(d) {
    var s = (d.name || "customer").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return "Customer_Information_" + s + ".pdf";
  }
  function openSheet() {
    if (current.data.tradein === "YES" && !String(current.data.tradein_det || "").trim()) {
      toast("Please fill in the trade-in details."); var ti = document.querySelector('[data-k="tradein_det"]'); if (ti) ti.focus(); return;
    }
    saveCurrent();
    var blob, name;
    try { blob = buildPdf(current.data).output("blob"); name = fileName(current.data); } catch (e) { toast("Could not create PDF: " + e.message); return; }
    var url = URL.createObjectURL(blob), body = $("sheetBody"); body.innerHTML = "";
    body.appendChild(el("div", { class: "fname", text: name + "  (" + Math.round(blob.size / 1024) + " KB, A4 1 page)" }));
    body.appendChild(el("a", { class: "primary act", href: url, download: name, text: "Download PDF" }));
    var file = null; try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) { /* old browser */ }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      var sh = el("button", { class: "primary act sec2", type: "button", text: "Share (WhatsApp, Email, Drive...)" });
      sh.addEventListener("click", function () { navigator.share({ files: [file], title: name }).catch(function (e) { if (e.name !== "AbortError") toast("Share failed: " + e.message); }); });
      body.appendChild(sh);
    }
    body.appendChild(el("a", { class: "primary act sec2", href: url, target: "_blank", rel: "noopener", text: "Open / Print" }));
    $("sheet").hidden = false; $("sheet").dataset.url = url;
  }
  function closeSheet() {
    $("sheet").hidden = true; var u = $("sheet").dataset.url;
    if (u) setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  var toastTimer;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600); }

  /* ---------- wire up ---------- */
  buildForm();
  $("newBtn").addEventListener("click", newForm);
  $("backBtn").addEventListener("click", function () { if (location.hash === "#edit") history.back(); else showList(); });
  $("pdfBtn").addEventListener("click", openSheet);
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") closeSheet(); });
  window.addEventListener("hashchange", function () { if (location.hash !== "#edit" && current) showList(); });
  window.addEventListener("pagehide", saveCurrent);
  document.addEventListener("visibilitychange", function () { if (document.hidden) saveCurrent(); });
  if (location.hash === "#edit") history.replaceState(null, "", location.pathname);
  showList();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
  window.__ci = { buildPdf: buildPdf, forms: function () { return forms; } };
})();
