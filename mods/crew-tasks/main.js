// A pal's tasks (the hero's Tasks button; DeNon, 2026-11-08: "a Tell is really a task"). An "Add a
// task for <pal>…" field on top: Enter puts a real task on the shared board, assigned to that pal
// (`pal task add "…" --for <pal>`, marked from the owner), and the pal is told when its turn ends, so
// it picks it up next. Below, that pal's open tasks: tick one to finish it, click its title to see
// its details, notes and who asked. Quick questions you want answered now go in the terminal.
//
// The composer (DeNon: a better prompting area, and images): multi-line, 3 rows growing to 10;
// Enter adds, Shift+Enter is a new line. Images come by pasting (Ctrl+V of a screenshot), dropping
// files on the dialog, or the paperclip (recent screenshots, Pictures, Downloads: crew-attach). Each
// is copied into data/crew-attachments (images only, 10 MB at most, 6 per task) and shown as a
// thumbnail with ×. The task's first line is its title; the rest and the images' paths go in its
// body, so the pal's "New task" message lists them and it can open them.
// props: { space }.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, notify, spaces, shared, setShared, exec, appHome } from "herdr";
import { botOf, crewCli, loadOps, taskFor, ago, ds, tone, sheet, sheetHeader, sheetFace, sheetBody, sheetFooter } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const STORE = "data/crew-attachments";
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MAX_BYTES = 10 * 1024 * 1024, MAX_FILES = 6;
const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

export default class CrewTasks extends View {
  init(_props, cx) {
    this.input = TextareaState.new({ placeholder: `Add a task for ${this.pal()?.bot.name ?? "this pal"}… (a line, or a whole brief)`, rows: 3 });
    this.input.set_auto_grow(3, 10);
    this.input.on("change", (_e, cx) => cx.notify());
    // Enter adds (Shift+Enter is a new line). Whichever way the textarea reports Enter, add() reads
    // and clears the field, so a second report finds it empty.
    this.input.on("submit", (e, cx) => { if (!e?.shift) this.add(cx); });
    this.input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    this.input.focus();
    this.files = [];      // { path (absolute, in the store), rel (for image()), name }
    this.lastPick = shared("crew.attach.add")?.nonce ?? null;
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.tasks = [];
    this.open = null;     // the task whose details are shown
    this.busy = false;
    this.reload(cx);
    cx.timer.every(4000, (cx) => this.reload(cx));
  }

