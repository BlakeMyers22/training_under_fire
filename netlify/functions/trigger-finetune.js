// netlify/functions/trigger-finetune.js
const { MongoClient } = require('mongodb');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('forensic-reports');

    // Fetch high-quality examples from last 7 days, for instance
    const highQualityColl = db.collection('high_quality_examples');
    const examples = await highQualityColl
      .find({
        timestamp: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      })
      .toArray();

    if (examples.length < 10) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Not enough high-quality examples for fine-tuning yet',
          count: examples.length
        })
      };
    }

    // Build training data in Chat Completion format
    // For GPT-3.5-turbo, we create a JSONL with {messages: [...], "completion": ...} or the new fine-tune format
    // But as of late 2023, you might have to create a single JSON object with "messages" for each example.
    // We’ll do a placeholder approach (adjust if needed for the actual endpoint).
    const lines = examples.map((ex) => {
      return JSON.stringify({
        messages: ex.messages
      });
    });

    // Write these to a JSONL file
    const tempFilePath = path.join('/tmp', 'fine_tune_data.jsonl');
    fs.writeFileSync(tempFilePath, lines.join('\n'));

    // Upload file to OpenAI
    const { id: fileId } = await openai.files.create({
      file: fs.createReadStream(tempFilePath),
      purpose: 'fine-tune'
    });

    // Create fine-tune job
    const fineTuneResponse = await openai.fineTunes.create({
      model: 'gpt-3.5-turbo',
      training_file: fileId,
      // you can add hyperparameters if desired
      n_epochs: 2
    });

    // store the job ID if needed, or wait until it finishes with a webhook
    const configColl = db.collection('config');
    await configColl.updateOne(
      { key: 'latest_model_job' },
      { $set: { jobId: fineTuneResponse.id, triggeredAt: new Date() } },
      { upsert: true }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Fine-tune job created',
        job: fineTuneResponse
      })
    };
  } catch (error) {
    console.error('Error in trigger-finetune:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await client.close();
  }
};

