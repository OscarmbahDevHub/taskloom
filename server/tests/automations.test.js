const request = require("supertest");
const app = require("../src/app");
const pool = require("../src/db");

jest.setTimeout(60000);

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const DOMAIN = `.${run}@taskloom-test.dev`;
const PASSWORD = "password123";

const emailFor = (name) => `${name}${DOMAIN}`;
const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

async function register(name, workspaceName) {
  const res = await request(app).post("/api/auth/register").send({
    fullName: name,
    email: emailFor(name),
    password: PASSWORD,
    workspaceName,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, workspaceId: res.body.workspace.id };
}

async function userId(user) {
  const res = await request(app).get("/api/auth/me").set(auth(user));
  expect(res.status).toBe(200);
  return res.body.user.id;
}

async function addMember(owner, user, name, role) {
  const invite = await request(app)
    .post(`/api/workspaces/${owner.workspaceId}/invitations`)
    .set(auth(owner))
    .send({ email: emailFor(name), role });
  expect(invite.status).toBe(201);

  const res = await request(app)
    .post("/api/invitations/accept")
    .set(auth(user))
    .send({ token: invite.body.invitation.token });
  expect(res.status).toBe(200);
}

describe("Automations", () => {
  let owner;
  let member;
  let viewer;
  let outsider;
  let memberId;
  let outsiderId;
  let projectId;
  let assignRuleId;

  const base = () => `/api/workspaces/${owner.workspaceId}`;
  const tasksUrl = () => `${base()}/projects/${projectId}/tasks`;

  async function createTask(actor, title) {
    const res = await request(app).post(tasksUrl()).set(auth(actor)).send({ title });
    expect(res.status).toBe(201);
    return res.body.task;
  }

  function moveTask(actor, task, status) {
    return request(app)
      .patch(`${tasksUrl()}/${task.id}`)
      .set(auth(actor))
      .send({ status });
  }

  beforeAll(async () => {
    owner = await register("owner", "Owner Co");
    member = await register("member", "Member Own Co");
    viewer = await register("viewer", "Viewer Own Co");
    outsider = await register("outsider", "Outsider Co");

    await addMember(owner, member, "member", "member");
    await addMember(owner, viewer, "viewer", "viewer");

    memberId = await userId(member);
    outsiderId = await userId(outsider);

    const res = await request(app)
      .post(`${base()}/projects`)
      .set(auth(owner))
      .send({ name: "Automation project" });
    expect(res.status).toBe(201);
    projectId = res.body.project.id;
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM workspaces
       WHERE owner_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`%${DOMAIN}`]
    );
    await pool.query("DELETE FROM users WHERE email LIKE $1", [`%${DOMAIN}`]);
    await pool.end();
  });

  test("a viewer cannot create an automation", async () => {
    const res = await request(app)
      .post(`${base()}/automations`)
      .set(auth(viewer))
      .send({ name: "Nope", triggerStatus: "done", action: "notify_admins" });
    expect(res.status).toBe(403);
  });

  test("a member cannot create an automation", async () => {
    const res = await request(app)
      .post(`${base()}/automations`)
      .set(auth(member))
      .send({ name: "Nope", triggerStatus: "done", action: "notify_admins" });
    expect(res.status).toBe(403);
  });

  test("an outsider cannot read another workspace's automations", async () => {
    const res = await request(app).get(`${base()}/automations`).set(auth(outsider));
    expect(res.status).toBe(403);
  });

  test("an assign rule rejects someone outside the workspace", async () => {
    const res = await request(app)
      .post(`${base()}/automations`)
      .set(auth(owner))
      .send({
        name: "Bad assign",
        triggerStatus: "in_progress",
        action: "assign_to",
        actionUserId: outsiderId,
      });
    expect(res.status).toBe(400);
  });

  test("a notify rule alerts admins when a task is completed", async () => {
    const rule = await request(app)
      .post(`${base()}/automations`)
      .set(auth(owner))
      .send({ name: "Tell admins", triggerStatus: "done", action: "notify_admins" });
    expect(rule.status).toBe(201);

    const task = await createTask(member, "Finish the report");
    const moved = await moveTask(member, task, "done");
    expect(moved.status).toBe(200);

    const notes = await request(app).get(`${base()}/notifications`).set(auth(owner));
    expect(notes.status).toBe(200);
    expect(notes.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notes.body.notifications[0].message).toContain("Finish the report");

    const rules = await request(app).get(`${base()}/automations`).set(auth(owner));
    const saved = rules.body.automations.find((a) => a.id === rule.body.automation.id);
    expect(saved.run_count).toBe(1);
  });

  test("an assign rule assigns the task to the chosen member", async () => {
    const rule = await request(app)
      .post(`${base()}/automations`)
      .set(auth(owner))
      .send({
        name: "Auto assign",
        triggerStatus: "in_progress",
        action: "assign_to",
        actionUserId: memberId,
      });
    expect(rule.status).toBe(201);
    assignRuleId = rule.body.automation.id;

    const task = await createTask(owner, "Needs an owner");
    const moved = await moveTask(owner, task, "in_progress");
    expect(moved.status).toBe(200);
    expect(moved.body.task.assignee_id).toBe(memberId);
  });

  test("a paused rule does not run", async () => {
    const pause = await request(app)
      .patch(`${base()}/automations/${assignRuleId}`)
      .set(auth(owner))
      .send({ active: false });
    expect(pause.status).toBe(200);

    const task = await createTask(owner, "Should stay unassigned");
    const moved = await moveTask(owner, task, "in_progress");
    expect(moved.status).toBe(200);
    expect(moved.body.task.assignee_id).toBeNull();
  });

  test("the free plan limits automations to 3", async () => {
    const third = await request(app)
      .post(`${base()}/automations`)
      .set(auth(owner))
      .send({ name: "Third rule", triggerStatus: "todo", action: "notify_admins" });
    expect(third.status).toBe(201);

    const fourth = await request(app)
      .post(`${base()}/automations`)
      .set(auth(owner))
      .send({ name: "Fourth rule", triggerStatus: "todo", action: "notify_admins" });
    expect(fourth.status).toBe(403);
    expect(fourth.body.error).toMatch(/free plan/i);
  });

  test("marking notifications as read clears the unread count", async () => {
    const read = await request(app)
      .post(`${base()}/notifications/read-all`)
      .set(auth(owner));
    expect(read.status).toBe(200);

    const notes = await request(app).get(`${base()}/notifications`).set(auth(owner));
    expect(notes.body.unreadCount).toBe(0);
  });
});