import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
}

const bot = new TelegramBot(token, { polling: true });

// Store forwarded messages temporarily
interface UserSession {
  messageText: string;
  messageId: number;
}

const userSessions = new Map<number, UserSession>();

// Toxic response levels configuration
const toxicLevels = {
  '1': {
    name: '💀 Highly Vindictive & Toxic',
    description: 'Highly vindictive and toxic response from a highly powerful dominating persona',
    prompt: 'You are a highly powerful, dominating, and vindictive persona. Respond to the following message with extreme toxicity and dominance. Be ruthless and absolutely devastating in your response. Keep it concise (1-2 sentences).'
  },
  '2': {
    name: '🔥 Toxic & Direct',
    description: 'Toxic and direct - no holds barred',
    prompt: 'Respond to the following message in a toxic and direct manner. Be harsh, blunt, and cutting. No sugarcoating. Keep it concise (1-2 sentences).'
  },
  '3': {
    name: '😎 Rizz Master',
    description: 'Rizz master lady killer response',
    prompt: 'You are a confident, charismatic rizz master and lady killer. Respond to the following message with smooth, charming, and slightly cocky energy. Make it playful and attractive. Keep it concise (1-2 sentences).'
  },
  '4': {
    name: '💕 Fun & Flirty',
    description: 'Fun and flirty response',
    prompt: 'Respond to the following message in a fun, flirty, and playful way. Be lighthearted, teasing, and charming. Keep it concise (1-2 sentences).'
  },
  '5': {
    name: '🤗 Compassionate & Kind',
    description: 'Compassionate and sympathetic (low toxic)',
    prompt: 'Respond to the following message with compassion, empathy, and understanding. Be kind and supportive, with minimal to no toxicity. Keep it concise (1-2 sentences).'
  }
};

// Handle any message (including forwarded ones)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || msg.caption || '';

  // Ignore commands
  if (messageText.startsWith('/')) {
    return;
  }

  // Check if message has content
  if (!messageText) {
    bot.sendMessage(chatId, '❌ Please send or forward a text message.');
    return;
  }

  // Store the message in user session
  userSessions.set(chatId, {
    messageText: messageText,
    messageId: msg.message_id
  });

  // Create inline keyboard with toxic levels
  const keyboard = {
    inline_keyboard: [
      [{ text: toxicLevels['1'].name, callback_data: 'level_1' }],
      [{ text: toxicLevels['2'].name, callback_data: 'level_2' }],
      [{ text: toxicLevels['3'].name, callback_data: 'level_3' }],
      [{ text: toxicLevels['4'].name, callback_data: 'level_4' }],
      [{ text: toxicLevels['5'].name, callback_data: 'level_5' }]
    ]
  };

  // Send message with response level options
  bot.sendMessage(
    chatId,
    '🎯 Choose your response level:',
    { reply_markup: keyboard }
  );
});

// Handle callback queries (button presses)
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  // Get the selected level
  const level = query.data?.replace('level_', '') as keyof typeof toxicLevels;

  if (!level || !toxicLevels[level]) {
    bot.answerCallbackQuery(query.id, { text: '❌ Invalid level selected' });
    return;
  }

  // Get the stored message
  const session = userSessions.get(chatId);
  if (!session) {
    bot.answerCallbackQuery(query.id, { text: '❌ Session expired. Please send the message again.' });
    return;
  }

  // Answer the callback query to remove loading state
  bot.answerCallbackQuery(query.id, { text: `Generating ${toxicLevels[level].name} response...` });

  // Edit the message to show loading
  bot.editMessageText(
    `⏳ Generating your ${toxicLevels[level].name} response...`,
    {
      chat_id: chatId,
      message_id: messageId
    }
  );

  try {
    // Generate response using OpenAI
    const response = await generateResponse(session.messageText, toxicLevels[level].prompt);

    // Send the generated response
    bot.sendMessage(
      chatId,
      `${toxicLevels[level].name}\n\n"${response}"`,
      { parse_mode: 'Markdown' }
    );

    // Edit the loading message
    bot.editMessageText(
      `✅ Response generated with ${toxicLevels[level].name} level!`,
      {
        chat_id: chatId,
        message_id: messageId
      }
    );

    // Clean up session
    userSessions.delete(chatId);

  } catch (error) {
    console.error('Error generating response:', error);
    bot.editMessageText(
      '❌ Error generating response. Please try again.',
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  }
});

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🤖 *Welcome to the Toxic Response Bot!*

Send or forward any message to this bot, and I'll help you craft the perfect response based on your chosen toxic level!

📝 *How to use:*
1. Send or forward a message to this bot
2. Choose your desired response level
3. Get your AI-generated response!

🎭 *Available Response Levels:*
${toxicLevels['1'].name} - ${toxicLevels['1'].description}
${toxicLevels['2'].name} - ${toxicLevels['2'].description}
${toxicLevels['3'].name} - ${toxicLevels['3'].description}
${toxicLevels['4'].name} - ${toxicLevels['4'].description}
${toxicLevels['5'].name} - ${toxicLevels['5'].description}

Ready to start? Just send me a message! 🚀
`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 *Help & Instructions*

*How to use this bot:*
1. Send or forward any text message to this bot
2. Select your preferred toxic response level from the buttons
3. Receive your AI-generated response instantly!

*Commands:*
/start - Start the bot and see welcome message
/help - Show this help message

*Tips:*
• You can forward messages from any chat
• Each response is generated fresh by AI
• Responses are kept concise (1-2 sentences)

Need more help? Just send a message and try it out! 💪
`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Function to generate response using OpenAI
async function generateResponse(messageText: string, systemPrompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: messageText
      }
    ],
    max_tokens: 100,
    temperature: 0.9,
  });

  return completion.choices[0]?.message?.content?.trim() || 'Unable to generate response.';
}

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Telegram Toxic Response Bot is running...');
