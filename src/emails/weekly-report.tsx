import { Heading, Section, Text } from "@react-email/components";
import type { StatusReport } from "@/lib/ai/assist-schema";
import { EmailLayout, heading, muted, text } from "./layout";

// The weekly AI report for one project, sent on Mondays to the people the
// project's manager picked. The button opens the read-only share page.

export type WeeklyReportEmailProps = {
  projectName: string;
  workspaceName: string;
  weekOf: string;
  report: StatusReport;
  shareLink: string;
  expiresOn: string;
};

const HEALTH: Record<StatusReport["health"], string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };

const list = { ...text, margin: "0 0 4px" };
const label = { ...text, fontWeight: 600, margin: "16px 0 4px" };

export default function WeeklyReportEmail({ projectName, workspaceName, weekOf, report, shareLink, expiresOn }: WeeklyReportEmailProps) {
  const groups: [string, string[]][] = [
    ["Highlights", report.highlights],
    ["Concerns", report.concerns],
    ["Next steps", report.next_steps],
  ];
  return (
    <EmailLayout
      preview={`${projectName}: ${report.headline}`}
      button={{ href: shareLink, label: "Open the report" }}
      footer={`The link works until ${expiresOn}. You're getting this because a manager of ${projectName} in ${workspaceName} added you to its weekly report.`}
    >
      <Heading as="h1" style={heading}>
        {projectName} · week of {weekOf}
      </Heading>
      <Text style={muted}>{HEALTH[report.health]}</Text>
      <Text style={text}>{report.headline}</Text>
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <Section key={title}>
            <Text style={label}>{title}</Text>
            {items.map((item, i) => (
              <Text key={i} style={list}>
                • {item}
              </Text>
            ))}
          </Section>
        ))}
    </EmailLayout>
  );
}
