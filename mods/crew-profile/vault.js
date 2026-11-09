// The profile panel's Vault tab (DeNon 2026-11-08: direction A of the Pal Vault canvas; "vault
// replaces notebook mission and brain"). A pal's memory folder is already a vault of plain markdown
// (MEMORY.md, brain/, notebook/); this tab is a view over it. Its notes:
//   Home     a note that writes itself (vaultdata.js): mission and focus, the channels working
//            now, the task board, today's journal, the week, the latest decisions and changes
//   Mission  / Journal (the notebook) / Brain: the three tabs it replaced, unchanged inside
// Full: the vault's file tree | the note | the week and what's on disk. Side: a note strip over the note.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, exec, openOverlay, shared } from "herdr";
import { openPanel, panelNote, channelName, channelOrder, ago, taskFor, taskTitle, tabHasAgent, modelOf, briefOf } from "./crew.js";
import { homeData, fmtMinutes, NOTES } from "./vaultdata.js";
import { missionTab, brainTab, openBrainFile } from "./project.js";
import { notebookTab } from "./notebook.js";

const home = (p) => String(p ?? "").replace(/^\/home\/[^/]+/, "~");

// Switch note; leaving a note drops its half-done edit or open file.
function show(view, key) {
  view.edit = null; view.review = null;
  if (key === "brain") view.brainFile = null;
  view.brainSeq = (view.brainSeq ?? 0) + 1;   // a file still on its way is no longer wanted
  openPanel(key);
}

export function vaultView(view, space, bot, t, d, full) {
  const note = panelNote() ?? "home";
  const body = note === "mission" ? missionTab(view, space, bot, d, full)
    : note === "notebook" ? notebookTab(view, space, bot, d, full)
    : note === "brain" ? brainTab(view, space, bot, d, full)
    : homeNote(view, space, bot, d, full);
  const scroll = (el) => div().id(`vault-scroll-${note}`).flex_1().min_w(0).min_h(0).overflow_y_scrollbar().child(el);
  if (!full) return v_flex().flex_1().min_h(0).child(noteStrip(view, d, note)).child(scroll(body));
  return h_flex().flex_1().min_h(0).items_start()
    .child(tree(view, space, bot, d, note))
    .child(scroll(h_flex().w_full().justify_center().child(div().w_full().max_w(820).pt(8).child(body))))
    .when(note === "home", (el) => el.child(rail(view, space, bot, d)));
}

// ─── Side: the note strip ─────────────────────────────────────────────────────────────────────
function noteStrip(view, d, cur) {
  const strip = h_flex().h(34).flex_none().items_center().gap(2).px(12).border_b_1().border_color(d.line);
  for (const [key, label] of NOTES) {
    const on = key === cur;
    strip.child(div().id(`vn-${key}`).h(24).px(8).flex().items_center().rounded(d.r.xs)
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.cursor_pointer().hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { show(view, key); cx.notify(); }))
      .text_size(12).text_color(on ? d.fg1 : d.fg2).child(label));
  }
  return strip;
}

