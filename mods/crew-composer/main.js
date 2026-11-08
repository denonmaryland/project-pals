// Project Pals composer, for rooms only. A channel is its terminal now (terminal-first, DeNon
// 2026-11-08): you type straight into it, Herdr pastes images and takes dropped files there, and the
// agent's own status line says its model and permission mode. A room has no terminal, so this box is
// how you post to one; the layout shows it only while a room is shown (showRoom / showTabs).
// "@Pal" in a message delivers it to those members only, else to everyone in the room.
//
// Attachments: the paperclip (recent files), dropping files on the box, or pasting an image. Each is
// copied to ~/.config/herdr-app/data/crew-attachments and posted as its path on its own line.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, notify, exec, appHome, openOverlay, shared, setShared } from "herdr";
import { owner, a, shownRoom, roomMembers, roomTargets, appendRoomLog, deliverToRoom, tone, ds } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const STORE = "data/crew-attachments";
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

export default class CrewComposer extends View {
  init(_props, cx) {
    // One field per room, each saying where it goes ("Message #launch"); switching keeps drafts.
    this.inputs = new Map();
    this.labels = new Map(); // key → the label its field was made with
    this.fallback = this.make("Message");
    this.ensure();
    // Fields can't be made while drawing, so a light check makes one when you switch somewhere new.
    cx.timer.every(200, (cx) => { if (this.ensure()) cx.notify(); });
    this.files = []; // { path (absolute, in the store), rel (for image()), name, image }
    this.lastPick = shared("crew.attach.add")?.nonce ?? null;
  }

  where() {
    const room = shownRoom();
    return room ? { key: `room:${room.id}`, label: `Message #${room.name}` } : { key: "none", label: "Message" };
  }

  make(label) {
    const input = InputState.new({ placeholder: label });
    input.on("submit", (_e, cx) => this.send(cx));
    input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    input.on("change", (_e, cx) => cx.notify());
    // A paste with no text: an image on the clipboard.
    input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    return input;
  }

  // Make the field for where you are now, if it's new; true when one was made.
  ensure() {
    const w = this.where();
    const old = this.inputs.get(w.key);
    // Same place, same name: nothing to do. A renamed channel needs a new field, since a field's
    // label is fixed when it's made; what you'd typed moves over.
    if (old && this.labels.get(w.key) === w.label) return false;
    const input = this.make(w.label);
    const carry = old?.value() || this.fallback.value();
    if (carry) input.set_value(carry);
    this.fallback.set_value("");
    this.inputs.set(w.key, input);
    this.labels.set(w.key, w.label);
    if (this.typing) input.focus();
    return true;
  }

  field() { return this.inputs.get(this.where().key) ?? this.fallback; }


