// Project Pals pal menu: opened from the header's pal chip (its ▾). Everything about THE AGENT and
// THAT PROJECT, not its channels (the hero lists those): its profile, memory and tasks; its project's
// review and folder; and the pal's actions. Each opens the right-side panel's tab, or the dialog it
// names. Notebook joins in stage 4. Drawn like crew-pick:
// an r4 #161617 popover, a 1 px hairline, 30 px rows. Keys: ↑/↓ move, Enter opens, Esc closes.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, props, closeOverlay, openOverlay, run, exec, setShared, keys } from "herdr";
import {
  botOf, ds, tone, channelName, crew, taskFor, loadOps, openPanel, closePanel, panelOpen, panelTab, panelState, worktreeOf, openReview,
  updateBot, rememberModel, wakePal,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
const ROW = 30;

// The panel's shortcut, as keys.json binds it (Ctrl+Shift+I by default).
function shortcut() {
  const k = keys().find((x) => x.action === "crew-roster.profile");
  return k ? k.keys.split("-").map((p) => p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join("+") : null;
}

export default class CrewPalMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.cursor = 0;
    this.open = 0;
    cx.spawn(async (cx) => {
      try { const ops = await loadOps(); const b = botOf(this.space()); this.open = ops.tasks.filter((x) => taskFor(x, b?.name) && ["open", "claimed", "blocked"].includes(x.status)).length; } catch {}
      cx.notify();
    });
  }

  space() { return spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active); }
  close() { closeOverlay(props()?.overlay); }

  // [group, id, icon, label, hint, action] rows; a group change draws its small header.
  items(space, bot) {
    const tab = space.tabs.find((x) => x.active);
    const wt = worktreeOf(bot, tab);
    // The same row again closes the panel; another row switches it.
    const panel = (key, section) => () => {
      const st = panelState();
      if (panelOpen() && panelTab() === key && (st.section ?? null) === (section ?? null)) closePanel();
      else openPanel(key, section ? { section } : {});
    };
    const out = [
      ["The pal", "profile", "ds-user", "Profile", shortcut(), panel("profile")],
      ["The pal", "memory", "ds-memory", "Memory", null, panel("profile", "memory")],
      // Tasks: add one for this pal and see its open ones (the crew-tasks dialog; Tell merged into it).
      ["The pal", "tasks", "ds-tasks", "Tasks", this.open ? `${this.open} open` : null, () => openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } })],
    ];
    out.push(["The project", "mission", "ds-mission", "Mission", null, panel("mission")]);
    out.push(["The project", "brain", "ds-brain", "Brain", null, panel("brain")]);
    out.push(["The project", "agents", "ds-agents", "AGENTS.md", null, panel("agents")]);
    if (wt) out.push(["The project", "review", "ds-review", "Review changes", wt.branch ?? `#${channelName(tab)}`, () => openReview(space, tab)]);
    if (bot.folder ?? space.folder) out.push(["The project", "folder", "ds-folder", "Open folder", null, () => exec("xdg-open", [bot.folder ?? space.folder]).catch(() => {})]);
    if (!bot.god) out.push(["", "sleep", "ds-moon", "Put to sleep", null, () => {
      updateBot(bot.record ?? bot, (b) => ({ ...b, folder: b.folder ?? space.folder ?? null, harness: b.harness ?? bot.harness ?? null }));
      rememberModel(space).catch(() => {}).finally(() => run("space.close", { id: space.id }));
    }]);
    return out;
  }

  pick(item) { this.close(); item[5](); }

  key(e, cx, items) {
    if (e.key === "escape") { this.close(); cx.stop_propagation(); return; }
    if (e.key === "down" || e.key === "up") { this.cursor = (this.cursor + (e.key === "down" ? 1 : -1) + items.length) % items.length; cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "enter") { cx.stop_propagation(); this.pick(items[this.cursor]); }
  }

  render() {
    const d = ds(tone(theme()));
    const space = this.space();
    const root = v_flex().id("crew-palmenu").track_focus(this.handle).w_full().p(4).gap(1).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line).text_color(d.fg1);
    if (!space) return root.child(div().p(8).text_size(12).text_color(d.fg3).child("No pal shown."));
    const bot = botOf(space);
    const items = this.items(space, bot);
    root.on_key_down((e, cx) => this.key(e, cx, items));
    // Which row the open panel is already on (choosing it again closes the panel).
    const onTab = panelOpen() ? (panelState().section === "memory" ? "memory" : panelTab()) : null;
    root.child(v_flex().px(8).pt(6).pb(7).mb(2).border_b_1().border_color(d.line)
      .child(div().truncate().text_size(13).line_height("18px").font_weight(600).text_color(d.fg1).child(bot.name))
      .child(div().truncate().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg3)
        .child([bot.harnessName ?? "no agent", (bot.folder ?? space.folder ?? "").replace(/^\/home\/[^/]+/, "~")].filter(Boolean).join(" · "))));
    let group = null;
    items.forEach((it, i) => {
      const [g, id, icon, label, hint] = it;
      if (g !== group) {
        if (group !== null && !g) root.child(div().h(1).mx(4).my(3).flex_none().bg(d.line));
        else if (g) root.child(div().px(8).pt(group === null ? 2 : 6).pb(2).text_size(10).line_height("14px").font_family(d.mono).text_color(d.fg3).child(g.toUpperCase()));
        group = g;
      }
      const on = onTab === id;
      root.child(h_flex().id(`pm-${id}`).h(ROW).flex_none().px(8).gap(9).items_center().rounded(3).cursor_pointer()
        .when(this.cursor === i, (el) => el.bg(d.sel))
        .on_hover((h, cx) => { if (h && this.cursor !== i) { this.cursor = i; cx.notify(); } })
        .on_click(() => this.pick(it))
        .child(svg(`${ICON}/${icon}.svg`).size(13).flex_none().text_color(on ? d.fg1 : d.iconOn))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(on ? d.fg1 : d.body).when(on, (el) => el.font_weight(500)).child(label))
        .when(Boolean(hint), (el) => el.child(div().flex_none().max_w(120).truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(hint)))
        .when(on, (el) => el.child(svg(`${ICON}/ds-check.svg`).size(10).flex_none().text_color(d.fg2))));
    });
    return root;
  }
}
