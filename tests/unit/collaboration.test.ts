import { describe, expect, it } from "vitest";
import { describeActivity, describeChanges, timeAgo } from "@/lib/activity";
import { parseInline, parseMarkdown, safeHref, toPlainText } from "@/lib/markdown";
import { mentionQuery, mentionedIds, toEditable, toStored } from "@/lib/mentions";
import { notificationHeadline, taskPath } from "@/lib/notifications";

const ANN = "11111111-1111-4111-8111-111111111111";
const ANN_LEE = "22222222-2222-4222-8222-222222222222";

describe("mentions", () => {
  it("stores picked names as tokens, longest name first", () => {
    const stored = toStored("hi @Ann Lee and @Ann!", [
      { id: ANN, name: "Ann" },
      { id: ANN_LEE, name: "Ann Lee" },
    ]);
    expect(stored).toBe(`hi @[Ann Lee](${ANN_LEE}) and @[Ann](${ANN})!`);
    expect(mentionedIds(stored)).toEqual([ANN_LEE, ANN]);
  });

  it("leaves typed names that weren't picked, and emails, alone", () => {
    expect(toStored("mail ann@Ann.com or @Bob", [{ id: ANN, name: "Ann" }])).toBe("mail ann@Ann.com or @Bob");
  });

  it("strips characters that would break the stored form", () => {
    expect(toStored("@Ann (PM)", [{ id: ANN, name: "Ann (PM)" }])).toBe("@Ann (PM)");
    expect(toStored("@Ann PM", [{ id: ANN, name: "Ann (PM)" }])).toBe(`@[Ann PM](${ANN})`);
  });

  it("round-trips through the editable form", () => {
    const stored = `ping @[Ann](${ANN}) twice @[Ann](${ANN})`;
    const editable = toEditable(stored);
    expect(editable.text).toBe("ping @Ann twice @Ann");
    expect(editable.mentions).toEqual([{ id: ANN, name: "Ann" }]);
    expect(toStored(editable.text, editable.mentions)).toBe(stored);
  });

  it("finds the partial mention before the cursor", () => {
    expect(mentionQuery("hey @an", 7)).toEqual({ start: 4, query: "an" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("email a@b", 9)).toBeNull();
    expect(mentionQuery("hey @ann ", 9)).toBeNull();
  });
});

describe("markdown", () => {
  it("parses bold, italic, code, links and mentions", () => {
    expect(parseInline(`**big** *it* _also_ \`x\` [site](https://a.com) @[Ann](${ANN})`)).toEqual([
      { kind: "bold", children: [{ kind: "text", text: "big" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "it" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "also" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "x" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://a.com/", children: [{ kind: "text", text: "site" }] },
      { kind: "text", text: " " },
      { kind: "mention", id: ANN, name: "Ann" },
    ]);
  });

  it("never makes unsafe links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(parseInline("[x](javascript:alert(1))").some((n) => n.kind === "link")).toBe(false);
  });

  it("links bare URLs without trailing punctuation", () => {
    const nodes = parseInline("see https://example.com/a.");
    expect(nodes[1]).toEqual({ kind: "link", href: "https://example.com/a", children: [{ kind: "text", text: "https://example.com/a" }] });
    expect(nodes[2]).toEqual({ kind: "text", text: "." });
  });

  it("leaves snake_case and multiplication alone", () => {
    expect(parseInline("my_var_name and 2*3*4")).toEqual([{ kind: "text", text: "my_var_name and 2*3*4" }]);
  });

  it("splits paragraphs and lists", () => {
    const blocks = parseMarkdown("Intro line\nsecond line\n\n- one\n- two\n1. first");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list", "list"]);
    expect(blocks[0]).toMatchObject({ kind: "paragraph", lines: [[{ text: "Intro line" }], [{ text: "second line" }]] });
    expect(blocks[1]).toMatchObject({ ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] });
    expect(blocks[2]).toMatchObject({ ordered: true });
  });

  it("keeps HTML as plain text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)>" }]);
  });

  it("turns a comment into plain text for emails", () => {
    expect(toPlainText(`**Hi** @[Ann](${ANN}), see [docs](https://d.com) \`now\``)).toBe("Hi @Ann, see docs (https://d.com) now");
  });
});

describe("activity", () => {
  const lookups = {
    personName: (id: string) => (id === ANN ? "Ann" : null),
    sectionName: (id: string) => (id === "s1" ? "Design" : null),
  };

  it("says who changed the due date, from what to what", () => {
    expect(describeChanges({ due_date: { old: "2026-11-03", new: "2026-11-05" } }, lookups)).toEqual(["changed the due date from Nov 3 to Nov 5"]);
    expect(describeChanges({ due_date: { old: null, new: "2026-11-05" } }, lookups)).toEqual(["set the due date to Nov 5"]);
    expect(describeChanges({ due_date: { old: "2026-11-05", new: null } }, lookups)).toEqual(["cleared the due date"]);
  });

  it("describes owners, statuses, sections and descriptions in words", () => {
    expect(
      describeChanges(
        {
          assignee: { old: null, new: "Ann" },
          assignee_id: { old: null, new: ANN },
          status: { old: "open", new: "in_progress" },
          section_id: { old: null, new: "s1" },
          details: { old: null, new: "more" },
        },
        lookups,
      ),
    ).toEqual(["assigned it to Ann", "changed the status from To do to Working on it", "set the section to Design", "added a description"]);
  });

  it("writes whole lines for the feed", () => {
    expect(describeActivity({ verb: "created", changes: null, item_title: "Ship it" }, lookups, true)).toBe("created “Ship it”");
    expect(describeActivity({ verb: "commented", changes: null, item_title: "Ship it" }, lookups)).toBe("commented");
    expect(describeActivity({ verb: "updated", changes: { priority: { old: "low", new: "urgent" } }, item_title: "X" }, lookups)).toBe(
      "changed the priority from Low to Urgent",
    );
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-11-27T12:00:00Z");
    expect(timeAgo("2026-11-27T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-11-27T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-11-27T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-11-25T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("notification wording", () => {
  it("names the actor and the new status", () => {
    expect(notificationHeadline("assigned", "Ann")).toBe("Ann assigned you a task");
    expect(notificationHeadline("mentioned", null)).toBe("Someone mentioned you");
    expect(notificationHeadline("status", "Ann", { status: "done" })).toBe("Ann moved your task to Done");
    expect(taskPath("acme", "p1", "t1")).toBe("/w/acme/projects/p1?task=t1");
  });
});
