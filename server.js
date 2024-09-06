require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require("express-session");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Express app
const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Use session middleware
app.use(
  session({
    secret: "your-secret-key", // Replace with a secure key
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 30 }, // 30 minutes session expiration
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
    console.error(err);
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

  // Retrieve the last 10 messages for AI context
  const previousMessages = await Message.find().sort({ date: 1 }).limit(10);

  const conversation = previousMessages
    .filter((msg) => msg.user === "User")
    .map((msg) => `${msg.user}: ${msg.text}`);
  conversation.push(`User: ${userMessage}`);

  try {
    const aiResponse = await generateResponse(conversation);

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

// Start the server
app.listen(7000, () => {
  console.log("Server is running on port 7000");
});