  pal() {
    const space = spaces().find((x) => x.id === props()?.space);
    return space ? { space, bot: botOf(space) } : null;
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      try { this.tasks = (await loadOps()).tasks ?? []; } catch { this.tasks = []; }
      cx.notify();
    });
  }

  // Copy image files into the store (images only, 10 MB at most, 6 per task).
  attach(paths, cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      for (const src of paths) {
        const name = src.split("/").pop();
        if (this.files.length >= MAX_FILES) { notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 }); break; }
        if (!IMAGE.test(name)) { notify({ title: `${name} isn't an image`, body: "Tasks take images (png, jpg, gif, webp, bmp).", level: "info", timeout: 3000 }); continue; }
        const file = `${stamp()}-${Math.random().toString(36).slice(2, 6)}-${name.replace(/[^\w.-]+/g, "_")}`;
        try {
          const r = await exec("sh", ["-c", '[ "$(stat -c %s -- "$2")" -le "$4" ] || exit 4; mkdir -p "$1" && cp -- "$2" "$1/$3"', "sh", dir, src, file, String(MAX_BYTES)]);
          if (r.code === 4) { notify({ title: `${name} is over 10 MB`, level: "info", timeout: 3000 }); continue; }
          if (r.code !== 0) throw new Error(r.stderr.trim());
          this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name });
        } catch (e) { notify({ title: `Couldn't attach ${name}`, body: String(e).slice(0, 160), level: "warning" }); }
      }
      // The paperclip's list was a popup over this dialog: give the typing back to the field, so
      // Enter adds the task.
      this.input.focus();
      cx.notify();
    });
  }

  // A paste with no text: the clipboard's image (Wayland's wl-paste).
  pasteImage(cx) {
    if (this.files.length >= MAX_FILES) return notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 });
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      const file = `${stamp()}-pasted.png`;
      try {
        const r = await exec("sh", ["-c",
          'type=$(wl-paste --list-types 2>/dev/null | grep -m1 "^image/") || exit 3; mkdir -p "$1" && wl-paste --type "$type" > "$1/$2" && [ "$(stat -c %s -- "$1/$2")" -le "$3" ] || { rm -f "$1/$2"; exit 4; }', "sh", dir, file, String(MAX_BYTES)]);
        if (r.code === 3) return notify({ title: "Nothing to paste", body: "The clipboard has no text or image.", level: "info", timeout: 2500 });
        if (r.code === 4) return notify({ title: "That image is over 10 MB", level: "info", timeout: 2500 });
        if (r.code !== 0) throw new Error(r.stderr.trim());
        this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name: "Pasted image" });
      } catch (e) { notify({ title: "Couldn't paste the image", body: String(e).slice(0, 160), level: "warning" }); }
      cx.notify();
    });
  }

  add(cx) {
    const p = this.pal();
    const text = this.input.value().replace(/\n+$/, "").trim();
    if (!p || (!text && !this.files.length) || this.busy) return;
    // The first line is the title (cut at 100); the rest, and the images' paths, are its body.
    const [first, ...more] = (text || "Look at the attached image" + (this.files.length > 1 ? "s" : "")).split("\n");
    const title = first.length > 100 ? `${first.slice(0, 97)}…` : first;
    const body = [first.length > 100 ? first : "", more.join("\n").trim(),
      this.files.length ? `Attached image${this.files.length > 1 ? "s" : ""} (open with your image tool):\n${this.files.map((f) => `- ${f.path}`).join("\n")}` : ""]
      .filter(Boolean).join("\n\n");
    const files = this.files;
    this.input.set_value("");
    this.files = [];
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await crewCli(["task", "add", title, "--for", p.space.name, ...(body ? ["--body", body] : [])]);
        notify({ title: `Task added for ${p.bot.name}`, body: "It's on the board; it picks it up when its turn ends.", level: "success", timeout: 2500 });
      } catch (e) {
        notify({ title: "Couldn't add the task", body: String(e.message ?? e).slice(0, 200), level: "warning" });
        // Give the draft back.
        if (!this.input.value()) this.input.set_value(text);
        if (!this.files.length) this.files = files;
      }
      this.busy = false;
      this.reload(cx);
    });
  }

  finish(t, cx) {
    cx.spawn(async (cx) => {
      try { await crewCli(["task", "done", t.id]); }
      catch (e) { notify({ title: "Couldn't finish it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.reload(cx);
    });
  }

  render(cx) {
    // A file picked in the paperclip's list (crew-attach posts it to shared state).
    const pick = shared("crew.attach.add");
    if (pick?.nonce && pick.nonce !== this.lastPick) { this.lastPick = pick.nonce; if (pick.for === "tasks") this.attach(pick.paths ?? [], cx); }
    const t = tone(theme());
    const d = ds(t);
    const p = this.pal();
    const close = () => closeOverlay(props()?.overlay);
    if (!p) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const { space, bot } = p;
    const mine = this.tasks.filter((x) => ["open", "claimed", "blocked"].includes(x.status) && taskFor(x, space.name))
      .sort((x, y) => (x.status === "claimed" ? 0 : x.status === "blocked" ? 1 : 2) - (y.status === "claimed" ? 0 : y.status === "blocked" ? 1 : 2) || x.created - y.created);
    const empty = !this.input.value().trim();

    const row = (x) => {
      const on = this.open === x.id;
      const tag = x.status === "claimed" ? ["working", d.infoText] : x.status === "blocked" ? ["blocked", d.warnText] : null;
      return v_flex().id(`tk-${x.id}`).flex_none().rounded(d.r.sm).when(on, (el) => el.bg(d.raised))
        .child(h_flex().h(32).px(8).gap(10).items_center()
          // The tick: finishes it.
          .child(div().id(`tk-done-${x.id}`).size(14).flex_none().rounded(3).border_1().border_color(d.lineStrong).cursor_pointer()
            .hover((s) => s.border_color(d.ok).bg(d.hover)).tooltip("Done")
            .on_click((_e, cx) => this.finish(x, cx)))
          .child(div().id(`tk-title-${x.id}`).flex_1().min_w(0).truncate().cursor_pointer().text_size(13).line_height("16px").text_color(d.fg1)
            .on_click((_e, cx) => { this.open = on ? null : x.id; cx.notify(); }).child(x.title))
          .when(Boolean(tag), (el) => el.child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(tag[1]).child(tag[0])))
          .child(div().flex_none().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg4).child(x.id)))
        .when(on, (el) => el.child(v_flex().gap(4).pl(32).pr(10).pb(10)
          .when(Boolean(x.body), (e2) => e2.child(div().text_size(12).line_height("17px").text_color(d.body).child(x.body)))
          .children((x.notes ?? []).slice(-2).map((n, i) => div().id(`tk-n-${x.id}-${i}`).text_size(12).line_height("17px").text_color(d.fg2)
            .child(`${n.by ?? ""}${n.by ? ": " : ""}${n.text ?? n}`)))
          .child(div().text_size(11).line_height("14px").text_color(d.fg3)
            .child([x.by && `from ${x.by}`, x.created && ago(x.created), x.claimed_by && `claimed by ${x.claimed_by}`].filter(Boolean).join(" · ")))));
    };

    return sheet(d, "crew-tasks", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .on_drop((e, cx) => this.attach(e.paths ?? [], cx))
      .child(sheetHeader(d, { id: "tk", face: sheetFace(bot, t), title: `Tasks for ${bot.name}`, onClose: close,
        sub: mine.length ? `${mine.length} open · it picks new ones up when its turn ends` : "Nothing open · it picks new ones up when its turn ends" }))
      .child(sheetBody()
        // The composer: the text, the images as thumbnails (× removes), and the paperclip.
        .child(v_flex().id("tk-compose").rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
          .on_key_down((e, cx) => { if (e.key === "enter" && !e.modifiers?.shift) this.add(cx); })
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(div().px(4).pt(2).child(Textarea.new(this.input).w_full().px(6).py(4).text_size(13.5).line_height("20px").text_color(d.fg1)))
          .when(this.files.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).px(10).pb(6)
            .children(this.files.map((f, i) => div().id(`tk-img-${i}`).relative().w(64).h(48).flex_none().rounded(4).overflow_hidden().border_1().border_color(d.line).tooltip(f.name)
              .child(image(f.rel).w(64).h(48))
              .child(div().id(`tk-img-x-${i}`).absolute().top(2).right(2).size(16).rounded(3).bg("#000000B3").flex().items_center().justify_center().cursor_pointer()
                .on_click((_e, cx) => { this.files.splice(i, 1); cx.notify(); })
                .child(svg(`${ICON}/x.svg`).size(8).text_color(d.fg1)))))))
          .child(h_flex().h(30).px(6).gap(6).items_center().border_t_1().border_color(d.lineSoft)
            .child(div().id("tk-clip").size(24).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
              .hover((s) => s.bg(d.hover)).tooltip("Attach an image (or paste one, or drop it here)")
              .on_click(() => openOverlay({ mod: "crew-attach", kind: "popup", width: 340, props: { for: "tasks" } }))
              .child(svg(`${ICON}/paperclip.svg`).size(13).text_color(d.fg2)))
            .child(div().flex_1().text_size(11).line_height("14px").text_color(d.fg4)
              .child(this.files.length ? `${this.files.length} image${this.files.length > 1 ? "s" : ""} · ${MAX_FILES} at most` : "Paste or drop an image, or use the paperclip"))))
        .child(v_flex().id("tk-list").gap(2).max_h(320).overflow_y_scrollbar()
          .children(mine.map(row))
          .when(!mine.length, (el) => el.child(div().py(8).px(8).text_size(12).line_height("16px").text_color(d.fg3)
            .child(`Add one above: it goes on the shared board, assigned to ${bot.name}.`))))
        .child(div().id("tk-board").cursor_pointer().hover((s) => s.opacity(0.75)).on_click(() => { setShared("crew.view", "tasks"); close(); })
          .child(div().text_size(12).line_height("16px").text_color(d.fg2).child("All tasks on the board →"))))
      .child(sheetFooter(d, { id: "tk", hint: "Enter adds · Shift+Enter new line · Esc closes", onCancel: close, cancelLabel: "Close", ready: (!empty || this.files.length > 0) && !this.busy,
        primary: this.busy ? "Adding…" : "Add task", onPrimary: (cx) => this.add(cx) }));
  }
}
