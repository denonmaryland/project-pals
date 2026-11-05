// A pal's look: any color, a body shape and an accessory, with a live preview of every mood.
// Saving stores it on the pal's record (`look`) and draws its mascots into data/crew-mascots.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces } from "herdr";
import { botOf, updateBot, resolveLook, writeArt, colorOf, a, tone } from "./crew.js";
import { SWATCHES, SHAPES, ACCESSORIES, MOODS, NAMED, lookFiles, lookPath, validHex, normHex } from "./mascot-art.js";

const ICON = "mods/crew-roster/icons";

export default class CrewLook extends View {
  init(_props, cx) {
    const space = spaces().find((s) => s.id === props()?.space);
    this.bot = space ? botOf(space) : null;
    const b = this.bot;
    this.draft = { color: b?.look?.color ?? NAMED[b ? colorOf(b) : "slate"] ?? "#8f96b3", shape: b?.look?.shape ?? "folder", accessory: b?.look?.accessory ?? "auto" };
    this.hex = InputState.new({ placeholder: "#a28cf0", value: this.draft.color });
    this.hex.on("change", (_e, cx) => { const v = this.hex.value(); if (validHex(v)) this.set({ color: normHex(v) }, cx, false); });
    this.drawn = new Set();
    this.handle = cx.focus_handle();
    this.draw(cx);
  }

  // The look as it would be with `l` (accessory "auto" decided for this pal).
  resolved(l = this.draft) { return resolveLook({ ...this.bot, look: l }); }

  set(change, cx, syncHex = true) {
    this.draft = { ...this.draft, ...change };
    if (syncHex && change.color) this.hex.set_value(change.color);
    this.draw(cx);
    cx.notify();
  }

  // Draw what the dialog shows: the draft in every mood, and a calm preview of each shape and accessory in it.
  draw(cx) {
    const want = [...lookFiles(this.resolved(), MOODS, false)];
    for (const [shape] of SHAPES) want.push(...lookFiles(this.resolved({ ...this.draft, shape }), ["calm"], false));
    for (const [accessory] of ACCESSORIES) want.push(...lookFiles(this.resolved({ ...this.draft, accessory }), ["calm"], false));
    const todo = want.filter(([path]) => !this.drawn.has(path));
    if (!todo.length) return;
    cx.spawn(async (cx) => {
      try { await writeArt(todo); for (const [path] of todo) this.drawn.add(path); } catch {}
      cx.notify();
    });
  }

  pic(look, mood, size) {
    const path = lookPath(look, mood);
    return this.drawn.has(path) ? image(path).w(size).h(size).flex_none() : div().size(size).flex_none();
  }

  save() {
    const look = this.draft;
    // Store it first: closing the dialog ends this mod, and with it anything still waiting (the
    // old order, draw then store, lost the look). Any art not drawn yet, the roster draws on its
    // next pass (ensureLooks), and faces wait for it instead of showing a missing image.
    updateBot(this.bot.record ?? this.bot, (b) => ({ ...b, look }));
    writeArt(lookFiles(this.resolved(look))).catch(() => {});
    notify({ title: `${this.bot.name.split(" - ")[0]} has a new look`, level: "success", timeout: 2500 });
    closeOverlay(props().overlay);
  }

