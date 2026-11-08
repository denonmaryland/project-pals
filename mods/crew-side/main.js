// Project Pals inspector: details for the shown pal, on the right. In Pro it stays open, with tabs:
// Run (this channel, its usage, its own branch, its other channels), Tasks (its tasks and
// routines) and Memory; Fold goes back to Focus. In Focus it's a peek: one section opened from
// the rail, with Expand (Pro on that section) and close. In a room: who's in it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { spaces, panes, theme, run, exec, appHome, readTextFile, openOverlay, notify } from "herdr";
import { loadOps, crewCli, taskOf, shownRoom, roomMembers, deleteRoom, showTabs, botOf, briefOf, channelName, leadPane, mascotFor, mascotEl, mood, updateBot, statusWord, statusColor, WAVE, ago, a, tone,
  layoutMode, setMode, INSPECTOR_TABS, inspectorTab, setInspectorTab, ds } from "./crew.js";

const ICON = "mods/crew-roster/icons";

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

  // The inspector's top bar: Run / Tasks / Memory as one rectangular segmented control, then
  // Fold (Pro) or Expand and close (a Focus peek).
  bar(t, current) {
    const d = ds(t);
    const pro = layoutMode() === "pro";
    const seg = (id, label) => div().id(`insp-${id}`).h(24).px(10).flex().items_center().rounded(d.r.xs).cursor_pointer()
      .when(current === id, (el) => el.bg(d.sel))
      .when(current !== id, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { setInspectorTab(id); cx.notify(); })
      .child(div().text_size(12).when(current === id, (el) => el.font_medium()).text_color(current === id ? d.fg1 : d.fg2).child(label));
    const btn = (id, icon, label, tip, action) => div().id(id).h(24).px(label ? 8 : 0).when(!label, (el) => el.w(24)).flex().items_center().justify_center().gap(5)
      .rounded(d.r.xs).cursor_pointer().tooltip(tip).hover((s) => s.bg(d.hover)).on_click(action)
      .child(svg(`${ICON}/${icon}.svg`).size(12).text_color(d.fg3))
      .when(Boolean(label), (el) => el.child(div().text_size(12).text_color(d.fg2).child(label)));
    return h_flex().id("insp-bar").h(44).flex_none().items_center().justify_between().px(12).border_b_1().border_color(d.line)
      .child(h_flex().p(2).gap(2).rounded(d.r.sm).border_1().border_color(d.line).children(INSPECTOR_TABS.map(([id, label]) => seg(id, label))))
      .child(pro
        ? btn("insp-fold", "minimize", "Fold", "Fold back to Focus", () => setMode("focus"))
        : h_flex().gap(2)
          .child(btn("insp-expand", "maximize", null, "Open in Pro", () => setMode("pro", { tab: current })))
          .child(btn("insp-close", "x", null, "Close", () => run("layout.hide", { id: "panel" }))));
  }

  // A section: a small label (with a count and an action on the right), then its content.
  section2(t, label, count, action, content) {
    return v_flex().gap(8)
      .child(h_flex().items_center().justify_between().px(2)
        .child(h_flex().items_baseline().gap(6)
          .child(div().text_size(12.5).font_medium().text_color(t.muted).child(label))
          .when(count != null, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(count)))))
        .when(Boolean(action), (el) => el.child(action)))
      .when(Boolean(content), (el) => el.child(content));
  }

  // A stat card: a label, a big number, an optional bar, and one line of detail.
  stat(t, id, label, value, pct, detail, warn) {
    const color = warn ?? t.muted;
    return v_flex().id(id).flex_1().min_w(0).gap(5).px(12).py(10).rounded(8).bg(a(t.foreground, "07"))
      .child(div().text_size(11.5).text_color(t.dim).child(label))
      .child(div().truncate().text_size(19).font_weight(300).text_color(t.foreground).child(value))
      .when(pct != null, (el) => el.child(h_flex().w_full().h(4).rounded(1).bg(a(t.foreground, "12"))
        .child(div().h_full().rounded(1).bg(color).flex_grow(Math.max(0.02, Math.min(1, pct / 100))))
        .child(div().h_full().flex_grow(Math.max(0, 1 - Math.min(1, pct / 100))))))
      .when(Boolean(detail), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(detail)));
  }

  render() {
    const t = tone(theme());
    const k = this.kit(t);
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const bot = botOf(space);
    const current = inspectorTab();
    const frame = v_flex().id("crew-side-frame").size_full().text_color(t.foreground);
    const root = v_flex().id("crew-side").flex_1().min_h(0).overflow_y_scrollbar().pt(16).px(16).pb(24).gap(22).text_color(t.foreground);

    const room = shownRoom();
    if (room) return this.roomSide(room, root.size_full(), t, k);
    // Elements are single-use: the scrolling body joins the frame once it's filled.
    const done = () => frame.child(this.bar(t, current)).child(root);
    if (bot && bot.space !== this.botId) {
      if (this.botId && this.editing) this.save();
      this.botId = bot.space;
      this.memory.set_value(bot.memory ?? "");
    }
    if (bot) this.bot = bot;
    if (!bot) {
      this.botId = null;
      root.child(div().px(4).text_size(13).text_color(t.dim).child("Pick a pal on the left to see its details."));
      return done();
    }

    const lead = tab ? leadPane(tab.id, panes()) : null;
    const brain = bot.awake ? (bot.harnessName ?? "Agent") : "No brain running";
    // Click the face to change its look.
    const face = div().id("side-face").rounded(4).cursor_pointer().hover((s) => s.opacity(0.85))
      .on_click(() => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } }))
      .child(mascotEl(bot, mood(tab?.status, bot.awake), 38, t));
    const header = this.header(t, face, bot.name, [bot.role, brain, bot.machine ?? "this computer"].filter(Boolean).join(" · "));

    // The channel: its name, where it works (folder and branch on one line), what it's for, and a way in.
    const brief = tab ? briefOf(bot, tab) : null;
    const folder = (lead?.cwd ?? bot.folder ?? "~").replace(/^\/home\/[^/]+/, "~");
    const chip = (id, text, action, strong) => div().id(id).px(11).py(5).rounded(4).cursor_pointer()
      .bg(strong ? a(t.foreground, "12") : a(t.foreground, "07")).hover((s) => s.bg(a(t.foreground, "16"))).on_click(action)
      .child(div().text_size(12).text_color(t.foreground).child(text));
    const channel = v_flex().gap(8)
      .child(div().truncate().text_size(15).font_medium().text_color(t.foreground).child(tab ? `#${channelName(tab)}` : "This channel"))
      .child(h_flex().items_center().gap(6).min_w(0)
        .child(div().min_w(0).truncate().text_size(12).text_color(t.dim).child(folder))
        .when(Boolean(lead?.branch), (el) => el.child(div().flex_none().px(7).py(1).rounded(4).bg(a(t.foreground, "0a"))
          .child(div().text_size(11.5).font_family("JetBrains Mono").text_color(t.muted).child(lead.branch)))))
      .when(Boolean(brief), (el) => el.child(div().text_size(12.5).text_color(t.muted).child(brief)))
      .child(h_flex().gap(6).pt(2)
        .child(chip("side-take", "Take over terminal", () => lead?.terminal && run("pane.focus", { terminal: lead.terminal }), true)));

    // At a glance: context, usage, model, session (Claude Code channels, from its status line).
    const m = this.meta;
    const tok = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${Math.round((n ?? 0) / 1000)}k`);
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const resets = (at) => {
      if (!at) return null;
      const d = new Date(at > 1e12 ? at : at * 1000), h = d.getHours();
      const time = `${h % 12 || 12}${d.getMinutes() ? ":" + String(d.getMinutes()).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
      return `resets ${d.toDateString() === new Date().toDateString() ? "" : DAYS[d.getDay()] + " "}${time}`;
    };
    const warn = (pct, amber, red) => (pct >= red ? t.blocked : pct >= amber ? t.working : null);
    const cw = m?.context_window, rl = m?.rate_limits ?? {}, cost = m?.cost;
    let glance = null;
    if (m) {
      const cards = [];
      if (cw) {
        const used = (cw.current_usage?.input_tokens ?? 0) + (cw.current_usage?.cache_read_input_tokens ?? 0) + (cw.current_usage?.cache_creation_input_tokens ?? 0);
        cards.push(this.stat(t, "st-ctx", "Context", `${cw.used_percentage ?? 0}%`, cw.used_percentage ?? 0, `${tok(used)} of ${tok(cw.context_window_size)}`, warn(cw.used_percentage ?? 0, 65, 85)));
      }
      const usage = rl.five_hour ?? rl.seven_day;
      if (usage) {
        const pct = Math.round(usage.used_percentage ?? 0);
        cards.push(this.stat(t, "st-use", rl.five_hour ? "5-hour usage" : "Weekly usage", `${pct}%`, pct, resets(usage.resets_at), warn(pct, 70, 90)));
      }
      if (m.model?.display_name) {
        cards.push(this.stat(t, "st-model", "Model", m.model.display_name + (m.fast_mode ? " fast" : ""), null,
          [m.effort?.level && `${m.effort.level} effort`, m.thinking?.enabled && "thinking"].filter(Boolean).join(" · ")));
      }
      if (cost) {
        const mins = Math.round((cost.total_duration_ms ?? 0) / 60000);
        const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
        const lines = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));
        cards.push(this.stat(t, "st-session", "This session", dur, null,
          [`+${lines(cost.total_lines_added)} −${lines(cost.total_lines_removed)}`, cost.total_cost_usd != null && `$${cost.total_cost_usd.toFixed(2)}`].filter(Boolean).join(" · ")));
      }
      if (rl.five_hour && rl.seven_day) {
        const pct = Math.round(rl.seven_day.used_percentage ?? 0);
        cards.push(this.stat(t, "st-week", "Weekly usage", `${pct}%`, pct, resets(rl.seven_day.resets_at), warn(pct, 70, 90)));
      }
      const grid = v_flex().gap(8);
      for (let i = 0; i < cards.length; i += 2) grid.child(h_flex().gap(8).child(cards[i]).child(cards[i + 1] ?? div().flex_1()));
      glance = cards.length ? grid : null;
    }

    // Its own branch (a worktree channel): what changed, review, land.
    const d = this.diff && tab && this.diff.tab === tab.id ? this.diff : null;
    const branch = d ? this.section2(t, "Own branch", null, k.text(d.wt.branch, t.dim, 11.5),
      v_flex().gap(8).px(12).py(10).rounded(8).bg(a(t.foreground, "07"))
        .child(div().text_size(12.5).text_color(t.foreground).child(d.stat || "No changes yet"))
        .child(div().text_size(11.5).text_color(t.dim).child(`${d.commits} commit${d.commits === 1 ? "" : "s"} on ${d.wt.base}${d.dirty ? ` · ${d.dirty} uncommitted` : ""}`))
        .child(h_flex().gap(6).pt(2)
          .child(chip("wt-review", "Review", () => openOverlay({ mod: "crew-review", kind: "dialog", width: 0.86, height: 0.88, props: { space: space.id, tab: tab.id } }), true))
          .child(chip("wt-land", `Land on ${d.wt.base}`, (_e, cx) => this.act(["land", `${space.name}#${channelName(tab)}`], `Landed ${d.wt.branch}`, cx))))) : null;

    // Light rows: no boxes, just a hover.
    const lite = (id, left, right, action) => h_flex().id(id).items_center().justify_between().gap(10).px(8).py(7).rounded(6)
      .when(Boolean(action), (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "07"))).on_click(action))
      .child(left).when(Boolean(right), (el) => el.child(right));

    const others = (space?.tabs ?? []).filter((x) => !x.active);
    const channels = others.length ? this.section2(t, "Other channels", others.length, null,
      v_flex().children(others.map((x) => lite(`sib-${x.id}`,
        h_flex().items_center().gap(9).min_w(0).child(mascotEl(bot, mood(x.status, bot.awake), 20, t)).child(k.text(`#${channelName(x)}`, t.foreground, 12.5)),
        k.mark(x.status), () => run("tab.select", { id: x.id }))))) : null;

    const mine = this.ops.tasks.filter((x) => ["open", "claimed", "blocked"].includes(x.status) && taskOf(x, bot.name));
    const tasks = mine.length ? this.section2(t, "Tasks", mine.length, null,
      v_flex().children(mine.map((x) => lite(`task-${x.id}`,
        h_flex().items_center().gap(9).min_w(0)
          .child(div().size(6).flex_none().rounded_full().bg(x.status === "blocked" ? t.blocked : x.status === "claimed" ? t.working : a(t.foreground, "44")))
          .child(k.text(x.title, t.foreground, 12.5)),
        k.text(x.id, t.dim, 11.5))))) : null;

    const rs = this.ops.routines.filter((r) => r.bot === bot.name);
    const openRoutines = (extra) => openOverlay({ mod: "crew-routines", kind: "dialog", width: 520, props: extra });
    const routines = this.section2(t, "Routines", rs.length || null,
      k.link("rt-all", rs.length ? "All" : "Add one", () => openRoutines(rs.length ? {} : { new: true, bot: bot.name })),
      rs.length ? v_flex().children(rs.map((r) => lite(`rt-${r.id}`,
        v_flex().min_w(0).gap(1).child(k.text(r.name, r.paused ? t.dim : t.foreground, 12.5)).child(k.text(r.paused ? "paused" : r.schedule, t.dim, 11.5)),
        k.link(`rt-run-${r.id}`, r.run ? "running" : "Run", (_e, cx) => { if (!r.run) this.act(["routine", "run", r.id], `Running ${r.name}`, cx); })))) : null);

    // Memory: what you pin (a quiet field), then the latest things it remembered itself.
    const memory = this.section2(t, "Memory", null, this.longMemory ? k.text(`${this.longMemory} long-term`, t.dim, 11.5) : null,
      v_flex().gap(10)
        .child(div().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Textarea.new(this.memory).w_full().px(12).py(9).rounded(6).text_size(12.5).text_color(t.foreground)
            .bg(a(t.foreground, this.editing ? "0c" : "07"))))
        .when(this.notes.length > 0, (el) => el.child(v_flex().gap(7).px(4)
          .children(this.notes.slice(-3).map((n) => h_flex().gap(8).items_start()
            .child(div().size(4).mt(7).flex_none().rounded_full().bg(a(t.foreground, "33")))
            .child(div().flex_1().min_w(0).text_size(12).text_color(t.dim).child(n.length > 150 ? n.slice(0, 150) + "…" : n)))))));

    if (current === "tasks") {
      root.when(Boolean(tasks), (el) => el.child(tasks))
        .when(!tasks, (el) => el.child(div().px(4).text_size(12.5).text_color(t.dim).child(`No open tasks for ${bot.name}.`)))
        .child(routines);
    } else if (current === "memory") root.child(memory);
    else {
      root.child(header).child(channel)
        .when(Boolean(glance), (el) => el.child(glance))
        .when(Boolean(branch), (el) => el.child(branch))
        .when(Boolean(channels), (el) => el.child(channels));
    }
    return done();
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
