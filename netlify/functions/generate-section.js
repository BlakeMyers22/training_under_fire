// netlify/functions/generate-section.js
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
// We'll optionally use axios if you want weather data or external calls
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Optional: retrieve relevant feedback or context
async function fetchRelevantFeedback(sectionId, context) {
  // In your final system, you can do fancy matching (e.g. same property type).
  // For now, we'll stub this out or return an empty array.
  return [];
}

// For demonstration, here's how you'd get weather data (optional).
async function getWeatherData(location, date) {
  if (!date || !location) return null; // skip if incomplete
  try {
    const response = await axios.get(
      `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(location)}/${date}`,
      {
        params: {
          unitGroup: 'us',
          key: process.env.WEATHER_API_KEY,
          include: 'hours'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}

// Retrieve the latest fine-tuned model from DB or fallback
async function getLatestModelId() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const configColl = client.db('forensic-reports').collection('config');
    const config = await configColl.findOne({ key: 'latest_model' });
    // If you have an actual fine-tuned model name, store it here
    return config?.modelId || 'gpt-3.5-turbo'; // fallback to a known model
  } catch (err) {
    console.error('Error fetching latest model:', err);
    return 'gpt-3.5-turbo';
  } finally {
    await client.close();
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { section, context: userContext, customInstructions } = body;

    // 1. Possibly fetch relevant feedback for this scenario
    const relevantFeedback = await fetchRelevantFeedback(section, userContext);

    // 2. (Optional) get weather data if your context has location/dateOfLoss
    let weatherResponse = null;
    if (userContext.location && userContext.dateOfLoss) {
      weatherResponse = await getWeatherData(userContext.location, userContext.dateOfLoss);
    }

    // 3. Build your final prompt
    const modelId = await getLatestModelId();

    // For demonstration, define a base system prompt:
    const systemPrompt = `You are an expert forensic engineer. Generate a professional, step-by-step report section. Incorporate best practices in forensic engineering.`;

    // Suppose you have some default text for each section:
    const basePromptMap = {
      authorization: `
        Generate the "Authorization and Scope of Investigation" section:
        - Investigation Date: ${userContext.investigationDate}
        - Property Location: ${userContext.location}
        - ...
      `,
      background: `
        Generate the "Background Information" section:
        - Property Age: ${userContext.propertyAge}
        - Construction Type: ${userContext.constructionType}
        - ...
      `,
      // ... add more sections ...
    };

    // fallback if no known section
    const basePrompt = basePromptMap[section] || `Generate a forensic engineering report section titled: ${section}.`;

    // Combine with optional instructions
    const finalPrompt = customInstructions
      ? `${basePrompt}\nAdditional instructions: ${customInstructions}`
      : basePrompt;

    // Optionally embed prior user feedback or weather data here
    const relevantFeedbackText = relevantFeedback
      .map(f => `User Feedback: ${f.feedback}`)
      .join('\n');

    // If you have weather info:
    let weatherSnippet = '';
    if (weatherResponse) {
      // parse it as needed
      weatherSnippet = `Weather data: ${JSON.stringify(weatherResponse.days?.[0], null, 2)}`;
    }

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `
            ${finalPrompt}

            ${relevantFeedbackText}

            ${weatherSnippet}
          `
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        section: responseText,
        sectionName: section
      })
    };
  } catch (error) {
    console.error('Error generating section:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate section',
        details: error.message
      })
    };
  }
};

