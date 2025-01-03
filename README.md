netlify/functions/generate-section.js

Receives user’s context (property details, claim info, etc.) plus an optional “custom instructions” from the engineer.
Fetches relevant prior feedback from the DB (optional).
Uses OpenAI’s ChatCompletion to generate the next section of the report.
Returns the text to the frontend.
netlify/functions/store-feedback.js

Receives the user’s rating and comments for the last-generated text.
Stores them in MongoDB.
If the rating is high enough (e.g., ≥6 on a 7-point scale), it also copies that example to a “high_quality_examples” collection.
Optionally checks if we have enough new high-quality examples to trigger an automated fine-tune job.
netlify/functions/trigger-finetune.js

Periodically called (by store-feedback or a Netlify scheduled function or a button in your admin UI).
Gathers the high-quality examples from the DB, formats them into a JSONL or messages array, then calls the OpenAI fine-tuning endpoint (for GPT‑3.5 or GPT‑4 if/when that is available).
Stores the new model name in the DB.
Clears the used examples if desired.
netlify/functions/check-model-status.js

A small endpoint that simply queries your DB for the latest_model record and returns it.
The frontend pings this to display “Current Model: ft:gpt-3.5... [last updated: ...]” or whatever.
site/index.html

The main UI (similar to your existing page).
The form fields for property/claim info.
Buttons to “Accept and Continue,” “Regenerate,” and “Rate This Section.”
A final “Download the entire report” step.
netlify.toml

Configuration for Netlify.
Points Netlify to our functions folder.
Sets up any custom headers, redirects, etc.
package.json

Contains dependencies (OpenAI, MongoDB, Axios, etc.) and scripts.
