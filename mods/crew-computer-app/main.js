// One app of a pal's Computer, in a real Herdr window (crew-boards/pal-computer/design.md, B ·
// Desktop; T81). Opened by openComputerApp with props { pal, app, fit }; Herdr drags it, stacks it
// and puts it back where it was dropped (its key is per pal and app).
// The bar: the pal's pet, the app's name, Fit (fills the desktop area, again to restore), Pin (keeps
// it open over your work, even after a restart: keep: true) and ×. Controls stop the press so they
// don't start a drag. Esc does nothing here: × closes.
// The keyboard: this window focuses itself on open (the T81 spike: that works in a window), and
// again whenever crew.pc.focus names it (a window above it closed).
// Apps, all views over existing files (read only while this window is open, every 5 s):
//   todo, desk   pal computer <pal> todo --json (its tasks by state; its open desk cards)
//   calendar     pal computer <pal> calendar --json (this week: work blocks, done, routines, due)
//   journal      pal computer <pal> journal --json (notebook days)
//   notes        the brain files, MEMORY.md, pages/ and USER.md (read-only), shown as markdown
//   work         git in the pal's folder (read-only): branch, changes, worktrees, last commits

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { theme, props, spaces, shared, setShared, exec, readTextFile, openOverlay, home as homeDir, appHome } from "herdr";
import {
  ds, botOf, petOf, petEl, petState, mood, crewCli, openTerminal, showDesk, scrollArea, PC_APPS, pcKey,
  closeComputerApp, forgetComputerApp, openComputerApp, pinComputerApp, shortDate, dayDate, DAY_NAMES, lanesFor,
} from "./crew.js";

const ICONS = "mods/crew-computer";
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const two = (n) => String(n).padStart(2, "0");
const hhmm = (ms) => { const t = new Date(ms); return `${two(t.getHours())}:${two(t.getMinutes())}`; };
const ymd = (t) => `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}`;
const tilde = (p) => { const h = homeDir(); return h && String(p).startsWith(h) ? "~" + String(p).slice(h.length) : String(p); };
const DAY = 86400000;

