import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ status: "error", error: "Missing jobId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const store = getStore("acord-jobs");
  const job = await store.get(jobId, { type: "json" });
  if (!job) {
    return new Response(JSON.stringify({ status: "pending" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify(job), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/.netlify/functions/extract-status"
};
