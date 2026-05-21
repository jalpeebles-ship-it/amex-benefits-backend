// ============================================
// AMEX PLATINUM BENEFITS COACH - BACKEND SERVER
// ============================================
// This file does three things:
// 1. Runs a web server that accepts email signups
// 2. Stores subscriber data in a local JSON file
// 3. Sends monthly benefit report emails via Resend

// --- Load our tools ---
require("dotenv").config(); // Loads our secret API key from the .env file
const express = require("express"); // Web server
const { Resend } = require("resend"); // Email sending service
const cron = require("node-cron"); // Monthly scheduler
const fs = require("fs"); // File system (built into Node.js, reads/writes files)
const path = require("path"); // File paths (built into Node.js)

// --- Set up the tools ---
const app = express(); // Create the web server
const resend = new Resend(process.env.RESEND_API_KEY); // Connect to Resend using our secret key
const PORT = 3000; // The port our server will run on (like a door number)
const DB_FILE = path.join(__dirname, "subscribers.json"); // Where we store subscriber data

// Tell Express to understand JSON data sent from our landing page
app.use(express.json());

// Allow our landing page (hosted elsewhere) to talk to this server
// This is called CORS - without it, browsers block requests between different websites
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// --- Database helpers ---
// We're using a simple JSON file instead of a real database.
// This is perfect for starting out. You can upgrade to a real
// database later when you have more users.

function readSubscribers() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading subscribers:", err.message);
    return [];
  }
}

function saveSubscribers(subscribers) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(subscribers, null, 2));
  } catch (err) {
    console.error("Error saving subscribers:", err.message);
  }
}

// ============================================
// API ENDPOINTS (routes your landing page calls)
// ============================================

// --- Health check ---
// Visit http://localhost:3000/api/health to make sure the server is running
app.get("/api/health", (req, res) => {
  const subscribers = readSubscribers();
  res.json({
    status: "ok",
    subscribers: subscribers.length,
    timestamp: new Date().toISOString(),
  });
});

