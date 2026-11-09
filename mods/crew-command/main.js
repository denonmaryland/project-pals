// Project Pals command bar (T18; DeNon, 2026-11-08: "this pill is redundant maybe it should be a
// global search / command type of thing, the things that are in the dropdown already there are
// perfect"). Opened from the header's search field (a click, or Ctrl+Shift+Space: crew-header.search
// in keys.json), laid over that field: a 560 px r4 #161617 popup with a hairline, the field live
// on top, then:
//   - an empty box: the pal menu's rows, unchanged, under the current pal's name (palMenuItems),
//     then the global ones: New channel, Hire a pal, New group, Check for updates, Settings;
//   - a query: pals (asleep ones wake), channels with their state, tasks, Vault notes and every
//     command (the pal menu's and the gear's), best group first (search.js).
// Keys: ↑/↓ move, Enter opens or runs, Esc closes; the pointer moves the mark too.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, theme, props, closeOverlay, openOverlay, run, setShared } from "herdr";
import {
  botOf, ds, tone, crew, taskFor, loadOps, palMenuItems, appMenuItems, sleepers, wakePal, mascotEl, mood, channelName, statusWord,
  showTabs, openPanel, taskTitle, channelOrder, SEARCH_HINT, recessedField, keyCap, COMMAND_PAD,
} from "./crew.js";
import { search, pieces } from "./search.js";

const ICON = "mods/crew-roster/icons";
const ROW = 30;
const VAULT = [["home", "Home"], ["mission", "Mission"], ["notebook", "Journal"], ["brain", "Brain"]];
const OPEN = ["open", "claimed", "blocked"];

export default class CrewCommand extends View {
  init(_props, cx) {
    this.input = InputState.new({ placeholder: SEARCH_HINT });
    this.input.on("change", (_e, cx) => { this.cursor = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.enter(cx));
    this.input.focus();
    cx.timer.after(120, () => this.input.focus());
    this.cursor = 0;
    this.tasks = [];
    this.done = false;
    // The header's field shows a blue ring while this is open (cleared in close() below).
    setShared("crew.command.open", true);
    cx.spawn(async (cx) => {
      try { this.tasks = (await loadOps()).tasks ?? []; } catch {}
      cx.notify();
    });
  }

  space() { return spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active); }
  dismiss() { closeOverlay(props()?.overlay); }
  // Herdr calls this when the popup goes, however it goes (Esc, a click beside it, a pick).
  async close() { setShared("crew.command.open", false); }

  run(row) {
    if (this.done || !row) return;
    this.done = true;
    this.dismiss();
    row.go();
  }

  enter(cx) { this.run(this.rows()[this.cursor]); cx?.notify(); }

  // Show a pal's channel (the roster's go()).
  static go(space, tab) {
    showTabs();
    run("space.select", { id: space.id });
    if (tab && !tab.active) run("tab.select", { id: tab.id });
  }

