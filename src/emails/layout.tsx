import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

// Shared frame for Forgeboard emails: logo line, content, one button, footer.

export const text = { color: "#334155", fontSize: 16, lineHeight: "24px" } as const;
export const muted = { color: "#64748b", fontSize: 14, lineHeight: "20px" } as const;
export const heading = { color: "#0f172a", fontSize: 22, margin: "16px 0 8px" } as const;

export function EmailLayout({
  preview,
  children,
  button,
  footer,
}: {
  preview: string;
  children: React.ReactNode;
  button?: { href: string; label: string };
  footer: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f1f5f9", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 560, padding: "32px" }}>
          <Text style={{ color: "#f97316", fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: 0 }}>FORGEBOARD</Text>
          {children}
          {button && (
            <Section style={{ margin: "24px 0" }}>
              <Button
                href={button.href}
                style={{ backgroundColor: "#f97316", borderRadius: 8, color: "#0f172a", fontSize: 16, fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}
              >
                {button.label}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: "18px", margin: 0 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
