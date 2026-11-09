// The hero's "Give <pal> a task…" composer (DeNon 2026-11-08). It does what the Tasks dialog's
// composer does (mods/crew-tasks): Enter puts a real task on the shared board for the pal
// (`pal task add "…" --for <pal> --body …`; the pal is told when its turn ends), Shift+Enter is a new
// line, and images come by pasting, dropping on the hero, or the paperclip (crew-attach), copied by
// bin/crewattach.py into data/crew-attachments (images only, 10 MB at most, 6 per task). The first
// line is the title; the rest and the images' paths are the body.
//
// Each pal has its own draft (its own field): switching pals shows that pal's, and a send always goes
// to the pal the field belongs to (never one pal's text to another, like review H4).

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { notify, openOverlay, shared, exec, appHome, home } from "herdr";
import { crewCli, pebble } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const STORE = "data/crew-attachments";
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MAX_FILES = 6;

async function attachCli(args) {
  const r = await exec("python3", [`${home()}/.local/lib/herdr-crew/crewattach.py`, ...args]);
  try { return { ...JSON.parse(r.stdout.trim().split("\n").pop() || "{}"), code: r.code }; } catch { return { error: r.stderr.trim() || "the attachment helper failed", code: r.code || 1 }; }
}

// The task a draft makes: [title, body] (the Tasks dialog's rule). Pure: tests/test_stage.mjs.
export function taskOf(text, files) {
  const [first, ...more] = (String(text ?? "").replace(/\n+$/, "").trim() || "Look at the attached image" + (files.length > 1 ? "s" : "")).split("\n");
  const title = first.length > 100 ? `${first.slice(0, 97)}…` : first;
  const body = [first.length > 100 ? first : "", more.join("\n").trim(),
    files.length ? `Attached image${files.length > 1 ? "s" : ""} (open with your image tool):\n${files.map((f) => `- ${f.path}`).join("\n")}` : ""]
    .filter(Boolean).join("\n\n");
  return [title, body];
}

export class TaskDraft {
  // key: who asks the paperclip popup ("profile-main", "profile-stage"), so only this one takes its pick.
  constructor(key, onSent) {
    this.key = key;
    this.drafts = {};      // space id → { input, files }: one per pal (its placeholder names the pal)
    this.space = null;     // the pal (space id) shown
    this.spaceName = null;
    this.name = "";
    this.input = null;
    this.files = [];
    this.busy = false;
    this.lastPick = shared("crew.attach.add")?.nonce ?? null;
    this.onSent = onSent;
  }

  // Call each render with the shown pal: switches to that pal's own draft. Render may only switch:
  // Herdr refuses TextareaState.new during render ("This view could not be rendered", seen live
  // 2026-11-09, T49), so a pal without a draft yet shows no field (input null) until ensure() runs.
  follow(space, bot) {
    if (!space) return false;
    this.name = bot?.name ?? space.name;
    if (space.id === this.space && this.input) return true;
    if (this.space && this.input) this.drafts[this.space] = { input: this.input, files: this.files };
    const dr = this.drafts[space.id];
    this.space = space.id;
    this.spaceName = space.name;
    this.input = dr?.input ?? null;
    this.files = dr?.files ?? [];
    return Boolean(dr);
  }

  // Make the pal's draft field. Never from render: from init, a timer or an event (initStage).
  // True when it made one (the caller then redraws).
  ensure(space, bot) {
    if (!space || this.drafts[space.id]) return false;
    const input = TextareaState.new({ placeholder: `Give ${bot?.name ?? space.name} a task…`, rows: 1 });
    input.set_auto_grow(1, 6);
    input.on("change", (_e, cx) => cx.notify());
    input.on("submit", (e, cx) => { if (!e?.shift) this.add(cx); });
    input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    // Images dropped on the hero in the moment before the field existed stay with it.
    this.drafts[space.id] = { input, files: this.space === space.id ? this.files : [] };
    return true;
  }

  empty() { return !this.input || (!this.input.value().trim() && !this.files.length); }

  // A file picked in the paperclip's list (crew-attach posts it to shared state).
  takePick(cx) {
    const pick = shared("crew.attach.add");
    if (pick?.nonce && pick.nonce !== this.lastPick) { this.lastPick = pick.nonce; if (pick.for === this.key) this.attach(pick.paths ?? [], cx); }
  }

