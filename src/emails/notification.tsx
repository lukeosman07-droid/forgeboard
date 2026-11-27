import { Heading, Text } from "@react-email/components";
import { EmailLayout, heading, muted, text } from "./layout";

// One email per notification: assigned, mentioned, commented, status change.

export type NotificationEmailProps = {
  headline: string;
  taskTitle: string;
  projectName: string;
  workspaceName: string;
  /** The comment, as plain text, for mentions and comments. */
  quote?: string;
  link: string;
  settingsLink: string;
};

export default function NotificationEmail({ headline, taskTitle, projectName, workspaceName, quote, link, settingsLink }: NotificationEmailProps) {
  return (
    <EmailLayout
      preview={headline}
      button={{ href: link, label: "Open the task" }}
      footer={
        <>
          You&apos;re getting this because of your notification settings in {workspaceName}.{" "}
          <a href={settingsLink} style={{ color: "#94a3b8" }}>
            Change what you get by email
          </a>
          .
        </>
      }
    >
      <Heading as="h1" style={heading}>
        {headline}
      </Heading>
      <Text style={text}>
        <strong>{taskTitle}</strong>
        <br />
        <span style={muted}>{projectName}</span>
      </Text>
      {quote && (
        <Text style={{ ...text, borderLeft: "3px solid #fdba74", margin: "16px 0", paddingLeft: 12, whiteSpace: "pre-wrap" }}>{quote}</Text>
      )}
    </EmailLayout>
  );
}