// ─── Full: the file tree ──────────────────────────────────────────────────────────────────────
function tree(view, space, bot, d, cur) {
  const b = view.brain && view.brainFor === bot.name ? view.brain : null;
  const nb = view.nb && view.nbFor === bot.name ? view.nb : null;
  const col = v_flex().w(232).flex_none().h_full().px(10).py(14).gap(1).bg(d.bg0).border_r_1().border_color(d.line);
  col.child(div().px(8).pb(8).text_size(10).font_family(d.mono).text_color(d.fg3).truncate().child(`${bot.name.toUpperCase()} · VAULT`));
  const item = (id, label, { on = false, indent = 0, count = null, dot = null, act }) => col.child(
    h_flex().id(id).h(28).pl(8 + indent).pr(8).gap(8).items_center().rounded(d.r.sm)
      .when(on, (el) => el.bg(d.sel))
      // The open note keeps no click: clicking it again would drop an unsaved edit (show()).
      .when(!on, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { act(cx); cx.notify(); }))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(on ? d.fg1 : indent ? d.body : d.fg1).child(label))
      .when(count != null, (el) => el.child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child(String(count))))
      .when(Boolean(dot), (el) => el.child(div().size(6).rounded(3).bg(dot))));
  const group = (label) => col.child(div().pl(8).pt(10).pb(2).text_size(11).text_color(d.fg3).child(label));
  item("vt-home", "Home", { on: cur === "home", dot: d.ok, act: () => show(view, "home") });
  item("vt-mission", "Mission", { on: cur === "mission", act: () => show(view, "mission") });
  item("vt-journal", "Journal", { on: cur === "notebook", count: nb ? nb.days.filter((x) => x.entries?.length).length : null, act: () => show(view, "notebook") });
  group("Brain");
  const file = (id, label, name, count) => item(id, label, {
    indent: 10, count, on: cur === "brain" && view.brainFile?.file === name,
    act: (cx) => { view.edit = null; view.review = null; openPanel("brain"); openBrainFile(view, cx, bot, name); },
  });
  file("vt-dec", "Decisions", "decisions.md", b ? b.decisions.length : null);
  file("vt-log", "Change log", "changelog.md", b ? b.changelog.length : null);
  if (b && !b.agents_map) file("vt-map", "Map", "map.md", null);
  item("vt-brain", "All brain files", { indent: 10, on: cur === "brain" && !view.brainFile, act: () => show(view, "brain") });
  if (b?.notes?.length) {
    group("Notes");
    b.notes.slice(0, 12).forEach((n, i) => file(`vt-n-${i}`, n.title, n.name, null));
  }
  col.child(div().flex_1());
  const folder = view.mem?.folder ?? b?.dir ?? null;
  if (folder) col.child(v_flex().gap(4).px(8).pt(12).border_t_1().border_color(d.line)
    .child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child("ON DISK"))
    .child(div().text_size(11).line_height("15px").font_family(d.mono).text_color(d.fg2).child(home(folder)))
    .child(div().text_size(11).line_height("15px").text_color(d.fg3).child("Plain markdown: it opens in Obsidian."))
    .child(div().id("vt-open").text_size(12).text_color(d.infoText).cursor_pointer().hover((s) => s.text_color(d.fg1))
      .on_click(() => exec("xdg-open", [folder]).catch(() => {})).child("Open folder →")));
  return col;
}

// ─── Full: the Home note's right rail ─────────────────────────────────────────────────────────
function rail(view, space, bot, d) {
  const h = data(view, space, bot);
  const col = v_flex().w(260).flex_none().h_full().px(16).py(18).gap(18).bg(d.bg0).border_l_1().border_color(d.line);
  col.child(v_flex().gap(8).child(label(d, "This week")).child(weekCells(d, h.week, 2)));
  col.child(v_flex().gap(8).child(label(d, "Latest decisions")).child(logList(d, h.decisions, "No decisions logged yet.")));
  return col;
}

// ─── Home ─────────────────────────────────────────────────────────────────────────────────────
function data(view, space, bot) {
  const brain = view.brain && view.brainFor === bot.name ? view.brain : null;
  const nb = view.nb && view.nbFor === bot.name ? view.nb : null;
  const tasks = (view.ops?.tasks ?? []).filter((x) => taskFor(x, space.name));
  return { ...homeData({ brain, nb, tasks }), loaded: Boolean(brain), nbLoaded: Boolean(nb), tasksLoaded: Boolean(view.opsLoaded) };
}

function label(d, text) {
  return div().text_size(10).line_height("14px").font_family(d.mono).font_weight(500).text_color(d.fg3).child(text.toUpperCase());
}

function heading(d, id, text, linkText, act) {
  return h_flex().items_center().gap(10)
    .child(div().text_size(13).font_weight(600).text_color(d.body).child(text))
    .when(Boolean(linkText), (el) => el.child(div().id(id).text_size(12).text_color(d.infoText).cursor_pointer()
      .hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { act(); cx.notify(); }).child(linkText)));
}

