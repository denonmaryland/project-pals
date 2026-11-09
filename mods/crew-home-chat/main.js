// The bar of Home's "Chat about it" window (crew-home: C, or "Chat with …"): the window is the
// asking topic's live terminal under this 34 px bar, so you can talk it through with the pal before
// deciding. The bar drags the window; it shows the pal's pet, its name and #topic, what it's about,
// Open topic (shows the topic and closes the window) and ×. props: { space, tab, muse, about, overlay }.
// muse: the asker was asleep, so this is the idea partner's terminal instead.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, spaces, props, run, closeOverlay } from "herdr";
import { ds, tone, botOf, channelName, petOf, petReady, petEl, petState, mascotEl, showTabs } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

export default class CrewHomeChat extends View {
  render() {
    const d = ds(tone(theme()));
    const p = props() ?? {};
    const space = spaces().find((s) => s.id === p.space);
    const tab = space?.tabs.find((t) => t.id === p.tab);
    const bot = space ? botOf(space) : null;
    const pet = bot ? petOf(bot) : null;
    const face = pet && petReady(pet) ? petEl(pet, petState(bot, "calm"), 26, 20, { open: true }) : bot ? mascotEl(bot, "calm", 20, tone(theme())) : div();
    const close = () => closeOverlay(p.overlay);
    return h_flex().id("home-chat-bar").size_full().items_center().gap(8).pl(10).pr(6).bg(d.bg1).border_b_1().border_color(d.line).text_color(d.fg1)
      .child(div().w(26).h(20).flex_none().child(face))
      .child(div().flex_none().text_size(12.5).font_weight(600).child(space ? space.name.split(" - ")[0] : "Gone"))
      .child(div().flex_none().text_size(12).font_family(d.mono).text_color(d.fg2).child(tab ? `#${channelName(tab)}` : ""))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg3).child(p.muse ? `idea partner · about: ${p.about ?? ""}` : p.about ? `about: ${p.about}` : ""))
      .child(stop(h_flex().id("home-chat-open").h(24).px(8).flex_none().items_center().rounded(d.r.sm).cursor_pointer()
        .hover((s) => s.bg(d.hover))
        .on_click(() => { if (space) { run("space.select", { id: space.id }); if (tab) run("tab.select", { id: tab.id }); showTabs(); } close(); })
        .child(div().text_size(12).text_color(d.fg2).child("Open topic"))))
      .child(stop(div().id("home-chat-x").size(24).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
        .tooltip("Close").hover((s) => s.bg(d.hover)).on_click(() => close())
        .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg3))));
  }
}
