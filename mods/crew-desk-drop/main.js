// The quick-drop (docs/desk/design.md §11.2): one card onto any desk, from anywhere. Ctrl+Shift+D
// (crew-header.drop), the command bar's "Drop a card…", the Desk view's Drop button.
//
// - The text: multi-line, 3 rows growing to 10 (the Tasks composer). Its first line is the card's
//   title. Images by pasting, dropping files on the dialog, or the paperclip (crew-attach): each is
//   copied into data/crew-attachments (images only, 10 MB at most, 6 a card) and sent with --attach.
// - To: Auto (To route until triage ships, stage 4), a pal (its pal tray: the rules pick the topic),
//   or Pal#topic, with a filter field (typeahead over spaces()). With no pals it's To route only.
// - Urgency: Low · Normal · Soon · Now (Now only here: the owner's interrupt).
// - Track on the board: on by default once the text has more than one line (--task makes a T-n).
// Enter drops, Shift+Enter is a new line. The card goes as the owner's, with a click token
// (ownerCli: `pal desk send … --click`); a toast says where it landed ("Dropped on Pal #topic · c-7f3a",
// "Waiting in To route · c-7f3a", or "Held · …" with why). props: { to? }.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, notify, spaces, shared, exec, appHome, home } from "herdr";
import { ownerCli, ds, tone, channelName, URGENCIES, urgencyColor, sheet, sheetHeader, sheetBody, sheetFooter, sheetSelect, sheetToggle,
  sheetPanel, sheetPanelBox, sheetOption, sheetRow } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const STORE = "data/crew-attachments";
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MAX_FILES = 6;
const ROUTE = "route";
async function attachCli(args) {
  const r = await exec("python3", [`${home()}/.local/lib/herdr-crew/crewattach.py`, ...args]);
  try { return { ...JSON.parse(r.stdout.trim().split("\n").pop() || "{}"), code: r.code }; } catch { return { error: r.stderr.trim() || "the attachment helper failed", code: r.code || 1 }; }
}
const URGENCY_WORD = { low: "Low", normal: "Normal", soon: "Soon", now: "Now" };

