
exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing.");
    return json(500, {
      error: "AI setup is incomplete. Check Netlify environment variables.",
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const stars = Number(body.rating);
    const feedback =
      typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (
      !Number.isInteger(stars) ||
      stars < 1 ||
      stars > 5 ||
      feedback.length < 2 ||
      feedback.length > 1200
    ) {
      return json(400, {
        error: "Please enter a valid rating and feedback.",
      });
    }

    // These names match the website's writing-style dropdown.
    const styleText = {
      "natural & simple":
        "Use simple, natural everyday English. Keep it relaxed and genuine.",
      "warm & friendly":
        "Use warm, friendly, welcoming language without exaggeration.",
      "polished & professional":
        "Use polished, fluent, professional language that still sounds human.",
    };

    const requestedStyle =
      typeof body.style === "string"
        ? body.style.trim().toLowerCase()
        : "";

    const selectedStyle =
      styleText[requestedStyle] ||
      "Use natural, warm, conversational English.";

    const instructions = `
You write Google review drafts that help customers express
their own genuine cafe experiences.

Write exactly 4 or 5 complete sentences, ideally 45–65 words.
Finish the final sentence fully. Never end mid-sentence.

WRITING STYLE:
${selectedStyle}

NATURAL TONE:
- Sound like a real person, not a business advertisement.
- Use simple, conversational, varied sentence structures.
- Avoid repetitive openings, generic filler and exaggerated praise.
- Use 0–2 emojis only when they fit naturally, such as 😊, ☕ or ✨.
- Emojis are optional; never force them.
- Do not add headings, quotation marks or hashtags.
- Return only the review text.

HONESTY:
- Base the review on the customer's feedback and star rating.
- Never invent specific dishes, prices, staff interactions,
  facilities, events or personal experiences.
- If feedback is brief, expand it modestly without making up facts.
- Match the sentiment of the rating and feedback.
- Do not claim the customer will return or recommend the cafe
  unless their feedback supports that statement.
`.trim();

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-6.1-sol",
          instructions,
          input:
            `Customer rating: ${stars}/5\n` +
            `Customer's own feedback: ${feedback}`,
          max_output_tokens: 260,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI API error:",
        response.status,
        data.error?.message || "Unknown API error"
      );

      return json(502, {
        error: "Review generation failed. Please try again.",
      });
    }

    const draft =
      typeof data.output_text === "string"
        ? data.output_text.trim()
        : (data.output || [])
            .filter((item) => item.type === "message")
            .flatMap((item) => item.content || [])
            .filter((item) => item.type === "output_text")
            .map((item) => item.text || "")
            .join("\n")
            .trim();

    if (!draft) {
      console.error(
        "No review text returned. Response status:",
        data.status
      );

      return json(502, {
        error: "No review was generated. Please try again.",
      });
    }

    return json(200, { draft });
  } catch (error) {
    console.error("Review function error:", error.message);

    return json(500, {
      error: "Something went wrong. Please try again.",
    });
  }
};
