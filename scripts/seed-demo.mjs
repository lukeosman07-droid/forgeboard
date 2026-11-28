// Creates (or resets) the demo account and its sample projects.
// Run with: npm run seed:demo
// Safe to run any number of times: it updates the demo user instead of duplicating it,
// and replaces the sample projects with fresh copies.

import { createClient } from "@supabase/supabase-js";

const PROJECT_NAME = "Pump Station Retrofit";

// Load .env.local (Node 20.12+). Values already set in the shell win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; fall back to variables already in the environment.
}

// The demo login comes from the environment, so its password is never in the repo.
const DEMO_EMAIL = (process.env.DEMO_EMAIL ?? "demo@demo.com").toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 10) {
  console.error(
    "\nMissing DEMO_PASSWORD (at least 10 characters).\n" +
      "Add DEMO_PASSWORD=... to .env.local. It becomes the demo account's password.\n",
  );
  process.exit(1);
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
    },
    { onConflict: "id" },
  );
  if (profileError) fail("set up the demo profile", profileError);
  console.log("  ✓ Profile ready");

  // 3. The demo's workspace. Sign-up creates one for every account; this finds
  //    the oldest workspace the demo user owns, and renames it to match.
  const { data: owned, error: wsError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(created_at)")
    .eq("user_id", user.id)
    .eq("role", "owner");
  if (wsError) fail("find the demo workspace (has the workspaces migration been run?)", wsError);
  const workspaceId = owned.sort((a, b) => a.workspaces.created_at.localeCompare(b.workspaces.created_at))[0]?.workspace_id;
  if (!workspaceId) fail("find the demo workspace", new Error("the demo user owns no workspace"));
  // Plans live on the workspace (Phase 2). The demo is on Business with no
  // Stripe subscription, already past onboarding, with the checklist hidden.
  const { error: renameError } = await supabase
    .from("workspaces")
    .update({
      name: userMetadata.company_name,
      plan: "business",
      subscription_status: "active",
      trial_ends_at: new Date().toISOString(),
      grace_ends_at: null,
      onboarded_at: new Date().toISOString(),
      checklist_dismissed_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);
  if (renameError) fail("set up the demo workspace", renameError);
  console.log(`  ✓ Workspace "${userMetadata.company_name}" ready (Business plan)`);

  // 4. Replace the sample projects so re-runs don't create duplicates.
  //    Deleting a project also deletes its sections, notes, items, subtasks and comments.
  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("name", PROJECTS.map((p) => p.name));
  if (deleteError) fail("clear the old sample projects", deleteError);

  // Oldest first, so the main project shows at the top of the sidebar.
  // Owners stay plain names (the people in the notes aren't members), which
  // shows the "map a name to a member" step in the owner picker.
  for (const def of [...PROJECTS].reverse()) {
    const count = await createSampleProject(user.id, workspaceId, def);
    console.log(`  ✓ "${def.name}" created with ${count} items`);
  }

  console.log(`\nDone! Log in at /login as ${DEMO_EMAIL} with the password in DEMO_PASSWORD.\n`);
}

// ---------------------------------------------------------------------------
// Sample data. Dates are offsets in days from today.
// task(title, owner, status, priority, start, due, extras)
// ---------------------------------------------------------------------------

function task(title, assignee, status, priority, start, due, extra = {}) {
  return { title, assignee, status, priority, start, due, ...extra };
}

const PROJECTS = [
  {
    name: PROJECT_NAME,
    color: "orange",
    description: "Upgrading the Elm Street pump station: new VFD pumps, controls, and a SCADA tie-in.",
    note: [
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
    noteSummary:
      "60% design review: VFD pumps approved and the wet well will be reused. The electrical one-line and pump curves are the next blockers; pump lead time is the biggest schedule risk.",
    sections: [
      {
        name: "Design",
        tasks: [
          task("Collect existing station as-built drawings", "Maria", "done", "low", -14, -9),
          task("Finalize electrical one-line diagram", "Dev", "in_progress", "high", -4, 5, {
            details: "Include VFD sizing and the new MCC layout.",
            subtasks: [
              ["VFD sizing calcs", true],
              ["MCC layout", true],
              ["Short-circuit study", false],
              ["Internal QC review", false],
            ],
            comments: ["MCC layout is done. Waiting on the utility for available fault current before I can finish the short-circuit study."],
          }),
          task("Size the discharge header", "Sam", "stuck", "urgent", -6, -1, {
            details: "Needs updated pump curves from the vendor first.",
            comments: ["Blocked: the vendor still hasn't sent the revised curves. Escalated to their regional rep."],
          }),
          task("Draft SCADA tag list", "Priya", "in_progress", "medium", -2, 12, {
            subtasks: [
              ["Get the city's PLC naming standard", true],
              ["Pump station tags", false],
              ["Alarm list", false],
            ],
          }),
          task("Structural check of pump pad anchors", "Jen", "open", "medium", 6, 10),
        ],
      },
      {
        name: "Procurement",
        tasks: [
          task("Request updated pump curves from vendor", "Sam", "done", "high", -10, -3, {
            comments: ["Request sent. The vendor promised curves by end of week."],
          }),
          task("Issue purchase order for VFD pumps", "Maria", "open", "urgent", 2, 4, {
            details: "Lead time may be 16+ weeks, so this is on the critical path.",
            subtasks: [
              ["Get final quote", true],
              ["Finance approval", false],
              ["Send PO", false],
            ],
          }),
          task("Get bypass pumping quotes", "Maria", "open", "high", 3, 14),
          task("Order SCADA radio and PLC hardware", "Priya", "open", "medium", 15, 20),
        ],
      },
      {
        name: "Construction & cutover",
        tasks: [
          task("Contractor pre-construction meeting", "Maria", "open", "medium", 21, 21),
          task("Install new pumps and VFDs", null, "open", "high", 28, 49),
          task("SCADA integration and testing", "Priya", "open", "high", 45, 56),
          task("Station cutover with bypass pumping", "Sam", "open", "urgent", 57, 60),
          task("As-built drawings and O&M manuals", "Dev", "open", "low", 60, 70),
        ],
      },
    ],
    log: [
      { type: "decision", title: "Use VFD-driven pumps instead of soft starters", details: "Energy savings over the station's life justify the higher up-front cost." },
      { type: "decision", title: "Keep and reuse the existing wet well", details: "Structural assessment found the concrete in good condition." },
      { type: "risk", title: "Pump lead time may exceed 16 weeks", details: "Could push the cutover past the low-flow season. Consider ordering early.", priority: "high" },
      { type: "risk", title: "Bypass pumping during cutover isn't budgeted", details: "Need a cost estimate and a temporary pumping plan.", priority: "medium" },
      { type: "question", title: "Does the city require a backup generator for this station class?", assignee: "Maria" },
    ],
    // Phase 5: registers, milestones, a design review and task dependencies.
    // The generator question above is left without an RFI, so "Create RFI" shows.
    engineering: {
      rfis: [
        {
          subject: "Available fault current at the service entrance",
          question: "Please confirm the available fault current at the utility transformer serving the station. We need it to finish the short-circuit study.",
          status: "open",
          ball_in_court: "City Electric Utility",
          opened: -9,
          required: 3,
          task: "Finalize electrical one-line diagram",
        },
        {
          subject: "City PLC standard for SCADA",
          question: "Which PLC platform and firmware does the city require for new stations?",
          response: "Use the city's current standard PLC family with the latest approved firmware. Tag naming per the 2024 SCADA standard.",
          status: "answered",
          ball_in_court: "Priya",
          opened: -12,
          answered: -5,
          required: -6,
          task: "Draft SCADA tag list",
        },
      ],
      submittals: [
        {
          spec_section: "43 21 13",
          title: "VFD pump product data",
          submitted_by: "Atlas Pump Co.",
          reviewer: "Sam",
          first: { received: -14, due: -7, returned: -8, action: "revise_resubmit", notes: "Pump curve doesn't show the duty point at minimum speed. Resubmit with the full curve set." },
          received: -2,
          due: 5,
          task: "Issue purchase order for VFD pumps",
        },
        {
          spec_section: "26 24 19",
          title: "Motor control center shop drawings",
          submitted_by: "Brightline Electric",
          reviewer: "Dev",
          received: -10,
          due: -3,
          returned: -4,
          action: "approved_as_noted",
          notes: "Add a spare bucket in section 3.",
        },
        {
          spec_section: "03 15 19",
          title: "Pump pad anchor bolt cut sheets",
          submitted_by: "Atlas Pump Co.",
          reviewer: "Jen",
          received: -8,
          due: -2,
        },
      ],
      milestones: [
        { name: "60% design", due: -3, done: true },
        { name: "90% design", due: 18 },
        { name: "Construction start", due: 21 },
        { name: "Station cutover", due: 57 },
      ],
      reviews: [
        {
          name: "60% design review comments",
          milestone: "60% design",
          due: 7,
          comments: [
            { title: "Show the bypass pumping connection on the mechanical plan", assignee: "Sam", disposition: "incorporate", due: 6 },
            { title: "Label the VFD bypass contactors on the one-line", assignee: "Dev", disposition: "incorporate", due: 5, status: "done" },
            { title: "Consider a second wet well level transmitter", assignee: "Priya", disposition: "pending" },
            { title: "Move the MCC to the north wall", assignee: "Maria", disposition: "rejected", details: "No room for the required clearances." },
          ],
        },
      ],
      // [predecessor, successor]. The first pair clashes on purpose: the PO
      // starts before the one-line it depends on is due.
      dependencies: [
        ["Request updated pump curves from vendor", "Size the discharge header"],
        ["Finalize electrical one-line diagram", "Issue purchase order for VFD pumps"],
        ["Issue purchase order for VFD pumps", "Install new pumps and VFDs"],
        ["Install new pumps and VFDs", "Station cutover with bypass pumping"],
        ["SCADA integration and testing", "Station cutover with bypass pumping"],
      ],
      views: [
        { name: "Open high-priority work", view: "table", query: "priority=high,urgent&done=hide&sort=due" },
      ],
    },
  },
  {
    name: "Mobile App Launch",
    color: "purple",
    description: "Launch v2.0 of the field inspection app on iOS and Android.",
    sections: [
      {
        name: "Build",
        tasks: [
          task("Offline sync for inspection forms", "Alex Kim", "done", "high", -20, -6),
          task("Photo upload compression", "Alex Kim", "in_progress", "medium", -5, 3, {
            subtasks: [
              ["Resize on device", true],
              ["Retry on bad signal", false],
            ],
          }),
          task("Fix crash on Android 15 login", "Jordan Lee", "stuck", "urgent", -3, 0, {
            comments: ["Can't reproduce on emulators. Borrowing a Pixel from QA tomorrow."],
          }),
        ],
      },
      {
        name: "Launch prep",
        tasks: [
          task("App store screenshots and copy", "Sam Rivera", "in_progress", "medium", -2, 6),
          task("Beta feedback triage", "Jordan Lee", "open", "high", 1, 5),
          task("Release notes", "Sam Rivera", "open", "low", 7, 9),
          task("Submit to App Store and Play Store", "Alex Kim", "open", "urgent", 10, 11),
        ],
      },
    ],
    log: [
      { type: "decision", title: "Ship Android and iOS on the same day", details: "Field crews use both; a staggered launch would split support." },
      { type: "risk", title: "App review could take longer than 3 days", details: "Submit early with a manual release.", priority: "medium" },
    ],
  },
  {
    name: "Lab Building HVAC Upgrade",
    color: "teal",
    description: "Replace the rooftop units and add demand-controlled ventilation in the chemistry lab wing.",
    sections: [
      {
        name: "Assessment",
        tasks: [
          task("Measure existing airflow and fume hood demand", "Priya", "done", "high", -25, -18),
          task("Energy model of the new system", "Dev", "done", "medium", -17, -8),
        ],
      },
      {
        name: "Design",
        tasks: [
          task("Select rooftop units", "Dev", "in_progress", "high", -7, 7, {
            subtasks: [
              ["Compare 3 vendors", true],
              ["Check roof structural load", false],
            ],
          }),
          task("Controls sequence of operations", "Priya", "open", "medium", 4, 18),
          task("Owner design review", "Maria", "open", "high", 20, 20),
        ],
      },
    ],
    log: [{ type: "decision", title: "Keep the existing ductwork mains", details: "Duct survey shows adequate capacity for the new airflow." }],
  },
];

// The service role has no auth.uid(), so created_by is set by hand here. The
// workspace of sections, notes and items comes from their project (a trigger).
async function createSampleProject(ownerId, workspaceId, def) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ workspace_id: workspaceId, created_by: ownerId, manager_id: ownerId, name: def.name, description: def.description, color: def.color })
    .select()
    .single();
  if (projectError) fail(`create the "${def.name}" project`, projectError);

  const { data: sections, error: sectionError } = await supabase
    .from("sections")
    .insert(def.sections.map((s, i) => ({ project_id: project.id, created_by: ownerId, name: s.name, position: i + 1 })))
    .select();
  if (sectionError) fail("create sections (has the work management migration been run?)", sectionError);
  const sectionId = new Map(sections.map((s) => [s.name, s.id]));

  let noteId = null;
  if (def.note) {
    const { data: note, error } = await supabase
      .from("documents")
      .insert({ project_id: project.id, created_by: ownerId, raw_text: def.note, summary: def.noteSummary ?? null })
      .select()
      .single();
    if (error) fail("create the sample meeting note", error);
    noteId = note.id;
  }

  // Every column set on every row: in a multi-row insert, a missing column becomes null.
  let position = 0;
  const now = Date.now();
  const taskRows = def.sections.flatMap((s) =>
    s.tasks.map((t) => ({
      project_id: project.id,
      created_by: ownerId,
      section_id: sectionId.get(s.name),
      source_document_id: noteId,
      type: "action_item",
      title: t.title,
      details: t.details ?? null,
      assignee: t.assignee,
      status: t.status,
      priority: t.priority,
      start_date: inDays(t.start),
      due_date: inDays(t.due),
      position: ++position,
      // Spread completions over the past week so "done this week" has data.
      completed_at: t.status === "done" ? new Date(now - (position % 6) * 86_400_000).toISOString() : null,
    })),
  );
  const logRows = def.log.map((l) => ({
    project_id: project.id,
    created_by: ownerId,
    section_id: null,
    source_document_id: noteId,
    type: l.type,
    title: l.title,
    details: l.details ?? null,
    assignee: l.assignee ?? null,
    status: "open",
    priority: l.priority ?? null,
    start_date: null,
    due_date: null,
    position: ++position,
    completed_at: null,
  }));

  const { data: inserted, error: itemsError } = await supabase
    .from("items")
    .insert([...taskRows, ...logRows])
    .select("id, title");
  if (itemsError) fail("create the sample items", itemsError);
  const itemId = new Map(inserted.map((i) => [i.title, i.id]));

  const allTasks = def.sections.flatMap((s) => s.tasks);
  const subtasks = allTasks.flatMap((t) =>
    (t.subtasks ?? []).map(([title, done], i) => ({ item_id: itemId.get(t.title), created_by: ownerId, title, done, position: i + 1 })),
  );
  if (subtasks.length) {
    const { error } = await supabase.from("subtasks").insert(subtasks);
    if (error) fail("create sample subtasks", error);
  }
  const comments = allTasks.flatMap((t) =>
    (t.comments ?? []).map((body) => ({ item_id: itemId.get(t.title), created_by: ownerId, body })),
  );
  if (comments.length) {
    const { error } = await supabase.from("item_comments").insert(comments);
    if (error) fail("create sample updates", error);
  }

  if (def.engineering) await seedEngineering(project.id, ownerId, itemId, def.engineering);

  return inserted.length;
}

