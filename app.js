(() => {
  const GOOGLE_URL = "https://search.google.com/local/writereview?placeid=ChIJQ2IXQABDfDkRTvaldq2c-9g";
  const form = document.getElementById("review-form");
  const feedback = document.getElementById("feedback");
  const draftSection = document.getElementById("draft-section");
  const draftField = document.getElementById("draft");
  const ratingLabel = document.getElementById("rating-label");
  const counter = document.getElementById("counter");
  const toneSelect = document.getElementById("tone");
  const googleButton = document.getElementById("google-button");
  const copyButton = document.getElementById("copy-button");
  const createButton = form?.querySelector('.create-button');
  if (!form || !feedback || !draftSection || !draftField) return;

  let selectedRating = 5;
  const labels = {
    1: "1 star · A disappointing experience",
    2: "2 stars · Could be better",
    3: "3 stars · An okay experience",
    4: "4 stars · A very good experience",
    5: "5 stars · A great experience"
  };
  document.querySelectorAll(".stars button").forEach(button => {
    button.setAttribute('aria-pressed', Number(button.dataset.rating) === selectedRating ? 'true' : 'false');
    button.addEventListener("click", () => {
      selectedRating = Number(button.dataset.rating) || 5;
      document.querySelectorAll(".stars button").forEach(star => {
        const active = Number(star.dataset.rating) <= selectedRating;
        star.classList.toggle("selected", active);
        star.setAttribute('aria-pressed', Number(star.dataset.rating) === selectedRating ? 'true' : 'false');
      });
      if (ratingLabel) ratingLabel.textContent = labels[selectedRating];
    });
  });
  feedback.addEventListener("input", () => {
    if (counter) counter.textContent = `${feedback.value.length} / 1200`;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = feedback.value.trim();
    if (text.length < 8) {
      feedback.setCustomValidity("Please enter at least 8 characters about your real visit.");
      feedback.reportValidity();
      return;
    }
    feedback.setCustomValidity("");
    const oldText = createButton?.textContent;
    if (createButton) { createButton.disabled = true; createButton.textContent = "CREATING YOUR DRAFT…"; }
    if (draftSection) draftSection.hidden = true;
    try {
      const response = await fetch('/.netlify/functions/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedRating, feedback: text, tone: toneSelect?.value || 'natural' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.draft) throw new Error(data.error || 'Could not create a draft. Please try again.');
      draftField.value = data.draft;
      draftSection.hidden = false;
      draftSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      alert(`${error.message || 'Could not create a draft.'}\n\nIf this keeps happening, check that the latest Netlify deployment succeeded and OPENAI_API_KEY is set in Netlify.`);
    } finally {
      if (createButton) { createButton.disabled = false; createButton.textContent = oldText || '✧  CREATE MY REVIEW  ↗'; }
    }
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const helper = document.createElement('textarea'); helper.value = text; helper.style.position = 'fixed'; helper.style.opacity = '0';
      document.body.appendChild(helper); helper.select(); let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      helper.remove(); return ok;
    }
  }
  if (copyButton) copyButton.addEventListener('click', async () => {
    const ok = await copyText(draftField.value);
    copyButton.textContent = ok ? 'COPIED ✓' : 'SELECT AND COPY TEXT';
  });
  if (googleButton) googleButton.addEventListener('click', async () => {
    if (!draftField.value.trim()) return;
    const ok = await copyText(draftField.value.trim());
    window.open(GOOGLE_URL, '_blank', 'noopener,noreferrer');
    googleButton.textContent = ok ? 'DRAFT COPIED ✓ · PASTE ON GOOGLE' : 'PASTE YOUR DRAFT ON GOOGLE';
  });
})();
