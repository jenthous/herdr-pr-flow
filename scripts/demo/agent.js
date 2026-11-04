// A still picture of an agent's terminal, so the demo needs no real session.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme, settings } from "herdr";

const LINES = [["dim", "Claude Code"], ["", ""], ["fg", "› Retry failed payments, then open a PR."], ["", ""], ["dim", "● Read src/payment/queue.go"], ["dim", "● Edit src/payment/retry.go"], ["dim", "● Bash go test ./src/payment/"], ["dim", "  ok  acme/shop-api/src/payment  0.214s"], ["dim", "● Bash gh pr create"], ["", ""], ["fg", "● Opened PR #482. It closes #470."], ["", ""], ["fg", "›"]];

export default class Agent extends View {
  render() {
    const t = theme();
    return v_flex().size_full().p(16).gap(3).rounded(10).bg(t.background).border_1().border_color(t.border).font_family(settings().font_family ?? "JetBrains Mono").text_size(12.5)
      .children(LINES.map(([kind, text]) => div().h(19).flex_none().truncate().text_color(kind === "fg" ? t.foreground : t.muted).child(text || " ")));
  }
}
