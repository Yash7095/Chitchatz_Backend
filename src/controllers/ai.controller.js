import Message from "../models/message.model.js";
import GroupMessage from "../models/groupMessage.model.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

async function callGemini(apiKey, prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

export const getSmartReplies = async (req, res) => {
  try {
    const { conversationUserId } = req.body;
    const myId = req.user._id;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiKey) return res.status(200).json(["Sure!", "Got it 👍", "Tell me more"]);

    const recentMessages = await Message.find({
      $or: [
        { senderId: myId, receiverId: conversationUserId },
        { senderId: conversationUserId, receiverId: myId },
      ],
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(6);

    const history = recentMessages
      .reverse()
      .map((m) => {
        const role = m.senderId.toString() === myId.toString() ? "me" : "them";
        const content = m.text || (m.image ? "[image]" : m.video ? "[video]" : "[voice note]");
        return `${role}: ${content}`;
      })
      .join("\n");

    const prompt = `You are a chat assistant. Based on this conversation, suggest 3 short natural reply options the user ("me") could send next. Each reply must be under 10 words, casual and conversational. Return ONLY a JSON array of 3 strings, nothing else. Example: ["Sure!", "Sounds good 👍", "Tell me more"]\n\nConversation:\n${history}`;

    const raw = await callGemini(geminiKey, prompt);

    let suggestions = ["Sure!", "Got it 👍", "Tell me more"];
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        suggestions = parsed.slice(0, 3).map((s) => String(s));
      }
    } catch {
      // keep defaults
    }

    res.status(200).json(suggestions);
  } catch (error) {
    console.log("Error in getSmartReplies:", error.message);
    res.status(200).json(["Sure!", "Sounds good 👌", "Let me think..."]);
  }
};

// 8.3 — Summarize conversation
export const summarizeConversation = async (req, res) => {
  try {
    const { conversationUserId, groupId } = req.body;
    const myId = req.user._id;

    let messages = [];

    if (groupId) {
      messages = await GroupMessage.find({ groupId, isDeleted: false })
        .populate("senderId", "fullName")
        .sort({ createdAt: -1 })
        .limit(40);
    } else if (conversationUserId) {
      messages = await Message.find({
        $or: [
          { senderId: myId, receiverId: conversationUserId },
          { senderId: conversationUserId, receiverId: myId },
        ],
        isDeleted: false,
      })
        .populate("senderId", "fullName")
        .sort({ createdAt: -1 })
        .limit(40);
    } else {
      return res.status(400).json({ message: "conversationUserId or groupId required" });
    }

    if (messages.length < 3) {
      return res.status(200).json({ summary: "Not enough messages to summarize yet." });
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiKey) return res.status(200).json({ summary: "API key not configured." });

    const history = messages
      .reverse()
      .map((m) => {
        const name = m.senderId?.fullName || "Unknown";
        const content = m.text || (m.image ? "[image]" : m.video ? "[video]" : "[audio]");
        return `${name}: ${content}`;
      })
      .join("\n");

    const prompt = `Summarize the following chat conversation in 2-4 clear, natural sentences. Focus on the key topics discussed and any decisions made. Return only the summary text, no intro phrases.\n\nConversation:\n${history}`;

    const summary = await callGemini(geminiKey, prompt);
    res.status(200).json({ summary });
  } catch (error) {
    console.log("Error in summarizeConversation:", error.message);
    res.status(200).json({ summary: "Failed to generate summary." });
  }
};