  // The empty box: the pal menu's rows under the pal's name, then the global ones.
  emptyRows(space, bot) {
    const rows = [];
    if (space && bot) {
      const open = this.tasks.filter((x) => taskFor(x, bot.name) && OPEN.includes(x.status)).length;
      for (const [g, id, icon, label, hint, go] of palMenuItems(space, bot, open)) {
        rows.push({ group: g ? `${bot.name} · ${g}` : "", id: `pm-${id}`, icon, label, hint, go });
      }
    }
    if (space) rows.push({ group: "Project Pals", id: "new-channel", icon: "ds-plus", label: "New topic", hint: bot ? `for ${bot.name}` : null,
      go: () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } }) });
    for (const it of appMenuItems().filter((x) => x.quick)) {
      rows.push({ group: "Project Pals", id: `am-${it.id}`, icon: it.icon, label: it.label, keyHint: it.key, go: it.go });
    }
    return rows;
  }

  // Everything a query searches.
  index(space, bot) {
    const items = [];
    const all = spaces();
    const ags = agents();
    for (const s of all) {
      const b = botOf(s);
      const tab = s.tabs.find((x) => x.active) ?? s.tabs[0];
      items.push({ group: "Pals", id: `pal-${s.id}`, label: s.name, sub: tab ? `${statusWord(tab.status)} · #${channelName(tab)}` : null,
        pet: b, status: tab?.status, words: [b?.harnessName ?? ""], go: () => CrewCommand.go(s, null) });
      for (const t of channelOrder(s, b)) {
        const ag = ags.filter((x) => x.tab === t.id).sort((x, y) => y.seq - x.seq)[0];
        const what = taskTitle(ag?.title, s.name, b?.name, channelName(t));
        items.push({ group: "Topics", id: `ch-${t.id}`, label: `#${channelName(t)}`, sub: s.name, status: t.status,
          hint: t.status === "working" || t.status === "blocked" || t.status === "done" ? statusWord(t.status) : null,
          words: what ? [what] : [], go: () => CrewCommand.go(s, t) });
      }
    }
    for (const rec of sleepers(all, crew())) {
      items.push({ group: "Pals", id: `zz-${rec.id}`, label: rec.name, sub: "asleep", pet: rec, asleep: true, hint: "wake", go: () => wakePal(rec) });
    }
    const spaceOfPal = (name) => all.find((s) => s.name.toLowerCase() === String(name ?? "").split("#")[0].trim().toLowerCase());
    for (const t of this.tasks.filter((x) => OPEN.includes(x.status))) {
      const who = t.claimed_by ?? t.assignee ?? null;
      const home = spaceOfPal(who) ?? space;
      items.push({ group: "Tasks", id: `task-${t.id}`, icon: "ds-tasks", label: `${t.id} ${t.title ?? ""}`.trim(),
        sub: who ? String(who).split("#")[0] : "nobody", hint: t.status, words: [t.body ?? ""],
        go: () => home && openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: home.id } }) });
    }
    // The Vault's notes: the shown pal's first, then every other open pal's (showing that pal first).
    const vaultOf = (s, b) => VAULT.forEach(([note, label]) => items.push({ group: "Vault", id: `vault-${s.id}-${note}`, icon: "ds-notebook",
      label, sub: s.id === space?.id ? "Vault" : `Vault · ${s.name}`, words: ["vault", s.name, b?.name ?? ""],
      go: () => { if (s.id !== space?.id) CrewCommand.go(s, null); openPanel("vault", { note }); } }));
    if (space) vaultOf(space, bot);
    for (const s of all) if (s.id !== space?.id) vaultOf(s, botOf(s));
    // Commands: the pal menu's, New channel, and every row of the gear menu.
    if (space && bot) {
      for (const [, id, icon, label, hint, go] of palMenuItems(space, bot)) {
        items.push({ group: "Commands", id: `cmd-${id}`, icon, label, sub: bot.name, keyHint: id === "profile" ? hint : null, hint: id === "review" ? hint : null, go });
      }
      items.push({ group: "Commands", id: "cmd-new-channel", icon: "ds-plus", label: "New topic", sub: bot.name, words: ["add topic", "new channel", "tab"],
        go: () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } }) });
    }
    for (const it of appMenuItems().filter((x) => !x.sep)) {
      items.push({ group: "Commands", id: `cmd-am-${it.id}`, icon: it.icon, label: it.label, keyHint: it.key,
        words: it.id === "settings" ? ["preferences", "about"] : it.id === "look" ? ["theme"] : [], go: it.go });
    }
    return items;
  }

  // The rows shown now, in order, each with its group (a header is drawn where the group changes).
  rows() {
    const space = this.space();
    const bot = space ? botOf(space) : null;
    const q = this.input.value().trim();
    if (!q) return this.emptyRows(space, bot);
    return search(q, this.index(space, bot)).flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
  }

  key(e, cx, n) {
    if (e.key === "escape") { cx.stop_propagation(); this.dismiss(); return; }
    if ((e.key === "down" || e.key === "up") && n) {
      this.cursor = (this.cursor + (e.key === "down" ? 1 : -1) + n) % n;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (e.key === "enter") { cx.stop_propagation(); this.enter(cx); }
  }

  lead(row, d, on) {
    if (row.pet) return div().w(20).flex_none().flex().justify_center().when(Boolean(row.asleep), (el) => el.opacity(0.55))
      .child(mascotEl(row.pet, mood(row.status, !row.asleep), 20));
    if (row.group === "Topics") {
      const c = row.status === "working" ? d.info : row.status === "blocked" ? d.warn : row.status === "done" ? d.ok : null;
      return div().w(20).flex_none().flex().justify_center().child(c ? div().size(6).rounded(3).bg(c)
        : div().text_size(12).font_family(d.mono).text_color(d.fg4).child("#"));
    }
    return div().w(20).flex_none().flex().justify_center()
      .child(svg(`${ICON}/${row.icon ?? "ds-search"}.svg`).size(13).text_color(on ? d.fg1 : d.iconOn));
  }

  label(row, d, on) {
    const parts = pieces(row.label, row.ranges);
    return h_flex().flex_1().min_w(0).overflow_hidden().items_center().gap(6)
      .child(h_flex().flex_none().max_w(300).overflow_hidden()
        .children(parts.map(([s, bold]) => div().flex_none().whitespace_nowrap().text_size(13)
          .text_color(bold || on ? d.fg1 : d.body).when(bold, (el) => el.font_weight(600)).child(s))))
      .when(Boolean(row.sub), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg3).child(row.sub)));
  }

  render() {
    const d = ds(tone(theme()));
    const rows = this.rows();
    if (this.cursor >= rows.length) this.cursor = Math.max(0, rows.length - 1);
    const q = this.input.value().trim();

    const root = v_flex().id("crew-command").size_full().rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line)
      .overflow_hidden().text_color(d.fg1)
      .on_key_down((e, cx) => this.key(e, cx, rows.length));

    // The field, live, where the header's was: the same recessed look with its blue ring (open), a
    // magnifier, the query, "esc" as a tiny pebble.
    root.child(div().flex_none().p(COMMAND_PAD).pb(COMMAND_PAD + 1).border_b_1().border_color(d.line)
      .child(recessedField(d, "cmd-field", { open: true }).w_full().pl(10).pr(5).gap(8)
        .child(svg(`${ICON}/ds-search.svg`).size(13).flex_none().text_color(d.fg3))
        .child(div().flex_1().min_w(0).child(Input.new(this.input).w_full().text_size(13).text_color(d.fg1)))
        .child(keyCap(d, "esc"))));

    const list = v_flex().flex_1().min_h(0).p(4).gap(1).overflow_hidden();
    if (!rows.length) {
      list.child(div().px(8).py(10).text_size(12).text_color(d.fg3).child(`Nothing matches "${q}"`));
    }
    let group = null;
    rows.forEach((row, i) => {
      if (row.group !== group) {
        // The pal menu's Sleep row has no group: a hairline before it, as in the pal menu.
        if (group !== null && (!row.group || row.group === "Project Pals")) list.child(div().h(1).mx(4).my(3).flex_none().bg(d.line));
        if (row.group) list.child(div().px(8).pt(group === null ? 3 : 6).pb(3).flex_none().text_size(10).line_height("14px")
          .font_family(d.mono).text_color(d.fg3).child(row.group.toUpperCase()));
        group = row.group;
      }
      const on = this.cursor === i;
      list.child(h_flex().id(`cmd-${row.id}`).h(ROW).flex_none().px(8).gap(9).items_center().rounded(3).cursor_pointer()
        .when(on, (el) => el.bg(d.sel))
        .on_hover((h, cx) => { if (h && this.cursor !== i) { this.cursor = i; cx.notify(); } })
        .on_click((_e, cx) => { this.run(row); cx.notify(); })
        .child(this.lead(row, d, on))
        .child(this.label(row, d, on))
        .when(Boolean(row.hint), (el) => el.child(div().flex_none().max_w(150).truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(row.hint)))
        .when(Boolean(row.keyHint), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg4).child(row.keyHint)))
        .child(div().w(12).flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg2).child(on ? "↵" : "")));
    });
    root.child(list);

    const k = (key, what) => h_flex().gap(5).child(div().text_color(d.fg2).child(key)).child(div().child(what));
    root.child(h_flex().h(28).flex_none().items_center().gap(14).px(12).border_t_1().border_color(d.line)
      .text_size(10.5).font_family(d.mono).text_color(d.fg4)
      .child(k("↑↓", "move")).child(k("↵", "open")).child(k("esc", "close"))
      .child(div().flex_1())
      .child(div().child(q ? "pals · topics · tasks · vault · commands" : "type to search everything")));
    return root;
  }
}
