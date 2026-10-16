
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
    const { rating, feedback, style } = JSON.parse(
      event.body || "{}"
    );

    const stars = Number(rating);
    const customerFeedback =
      typeof feedback === "string" ? feedback.trim() : "";

    if (
      !Number.isInteger(stars) ||
      stars < 1 ||
      stars > 5 ||
      customerFeedback.length < 2 ||
      customerFeedback.length > 1200
    ) {
      return json(400, {
        error: "Please enter a valid rating and feedback.",
      });
    }

    const styleText = {
      "polished & professional":
        "Polished but natural, with clear and fluent wording.",
      "casual & friendly":
        "Relaxed, friendly, conversational and simple.",
      "warm & personal":
        "Warm and sincere, without sounding sentimental.",
      "short & simple":
        "Simple everyday English, while still using four complete sentences.",
    };

    const selectedStyle =
      styleText[String(style || "").toLowerCase()] ||
      "Natural, polished, conversational everyday English.";

    const instructions = `
You help a cafe customer express their own genuine experience
in a Google review draft.

Write exactly 4 complete sentences, ideally 45–65 words.

The customer may provide only two or three words.
Expand their actual feedback carefully into a readable review.
Do not ask questions.

STYLE:
- Sound like a real person, not an advertisement or AI.
- Use natural, everyday English and varied sentence openings.
- Keep the wording specific to what the customer actually said.
- Avoid clichés, exaggerated praise, repeated ideas and filler.
- Use at most one or two emojis, only if they feel natural.
  Suitable examples include 😊, ☕ and ✨.
- Emojis are optional. Do not force them into every review.
- Do not add headings, quotation marks or hashtags.
- Finish every sentence completely.

HONESTY:
- Match the customer's star rating and stated sentiment.
- Never invent food or drinks ordered, staff interactions,
  prices, events, facilities or personal experiences.
- Do not claim the customer will return or recommend the cafe
  unless their feedback supports that statement.
- If feedback is very short, do not fill space with invented facts.
  Elaborate modestly on the stated impression instead.
- Never turn negative feedback into a positive review.
- Return only the review draft.

Writing style: ${selectedStyle}
Customer rating: ${stars}/5
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
          input: `Customer's own feedback: ${customerFeedback}`,
          max_output_tokens: 240,
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
