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

async function addViewer(owner, viewer) {
  const invite = await request(app)
    .post(`/api/workspaces/${owner.workspaceId}/invitations`)
    .set(auth(owner))
    .send({ email: emailFor("viewer"), role: "viewer" });
  expect(invite.status).toBe(201);

  const res = await request(app)
    .post("/api/invitations/accept")
    .set(auth(viewer))
    .send({ token: invite.body.invitation.token });
  expect(res.status).toBe(200);
}

describe("Clients and revenue", () => {
  let owner;
  let outsider;
  let viewer;
  let clientId;
  let projectId;

  const base = () => `/api/workspaces/${owner.workspaceId}`;

  beforeAll(async () => {
    owner = await register("owner", "Owner Co");
    outsider = await register("outsider", "Outsider Co");
    viewer = await register("viewer", "Viewer Own Co");
    await addViewer(owner, viewer);

    const res = await request(app)
      .post(`${base()}/clients`)
      .set(auth(owner))
      .send({ name: "Acme Ltd", email: "hello@acme.test" });
    expect(res.status).toBe(201);
    clientId = res.body.client.id;
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

  test("an outsider cannot read another workspace's clients", async () => {
    const res = await request(app).get(`${base()}/clients`).set(auth(outsider));
    expect(res.status).toBe(403);
  });

  test("a viewer can read clients", async () => {
    const res = await request(app).get(`${base()}/clients`).set(auth(viewer));
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(1);
  });

  test("a viewer cannot create a client", async () => {
    const res = await request(app)
      .post(`${base()}/clients`)
      .set(auth(viewer))
      .send({ name: "Sneaky client" });
    expect(res.status).toBe(403);
  });

  test("a project stores its value in cents and its client", async () => {
    const res = await request(app)
      .post(`${base()}/projects`)
      .set(auth(owner))
      .send({ name: "Client site", clientId, value: 1250.5 });

    expect(res.status).toBe(201);
    expect(res.body.project.value_cents).toBe(125050);
    expect(res.body.project.client_name).toBe("Acme Ltd");
    projectId = res.body.project.id;
  });

  test("a project cannot link to another workspace's client", async () => {
    const other = await request(app)
      .post(`/api/workspaces/${outsider.workspaceId}/clients`)
      .set(auth(outsider))
      .send({ name: "Outsider client" });
    expect(other.status).toBe(201);

    const res = await request(app)
      .post(`${base()}/projects`)
      .set(auth(owner))
      .send({ name: "Bad link", clientId: other.body.client.id });
    expect(res.status).toBe(400);
  });

  test("a negative project value is rejected", async () => {
    const res = await request(app)
      .post(`${base()}/projects`)
      .set(auth(owner))
      .send({ name: "Negative", value: -5 });
    expect(res.status).toBe(400);
  });

  test("an unfinished project earns nothing yet", async () => {
    const res = await request(app).get(`${base()}/revenue`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.earnedCents).toBe(0);
    expect(res.body.pipelineCents).toBe(125050);
  });

  test("a finished project counts in the current month", async () => {
    const task = await request(app)
      .post(`${base()}/projects/${projectId}/tasks`)
      .set(auth(owner))
      .send({ title: "Ship it" });
    expect(task.status).toBe(201);

    const done = await request(app)
      .patch(`${base()}/projects/${projectId}/tasks/${task.body.task.id}`)
      .set(auth(owner))
      .send({ status: "done" });
    expect(done.status).toBe(200);

    const res = await request(app).get(`${base()}/revenue`).set(auth(owner));
    expect(res.body.thisMonthCents).toBe(125050);
    expect(res.body.earnedCents).toBe(125050);
    expect(res.body.pipelineCents).toBe(0);
  });

  test("a viewer cannot edit a project", async () => {
    const res = await request(app)
      .patch(`${base()}/projects/${projectId}`)
      .set(auth(viewer))
      .send({ value: 99999 });
    expect(res.status).toBe(403);
  });
});