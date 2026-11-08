// A pal's look, as its pocket pet (DeNon, 2026-11-08: the folder mascots are retired). Everything
// pets.js really supports: the species, its colour, what it wears (up to two) and its eyes, with a
// live preview of the pet in each state (resting, working, asks you, done, PR open, stuck, asleep).
// In the dialog kit's "A · Compact sheet" look. Saving stores `pet` ({species, acc, eyes}) and the
// colour (`look.color`) on the pal's record; the roster draws its tiles. Reset goes back to the
// pet its name and brain give it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces } from "herdr";
import { botOf, updateBot, writeArt, petOf, ds, tone, sheet, sheetHeader, sheetBody, sheetField, sheetFooter, pebble } from "./crew.js";
import { petSpec, petFiles, petPath, PET_SPECIES, BARE_VIEW } from "./pets.js";
import { SWATCHES, validHex, normHex } from "./mascot-art.js";

const ICON = "mods/crew-roster/icons";
const WEARS = [["phones", "Headphones"], ["glasses", "Glasses"], ["cap", "Cap"], ["beanie", "Beanie"], ["hood", "Hood"],
  ["crown", "Crown"], ["bow", "Bow"], ["flower", "Flower"], ["scarf", "Scarf"], ["antenna", "Antenna"]];
const EYES = [["dot", "Classic"], ["big", "Big"], ["dots", "Dots"], ["hollow", "Hollow"], ["sleepy", "Sleepy"],
  ["wink", "Wink"], ["visor", "Visor"], ["cyclops", "Cyclops"], ["angry", "Fierce"]];
const SHOW = [["rest", "Resting"], ["work", "Working"], ["ask", "Asks you"], ["done", "Done"], ["pr", "PR open"], ["stuck", "Stuck"], ["asleep", "Asleep"]];
const cap1 = (s) => s.replace(/^./, (c) => c.toUpperCase());

export default class CrewLook extends View {
  init(_props, cx) {
    const space = spaces().find((s) => s.id === props()?.space);
    this.bot = space ? botOf(space) : null;
    const p = this.bot ? petOf(this.bot) : null;
    this.draft = p ? { species: p.species, acc: [...p.acc], eyes: p.eyes, color: this.bot?.look?.color ?? p.color } : null;
    this.hex = InputState.new({ placeholder: "#a28cf0", value: this.draft?.color ?? "" });
    this.hex.on("change", (_e, cx) => { const v = this.hex.value(); if (validHex(v)) this.set({ color: normHex(v) }, cx, false); });
    this.drawn = new Set();
    this.handle = cx.focus_handle();
    if (this.draft) this.draw(cx);
  }

  // The pet a draft makes (the same rules as the pal's own: its name, the head pal's crown).
  spec(draft = this.draft) {
    return petSpec({ name: this.bot.name, god: this.bot.god, color: draft.color, pet: { species: draft.species, acc: draft.acc, eyes: draft.eyes } });
  }

  set(change, cx, syncHex = true) {
    this.draft = { ...this.draft, ...change };
    if (syncHex && change.color) this.hex.set_value(change.color);
    this.draw(cx);
    cx.notify();
  }

  // Draw what's shown: the draft's open tiles (every state, the paw frame), and a resting tile of each
  // species, wear and eye option on the draft. Each file is drawn once per session.
  draw(cx) {
    const open = (spec, all) => petFiles(spec).filter(([path]) => path.endsWith("-o.svg") && (all || path.endsWith("-rest-o.svg")));
    const want = [...open(this.spec(), true)];
    for (const species of PET_SPECIES) want.push(...open(this.spec({ ...this.draft, species }), false));
    for (const [w] of WEARS) want.push(...open(this.spec({ ...this.draft, acc: [w] }), false));
    for (const [eyes] of EYES) want.push(...open(this.spec({ ...this.draft, eyes }), false));
    const todo = want.filter(([path]) => !this.drawn.has(path));
    if (!todo.length) return;
    cx.spawn(async (cx) => {
      try { await writeArt(todo); for (const [path] of todo) this.drawn.add(path); } catch {}
      cx.notify();
    });
  }

  // A bare pet over its aura, w wide (a placeholder until its tile is on disk).
  pet(spec, state, w, { dim = false, frames = false } = {}) {
    const [, , bw, bh] = BARE_VIEW;
    const h = Math.round(w * bh / bw);
    const path = petPath(spec, state, 0, true);
    if (!this.drawn.has(path)) return div().w(w).h(h).flex_none();
    const box = div().relative().w(w).h(h).flex_none().when(dim, (el) => el.opacity(0.45))
      .child(div().absolute().left(-8).top(-6).w(w + 16).h(h + 12).child(image(`${ICON}/pet-aura-row.svg`).w(w + 16).h(h + 12)))
      .child(div().absolute().left(0).top(0).child(image(path).w(w).h(h)));
    const b = petPath(spec, state, 1, true);
    if (frames && this.drawn.has(b)) box.child(div().absolute().left(0).top(0).loop("opacity", { from: 0, to: 1, period: 760 }).child(image(b).w(w).h(h)));
    return box;
  }

