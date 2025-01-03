// netlify/functions/store-feedback.js
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch'); // for calling our trigger-finetune if needed

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

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

  let client;
  try {
    const { sectionId, rating, feedback, generatedContent, originalPrompt } = JSON.parse(event.body);

    if (!sectionId || !rating || !feedback || !generatedContent || !originalPrompt) {
      throw new Error('Missing required fields: sectionId, rating, feedback, generatedContent, originalPrompt');
    }

    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();

    const db = client.db('forensic-reports');
    const feedbackColl = db.collection('feedback');
    const highQualityColl = db.collection('high_quality_examples');

    // Prepare the trainingExample structure
    const trainingExample = {
      sectionId,
      rating,
      feedback,
      generatedContent,
      originalPrompt,
      timestamp: new Date(),
      messages: [
        { role: 'system', content: 'You are an expert forensic engineer...' },
        { role: 'user', content: JSON.stringify(originalPrompt) },
        { role: 'assistant', content: generatedContent }
      ]
      // You can store any other fields you like here
    };

    // Insert into feedback collection
    await feedbackColl.insertOne(trainingExample);

    let triggeredFineTune = false;
    let highQualityCount = 0;

    // If rating is 6 or 7, treat as “high-quality”
    if (rating >= 6) {
      await highQualityColl.insertOne(trainingExample);

      // Count how many high-quality examples in, say, the last day
      highQualityCount = await highQualityColl.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      // If we have enough new high-quality examples, trigger fine-tuning
      if (highQualityCount >= 10) {
        triggeredFineTune = true;
        try {
          const finetuneResp = await fetch(`/.netlify/functions/trigger-finetune`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'auto_trigger' })
          });
          const ftResult = await finetuneResp.json();
          console.log('Fine-tune job triggered:', ftResult);
        } catch (err) {
          console.error('Failed to trigger fine-tuning automatically:', err);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Feedback stored',
        triggeredFineTune,
        highQualityCount
      })
    };
  } catch (error) {
    console.error('Error storing feedback:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || 'Unknown error'
      })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

