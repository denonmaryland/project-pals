// The bar of the Chief's pop-up (crew-boards/chief/design.md, A · Split deck): 34 px over the Chief's
// terminal. Its pet and name, "pulls only", the size switch (Compact · Split · Full:
// the same window key, so the new one opens in the old one's place) and ×. Dragging the bar moves the
// window (Herdr drags a window by any press a control doesn't stop). props: { size, overlay }.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, props, shared } from "herdr";
import { ds, tone, chiefOf, botOf, chiefSpace, chiefState, petOf, petReady, petEl, petState, mascotEl, resizeChief, closeChief, CHIEF_NAME } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
const SIZES = [["compact", "Compact"], ["split", "Split"], ["full", "Full"]];

export default class CrewChiefBar extends View {
  render() {
    const d = ds(tone(theme()));
    const p = props() ?? {};
    const rec = chiefOf();
    const space = chiefSpace();
    const bot = space ? botOf(space) : rec ? { ...rec, awake: false } : { name: CHIEF_NAME, awake: false };
    const pet = petOf(bot);
    const face = pet && petReady(pet) ? petEl(pet, petState(bot, "calm"), 28, 22, { open: true }) : mascotEl(bot, "calm", 20, tone(theme()));
    const size = p.size ?? shared("crew.chief.win")?.size ?? "split";
    const state = chiefState();
    const sub = !rec ? "not hired yet" : state === "starting" ? "starting…" : state !== "awake" ? "asleep" : "pulls only · nothing is sent to it but your words";
    const seg = h_flex().flex_none().rounded(d.r.xs).border_1().border_color(d.lineMid).overflow_hidden();
    SIZES.forEach(([k, label], i) => {
      seg.child(stop(div().id(`chief-size-${k}`).px(7).h(20).flex().items_center().cursor_pointer()
        .when(i > 0, (el) => el.border_l_1().border_color(d.lineMid))
        .bg(k === size ? d.sel : d.bg1).hover((s) => s.bg(k === size ? d.sel : d.hover))
        .on_click(() => { if (k !== size) resizeChief(k); })
        .child(div().text_size(11).font_weight(500).text_color(k === size ? d.fg1 : d.fg2).child(label))));
    });
    return h_flex().id("chief-bar").size_full().items_center().gap(8).pl(10).pr(6).bg(d.raised).border_b_1().border_color(d.line).text_color(d.fg1)
      .child(div().w(28).h(22).flex_none().child(face))
      .child(div().flex_none().text_size(13).font_weight(600).child(bot.name ?? CHIEF_NAME))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(d.fg3).child(sub))
      .child(seg)
      .child(stop(div().id("chief-x").size(24).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
        .tooltip("Close (Ctrl+Shift+J)").hover((s) => s.bg(d.hover)).on_click(() => closeChief())
        .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg3))));
  }
}
