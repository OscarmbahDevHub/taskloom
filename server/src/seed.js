require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

const PASSWORD = "DemoPass123!";

const USERS = {
  admin: { email: "demo-admin@taskloom.test", name: "Alex Morgan", role: "admin" },
  member: { email: "demo-member@taskloom.test", name: "Jordan Lee", role: "member" },
  viewer: { email: "demo-viewer@taskloom.test", name: "Sam Rivera", role: "viewer" },
};

const CLIENTS = [
  { name: "Brightside Cafe", email: "hello@brightside.test" },
  { name: "Harbor Legal", email: "office@harborlegal.test" },
  { name: "Nimbus Health", email: "team@nimbushealth.test" },
  { name: "Orbit Fitness", email: "hi@orbitfit.test" },
];

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const dateOffset = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

function done(title, created, finished, opts = {}) {
  return {
    title,
    status: "done",
    created,
    finished,
    due: opts.late ? -finished - 2 : -finished + 1,
    owner: opts.owner || "member",
  };
}

function open(title, status, created, due, owner = null) {
  return { title, status, created, finished: null, due, owner };
}

const PROJECTS = [
  {
    name: "Brand refresh",
    client: "Brightside Cafe",
    value: 4200,
    description: "New logo, palette and brand guide",
    tasks: [
      done("Moodboard and references", 200, 190),
      done("Logo concepts", 195, 178, { owner: "admin" }),
      done("Final brand guide", 180, 165, { late: true }),
    ],
  },
  {
    name: "Marketing website",
    client: "Harbor Legal",
    value: 6800,
    description: "Five-page site with a contact flow",
    tasks: [
      done("Sitemap and wireframes", 120, 110),
      done("Page designs", 112, 102, { owner: "admin" }),
      done("Build and launch", 105, 95),
    ],
  },
  {
    name: "Email newsletter kit",
    client: "Brightside Cafe",
    value: 2400,
    description: "Reusable newsletter templates",
    tasks: [
      done("Template designs", 90, 80),
      done("Handoff docs", 82, 70, { owner: "admin" }),
    ],
  },
  {
    name: "Booking app",
    client: "Orbit Fitness",
    value: 3500,
    description: "Class booking MVP",
    tasks: [
      done("User research", 80, 70),
      done("Prototype", 72, 60),
      done("Ship v1", 65, 50, { owner: "admin" }),
    ],
  },
  {
    name: "Pricing page redesign",
    client: "Brightside Cafe",
    value: 5200,
    description: "Clearer plans and a faster checkout",
    tasks: [
      done("Audit current pricing", 14, 11),
      done("New layout", 12, 8, { owner: "admin" }),
      done("Launch new pricing page", 10, 6),
    ],
  },
  {
    name: "Patient portal",
    client: "Nimbus Health",
    value: 12500,
    description: "Appointments and medical records for patients",
    tasks: [
      done("Requirements workshop", 40, 30, { owner: "admin" }),
      done("Login and onboarding flow", 30, 12),
      done("Appointment booking UI", 20, 6),
      done("Appointment booking API", 18, 3, { late: true }),
      open("Medical records page", "in_progress", 10, 5, "member"),
      open("Notifications", "in_progress", 6, 9, "member"),
      open("Billing integration", "todo", 5, 20, "admin"),
      open("Accessibility audit", "todo", 4, 25),
      open("Security review", "todo", 4, null),
    ],
  },
  {
    name: "Website redesign",
    client: "Harbor Legal",
    value: 5400,
    description: "Modernize the public site",
    tasks: [
      done("Content inventory", 25, 15, { owner: "admin" }),
      done("Wireframes", 22, 9),
      open("Homepage design", "in_progress", 14, -3, "member"),
      open("Blog templates", "todo", 10, -1, "member"),
      open("Contact form", "todo", 8, 7, "admin"),
      open("QA pass", "todo", 8, 14),
    ],
  },
  {
    name: "Marketing automation",
    client: "Orbit Fitness",
    value: 2900,
    description: "Lifecycle emails and reporting",
    tasks: [
      done("Audit email tools", 12, 5),
      open("Welcome email series", "in_progress", 8, 4, "member"),
      open("Segment lists", "todo", 6, 10),
      open("Reporting dashboard", "todo", 6, 18, "admin"),
    ],
  },
];