export default class CrewDeskDrop extends View {
  init(_props, cx) {
    this.input = TextareaState.new({ placeholder: "What's it about? The first line is its title; the rest, and any images, its body.", rows: 3 });
    this.input.set_auto_grow(3, 10);
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (e, cx) => { if (!e?.shift) this.drop(cx); });
    this.input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.filter = InputState.new({ placeholder: "Pal or Pal#topic…" });
    this.filter.on("change", (_e, cx) => cx.notify());
    this.filter.on("submit", (_e, cx) => { const first = this.targets()[0]; if (first) this.pickTo(first.to, cx); });
    this.handle = cx.focus_handle();
    this.to = props()?.to ?? ROUTE;
    this.toOpen = false;
    this.urgency = "normal";
    this.track = null;     // null: on for multi-line text; true/false once clicked
    this.files = [];
    this.busy = false;
    this.lastPick = shared("crew.attach.add")?.nonce ?? null;
  }

  close() { closeOverlay(props()?.overlay); }

  // Every place a card can go: Auto (To route), each pal, each of its topics.
  targets() {
    const q = (this.filter.value() ?? "").trim().toLowerCase().replace(/^@/, "");
    const out = [{ to: ROUTE, label: spaces().length ? "Auto" : "To route", sub: spaces().length ? "To route for now" : "no pals yet" }];
    for (const s of spaces()) {
      out.push({ to: s.name, label: s.name, sub: "the pal: the rules pick a topic" });
      for (const t of s.tabs ?? []) out.push({ to: `${s.name}#${channelName(t)}`, label: `${s.name} #${channelName(t)}`, sub: t.status && t.status !== "idle" ? t.status : null });
    }
    if (!q) return out;
    return out.filter((x) => x.label.toLowerCase().includes(q) || x.to.toLowerCase().includes(q));
  }

  toLabel() {
    if (this.to === ROUTE) return spaces().length ? "Auto (To route)" : "To route";
    const [pal, topic] = this.to.split("#");
    return topic ? `${pal} #${topic}` : pal;
  }

  pickTo(to, cx) { this.to = to; this.toOpen = false; this.filter.set_value(""); this.input.focus(); cx.notify(); }

  tracking() {
    if (this.track !== null) return this.track;
    return this.input.value().trim().includes("\n");
  }

  attach(paths, cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      for (const src of paths) {
        const name = src.split("/").pop();
        if (this.files.length >= MAX_FILES) { notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 }); break; }
        if (!IMAGE.test(name)) { notify({ title: `${name} isn't an image`, body: "Cards take images (png, jpg, gif, webp, bmp).", level: "info", timeout: 3000 }); continue; }
        try {
          const out = await attachCli(["copy", src, dir]);
          if (out.code === 4) { notify({ title: `${name} is over 10 MB`, level: "info", timeout: 3000 }); continue; }
          if (out.code === 5 || out.code === 6) { notify({ title: `Couldn't attach ${name}`, body: out.error, level: "info", timeout: 3000 }); continue; }
          if (!out.path) throw new Error(out.error ?? "it didn't copy");
          this.files.push({ path: out.path, rel: `${STORE}/${out.path.split("/").pop()}`, name });
        } catch (e) { notify({ title: `Couldn't attach ${name}`, body: String(e).slice(0, 160), level: "warning" }); }
      }
      this.input.focus();
      cx.notify();
    });
  }

  pasteImage(cx) {
    if (this.files.length >= MAX_FILES) return notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 });
    cx.spawn(async (cx) => {
      try {
        const out = await attachCli(["paste", `${appHome()}/${STORE}`]);
        if (out.code === 3) return notify({ title: "Nothing to paste", body: "The clipboard has no text or image.", level: "info", timeout: 2500 });
        if (out.code === 4) return notify({ title: "That image is over 10 MB", level: "info", timeout: 2500 });
        if (out.code === 5) return notify({ title: "That isn't an image", level: "info", timeout: 2500 });
        if (!out.path) throw new Error(out.error ?? "it didn't paste");
        this.files.push({ path: out.path, rel: `${STORE}/${out.path.split("/").pop()}`, name: "Pasted image" });
      } catch (e) { notify({ title: "Couldn't paste the image", body: String(e).slice(0, 160), level: "warning" }); }
      cx.notify();
    });
  }

  drop(cx) {
    const text = this.input.value().replace(/\n+$/, "").trim() || (this.files.length ? `Look at the attached image${this.files.length > 1 ? "s" : ""}` : "");
    if (!text || this.busy) return;
    const files = this.files, track = this.tracking();
    const args = ["desk", "send", this.to, text, "--urgency", this.urgency, ...(track ? ["--task"] : []),
      ...files.flatMap((f) => ["--attach", f.path]), "--json"];
    this.input.set_value("");
    this.files = [];
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await ownerCli(args);
        let res = {};
        try { res = JSON.parse(out); } catch { try { res = JSON.parse(out.trim().split("\n").pop()); } catch {} }
        const id = res.card?.id ?? "";
        const where = res.card?.to ?? this.to;
        const what = String(res.what ?? "queued");
        if (what.startsWith("held")) notify({ title: `Held · ${id}`, body: what.replace(/^held:\s*/, ""), level: "warning", timeout: 5000 });
        else if (what.startsWith("waiting")) notify({ title: `${what[0].toUpperCase()}${what.slice(1)} · ${id}`, level: "success", timeout: 3000 });
        else notify({ title: `Dropped on ${where.replace("#", " #")} · ${id}`, body: track ? "Tracked on the board too." : null, level: "success", timeout: 3000 });
        this.busy = false;
        this.close();
      } catch (e) {
        notify({ title: "Couldn't drop the card", body: String(e.message ?? e).slice(0, 200), level: "warning" });
        if (!this.input.value()) this.input.set_value(text);
        if (!this.files.length) this.files = files;
        this.busy = false;
        cx.notify();
      }
    });
  }

  render(cx) {
    const pick = shared("crew.attach.add");
    if (pick?.nonce && pick.nonce !== this.lastPick) { this.lastPick = pick.nonce; if (pick.for === "desk-drop") this.attach(pick.paths ?? [], cx); }
    const t = tone(theme());
    const d = ds(t);
    const ready = Boolean(this.input.value().trim() || this.files.length) && !this.busy;
    const track = this.tracking();

    const urg = h_flex().h(26).flex_none().items_center().p(2).gap(2).rounded(6).bg(d.raised).border_1().border_color(d.line)
      .children(URGENCIES.map((u) => {
        const on = this.urgency === u;
        const dot = urgencyColor(d, u);
        return div().id(`dd-u-${u}`).h(20).px(8).flex().items_center().gap(5).rounded(4).cursor_pointer()
          .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
          .tooltip({ low: "An FYI: whenever it gets to it", normal: "When its current step ends", soon: "Before it goes on", now: "Interrupt it (yours only)" }[u])
          .on_click((_e, cx) => { this.urgency = u; cx.notify(); })
          .when(Boolean(dot), (el) => el.child(div().size(6).rounded(3).bg(dot)))
          .child(div().text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(URGENCY_WORD[u]));
      }));

    const toPanel = () => {
      const panel = sheetPanel(d, "dd-to");
      for (const x of this.targets().slice(0, 60)) panel.child(sheetOption(d, `dd-to-${x.to}`, { on: x.to === this.to, label: x.label, sub: x.sub, onClick: (cx) => this.pickTo(x.to, cx) }));
      return v_flex().gap(6)
        .child(div().flex().h(30).items_center().px(10).rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(div().flex_1().min_w(0).child(Input.new(this.filter).w_full().text_size(13).text_color(d.fg1))))
        .child(sheetPanelBox(d, "dd-to-box", panel, 220));
    };

    return sheet(d, "crew-desk-drop", this.handle, (e, cx) => { if (e.key === "escape") { if (this.toOpen) { this.toOpen = false; cx.notify(); } else this.close(); cx.stop_propagation(); } })
      .on_drop((e, cx) => this.attach(e.paths ?? [], cx))
      .child(sheetHeader(d, { id: "dd", title: "Drop a card", onClose: () => this.close(),
        sub: "It lands on a desk with a status and receipts; the Desk view follows it." }))
      .child(sheetBody()
        .child(v_flex().id("dd-compose").rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
          .on_key_down((e, cx) => { if (e.key === "enter" && !e.modifiers?.shift && !this.toOpen) this.drop(cx); })
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(div().px(4).pt(2).child(Textarea.new(this.input).w_full().px(6).py(4).text_size(13.5).line_height("20px").text_color(d.fg1)))
          .when(this.files.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).px(10).pb(6)
            .children(this.files.map((f, i) => div().id(`dd-img-${i}`).relative().w(64).h(48).flex_none().rounded(4).overflow_hidden().border_1().border_color(d.line).tooltip(f.name)
              .child(image(f.rel).w(64).h(48))
              .child(div().id(`dd-img-x-${i}`).absolute().top(2).right(2).size(16).rounded(3).bg("#000000B3").flex().items_center().justify_center().cursor_pointer()
                .on_click((_e, cx) => { this.files.splice(i, 1); cx.notify(); })
                .child(svg(`${ICON}/x.svg`).size(8).text_color(d.fg1)))))))
          .child(h_flex().h(30).px(6).gap(6).items_center().border_t_1().border_color(d.lineSoft)
            .child(div().id("dd-clip").size(24).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
              .hover((s) => s.bg(d.hover)).tooltip("Attach an image (or paste one, or drop it here)")
              .on_click(() => openOverlay({ mod: "crew-attach", kind: "popup", width: 340, props: { for: "desk-drop" } }))
              .child(svg(`${ICON}/paperclip.svg`).size(13).text_color(d.fg2)))
            .child(div().flex_1().text_size(11).line_height("14px").text_color(d.fg4)
              .child(this.files.length ? `${this.files.length} image${this.files.length > 1 ? "s" : ""} · ${MAX_FILES} at most` : "Paste or drop an image, or use the paperclip"))))
        .child(sheetRow()
          .child(sheetSelect(d, "dd-to-sel", { label: "To", value: this.toLabel(), open: this.toOpen, onClick: () => {
            this.toOpen = !this.toOpen;
            if (this.toOpen) this.filter.focus(); else this.input.focus();
          } }))
          .child(urg)
          .child(sheetToggle(d, "dd-track", { label: "Track on the board", on: track, onClick: () => { this.track = !track; } })))
        .when(this.toOpen, (el) => el.child(toPanel())))
      .child(sheetFooter(d, { id: "dd", hint: "Enter drops · Shift+Enter new line · Esc closes", onCancel: () => this.close(), ready,
        primary: this.busy ? "Dropping…" : "Drop", onPrimary: (cx) => this.drop(cx) }));
  }
}
