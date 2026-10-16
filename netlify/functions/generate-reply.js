
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  const respond = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  });

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use a POST request." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing.");
    return respond(500, {
      error: "AI service is not configured. Please contact the site owner.",
    });
  }

  let rating;
  let feedback;
  let tone;

  try {
    const body = JSON.parse(event.body || "{}");
    rating = Number(body.rating);
    feedback = String(body.feedback || "").trim();
    tone = String(body.tone || "Natural").trim();
  } catch {
    return respond(400, { error: "Invalid request data." });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return respond(400, { error: "Please select a rating from 1 to 5." });
  }

  if (feedback.length < 2 || feedback.length > 1200) {
    return respond(400, {
      error: "Please enter feedback between 2 and 1200 characters.",
    });
  }

  const ratingGuidance = {
    1: "Express genuine disappointment and constructive criticism.",
    2: "Describe a below-expectations experience honestly.",
    3: "Give balanced feedback, including positives and areas to improve.",
    4: "Describe a good experience with realistic, specific appreciation.",
    5: "Describe a very positive experience in a natural, believable way.",
  };

  const prompt = `
Write one Google review draft for a cafe based on the customer's feedback.

CUSTOMER RATING: ${rating}/5
CUSTOMER FEEDBACK: ${feedback}
WRITING STYLE: ${tone}

RULES:
- Write 4 to 5 complete sentences.
- Aim for approximately 50 to 80 words.
- Use natural, fluent English.
- Keep the review relevant to the customer's actual feedback.
- You may expand briefly on the stated experience, but do not invent
  specific dishes, prices, staff names, events, or services.
- Match the tone to the rating: ${ratingGuidance[rating]}
- Avoid generic repetition and exaggerated marketing language.
- Do not add a title, star rating, quotation marks, or explanations.
- Return only the review draft.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        instructions:
          "You write natural cafe review drafts. Follow the user's feedback accurately and return only the requested review.",
        input: prompt,
        max_output_tokens: 700,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", {
        status: response.status,
        error: data.error || data,
      });

      return respond(502, {
        error: "The AI service could not generate a review. Please try again.",
      });
    }

    let draft =
      typeof data.output_text === "string" ? data.output_text.trim() : "";

    if (!draft && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== "message" || !Array.isArray(item.content)) {
          continue;
        }

        const textParts = item.content
          .filter(
            (part) =>
              part.type === "output_text" &&
              typeof part.text === "string"
          )
          .map((part) => part.text);

        if (textParts.length) {
          draft = textParts.join("\n").trim();
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
