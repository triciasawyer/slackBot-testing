'use strict';


// STRETCH GOAL: this is canvas content that was added to the code from chatModule for now


const { Configuration, OpenAIApi } = require('openai');
const { WebClient } = require('@slack/web-api');
const axios = require('axios');

const canvasToken = 'CANVAS_API_TOKEN';
const slackToken = 'SLACK_BOT_TOKEN';

// Canvas instance URL
const canvasApiUrl = 'https://canvas.instructure.com/api/v1/courses';

// 401 course ID for now
const courseId = '6745251';

const slackClient = new WebClient(slackToken);

const userConversations = new Map();

const chatModule = (app) => {
  app.event('message', async ({ event, ack, say }) => {
    const channelId = event.channel;
    let conversationHistory = userConversations.get(channelId) || [
      { role: 'system', content: 'Provide basic response to questions without code unless requested by user.' },
    ];

    if (event.channel_type === 'im') {
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const openAI = new OpenAIApi(configuration);

      conversationHistory.push({ role: 'user', content: event.text });

      // Check if the message contains a request for assignment information
      if (event.text.includes('assignment') || event.text.includes('homework')) {
        const assignments = await getAssignments();
        const formattedAssignments = formatAssignments(assignments);
        conversationHistory.push({ role: 'assistant', content: formattedAssignments });
        await sendSlackMessage(channelId, formattedAssignments);
      } else {
        // Modify user message to then allow the AI to respond with just the steps and not the code
        const userMessage = event.text;
        const modifiedUserMessage = `Steps to solve this problem domain: ${userMessage}`;
        conversationHistory.push({ role: 'user', content: modifiedUserMessage });
      }

      say({
        text: ':robot_face: AI is formulating a response...',
      });

      const response = await openAI.createChatCompletion({
        model: 'gpt-3.5-turbo',
        temperature: 0.8,
        messages: conversationHistory,
      });

      const aiResponse = response.data.choices[0].message.content;

      conversationHistory.push({ role: 'assistant', content: aiResponse });
      userConversations.set(channelId, conversationHistory);

      say({
        text: aiResponse,
      });
    }
  });
};


// Fetch assignments from Canvas API
async function getAssignments() {
  try {
    const response = await axios.get(`${canvasApiUrl}/${courseId}/assignments`, {
      headers: {
        'Authorization': `Bearer ${canvasToken}`,
      },
    });

    return response.data;
  } catch (err) {
    console.error('Error fetching assignments:', err);
    throw err;
  }
}

// Format assignments for the response
function formatAssignments(assignments) {
  let formattedMessage = 'Here are the upcoming assignments:\n';
  for (const assignment of assignments) {
    formattedMessage += `- ${assignment.name} (Due: ${assignment.due_at})\n`;
  }
  return formattedMessage;
}

// Send a message to Slack
async function sendSlackMessage(channelId, message) {
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (err) {
    console.error('Error sending Slack message:', err);
    throw err;
  }
}

module.exports = chatModule;