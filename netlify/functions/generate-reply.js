
const STYLE_INSTRUCTIONS = {
  "natural & simple": `
    Use simple, natural everyday English.
    Sound relaxed and genuine, like a real customer.
    Avoid formal or promotional language.
  `,
  "warm & friendly": `
    Use warm, friendly, conversational English.
    Sound welcoming and personal without exaggerating.
    Keep the wording natural rather than overly enthusiastic.
  `,
  "polished & professional": `
    Use polished, fluent English that still sounds human.
    Keep the tone refined but conversational.
    Avoid corporate language and advertising slogans.
  `,
};

const REVIEW_INSTRUCTIONS = `
You help customers express their genuine experience in a
natural Google review draft for a cafe or restaurant.

IMPORTANT RULES:
1. Write exactly 4 or 5 complete sentences.
2. Aim for approximately 45–65 words.
3. Use the customer's feedback as the source of truth.
4. Expand short feedback naturally, without inventing details.
5. Never invent dishes, drinks, prices, staff behaviour,
   service details, events, or personal experiences.
6. Avoid repetitive AI phrases such as:
   "Overall, it was an amazing experience",
   "I highly recommend this place", and
   "A must-visit destination".
7. Vary sentence openings and wording naturally.
8. Use 0–2 relevant emojis where appropriate.
   Do not force emojis into every review.
9. Follow the selected writing style.
10. Respect the customer's actual sentiment. Never turn
    negative or mixed feedback into a falsely positive review.
11. Return only the review draft, with no heading,
    quotation marks, explanation, or numbered list.
`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Method not allowed. Please send a POST request.",
      }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "AI setup is incomplete. Please check the server configuration.",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const feedback =
      typeof body.feedback === "string"
        ? body.feedback.trim()
        : "";

    const styleInput =
      typeof body.style === "string"
        ? body.style.trim().toLowerCase()
        : "natural & simple";

    const style =
      STYLE_INSTRUCTIONS[styleInput] ||
      STYLE_INSTRUCTIONS["natural & simple"];

    const rating = Number(body.rating);

    if (!feedback) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Please enter your genuine experience first.",
        }),
      };
    }

    if (feedback.length > 1500) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Please keep your feedback under 1500 characters.",
        }),
      };
    }

    const sentimentInstruction =
      Number.isInteger(rating) && rating >= 1 && rating <= 5
        ? `The customer's selected rating is ${rating}/5.
           Keep the review consistent with this rating and their feedback.`
        : "Use the customer's feedback to determine the appropriate tone.";

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
          instructions: `${REVIEW_INSTRUCTIONS}\n\nSTYLE:\n${style}`,
          input: `${sentimentInstruction}

Customer's actual feedback:
${feedback}

Write a natural review draft based only on this feedback.`,
          max_output_tokens: 260,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", {
        status: response.status,
        error: data.error?.message || "Unknown API error",
        code: data.error?.code,
      });

      return {
        statusCode: response.status === 429 ? 429 : 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            response.status === 429
              ? "AI rate limit or quota reached. Please try again later."
              : "The AI could not generate a review right now. Please try again.",
        }),
      };
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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ review: draft }),
    };
  } catch (error) {
    console.error("Review generation error:", error.message);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Something went wrong. Please try again.",
      }),
    };
  }
};
