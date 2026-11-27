import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const required = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"];
function missingConfig() {
  return required.filter(k => !process.env[k]);
}
async function askAI(messages) {
  const missing = missingConfig();
  if (missing.length) throw new Error(`Backend setup missing: ${missing.join(", ")}. Configure server/.env.`);
  const base = process.env.AI_BASE_URL.replace(/\/$/, "");
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [
        { role: "system", content: "You are Shahzad Intelligence, a helpful, respectful AI assistant. Reply in the language the user uses. Be clear and accurate." },
        ...messages
      ],
      temperature: 0.7
    })
  });
  const result = await upstream.json();
  if (!upstream.ok) throw new Error(result.error?.message || "AI provider request failed.");
  return result.choices?.[0]?.message?.content || "AI provider returned an empty response.";
}

app.get("/health", (_req, res) => res.json({
  ok: true, app: "Shahzad Intelligence",
  features: ["chat", "pdf-analysis", "image-understanding", "image-editing", "web-search", "voice-tts-client", "voice-recognition-client"]
}));

app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Please send messages." });
    const safe = messages.slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 6000)
    }));
    res.json({ reply: await askAI(safe) });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post("/api/pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Please attach a PDF file." });
    const parsed = await pdfParse(req.file.buffer);
    const text = (parsed.text || "").slice(0, 45000);
    if (!text.trim()) return res.status(422).json({ error: "No readable text found. This may be a scanned PDF; OCR support is not configured yet." });
    const question = String(req.body.question || "Summarize this PDF and explain its key points.").slice(0, 3000);
    const reply = await askAI([{ role: "user", content: `Analyze this PDF. User request: ${question}\n\nPDF text:\n${text}` }]);
    res.json({ reply });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post("/api/vision", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Please attach an image." });
    const question = String(req.body.question || "Describe this image.").slice(0, 3000);
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const missing = missingConfig();
    if (missing.length) return res.status(503).json({ error: `Configure server/.env: ${missing.join(", ")}` });
    const reply = await askAI([{
      role: "user",
      content: [
        { type: "text", text: question },
        { type: "image_url", image_url: { url: dataUrl } }
      ]
    }]);
    res.json({ reply });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post("/api/search", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Enter a search query." });
    if (!process.env.TAVILY_API_KEY) return res.status(503).json({ error: "Web search setup missing: add TAVILY_API_KEY to server/.env." });
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, search_depth: "basic", max_results: 5 })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || "Search provider request failed.");
    const context = (d.results || []).map((x, i) => `${i+1}. ${x.title}\n${x.url}\n${x.content}`).join("\n\n");
    const reply = await askAI([{ role: "user", content: `Answer this query using the search results. Include source URLs in your answer.\nQuery: ${query}\n\nResults:\n${context}` }]);
    res.json({ reply });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post("/api/image-edit", upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Attach an image first." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Image editing needs OPENAI_API_KEY in server/.env. This is separate from the chat provider key." });
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Describe the image edit you want." });
    const form = new FormData();
    form.append("model", process.env.IMAGE_EDIT_MODEL || "gpt-image-1");
    form.append("prompt", prompt);
    form.append("image", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "image.png");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` }, body: form
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Image editing provider failed.");
    const image = d.data?.[0]?.b64_json;
    if (!image) throw new Error("Image provider returned no image data.");
    res.json({ image });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => console.log(`Shahzad Intelligence backend listening on ${port}`));
