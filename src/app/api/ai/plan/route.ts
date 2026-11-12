import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { generatePlan } from "@/lib/ai/assist";
import { aiError as fail, claimAiUse, safeToday } from "@/lib/ai/usage";

export const maxDuration = 120;

const BodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/ai/plan  { name, description, today? } -> { plan }
// Returns a suggested plan only; nothing is saved until the user creates the project.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Give the project a name first.");
  const { name, description } = parsed.data;
  if (description.length < 15) return fail(400, "Describe the project in a sentence or two so the AI has something to plan from.");

  const claim = await claimAiUse(user.id);
  if (!claim.ok) return claim.response;

  const result = await generatePlan(name, description, safeToday(parsed.data.today));
  if (!result.ok) {
    await claim.finish("failed");
    return fail(result.status, result.error);
  }
  const taskCount = result.data.sections.reduce((n, s) => n + s.tasks.length, 0);
  if (taskCount === 0) {
    await claim.finish("empty");
    return fail(422, "The AI couldn't build a plan from that. Add more detail and try again.");
  }

  await claim.finish("succeeded");
  return NextResponse.json({ plan: result.data, freeRemaining: claim.freeRemaining });
}
