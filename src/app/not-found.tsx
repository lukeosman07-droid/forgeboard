import type { Metadata } from "next";
import NotFoundScreen from "@/components/NotFoundScreen";

export const metadata: Metadata = { title: "Page not found – Forgeboard" };

export default function NotFound() {
  return <NotFoundScreen text="That link doesn't lead anywhere. It may have been moved or mistyped." href="/" label="Back to home" />;
}
