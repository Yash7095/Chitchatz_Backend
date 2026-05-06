import { GoogleGenerativeAI } from "@google/generative-ai";
import Message from "../models/message.model.js";

export const getSmartReplies = async (req, res) => {
  try {
    const { conversationUserId } = req.body;
    const myId = req.user._id;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json(["Sure!", "Got it 👍", "Tell me more"]);
    }

    // Fetch last 6 messages for context
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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a chat assistant. Based on this conversation, suggest 3 short natural reply options the user ("me") could send next. Each reply must be under 10 words, casual and conversational. Return ONLY a JSON array of 3 strings, nothing else. Example: ["Sure!", "Sounds good 👍", "Tell me more"]\n\nConversation:\n${history}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    let suggestions = ["Sure!", "Got it 👍", "Tell me more"];

    try {
      // Strip markdown code fences if Gemini wraps in ```json ... ```
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        suggestions = parsed.slice(0, 3).map((s) => String(s));
      }
    } catch {
      // Keep defaults
    }

    res.status(200).json(suggestions);
  } catch (error) {
    console.log("Error in getSmartReplies:", error.message);
    res.status(200).json(["Sure!", "Sounds good 👌", "Let me think..."]);
  }
};