function homeNote(view, space, bot, d, full) {
  const h = data(view, space, bot);
  const body = v_flex().px(full ? 32 : 16).pt(full ? 16 : 14).pb(28).gap(20);

  body.child(h_flex().items_center().gap(8).text_size(11).font_family(d.mono).text_color(d.fg3)
    .child(div().child(`${bot.name} / Home.md`))
    .child(div().text_color(d.okHi).child("● live"))
    .when(full, (el) => el.child(div().truncate().child("writes itself from the vault and the board"))));

  body.child(v_flex().gap(8)
    .when(full, (el) => el.child(div().text_size(26).line_height("32px").font_weight(700).text_color(d.fg1).child(bot.name)))
    .child(div().text_size(15).line_height("23px").text_color(h.statement ? d.body : d.fg3)
      .child(h.statement || (h.loaded ? "No mission yet." : "Reading the vault…"))));

  body.child(facts(space, bot, d, full));
  body.child(focus(view, d, h));
  body.child(rightNow(view, space, bot, d, full));
  body.child(taskBoard(space, d, h, full));
  body.child(v_flex().gap(10)
    .child(heading(d, "vh-journal", "Today's journal", "Journal →", () => show(view, "notebook")))
    .child(today(d, h)));
  if (!full) body.child(v_flex().gap(8).child(heading(d, "vh-week", "This week")).child(weekCells(d, h.week, 4)));
  body.child(v_flex().gap(8).pt(16).border_t_1().border_color(d.line)
    .child(heading(d, "vh-changes", "Latest changes", "Brain →", () => show(view, "brain")))
    .child(logList(d, h.changes, "No changes logged yet: the pal logs them with pal brain log.")));
  if (!full) body.child(v_flex().gap(8).child(heading(d, "vh-dec", "Latest decisions")).child(logList(d, h.decisions, "No decisions logged yet.")));
  return body;
}

function facts(space, bot, d, full) {
  const owner = shared("crew.settings")?.owner ?? "you";
  const working = space.tabs.filter((x) => x.status === "working").length;
  const model = modelOf(bot.record?.argv);
  const cells = [
    ["Brain", (bot.harnessName ?? bot.harness ?? "no agent") + (model ? ` · ${model}` : ""), false],
    ["Project", home(bot.folder ?? space.folder) || "—", true],
    ["Channels", `${space.tabs.length}${working ? ` · ${working} working` : ""}`, false],
    ["Owner", owner, false],
  ];
  const cols = full ? 4 : 2;
  const grid = v_flex().rounded(d.r.lg).border_1().border_color(d.line);
  for (let r = 0; r < cells.length / cols; r++) {
    const row = h_flex().when(r > 0, (el) => el.border_t_1().border_color(d.line));
    cells.slice(r * cols, r * cols + cols).forEach(([k, v, mono], i) => row.child(v_flex().flex_1().min_w(0).px(12).py(9).gap(3)
      .when(i > 0, (el) => el.border_l_1().border_color(d.line))
      .child(div().text_size(11).text_color(d.fg3).child(k))
      .child(div().truncate().text_size(mono ? 12 : 13).when(mono, (el) => el.font_family(d.mono)).text_color(k === "Channels" && working ? d.infoText : d.fg1).child(v))));
    grid.child(row);
  }
  return grid;
}

function focus(view, d, h) {
  const box = v_flex().px(14).py(12).gap(6).rounded(d.r.lg).border_1().border_color(d.info + "40").bg(d.info + "10");
  box.child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.infoText).child("FOCUS NOW"));
  if (!h.loaded) return box.child(div().text_size(13).text_color(d.fg3).child("Reading the vault…"));
  if (!h.focus) {
    return box.child(div().text_size(13).line_height("19px").text_color(d.fg2)
      .child(h.hasMission ? "No focus set: the pal keeps it current with pal mission focus." : "No mission yet: the pal proposes one with pal mission propose, and you approve it in the Inbox."))
      .child(div().id("vh-mission").text_size(12).text_color(d.infoText).cursor_pointer().on_click((_e, cx) => { show(view, "mission"); cx.notify(); }).child("Mission →"));
  }
  return box.child(div().text_size(15).line_height("22px").text_color(d.fg1).child(h.focus))
    .child(h_flex().gap(14).text_size(12).text_color(d.fg2)
      .child(div().child(`Goals ${h.goals.done} of ${h.goals.total}`))
      .child(div().child(`Done when ${h.doneWhen.done} of ${h.doneWhen.total}`))
      .child(div().id("vh-mission").text_color(d.infoText).cursor_pointer().on_click((_e, cx) => { show(view, "mission"); cx.notify(); }).child("Mission →")));
}

