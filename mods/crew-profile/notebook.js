// The profile panel's Notebook tab (stage 4 of docs/profiles/proposal.md): the pal's daily journal,
// newest day first, today live. Each entry: when, #channel, task, how long; what it did; its
// hiccups (amber, with what they cost); what it needed (tool / skill / rule / context / access);
// what it learned. Written by the pal (`pal notebook`); the owner can delete an entry (a copy of the
// day is kept). The Dream loop (stage 5) reads the hiccups.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { notify } from "herdr";
import { crewCli, panelTab, shortDate, shortTime } from "./crew.js";

export function initNotebook(view, cx) {
  view.nb = null; view.nbFor = null; view.nbFilter = "all"; view.nbArmed = null;
  view.nbView = "notebook"; view.dreams = null; view.dreaming = false;
  cx.timer.every(10000, (cx) => { if (view.isOpen() && panelTab() === "notebook" && view.nbView === "dreams") loadDreams(view, cx); });
  cx.timer.every(5000, (cx) => { if (view.isOpen() && panelTab() === "notebook") loadNotebook(view, cx, true); });
  cx.timer.every(400, (cx) => {
    const s = view.shown();
    if (s && view.isOpen() && panelTab() === "notebook" && view.nbFor !== s.bot.name && !view.nbLoading) loadNotebook(view, cx);
  });
}

export function loadNotebook(view, cx, quiet = false) {
  const s = view.shown();
  if (!s) return;
  const name = s.bot.name;
  view.nbLoading = true;
  cx.spawn(async (cx) => {
    try {
      const nb = JSON.parse(await crewCli(["notebook", "ls", name, "--days", "14", "--json"]));
      if (view.shown()?.bot.name === name) { view.nb = nb; view.nbFor = name; }
    } catch (e) { if (!quiet) notify({ title: "Couldn't read the notebook", body: String(e.message ?? e).slice(0, 200), level: "warning" }); view.nbFor = name; }
    view.nbLoading = false;
    cx.notify();
  });
}

