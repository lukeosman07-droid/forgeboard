// Creates (or resets) the demo account and its sample project.
// Run with: npm run seed:demo
// Safe to run any number of times: it updates the demo user instead of duplicating it,
// and replaces the sample project with a fresh copy.

import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@demo.com";
const DEMO_PASSWORD = "password123!";
const PROJECT_NAME = "Pump Station Retrofit";

// Load .env.local (Node 20.12+). Values already set in the shell win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; fall back to variables already in the environment.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Create .env.local in the project folder (copy .env.example) and fill in both values.\n",
  );
  process.exit(1);
}

// The service role key bypasses Row Level Security. Server-side scripts only; never ship it to a browser.
const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(step, error) {
  console.error(`\nFailed to ${step}: ${error.message ?? error}`);
  if (error.code === "PGRST205" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "")) {
    console.error("It looks like the database tables don't exist yet. Run the SQL migration in supabase/migrations/ first.");
  }
  process.exit(1);
}

// YYYY-MM-DD for a date `days` from today.
function inDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail("look up existing users", error);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  console.log(`Seeding demo account ${DEMO_EMAIL}...`);

  const userMetadata = { full_name: "Demo User", company_name: "Demo Engineering Co." };

  // 1. Create or update the auth user (email already confirmed).
  let user = await findUserByEmail(DEMO_EMAIL);
  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) fail("update the demo user", error);
    user = data.user;
    console.log("  ✓ Demo user already existed: password reset and email confirmed");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) fail("create the demo user", error);
    user = data.user;
    console.log("  ✓ Demo user created");
  }

  // 2. Upsert the profile (also covers users created before the migration ran).
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: DEMO_EMAIL,
      full_name: userMetadata.full_name,
      company_name: userMetadata.company_name,
      plan: "business",
      subscription_status: "active",
    },
    { onConflict: "id" },
  );
  if (profileError) fail("set up the demo profile", profileError);
  console.log("  ✓ Profile set to Business plan (active)");

  // 3. Replace the sample project so re-runs don't create duplicates.
  //    Deleting the project also deletes its notes and items (on delete cascade).
  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("owner_id", user.id)
    .eq("name", PROJECT_NAME);
  if (deleteError) fail("clear the old sample project", deleteError);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: PROJECT_NAME,
      description: "Upgrading the Elm Street pump station: new VFD pumps, controls, and a SCADA tie-in.",
    })
    .select()
    .single();
  if (projectError) fail("create the sample project", projectError);

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .insert({
      project_id: project.id,
      owner_id: user.id,
      raw_text: [
        "Design review, Pump Station Retrofit",
        "Attendees: Maria (PM), Dev (electrical), Sam (mechanical), Priya (controls)",
        "",
        "- Agreed to go with VFD-driven pumps instead of soft starters (energy savings justify cost).",
        "- Keep the existing wet well; structural report says it's sound.",
        "- Dev to finalize the electrical one-line by next Friday.",
        "- Sam needs updated pump curves from the vendor before sizing the discharge header.",
        "- Priya will draft the SCADA tag list; need to confirm the city's PLC standard.",
        "- Concern: pump lead time could be 16+ weeks. Bypass pumping during cutover not budgeted yet.",
        "- Open question: does the city require a backup generator for this station class?",
      ].join("\n"),
    })
    .select()
    .single();
  if (noteError) fail("create the sample meeting note", noteError);

  const base = { project_id: project.id, owner_id: user.id, note_id: note.id };
  const items = [
    {
      type: "action_item",
      title: "Finalize electrical one-line diagram",
      details: "Include VFD sizing and the new MCC layout.",
      assignee: "Dev",
      due_date: inDays(7),
      priority: "high",
    },
    {
      type: "action_item",
      title: "Request updated pump curves from vendor",
      details: "Needed before sizing the discharge header.",
      assignee: "Sam",
      due_date: inDays(3),
      priority: "high",
    },
    {
      type: "action_item",
      title: "Draft SCADA tag list",
      details: "Follow the city's PLC naming standard once confirmed.",
      assignee: "Priya",
      due_date: inDays(14),
      priority: "medium",
    },
    {
      type: "action_item",
      title: "Collect existing station as-built drawings",
      assignee: "Maria",
      due_date: inDays(-2),
      priority: "low",
      status: "done",
    },
    {
      type: "decision",
      title: "Use VFD-driven pumps instead of soft starters",
      details: "Energy savings over the station's life justify the higher up-front cost.",
    },
    {
      type: "decision",
      title: "Keep and reuse the existing wet well",
      details: "Structural assessment found the concrete in good condition.",
    },
    {
      type: "risk",
      title: "Pump lead time may exceed 16 weeks",
      details: "Could push the cutover past the low-flow season. Consider ordering early.",
      priority: "high",
    },
    {
      type: "risk",
      title: "Bypass pumping during cutover isn't budgeted",
      details: "Need a cost estimate and a temporary pumping plan.",
      priority: "medium",
    },
    {
      type: "question",
      title: "Does the city require a backup generator for this station class?",
      assignee: "Maria",
    },
  ].map((item) => ({ ...base, ...item }));

  const { error: itemsError } = await supabase.from("items").insert(items);
  if (itemsError) fail("create the sample items", itemsError);
  console.log(`  ✓ Sample project "${PROJECT_NAME}" created with ${items.length} items`);

  console.log(`\nDone! Log in at /login with ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

main().catch((error) => fail("seed the demo account", error));
