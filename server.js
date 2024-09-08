require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require("express-session");
const methodOverride = require("method-override");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const PORT = process.env.PORT || 7000;

// Initialize Express app
const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Use session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 30 },
  })
);

// Define a Message schema
const messageSchema = new mongoose.Schema({
  user: String,
  text: String,
  date: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Google Gemini API setup
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Function to sanitize messages
const sanitizeMessage = (message) => {
  return message.replace(/[^a-zA-Z0-9\s.,!?]/g, "").trim();
};

// Function to generate content using the AI model
const generateResponse = async (conversation) => {
  try {
    const result = await model.generateContent(conversation.join("\n"));
    return result.response.text();
  } catch (err) {
    console.error("Error generating content:", err);
    throw new Error("Failed to generate content");
  }
};

// Home route
app.get("/", (req, res) => {
  if (!req.session.messages) {
    req.session.messages = [];
  }
  res.render("index", { messages: req.session.messages });
});

// API route to handle chat messages
app.post("/api/chat", async (req, res) => {
  let userMessage = req.body.message;

  // Sanitize user message
  userMessage = sanitizeMessage(userMessage);

  // Save user message to session
  if (!req.session.messages) {
    req.session.messages = [];
  }
  req.session.messages.push({
    user: "User",
    text: userMessage,
    date: new Date(),
  });

  // Save message to MongoDB
  const userMsg = new Message({ user: "User", text: userMessage });
  await userMsg.save();

  // Retrieve recent messages, filter by relevance (e.g., current topic)
  const recentMessages = await Message.find().sort({ date: -1 }).limit(10); // Get the last 10 messages

  // Filter messages based on current topic (e.g., if the current message is about "Google")
  const relevantMessages = recentMessages
    .filter(
      (msg) =>
        msg.user === "User" && isRelevantToCurrentTopic(msg.text, userMessage)
    )
    .map((msg) => `${msg.user}: ${msg.text}`);

  // Add the current user message to the conversation
  relevantMessages.push(`User: ${userMessage}`);

  try {
    const aiResponse = await generateResponse(relevantMessages); // Pass only relevant conversation

    const sanitizedAIResponse = sanitizeMessage(aiResponse);

    req.session.messages.push({
      user: "AI",
      text: sanitizedAIResponse,
      date: new Date(),
    });

    const aiMessage = new Message({ user: "AI", text: sanitizedAIResponse });
    await aiMessage.save();

    res.send({ response: sanitizedAIResponse });
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// Helper functions to filter messages and extract topics
function isRelevantToCurrentTopic(pastMessage, currentMessage) {
  // Simple keyword matching (you can enhance this logic)
  const topicKeywords = extractTopic(currentMessage);
  return pastMessage.toLowerCase().includes(topicKeywords);
}

function extractTopic(message) {
  // Extract the topic from the message (for example, you could use NLP here)
  // This is a placeholder; enhance it based on your requirements
  if (message.toLowerCase().includes("google")) {
    return "Google";
  } else if (message.toLowerCase().includes("biryani")) {
    return "biryani";
  }
  return "conversation";
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