const fmtMin = (m) => (m >= 60 ? `~${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `~${m}m`);
const KIND_TONE = { tool: "info", skill: "info", rule: "warn", context: null, access: "warn" };

function tag(d, text, tone) {
  const c = { info: [d.infoText, "#4CA1F255"], warn: [d.warnText, "#E8AA0A55"] }[tone] ?? [d.fg2, d.lineMid];
  return div().h(16).min_w(50).px(5).flex().flex_none().items_center().justify_center().rounded(d.r.xs).border_1().border_color(c[1])
    .text_size(10).font_family(d.mono).font_weight(500).text_color(c[0]).child(text);
}

function loadDreams(view, cx) {
  cx.spawn(async (cx) => {
    try { view.dreams = JSON.parse(await crewCli(["dream", "ls", "--json"])); } catch {}
    cx.notify();
  });
}

const STATUS_TONE = { open: null, proposed: "info", watching: null, resolved: "ok", recurred: "warn", declined: null };

// The head pal's Notebook tab has a second view: the Dream loop's patterns and how they turned out.
function dreamsView(view, d) {
  const st = view.dreams;
  const body = v_flex().gap(0);
  if (!st) return body.child(div().py(8).text_size(12).text_color(d.fg3).child("Reading the dream ledger…"));
  const cells = [[st.proposed, "proposed"], [st.accepted, "accepted"], [st.resolved, "resolved", d.okHi], [st.recurred, "recurred", d.warnText]];
  const grid = h_flex().rounded(d.r.md).border_1().border_color(d.line);
  cells.forEach(([v, l, c], i) => grid.child(v_flex().flex_1().px(10).py(8).when(i > 0, (el) => el.border_l_1().border_color(d.line))
    .child(div().text_size(18).line_height("22px").font_weight(600).text_color(c ?? d.fg1).child(String(v)))
    .child(div().text_size(11).text_color(d.fg2).child(l))));
  body.child(v_flex().py(12).gap(8).border_t_1().border_color(d.line)
    .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.fg3).child("THIS MONTH"))
    .child(grid)
    .child(div().text_size(11).text_color(d.fg3).child(`${fmtMin(st.minutes_week)} of hiccups this week${st.last ? ` · last dream ${`${shortDate(st.last)} ${shortTime(st.last)}`}` : ""}`)));
  const pats = v_flex().rounded(d.r.md).border_1().border_color(d.line);
  if (!st.patterns.length) pats.child(div().p(10).text_size(12).text_color(d.fg3).child("No patterns yet: they come from the pals' notebook hiccups."));
  st.patterns.slice(0, 20).forEach((p, i) => pats.child(v_flex().id(`dv-${p.id}`).px(10).py(7).gap(2).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
    .child(h_flex().items_center().gap(8)
      .child(div().w(28).flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(p.id))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg1).child(p.summary))
      .child(tag(d, p.status, STATUS_TONE[p.status])))
    .child(div().pl(36).text_size(11).text_color(d.fg3).child(`${p.pals?.length ?? 0} pal(s) · ${p.count}x · ${fmtMin(p.minutes)}${p.kind ? ` · ${p.kind}` : ""}`))));
  body.child(v_flex().py(12).gap(8).border_t_1().border_color(d.line)
    .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.fg3).child("PATTERNS")).child(pats));
  body.child(v_flex().py(12).gap(6).border_t_1().border_color(d.line)
    .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.fg3).child("DJM INTAKE DRAFTS"))
    .children(st.intake.length ? st.intake.map((f) => div().text_size(11).font_family(d.mono).text_color(d.body).child(f)) : [div().text_size(12).text_color(d.fg3).child("None.")])
    .child(div().text_size(11).line_height("15px").text_color(d.fg3).child("Drafts only (data/crew-dream/intake/). You file them; the loop never writes DJM OS's Learning Ledger.")));
  return body;
}

export function notebookTab(view, space, bot, d, full) {
  const nb = view.nb && view.nbFor === bot.name ? view.nb : null;
  const body = v_flex().px(16).pb(24);
  if (bot.god) {
    const seg = h_flex().rounded(d.r.sm).border_1().border_color(d.lineMid).overflow_hidden();
    [["notebook", "Notebook"], ["dreams", "Dreams"]].forEach(([k, label], i) => {
      const on = view.nbView === k;
      seg.child(div().id(`nb-v-${k}`).h(26).px(12).flex().items_center().when(i > 0, (el) => el.border_l_1().border_color(d.lineMid))
        .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover))
          .on_click((_e, cx) => { view.nbView = k; if (k === "dreams") loadDreams(view, cx); cx.notify(); }))
        .text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(label));
    });
    const row = h_flex().pt(14).items_center().gap(10).child(seg).child(div().flex_1());
    if (view.nbView === "dreams") {
      row.child(div().id("nb-dream-now").h(26).px(10).flex().items_center().rounded(d.r.sm).border_1().border_color(d.lineMid)
        .when(!view.dreaming, (el) => el.cursor_pointer().hover((s) => s.border_color(d.lineStrong)).on_click((_e, cx) => {
          view.dreaming = true;
          cx.spawn(async (cx) => {
            try { const out = await crewCli(["dream"]); notify({ title: "Dreamed", body: out.trim().split("\n").slice(0, 3).join(" · ").slice(0, 240), level: "success", timeout: 5000 }); }
            catch (e) { notify({ title: "The dream didn't run", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
            view.dreaming = false;
            loadDreams(view, cx);
          });
          cx.notify();
        }))
        .text_size(12).font_weight(500).text_color(view.dreaming ? d.fg3 : d.body).child(view.dreaming ? "Dreaming…" : "Dream now"));
      return body.child(row).child(div().h(12)).child(dreamsView(view, d));
    }
    body.child(row);
  }
  if (!nb) return body.child(div().py(16).text_size(12).text_color(d.fg3).child("Reading the notebook…"));
  const f = view.nbFilter;
  // The filter, and the week.
  const seg = h_flex().rounded(d.r.sm).border_1().border_color(d.lineMid).overflow_hidden();
  [["all", "All"], ["hiccups", "Hiccups"], ["lessons", "Lessons"]].forEach(([k, label], i) => {
    const on = f === k;
    seg.child(div().id(`nb-f-${k}`).h(26).px(12).flex().items_center().when(i > 0, (el) => el.border_l_1().border_color(d.lineMid))
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { view.nbFilter = k; cx.notify(); }))
      .text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(label));
  });
  const w = nb.week;
  body.child(h_flex().py(14).items_center().gap(10).child(seg).child(div().flex_1())
    .child(div().text_size(11).text_color(d.fg3).child("this week · "))
    .child(div().text_size(11).text_color(w.hiccups ? d.warnText : d.fg3).child(`${w.hiccups} hiccup${w.hiccups === 1 ? "" : "s"}`))
    .when(w.minutes > 0, (el) => el.child(div().text_size(11).text_color(d.fg3).child(` · ${fmtMin(w.minutes)} lost`))));
  if (!nb.days.length) {
    return body.child(div().pt(4).text_size(12).line_height("17px").text_color(d.fg3)
      .child(`Nothing yet. ${bot.name} writes here after real work: what it did, what got in the way and what it cost, what it would have needed, what it learned.`));
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const day of nb.days) {
    const entries = day.entries.slice().reverse().filter((e) => f === "all" || (f === "hiccups" ? e.hiccups.length || e.needed.length : e.lesson));
    if (!entries.length) continue;
    const label = day.day === today ? `Today · ${shortDate(new Date(day.day + "T12:00").getTime())}`
      : shortDate(new Date(day.day + "T12:00").getTime(), true);
    body.child(h_flex().pt(12).pb(6).items_center().gap(8).border_t_1().border_color(d.line)
      .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.fg2).child(label.toUpperCase()))
      .when(day.day === today, (el) => el.child(h_flex().items_center().gap(5).child(div().size(6).rounded(3).bg(d.ok)).child(div().text_size(11).text_color(d.okHi).child("live")))));
    entries.forEach((e, i) => {
      const key = `${day.day}-${e.time}-${e.channel ?? ""}`;
      const armed = view.nbArmed === key;
      const head = [e.time, e.channel, e.task, e.took].filter(Boolean).join(" · ");
      const ent = v_flex().id(`nb-e-${key}`).gap(4).py(8).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
        .child(h_flex().items_center().gap(8)
          .child(div().flex_1().text_size(11).font_family(d.mono).text_color(d.fg3).child(head))
          .child(div().id(`nb-rm-${key}`).text_size(11).text_color(armed ? d.err : d.fg4).cursor_pointer().hover((s) => s.text_color(d.err))
            .on_click((_e, cx) => {
              if (!armed) { view.nbArmed = key; cx.notify(); return; }
              view.nbArmed = null;
              cx.spawn(async (cx) => {
                try { await crewCli(["notebook", "rm", bot.name, day.day, e.time]); } catch (err) { notify({ title: "Couldn't remove it", body: String(err.message ?? err).slice(0, 200), level: "warning" }); }
                loadNotebook(view, cx, true);
              });
            })
            .child(armed ? "Click again to delete" : "×")));
      if (e.did && f !== "lessons") ent.child(div().text_size(12).line_height("17px").text_color(d.body).child(e.did));
      if (f !== "lessons") {
        for (const h of e.hiccups) ent.child(h_flex().items_start().gap(8).child(tag(d, "hiccup", "warn"))
          .child(div().flex_1().min_w(0).text_size(12).line_height("17px").text_color(d.body).child(h.text)));
        for (const n of e.needed) ent.child(h_flex().items_start().gap(8).child(tag(d, n.kind, KIND_TONE[n.kind]))
          .child(div().flex_1().min_w(0).text_size(12).line_height("17px").text_color(d.body).child(n.text)));
      }
      if (e.lesson) ent.child(h_flex().items_start().gap(8).child(tag(d, "lesson", null))
        .child(div().flex_1().min_w(0).text_size(12).line_height("17px").text_color(d.fg1).child(e.lesson)));
      body.child(ent);
    });
  }
  return body;
}
