import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

// Sent to a workspace's owner when a payment fails. The workspace keeps working
// for the grace period; after that it becomes read-only until the card is fixed.

export type PaymentFailedEmailProps = {
  workspaceName: string;
  graceEndsOn: string;
  link: string;
};

export default function PaymentFailedEmail({ workspaceName, graceEndsOn, link }: PaymentFailedEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your payment for ${workspaceName} didn't go through`}</Preview>
      <Body style={{ backgroundColor: "#f1f5f9", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 520, padding: "32px" }}>
          <Text style={{ color: "#f97316", fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: 0 }}>FORGEBOARD</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "16px 0 8px" }}>
            Your payment didn&apos;t go through
          </Heading>
          <Text style={{ color: "#334155", fontSize: 16, lineHeight: "24px" }}>
            We couldn&apos;t charge the card on file for <strong>{workspaceName}</strong>. Everything keeps working until{" "}
            <strong>{graceEndsOn}</strong>. After that the workspace becomes read-only (nothing is deleted) until the
            payment goes through.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={link}
              style={{ backgroundColor: "#f97316", borderRadius: 8, color: "#0f172a", fontSize: 16, fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}
            >
              Update payment method
            </Button>
          </Section>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: "18px", margin: 0 }}>
            You&apos;re getting this because you own this workspace on Forgeboard.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
