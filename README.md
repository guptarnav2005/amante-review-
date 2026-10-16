# Cafe Amante Review Draft Page

Premium mobile-first review-draft page. Uses the included Amante logo and the blush-pink, cream, burgundy and gold theme.

## Features
- Responsive review form with star rating and writing tone
- Calls a Netlify Function to generate a draft using the OpenAI API
- Editable draft and copy button
- Continue to Google review page; the customer must review and submit it themselves

## Netlify setup
1. Upload these project files to the GitHub repository connected to Netlify.
2. In Netlify Site configuration / Environment variables, set `OPENAI_API_KEY` to your secret OpenAI API key. Do not put the key in GitHub or frontend code.
3. Ensure the site's production deployment is allowed and succeeds.
4. Redeploy after setting the environment variable.
5. Test the live form with sample feedback.

Build command: leave blank. Publish directory: `.`. Functions directory: `netlify/functions`.

The Google review URL is currently set in `app.js` and `index.html`; verify that it opens the correct Cafe Amante business before printing/sharing.