// A missing table means the Phase 5 migration hasn't been run yet: skip, don't fail.
function phase5Missing(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));
}

function at(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// RFIs, submittals, milestones, a design review and dependencies (Phase 5).
// With no auth.uid(), the status timestamps given here are kept as history.
async function seedEngineering(projectId, ownerId, itemId, eng) {
  const { data: rfis, error: rfiError } = await supabase
    .from("rfis")
    .insert(
      eng.rfis.map((r) => ({
        project_id: projectId,
        created_by: ownerId,
        asked_by_id: ownerId,
        subject: r.subject,
        question: r.question,
        response: r.response ?? null,
        status: r.status,
        ball_in_court: r.ball_in_court,
        date_required: inDays(r.required),
        opened_at: at(r.opened),
        answered_at: r.answered == null ? null : at(r.answered),
        closed_at: null,
      })),
    )
    .select("id, subject");
  if (phase5Missing(rfiError)) {
    console.log("  ! Skipped RFIs, submittals and reviews: run the Phase 5 migration first.");
    return;
  }
  if (rfiError) fail("create sample RFIs", rfiError);
  const rfiId = new Map(rfis.map((r) => [r.subject, r.id]));

  const { data: subs, error: subError } = await supabase
    .from("submittals")
    .insert(
      eng.submittals.map((s) => ({
        project_id: projectId,
        created_by: ownerId,
        spec_section: s.spec_section,
        title: s.title,
        submitted_by: s.submitted_by,
        reviewer: s.reviewer,
        received_on: inDays(s.first ? s.first.received : s.received),
        due_on: inDays(s.first ? s.first.due : s.due),
        returned_on: s.first ? inDays(s.first.returned) : s.returned == null ? null : inDays(s.returned),
        action: s.first ? s.first.action : (s.action ?? "pending"),
        review_notes: s.first ? s.first.notes : (s.notes ?? null),
      })),
    )
    .select("id, title");
  if (subError) fail("create sample submittals", subError);
  const subId = new Map(subs.map((s) => [s.title, s.id]));
  // A resubmitted one: moving to revision 1 files revision 0 in the history.
  for (const s of eng.submittals.filter((x) => x.first)) {
    const { error } = await supabase
      .from("submittals")
      .update({ revision: 1, received_on: inDays(s.received), due_on: inDays(s.due) })
      .eq("id", subId.get(s.title));
    if (error) fail("log a sample submittal revision", error);
  }

  // Link tasks to their RFI or submittal.
  const links = [
    ...eng.rfis.filter((r) => r.task).map((r) => [r.task, { rfi_id: rfiId.get(r.subject) }]),
    ...eng.submittals.filter((s) => s.task).map((s) => [s.task, { submittal_id: subId.get(s.title) }]),
  ];
  for (const [title, patch] of links) {
    const { error } = await supabase.from("items").update(patch).eq("id", itemId.get(title));
    if (error) fail("link sample tasks to the registers", error);
  }

  const { data: milestones, error: msError } = await supabase
    .from("milestones")
    .insert(
      eng.milestones.map((m) => ({
        project_id: projectId,
        created_by: ownerId,
        name: m.name,
        due_on: inDays(m.due),
        done_at: m.done ? at(m.due) : null,
      })),
    )
    .select("id, name");
  if (msError) fail("create sample milestones", msError);
  const milestoneId = new Map(milestones.map((m) => [m.name, m.id]));

  for (const r of eng.reviews) {
    const { data: review, error } = await supabase
      .from("reviews")
      .insert({ project_id: projectId, created_by: ownerId, name: r.name, milestone_id: milestoneId.get(r.milestone) ?? null, due_on: inDays(r.due) })
      .select("id")
      .single();
    if (error) fail("create the sample design review", error);
    const { error: commentError } = await supabase.from("items").insert(
      r.comments.map((c) => ({
        project_id: projectId,
        created_by: ownerId,
        section_id: null,
        source_document_id: null,
        review_id: review.id,
        disposition: c.disposition,
        type: "action_item",
        title: c.title,
        details: c.details ?? null,
        assignee: c.assignee,
        status: c.status ?? "open",
        priority: "medium",
        start_date: null,
        due_date: c.due == null ? null : inDays(c.due),
        position: 0,
        completed_at: c.status === "done" ? new Date().toISOString() : null,
      })),
    );
    if (commentError) fail("create sample review comments", commentError);
  }

  const { error: depError } = await supabase.from("item_dependencies").insert(
    eng.dependencies.map(([pre, suc]) => ({
      project_id: projectId,
      created_by: ownerId,
      predecessor_id: itemId.get(pre),
      successor_id: itemId.get(suc),
    })),
  );
  if (depError) fail("create sample task dependencies", depError);

  const { error: viewError } = await supabase
    .from("saved_views")
    .insert(eng.views.map((v) => ({ project_id: projectId, created_by: ownerId, shared: true, ...v })));
  if (viewError) fail("create sample saved views", viewError);

  console.log(
    `  ✓ Added ${rfis.length} RFIs, ${subs.length} submittals, ${milestones.length} milestones, ${eng.reviews.length} review and ${eng.dependencies.length} dependencies`,
  );
}

main().catch((error) => fail("seed the demo account", error));
