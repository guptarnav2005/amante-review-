
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  const respond = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body),
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY.");
    return respond(500, {
      error: "AI service is not configured.",
    });
  }

  let rating;
  let feedback;
  let tone;
  let useEmojis;

  try {
    const body = JSON.parse(event.body || "{}");

    rating = Number(body.rating);
    feedback = String(body.feedback || "").trim();
    tone = String(body.tone || "Natural").trim().slice(0, 40);
    useEmojis = body.useEmojis !== false;
  } catch {
    return respond(400, { error: "Invalid request." });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return respond(400, { error: "Select a rating from 1 to 5." });
  }

  if (feedback.length < 2 || feedback.length > 1200) {
    return respond(400, {
      error: "Feedback must be between 2 and 1200 characters.",
    });
  }

  const ratingGuidance = {
    1: "Honest, disappointed, constructive and restrained.",
    2: "Underwhelmed, mentioning only the actual concerns.",
    3: "Balanced and fair, without exaggerated praise.",
    4: "Positive but believable, without overselling.",
    5: "Enthusiastic if supported by the customer's feedback.",
  };

  const prompt = `
Create one natural Google review DRAFT based on the supplied
customer feedback. The customer should review only what they
actually experienced.

CUSTOMER RATING: ${rating}/5
CUSTOMER FEEDBACK: ${feedback}
REQUESTED STYLE: ${tone}
EMOJIS ALLOWED: ${useEmojis ? "Yes, sparingly" : "No"}

REALISTIC WRITING:
- Write 3 to 5 sentences, normally around 35 to 65 words.
- Turn brief feedback into clear, conversational English.
- Sound casual and human, not like an advertisement or a brochure.
- Use simple everyday language and varied sentence lengths.
- Avoid overly polished, formal, generic or exaggerated wording.
- Do not turn every short input into the same long paragraph.
- Use only details supported by the customer's feedback.
- Never invent dishes ordered, staff interactions, prices, events,
  service details or personal experiences.
- Match the tone to the ${rating}-star rating:
  ${ratingGuidance[rating]}

VARIETY:
- Write this draft independently; do not follow a fixed template.
- Choose an opening that fits this specific feedback.
- Vary sentence structure, transitions and vocabulary naturally.
- Avoid stock phrases such as "overall great experience",
  "highly recommended", "must-visit place" and "amazing ambience".
- Do not repeatedly rely on "lovely", "amazing", "great",
  "comfortable", "vibe", "experience" or "definitely".
- Avoid repeating the same idea in multiple sentences.
- Do not force synonyms or unusual vocabulary just to sound different.
- Use a natural ending; do not always finish with "Will visit again".
- Common words may repeat when grammatically necessary.
- Never claim you remember earlier reviews unless prior reviews
  are explicitly provided.

EMOJIS:
- If enabled, use 0 to 2 relevant emojis only when they fit.
- Choose from appropriate emojis such as ☕ ✨ 😊 ❤️ 🍽️.
- Do not automatically put an emoji at the beginning or end.
- Do not force emojis into every draft.
- If disabled, do not include emojis.

OUTPUT:
- Return only the review draft.
- No heading, quotation marks, star count or explanation.
- Do not claim the text is a verified customer's own words.
`;

  try {
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
          reasoning: { effort: "none" },
          instructions:
            "Write believable, varied review drafts grounded in the supplied feedback. Return only the requested draft.",
          input: prompt,
          max_output_tokens: 700,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", {
        status: response.status,
        error: data.error || data,
      });

      return respond(502, {
        error: "AI service error. Please try again.",
      });
    }

    let draft =
      typeof data.output_text === "string"
        ? data.output_text.trim()
        : "";

    if (!draft && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== "message" || !Array.isArray(item.content)) {
          continue;
        }

        const parts = item.content
          .filter(
            (part) =>
              part.type === "output_text" &&
              typeof part.text === "string"
          )
          .map((part) => part.text);

        if (parts.length) {
          draft = parts.join("\n").trim();
          break;
        }
      }
    }

    if (!draft) {
      console.error("No review text returned:", {
        status: data.status || null,
        incomplete_details: data.incomplete_details || null,
        output_types: Array.isArray(data.output)
          ? data.output.map((item) => ({
              type: item.type,
              content_types: Array.isArray(item.content)
                ? item.content.map((part) => part.type)
                : [],
            }))
          : [],
        error: data.error || null,
      });

      return respond(502, {
        error: "No review text was returned. Please try again.",
      });
    }

    return respond(200, { draft });
  } catch (error) {
    console.error("Review generation failed:", error.message);

    return respond(500, {
      error: "Unable to connect to the AI service. Please try again.",
    });
  }
};
