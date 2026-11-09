// Project Pals attach: a popup of recent files (Snip captures, Pictures, Downloads, Desktop) to attach
// to a message. Picking one hands it to the composer through shared("crew.attach.add").

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, exec, home, setShared } from "herdr";
import { a, ago, tone, ds, scrollArea } from "./crew.js";

const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

export default class CrewAttach extends View {
  init(_props, cx) {
    this.files = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      const h = home();
      const dirs = [`${h}/.cache/snip/drag`, `${h}/Pictures`, `${h}/Downloads`, `${h}/Desktop`, `${h}/Documents`];
      try {
        const r = await exec("sh", ["-c",
          'find "$@" -maxdepth 3 -type f ! -name ".*" -printf "%T@\\t%s\\t%p\\n" 2>/dev/null | sort -rn | head -40', "sh", ...dirs]);
        this.files = r.stdout.split("\n").filter(Boolean).map((line) => {
          const [at, size, path] = line.split("\t");
          return { at: Number(at) * 1000, size: Number(size), path, name: path.split("/").pop() };
        });
      } catch { this.files = []; }
      cx.notify();
    });
  }

  pick(file) {
    // `for`: who asked (props.for: "tasks"; none: the room composer), so only that one takes it.
    setShared("crew.attach.add", { paths: [file.path], nonce: `${Date.now()}-${Math.random()}`, for: props()?.for ?? null });
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = tone(theme());
    const h = home();
    const where = (p) => p.replace(`${h}/.cache/snip/drag/`, "Snip · ").replace(/\/[^/]*$/, "").replace(/^Snip · [^/]+$/, "Snip").replace(h, "~");
    const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    const body = v_flex().gap(2).px(6).pb(8);
    if (this.files === null) body.child(div().p(12).text_size(13).text_color(t.dim).child("Finding recent files…"));
    else if (!this.files.length) body.child(div().p(12).text_size(13).text_color(t.dim).child("No recent files. Drag one onto the message box instead."));
    else for (const [i, f] of this.files.entries()) {
      body.child(h_flex().id(`f-${i}`).items_center().gap(10).px(8).py(7).rounded(6).cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "0d")))
        .on_click(() => this.pick(f))
        .child(div().size(30).flex_none().rounded(7).flex().items_center().justify_center().bg(a(t.foreground, "0c"))
          .child(svg(IMAGE.test(f.name) ? "mods/crew-roster/icons/image.svg" : "mods/crew-roster/icons/file.svg").size(15).text_color(t.muted)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13).text_color(t.foreground).child(f.name))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child(`${where(f.path)} · ${size(f.size)}`)))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(ago(f.at))));
    }
    return v_flex().id("crew-attach").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_baseline().justify_between().px(14).pt(14).pb(10)
        .child(div().text_size(15).font_weight(300).child("Attach a recent file"))
        .child(div().text_size(11.5).text_color(t.dim).child("or drop / paste")))
      .child(scrollArea(ds(t), "attach-list", body).flex_1().min_h(0));
  }
}
