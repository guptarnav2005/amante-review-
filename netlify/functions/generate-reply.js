
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Method not allowed",
      }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing.");

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "AI setup is incomplete. Check Netlify environment variables.",
      }),
    };
  }

  try {
    const { rating, feedback, style } = JSON.parse(
      event.body || "{}"
    );

    const stars = Number(rating);

    if (
      !Number.isInteger(stars) ||
      stars < 1 ||
      stars > 5 ||
      typeof feedback !== "string" ||
      feedback.trim().length < 2 ||
      feedback.trim().length > 1200
    ) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Please provide a valid rating and feedback.",
        }),
      };
    }

    const writingStyles = {
      polished:
        "Use a polished, professional, natural writing style.",
      professional:
        "Use a polished, professional, natural writing style.",
      casual:
        "Use a friendly, casual, conversational writing style.",
      warm:
        "Use a warm, personal, welcoming writing style.",
      concise:
        "Use simple, clear language while still writing 4–5 sentences.",
    };

    const selectedStyle =
      writingStyles[String(style || "").toLowerCase()] ||
      "Use a polished, professional, natural writing style.";

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-6-luna",
          instructions: `
You write Google review drafts for a cafe.

Write a natural, high-quality review in 4–5 sentences,
approximately 50–80 words.

The customer may provide only 2–3 words, such as
"nice ambience" or "good coffee". Expand their brief
feedback into a readable review without asking questions.

Rating: ${stars}/5.
Writing style: ${selectedStyle}

Important rules:
- Match the sentiment of the rating and feedback.
- Use simple, natural language that sounds human.
- Do not repeat the same idea.
- Do not add headings, quotation marks, or bullet points.
- Never invent specific menu items, prices, staff actions,
  facilities, events, or personal experiences.
- Do not claim the customer visited again or recommends
  the cafe unless their feedback supports that claim.
- Use only reasonable general descriptions supported by
  the customer's words and rating.
- Return only the review text.
          `.trim(),
          input:
            `Customer rating: ${stars}/5\n` +
            `Customer feedback: ${feedback.trim()}`,
          max_output_tokens: 220,
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

      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Review generation failed. Please try again.",
        }),
      };
    }

    const draft = (data.output || [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n")
      .trim();

    if (!draft) {
      console.error("OpenAI returned no review text.");

      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "No review was generated. Please try again.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    };
  } catch (error) {
    console.error("Review function error:", error.message);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Something went wrong. Please try again.",
      }),
    };
  }
};