  reset() {
    updateBot(this.bot.record ?? this.bot, (b) => { const { look, ...rest } = b; return rest; });
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = tone(theme());
    if (!this.bot) return div().p(24).bg(t.popover).text_color(t.dim).child("That pal is gone.");
    const look = this.resolved();
    const hair = () => div().h(1).mx(16).bg(a(t.foreground, "0c"));
    const label = (s, right) => h_flex().items_center().justify_between().px(16).pt(12).pb(8)
      .child(div().text_size(13.5).text_color(t.foreground).child(s)).when(Boolean(right), (el) => el.child(right));
    const tile = (id, on, pic, name, action) => v_flex().id(id).w(62).items_center().gap(3).py(6).rounded(12).cursor_pointer()
      .when(on, (el) => el.bg(a(t.foreground, "10"))).hover((s) => s.bg(a(t.foreground, "08")))
      .on_click(action)
      .child(pic)
      .child(div().text_size(11).text_color(on ? t.foreground : t.dim).child(name));

    const header = h_flex().items_center().gap(14).px(24).pt(22).pb(6)
      .child(this.pic(look, "done", 56))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(17).font_medium().text_color(t.foreground).child("Look"))
        .child(div().truncate().text_size(12.5).text_color(t.dim).child(this.bot.name)))
      .child(div().id("look-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg(`${ICON}/x.svg`).size(13).text_color(t.dim)));

    // Every mood, as it'll look.
    const moods = h_flex().justify_around().px(12).py(12).rounded(14).bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .children([["calm", "Idle"], ["working", "Working"], ["blocked", "Needs you"], ["done", "Done"], ["asleep", "Asleep"]].map(([m, name]) =>
        v_flex().items_center().gap(4).child(this.pic(look, m, 40)).child(div().text_size(11).text_color(t.dim).child(name))));

    const swatches = h_flex().flex_wrap().gap(8).px(16).pb(12).children(SWATCHES.map((c, i) => {
      const on = this.draft.color.toLowerCase() === c;
      return div().id(`sw-${i}`).size(26).rounded_full().flex().items_center().justify_center().cursor_pointer()
        .border_2().border_color(on ? t.foreground : a(t.foreground, "00"))
        .on_click((_e, cx) => this.set({ color: c }, cx))
        .child(div().size(18).rounded_full().bg(c).border_1().border_color(a(t.foreground, "18")));
    }));
    const hexField = h_flex().items_center().gap(8)
      .child(div().size(16).rounded_full().bg(this.draft.color).border_1().border_color(a(t.foreground, "22")))
      .child(div().w(96).h(28).px(9).flex().items_center().rounded(8).bg(a(t.foreground, "08"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.hex).w_full().text_size(12.5).font_family("JetBrains Mono").text_color(t.foreground)));

    const shapes = h_flex().flex_wrap().gap(2).px(10).pb(10).children(SHAPES.map(([key, name]) =>
      tile(`sh-${key}`, this.draft.shape === key, this.pic(this.resolved({ ...this.draft, shape: key }), "calm", 38), name,
        (_e, cx) => this.set({ shape: key }, cx))));
    const accs = h_flex().flex_wrap().gap(2).px(10).pb(10).children(ACCESSORIES.map(([key, name]) =>
      tile(`acc-${key}`, this.draft.accessory === key, this.pic(this.resolved({ ...this.draft, accessory: key }), "calm", 38), name,
        (_e, cx) => this.set({ accessory: key }, cx))));

    const settings = v_flex().rounded(14).border_1().border_color(a(t.foreground, "10"))
      .child(label("Color", hexField)).child(swatches)
      .child(hair()).child(label("Shape")).child(shapes)
      .child(hair()).child(label("Accessory")).child(accs);

    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(this.bot.look
        ? div().id("look-reset").cursor_pointer().hover((s) => s.opacity(0.75)).on_click(() => this.reset())
            .child(div().text_size(12.5).text_color(t.dim).child("Back to its default"))
        : div())
      .child(h_flex().gap(14).items_center().flex_none()
        .child(div().id("look-cancel").cursor_pointer().text_size(13.5).text_color(t.muted).on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("look-save").px(18).py(9).rounded_full().cursor_pointer().bg(t.solid).hover((s) => s.opacity(0.88))
          .on_click(() => this.save())
          .child(div().text_size(13.5).font_medium().text_color(t.solid_foreground).child("Save"))));

    return v_flex().id("crew-look").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground)
      .child(header)
      .child(v_flex().gap(12).px(24).pt(12).child(moods).child(settings))
      .child(footer);
  }
}