async function seed() {
  const db = await pool.connect();

  try {
    await db.query("BEGIN");

    const emails = Object.values(USERS).map((u) => u.email);
    await db.query(
      `DELETE FROM workspaces
       WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await db.query("DELETE FROM users WHERE email = ANY($1)", [emails]);

    const hash = await bcrypt.hash(PASSWORD, 10);
    const ids = {};
    for (const [key, user] of Object.entries(USERS)) {
      const res = await db.query(
        `INSERT INTO users (email, password_hash, full_name, created_at)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [user.email, hash, user.name, daysAgo(220)]
      );
      ids[key] = res.rows[0].id;
    }

    const ws = await db.query(
      `INSERT INTO workspaces (name, owner_id, plan, created_at)
       VALUES ('Demo Agency', $1, 'pro', $2) RETURNING id`,
      [ids.admin, daysAgo(220)]
    );
    const workspaceId = ws.rows[0].id;

    for (const [key, user] of Object.entries(USERS)) {
      await db.query(
        `INSERT INTO memberships (workspace_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, $4)`,
        [workspaceId, ids[key], user.role, daysAgo(key === "admin" ? 220 : 200)]
      );
    }

    const clientIds = {};
    for (const c of CLIENTS) {
      const res = await db.query(
        `INSERT INTO clients (workspace_id, name, email, created_at)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [workspaceId, c.name, c.email, daysAgo(210)]
      );
      clientIds[c.name] = res.rows[0].id;
    }

    const activity = [
      { user: "member", action: "member_joined", entity: null, meta: {}, at: daysAgo(200) },
    ];
    const projectIds = {};
    let taskCount = 0;

    for (const p of PROJECTS) {
      const startedAgo = Math.max(...p.tasks.map((t) => t.created)) + 1;

      const pr = await db.query(
        `INSERT INTO projects (workspace_id, name, description, created_by, client_id, value_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          workspaceId,
          p.name,
          p.description,
          ids.admin,
          clientIds[p.client],
          p.value * 100,
          daysAgo(startedAgo),
        ]
      );
      const projectId = pr.rows[0].id;
      projectIds[p.name] = projectId;

      activity.push({
        user: "admin",
        action: "project_created",
        entity: p.name,
        meta: {},
        at: daysAgo(startedAgo),
      });

      for (const t of p.tasks) {
        await db.query(
          `INSERT INTO tasks
             (workspace_id, project_id, title, status, assignee_id, due_date, created_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workspaceId,
            projectId,
            t.title,
            t.status,
            t.owner ? ids[t.owner] : null,
            t.due === null ? null : dateOffset(t.due),
            daysAgo(t.created),
            t.finished === null ? null : daysAgo(t.finished),
          ]
        );
        taskCount += 1;

        activity.push({
          user: "admin",
          action: "task_created",
          entity: t.title,
          meta: { project: p.name },
          at: daysAgo(t.created),
        });

        if (t.status === "done") {
          activity.push({
            user: t.owner || "admin",
            action: "task_completed",
            entity: t.title,
            meta: { project: p.name, status: "done" },
            at: daysAgo(t.finished),
          });
        }
      }
    }

    activity.push(
      {
        user: "admin",
        action: "automation_ran",
        entity: "Tell admins when work is done",
        meta: { task: "Appointment booking API" },
        at: daysAgo(3),
      },
      {
        user: "member",
        action: "automation_ran",
        entity: "Assign started work to Jordan",
        meta: { task: "Notifications" },
        at: daysAgo(6),
      }
    );

    for (const a of activity) {
      await db.query(
        `INSERT INTO activity (workspace_id, user_id, action, entity_name, meta, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, ids[a.user], a.action, a.entity, JSON.stringify(a.meta), a.at]
      );
    }

    await db.query(
      `INSERT INTO automations
         (workspace_id, name, trigger_status, action, active, run_count, last_run_at, created_by, created_at)
       VALUES ($1, 'Tell admins when work is done', 'done', 'notify_admins', true, 9, $2, $3, $4)`,
      [workspaceId, daysAgo(3), ids.admin, daysAgo(60)]
    );
    await db.query(
      `INSERT INTO automations
         (workspace_id, name, trigger_status, action, action_user_id, active, run_count, last_run_at, created_by, created_at)
       VALUES ($1, 'Assign started work to Jordan', 'in_progress', 'assign_to', $2, true, 6, $3, $4, $5)`,
      [workspaceId, ids.member, daysAgo(6), ids.admin, daysAgo(60)]
    );

    const link = (name) => `/workspaces/${workspaceId}/projects/${projectIds[name]}`;
    const notes = [
      {
        message: '"Appointment booking API" moved to Done in Patient portal',
        project: "Patient portal",
        at: daysAgo(3),
        read: false,
      },
      {
        message: '"Appointment booking UI" moved to Done in Patient portal',
        project: "Patient portal",
        at: daysAgo(6),
        read: false,
      },
      {
        message: '"Launch new pricing page" moved to Done in Pricing page redesign',
        project: "Pricing page redesign",
        at: daysAgo(6),
        read: true,
      },
      {
        message: '"Wireframes" moved to Done in Website redesign',
        project: "Website redesign",
        at: daysAgo(9),
        read: true,
      },
    ];

    for (const n of notes) {
      await db.query(
        `INSERT INTO notifications (workspace_id, user_id, message, link, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          ids.admin,
          n.message,
          link(n.project),
          n.read ? new Date(n.at.getTime() + 60 * 60 * 1000) : null,
          n.at,
        ]
      );
    }

    await db.query("COMMIT");

    console.log("Demo workspace ready.");
    console.log(`  ${PROJECTS.length} projects, ${taskCount} tasks, ${CLIENTS.length} clients`);
    console.log(`  Admin login: ${USERS.admin.email} / ${PASSWORD}`);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Seeding failed:", err.message);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}

seed();