  stamp() { return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); }

  // Copy files into the store so they outlive caches and show as thumbnails.
  add(paths, cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      for (const src of paths) {
        const name = src.split("/").pop();
        const file = `${this.stamp()}-${Math.random().toString(36).slice(2, 6)}-${name.replace(/[^\w.-]+/g, "_")}`;
        try {
          const r = await exec("sh", ["-c", 'mkdir -p "$1" && cp -- "$2" "$1/$3"', "sh", dir, src, file]);
          if (r.code !== 0) throw new Error(r.stderr.trim());
          this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name, image: IMAGE.test(name) });
        } catch (e) {
          notify({ title: `Couldn't attach ${name}`, body: String(e).slice(0, 160), level: "warning" });
        }
      }
      cx.notify();
    });
  }

  pasteImage(cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      const file = `${this.stamp()}-pasted.png`;
      try {
        const r = await exec("sh", ["-c",
          'type=$(wl-paste --list-types 2>/dev/null | grep -m1 "^image/") || exit 3; mkdir -p "$1" && wl-paste --type "$type" > "$1/$2"', "sh", dir, file]);
        if (r.code === 3) return notify({ title: "Nothing to paste", body: "The clipboard has no text or image.", level: "info", timeout: 2500 });
        if (r.code !== 0) throw new Error(r.stderr.trim());
        this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name: "Pasted image", image: true });
      } catch (e) {
        notify({ title: "Couldn't paste the image", body: String(e).slice(0, 160), level: "warning" });
      }
      cx.notify();
    });
  }

  // In a room: log it, and deliver to the @mentioned members (or everyone).
  sendToRoom(room, raw, cx) {
    const members = roomMembers(room);
    const to = roomTargets(members, raw, true);
    const text = [raw, ...this.files.map((f) => f.path)].filter(Boolean).join("\n");
    this.field().set_value("");
    this.files = [];
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const everyone = !/@[\w.-]/.test(raw);
        await appendRoomLog(room, { at: Date.now(), from: "You", text, kind: "say", to: everyone ? [] : to.map((m) => m.name), everyone });
        // Tell the room view to load it and scroll to it right away.
        setShared("crew.room.sent", Date.now());
        await deliverToRoom(room, to, owner(), text, everyone);
      } catch (e) {
        notify({ title: `Couldn't post to #${room.name}`, body: String(e).slice(0, 160), level: "error" });
      }
      cx.notify();
    });
  }

  send(cx) {
    const raw = this.field().value().trim();
    const room = shownRoom();
    if ((!raw && !this.files.length) || !room) return;
    this.sendToRoom(room, raw, cx);
  }

  chip(f, i, t) {
    return h_flex().id(`att-${i}`).flex_none().items_center().gap(6).h(26).pl(3).pr(7).rounded(4)
      .bg(a(t.foreground, "0c"))
      .child(f.image ? image(f.rel).w(22).h(22).rounded(6).flex_none()
        : div().size(22).flex_none().rounded(6).flex().items_center().justify_center().bg(a(t.foreground, "10"))
          .child(svg(`${ICON}/file.svg`).size(12).text_color(t.muted)))
      .child(div().max_w(110).truncate().text_size(12).text_color(t.foreground).child(f.name))
      .child(div().id(`att-x-${i}`).cursor_pointer().on_click((_e, cx) => { this.files.splice(i, 1); cx.notify(); })
        .child(svg(`${ICON}/x.svg`).size(11).text_color(t.dim)));
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    // A file picked in the attach popup.
    const pick = shared("crew.attach.add");
    if (pick?.nonce && pick.nonce !== this.lastPick) { this.lastPick = pick.nonce; this.add(pick.paths ?? [], cx); }
    const field = this.field();
    const ready = Boolean(field.value().trim() || this.files.length);
    const square = (id, icon, size, bg, color, action, tip) => div().id(id).size(28).flex_none().rounded(d.r.sm).flex().items_center().justify_center()
      .cursor_pointer().when(Boolean(bg), (el) => el.bg(bg)).hover((s) => s.opacity(0.85)).on_click(action).when(Boolean(tip), (el) => el.tooltip(tip))
      .child(svg(`${ICON}/${icon}.svg`).size(size).text_color(color));
    const card = v_flex().id("crew-compose").w_full().gap(8).py(10).pl(12).pr(10).rounded(d.r.lg)
      .bg(d.composer).border_1().border_color(d.lineStrong)
      .child(h_flex().w_full().min_h(22).items_center().gap(6).flex_wrap()
        .children(this.files.map((f, i) => this.chip(f, i, t)))
        .child(div().flex_1().min_w(80).flex().items_center()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(field).w_full().text_size(14).line_height("22px").text_color(d.body))))
      .child(h_flex().w_full().items_center().gap(6)
        .child(square("crew-attach", "ds-plus", 14, d.ctl, d.body, () => openOverlay({ mod: "crew-attach", kind: "popup", width: 400, height: 440 }), "Attach a file"))
        .child(div().flex_1())
        .child(square("crew-send", "ds-send", 14, d.act, d.actFg, (_e, cx) => this.send(cx), "Send").when(!ready, (el) => el.opacity(0.85))));
    return h_flex().id("crew-composer").size_full().items_end().justify_center().bg(d.bg0).px(24).pb(12)
      .on_drop((e, cx) => this.add(e.paths ?? [], cx))
      .child(card);
  }
}
