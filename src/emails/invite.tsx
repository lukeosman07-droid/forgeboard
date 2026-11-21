import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

// The email someone gets when they're invited to a workspace (or, as a guest, to
// one project). Plain inline styles: email clients ignore stylesheets.

export type InviteEmailProps = {
  workspaceName: string;
  inviterName: string;
  roleLabel: string;
  projectName?: string | null;
  link: string;
};

export default function InviteEmail({ workspaceName, inviterName, roleLabel, projectName, link }: InviteEmailProps) {
  const where = projectName ? `the "${projectName}" project in ${workspaceName}` : workspaceName;
  return (
    <Html lang="en">
      <Head />
      <Preview>{`${inviterName} invited you to ${where} on Forgeboard`}</Preview>
      <Body style={{ backgroundColor: "#f1f5f9", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 520, padding: "32px" }}>
          <Text style={{ color: "#f97316", fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: 0 }}>FORGEBOARD</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "16px 0 8px" }}>
            You&apos;re invited to {where}
          </Heading>
          <Text style={{ color: "#334155", fontSize: 16, lineHeight: "24px" }}>
            {inviterName} added you as a <strong>{roleLabel.toLowerCase()}</strong>. Forgeboard is where the team keeps its
            projects, tasks, decisions and risks.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={link}
              style={{ backgroundColor: "#f97316", borderRadius: 8, color: "#0f172a", fontSize: 16, fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}
            >
              Accept the invite
            </Button>
          </Section>
          <Text style={{ color: "#64748b", fontSize: 14, lineHeight: "20px" }}>
            The link works once, for 7 days, and only for this email address. If the button doesn&apos;t work, paste this
            into your browser:
          </Text>
          <Text style={{ color: "#64748b", fontSize: 13, lineHeight: "18px", wordBreak: "break-all" }}>{link}</Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: "18px", margin: 0 }}>
            Not expecting this? You can ignore this email; nothing happens unless you accept.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
