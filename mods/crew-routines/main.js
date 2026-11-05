// Routines: every pal's scheduled work in one place. See when each runs next and how the last run
// went, run one now, pause or resume it, edit it, delete it, or make a new one. crewd runs them;
// this reads data/crew-routines.json and changes it through the crew command.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces, panes, appHome, readTextFile } from "herdr";
import { crewCli, crew, botOf, mascotEl, mood, ago, a, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const EXAMPLES = ["weekdays 09:00", "every 2h 10:00-20:00", "daily 18:00", "mon,fri 4pm"];

const when = (sec) => {
  if (!sec) return null;
  const d = new Date(sec * 1000), now = new Date();
  const h = d.getHours(), time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const days = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
  return days === 0 ? `today ${time}` : days === 1 ? `tomorrow ${time}` : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
};

export default class CrewRoutines extends View {
  init(_props, cx) {
    this.routines = [];
    this.log = [];
    this.open = null;        // expanded routine id
    this.editing = null;     // routine id being edited, "new", or null
    this.confirm = null;     // routine id waiting on a second Delete click
    this.busy = new Set();
    this.name = InputState.new({ placeholder: "Name it" });
    this.when = InputState.new({ placeholder: "weekdays 09:00" });
    this.channel = InputState.new({ placeholder: "routines" });
    this.prompt = TextareaState.new({ placeholder: "What should it do each time?", rows: 3 });
    this.prompt.set_auto_grow(3, 8);
    this.pickBot = false; // the pal list is open in the form
    for (const s of [this.name, this.when, this.channel, this.prompt]) s.on("change", (_e, cx) => cx.notify());
    this.bot = null;
    this.handle = cx.focus_handle();
    this.load(cx);
    cx.timer.every(2000, (cx) => this.load(cx));
    if (props()?.new) this.startNew(props().bot ?? null);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      const d = `${appHome()}/data`;
      try { this.routines = JSON.parse((await readTextFile(`${d}/crew-routines.json`)) ?? "[]"); } catch { this.routines = []; }
      try {
        const text = (await readTextFile(`${d}/crew-routines.log.jsonl`)) ?? "";
        this.log = text.split("\n").filter(Boolean).slice(-400).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      } catch { this.log = []; }
      cx.notify();
    });
  }

  act(id, args, done, cx) {
    this.busy.add(id);
    cx.notify();
    cx.spawn(async (cx) => {
      try { await crewCli(args); if (done) notify({ title: done, level: "success", timeout: 2500 }); }
      catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
      this.busy.delete(id);
      this.load(cx);
    });
  }

  startNew(bot) {
    this.editing = "new";
    this.bot = bot ?? spaces().find((s) => s.active)?.name ?? null;
    for (const s of [this.name, this.when, this.channel]) s.set_value("");
    this.prompt.set_value("");
    this.when.set_value("weekdays 09:00");
    this.name.focus();
  }

  startEdit(r) {
    this.editing = r.id;
    this.bot = r.bot;
    this.name.set_value(r.name);
    this.when.set_value(r.schedule);
    this.channel.set_value(r.channel);
    this.prompt.set_value(r.prompt);
    this.open = r.id;
  }

  save(cx) {
    const name = this.name.value().trim(), sched = this.when.value().trim(), prompt = this.prompt.value().trim();
    const ch = this.channel.value().trim().replace(/^#/, "") || "routines";
    if (!this.bot) return notify({ title: "Pick a pal", level: "warning", timeout: 2500 });
    if (!sched || !prompt) return notify({ title: "It needs a schedule and something to do", level: "warning", timeout: 2500 });
    const args = this.editing === "new"
      ? ["routine", "add", this.bot, sched, prompt, "--channel", ch, ...(name ? ["--name", name] : [])]
      : ["routine", "edit", this.editing, "--when", sched, "--prompt", prompt, "--channel", ch, ...(name ? ["--name", name] : [])];
    const id = this.editing;
    cx.spawn(async (cx) => {
      try {
        await crewCli(args);
        notify({ title: id === "new" ? `Routine added for ${this.bot.split(" - ")[0]}` : "Routine saved", level: "success", timeout: 2500 });
        this.editing = null;
      } catch (e) { notify({ title: "Couldn't save it", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
      this.load(cx);
    });
  }

  key(e, cx) {
    if (e.key === "escape") {
      if (this.editing) { this.editing = null; cx.notify(); } else closeOverlay(props().overlay);
      cx.stop_propagation();
    }
  }

  // Shared pieces, same look as the other Project Pals dialogs.
  kit(t) {
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    return {
      stop,
      hair: () => div().h(1).mx(16).bg(a(t.foreground, "0c")),
      row: (id, label, right, action) => h_flex().id(id).items_center().justify_between().gap(12).px(16).min_h(48)
        .when(Boolean(action), (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "05"))).on_click(action))
        .child(div().flex_none().text_size(13.5).text_color(t.foreground).child(label)).child(right),
      inline: (state, w, mono) => stop(div().w(w).h(30).px(10).flex().items_center().rounded(8).bg(a(t.foreground, "08"))
        .child(Input.new(state).w_full().text_size(13).when(Boolean(mono), (el) => el.font_family("JetBrains Mono")).text_color(t.foreground))),
      chev: (open) => svg(`${ICON}/${open ? "chevron-down" : "chevron-right"}.svg`).size(11).text_color(t.dim),
      header: (lead, title, sub) => h_flex().items_center().gap(12).px(24).pt(22).pb(6)
        .child(lead)
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(17).font_medium().text_color(t.foreground).child(title))
          .child(div().truncate().text_size(12.5).text_color(t.dim).child(sub)))
        .child(div().id("rt-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
          .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
          .child(svg(`${ICON}/x.svg`).size(13).text_color(t.dim))),
      button: (id, label, ready, action) => div().id(id).px(18).py(9).rounded_full().cursor_pointer().bg(ready ? t.solid : a(t.foreground, "1a"))
        .hover((s) => s.opacity(0.88)).on_click(action)
        .child(div().text_size(13.5).font_medium().text_color(ready ? t.solid_foreground : t.dim).child(label)),
    };
  }

  clockFace(t) {
    return div().size(36).flex_none().rounded_full().bg(a(t.foreground, "0c")).flex().items_center().justify_center()
      .child(svg(`${ICON}/clock.svg`).size(17).text_color(t.muted));
  }

  // New or edit: the whole dialog becomes the form.
  form(t) {
    const k = this.kit(t);
    const all = spaces(), c = crew(), ps = panes();
    const isNew = this.editing === "new";
    const space = all.find((s) => s.name === this.bot);
    const bot = space ? botOf(space, c, ps) : null;

    const named = v_flex().rounded(14).bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .child(k.stop(div().px(16).pt(14).pb(6).child(Input.new(this.name).w_full().text_size(20).text_color(t.foreground))))
      .child(k.stop(div().px(6).pb(6).child(Textarea.new(this.prompt).w_full().px(10).py(6).text_size(13.5).text_color(t.foreground))));

    const botRow = k.row("rf-bot", "Pal", h_flex().items_center().gap(8)
      .when(Boolean(bot), (el) => el.child(mascotEl(bot, mood(space.status, bot.awake), 20, t)))
      .child(div().text_size(13).text_color(t.muted).child(this.bot ? this.bot.split(" - ")[0] : "Pick one"))
      .when(isNew, (el) => el.child(k.chev(this.pickBot))),
      isNew ? (_e, cx) => { this.pickBot = !this.pickBot; cx.notify(); } : null);
    const botList = v_flex().px(8).pb(8).children(all.map((sp) => {
      const b = botOf(sp, c, ps), on = this.bot === sp.name;
      return h_flex().id(`rf-bot-${sp.id}`).items_center().gap(10).px(10).py(6).rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(a(t.foreground, "0c"))).hover((s) => s.bg(a(t.foreground, "08")))
        .on_click((_e, cx) => { this.bot = sp.name; this.pickBot = false; cx.notify(); })
        .child(mascotEl(b, mood(sp.status, b.awake), 22, t))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(sp.name))
        .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(13).text_color(t.accent)));
    }));

    const whenRow = k.row("rf-when", "When", k.inline(this.when, 210, true));
    const examples = h_flex().flex_wrap().gap(4).px(16).pb(10).justify_end()
      .children(EXAMPLES.map((x, i) => div().id(`rf-ex-${i}`).px(8).py(2).rounded_full().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10")))
        .on_click((_e, cx) => { this.when.set_value(x); cx.notify(); })
        .child(div().text_size(11.5).font_family("JetBrains Mono").text_color(t.dim).child(x))));
    const channelRow = k.row("rf-ch", "Channel", h_flex().items_center().gap(4)
      .child(div().text_size(13).text_color(t.dim).child("#")).child(k.inline(this.channel, 150)));

    const settings = v_flex().rounded(14).border_1().border_color(a(t.foreground, "10"))
      .child(botRow).when(this.pickBot, (el) => el.child(botList))
      .child(k.hair()).child(whenRow).child(examples)
      .child(k.hair()).child(channelRow);

    const ready = Boolean(this.bot && this.when.value().trim() && this.prompt.value().trim());
    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(div().min_w(0).truncate().text_size(12).text_color(t.dim).child("Skipped while the pal is busy · quiet when there's nothing new"))
      .child(h_flex().gap(14).items_center().flex_none()
        .child(div().id("rf-cancel").cursor_pointer().text_size(13.5).text_color(t.muted).on_click((_e, cx) => { this.editing = null; this.pickBot = false; cx.notify(); }).child("Cancel"))
        .child(k.button("rf-save", isNew ? "Add routine" : "Save", ready, (_e, cx) => this.save(cx))));

    return v_flex().w_full()
      .child(k.header(bot ? mascotEl(bot, "calm", 36, t) : this.clockFace(t), isNew ? "New routine" : "Edit routine",
        isNew ? "A prompt a pal runs on a schedule" : this.bot ?? ""))
      .child(v_flex().gap(12).px(24).pt(12).child(named).child(settings))
      .child(footer);
  }

  toggle(on, t) {
    return div().w(34).h(20).p(2).rounded_full().bg(on ? t.accent : a(t.foreground, "22")).flex().items_center()
      .when(on, (el) => el.justify_end()).child(div().size(16).rounded_full().bg(t.popover));
  }

  row(r, t, first) {
    const open = this.open === r.id;
    const last = r.last;
    const busy = this.busy.has(r.id);
    const lastColor = !last ? t.dim : last.status === "failed" ? t.blocked : last.status === "skipped" || last.status.startsWith("needs ") ? t.working : t.done;
    const runs = open ? this.log.filter((e) => e.routine === r.id).slice(-5).reverse() : [];
    const link = (id, label, on_click, color) => div().id(id).cursor_pointer().hover((s) => s.opacity(0.75)).on_click(on_click)
      .child(div().text_size(12.5).text_color(color ?? t.muted).child(label));
    const when_ = r.run ? "running now" : r.paused ? "paused" : r.next ? `next ${when(r.next)}` : "not scheduled";

    const head = h_flex().id(`rt-${r.id}`).items_center().gap(12).px(16).py(10).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "05")))
      .on_click((_e, cx) => { this.open = open ? null : r.id; this.confirm = null; cx.notify(); })
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(13.5).text_color(r.paused ? t.muted : t.foreground).child(r.name))
        .child(h_flex().gap(6).items_center().min_w(0)
          .when(Boolean(last), (el) => el.child(div().size(6).flex_none().rounded_full().bg(lastColor)))
          .child(div().truncate().text_size(12).text_color(t.dim).child(`${r.schedule} · ${when_}`))))
      .child(div().id(`rt-tog-${r.id}`).flex_none().on_click((_e, cx) => { cx.stop_propagation(); this.act(r.id, ["routine", r.paused ? "resume" : "pause", r.id], null, cx); })
        .child(this.toggle(!r.paused, t)));

    const details = open ? v_flex().gap(10).px(16).pb(12)
      .child(div().text_size(12.5).text_color(t.muted).child(r.prompt))
      .when(runs.length > 0, (el) => el.child(v_flex().gap(3).children(runs.map((e) => h_flex().gap(8).items_center().min_w(0)
        .child(div().w(90).flex_none().text_size(11.5).text_color(t.dim).child(new Date(e.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(e.status === "failed" ? t.blocked : t.dim)
          .child(`${e.status}${e.reason || e.summary ? ` · ${e.reason || e.summary}` : ""}`))))))
      .child(h_flex().gap(16).items_center()
        .child(link(`rt-run-${r.id}`, busy ? "…" : r.run ? "Running" : "Run now", (_e, cx) => { if (!r.run) this.act(r.id, ["routine", "run", r.id], `Running ${r.name}`, cx); }, t.accent))
        .child(link(`rt-edit-${r.id}`, "Edit", (_e, cx) => { this.startEdit(r); cx.notify(); }))
        .child(link(`rt-del-${r.id}`, this.confirm === r.id ? "Delete it?" : "Delete", (_e, cx) => {
          if (this.confirm === r.id) { this.confirm = null; this.open = null; this.act(r.id, ["routine", "rm", r.id], `Deleted ${r.name}`, cx); }
          else { this.confirm = r.id; cx.notify(); }
        }, this.confirm === r.id ? t.blocked : t.dim))) : null;

    return v_flex().when(!first, (el) => el.child(div().h(1).mx(16).bg(a(t.foreground, "0a"))))
      .when(open, (el) => el.bg(a(t.foreground, "04"))).child(head).when(Boolean(details), (el) => el.child(details));
  }

  render() {
    const t = tone(theme());
    const root = v_flex().id("crew-routines").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground);
    if (this.editing && this.editing !== null && (this.editing === "new" || this.routines.some((r) => r.id === this.editing))) {
      return root.child(this.form(t));
    }
    const k = this.kit(t);
    const all = spaces(), c = crew(), ps = panes();
    const active = this.routines.filter((r) => !r.paused).length;
    const byBot = new Map();
    for (const r of this.routines) { if (!byBot.has(r.bot)) byBot.set(r.bot, []); byBot.get(r.bot).push(r); }

    // One bordered list per pal, its face and name above.
    const body = v_flex().id("rt-list").max_h(520).overflow_y_scrollbar().gap(14).px(24).pt(12);
    for (const [name, rs] of byBot) {
      const space = all.find((s) => s.name === name);
      const bot = space ? botOf(space, c, ps) : { name, harness: null };
      body.child(v_flex().gap(6)
        .child(h_flex().items_center().gap(8).pl(4)
          .child(mascotEl(bot, space ? mood(space.status, bot.awake) : "asleep", 20, t))
          .child(div().text_size(12.5).text_color(t.dim).child(name.split(" - ")[0])))
        .child(v_flex().rounded(14).border_1().border_color(a(t.foreground, "10")).overflow_hidden()
          .children(rs.map((r, i) => this.row(r, t, i === 0)))));
    }
    if (!this.routines.length) {
      body.child(v_flex().py(24).items_center().gap(6)
        .child(div().text_size(14).text_color(t.muted).child("No routines yet"))
        .child(div().max_w(360).text_center().text_size(12.5).text_color(t.dim)
          .child("A prompt a pal runs on a schedule: a morning digest, a nightly issue check, a weekly cleanup.")));
    }

    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(div().text_size(12).text_color(t.dim)
        .child(this.routines.length ? `${active} on${this.routines.length - active ? ` · ${this.routines.length - active} paused` : ""} · skipped while a pal is busy` : ""))
      .child(k.button("rt-new", "New routine", true, (_e, cx) => { this.startNew(null); cx.notify(); }));

    return root
      .child(k.header(this.clockFace(t), "Routines", "Scheduled work across your crew"))
      .child(body)
      .child(footer);
  }
}
