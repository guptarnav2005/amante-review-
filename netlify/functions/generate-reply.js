
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing in this function.");
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server setup error: API key is missing.",
      }),
    };
  }

  try {
    const { rating, feedback } = JSON.parse(event.body || "{}");

    if (
      !Number.isInteger(Number(rating)) ||
      Number(rating) < 1 ||
      Number(rating) > 5 ||
      typeof feedback !== "string" ||
      feedback.trim().length < 8 ||
      feedback.trim().length > 1200
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Enter a rating from 1–5 and feedback of 8–1200 characters.",
        }),
      };
    }

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
          instructions:
            "Write a natural, concise Google review draft for a cafe based only on the customer's rating and feedback. Do not invent experiences or details. Match the customer's sentiment and language. Return only the review text.",
          input: `Customer rating: ${rating}/5\nCustomer feedback: ${feedback.trim()}`,
          max_output_tokens: 180,
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
        body: JSON.stringify({
          error: "Review generation failed. Check Netlify function logs.",
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
        body: JSON.stringify({
          error: "No review text was generated. Please try again.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft }),
    };
  } catch (error) {
    console.error("Review function error:", error.message);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Something went wrong while generating your review.",
      }),
    };
  }
};
