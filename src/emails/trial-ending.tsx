import { Heading, Text } from "@react-email/components";
import { EmailLayout, heading, text } from "./layout";

// Sent to the owner 3 days before a workspace's free trial ends.

export type TrialEndingEmailProps = {
  workspaceName: string;
  endsOn: string;
  link: string;
};

export default function TrialEndingEmail({ workspaceName, endsOn, link }: TrialEndingEmailProps) {
  return (
    <EmailLayout
      preview={`Your Forgeboard trial for ${workspaceName} ends ${endsOn}`}
      button={{ href: link, label: "Choose a plan" }}
      footer="You're getting this because you own this workspace on Forgeboard."
    >
      <Heading as="h1" style={heading}>
        Your trial ends {endsOn}
      </Heading>
      <Text style={text}>
        The free trial for <strong>{workspaceName}</strong> ends on <strong>{endsOn}</strong>. Choose a plan to keep
        working. If you don&apos;t, the workspace becomes read-only: everyone can still see and export everything, and
        nothing is deleted.
      </Text>
    </EmailLayout>
  );
}
