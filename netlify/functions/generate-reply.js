
const STYLE_INSTRUCTIONS = {
  "natural & simple": `
Use simple, natural everyday English.
Sound relaxed and genuine, not robotic or promotional.
`,
  "warm & friendly": `
Use warm, friendly, conversational English.
Sound welcoming without exaggerating.
`,
  "polished & professional": `
Use polished, fluent English that still sounds human.
Avoid corporate language and advertising slogans.
`,
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function extractReview(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const chunks = [];

  for (const item of output) {
    if (typeof item.text === "string" && item.text.trim()) {
      chunks.push(item.text);
    }

    if (!Array.isArray(item.content)) continue;

    for (const part of item.content) {
      if (
        typeof part.text === "string" &&
        part.text.trim() &&
        (
          part.type === "output_text" ||
          part.type === "text"
        )
      ) {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed. Please send a POST request.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing.");

    return jsonResponse(500, {
      error: "AI setup is incomplete. Check the Netlify environment variable.",
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
    typeof body.feedback === "string"
      ? body.feedback.trim()
      : "";

  const styleName =
    typeof body.style === "string"
      ? body.style.trim().toLowerCase()
      : "natural & simple";

  const style =
    STYLE_INSTRUCTIONS[styleName] ||
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
      ? `Selected rating: ${rating}/5. Keep the tone consistent with
         the rating and the customer's actual feedback.`
      : "Use the customer's actual feedback to determine the tone.";

  const instructions = `
You help customers express their genuine cafe or restaurant
experience in a natural, editable review draft.

Write exactly 4 or 5 complete sentences, approximately 45–65 words.
Use only details supported by the customer's feedback.
Never invent dishes, prices, staff behaviour, service details,
events, or personal experiences.
Avoid repetitive AI phrases and advertising slogans.
Vary sentence openings, vocabulary, and sentence structure.
Use 0–2 relevant emojis only when they fit naturally.
Do not force emojis into every review.
Respect the customer's actual sentiment.
Return only the review draft, without a heading or explanation.

Selected writing style:
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

Customer feedback:
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
        error: "Unexpected AI response. Please try again.",
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

    const draft = extractReview(data);

    if (!draft) {
      // Log diagnostic metadata only; never log the API key.
      console.error("OpenAI returned no review text.", {
        response_status: data.status || null,
        incomplete_details: data.incomplete_details || null,
        output_types: Array.isArray(data.output)
          ? data.output.map((item) => ({
              type: item.type,
              content_types: Array.isArray(item.content)
                ? item.content.map((part) => part.type)
                : [],
            }))
          : [],
        has_output_text: typeof data.output_text === "string",
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

    return jsonResponse(200, {
      review: draft,
    });
  } catch (error) {
    console.error("Review generation request failed:", error.message);

    return jsonResponse(500, {
      error: "Could not connect to the AI service. Please try again.",
    });
  }
};
