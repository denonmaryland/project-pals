// Pal list style: how the sidebar lists your pals (DeNon, 2026-11-08). Ten looks: Large pets
// (today's rows, the default) and nine compact ones from DeNon's board (smaller pets, so the name,
// folder, branch, brain and counts fit), plus Trees, an option for every look: a working or
// needs-you pal's live topics under its row ("palTrees", on by default; it replaced the Tree
// look). The list on the left; on the right a live preview of YOUR pals in the look under the pointer (else the chosen one), drawn by the sidebar's own
// renderer (crew.js palLookRow) at the sidebar's width. A click applies it at once (crew-settings.json
// "palList", via saveUiSettings, so the sidebar follows straight away). Done keeps it; Cancel or Esc
// puts back the look and Trees you had. In the dialog kit's "A · Compact sheet" look.

import { View, div, svg } from "gpui-kit";
import { theme, props, closeOverlay, spaces, panes } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, sheetToggle, saveUiSettings, loadOps, crew, botOf, mood, sleepers,
  palOrder, palSections, palGroups, marks, palStylePreviewW, PAL_LIST_STYLES, palListStyle, palListStyleOf, palFacts, sleeperFacts,
  palPet, palLookRow, palLookTree, palTreesOn } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const LIST_W = 214, PREVIEW_H = 452;