  save() {
    const { species, acc, eyes, color } = this.draft;
    updateBot(this.bot.record ?? this.bot, (b) => ({ ...b, pet: { species, acc, eyes }, look: { ...(b.look ?? {}), color } }));
    notify({ title: `${this.bot.name.split(" - ")[0]} has a new look`, level: "success", timeout: 2500 });
    closeOverlay(props().overlay);
  }

  reset() {
    updateBot(this.bot.record ?? this.bot, (b) => { const { look, pet, ...rest } = b; return rest; });
    closeOverlay(props().overlay);
  }

  render() {
    const d = ds(tone(theme()));
    const close = () => closeOverlay(props()?.overlay);
    if (!this.bot || !this.draft) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const spec = this.spec();
    const section = (title, right = null) => h_flex().items_center().justify_between().pt(4)
      .child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(title))
      .when(Boolean(right), (el) => el.child(right));
    const tile = (id, on, pic, name, action) => v_flex().id(id).w(64).flex_none().items_center().gap(4).pt(6).pb(4).rounded(6).cursor_pointer()
      .when(on, (el) => el.bg(d.sel).border_1().border_color(d.lineStrong)).when(!on, (el) => el.border_1().border_color(d.bg1).hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => action(cx))
      .child(pic)
      .child(div().text_size(11).line_height("14px").text_color(on ? d.fg1 : d.fg2).child(name));

    // Every state, live.
    const states = h_flex().gap(4).flex_wrap()
      .children(SHOW.map(([st, label]) => v_flex().w(66).items_center().gap(4)
        .child(this.pet(spec, st === "asleep" ? "rest" : st, 56, { dim: st === "asleep", frames: st === "work" }))
        .child(div().text_size(11).line_height("14px").text_color(d.fg3).child(label))));

    const species = h_flex().gap(4).flex_wrap().children(PET_SPECIES.map((sp) =>
      tile(`lk-sp-${sp}`, this.draft.species === sp, this.pet(this.spec({ ...this.draft, species: sp }), "rest", 44), cap1(sp), (cx) => this.set({ species: sp }, cx))));

    const swatches = h_flex().gap(6).flex_wrap().items_center().children(SWATCHES.map((c, i) => {
      const on = c.toLowerCase() === String(this.draft.color).toLowerCase();
      return div().id(`lk-c-${i}`).size(20).flex_none().rounded(4).bg(c).cursor_pointer()
        .border_2().border_color(on ? d.fg1 : d.bg1).hover((s) => s.border_color(d.lineStrong))
        .on_click((_e, cx) => this.set({ color: c }, cx));
    }));

    // Up to two things worn; a third replaces the older one.
    const wear = (w) => {
      const acc = this.draft.acc.includes(w) ? this.draft.acc.filter((x) => x !== w) : [...this.draft.acc, w].slice(-2);
      return acc;
    };
    const wears = h_flex().gap(4).flex_wrap()
      .child(tile("lk-w-none", !this.draft.acc.length, div().w(44).h(34).flex().items_center().justify_center().child(svg(`${ICON}/x.svg`).size(12).text_color(d.fg3)), "None",
        (cx) => this.set({ acc: [] }, cx)))
      .children(WEARS.map(([w, name]) => tile(`lk-w-${w}`, this.draft.acc.includes(w), this.pet(this.spec({ ...this.draft, acc: [w] }), "rest", 44), name,
        (cx) => this.set({ acc: wear(w) }, cx))));

    const eyes = h_flex().gap(4).flex_wrap().children(EYES.map(([e, name]) =>
      tile(`lk-e-${e}`, this.draft.eyes === e, this.pet(this.spec({ ...this.draft, eyes: e }), "rest", 44), name, (cx) => this.set({ eyes: e }, cx))));

    return sheet(d, "crew-look", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "lk", face: this.pet(spec, "work", 60, { frames: true }), title: `${this.bot.name}'s look`,
        sub: `${cap1(spec.species)} · ${spec.acc.length ? spec.acc.join(" + ") : "nothing worn"} · ${EYES.find(([e]) => e === spec.eyes)?.[1] ?? "Classic"} eyes`, onClose: close }))
      .child(sheetBody()
        .child(states)
        .child(section("Species")).child(species)
        .child(section("Colour", div().w(120).child(sheetField(d, Input.new(this.hex).w_full().text_size(12).text_color(d.fg1))))).child(swatches)
        .child(section("Wears (up to two)")).child(wears)
        .child(section("Eyes")).child(eyes)
        .child(h_flex().pt(2).child(pebble(d, { id: "lk-reset", label: "Reset to its default", onClick: () => this.reset() }))))
      .child(sheetFooter(d, { id: "lk", hint: "Previews update as you pick · Esc cancels", onCancel: close, primary: "Save", onPrimary: () => this.save() }));
  }
}