export default class CrewComputerApp extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.palName = p.pal;
    this.app = p.app;
    this.handle = cx.focus_handle();
    this.data = null;
    this.err = null;
    this.file = null;           // notes: the open file { path, title, text }
    this.files = null;          // notes: the tree
    this.weekStart = monday(new Date());
    // Say which window this is: a pinned one kept over a restart comes back with a new id.
    const k = pcKey(this.palName, this.app), wins = shared("crew.pc.wins") ?? {};
    if (p.overlay && wins[k]?.id !== p.overlay) setShared("crew.pc.wins", { ...wins, [k]: { ...(wins[k] ?? {}), id: p.overlay, pal: this.palName, app: this.app, pinned: wins[k]?.pinned ?? true, at: Date.now() } });
    this.handle.focus();
    cx.timer.after(250, () => { try { this.handle.focus(); } catch {} });
    this.reload(cx);
    cx.timer.every(5000, (cx) => this.reload(cx));
  }

  space() { return spaces().find((s) => s.name === this.palName) ?? null; }

  reload(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const pal = this.palName;
        if (this.app === "todo" || this.app === "desk") this.data = JSON.parse(await crewCli(["computer", pal, "todo", "--json"]));
        else if (this.app === "calendar") this.data = JSON.parse(await crewCli(["computer", pal, "calendar", "--json", "--start", ymd(this.weekStart)]));
        else if (this.app === "journal") this.data = JSON.parse(await crewCli(["computer", pal, "journal", "--json", "--days", "14"]));
        else if (this.app === "notes") await this.loadNotes();
        else if (this.app === "work") await this.loadWork();
        this.err = null;
      } catch (e) { this.err = String(e?.message ?? e); }
      this.loading = false;
      cx.notify();
    });
  }

  async loadNotes() {
    const pal = this.palName;
    const pages = JSON.parse(await crewCli(["computer", pal, "pages", "--json"]));
    const mission = JSON.parse(await crewCli(["mission", "show", pal, "--json"]));
    const mem = pages.folder.replace(/\/pages$/, "");
    const brain = mission.dir;
    this.files = {
      folder: mem,
      groups: [
        { label: "Brain", items: [["Mission", `${brain}/mission.md`], ["Decisions", `${brain}/decisions.md`], ["Change log", `${brain}/changelog.md`], ["Map", `${brain}/map.md`]] },
        { label: "Pages", items: pages.pages.map((x) => [x.name, x.file]) },
        { label: "Memory", items: [["MEMORY.md", `${mem}/MEMORY.md`]] },
        { label: "About the owner", items: [["USER.md", `${mem.replace(/\/[^/]+$/, "")}/USER.md`]], note: "read-only" },
      ],
    };
    if (!this.file) await this.openFile(...this.files.groups[0].items[0]);
    else await this.openFile(this.file.title, this.file.path);
  }

  async openFile(title, path) {
    let text = null;
    try { text = await readTextFile(path); } catch { text = null; }
    this.file = { title, path, text };
  }

  async loadWork() {
    const space = this.space(), bot = botOf(space);
    const folder = bot?.folder;
    if (!folder) { this.data = { none: true }; return; }
    const on = space?.machine ?? undefined;
    const git = async (...a) => { try { const r = await exec("git", ["-C", folder, ...a], { on, timeout: 8000 }); return r.code === 0 ? r.stdout : ""; } catch { return ""; } };
    const status = await git("status", "--porcelain=v1", "-b");
    const head = status.split("\n")[0] ?? "";
    const m = head.match(/^## ([^.\s]+)(?:\.\.\.\S+)?(?: \[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/);
    const wt = (await git("worktree", "list", "--porcelain")).split("\n\n").filter(Boolean).map((b) => ({
      path: (b.match(/^worktree (.+)$/m) ?? [])[1], branch: ((b.match(/^branch (.+)$/m) ?? [])[1] ?? "").replace("refs/heads/", "") || "(detached)",
    }));
    const log = (await git("log", "--format=%h%x09%s%x09%ct", "-8")).split("\n").filter(Boolean).map((l) => { const [h, s, t] = l.split("\t"); return { h, s, at: Number(t) * 1000 }; });
    this.data = { folder, branch: m?.[1] ?? "?", ahead: Number(m?.[2] ?? 0), behind: Number(m?.[3] ?? 0),
      changed: status.split("\n").slice(1).filter(Boolean).length, worktrees: wt, log };
  }

  render(cx) {
    const t = theme(), d = ds(t);
    const k = pcKey(this.palName, this.app);
    const want = shared("crew.pc.focus");
    if (want === k && this.wantSeen !== want + (shared("crew.pc.wins")?.[k]?.at ?? 0)) {
      this.wantSeen = want + (shared("crew.pc.wins")?.[k]?.at ?? 0);
      cx.timer.after(0, () => { try { this.handle.focus(); } catch {} });
    }
    const a = PC_APPS.find((x) => x.id === this.app) ?? { label: String(this.app ?? "App"), icon: "pc-notes" };
    return v_flex().id("pc-app").size_full().bg(d.bg1).text_color(d.fg1)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", () => this.handle.focus())
      .child(this.bar(d, a))
      .child(v_flex().flex_1().min_h(0).child(this.body(d, cx)));
  }

  // Keys in a window (the live look: they stayed here and did nothing). Esc hands the keyboard back
  // to the desktop (it doesn't close: × does); 1–6 open or bring forward another app.
  key(e, cx) {
    const k = e.keystroke;
    const w = (shared("crew.pc.wins") ?? {})[pcKey(this.palName, this.app)] ?? {};
    if (k === "escape") setShared("crew.pc.focus", pcKey(this.palName, "desktop"));
    else if (/^[1-6]$/.test(k)) openComputerApp(this.palName, PC_APPS[Number(k) - 1].id, w.area ?? { x: 404, y: 50, w: 1000, h: 700 });
    else return;
    cx.notify();
  }

  bar(d, a) {
    const space = this.space(), bot = botOf(space);
    const w = (shared("crew.pc.wins") ?? {})[pcKey(this.palName, this.app)] ?? {};
    const btn = (id, icon, label, on, fn) => h_flex().id(id).gap(4).px(7).h(22).items_center().rounded(d.r.sm).cursor_pointer()
      .border_1().border_color(on ? "#5A3A22" : d.lineMid).bg(on ? "#2A1D14" : "#00000000")
      .text_size(11).text_color(on ? "#F2B88E" : d.fg2).hover((s) => s.text_color(d.fg1))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { fn(); cx.notify(); })
      .child(svg(`${ICONS}/${icon}.svg`).size(12)).when(Boolean(label), (el) => el.child(label));
    const area = w.area ?? { x: 300, y: 50, w: 1000, h: 700 };
    return h_flex().h(34).flex_none().items_center().gap(8).px(10).bg(d.raised).border_b_1().border_color(d.line)
      .when(Boolean(bot), (el) => el.child(petEl(petOf(bot), petState(bot, mood(space.status, bot?.awake !== false)), 26, 20)))
      .child(div().text_size(12.5).font_weight(600).child(a.label))
      .child(div().text_size(11.5).text_color(d.fg3).truncate().child(this.palName ?? ""))
      .child(div().flex_1())
      .child(btn("pc-fit", "pc-fit", w.fit ? "Restore" : "Fit", false, () => openComputerApp(this.palName, this.app, area, { fit: !w.fit, reopen: true })))
      .child(btn("pc-pin", "pc-pin", w.pinned ? "Pinned" : "Pin", Boolean(w.pinned), () => pinComputerApp(this.palName, this.app, area)))
      .child(btn("pc-x", "pc-close", null, false, () => closeComputerApp(this.palName, this.app)));
  }

  body(d, cx) {
    if (this.err && !this.data && !this.files) return note(d, `Couldn't read it: ${clip(this.err, 140)}`);
    if (this.app === "notes") return this.notes(d, cx);
    if (!this.data) return note(d, "Reading…");
    if (this.app === "todo") return this.todo(d);
    if (this.app === "desk") return this.desk(d);
    if (this.app === "calendar") return this.calendar(d, cx);
    if (this.app === "journal") return this.journal(d);
    if (this.app === "work") return this.work(d);
    return note(d, "");
  }

  // ── To-do: doing, next, blocked, done today; state first, soonest due first ──
  todo(d) {
    const x = this.data;
    const list = v_flex().pb(10);
    const group = (label, rows, chip) => {
      if (!rows.length) return;
      list.child(div().px(12).pt(10).pb(4).text_size(10.5).font_family(d.mono).text_color(d.fg3).child(label.toUpperCase()));
      for (const r of rows) list.child(h_flex().items_start().gap(10).px(12).py(7).border_b_1().border_color(d.line)
        .child(div().mt(3).size(12).rounded(3).border_1().border_color(label === "Done today" ? d.ok : d.lineStrong).bg(label === "Done today" ? d.ok : "#00000000").flex_none())
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(12.5).text_color(label === "Done today" ? d.fg3 : d.body).child(`${r.id} ${r.title}`))
          .child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child([r.topic ? `#${r.topic}` : "", r.due_label].filter(Boolean).join(" · "))))
        .child(chip(r)));
    };
    const chipOf = (txt, fg, edge) => div().flex_none().px(5).h(16).rounded(3).border_1().border_color(edge).text_size(10).font_family(d.mono).text_color(fg).flex().items_center().child(txt);
    const due = (r) => r.due_label ? chipOf(r.due_label.replace(/^due /, ""), r.due_label.startsWith("overdue") ? d.err : d.warnText, "#5A4614") : div();
    group("Doing", x.doing, () => chipOf("working", d.infoText, "#23384D"));
    group("Next", x.next, due);
    group("Blocked", x.blocked, () => chipOf("blocked", d.warnText, "#5A4614"));
    group("Done today", x.done_today, () => div());
    if (!x.doing.length && !x.next.length && !x.blocked.length && !x.done_today.length) list.child(note(d, "Nothing on the board for this pal."));
    const space = this.space();
    return v_flex().size_full()
      .child(scrollArea(d, "pc-todo-list", list).flex_1().min_h(0))
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_t_1().border_color(d.line)
        .child(link(d, "pc-todo-add", "+ Task", () => space && openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } })))
        .child(div().text_size(11).text_color(d.fg3).child("Due dates: pal task due T… fri")));
  }

  // ── Desk: its cards (not task cards: those are in To-do), with their status ──
  desk(d) {
    const cards = this.data.cards ?? [];
    const tone = { "needs you": [d.warnText, "#5A4614"], working: [d.infoText, "#23384D"], seen: [d.infoText, "#23384D"], held: [d.warnText, "#5A4614"] };
    const list = v_flex().pb(10).children(cards.map((c, i) => {
      const [fg, edge] = tone[c.status] ?? [d.fg2, d.lineMid];
      return h_flex().id(`pc-card-${i}`).items_start().gap(8).px(12).py(8).border_b_1().border_color(d.line)
        .child(div().flex_none().px(5).h(16).rounded(3).border_1().border_color(edge).text_size(10).font_family(d.mono).text_color(fg).flex().items_center().child(c.status))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(12.5).text_color(d.body).child(clip(c.title, 140)))
          .child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child(`${c.id} · from ${clip(c.from ?? "?", 40)}`)));
    }));
    if (!cards.length) list.child(note(d, "Its desk is clear."));
    return v_flex().size_full()
      .child(scrollArea(d, "pc-desk-list", list).flex_1().min_h(0))
      .child(h_flex().h(36).flex_none().px(12).items_center().border_t_1().border_color(d.line)
        .child(link(d, "pc-desk-open", "Open the Desk →", () => showDesk(this.palName))));
  }

  // ── Calendar: a week, 08–22; past work muted by topic, routines, done, due (dashed) ──
  calendar(d, cx) {
    const x = this.data, H0 = 8, H1 = 22, PX = 26;
    const start = new Date(`${x.start}T00:00:00`);
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
    const today = ymd(new Date());
    const ofDay = (day) => x.events.filter((e) => {
      if (e.kind === "due") return e.day === ymd(day);
      const at = e.start ?? e.at;
      return ymd(new Date(at)) === ymd(day);
    });
    const topOf = (ms) => { const t = new Date(ms); return Math.max(0, (t.getHours() + t.getMinutes() / 60 - H0) * PX); };
    const col = (day) => {
      const c = div().id(`pc-day-${ymd(day)}`).relative().flex_1().h((H1 - H0) * PX)
        .on_size_change((size, cx) => { if (Math.abs((this.colW ?? 0) - size.width) > 1) { this.colW = size.width; cx.notify(); } }).border_l_1().border_color(d.line).bg(ymd(day) === today ? "#110F0D" : "#00000000");
      for (let h = H0; h < H1; h++) c.child(div().absolute().left(0).right(0).top((h - H0) * PX).h(1).bg(d.lineSoft));
      // Work blocks that overlap (two topics at once) sit side by side.
      const work = lanesFor(ofDay(day).filter((e) => e.kind === "work"));
      const colW = this.colW ?? 60;
      for (const e of work) {
        const top = topOf(e.start), h = Math.max(10, topOf(e.end) - top);
        const lw = (colW - 6) / e.lanes;
        c.child(div().absolute().left(3 + e.lane * lw).w(Math.max(8, lw - 2)).top(top).h(h).rounded(3).bg("#18222D").border_l_2().border_color("#3D6E9A").px(4).overflow_hidden()
          .text_size(10).text_color("#9DB8D3").child(`#${e.topic}`));
      }
      for (const e of ofDay(day)) {
        if (e.kind === "routine") {
          c.child(div().absolute().left(3).right(3).top(topOf(e.at)).h(14).rounded(3).bg("#1E1A2C").border_l_2().border_color("#6A54C2").px(4).overflow_hidden()
            .text_size(10).text_color("#B7A6EE").opacity(e.past ? 1 : 0.85).child(`${hhmm(e.at)} ${e.name ?? e.routine}`));
        } else if (e.kind === "done") {
          c.child(div().absolute().left(3).right(3).top(topOf(e.at)).h(14).rounded(3).bg("#13231D").border_l_2().border_color("#2C8A66").px(4).overflow_hidden()
            .text_size(10).text_color("#8FD3B8").child(`${e.task} done`));
        }
      }
      if (ymd(day) === today) { const n = Date.now(); c.child(div().absolute().left(0).right(0).top(topOf(n)).h(2).bg("#E0905A")); }
      return c;
    };
    const dueRow = h_flex().h(22).flex_none().border_b_1().border_color(d.line)
      .child(div().w(34).flex_none().text_size(9.5).font_family(d.mono).text_color(d.fg4).pt(4).child("due"))
      .children(days.map((day) => div().flex_1().px(3).py(2).border_l_1().border_color(d.line).overflow_hidden()
        .children(ofDay(day).filter((e) => e.kind === "due").slice(0, 1).map((e) => div().h(16).px(4).rounded(3).border_1().border_color("#6E5420")
          .text_size(10).text_color(d.warnText).truncate().child(`${e.task} ${e.title}`)))));
    const head = h_flex().h(34).flex_none().border_b_1().border_color(d.line)
      .child(div().w(34).flex_none())
      .children(days.map((day) => v_flex().flex_1().px(6).pt(3).border_l_1().border_color(d.line)
        .child(div().text_size(9.5).font_family(d.mono).text_color(d.fg3).child(DAY_NAMES[day.getDay()].toUpperCase()))
        .child(div().text_size(13).text_color(ymd(day) === today ? "#E0905A" : d.body).child(String(day.getDate())))));
    const gutter = div().relative().w(34).flex_none().h((H1 - H0) * PX)
      .children(Array.from({ length: H1 - H0 }, (_, i) => div().absolute().top(i * PX + 1).right(5).text_size(9.5).font_family(d.mono).text_color(d.fg4).child(two(H0 + i))));
    const nav = (id, label, delta) => link(d, id, label, () => { this.weekStart = delta ? new Date(this.weekStart.getTime() + delta * 7 * DAY) : monday(new Date()); this.data = null; this.reload(cx); });
    return v_flex().size_full()
      .child(h_flex().h(34).flex_none().px(12).gap(10).items_center().border_b_1().border_color(d.line)
        .child(nav("pc-cal-today", "Today", 0)).child(nav("pc-cal-prev", "‹", -1)).child(nav("pc-cal-next", "›", 1))
        .child(div().text_size(13).font_weight(600).child(`${shortDate(days[0])} – ${shortDate(days[6])}`))
        .child(div().flex_1())
        .child(div().text_size(10.5).text_color(d.fg3).child("worked · routine · done · due")))
      .child(head).child(dueRow)
      .child(scrollArea(d, "pc-cal-grid", h_flex().child(gutter).children(days.map(col))).flex_1().min_h(0));
  }

  // ── Journal: notebook days in the one-line-per-step look ──
  journal(d) {
    const x = this.data;
    const list = v_flex().px(14).py(10).gap(14);
    list.child(div().text_size(11).font_family(d.mono).text_color(d.fg3)
      .child(`this week: ${x.week.hiccups} hiccups · ~${Math.round(x.week.minutes / 6) / 10}h lost · ${x.week.lessons} lessons`));
    const step = (icon, color, verb, text, res) => h_flex().gap(6).text_size(12).font_family(d.mono)
      .child(div().w(14).flex_none().text_color(color).child(icon))
      .child(div().w(64).flex_none().text_color(verb === "did" ? d.fg3 : color).child(verb))
      .child(div().flex_1().min_w(0).text_color(d.body).child(text))
      .child(div().flex_none().text_color(d.fg3).child(res ?? ""));
    for (const day of x.days) {
      list.child(div().text_size(12).font_weight(600).text_color(d.fg1).child(dayDate(new Date(`${day.day}T12:00:00`))));
      for (const e of day.entries) {
        // Built whole before it's added: Herdr's elements are single-use, and one changed after it
        // went into a parent fails the render (the live look, T81).
        const box = v_flex().gap(2).pl(10).border_l_1().border_color(d.lineStrong);
        if (e.did) box.child(step("✓", d.ok, "did", e.did, null));
        for (const h of e.hiccups) box.child(step("!", d.warnText, "hiccup", h.text.replace(/\s*\(cost:[^)]*\)\s*$/, ""), h.cost ? `~${h.cost}m` : ""));
        if (e.lesson) box.child(step("◆", "#8A5CF0", "lesson", e.lesson, null));
        list.child(v_flex().gap(4)
          .child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child([e.time, e.channel ? `#${e.channel}` : "", e.task ?? "", e.took ?? ""].filter(Boolean).join(" · ")))
          .child(box));
      }
    }
    if (!x.days.length) list.child(note(d, "No notebook entries yet."));
    return scrollArea(d, "pc-journal", list).size_full();
  }

  // ── Notes: the tree, and the file as markdown (Open in Obsidian; USER.md read-only) ──
  notes(d, cx) {
    const f = this.files;
    if (!f) return note(d, this.err ? `Couldn't read it: ${clip(this.err, 140)}` : "Reading…");
    const tree = v_flex().w(190).flex_none().py(8).px(6).gap(1).bg(d.bg0).border_r_1().border_color(d.line);
    f.groups.forEach((g, gi) => {
      tree.child(div().px(8).pt(gi ? 10 : 2).pb(3).text_size(10).font_family(d.mono).text_color(d.fg3).child(g.label.toUpperCase()));
      if (!g.items.length) tree.child(div().px(8).py(3).text_size(11.5).text_color(d.fg4).child("none yet"));
      g.items.forEach(([title, path], i) => tree.child(h_flex().id(`pc-nf-${gi}-${i}`).px(8).h(26).items_center().rounded(d.r.sm).cursor_pointer()
        .bg(this.file?.path === path ? d.sel : "#00000000").hover((s) => s.bg(d.hover))
        .text_size(12.5).text_color(this.file?.path === path ? d.fg1 : d.body)
        .on_click((_e, cx) => { cx.spawn(async (cx) => { await this.openFile(title, path); cx.notify(); }); })
        .child(div().flex_1().truncate().child(title))
        .when(Boolean(g.note), (el) => el.child(div().text_size(10).text_color(d.fg4).child(g.note)))));
    });
    const file = this.file;
    const doc = v_flex().flex_1().min_w(0)
      .child(h_flex().h(32).flex_none().px(12).gap(8).items_center().border_b_1().border_color(d.line)
        .child(div().flex_1().truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(file ? tilde(file.path) : ""))
        .child(link(d, "pc-obsidian", "Open in Obsidian ↗", () => exec("xdg-open", [`obsidian://open?path=${encodeURIComponent(f.folder)}`]).catch(() => {})))
        .child(link(d, "pc-folder", "Folder", () => exec("xdg-open", [f.folder]).catch(() => {}))))
      .child(scrollArea(d, "pc-note-doc", v_flex().px(18).py(14)
        .child(file?.text ? TextView.markdown(`pc-md-${this.app}`, file.text.slice(0, 20000)) : div().text_size(12.5).text_color(d.fg3).child(file ? "Empty, or not written yet." : ""))).flex_1().min_h(0));
    return h_flex().size_full().child(scrollArea(d, "pc-note-tree", tree).w(190).flex_none().h_full()).child(doc);
  }

  // ── Work: the pal's folder in git (read-only) ──
  work(d) {
    const x = this.data;
    if (x.none) return note(d, "This pal has no project folder.");
    const space = this.space();
    const row = (l, r, extra) => h_flex().gap(10).px(12).py(7).border_b_1().border_color(d.line).items_center()
      .child(div().w(150).flex_none().text_size(12).font_family(d.mono).text_color(d.fg1).truncate().child(l))
      .child(div().flex_1().min_w(0).text_size(12).text_color(d.body).truncate().child(r))
      .child(extra ?? div());
    const list = v_flex().pb(10);
    const label = (s) => list.child(div().px(12).pt(10).pb(4).text_size(10.5).font_family(d.mono).text_color(d.fg3).child(s.toUpperCase()));
    label("Folder");
    list.child(row(x.branch, `${tilde(x.folder)}${x.ahead ? ` · ↑${x.ahead}` : ""}${x.behind ? ` ↓${x.behind}` : ""} · ${x.changed ? `${x.changed} changed` : "clean"}`));
    if (x.worktrees.length > 1) {
      label("Worktrees");
      for (const w of x.worktrees.slice(1)) list.child(row(w.branch, tilde(w.path)));
    }
    label("Last commits");
    for (const c of x.log) list.child(row(c.h, c.s, div().text_size(11).font_family(d.mono).text_color(d.fg3).child(hhmm(c.at))));
    return v_flex().size_full()
      .child(scrollArea(d, "pc-work", list).flex_1().min_h(0))
      .child(h_flex().h(36).flex_none().px(12).gap(14).items_center().border_t_1().border_color(d.line)
        .child(link(d, "pc-work-open", "Open its topic →", () => openTerminal(space)))
        .child(link(d, "pc-work-folder", "Open folder", () => exec("xdg-open", [x.folder]).catch(() => {}))));
  }
}

function monday(t) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const note = (d, s) => div().p(14).text_size(12.5).text_color(d.fg2).child(s);
const link = (d, id, label, fn) => div().id(id).text_size(12).text_color(d.infoText).cursor_pointer().hover((s) => s.text_color(d.fg1))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click((_e, cx) => { fn(); cx.notify(); }).child(label);

export { forgetComputerApp, appHome };
