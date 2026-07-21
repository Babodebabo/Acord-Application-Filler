import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("acord-jobs");
  let jobId;
  try {
    const body = await req.json();
    jobId = body.jobId;
    const { docParts, fields } = body;
    if (!jobId || !docParts || !fields) return;

    await store.setJSON(jobId, { status: "processing" });

    const fieldList = fields.map(f =>
      f.name + " [" + f.type.replace("PDF","") + "]" + (f.options ? " options: " + f.options.join("|") : "")
    ).join("\n");

    const system = `You are an insurance data extraction engine for Griffith Insurance Group.
You are given (1) source insurance documents and (2) the EXACT fillable field names from a blank ACORD form.
Extract data from the source documents and map values to the form's field names.

RULES:
- Return ONLY a JSON object: {"mapping": {"<exact field name>": "<value>"}}. No markdown, no commentary.
- Use the field names EXACTLY as provided, including punctuation, brackets, and casing.
- For Text fields: return the plain value (numbers without $ or commas; dates as MM/DD/YYYY unless the form clearly expects another format).
- For CheckBox fields: return "Yes" only if it should be checked; otherwise omit the field entirely.
- For Dropdown/RadioGroup fields: return one of the provided options (match meaning, not just exact string).
- Only include fields you can populate from the documents. Omit anything you cannot determine. Do not guess.

FORM FIELDS:
` + fieldList;

    const messages = [{
      role: "user",
      content: [
        ...docParts,
        { type: "text", text: "Extract the insurance data from the documents above and map it to the form fields. Return only the JSON mapping." }
      ]
    }];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Netlify.env.get("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system,
        messages
      })
    });

    if (!r.ok) {
      const t = await r.text();
      await store.setJSON(jobId, { status: "error", error: "Anthropic error: " + t.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const raw = (data.content || []).map(c => c.text || "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();

    let mapping = {};
    try {
      mapping = JSON.parse(clean).mapping || {};
    } catch (e) {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { const p = JSON.parse(m[0]); mapping = p.mapping || p; } catch (e2) {} }
    }

    await store.setJSON(jobId, { status: "done", mapping });
  } catch (err) {
    if (jobId) {
      try { await store.setJSON(jobId, { status: "error", error: "Function error: " + err.message }); } catch (e2) {}
    }
  }
};