// The channels doing something: needing the owner first, then working.
function rightNow(view, space, bot, d, full) {
  const all = agents();
  const ps = panes();
  const live = channelOrder(space, bot).filter((tab) => tabHasAgent(tab, ps) && (tab.status === "working" || tab.status === "blocked"))
    .sort((a, b) => (a.status === "blocked" ? 0 : 1) - (b.status === "blocked" ? 0 : 1));
  const sec = v_flex().gap(8).child(heading(d, "vh-now", "Right now"));
  if (!live.length) return sec.child(div().text_size(12).text_color(d.fg3).child("No channel is working."));
  const card = (tab) => {
    const ask = tab.status === "blocked";
    const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
    const on = onWhat(view, space, bot, tab, ag);
    const since = ago(tab.changed_at);
    return v_flex().id(`vh-ch-${tab.id}`).flex_1().min_w(0).min_h(58).px(12).py(9).gap(3).rounded(d.r.lg).border_1()
      .border_color(ask ? d.warn + "55" : d.line).bg(ask ? d.warn + "10" : d.raised).cursor_pointer().hover((s) => s.border_color(d.lineStrong))
      .on_click((_e, cx) => { view.go(space, tab); cx.notify(); })
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.fg1).child(`#${channelName(tab)}`))
        .child(div().flex_none().text_size(12).text_color(ask ? d.warnText : d.infoText).child(ask ? "needs you" : `working${since && since !== "now" ? ` · ${since}` : ""}`)))
      .when(Boolean(on), (el) => el.child(div().truncate().text_size(12).text_color(ask ? d.body : d.fg2).child(on)));
  };
  if (!full) return sec.child(v_flex().gap(6).children(live.slice(0, 5).map(card)));
  for (let i = 0; i < Math.min(live.length, 6); i += 3) {
    const row = h_flex().gap(8);
    live.slice(i, i + 3).forEach((tab) => row.child(card(tab)));
    for (let k = live.slice(i, i + 3).length; k < 3; k++) row.child(div().flex_1());
    sec.child(row);
  }
  return sec;
}

// What a channel is on: the task it claimed, else its agent's own title when it's a real one (a
// shell's "user@host:~" or a bare terminal address is not, and shouldn't be shown), else its brief.
function onWhat(view, space, bot, tab, ag) {
  const me = `${space.name}#${channelName(tab)}`.toLowerCase();
  const claimed = (view.ops?.tasks ?? []).find((x) => x.status === "claimed" && String(x.claimed_by ?? "").toLowerCase() === me);
  if (claimed) return `${claimed.id} ${claimed.title}`;
  const title = taskTitle(ag?.title, bot.name, space.name, channelName(tab));
  if (title && !/^\S+@\S+:/.test(title) && !/^t[0-9a-z]{1,4}$/.test(title.trim())) return title;
  return briefOf(bot, tab)?.split("\n")[0] ?? "";
}

