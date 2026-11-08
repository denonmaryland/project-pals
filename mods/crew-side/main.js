// Project Pals inspector: details for the shown pal, on the right. In Pro it stays open, with tabs:
// Run (this channel, its usage, its own branch, its other channels), Tasks (its tasks and
// routines) and Memory; Fold goes back to Focus. In Focus it's a peek: one section opened from
// the rail, with Expand (Pro on that section) and close. In a room: who's in it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { spaces, panes, theme, run, exec, hc, layout, appHome, readTextFile, openOverlay, notify } from "herdr";
import { loadOps, crewCli, taskOf, shownRoom, roomMembers, deleteRoom, showTabs, botOf, briefOf, channelName, leadPane, mascotFor, mascotEl, mood, updateBot, statusWord, statusColor, WAVE, ago, a, tone,
  layoutMode, setMode, INSPECTOR_TABS, inspectorTab, setInspectorTab, ds } from "./crew.js";

const ICON = "mods/crew-roster/icons";

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}
// git diff --numstat HEAD, "@@", then untracked paths → { files: [{path, add, del}], added, removed, untracked: [{path, n}] }.
// Untracked files are grouped by folder ("tiles/ 8 new"), as the board shows them.
function parseChanges(out) {
  const [diff, others] = out.split("@@");
  const files = diff.split("\n").map((l) => l.split("\t")).filter((x) => x.length >= 3)
    .map(([a, d, path]) => ({ path, add: a === "-" ? 0 : Number(a), del: d === "-" ? 0 : Number(d) }));
  const groups = new Map();
  for (const f of others.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : f;
    groups.set(dir, (groups.get(dir) ?? 0) + 1);
  }
  const untracked = [...groups].map(([path, n]) => ({ path, n }));
  return { files, untracked, added: files.reduce((n, f) => n + f.add, 0), removed: files.reduce((n, f) => n + f.del, 0) };
}
// The terminal's last few lines worth reading: no blank lines, no lines that are only box drawing.
function tailOf(text, n = 4) {
  return text.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() && !/^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁>❯›]*$/.test(l)).slice(-n);
}
const SECTION_TITLE = { tasks: "Tasks", files: "Changes", branch: "Branch", terminal: "Terminal", run: "Run", memory: "Memory" };