// --- Email signup ---
// The landing page sends a POST request here with { email: "user@example.com" }
app.post("/api/signup", (req, res) => {
  const { email } = req.body;

  // Validate the email
  if (!email || !email.includes("@") || !email.includes(".")) {
    return res.status(400).json({ error: "Please provide a valid email address" });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Check if already signed up
  const subscribers = readSubscribers();
  const existing = subscribers.find((s) => s.email === cleanEmail);
  if (existing) {
    return res.json({ message: "You're already signed up!", alreadyExists: true });
  }

  // Add the new subscriber
  const newSubscriber = {
    email: cleanEmail,
    signedUpAt: new Date().toISOString(),
    benefits: {}, // They'll populate this in the tracker later
  };
  subscribers.push(newSubscriber);
  saveSubscribers(subscribers);

  console.log("New signup:", cleanEmail, "| Total subscribers:", subscribers.length);

  // Send a welcome email
  sendWelcomeEmail(cleanEmail);

  res.json({ message: "You're in!", success: true });
});

// --- View all subscribers (for your own admin use) ---
app.get("/api/subscribers", (req, res) => {
  const subscribers = readSubscribers();
  res.json({
    total: subscribers.length,
    subscribers: subscribers.map((s) => ({
      email: s.email,
      signedUpAt: s.signedUpAt,
    })),
  });
});

// --- Manually trigger monthly report (for testing) ---
app.get("/api/send-report", async (req, res) => {
  console.log("Manually triggering monthly report...");
  await sendMonthlyReports();
  res.json({ message: "Monthly reports sent! Check your email." });
});

// ============================================
// EMAIL TEMPLATES
// ============================================

function buildWelcomeEmailHTML(email) {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #111114; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
      <div style="padding: 28px 24px; text-align: center; border-bottom: 1px solid #1e1e23;">
        <div style="width: 40px; height: 27px; border-radius: 4px; background: linear-gradient(135deg,#c9a96e,#e8d5a8,#c9a96e); margin: 0 auto 16px;"></div>
        <h1 style="font-size: 22px; color: #fff; margin: 0 0 8px;">Welcome to Benefits Coach</h1>
        <p style="font-size: 14px; color: #999; margin: 0;">Your Amex Platinum has ~$3,800 in annual benefits. Let's make sure you use every one.</p>
      </div>
      <div style="padding: 24px;">
        <h2 style="font-size: 16px; color: #c9a96e; margin: 0 0 12px;">What happens next:</h2>
        <div style="margin-bottom: 10px; display: flex; gap: 8px;">
          <span style="color: #c9a96e; font-weight: bold;">1.</span>
          <span style="font-size: 13px; color: #bbb;">Open your tracker and go through each benefit — mark what you've enrolled in.</span>
        </div>
        <div style="margin-bottom: 10px; display: flex; gap: 8px;">
          <span style="color: #c9a96e; font-weight: bold;">2.</span>
          <span style="font-size: 13px; color: #bbb;">Use the coaching tabs (How to Use, Pro Tips, Pitfalls) to activate anything you've missed.</span>
        </div>
        <div style="margin-bottom: 10px; display: flex; gap: 8px;">
          <span style="color: #c9a96e; font-weight: bold;">3.</span>
          <span style="font-size: 13px; color: #bbb;">On the 1st of each month, we'll email you a report showing where you stand and what's about to expire.</span>
        </div>
      </div>
      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid #1e1e23; border-bottom: 1px solid #1e1e23;">
        <p style="font-size: 13px; color: #999; margin: 0 0 16px;">Your tracker is ready — 20 benefits pre-loaded, nothing to configure.</p>
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 16px auto;">
  <tr>
    <td style="background: #c9a96e; border-radius: 10px;">
      <a href="https://amex-platinum-tracker.onrender.com" style="display: block; padding: 14px 32px; color: #111; text-decoration: none; font-size: 15px; font-weight: 700; font-family: system-ui, sans-serif;">Open Your Tracker →</a>
    </td>
  </tr>
</table>
      </div>
      <div style="padding: 16px 24px; text-align: center;">
        <p style="font-size: 11px; color: #555; margin: 0;">You're receiving this because ${email} signed up for Amex Benefits Coach. Reply to unsubscribe.</p>
      </div>
    </div>
  `;
}

function buildMonthlyReportHTML(email) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  const month = months[now.getMonth()];
  const year = now.getFullYear();

  const benefits = [
    { name: "Uber Cash", value: "$15", period: "this month", resets: "end of month" },
    { name: "Digital Entertainment", value: "$25", period: "this month", resets: "end of month" },
    { name: "Walmart+", value: "$12.95", period: "this month", resets: "end of month" },
    { name: "Resy Dining", value: "$100", period: "this quarter", resets: "end of quarter" },
    { name: "lululemon", value: "$75", period: "this quarter", resets: "end of quarter" },
    { name: "Hotel Credit", value: "$300", period: "this half", resets: "end of June / December" },
    { name: "Airline Fee Credit", value: "$200", period: "this year", resets: "end of year" },
    { name: "CLEAR+", value: "$209", period: "this year", resets: "end of year" },
    { name: "Equinox", value: "$300", period: "this year", resets: "end of year" },
    { name: "Oura Ring", value: "$200", period: "this year", resets: "end of year" },
  ];

  const benefitRows = benefits.map((b) => `
    <tr>
      <td style="padding: 8px 12px; font-size: 13px; color: #ddd; border-bottom: 1px solid #1a1a1f;">${b.name}</td>
      <td style="padding: 8px 12px; font-size: 13px; color: #c9a96e; font-family: monospace; border-bottom: 1px solid #1a1a1f;">${b.value}</td>
      <td style="padding: 8px 12px; font-size: 12px; color: #888; border-bottom: 1px solid #1a1a1f;">${b.resets}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #111114; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
      <div style="padding: 28px 24px; text-align: center; border-bottom: 1px solid #1e1e23;">
        <div style="width: 40px; height: 27px; border-radius: 4px; background: linear-gradient(135deg,#c9a96e,#e8d5a8,#c9a96e); margin: 0 auto 16px;"></div>
        <h1 style="font-size: 20px; color: #fff; margin: 0 0 4px;">${month} ${year} Benefits Report</h1>
        <p style="font-size: 13px; color: #999; margin: 0;">Your monthly Amex Platinum check-in</p>
      </div>

      <div style="padding: 20px 24px; border-bottom: 1px solid #1e1e23;">
        <h2 style="font-size: 15px; color: #e8c76a; margin: 0 0 8px;">Don't leave money on the table</h2>
        <p style="font-size: 13px; color: #999; line-height: 1.6; margin: 0;">
          Here are your Amex Platinum credits and when they expire. Have you used them all this period?
        </p>
      </div>

      <div style="padding: 16px 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <th style="padding: 8px 12px; font-size: 11px; color: #666; text-align: left; text-transform: uppercase; letter-spacing: 0.5px;">Benefit</th>
            <th style="padding: 8px 12px; font-size: 11px; color: #666; text-align: left; text-transform: uppercase; letter-spacing: 0.5px;">Value</th>
            <th style="padding: 8px 12px; font-size: 11px; color: #666; text-align: left; text-transform: uppercase; letter-spacing: 0.5px;">Resets</th>
          </tr>
          ${benefitRows}
        </table>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid #1e1e23;">
        <p style="font-size: 13px; color: #c9a96e; margin: 0 0 8px; font-weight: 600;">Quick reminders:</p>
        <p style="font-size: 12px; color: #999; line-height: 1.6; margin: 0 0 4px;">- Uber Cash expires at midnight on the last day of the month</p>
        <p style="font-size: 12px; color: #999; line-height: 1.6; margin: 0 0 4px;">- Quarterly credits (Resy, lululemon) reset and do NOT roll over</p>
        <p style="font-size: 12px; color: #999; line-height: 1.6; margin: 0;">- Open your tracker to log usage and check your keep-or-cancel score</p>
      </div>

      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid #1e1e23; border-bottom: 1px solid #1e1e23;">
        <p style="font-size: 13px; color: #999; margin: 0 0 16px;">Log this month's usage and see your keep-or-cancel verdict.</p>
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 16px auto;">
  <tr>
    <td style="background: #c9a96e; border-radius: 10px;">
      <a href="https://amex-platinum-tracker.onrender.com" style="display: block; padding: 14px 32px; color: #111; text-decoration: none; font-size: 15px; font-weight: 700; font-family: system-ui, sans-serif;">Update Your Tracker →</a>
    </td>
  </tr>
</table>
      </div>

      <div style="padding: 16px 24px; text-align: center;">
        <p style="font-size: 11px; color: #555; margin: 0;">Sent to ${email} by Amex Benefits Coach. Reply to unsubscribe.</p>
      </div>
    </div>
  `;
}

// ============================================
// EMAIL SENDING FUNCTIONS
// ============================================
async function sendWelcomeEmail(email) {
  try {
    const result = await resend.emails.send({
      from: "Amex Benefits Coach <onboarding@resend.dev>",
      to: email,
      subject: "Welcome - let's maximize your Platinum benefits",
      html: buildWelcomeEmailHTML(email),
    });
    console.log("Resend response:", JSON.stringify(result));
    if (result.error) {
      console.error("Resend error:", JSON.stringify(result.error));
    } else {
      console.log("Welcome email sent to:", email);
    }
  } catch (err) {
    console.error("Failed to send welcome email:", err.message);
  }
}

async function sendMonthlyReports() {
  const subscribers = readSubscribers();
  console.log(`Sending monthly reports to ${subscribers.length} subscribers...`);

  for (const subscriber of subscribers) {
    try {
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const month = months[new Date().getMonth()];

      await resend.emails.send({
        from: "Amex Benefits Coach <onboarding@resend.dev>",
        to: subscriber.email,
        subject: `${month} Platinum Benefits Report — are you on track?`,
        html: buildMonthlyReportHTML(subscriber.email),
      });
      console.log("Report sent to:", subscriber.email);
    } catch (err) {
      console.error("Failed to send to", subscriber.email, ":", err.message);
    }
  }

  console.log("Monthly report batch complete.");
}

// ============================================
// CRON SCHEDULER
// ============================================
// This schedules the monthly report to send at 9:00 AM
// on the 1st of every month.
//
// The format is: minute hour day-of-month month day-of-week
// "0 9 1 * *" means: minute 0, hour 9, day 1, any month, any weekday

cron.schedule("0 9 1 * *", () => {
  console.log("Cron triggered: sending monthly reports...");
  sendMonthlyReports();
});

// ============================================
// START THE SERVER
// ============================================

app.listen(PORT, () => {
  console.log("");
  console.log("===========================================");
  console.log("  Amex Benefits Coach Backend is running!");
  console.log("===========================================");
  console.log("");
  console.log("  Server:     http://localhost:" + PORT);
  console.log("  Health:     http://localhost:" + PORT + "/api/health");
  console.log("  Subscribers: http://localhost:" + PORT + "/api/subscribers");
  console.log("  Test email: http://localhost:" + PORT + "/api/send-report");
  console.log("");
  console.log("  Monthly reports scheduled for the 1st of each month at 9 AM");
  console.log("");
});