  attach(paths, cx) {
    const list = this.files;   // this pal's, even if another pal shows by the time a copy finishes
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      for (const src of paths) {
        const name = src.split("/").pop();
        if (list.length >= MAX_FILES) { notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 }); break; }
        if (!IMAGE.test(name)) { notify({ title: `${name} isn't an image`, body: "Tasks take images (png, jpg, gif, webp, bmp).", level: "info", timeout: 3000 }); continue; }
        try {
          const out = await attachCli(["copy", src, dir]);
          if (out.code === 4) { notify({ title: `${name} is over 10 MB`, level: "info", timeout: 3000 }); continue; }
          if (out.code === 5 || out.code === 6) { notify({ title: `Couldn't attach ${name}`, body: out.error, level: "info", timeout: 3000 }); continue; }
          if (!out.path) throw new Error(out.error ?? "it didn't copy");
          list.push({ path: out.path, rel: `${STORE}/${out.path.split("/").pop()}`, name });
        } catch (e) { notify({ title: `Couldn't attach ${name}`, body: String(e).slice(0, 160), level: "warning" }); }
      }
      this.input?.focus();
      cx.notify();
    });
  }

  pasteImage(cx) {
    if (this.files.length >= MAX_FILES) return notify({ title: `${MAX_FILES} images at most`, level: "info", timeout: 2500 });
    const list = this.files;
    cx.spawn(async (cx) => {
      try {
        const out = await attachCli(["paste", `${appHome()}/${STORE}`]);
        if (out.code === 3) return notify({ title: "Nothing to paste", body: "The clipboard has no text or image.", level: "info", timeout: 2500 });
        if (out.code === 4) return notify({ title: "That image is over 10 MB", level: "info", timeout: 2500 });
        if (out.code === 5) return notify({ title: "That isn't an image", level: "info", timeout: 2500 });
        if (!out.path) throw new Error(out.error ?? "it didn't paste");
        list.push({ path: out.path, rel: `${STORE}/${out.path.split("/").pop()}`, name: "Pasted image" });
      } catch (e) { notify({ title: "Couldn't paste the image", body: String(e).slice(0, 160), level: "warning" }); }
      cx.notify();
    });
  }

  add(cx) {
    if (!this.spaceName || this.empty() || this.busy) return;
    const input = this.input, files = this.files, pal = this.spaceName, name = this.name;
    const text = input.value();
    const [title, body] = taskOf(text, files);
    input.set_value("");
    this.files = [];
    this.drafts[this.space] = { input, files: this.files };
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await crewCli(["task", "add", title, "--for", pal, ...(body ? ["--body", body] : [])]);
        notify({ title: `Task added for ${name}`, body: "It's on the board; it picks it up when its turn ends.", level: "success", timeout: 2500 });
        this.onSent?.(cx);
      } catch (e) {
        notify({ title: "Couldn't add the task", body: String(e.message ?? e).slice(0, 200), level: "warning" });
        // Give the draft back, to the pal it was for (its own field).
        if (!input.value()) input.set_value(text);
        for (const dr of Object.values(this.drafts)) if (dr.input === input && !dr.files.length) dr.files.push(...files);
      }
      this.busy = false;
      cx.notify();
    });
  }

  // The composer: a 38 px field (growing to six lines), the images as thumbnails, the paperclip and
  // the send pebble. `w`: its width.
  view(d, id, w) {
    const ready = !this.empty() && !this.busy;
    return v_flex().id(id).w(w).flex_none().rounded(d.r.lg).bg(d.raised).border_1().border_color(d.lineMid)
      .on_key_down((e, cx) => { if (e.key === "enter" && !e.modifiers?.shift) { cx.stop_propagation(); this.add(cx); } })
      .child(h_flex().items_start().gap(6).pl(6).pr(5).py(5)
        .child(div().id(`${id}-clip`).mt(2).size(26).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Attach an image (or paste one, or drop it on the stage)")
          .on_click(() => openOverlay({ mod: "crew-attach", kind: "popup", width: 340, props: { for: this.key } }))
          .child(svg(`${ICON}/paperclip.svg`).size(13).text_color(d.fg2)))
        .child(div().flex_1().min_w(0).pt(1).child(this.input
          ? Textarea.new(this.input).w_full().px(2).py(4).text_size(13).line_height("20px").text_color(d.fg1)
          : div().px(2).py(4).text_size(13).line_height("20px").text_color(d.fg3).child(`Give ${this.name || "this pal"} a task…`)))
        .child(div().mt(1).child(pebble(d, { id: `${id}-send`, icon: "ds-send", label: this.busy ? "Adding…" : "Add task", primary: true, disabled: !ready,
          tooltip: "Enter adds · Shift+Enter new line", onClick: (cx) => this.add(cx) }))))
      .when(this.files.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).px(10).pb(8)
        .children(this.files.map((f, i) => div().id(`${id}-img-${i}`).relative().w(56).h(42).flex_none().rounded(d.r.sm).overflow_hidden().border_1().border_color(d.line).tooltip(f.name)
          .child(image(f.rel).w(56).h(42))
          .child(div().id(`${id}-img-x-${i}`).absolute().top(2).right(2).size(16).rounded(3).bg("#000000B3").flex().items_center().justify_center().cursor_pointer()
            .on_click((_e, cx) => { this.files.splice(i, 1); cx.notify(); })
            .child(svg(`${ICON}/x.svg`).size(8).text_color(d.fg1)))))));
  }
}
