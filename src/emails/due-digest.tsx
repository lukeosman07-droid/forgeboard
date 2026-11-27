import { Heading, Link, Text } from "@react-email/components";
import { EmailLayout, heading, muted, text } from "./layout";

// Daily list of someone's open tasks that are overdue or due today or tomorrow.

export type DigestTask = { title: string; projectName: string; due: string; overdue: boolean; link: string };

export type DueDigestEmailProps = {
  name: string;
  workspaceName: string;
  tasks: DigestTask[];
  link: string;
  settingsLink: string;
};

export default function DueDigestEmail({ name, workspaceName, tasks, link, settingsLink }: DueDigestEmailProps) {
  const overdue = tasks.filter((t) => t.overdue).length;
  const summary = overdue
    ? `${overdue} overdue and ${tasks.length - overdue} due soon in ${workspaceName}`
    : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} due soon in ${workspaceName}`;
  return (
    <EmailLayout
      preview={summary}
      button={{ href: link, label: "Open My Work" }}
      footer={
        <>
          You get this each morning there&apos;s something due.{" "}
          <a href={settingsLink} style={{ color: "#94a3b8" }}>
            Turn off the daily digest
          </a>
          .
        </>
      }
    >
      <Heading as="h1" style={heading}>
        Good morning{name ? `, ${name.split(" ")[0]}` : ""}
      </Heading>
      <Text style={text}>{summary}:</Text>
      {tasks.map((t) => (
        <Text key={t.link} style={{ ...text, margin: "0 0 12px" }}>
          <Link href={t.link} style={{ color: "#0f172a", fontWeight: 700 }}>
            {t.title}
          </Link>
          <br />
          <span style={{ ...muted, color: t.overdue ? "#dc2626" : muted.color }}>
            {t.overdue ? `Overdue since ${t.due}` : `Due ${t.due}`} · {t.projectName}
          </span>
        </Text>
      ))}
    </EmailLayout>
  );
}