export default class CrewPalStyle extends View {
  init(_props, cx) {
    this.was = palListStyle().id;
    this.wasTrees = palTreesOn();
    this.hot = null;
    this.tasks = [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    // The task board, for the counts and the Progress bars.
    cx.spawn(async (cx) => { try { this.tasks = (await loadOps()).tasks ?? []; } catch {} cx.notify(); });
  }

  pick(id) { if (id !== palListStyle().id) saveUiSettings({ palList: id }); }
  // Trees: any working or needs-you pal unfolds its live topics under its row, in every look.
  setTrees(on) { if (on !== palTreesOn()) saveUiSettings({ palTrees: on }); }

  close(keep) {
    if (!keep) { this.pick(this.was); this.setTrees(this.wasTrees); }
    closeOverlay(props()?.overlay);
  }

  // The left list: number, name, a check on the chosen one.
  option(d, st, chosen) {
    const on = st.id === chosen.id;
    return div().id(`ps-${st.id}`).flex().h(30).flex_none().items_center().gap(8).px(8).rounded(d.r.sm).cursor_pointer()
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_hover((h, cx) => { const next = h ? st.id : (this.hot === st.id ? null : this.hot); if (next !== this.hot) { this.hot = next; cx.notify(); } })
      .on_click((_e, cx) => { this.pick(st.id); cx.notify(); })
      .child(div().w(16).flex_none().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg3).child(st.n ? String(st.n) : "·"))
      .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").when(on, (el) => el.font_weight(500)).text_color(on ? d.fg1 : d.body).child(st.name))
      .child(div().flex_none().text_size(10.5).line_height("14px").font_family(d.mono).text_color(d.fg4).child(`${st.pet}px`))
      .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(12).flex_none().text_color(d.info)));
  }

  // Your pals as the sidebar would list them in look `st`: the head pal, each group (a small grey
  // header once you have groups), then Hidden pals with the closed ones dimmed. Nothing here clicks.
  preview(d, t, st, w) {
    const all = spaces(), ps = panes(), c = crew();
    const rows = all.map((space) => ({ space, bot: botOf(space, c, ps) }));
    const live = palOrder(rows).filter((r) => r.bot.awake || r.space.active || r.bot.starting);
    const dozing = palOrder(rows).filter((r) => !(r.bot.awake || r.space.active || r.bot.starting));
    const asleep = sleepers(all, c);
    const box = div().flex().flex_col().gap(2).px(8).pt(4).pb(8);
    box.child(div().flex().h(28).flex_none().items_center().pl(8).pr(4)
      .child(div().flex_1().text_size(12).font_weight(500).text_color(d.fg3).child("Pals"))
      .child(svg(`${ICON}/ds-search.svg`).size(13).text_color(d.iconDim)));
    const row = (r) => {
      const f = palFacts(r.space, r.bot, d, this.tasks, ps);
      const el = palLookRow(d, st, f, palPet(r.bot, mood(r.space.status, r.bot.awake || r.bot.starting), st.pet, t), div().id(`pv-${r.space.id}`));
      const tree = palLookTree(d, st, f, `pv-${r.space.id}`);
      return tree ? div().flex().flex_col().flex_none().child(el).child(tree) : el;
    };
    const grouped = palGroups().length > 0;
    for (const sec of palSections(live, false)) {
      if (grouped && sec.group !== undefined) {
        box.child(div().flex().h(24).mt(st.id === "large" ? 14 : 8).flex_none().items_center().gap(6).pl(8)
          .child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(sec.group ? sec.group.name : "Unassigned"))
          .child(div().text_size(11).line_height("14px").text_color(d.fg4).child(String(sec.rows.length))));
        if ((marks().collapsed ?? {})[sec.group?.id ?? "_"]) continue;
      }
      box.children(sec.rows.map(row));
    }
    const n = dozing.length + asleep.length;
    if (n) {
      const big = st.id === "large";
      box.child(div().flex().h(big ? 40 : 30).flex_none().items_center().gap(big ? 12 : 10).px(8).when(!big, (el) => el.mt(4))
        .child(div().w(st.pet).flex_none().flex().justify_center().child(svg(`${ICON}/ds-eye-off.svg`).size(big ? 15 : 13).text_color(d.icon)))
        .child(div().flex_1().text_size(big ? 13 : 12).text_color(d.fg2).child("Hidden pals"))
        .child(div().text_size(big ? 12 : 11).text_color(d.fg2).child(String(n))));
      // A few of them, so the dimmed look shows too.
      box.children(dozing.slice(0, 2).map(row));
      box.children(asleep.slice(0, Math.max(0, 2 - dozing.length)).map((rec) =>
        palLookRow(d, st, sleeperFacts(rec, d, this.tasks), palPet({ ...rec, awake: false }, "asleep", st.pet, t), div().id(`pv-s-${rec.id}`))));
    }
    if (!rows.length && !asleep.length) box.child(div().px(8).pt(8).text_size(12).text_color(d.fg3).child("No pals yet: hire one and it shows here."));
    // The sidebar's width, its colour and hairline; a long list is cut at the bottom like a scroll.
    return div().w(w).h(PREVIEW_H).flex_none().overflow_hidden().rounded(d.r.lg).bg(d.bg1).border_1().border_color(d.line).child(box);
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const chosen = palListStyle();
    const shown = palListStyleOf(this.hot ?? chosen.id);
    // The preview at the sidebar's own width (what you dragged it to), within what the dialog holds.
    const w = palStylePreviewW();
    const caption = div().flex().flex_col().gap(2).pt(2)
      .child(div().flex().items_center().justify_between().gap(8)
        .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.fg1).child(shown.name))
        .child(div().flex_none().text_size(11).line_height("14px").text_color(d.fg3)
          .child(this.hot && this.hot !== chosen.id ? "click to use" : shown.id === chosen.id ? "in use" : "")))
      .child(div().text_size(11.5).line_height("16px").text_color(d.fg2).child(shown.about));
    const list = div().w(LIST_W).flex_none().flex().flex_col().gap(1)
      .children(PAL_LIST_STYLES.map((st) => this.option(d, st, chosen)))
      .child(div().h(1).my(6).bg(d.lineSoft))
      .child(caption)
      .child(div().h(1).my(6).bg(d.lineSoft))
      // The Trees option, for every look (DeNon, 2026-11-08).
      .child(div().flex().flex_col().gap(4)
        .child(sheetToggle(d, "ps-trees", { label: "Trees", on: palTreesOn(), onClick: () => this.setTrees(!palTreesOn()) }))
        .child(div().text_size(11.5).line_height("16px").text_color(d.fg2).child("Show working topics under each pal: what's working or needs you, at most four, a click opens it.")));
    const body = sheetBody().child(div().flex().items_start().gap(14).child(list).child(this.preview(d, t, shown, w)));
    return sheet(d, "crew-palstyle", this.handle, (e, cx) => { if (e.key === "escape") { this.close(false); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "ps",
        face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
          .child(svg(`${ICON}/ds-agents.svg`).size(16).text_color(d.iconOn)),
        title: "Pal list style", sub: "How the sidebar lists your pals, with your own pals as the preview", onClose: () => this.close(true) }))
      .child(body)
      .child(sheetFooter(d, { id: "ps", hint: "Applies as you click · Esc puts back the old one", onCancel: () => this.close(false),
        primary: "Done", onPrimary: () => this.close(true) }));
  }
}
