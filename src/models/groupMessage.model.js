import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String },
    image: { type: String },
    video: { type: String },
    audio: { type: String },
    type: { type: String, enum: ["text", "image", "video", "audio"], default: "text" },
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String },
      },
    ],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "GroupMessage", default: null },
    isDeleted: { type: Boolean, default: false },
    poll: {
      question: { type: String },
      options: [
        {
          text: { type: String },
          votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        },
      ],
    },
  },
  { timestamps: true }
);

groupMessageSchema.index({ groupId: 1, createdAt: -1 });

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
export default GroupMessage;
