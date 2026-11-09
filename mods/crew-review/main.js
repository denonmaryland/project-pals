// Review a worktree channel's branch: its files and diff against the branch it came from.
// Click a line to comment on it; "Send to #channel" hands the notes to that channel (delivered
// when its turn ends), and "Land" merges the branch into the project (pal land).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces } from "herdr";
import { crewCli, ownerCli, channelName, botOf, mascotEl, a, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const ROW = 20;

// Unified diff → rows: file headers, hunks, and lines with their new-file line number.
function parse(patch) {
  const rows = [];
  let file = null, next = 0, old = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = raw.replace(/^diff --git a\/.* b\//, "");
      rows.push({ kind: "file", text: file, file });
    } else if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      old = Number(m?.[1] ?? 0); next = Number(m?.[2] ?? 0);
      rows.push({ kind: "hunk", text: raw, file });
    } else if (!file || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("new file") || raw.startsWith("deleted file") || raw.startsWith("similarity") || raw.startsWith("rename ")) {
      continue;
    } else if (raw.startsWith("+")) {
      rows.push({ kind: "add", text: raw.slice(1), file, line: next++ });
    } else if (raw.startsWith("-")) {
      rows.push({ kind: "del", text: raw.slice(1), file, line: old++, oldSide: true });
    } else if (raw.startsWith("\\") || raw === "") {
      continue;
    } else {
      rows.push({ kind: "ctx", text: raw.slice(1), file, line: next++ });
      old++;
    }
  }
  return rows;
}

