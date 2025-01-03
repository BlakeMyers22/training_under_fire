// netlify/functions/check-model-status.js
const { MongoClient } = require('mongodb');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();

    const db = client.db('forensic-reports');
    const configColl = db.collection('config');
    const latestModel = await configColl.findOne({ key: 'latest_model' });

    // Return minimal data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        currentModel: latestModel?.modelId || 'gpt-3.5-turbo (fallback)',
        lastUpdated: latestModel?.timestamp || null
      })
    };
  } catch (error) {
    console.error('Error checking model status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

