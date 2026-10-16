
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  const send = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed." });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing.");
      return send(500, {
        error: "AI setup is incomplete. Check Netlify environment variables."
      });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return send(400, { error: "Invalid request data." });
    }

    const rating = Number(body.rating);
    const feedback =
      typeof body.feedback === "string" ? body.feedback.trim() : "";

    const tones = {
      natural: "natural, simple and human",
      warm: "warm, friendly and appreciative",
      polished: "polished, professional and concise"
    };

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return send(400, { error: "Please select a rating from 1 to 5." });
    }

    if (feedback.length < 8 || feedback.length > 1200) {
      return send(400, {
        error: "Feedback must be between 8 and 1200 characters."
      });
    }

    const prompt = `Write a genuine first-person Google review draft for Cafe Amante in Bhopal.
Rating: ${rating}/5
Customer feedback: ${feedback}
Writing style: ${tones[body.tone] || tones.natural}

Write 35–75 words. Use only details provided by the customer.
Do not invent dishes, staff names, events or facts.
Keep the customer's actual opinion and meaning.
Return only the review draft, without a title or quotation marks.`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Help customers express their genuine cafe experience clearly. Never fabricate details."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 180
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenAI API error:", response.status, data.error || data);
      return send(502, {
        error: "AI could not generate a draft. Check API billing and Netlify function logs."
      });
    }

    const draft = data.choices?.[0]?.message?.content?.trim();

    if (!draft) {
      return send(502, { error: "AI returned an empty draft." });
    }

    return send(200, { draft });
  } catch (error) {
    console.error("Generate review error:", error.message);
    return send(500, {
      error: "Unable to generate a draft right now. Please try again."
    });
  }
};
