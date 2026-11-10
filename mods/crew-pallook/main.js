// Pal look: colour presets for the pets and, separately, for their laptop screens (DeNon,
// 2026-11-09; the board is crew-boards/pal-colors). Two short lists on the left: who gets which
// colour (each its own, all one, a 2/3/4-colour split by count, by brain, by state, by project or
// factory, the theme's colours) and what the screens do (the state's light, the pal's colour, its
// contrast pair, one colour for all), with a verdict on how the two read together (pallook.js
// pairFit). On the right a live preview: a made-up crew of 1, 4, 8 or 12, all in view at once,
// drawn by the real pet renderer in the look you're pointing at.
// A click applies at once: the crew's tiles are drawn first, then the choice is saved (crew-settings.json
// "palLook", via saveUiSettings; updates never touch that file), so the sidebar follows without
// blanking. Done keeps it; Cancel or Esc puts back what you had. A pal's hand-picked colour is
// never changed: it shows under Each its own. In the dialog kit's "A · Compact sheet" look.

import { View, div, svg, image } from "gpui-kit";
import { InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, shared, setShared } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetField, sheetFooter, saveUiSettings, writeArt, ensurePets, crew, palLookSaved, lookTheme, petEl, validHex, normHex } from "./crew.js";
import { petSpec, petArt, petPath, BARE_VIEW } from "./pets.js";
import { crewLook, palLookOf, pairFit, splitSizes, themeColors, PET_LOOKS, SCREEN_LOOKS, SPLIT_PALETTES, BRAIN_COLORS, BRAIN_NAMES, STATE_COLORS, DEMO_PALS } from "./pallook.js";