function taskBoard(space, d, h, full) {
  const c = h.columns;
  const open = () => openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } });
  const sec = v_flex().gap(8).child(heading(d, "vh-tasks", "Tasks", "Board →", open));
  const cols = [["NOW", c.now, d.infoText], ["NEXT", c.next, d.fg2], ["BLOCKED", c.blocked, d.warnText], ["DONE TODAY", c.done, d.okHi]];
  const line = (x, dim) => h_flex().items_start().gap(6)
    .child(div().flex_none().text_size(11).line_height("18px").font_family(d.mono).text_color(d.fg3).child(x.id))
    .child(div().flex_1().min_w(0).text_size(13).line_height("18px").text_color(dim ? d.fg2 : d.body).child(x.title));
  if (!full) {
    const any = cols.some(([, xs]) => xs.length);
    if (!any && !h.tasksLoaded) return sec.child(div().text_size(12).text_color(d.fg3).child("Reading the board…"));
    if (!any) return sec.child(div().text_size(12).text_color(d.fg3).child("No tasks for this pal."));
    return sec.child(v_flex().gap(6).children(cols.filter(([, xs]) => xs.length).map(([name, xs, col]) => h_flex().items_start().gap(10)
      .child(div().w(76).flex_none().text_size(10).line_height("18px").font_family(d.mono).text_color(col).child(`${name} ${xs.length}`))
      .child(v_flex().flex_1().min_w(0).gap(2).children(xs.slice(0, 3).map((x) => line(x, name === "DONE TODAY")))
        .when(xs.length > 3, (el) => el.child(div().text_size(11).text_color(d.fg3).child(`+${xs.length - 3} more`)))))));
  }
  const grid = h_flex().items_start().rounded(d.r.lg).border_1().border_color(d.line);
  cols.forEach(([name, xs, col], i) => grid.child(v_flex().flex_1().min_w(0).px(12).py(10).gap(8)
    .when(i > 0, (el) => el.border_l_1().border_color(d.line))
    .child(div().text_size(11).font_family(d.mono).text_color(col).child(`${name} ${xs.length}`))
    .children(xs.slice(0, 4).map((x) => line(x, name === "DONE TODAY")))
    .when(xs.length > 4, (el) => el.child(div().text_size(11).text_color(d.fg3).child(`+${xs.length - 4} more`)))
    .when(!xs.length, (el) => el.child(div().text_size(12).text_color(d.fg4).child("—")))));
  return sec.child(grid);
}

function today(d, h) {
  if (!h.nbLoaded) return div().text_size(12).text_color(d.fg3).child("Reading the journal…");
  if (!h.today.length) return div().text_size(12).text_color(d.fg3).child("Nothing logged today.");
  return v_flex().gap(12).pl(14).border_l_1().border_color(d.lineMid).children(h.today.slice(0, 3).map((e) => v_flex().gap(3)
    .child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child([e.time, e.channel, e.task, e.took].filter(Boolean).join(" · ")))
    .child(div().text_size(14).line_height("21px").text_color(d.fg1).child(e.did ?? ""))
    .when(Boolean(e.hiccup), (el) => el.child(div().text_size(12).line_height("17px").text_color(d.warnText).child(`hiccup · ${e.hiccup}`)))
    .when(Boolean(e.lessonText), (el) => el.child(div().text_size(12).line_height("17px").text_color(d.okHi).child(`lesson · ${e.lessonText}`)))));
}

function weekCells(d, w, cols) {
  const cells = [
    [String(w.entries), `entries · ${fmtMinutes(w.minutes)} logged`, d.fg1],
    [String(w.hiccups), `hiccups · ~${fmtMinutes(w.hiccupMinutes)} lost`, w.hiccups ? d.warnText : d.fg1],
    [String(w.lessons), "lessons kept", w.lessons ? d.okHi : d.fg1],
    [String(w.needed), w.needed === 1 ? "need noted" : "needs noted", d.fg1],
  ];
  const grid = v_flex().rounded(d.r.lg).border_1().border_color(d.line);
  for (let r = 0; r < cells.length / cols; r++) {
    const row = h_flex().when(r > 0, (el) => el.border_t_1().border_color(d.line));
    cells.slice(r * cols, r * cols + cols).forEach(([v, l, c], i) => row.child(v_flex().flex_1().min_w(0).px(12).py(9)
      .when(i > 0, (el) => el.border_l_1().border_color(d.line))
      .child(div().text_size(20).line_height("24px").font_weight(600).text_color(c).child(v))
      .child(div().text_size(11).line_height("14px").text_color(d.fg2).child(l))));
    grid.child(row);
  }
  return grid;
}

function logList(d, rows, empty) {
  if (!rows.length) return div().text_size(12).line_height("17px").text_color(d.fg3).child(empty);
  return v_flex().gap(8).children(rows.map((r) => h_flex().items_start().gap(10)
    .child(div().w(38).flex_none().text_size(11).line_height("19px").font_family(d.mono).text_color(d.fg3).child(r.when))
    .child(div().flex_1().min_w(0).text_size(13).line_height("19px").text_color(d.body).child(r.text)
      .when(Boolean(r.who), (el) => el.child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child(r.who))))));
}
