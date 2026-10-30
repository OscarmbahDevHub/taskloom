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

async function createInvite(actor, targetEmail, role, workspaceId = actor.workspaceId) {
  return request(app)
    .post(`/api/workspaces/${workspaceId}/invitations`)
    .set(auth(actor))
    .send({ email: targetEmail, role });
}

function accept(user, inviteToken) {
  return request(app)
    .post("/api/invitations/accept")
    .set(auth(user))
    .send({ token: inviteToken });
}

async function joinWorkspace(admin, user, name, role) {
  const invite = await createInvite(admin, emailFor(name), role);
  expect(invite.status).toBe(201);
  const token = invite.body.invitation.token;
  const res = await accept(user, token);
  expect(res.status).toBe(200);
  return token;
}

describe("Taskloom permissions", () => {
  let owner;
  let outsider;
  let viewer;
  let member;
  let projectId;
  let viewerInviteToken;

  const projectsUrl = () => `/api/workspaces/${owner.workspaceId}/projects`;
  const tasksUrl = () => `${projectsUrl()}/${projectId}/tasks`;

  beforeAll(async () => {
    owner = await register("owner", "Owner Co");
    outsider = await register("outsider", "Outsider Co");
    viewer = await register("viewer", "Viewer Own Co");
    member = await register("member", "Member Own Co");

    viewerInviteToken = await joinWorkspace(owner, viewer, "viewer", "viewer");
    await joinWorkspace(owner, member, "member", "member");

    const res = await request(app)
      .post(projectsUrl())
      .set(auth(owner))
      .send({ name: "Test project" });
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

  describe("authentication", () => {
    test("rejects requests with no token", async () => {
      const res = await request(app).get(projectsUrl());
      expect(res.status).toBe(401);
    });

    test("rejects requests with a bad token", async () => {
      const res = await request(app)
        .get(projectsUrl())
        .set({ Authorization: "Bearer not-a-real-token" });
      expect(res.status).toBe(401);
    });
  });

  describe("workspace isolation", () => {
    test("an outsider cannot read another workspace's projects", async () => {
      const res = await request(app).get(projectsUrl()).set(auth(outsider));
      expect(res.status).toBe(403);
    });

    test("an outsider cannot read another workspace's tasks", async () => {
      const res = await request(app).get(tasksUrl()).set(auth(outsider));
      expect(res.status).toBe(403);
    });

    test("an outsider cannot create a project in another workspace", async () => {
      const res = await request(app)
        .post(projectsUrl())
        .set(auth(outsider))
        .send({ name: "Sneaky project" });
      expect(res.status).toBe(403);
    });
  });

  describe("roles", () => {
    test("a viewer can read tasks", async () => {
      const res = await request(app).get(tasksUrl()).set(auth(viewer));
      expect(res.status).toBe(200);
    });

    test("a viewer cannot create a task", async () => {
      const res = await request(app)
        .post(tasksUrl())
        .set(auth(viewer))
        .send({ title: "Should not work" });
      expect(res.status).toBe(403);
    });

    test("a member can create a task", async () => {
      const res = await request(app)
        .post(tasksUrl())
        .set(auth(member))
        .send({ title: "Member task" });
      expect(res.status).toBe(201);
    });

    test("a member cannot delete a project", async () => {
      const res = await request(app)
        .delete(`${projectsUrl()}/${projectId}`)
        .set(auth(member));
      expect(res.status).toBe(403);
    });

    test("a member cannot invite people", async () => {
      const res = await createInvite(
        member,
        emailFor("nobody"),
        "viewer",
        owner.workspaceId
      );
      expect(res.status).toBe(403);
    });

    test("a viewer cannot start a Stripe checkout", async () => {
      const res = await request(app)
        .post(`/api/workspaces/${owner.workspaceId}/billing/checkout`)
        .set(auth(viewer));
      expect(res.status).toBe(403);
    });
  });

  describe("invitations", () => {
    test("an invitation cannot be used twice", async () => {
      const res = await accept(viewer, viewerInviteToken);
      expect(res.status).toBe(410);
    });

    test("the wrong person cannot use an invitation", async () => {
      const invite = await createInvite(owner, emailFor("intended"), "member");
      expect(invite.status).toBe(201);

      const res = await accept(outsider, invite.body.invitation.token);
      expect(res.status).toBe(403);
    });

    test("an expired invitation is rejected", async () => {
      const late = await register("late", "Late Co");
      const invite = await createInvite(owner, emailFor("late"), "member");
      expect(invite.status).toBe(201);

      await pool.query(
        "UPDATE invitations SET expires_at = now() - interval '1 day' WHERE token = $1",
        [invite.body.invitation.token]
      );

      const res = await accept(late, invite.body.invitation.token);
      expect(res.status).toBe(410);
    });
  });

  describe("plan limits", () => {
    test("the free plan blocks a 4th project", async () => {
      for (const name of ["Second project", "Third project"]) {
        const ok = await request(app)
          .post(projectsUrl())
          .set(auth(owner))
          .send({ name });
        expect(ok.status).toBe(201);
      }

      const blocked = await request(app)
        .post(projectsUrl())
        .set(auth(owner))
        .send({ name: "Fourth project" });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toMatch(/free plan/i);
    });
  });
});