export default class CrewReview extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.rows = [];
    this.file = null;          // shown file (null: all)
    this.picked = null;        // the row being commented on
    this.comments = [];        // { where, quote, text }
    this.comment = InputState.new({ placeholder: "Comment on the whole change, or click a line first" });
    this.comment.on("submit", (_e, cx) => this.addComment(cx));
    this.handle = cx.focus_handle();
    this.load(cx);
  }

  target() {
    const p = props() ?? {};
    const space = spaces().find((s) => s.id === p.space);
    const tab = space?.tabs.find((x) => x.id === p.tab);
    return space && tab ? { space, tab, spec: `${space.name}#${channelName(tab)}` } : null;
  }

  load(cx) {
    const tg = this.target();
    if (!tg) { this.error = "That topic is gone."; return; }
    cx.spawn(async (cx) => {
      try {
        this.data = JSON.parse(await crewCli(["diff", tg.spec, "--json"]));
        this.rows = parse(this.data.patch ?? "");
      } catch (e) { this.error = String(e.message ?? e); }
      cx.notify();
    });
  }

  addComment(cx) {
    const text = this.comment.value().trim();
    if (!text) return;
    const r = this.picked;
    this.comments.push(r ? { where: `${r.file}:${r.line}${r.oldSide ? " (removed line)" : ""}`, quote: r.text.trim().slice(0, 80), text } : { where: "overall", text });
    this.comment.set_value("");
    this.picked = null;
    cx.notify();
  }

  send(cx) {
    const tg = this.target();
    if (!tg || !this.comments.length) return;
    const body = `Review notes on your branch ${this.data.branch}:\n` + this.comments.map((c) =>
      `- ${c.where}${c.quote ? ` (\`${c.quote}\`)` : ""}: ${c.text}`).join("\n") + "\nPlease address these, commit, and say when it's ready.";
    cx.spawn(async (cx) => {
      try {
        await ownerCli(["tell", tg.spec, body]);   // from you: a click token (Desk §10.1)
        notify({ title: `Sent ${this.comments.length} note${this.comments.length === 1 ? "" : "s"} to #${channelName(tg.tab)}`, level: "success", timeout: 3000 });
        this.comments = [];
      } catch (e) { notify({ title: "Couldn't send the notes", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      cx.notify();
    });
  }

  land(cx) {
    const tg = this.target();
    if (!tg) return;
    cx.spawn(async (cx) => {
      try {
        const out = await crewCli(["land", tg.spec]);
        notify({ title: `Landed ${this.data.branch}`, body: out.trim().slice(0, 160), level: "success", timeout: 4000 });
        closeOverlay(props().overlay);
      } catch (e) { notify({ title: "Not landed", body: String(e.message ?? e).slice(0, 300), level: "warning", timeout: 8000 }); }
    });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  row(r, i, t) {
    if (r.kind === "file") {
      return h_flex().id(`r-${i}`).h(ROW).px(14).items_center().bg(a(t.foreground, "0c"))
        .child(div().text_size(12).font_medium().font_family("JetBrains Mono").text_color(t.foreground).child(r.text));
    }
    if (r.kind === "hunk") {
      return h_flex().id(`r-${i}`).h(ROW).px(14).items_center()
        .child(div().truncate().text_size(11.5).font_family("JetBrains Mono").text_color(t.dim).child(r.text));
    }
    const on = this.picked === r;
    const bg = r.kind === "add" ? a(t.done, "1c") : r.kind === "del" ? a(t.blocked, "1a") : null;
    const commented = this.comments.some((c) => c.where.startsWith(`${r.file}:${r.line}`));
    return h_flex().id(`r-${i}`).h(ROW).items_center().cursor_pointer()
      .when(Boolean(bg), (el) => el.bg(bg))
      .when(on, (el) => el.bg(a(t.accent, "33")))
      .hover((s) => s.bg(a(t.accent, "18")))
      .on_click((_e, cx) => { this.picked = on ? null : r; if (!on) this.comment.focus(); cx.notify(); })
      .child(div().w(46).flex_none().pr(8).text_right().text_size(11).font_family("JetBrains Mono").text_color(t.dim).child(r.kind === "del" ? "" : String(r.line)))
      .child(div().w(14).flex_none().text_size(12).font_family("JetBrains Mono").text_color(r.kind === "add" ? t.done : r.kind === "del" ? t.blocked : t.dim)
        .child(r.kind === "add" ? "+" : r.kind === "del" ? "−" : commented ? "●" : " "))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family("JetBrains Mono").text_color(t.foreground).child(r.text.replace(/\t/g, "  ") || " "));
  }

  render() {
    const t = tone(theme());
    const tg = this.target();
    const root = v_flex().id("crew-review").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().bg(t.popover).text_color(t.foreground);
    if (this.error || !tg) {
      return root.p(28).gap(8).child(div().text_size(22).font_weight(200).child("Review"))
        .child(div().text_size(13).text_color(t.dim).child(this.error ?? "That topic is gone."));
    }
    const d = this.data;
    const bot = botOf(tg.space);
    const added = d ? d.files.reduce((n, f) => n + f.added, 0) : 0, removed = d ? d.files.reduce((n, f) => n + f.removed, 0) : 0;

    const header = h_flex().items_center().gap(14).px(26).pt(22).pb(16).border_b_1().border_color(a(t.foreground, "0f"))
      .child(mascotEl(bot, "calm", 34, t))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(22).font_weight(200).child(`Review #${channelName(tg.tab)}`))
        .child(div().truncate().text_size(12.5).text_color(t.dim).child(d
          ? `${tg.space.name} · ${d.branch} into ${d.base} · ${d.commits.length} commit${d.commits.length === 1 ? "" : "s"} · +${added} −${removed}${d.dirty ? " · has uncommitted changes" : ""}`
          : "Loading…")))
      .child(div().id("rv-close").size(30).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg(`${ICON}/x.svg`).size(14).text_color(t.muted)));

    // Files on the left; click one to show only it.
    const files = v_flex().id("rv-files").w(250).flex_none().overflow_y_scrollbar().py(10).px(8).gap(1).border_r_1().border_color(a(t.foreground, "0f"))
      .child(h_flex().id("rv-all").px(10).py(6).rounded(8).cursor_pointer().when(!this.file, (el) => el.bg(a(t.foreground, "10")))
        .on_click((_e, cx) => { this.file = null; cx.notify(); })
        .child(div().text_size(12.5).text_color(t.foreground).child(`All files${d ? ` (${d.files.length})` : ""}`)))
      .children((d?.files ?? []).map((f, i) => h_flex().id(`rv-f-${i}`).px(10).py(6).gap(8).rounded(8).items_center().cursor_pointer()
        .when(this.file === f.path, (el) => el.bg(a(t.foreground, "10")))
        .hover((s) => s.bg(a(t.foreground, "08")))
        .on_click((_e, cx) => { this.file = f.path; cx.notify(); })
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family("JetBrains Mono").text_color(t.muted).child(f.path))
        .child(div().text_size(11).text_color(t.done).child(`+${f.added}`))
        .child(div().text_size(11).text_color(t.blocked).child(`−${f.removed}`))))
      .when(Boolean(d?.untracked?.length), (el) => el.child(div().px(10).pt(10).text_size(11.5).text_color(t.dim)
        .child(`${d.untracked.length} new file${d.untracked.length === 1 ? "" : "s"} not added yet: ${d.untracked.slice(0, 4).join(", ")}`)));

    const rows = this.file ? this.rows.filter((r) => r.file === this.file) : this.rows;
    const diff = rows.length
      ? div().relative().flex_1().min_w(0).min_h(0)
          .child(v_virtual_list("rv-diff", rows.length, ROW, (i) => `${rows[i].file}-${rows[i].kind}-${i}`,
            (range) => rows.slice(range.start, range.end).map((r, k) => this.row(r, range.start + k, t))).size_full())
          .child(Scrollbar.vertical("rv-diff").absolute().inset_0())
      : v_flex().flex_1().items_center().justify_center().child(div().text_size(13).text_color(t.dim).child(d ? "No changes on this branch yet." : ""));

    // Notes so far, and the box to add one.
    const picked = this.picked;
    const notes = v_flex().gap(8).px(26).pt(12).pb(18).border_t_1().border_color(a(t.foreground, "0f"))
      .children(this.comments.map((c, i) => h_flex().id(`rv-c-${i}`).gap(10).items_center()
        .child(div().text_size(11.5).font_family("JetBrains Mono").text_color(t.accent).child(c.where))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(c.text))
        .child(div().id(`rv-cx-${i}`).cursor_pointer().on_click((_e, cx) => { this.comments.splice(i, 1); cx.notify(); })
          .child(svg(`${ICON}/x.svg`).size(11).text_color(t.dim)))))
      .child(h_flex().gap(10).items_center()
        .child(h_flex().flex_1().min_w(0).h(40).px(12).gap(8).items_center().rounded(6).bg(a(t.canvas, "aa"))
          .border_1().border_color(picked ? a(t.accent, "88") : a(t.foreground, "14"))
          .when(Boolean(picked), (el) => el.child(div().flex_none().text_size(11.5).font_family("JetBrains Mono").text_color(t.accent).child(`${picked.file}:${picked.line}`)))
          .child(div().flex_1().min_w(0).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .child(Input.new(this.comment).w_full().text_size(13).text_color(t.foreground))))
        .child(div().id("rv-send").px(16).py(9).rounded(4).cursor_pointer()
          .bg(this.comments.length ? a(t.foreground, "14") : a(t.foreground, "08")).hover((s) => s.bg(a(t.foreground, "1c")))
          .on_click((_e, cx) => this.send(cx))
          .child(div().text_size(13).text_color(this.comments.length ? t.foreground : t.dim)
            .child(`Send ${this.comments.length || ""} to #${channelName(tg.tab)}`.replace("  ", " "))))
        .child(div().id("rv-land").px(18).py(9).rounded(4).cursor_pointer().bg(t.solid).hover((s) => s.opacity(0.88))
          .on_click((_e, cx) => this.land(cx))
          .child(div().text_size(13).font_medium().text_color(t.solid_foreground).child(`Land on ${d?.base ?? "base"}`))));

    return root.child(header)
      .child(h_flex().flex_1().min_h(0).child(files).child(diff))
      .child(notes);
  }
}
