// Phone alerts are outbound pings only. Credentials are entered in the owner's external terminal.
import { View, div, svg } from "gpui-kit";
import { theme, props, closeOverlay, notify } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, pebble, crewCli, ownerCli } from "./crew.js";

export default class CrewNotify extends View {
  init(_props, cx) {
    this.info = null;
    this.busy = false;
    this.confirm = null;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.load(cx);
    cx.timer.every(4000, (cx) => this.load(cx));
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try { this.info = JSON.parse(await crewCli(["notify", "status", "--json"])); this.error = null; }
      catch { this.error = "Couldn't read phone-alert status. Try reopening this dialog."; }
      cx.notify();
    });
  }

  change(args, cx) {
    if (this.busy) return;
    this.busy = true;
    this.confirm = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = JSON.parse(await ownerCli(["notify", ...args, "--json"]));
        this.info = result;
        notify({ title: args[0] === "test" ? "Test alert queued" : "Phone alerts updated", level: "success", timeout: 3000 });
      } catch {
        // Never forward CLI exception text: a credential/transport bug must not become a toast.
        notify({ title: "Couldn't update phone alerts", body: "Check the receiver setup and try again. No credential details are displayed.", level: "warning", timeout: 5000 });
      }
      this.busy = false;
      this.load(cx);
    });
  }

  close() { closeOverlay(props()?.overlay); }

  render() {
    const d = ds(tone(theme()));
    const info = this.info;
    const body = sheetBody();
    const text = (value, quiet = false) => div().text_size(12).line_height("17px").text_color(quiet ? d.fg3 : d.body).child(value);
    const row = (title, value) => div().flex().items_center().justify_between().gap(12).py(6)
      .child(text(title)).child(text(value, true));
    body.child(text("Get a ping when Home needs you. Alerts cannot approve, answer or run anything."));
    if (this.error) body.child(text(this.error));
    if (!info) body.child(text("Reading…", true));
    if (info) {
      const detail = info.privacy === "detail";
      const ready = Boolean(info.configured && info.protocol_ready);
      body.child(div().px(10).py(6).rounded(6).bg(d.bg0).border_1().border_color(d.line).flex().flex_col()
        .child(row("Sending", info.enabled ? "On" : "Off"))
        .child(row("Receiver", info.configured ? "Configured" : "Not configured"))
        .child(row("Credential storage", !info.configured ? "Not set" : info.sealed ? "Sealed for this user" : "0600 file (unsealed)"))
        .child(row("Pending", String(info.pending ?? 0)))
        .child(row("Last outcome", String(info.last_outcome || "No delivery yet")))
        .child(row("Expired / dropped", `${info.expired ?? 0} / ${info.dropped ?? 0}`)));
      body.child(text("Set up or replace the receiver yourself in a terminal outside Herdr:", true));
      body.child(div().px(10).py(8).rounded(4).bg(d.inset).text_size(12).font_family(d.mono).text_color(d.fg1).child("pal notify setup"));
      body.child(text("For OpenBot, use: pal notify setup --mode openbot", true));
      body.child(text("Both URL and key use hidden prompts. Setup turns sending off. Never paste them into a pal or a chat.", true));
      body.child(text("Same-user programs can still reach user credentials. These controls prevent ordinary agent access; they do not provide OS isolation.", true));
      body.child(div().flex().items_center().gap(6)
        .child(pebble(d, { id: "notify-toggle", label: info.enabled ? "Disable alerts" : "Enable alerts", disabled: this.busy || (!info.enabled && !ready),
          primary: !info.enabled && ready, onClick: (cx) => this.change([info.enabled ? "disable" : "enable"], cx) }))
        .child(pebble(d, { id: "notify-test", label: "Send test alert", disabled: this.busy || !ready,
          onClick: (cx) => { this.confirm = "test"; cx.notify(); } })));
      if (this.confirm === "test") {
        body.child(text("Send one synthetic kind/id ping to your configured receiver now, even while ordinary alerts are off?"));
        body.child(pebble(d, { id: "notify-test-confirm", label: "Send test now", primary: true, disabled: this.busy,
          onClick: (cx) => this.change(["test"], cx) }));
      }
      body.child(text(detail ? "Payload: kind, id, title and topic." : "Payload: kind and id only."));
      body.child(text("Including titles and topic names sends those names off this machine to your bot. They may identify private projects.", true));
      body.child(pebble(d, { id: "notify-privacy", label: detail ? "Use kind and id only" : "Include titles and topics…", disabled: this.busy,
        onClick: (cx) => { if (detail) this.change(["privacy", "minimal"], cx); else { this.confirm = "detail"; cx.notify(); } } }));
      if (this.confirm === "detail") body.child(pebble(d, { id: "notify-detail-confirm", label: "Allow titles and topics off this machine", disabled: this.busy,
        onClick: (cx) => this.change(["privacy", "detail"], cx) }));
      if (this.confirm) body.child(pebble(d, { id: "notify-cancel", label: "Cancel", onClick: (cx) => { this.confirm = null; cx.notify(); } }));
      body.child(text("Disabling cancels queued alerts; a request already in flight may still arrive. Retries can occasionally duplicate a ping.", true));
    }
    return sheet(d, "crew-notify", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "notify", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
        .child(svg("mods/crew-roster/icons/ds-tell.svg").size(16).text_color(d.fg2)),
        title: "Phone alerts", sub: "An outbound ping when Home needs you", onClose: () => this.close() }))
      .child(body)
      .child(sheetFooter(d, { id: "notify", hint: "Off by default · approvals stay in Project Pals", onCancel: () => this.close(), cancelLabel: "Close" }));
  }
}
