import { beforeEach, expect, it, vi } from "vitest";
const { auth, pool, create, list, apply } = vi.hoisted(() => ({ auth: vi.fn(), pool: vi.fn(), create: vi.fn(), list: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/auth/admin", async (original) => ({ ...(await original()), requireAdminAuth0Subject: auth }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: pool }));
vi.mock("@/lib/ems/editorial-refresh", async (original) => ({ ...(await original()), createEditorialRefresh: create, listEditorialRefreshes: list, applyEditorialRefresh: apply }));
import { EditorialRefreshError } from "@/lib/ems/editorial-refresh";
import { GET, POST } from "./route";
import { POST as APPLY } from "./[id]/route";
const id = "12345678-1234-1234-1234-123456789abc";
function request(body: unknown = {}, origin = "https://mrms.approid.team") {
  return new Request(`https://mrms.approid.team/api/admin/ems/editorial-refresh/${id}`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue("auth0|admin"); pool.mockReturnValue({}); create.mockResolvedValue({ id, status: "pending" }); list.mockResolvedValue({ jobs: [] }); apply.mockResolvedValue({ id, status: "applied" }); });
it("only returns protected job data and disables caching", async () => {
  const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each([401, 403])("rejects unauthenticated/unauthorized reads and writes (%s)", async (status) => {
  auth.mockRejectedValue({ status, code: "admin_forbidden" });
  for (const response of [await GET(), await POST(request()), await APPLY(request({ action: "apply" }), { params: Promise.resolve({ id }) })]) expect(response.status).toBe(status);
  expect(list).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
});
it("queues a preview without performing external work in the API", async () => {
  expect((await POST(request())).status).toBe(202); expect(create).toHaveBeenCalledWith({}, "auth0|admin");
});
it.each([[], null, { sourceUrl: "https://example.com" }, { limit: 100 }, { tracks: [] }])("rejects caller-controlled source/selection (%j)", async (body) => {
  expect((await POST(request(body))).status).toBe(400); expect(create).not.toHaveBeenCalled();
});
it("rejects cross-origin preview and apply", async () => {
  expect((await POST(request({}, "https://example.com"))).status).toBe(403);
  expect((await APPLY(request({ action: "apply" }, "https://example.com"), { params: Promise.resolve({ id }) })).status).toBe(403);
  expect(create).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
});
it.each([{}, [], null, { action: "apply", tracks: [] }, { action: "refresh" }])("rejects invalid apply action (%j)", async (body) => {
  expect((await APPLY(request(body), { params: Promise.resolve({ id }) })).status).toBe(400); expect(apply).not.toHaveBeenCalled();
});
it("applies only the saved preview ID as the authenticated actor", async () => {
  expect((await APPLY(request({ action: "apply" }), { params: Promise.resolve({ id }) })).status).toBe(200);
  expect(apply).toHaveBeenCalledWith({}, id, "auth0|admin");
});
it.each([[404, "editorial_refresh_not_found"], [409, "editorial_refresh_stale"], [409, "editorial_refresh_not_ready"]])("returns state conflict without hiding its code", async (status, code) => {
  apply.mockRejectedValue(new EditorialRefreshError(status as number, code as string));
  const response = await APPLY(request({ action: "apply" }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
});
it("rejects malformed JSON", async () => {
  const malformed = () => new Request("https://mrms.approid.team/api/admin/ems/editorial-refresh", { method: "POST", body: "{" });
  expect((await POST(malformed())).status).toBe(400); expect((await APPLY(malformed(), { params: Promise.resolve({ id }) })).status).toBe(400);
});