export default class CrewSide extends View {
  init(_props, cx) {
    this.memory = TextareaState.new({ placeholder: "Pin a note every channel will know", rows: 2 });
    this.memory.set_auto_grow(2, 10);
    this.memory.on("focus", (_e, cx) => { this.editing = true; cx.notify(); });
    this.memory.on("blur", (_e, cx) => { this.save(); this.editing = false; cx.notify(); });
    this.botId = null;
    cx.timer.every(60000, (cx) => cx.notify());
    // Tasks, routines, what it remembered, and its branch: refreshed while shown.
    this.ops = { tasks: [], routines: [] };
    this.notes = [];
    this.diff = null;
    this.refresh(cx);
    cx.timer.every(3000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try { this.ops = await loadOps(); } catch {}
      const space = spaces().find((s) => s.active);
      const tab = space?.tabs.find((x) => x.active);
      const bot = space ? botOf(space) : null;
      // The channel's Claude Code facts (model, effort, context, usage), saved by crew-statusline.
      const term = tab ? leadPane(tab.id, panes())?.terminal : null;
      try { this.meta = term ? JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${term}.json`)) ?? "null") : null; } catch { this.meta = null; }
      // Changes (git diff against HEAD, plus untracked files) and the terminal's last lines, for the
      // Run view; only while the inspector is shown (its timer keeps running when hidden).
      const lead = tab ? leadPane(tab.id, panes()) : null;
      if (!this.hidden() && lead?.cwd) {
        const r = await exec("sh", ["-c", 'cd "$1" 2>/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0; git diff --numstat HEAD 2>/dev/null; echo "@@"; git ls-files --others --exclude-standard 2>/dev/null | head -400', "sh", lead.cwd], { on: space.machine }).catch(() => null);
        this.changes = r?.code === 0 && r.stdout.includes("@@") ? parseChanges(r.stdout) : null;
      } else if (!lead?.cwd) this.changes = null;
      if (!this.hidden() && term) {
        const r = await hc(["read", term]).catch(() => null);
        this.tail = r?.code === 0 ? tailOf(r.stdout, inspectorTab() === "terminal" ? 16 : 4) : [];
      }
      if (bot) {
        const slug = bot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const day = new Date(), stamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dir = `${appHome()}/data/crew-memory/${slug}`;
        const today = (await readTextFile(`${dir}/notes/${stamp(day)}.md`).catch(() => null)) ?? "";
        const yest = (await readTextFile(`${dir}/notes/${stamp(new Date(day - 86400000))}.md`).catch(() => null)) ?? "";
        const long = (await readTextFile(`${dir}/MEMORY.md`).catch(() => null)) ?? "";
        this.notes = [...yest.split("\n"), ...today.split("\n")].filter((l) => l.startsWith("- ")).map((l) => l.slice(2).replace(/^\d{1,2}:\d{2}(?: #[^:]+)?: /, "")).slice(-4);
        this.longMemory = long.split("\n").filter((l) => l.trim().startsWith("-")).length;
        const wt = tab && (bot.record?.worktrees ?? {})[tab.name];
        if (wt) {
          const r = await exec("sh", ["-c", 'cd "$1" && mb=$(git merge-base "$2" HEAD) && git diff --shortstat "$mb"; echo "@$(git log --oneline "$mb"..HEAD | wc -l)@$(git status --porcelain | wc -l)"', "sh", wt.path, wt.base]).catch(() => null);
          const out = r?.stdout ?? "";
          const m = out.match(/@(\d+)@(\d+)/);
          this.diff = { wt, tab: tab.id, stat: out.split("\n")[0].trim(), commits: Number(m?.[1] ?? 0), dirty: Number(m?.[2] ?? 0) };
        } else this.diff = null;
      }
      cx.notify();
    });
  }

  hidden() { return Boolean(findNode(layout(), "panel")?.hidden); }

  act(args, done, cx) {
    cx.spawn(async (cx) => {
      try { const out = await crewCli(args); if (done) notify({ title: done, body: out.trim().split("\n").pop()?.slice(0, 160), level: "success", timeout: 3500 }); }
      catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 240), level: "warning" }); }
      this.refresh(cx);
    });
  }

  save() {
    if (!this.bot) return;
    const text = this.memory.value();
    if ((this.bot.memory ?? "") === text) return;
    this.bot = updateBot(this.bot, (b) => ({ ...b, memory: text }));
  }

  // Pieces shared with the Project Pals dialogs' look.
  kit(t) {
    return {
      label: (text, right) => h_flex().items_baseline().justify_between().px(4).pb(6)
        .child(div().text_size(12).text_color(t.dim).child(text)).when(Boolean(right), (el) => el.child(right)),
      list: () => v_flex().rounded(8).border_1().border_color(a(t.foreground, "10")).overflow_hidden(),
      hair: () => div().h(1).mx(14).bg(a(t.foreground, "0a")),
      row: (id, left, right, action) => h_flex().id(id).items_center().justify_between().gap(10).px(14).min_h(40).py(6)
        .when(Boolean(action), (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "05"))).on_click(action))
        .child(left).when(Boolean(right), (el) => el.child(right)),
      text: (s, color, size = 13) => div().min_w(0).truncate().text_size(size).text_color(color ?? t.foreground).child(s),
      link: (id, s, action, color) => div().id(id).cursor_pointer().hover((x) => x.opacity(0.75)).on_click(action)
        .child(div().text_size(12).text_color(color ?? t.accent).child(s)),
      mark: (status) => status === "working" ? svg(WAVE).w(22).h(7).text_color(t.working)
        : status === "blocked" ? div().size(6).rounded_full().bg(t.blocked)
        : status === "done" ? div().size(6).rounded_full().bg(t.done) : null,
    };
  }

  // A list of rows separated by hairlines.
  rows(k, items) {
    const list = k.list();
    items.filter(Boolean).forEach((r, i) => { if (i > 0) list.child(k.hair()); list.child(r); });
    return list;
  }

  header(t, lead, title, sub) {
    return h_flex().items_center().gap(12).pb(4)
      .child(lead)
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(15).font_medium().text_color(t.foreground).child(title))
        .child(div().truncate().text_size(12).text_color(t.dim).child(sub)));
  }

  // The inspector's top bar (the "MODE · Pro" board): 40 px, a #18181A hairline under it; Run /
  // Tasks / Memory as one segment (inset #0A0A0B, #1E1E20 edge, 22 px r3 items), then Fold. A Focus
  // peek shows its section's name instead, with Expand and close.
  bar(d, current) {
    const pro = layoutMode() === "pro";
    const seg = (id, label) => div().id(`insp-${id}`).h(22).px(9).flex().items_center().rounded(d.r.xs).cursor_pointer()
      .when(current === id, (el) => el.bg(d.sel))
      .when(current !== id, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { setInspectorTab(id); cx.notify(); })
      .child(div().text_size(12).font_weight(500).text_color(current === id ? d.fg1 : d.fg2).child(label));
    const btn = (id, icon, label, tip, action) => h_flex().id(id).h(24).px(6).gap(6).items_center().rounded(d.r.sm).border_1().border_color(d.line)
      .cursor_pointer().tooltip(tip).hover((s) => s.bg(d.hover)).on_click(action)
      .child(svg(`${ICON}/${icon}.svg`).size(12).text_color(d.fg2))
      .when(Boolean(label), (el) => el.child(div().text_size(11).font_weight(500).text_color(d.fg2).child(label)));
    const bar = h_flex().id("insp-bar").h(40).flex_none().items_center().gap(8).pl(8).pr(12).border_b_1().border_color(d.lineSoft);
    if (pro) return bar
      .child(h_flex().p(2).gap(2).rounded(d.r.sm).bg(d.inset).border_1().border_color(d.line).children(INSPECTOR_TABS.map(([id, label]) => seg(id, label))))
      .child(div().flex_1())
      .child(btn("insp-fold", "ds-fold", "Fold", "Fold back to Focus", () => setMode("focus")));
    const proTab = INSPECTOR_TABS.some(([id]) => id === current) ? current : "run";
    return bar.pl(14)
      .child(div().flex_1().text_size(12).font_weight(500).text_color(d.fg3).child(SECTION_TITLE[current] ?? "Run"))
      .child(btn("insp-expand", "ds-expand", "Pro", "Open in Pro", () => setMode("pro", { tab: proTab })))
      .child(btn("insp-close", "x", null, "Close", () => run("layout.hide", { id: "panel" })));
  }

  // A section head: 26 px, 12/500 #6A6A6C label, something on the right.
  head(d, label, right) {
    return h_flex().h(26).flex_none().items_center().px(6)
      .child(div().flex_1().text_size(12).font_weight(500).text_color(d.fg3).child(label))
      .when(Boolean(right), (el) => el.child(right));
  }

  // Tasks: this pal's open, claimed and blocked tasks, then what it finished today. A claimed one
  // is lit (#232324, blue dot, 13/500); open ones grey dots; done ones a green check.
  tasksSection(d, bot) {
    const mine = this.ops.tasks.filter((x) => taskOf(x, bot.name));
    const open = mine.filter((x) => ["open", "claimed", "blocked"].includes(x.status))
      .sort((x, y) => (x.status === "claimed" ? 0 : 1) - (y.status === "claimed" ? 0 : 1));
    const done = mine.filter((x) => x.status === "done" && Date.now() - (x.updated ?? 0) < 86400000).slice(-3);
    const row = (x) => {
      const on = x.status === "claimed";
      const mark = x.status === "done" ? svg(`${ICON}/ds-check.svg`).size(10).flex_none().text_color(d.ok)
        : div().size(6).flex_none().rounded(3).bg(on ? d.info : x.status === "blocked" ? d.warn : d.lineStrong);
      return h_flex().id(`task-${x.id}`).h(30).flex_none().items_center().gap(8).px(8).rounded(d.r.sm)
        .when(on, (el) => el.bg(d.sel))
        .child(mark)
        .child(div().flex_1().min_w(0).truncate().text_size(13).when(on, (el) => el.font_weight(500))
          .text_color(on ? d.fg1 : x.status === "done" ? d.fg2 : d.body).child(x.title))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(x.id));
    };
    return v_flex().flex_none().pt(8).px(8).pb(4)
      .child(this.head(d, "Tasks", div().text_size(12).text_color(d.fg4).child(`${open.length} open`)))
      .children([...open, ...done].map(row));
  }

  // Changes: the channel's working tree against HEAD, +/− per file, untracked files by folder.
  changesSection(d, wtActions) {
    const c = this.changes;
    const right = h_flex().items_center()
      .when(Boolean(c), (el) => el
        .child(div().text_size(12).font_weight(500).text_color(d.okHi).child(`+${c.added}`))
        .child(div().pl(6).text_size(12).font_weight(500).text_color(d.err).child(`−${c.removed}`)));
    const rows = c ? [
      ...c.files.slice(0, 8).map((f, i) => h_flex().id(`chg-${i}`).h(26).flex_none().items_center().gap(8).px(8)
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.body).child(f.path))
        .when(f.add > 0, (el) => el.child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.okHi).child(`+${f.add}`)))
        .when(f.del > 0, (el) => el.child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.err).child(`−${f.del}`)))),
      ...c.untracked.slice(0, Math.max(0, 8 - c.files.length)).map((u, i) => h_flex().id(`new-${i}`).h(26).flex_none().items_center().gap(8).px(8)
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.fg2).child(u.path))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(u.n > 1 || u.path.endsWith("/") ? `${u.n} new` : "new"))),
    ] : [];
    return v_flex().flex_none().pt(8).px(8).pb(4)
      .child(this.head(d, "Changes", right))
      .children(rows)
      .when(Boolean(wtActions), (el) => el.child(wtActions));
  }

  // Terminal: the channel's last lines, on the inset at the panel's foot.
  terminalSection(d, lead) {
    return v_flex().flex_none().gap(3).py(10).px(12).bg(d.inset).border_t_1().border_color(d.line)
      .child(h_flex().items_center().gap(6).pb(4)
        .child(svg(`${ICON}/ds-terminal-bold.svg`).size(12).flex_none().text_color(d.fg3))
        .child(div().flex_1().text_size(12).font_weight(500).text_color(d.fg3).child("Terminal"))
        .when(Boolean(lead?.branch), (el) => el.child(div().max_w(160).truncate().text_size(11).font_family(d.mono).text_color(d.fg4).child(lead.branch))))
      .children((this.tail ?? []).map((l, i) => div().id(`tail-${i}`).truncate().text_size(11).line_height("16px").font_family(d.mono)
        .text_color(/^\s*[$❯%#]\s/.test(l) ? d.fg2 : d.fg3).child(l.trim())));
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const k = this.kit(t);
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const bot = botOf(space);
    const current = inspectorTab();
    const frame = v_flex().id("crew-side-frame").size_full().bg(d.bg1).border_l_1().border_color(d.line).text_color(d.fg1);

    const room = shownRoom();
    if (room) return frame.child(this.roomSide(room, v_flex().id("crew-side").flex_1().min_h(0).overflow_y_scrollbar().p(16).gap(22), t, k));
    if (bot && bot.space !== this.botId) {
      if (this.botId && this.editing) this.save();
      this.botId = bot.space;
      this.memory.set_value(bot.memory ?? "");
    }
    if (bot) this.bot = bot;
    frame.child(this.bar(d, current));
    if (!bot) {
      this.botId = null;
      return frame.child(div().p(14).text_size(12).text_color(d.fg3).child("Pick a pal on the left to see its details."));
    }
    const lead = tab ? leadPane(tab.id, panes()) : null;
    const hair = () => div().h(1).mt(6).flex_none().bg(d.line);

    // A worktree channel's own branch: Review and Land, under Changes (not on the board; shown only
    // for such channels).
    const wd = this.diff && tab && this.diff.tab === tab.id ? this.diff : null;
    const link = (id, label, action) => div().id(id).h(22).px(6).flex().items_center().rounded(d.r.xs).cursor_pointer().border_1().border_color(d.line)
      .hover((x) => x.bg(d.hover)).on_click(action).child(div().text_size(11).font_weight(500).text_color(d.fg2).child(label));
    const wtActions = wd ? h_flex().px(8).pt(6).gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(`${wd.commits} on ${wd.wt.base}`))
      .child(link("wt-review", "Review", () => openOverlay({ mod: "crew-review", kind: "dialog", width: 0.86, height: 0.88, props: { space: space.id, tab: tab.id } })))
      .child(link("wt-land", `Land on ${wd.wt.base}`, (_e, cx) => this.act(["land", `${space.name}#${channelName(tab)}`], `Landed ${wd.wt.branch}`, cx))) : null;

    const body = v_flex().id("crew-side").flex_1().min_h(0).overflow_y_scrollbar();
    if (current === "run") {
      return frame.child(body.child(this.tasksSection(d, bot)).child(hair()).child(this.changesSection(d, wtActions)))
        .child(this.terminalSection(d, lead));
    }
    if (current === "tasks") {
      const rs = this.ops.routines.filter((r) => r.bot === bot.name);
      const openRoutines = (extra) => openOverlay({ mod: "crew-routines", kind: "dialog", width: 520, props: extra });
      const addLink = div().id("rt-all").cursor_pointer().hover((x) => x.opacity(0.75))
        .on_click(() => openRoutines(rs.length ? {} : { new: true, bot: bot.name }))
        .child(div().text_size(12).text_color(d.fg2).child(rs.length ? "All" : "Add one"));
      return frame.child(body.child(this.tasksSection(d, bot)).child(hair())
        .child(v_flex().flex_none().pt(8).px(8).pb(4)
          .child(this.head(d, "Routines", addLink))
          .children(rs.map((r) => h_flex().id(`rt-${r.id}`).h(30).flex_none().items_center().gap(8).px(8).rounded(d.r.sm)
            .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(r.paused ? d.fg2 : d.body).child(r.name))
            .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(r.paused ? "paused" : r.schedule))))));
    }
    if (current === "files") return frame.child(body.child(this.changesSection(d, wtActions)));
    if (current === "terminal") return frame.child(body).child(this.terminalSection(d, lead));
    if (current === "branch") {
      return frame.child(body.child(v_flex().flex_none().pt(8).px(8).pb(4)
        .child(this.head(d, "Branch", null))
        .child(h_flex().h(26).items_center().gap(8).px(8)
          .child(svg(`${ICON}/ds-branch.svg`).size(12).flex_none().text_color(d.fg3))
          .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.body).child(lead?.branch ?? "no git branch")))
        .when(Boolean(lead?.cwd), (el) => el.child(div().px(8).pb(4).truncate().text_size(11).font_family(d.mono).text_color(d.fg3)
          .child(lead.cwd.replace(/^\/home\/[^/]+/, "~"))))
        .when(Boolean(wtActions), (el) => el.child(wtActions))));
    }
    // Memory: what you pin (a quiet field), then the latest things it remembered itself.
    return frame.child(body.child(v_flex().flex_none().pt(8).px(8).pb(4).gap(6)
      .child(this.head(d, "Memory", this.longMemory ? div().text_size(12).text_color(d.fg4).child(`${this.longMemory} long-term`) : null))
      .child(div().px(6).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Textarea.new(this.memory).w_full().px(10).py(8).rounded(d.r.sm).text_size(13).text_color(d.body)
          .bg(this.editing ? d.sel : d.raised).border_1().border_color(d.line)))
      .children(this.notes.slice(-3).map((n, i) => h_flex().id(`note-${i}`).gap(8).items_start().px(8).py(4)
        .child(div().size(4).mt(6).flex_none().rounded(1).bg(d.lineStrong))
        .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.fg2).child(n.length > 150 ? n.slice(0, 150) + "…" : n))))));
  }

  roomSide(room, root, t, k) {
    const members = roomMembers(room);
    const faces = h_flex().flex_none().children(members.slice(0, 3).map((m, i) => div().when(i > 0, (el) => el.ml(-12))
      .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 32, t))));
    return root
      .child(this.header(t, faces, `#${room.name}`, room.goal || `${members.length} pals`))
      .child(v_flex()
        .child(k.label("Members"))
        .child(this.rows(k, members.map((m, i) => k.row(`mem-${i}`,
          h_flex().items_center().gap(10).min_w(0)
            .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 26, t))
            .child(v_flex().min_w(0).gap(1).child(k.text(m.name, t.foreground, 13)).child(k.text(`#${m.channel}`, t.dim, 11.5))),
          m.agent ? k.mark(m.status) : k.text("asleep", t.dim, 11.5),
          () => { if (m.space && m.tab) { showTabs(); run("space.select", { id: m.space.id }); run("tab.select", { id: m.tab.id }); } })))))
      .child(div().px(4).text_size(12).text_color(t.dim)
        .child(`Pals talk here with pal-room say ${room.slug}, and bring others in with pal-room invite.`))
      .child(this.rows(k, [k.row("room-close", k.text("Close room", t.blocked, 12.5), null, () => { deleteRoom(room.id); showTabs(); })]));
  }
}