const ICON = "mods/crew-roster/icons";
const LIST_W = 330, PREVIEW_W = 320, PREVIEW_H = 468;
const COUNTS = [1, 4, 8, 12];
const SWATCH = ["#e8e6f0", "#e0866a", "#ff7a6b", "#f0b245", "#f7d64a", "#6fd6a8", "#7cc8f2", "#6f9cf0", "#a28cf0", "#f08cc0", "#8f96b3"];
const FIT = { best: "Best", good: "Good", weak: "Weak" };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default class CrewPalLook extends View {
  init(_props, cx) {
    this.was = palLookSaved();                 // as saved (sparse), to put back on Cancel
    this.wasPets = shared("crew.pets") ?? [];  // the tiles showing now: still on disk if you cancel
    this.look = { ...(this.was ?? {}) };       // the draft, as it will be saved
    this.applied = this.was;
    this.n = 8;
    this.seq = 0;
    this.drawn = new Set();
    const l = palLookOf(this.look);
    this.hexPet = InputState.new({ placeholder: "#e8e6f0", value: l.color });
    this.hexPet.on("change", (_e, cx) => { const v = this.hexPet.value(); if (validHex(v) && normHex(v) !== palLookOf(this.look).color) this.set({ color: normHex(v) }, cx, false); });
    this.hexScreen = InputState.new({ placeholder: "#9fd8ff", value: this.screenColor() });
    this.hexScreen.on("change", (_e, cx) => { const v = this.hexScreen.value(); if (validHex(v) && normHex(v) !== this.screenColor()) this.set({ screenColor: normHex(v) }, cx, false); });
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.draw(cx);
  }

  // The draft as it's saved: the two choices always, the rest only once picked.
  raw() { const l = palLookOf(this.look); return { ...this.look, pets: l.pets, screen: l.screen }; }
  // The one-for-all screen colour as it shows: the theme's accent under Match the theme until you pick one.
  screenColor() {
    const l = palLookOf(this.look), accent = lookTheme().accent;
    return l.pets === "theme" && !validHex(this.look.screenColor ?? "") && validHex(accent ?? "") ? normHex(accent) : l.screenColor;
  }
  // The made-up crew in the draft's look: [{ pal, pet, state }].
  demo(n = this.n) {
    const pals = DEMO_PALS.slice(0, n), looks = crewLook(this.raw(), pals, { theme: lookTheme() });
    return pals.map((pal, i) => ({ pal, state: pal.state, pet: petSpec({ name: pal.name, god: pal.head, accessory: pal.brain, ...looks[i] }) }));
  }

  set(change, cx, syncHex = true) {
    this.look = { ...this.look, ...change };
    if (syncHex) {
      if (palLookOf(this.look).color !== this.hexPet.value()) this.hexPet.set_value(palLookOf(this.look).color);
      if (this.screenColor() !== this.hexScreen.value()) this.hexScreen.set_value(this.screenColor());
    }
    this.draw(cx);
    this.apply(cx);
    cx.notify();
  }

  // Draw the preview's tiles that aren't on disk yet (each once per session): one per made-up pal, and
  // the paw frame for the working ones.
  draw(cx) {
    const want = [];
    for (const { pet, state } of this.demo()) {
      const st = state === "asleep" ? "rest" : state;
      want.push([pet, st, 0]);
      if (st === "work") want.push([pet, st, 1]);
    }
    const todo = want.filter(([p, st, f]) => !this.drawn.has(petPath(p, st, f, true))).map(([p, st, f]) => petArt(p, st, f, true));
    if (!todo.length) return;
    cx.spawn(async (cx) => {
      try { await writeArt(todo); for (const [path] of todo) this.drawn.add(path); } catch {}
      cx.notify();
    });
  }

  // Apply the draft: draw your crew's tiles in it first, then save, so the sidebar never blanks.
  // Only the latest click lands.
  apply(cx) {
    const next = this.raw(), seq = ++this.seq;
    if (same(next, this.applied)) return;
    cx.spawn(async (cx) => {
      try { await ensurePets(crew(), next); } catch {}
      if (seq !== this.seq) return;
      this.save(next);
      cx.notify();
    });
  }
  // null first, so keys the new choice doesn't have don't linger (saveUiSettings merges objects).
  save(next) {
    if (same(next, this.applied)) return;
    saveUiSettings({ palLook: null });
    if (next) saveUiSettings({ palLook: next });
    this.applied = next;
  }

  close(keep) {
    this.seq++;   // nothing still drawing lands after this
    if (keep) this.save(this.raw());
    else if (!same(this.applied, this.was) || !same(this.raw(), this.was)) {
      // Back to what you had: its tiles are still on disk, so say so before the choice flips back.
      const now = shared("crew.pets") ?? [];
      setShared("crew.pets", [...new Set([...now, ...this.wasPets])]);
      this.save(this.was ?? null);
    }
    closeOverlay(props()?.overlay);
  }

  // A made-up pal's pet as the sidebar draws it (crew.js palPet): bare, over a soft aura, with the
  // state's pool under the bigger ones. A placeholder until its tile is on disk.
  pet({ pet, state }, w) {
    const [, , bw, bh] = BARE_VIEW;
    const h = Math.round(w * bh / bw), st = state === "asleep" ? "rest" : state;
    const ready = this.drawn.has(petPath(pet, st, 0, true)) && (st !== "work" || this.drawn.has(petPath(pet, st, 1, true)));
    if (!ready) return div().w(w).h(h).flex_none();
    const k = w / 75, ax = Math.round(12 * k), ay = Math.round(9 * k), lit = w >= 60 && st !== "rest";
    return div().relative().w(w).h(h).flex_none().when(state === "asleep", (el) => el.opacity(0.5))
      .child(div().absolute().left(-ax).top(-ay).w(w + 2 * ax).h(h + 2 * ay).child(image(`${ICON}/pet-aura-row.svg`).w(w + 2 * ax).h(h + 2 * ay)))
      .when(lit, (el) => el.child(div().absolute().left(-6).top(h - 17).w(w + 12).h(24)
        .when(st === "ask", (x) => x.loop("opacity", { from: 0.35, to: 1, period: 1100 }))
        .child(image(`${ICON}/pet-floor-${st}.svg`).w(w + 12).h(24))))
      .child(div().absolute().left(0).top(0).child(petEl(pet, st, w, h, { open: true })));
  }

  render() {
    const d = ds(tone(theme()));
    const l = palLookOf(this.look), n = this.n;
    const crewNow = this.demo();
    const fit = pairFit(l.pets, l.screen);

    const badge = (f, text = FIT[f]) => div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1()
      .border_color(f === "best" ? `${d.ok}66` : f === "weak" ? d.line : d.lineMid).when(f === "best", (el) => el.bg(`${d.ok}1A`))
      .text_size(10.5).line_height("14px").font_family(d.mono).text_color(f === "best" ? d.okHi : f === "weak" ? d.fg3 : d.fg2).child(text);
    const sec = (title) => div().px(8).pt(2).pb(4).text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(title);
    const option = (kind, x, i, on, right = null) => div().id(`pl-${kind}-${x.id}`).flex().h(28).flex_none().items_center().gap(8).px(8).rounded(d.r.sm).cursor_pointer()
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { if (!on) this.set({ [kind]: x.id }, cx); })
      .child(div().w(16).flex_none().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg3).child(String(i + 1)))
      .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").when(on, (el) => el.font_weight(500)).text_color(on ? d.fg1 : d.body).child(x.name))
      .when(Boolean(right), (el) => el.child(right))
      .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(12).flex_none().text_color(d.info)));
    const chip = (id, on, label, onClick, lead = null) => div().id(id).flex().h(22).flex_none().items_center().justify_center().gap(4).px(7).rounded(4).cursor_pointer()
      .border_1().border_color(on ? `${d.info}7A` : d.lineMid).bg(on ? `${d.info}1F` : d.raised).when(!on, (el) => el.hover((s) => s.border_color(d.lineStrong)))
      .on_click((_e, cx) => onClick(cx))
      .when(Boolean(lead), (el) => el.child(lead))
      .child(div().text_size(11.5).line_height("14px").text_color(on ? d.infoText : d.body).child(label));
    const dots = (colors) => div().flex().flex_none().gap(3).children(colors.map((c) => div().size(9).flex_none().rounded(2).bg(c)));
    const label = (text) => div().flex_none().text_size(11.5).line_height("16px").text_color(d.fg2).child(text);
    const hint = (text) => div().text_size(11.5).line_height("16px").text_color(d.fg2).child(text);
    const legend = (pairs) => div().flex().flex_wrap().items_center().gap(10).children(pairs.map(([c, name]) =>
      div().flex().flex_none().items_center().gap(5).child(div().size(9).flex_none().rounded(2).bg(c)).child(label(name))));
    const swatches = (id, cur, key, input) => div().flex().items_center().gap(8)
      .child(div().flex().flex_none().gap(4).children(SWATCH.map((c, i) => div().id(`${id}-${i}`).size(16).flex_none().rounded(4).bg(c).cursor_pointer()
        .border_2().border_color(c === cur ? d.fg1 : d.bg1).hover((s) => s.border_color(d.lineStrong))
        .on_click((_e, cx) => this.set({ [key]: c }, cx)))))
      .child(div().w(84).flex_none().child(sheetField(d, Input.new(input).w_full().text_size(11.5).text_color(d.fg1))));
    const sub = () => div().flex().flex_col().gap(6).px(8).pt(6).pb(2);

    // What the chosen pet preset needs picked, or a line about it.
    const petSub = sub();
    if (l.pets === "own") petSub.child(hint("Each pal keeps its colour. Change one in its own look: right-click the pal, Customize look."));
    if (l.pets === "one") petSub.child(swatches("pl-pc", l.color, "color", this.hexPet));
    if (l.pets === "split") petSub
      .child(div().flex().flex_wrap().items_center().gap(4).child(label("Colours")).child(div().w(2))
        .children([2, 3, 4].map((k) => chip(`pl-k-${k}`, l.count === k, String(k), (cx) => this.set({ count: k }, cx))))
        .child(div().w(6))
        .children(SPLIT_PALETTES.map((sp) => chip(`pl-sp-${sp.id}`, l.palette === sp.id, sp.name, (cx) => this.set({ palette: sp.id }, cx), dots(sp.colors.slice(0, l.count))))))
      .child(hint(`${n} pal${n === 1 ? "" : "s"}: ${splitSizes(n, l.count).join(" + ")}. Follows your list's order, not who's busiest.`));
    if (l.pets === "brain") petSub.child(legend(["claude", "codex", "gemini", "grok", "hermes", "opencode"].map((k) => [BRAIN_COLORS[k], BRAIN_NAMES[k]])));
    if (l.pets === "state") petSub.child(legend([[STATE_COLORS.work, "Working"], [STATE_COLORS.ask, "Needs you, done"], [STATE_COLORS.stuck, "Stuck"], [STATE_COLORS.rest, "Resting"]]));
    if (l.pets === "group") petSub
      .child(div().flex().items_center().gap(4).child(label("Group by")).child(div().w(2))
        .child(chip("pl-g-project", l.group === "project", "Project", (cx) => this.set({ group: "project" }, cx)))
        .child(chip("pl-g-factory", l.group === "factory", "Factory", (cx) => this.set({ group: "factory" }, cx))))
      .child(hint(l.group === "factory" ? "Each pal takes its factory's own colour." : 'A pal\'s project is the part of its name before " - ", else its folder.'));
    if (l.pets === "theme") petSub.child(div().flex().items_center().gap(8).child(dots(themeColors(lookTheme()).slice(0, 6))).child(label("Your theme's colours. They follow it when it changes.")));

    const screenSub = sub();
    if (l.screen === "one") {
      screenSub.child(swatches("pl-sc", this.screenColor(), "screenColor", this.hexScreen));
      if (l.pets === "theme" && validHex(this.look.screenColor ?? "")) screenSub.child(div().flex().child(chip("pl-sc-accent", false, "Use the theme's accent", (cx) => this.set({ screenColor: null }, cx))));
    }

    const list = div().w(LIST_W).flex_none().flex().flex_col().gap(1)
      .child(sec("Pals"))
      .children(PET_LOOKS.map((x, i) => option("pets", x, i, x.id === l.pets)))
      .child(petSub)
      .child(div().h(1).my(8).bg(d.lineSoft))
      .child(sec("Laptop screens"))
      .children(SCREEN_LOOKS.map((x, i) => option("screen", x, i, x.id === l.screen, badge(pairFit(l.pets, x.id).fit))))
      .child(screenSub)
      .child(div().h(1).my(8).bg(d.lineSoft))
      .child(div().flex().flex_col().gap(4).px(8)
        .child(div().flex().child(badge(fit.fit, `${FIT[fit.fit]} together`)))
        .child(hint(fit.why)));

    // The preview: the made-up crew, all in view, as big as they fit.
    const [cols, w] = n === 1 ? [1, 208] : n === 4 ? [2, 132] : [3, 88];
    const big = cols < 3;
    const words = { work: ["Working", d.info], ask: ["Needs you", d.warn], done: ["Done", d.ok], stuck: ["Stuck", d.warn], pr: ["PR open", "#3FBF78"], rest: ["Resting", d.body], asleep: ["Asleep", d.fg2] };
    const cell = (x, i) => div().w(Math.floor((PREVIEW_W - 14) / cols)).flex_none().flex().flex_col().items_center()
      .child(this.pet(x, w))
      .child(div().max_w(big ? 150 : 98).truncate().mt(big ? 10 : 7).text_size(big ? 13 : 11.5).line_height(big ? "17px" : "15px").font_weight(600)
        .text_color(x.state === "asleep" ? d.fg2 : d.fg1).child(x.pal.name))
      .child(div().text_size(big ? 12 : 10.5).line_height(big ? "16px" : "14px").font_weight(500).text_color(words[x.state][1]).child(words[x.state][0]));
    const rows = [];
    for (let i = 0; i < crewNow.length; i += cols) rows.push(crewNow.slice(i, i + cols));
    const preview = div().w(PREVIEW_W).h(PREVIEW_H).flex_none().overflow_hidden().rounded(d.r.md).bg(d.bg1).border_1().border_color(d.line)
      .flex().flex_col().justify_center().gap(big ? 28 : 14)
      .children(rows.map((r, ri) => div().flex().flex_none().justify_center().children(r.map((x, i) => cell(x, ri * cols + i)))));
    const right = div().flex().flex_col().flex_none().gap(8)
      .child(div().flex().items_center().gap(4).child(label("Preview with")).child(div().w(2))
        .children(COUNTS.map((k) => chip(`pl-n-${k}`, n === k, String(k), (cx) => { this.n = k; this.draw(cx); cx.notify(); })))
        .child(div().w(2)).child(label("made-up pals")))
      .child(preview);

    return sheet(d, "crew-pallook", this.handle, (e, cx) => { if (e.key === "escape") { this.close(false); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "pl", face: this.pet({ pet: crewNow[0].pet, state: "work" }, 56), title: "Pal look",
        sub: "Colours for your pals and their laptop screens", onClose: () => this.close(true) }))
      .child(sheetBody().child(div().flex().items_start().gap(14).child(list).child(right)))
      .child(sheetFooter(d, { id: "pl", hint: "Applies as you click · Esc puts back what you had", onCancel: () => this.close(false),
        primary: "Done", onPrimary: () => this.close(true) }));
  }
}
