
const STYLE_INSTRUCTIONS = {
  "natural & simple": `
Use simple, natural everyday English.
Sound relaxed and genuine, never robotic or promotional.
`,
  "warm & friendly": `
Use warm, friendly, conversational English.
Sound welcoming without exaggeration or fake enthusiasm.
`,
  "polished & professional": `
Use polished, fluent English that still sounds human.
Avoid corporate language and advertising slogans.
`,
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed. Please send a POST request.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonResponse(500, {
      error: "AI setup is incomplete. Check OPENAI_API_KEY in Netlify.",
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, {
      error: "Invalid request. Please try again.",
    });
  }

  const feedback =
    typeof body.feedback === "string" ? body.feedback.trim() : "";

  const requestedStyle =
    typeof body.style === "string"
      ? body.style.trim().toLowerCase()
      : "natural & simple";

  const style =
    STYLE_INSTRUCTIONS[requestedStyle] ||
    STYLE_INSTRUCTIONS["natural & simple"];

  const rating = Number(body.rating);

  if (!feedback) {
    return jsonResponse(400, {
      error: "Please enter your genuine experience first.",
    });
  }

  if (feedback.length > 1500) {
    return jsonResponse(400, {
      error: "Please keep your feedback under 1500 characters.",
    });
  }

  const ratingInstruction =
    Number.isInteger(rating) && rating >= 1 && rating <= 5
      ? `The customer's selected rating is ${rating}/5.
         Keep the tone consistent with their rating and feedback.`
      : "Use the customer's feedback to determine the tone.";

  const instructions = `
You help customers express their genuine cafe or restaurant
experience in a natural, editable review draft.

Write exactly 4 or 5 complete sentences, around 45–65 words.
Use only information supported by the customer's feedback.
Do not invent dishes, prices, staff behaviour, service details,
events, or personal experiences.
Avoid repetitive phrases such as "Overall, it was an amazing
experience" and "I highly recommend this place".
Vary sentence openings, vocabulary, and sentence structure.
Use 0–2 relevant emojis only when they fit naturally.
Do not force emojis into every review.
Respect the customer's actual sentiment; do not turn negative
feedback into a falsely positive review.
Return only the review draft, without a heading or explanation.

Selected style:
${style}
`;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-6-luna",
          instructions,
          input: `${ratingInstruction}

Customer's feedback:
${feedback}

Write the review draft now.`,
          max_output_tokens: 350,
        }),
      }
    );

    const rawText = await response.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("OpenAI returned a non-JSON response.", {
        status: response.status,
      });

      return jsonResponse(502, {
        error: "The AI returned an unexpected response. Please try again.",
      });
    }

    if (!response.ok) {
      console.error("OpenAI API error:", {
        status: response.status,
        code: data.error?.code || null,
        message: data.error?.message || "Unknown API error",
      });

      return jsonResponse(502, {
        error:
          response.status === 429
            ? "AI rate limit or quota reached. Please try again later."
            : "The AI could not generate a review. Please try again.",
      });
    }

    let draft =
      typeof data.output_text === "string"
        ? data.output_text.trim()
        : "";

    if (!draft && Array.isArray(data.output)) {
      draft = data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content || [])
        .filter(
          (item) =>
            item.type === "output_text" &&
            typeof item.text === "string"
        )
        .map((item) => item.text)
        .join("\n")
        .trim();
    }

    if (!draft) {
      console.error("OpenAI returned no review text. Details:", {
        status: data.status || null,
        incomplete_details: data.incomplete_details || null,
        output_types: Array.isArray(data.output)
          ? data.output.map((item) => ({
              type: item.type,
              content_types: (item.content || []).map(
                (content) => content.type
              ),
            }))
          : [],
        error: data.error
          ? {
              code: data.error.code || null,
              message: data.error.message || null,
            }
          : null,
      });

      return jsonResponse(502, {
        error: "No review text was returned. Please try again.",
      });
    }

    return jsonResponse(200, { review: draft });
  } catch (error) {
    console.error("Review generation request failed:", error.message);

    return jsonResponse(500, {
      error: "Could not connect to the AI service. Please try again.",
    });
  }
};
